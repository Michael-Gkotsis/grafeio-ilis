// Behavior test of the IPC contract (src/shared/ipc) and of the bridges and helpers built from it.
//
// Purpose: pin what the preload sends for EVERY method of `window.api` and `window.printer` (channel, exact argument
//   count, coercions), the event subscriptions, and the main-side registration helpers.
// Does NOT: start Electron; `electron` is mocked and records the calls. It does not check payload types (tsc does).
// Owner layer: test.
// Why: the four hand-written copies of the IPC surface were replaced by one table; the old arrows dropped extra
//   arguments and coerced some, and that must keep holding (a DOM event passed by accident never reaches `invoke`).
// Covering test of itself: the pinned examples below fail when a channel, an `n` or a coercion changes.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, INVOKE, type ContractCoversApi } from '../src/shared/ipc/contract';
import { PRINT } from '../src/shared/ipc/print';

const electron = vi.hoisted(() => ({
  exposed: {} as Record<string, Record<string, (...args: unknown[]) => unknown>>,
  invoke: vi.fn((..._args: unknown[]) => Promise.resolve('reply')),
  on: vi.fn(),
  removeListener: vi.fn(),
  handle: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: Record<string, (...args: unknown[]) => unknown>) => {
      electron.exposed[name] = value;
    },
  },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener },
  ipcMain: { handle: electron.handle },
  // only so that src/main/updater.ts can be imported; the test below never reaches the network
  app: { getVersion: () => '0.0.0', isPackaged: false, getPath: () => os.tmpdir() },
  BrowserWindow: class {},
  dialog: {},
  net: { request: () => ({ on: () => undefined, end: () => undefined, abort: () => undefined }) },
  session: {
    fromPartition: () => ({ setPermissionRequestHandler: () => undefined, setPermissionCheckHandler: () => undefined }),
  },
  shell: {},
}));

/** Loads a preload module fresh and returns what it exposed to the page. */
async function expose(module: 'preload' | 'print', name: 'api' | 'printer') {
  vi.resetModules();
  await import(`../src/preload/${module}`);
  return electron.exposed[name];
}
/** Arguments that are all distinct truthy objects, so a dropped or reordered one is visible. */
const marked = (count: number) => Array.from({ length: count }, (_, i) => ({ arg: i }));
const callsOf = () => electron.invoke.mock.calls;

beforeEach(() => {
  electron.invoke.mockClear();
  electron.on.mockClear();
  electron.removeListener.mockClear();
  electron.handle.mockClear();
});

describe('the contract tables', () => {
  it('has a unique channel for every invoke method, event and print method', () => {
    const channels = [
      ...Object.values(INVOKE).map((s) => s.channel),
      ...Object.values(EVENTS).map((s) => s.channel),
      ...Object.values(PRINT).map((s) => s.channel),
    ];
    expect(new Set(channels).size).toBe(channels.length);
    expect(Object.keys(INVOKE)).toHaveLength(74);
    expect(Object.keys(EVENTS)).toEqual(['onUpdate', 'onBusy', 'onSources']);
    expect(Object.keys(PRINT)).toHaveLength(7);
  });

  it('covers every method of Api (checked by the compiler; the value only makes the check used)', () => {
    const covers: ContractCoversApi = true;
    expect(covers).toBe(true);
  });

  it('coerces only arguments that are actually forwarded', () => {
    const outOfRange = Object.entries(INVOKE).filter(([, spec]) =>
      Object.keys('coerce' in spec ? spec.coerce : {}).some((index) => Number(index) >= spec.n),
    );
    expect(outOfRange).toEqual([]);
  });
});

