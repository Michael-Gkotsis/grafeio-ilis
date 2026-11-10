// The idle prefetch of screens (src/renderer/app/prefetch.ts) and the table of loaders it walks (loaders.ts).
// Purpose: pins the order, "one module per idle slot", the pauses (typing, running command), idempotence and that a
//   failed import does not stop the walk.
// Does NOT: load real screens through the walk (the fake `load` only records), or measure time (bench/ui does).
// Covering for: src/renderer/app/prefetch.ts, src/renderer/app/loaders.ts, src/renderer/app/routes.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { MODULES, OVERLAY_SOURCES, SCREEN_SOURCES } from '../src/renderer/app/loaders';
import {
  PAUSE_RETRY_MS,
  PREFETCH_ORDER,
  START_DELAY_MS,
  TYPING_QUIET_MS,
  holdPrefetch,
  noteKeyPress,
  resetPrefetch,
  startPrefetch,
  type PrefetchEnv,
} from '../src/renderer/app/prefetch';
import { SCREEN_IDS, SCREENS } from '../src/renderer/app/routes';

/** A manual clock: `idleSlots` counts the idle callbacks handed out; time only moves when `later` is called. */
function fakeEnv(opts: { fail?: string; onLoad?: (name: string) => void } = {}) {
  const log: string[] = [];
  const env = { time: 0, idleSlots: 0, loads: [] as string[] };
  const api: PrefetchEnv = {
    now: () => env.time,
    whenIdle: (fn) => {
      env.idleSlots += 1;
      log.push('idle');
      queueMicrotask(fn);
    },
    later: (fn, ms) => {
      env.time += ms;
      log.push('wait ' + ms);
      queueMicrotask(fn);
    },
    load: async (name) => {
      env.loads.push(name);
      log.push('load ' + name);
      opts.onLoad?.(name);
      if (name === opts.fail) throw new Error('missing chunk');
      return {};
    },
  };
  return { api, env, log };
}

beforeEach(() => resetPrefetch());

describe('prefetch: the walk', () => {
  it('waits for the start delay, then loads every module in PREFETCH_ORDER, one per idle slot', async () => {
    const { api, env, log } = fakeEnv();
    await startPrefetch(api);
    expect(env.loads).toEqual([...PREFETCH_ORDER]);
    expect(log[0]).toBe('wait ' + START_DELAY_MS);
    // every load is preceded by its own idle slot: never two loads in one slot
    const between = log.join(',').split('load ').slice(1);
    expect(between.every((chunk) => !chunk.includes('load'))).toBe(true);
    expect(
      log
        .slice(1)
        .join(',')
        .match(/idle,load/g),
    ).toHaveLength(PREFETCH_ORDER.length);
    expect(env.idleSlots).toBe(PREFETCH_ORDER.length);
  });

  it('PREFETCH_ORDER names each module of MODULES exactly once, most used first (people, guard, other)', () => {
    expect([...PREFETCH_ORDER].sort()).toEqual(Object.keys(MODULES).sort());
    expect(PREFETCH_ORDER.slice(0, 3)).toEqual(['people', 'guard', 'other']);
    expect(PREFETCH_ORDER.slice(-3)).toEqual(['settings', 'guide', 'diag']);
  });

  it('does not load while the user types: waits until TYPING_QUIET_MS after the last key', async () => {
    const { api, env, log } = fakeEnv();
    // a key is pressed right after the start delay; the walk must sit it out
    noteKeyPress(START_DELAY_MS);
    await startPrefetch(api, ['people']);
    expect(env.loads).toEqual(['people']);
    const typedAt = START_DELAY_MS;
    expect(env.time - typedAt).toBeGreaterThanOrEqual(TYPING_QUIET_MS);
    expect(log.filter((l) => l === 'wait ' + PAUSE_RETRY_MS).length).toBeGreaterThan(0);
  });

  it('does not load while a command runs (holdPrefetch), and carries on after the release', async () => {
    let release: (() => void) | null = holdPrefetch();
    const { api, env } = fakeEnv();
    const seenWhileHeld: string[][] = [];
    // after 3 retries release the hold
    let waits = 0;
    const original = api.later;
    api.later = (fn, ms) => {
      if (ms === PAUSE_RETRY_MS) waits += 1;
      if (ms === PAUSE_RETRY_MS && waits === 3) {
        seenWhileHeld.push([...env.loads]);
        release?.();
        release = null;
      }
      original(fn, ms);
    };
    await startPrefetch(api, ['people', 'guard']);
    expect(seenWhileHeld).toEqual([[]]);
    expect(env.loads).toEqual(['people', 'guard']);
  });

  it("releasing a hold twice does not release another command's hold", async () => {
    const first = holdPrefetch();
    holdPrefetch(); // a second command is still running
    first();
    first();
    const { api, env } = fakeEnv();
    let waits = 0;
    const original = api.later;
    // it can never finish while the second hold is open; stop the test after a few retries
    api.later = (fn, ms) => {
      if (ms === PAUSE_RETRY_MS) waits += 1;
      if (ms === PAUSE_RETRY_MS && waits > 3) return;
      original(fn, ms);
    };
    void startPrefetch(api, ['people']);
    await new Promise((r) => setTimeout(r, 20));
    expect(env.loads).toEqual([]);
  });

  it('a failed import does not stop the walk', async () => {
    const { api, env } = fakeEnv({ fail: 'guard' });
    await startPrefetch(api, ['people', 'guard', 'other']);
    expect(env.loads).toEqual(['people', 'guard', 'other']);
  });
});

describe('loaders and routes', () => {
  it('every screen but «Σήμερα» has an on-demand source, and «Σήμερα» is the only one without', () => {
    expect(Object.keys(SCREEN_SOURCES).sort()).toEqual(SCREEN_IDS.filter((id) => id !== 'home').sort());
    expect(SCREENS.home.component.name).toBe('TodayScreen');
  });

  it('each loader resolves to a function component (the same one the screen module exports)', async () => {
    const people = await import('../src/renderer/screens/people');
    const other = await import('../src/renderer/screens/other');
    expect((await SCREEN_SOURCES.people.load()).default).toBe(people.PeopleScreen);
    expect((await SCREEN_SOURCES.history.load()).default).toBe(other.HistoryScreen);
    expect((await OVERLAY_SOURCES.personSheet.load()).default).toBe(people.PersonSheet);
    const all = await Promise.all([
      ...Object.values(SCREEN_SOURCES).map((src) => src.load()),
      ...Object.values(OVERLAY_SOURCES).map((src) => src.load()),
    ]);
    expect(all.every((m) => typeof m.default === 'function')).toBe(true);
  });

  it('a module is the same object however it is asked for: prefetch and a click never load it twice', async () => {
    expect(await MODULES.guard()).toBe(await MODULES.guard());
    expect((await SCREEN_SOURCES.guard.load()).default).not.toBe((await SCREEN_SOURCES.outs.load()).default);
  });
});
