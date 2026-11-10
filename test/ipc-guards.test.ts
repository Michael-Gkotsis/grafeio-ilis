// IPC input guards: the predicates, the GUARDS table and what handle() answers for a rejected call.
//
// Purpose: pins that every real value the renderer sends passes (all HANDLERS keys, ExportKinds, list/form kinds) and
//   that malformed values give the documented `{ ok: false, error }` without running the handler.
// Does NOT: start Electron (`electron` is mocked).
// Covering for: src/main/ipc/guards.ts, src/main/ipc/handle.ts.
import { describe, expect, it, vi } from 'vitest';
import { HANDLERS } from '../src/core/commands/handlers';
import { FORM_KINDS, KINDS, STATUS_KINDS } from '../src/core/excel-in/fields';
import { EXPORT_KINDS } from '../src/core/model/exportKind';
import { INVOKE } from '../src/shared/ipc/contract';
import {
  GUARDS,
  guardError,
  isCommand,
  isExportKind,
  isFormKind,
  isIsoDate,
  isListKind,
  oneOf,
} from '../src/main/ipc/guards';

const electron = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle } }));

const JUNK = [undefined, null, 0, 1, '', 'x', [], {}, true, '__proto__', 'constructor', { t: 'nope' }, { t: 5 }];

describe('predicates', () => {
  it('isCommand accepts a command of every HANDLERS key and nothing else', () => {
    const keys = Object.keys(HANDLERS);
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((t) => !isCommand({ t }))).toEqual([]);
    expect([...JUNK, { t: 'toString' }, { t: '__proto__' }, 'declare'].filter(isCommand)).toEqual([]);
  });
  it('isExportKind, isListKind, isFormKind accept exactly the real values', () => {
    expect(EXPORT_KINDS.every(isExportKind)).toBe(true);
    expect(EXPORT_KINDS).toEqual(['froura', 'hkai', 'outs', 'check', 'frouraPsk', 'outsPsk']);
    expect(KINDS.every((k) => isListKind(k.id))).toBe(true);
    expect(FORM_KINDS.every(isFormKind)).toBe(true);
    for (const f of [isExportKind, isListKind, isFormKind]) expect([...JUNK, 'frouraSpenX'].filter(f)).toEqual([]);
    expect(isExportKind('frouraSpen')).toBe(false);
    expect(isFormKind('frouraPsk')).toBe(false);
  });
  it('isIsoDate checks the YYYY-MM-DD shape', () => {
    expect(['2026-11-10', '1999-01-01'].every(isIsoDate)).toBe(true);
    expect(
      ['', '2026-1-1', '10/11/2026', '2026-11-10T00:00', '../../x', ' 2026-11-10', ...JUNK].filter(isIsoDate),
    ).toEqual([]);
  });
  it('oneOf matches only strings of the list', () => {
    const is = oneOf(['a', 'b']);
    expect([is('a'), is('b'), is('c'), is(1), is(undefined)]).toEqual([true, true, false, false, false]);
  });
});

describe('GUARDS', () => {
  it('lists only real invoke methods', () => {
    expect(Object.keys(GUARDS).filter((m) => !(m in INVOKE))).toEqual([]);
  });
  const cmd = { t: 'expire' };
  const day = '2026-11-10';
  const valid: Record<string, unknown[]> = {
    run: [cmd],
    exportFile: ['froura', day, {}],
    exportLists: [day],
    exportCadre: [day],
    exportRoster: [day, true],
    exportWeapons: [day, false],
    exportHd: [{ date: day, doc: {} }],
    exportImer: [{ to: day }, true],
    restoreBackup: ['ilh_2026-11-10_x.db'],
    srcPick: [null],
    srcSave: ['people', null],
    srcImport: ['punish', {}, {}, false, []],
    srcApply: ['people', {}, cmd, []],
    srcWrite: ['people'],
    formSave: ['hkai', null],
  };
  const bad: Record<string, [unknown[], string]> = {
    run: [[{ t: 'nope' }], 'Άγνωστη ενέργεια'],
    exportFile: [['nope', day, {}], 'Άγνωστο έντυπο'],
    exportLists: [['10/11/2026'], 'Μη έγκυρη ημερομηνία'],
    exportCadre: [[undefined], 'Μη έγκυρη ημερομηνία'],
    exportRoster: [['', true], 'Μη έγκυρη ημερομηνία'],
    exportWeapons: [[null, false], 'Μη έγκυρη ημερομηνία'],
    exportHd: [[undefined], 'Μη έγκυρη ημερομηνία'],
    exportImer: [[{ to: 'x' }], 'Μη έγκυρη ημερομηνία'],
    restoreBackup: [[{}], 'Άγνωστο αντίγραφο'],
    srcPick: [['nope'], 'Άγνωστο είδος αρχείου'],
    srcSave: [['__proto__', null], 'Άγνωστο είδος αρχείου'],
    srcImport: [['people', {}, {}, false, []], 'Άγνωστο είδος αρχείου'],
    srcApply: [['people', {}, { t: 'nope' }, []], 'Άγνωστη ενέργεια'],
    srcWrite: [[undefined], 'Άγνωστο είδος αρχείου'],
    formSave: [['frouraPsk', null], 'Άγνωστο έντυπο'],
  };
  it('has a case for every guarded method', () => {
    expect(Object.keys(GUARDS).sort()).toEqual(Object.keys(valid).sort());
    expect(Object.keys(bad).sort()).toEqual(Object.keys(valid).sort());
  });
  it.each(Object.keys(valid))('%s lets valid arguments through and rejects bad ones', (m) => {
    expect(guardError(m as keyof typeof INVOKE, valid[m])).toBeUndefined();
    expect(guardError(m as keyof typeof INVOKE, bad[m][0])).toBe(bad[m][1]);
  });
  it('every list kind, status kind, form kind and export kind passes its method', () => {
    expect(KINDS.filter((k) => guardError('srcSave', [k.id, null])).length).toBe(0);
    expect(STATUS_KINDS.filter((k) => guardError('srcImport', [k])).length).toBe(0);
    expect(FORM_KINDS.filter((f) => guardError('formSave', [f, null])).length).toBe(0);
    expect(EXPORT_KINDS.filter((k) => guardError('exportFile', [k, day])).length).toBe(0);
    expect(Object.keys(HANDLERS).filter((t) => guardError('run', [{ t }])).length).toBe(0);
  });
  it('an unguarded method has no error', () => {
    expect(guardError('openFolder', ['whatever'])).toBeUndefined();
  });
});

describe('handle() with a guard', () => {
  it('answers { ok: false, error } and skips the handler on a rejected call; runs it otherwise', async () => {
    const { handle } = await import('../src/main/ipc/handle');
    electron.handle.mockClear();
    const fn = vi.fn(() => 'ran');
    handle('run', fn);
    const [channel, wrapped] = electron.handle.mock.calls[0];
    expect(channel).toBe('cmd');
    expect(wrapped({}, { t: 'nope' })).toEqual({ ok: false, error: 'Άγνωστη ενέργεια' });
    expect(fn).not.toHaveBeenCalled();
    expect(wrapped({}, { t: 'expire' })).toBe('ran');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('registers an unguarded method with the handler itself', async () => {
    const { handle } = await import('../src/main/ipc/handle');
    electron.handle.mockClear();
    const fn = () => 'x';
    handle('openFolder', fn);
    expect(electron.handle.mock.calls).toEqual([['open', fn]]);
  });
});