describe('window.api (preload built from the contract)', () => {
  it('exposes exactly the contract keys', async () => {
    const api = await expose('preload', 'api');
    expect(Object.keys(api).sort()).toEqual([...Object.keys(INVOKE), ...Object.keys(EVENTS)].sort());
  });

  it.each(Object.entries(INVOKE))('%s sends %j on its channel with exactly n arguments', async (method, spec) => {
    const api = await expose('preload', 'api');
    const coerce: Record<number, (value: unknown) => unknown> = 'coerce' in spec ? spec.coerce : {};
    const given = marked(spec.n + 2);
    await api[method](...given, () => 'a function', new Event('click'));
    expect(callsOf()).toHaveLength(1);
    const sent = callsOf()[0];
    expect(sent[0]).toBe(spec.channel);
    expect(sent.slice(1)).toHaveLength(spec.n);
    expect(sent.slice(1)).toEqual(given.slice(0, spec.n).map((value, i) => (coerce[i] ? coerce[i](value) : value)));
  });

  it.each(Object.entries(INVOKE))(
    '%s with no arguments sends n values (undefined unless coerced)',
    async (method, spec) => {
      const api = await expose('preload', 'api');
      await api[method]();
      const sent = callsOf()[0].slice(1);
      expect(sent).toHaveLength(spec.n);
      const coerced = Object.keys('coerce' in spec ? spec.coerce : {}).map(Number);
      expect(sent.filter((_, i) => !coerced.includes(i))).toEqual(
        sent.filter((_, i) => !coerced.includes(i)).map(() => undefined),
      );
    },
  );

  it('returns what ipcRenderer.invoke returns', async () => {
    const api = await expose('preload', 'api');
    await expect(api.boot()).resolves.toBe('reply');
  });

  it('keeps the old channels, counts and coercions (pinned examples)', async () => {
    const api = await expose('preload', 'api');
    const last = () => callsOf()[callsOf().length - 1];
    await api.run('cmd-payload');
    expect(last()).toEqual(['cmd', 'cmd-payload']);
    await api.exportFile('KIND', '2026-10-18');
    expect(last()).toEqual(['export', 'KIND', '2026-10-18', {}]);
    await api.exportFile('KIND', '2026-10-18', null);
    expect(last()).toEqual(['export', 'KIND', '2026-10-18', {}]);
    await api.updAuto(undefined);
    expect(last()).toEqual(['upd:auto', false]);
    await api.updSeen('yes');
    expect(last()).toEqual(['upd:seen', true]);
    await api.setGpu(undefined);
    expect(last()).toEqual(['flags:gpu', undefined]);
    await api.srcImport('K', 'B', 'C');
    expect(last()).toEqual(['src:import', 'K', 'B', 'C', false, []]);
    await api.srcApply('K', 'B', 'CMD');
    expect(last()).toEqual(['src:apply', 'K', 'B', 'CMD', []]);
    await api.repPreview('S', 'R', 'IDS', 'D');
    expect(last()).toEqual(['rep:preview', 'S', 'R', 'IDS', 'D', false, undefined]);
    await api.repRun('R', 'F', 'IDS', 'D');
    expect(last()).toEqual(['rep:run', 'R', 'F', 'IDS', 'D', false, false, {}]);
    await api.repRun('R', 'F', 'IDS', 'D', 1, 'x', { quiet: true });
    expect(last()).toEqual(['rep:run', 'R', 'F', 'IDS', 'D', true, true, { quiet: true }]);
    await api.exportRoster('D', true, 'SIGS', 'dropped');
    expect(last()).toEqual(['export:roster', 'D', true, 'SIGS']);
  });

  it.each(Object.entries(EVENTS))(
    '%s subscribes on its channel and unsubscribes the same listener',
    async (method, spec) => {
      const api = await expose('preload', 'api');
      const seen: unknown[][] = [];
      const unsubscribe = api[method]((...args: unknown[]) => seen.push(args), 'ignored') as () => unknown;
      expect(electron.on).toHaveBeenCalledTimes(1);
      const [channel, listener] = electron.on.mock.calls[0];
      expect(channel).toBe(spec.channel);
      listener({ sender: 'ipc event' }, { payload: 1 }, 'extra');
      expect(seen).toEqual([[{ payload: 1 }]]);
      expect(unsubscribe()).toBeUndefined();
      expect(electron.removeListener).toHaveBeenCalledWith(spec.channel, listener);
    },
  );
});

describe('window.printer (print window bridge built from the contract)', () => {
  it('exposes exactly the PRINT keys', async () => {
    const printer = await expose('print', 'printer');
    expect(Object.keys(printer)).toEqual(Object.keys(PRINT));
  });

  it.each(Object.entries(PRINT))('%s sends %j with exactly n arguments', async (method, spec) => {
    const printer = await expose('print', 'printer');
    const given = marked(spec.n + 2);
    await printer[method](...given);
    expect(callsOf()).toEqual([[spec.channel, ...given.slice(0, spec.n)]]);
  });

  it('keeps the old channels (pinned)', () => {
    expect(Object.fromEntries(Object.entries(PRINT).map(([method, spec]) => [method, spec.channel]))).toEqual({
      print: 'print:go',
      printers: 'print:printers',
      layout: 'print:layout',
      forget: 'print:forget',
      duplex: 'print:duplex',
      pdf: 'print:pdf',
      close: 'print:close',
    });
  });
});

describe('main-side helpers (src/main/ipc/handle.ts)', () => {
  it('handle and handlePrint register on the contract channel; eventChannel names the push channels', async () => {
    const { eventChannel, handle, handlePrint } = await import('../src/main/ipc/handle');
    const fn = () => 'x';
    handle('exportLists', fn);
    handlePrint('pdf', fn);
    expect(electron.handle.mock.calls).toEqual([
      ['export:lists', fn],
      ['print:pdf', fn],
    ]);
    expect([eventChannel('onUpdate'), eventChannel('onBusy'), eventChannel('onSources')]).toEqual([
      'update',
      'excel:busy',
      'sources',
    ]);
  });

  it('handleGuarded answers the fallback when the handler throws, and passes arguments through otherwise', async () => {
    const { handleGuarded } = await import('../src/main/ipc/handle');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    handleGuarded('updAuto', (on: boolean) => `auto:${on}`, 'fallback');
    handleGuarded(
      'updStart',
      () => {
        throw new Error('boom');
      },
      'fallback',
    );
    const [[autoChannel, auto], [startChannel, start]] = electron.handle.mock.calls;
    expect([autoChannel, startChannel]).toEqual(['upd:auto', 'upd:start']);
    expect(auto({}, true)).toBe('auto:true');
    expect(start({})).toBe('fallback');
  });

  it('the update push of src/main/updater.ts goes out on the contract channel of onUpdate', async () => {
    const { createUpdater } = await import('../src/main/updater');
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    const updater = createUpdater({
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-contract-')),
      getWin: () => win as never,
      backup: () => '',
      today: () => '2026-10-18',
    });
    void updater.check(true).catch(() => undefined);
    expect(send.mock.calls[0][0]).toBe(EVENTS.onUpdate.channel);
  });
});
