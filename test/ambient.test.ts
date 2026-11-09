// Ambient state (src/core/ambient.ts): the one entry point that sets the clock, the namesake set and the unit kind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_AMBIENT,
  SCREEN_AMBIENT,
  STORE_AMBIENT,
  WORKER_AMBIENT,
  applyAmbient,
  type AmbientPart,
} from '../src/core/ambient';
import { nowHM, setClock } from '../src/core/lib/dates';
import { noteNamesakes } from '../src/core/model/person';
import { HK, setUnitKind } from '../src/core/model/unit';
import { fullName, type AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

/** A state whose people 1 and 4 are namesakes, with the unit kind and clock given. */
function stateWith(unitKind: 'ili' | 'lochos', clock: { tz?: string; clockFix?: number } = {}): AppState {
  const state = fakeState(10);
  state.people[3] = { ...state.people[3], last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: 'ΙΩΑΝΝΗΣ', asm: '' };
  state.people[0] = { ...state.people[0], father: 'ΓΕΩΡΓΙΟΣ', asm: '' };
  state.settings = { ...state.settings, unitKind, ...clock };
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T10:30:00Z'));
});
afterEach(() => {
  // module state must not leak into other tests
  setClock({});
  setUnitKind(null);
  noteNamesakes([]);
  vi.useRealTimers();
});

describe('applyAmbient: unit kind', () => {
  it('SCREEN_AMBIENT sets ΗΚΑΛ for a lochos and ΗΚΑΙ again for an ili', () => {
    applyAmbient(stateWith('lochos'), SCREEN_AMBIENT);
    expect(HK()).toBe('ΗΚΑΛ');
    applyAmbient(stateWith('ili'), SCREEN_AMBIENT);
    expect(HK()).toBe('ΗΚΑΙ');
  });

  it('HISTORY_AMBIENT sets only the unit kind', () => {
    applyAmbient(stateWith('lochos', { tz: 'UTC' }), HISTORY_AMBIENT);
    expect(HK()).toBe('ΗΚΑΛ');
    expect(nowHM()).toBe('13:30'); // clock untouched: still Athens
  });
});

describe('applyAmbient: namesakes', () => {
  it('fullName shows the patronymic only after "namesakes" is applied', () => {
    const state = stateWith('ili');
    expect(fullName(state.people[0])).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ');
    applyAmbient(state, ['namesakes']);
    expect(fullName(state.people[0])).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΓΕΩΡΓΙΟΣ');
    expect(fullName(state.people[3])).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
    expect(fullName(state.people[1])).toBe('ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ');
  });

  it('STORE_AMBIENT includes the namesakes', () => {
    const state = stateWith('ili');
    applyAmbient(state, STORE_AMBIENT);
    expect(fullName(state.people[0])).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΓΕΩΡΓΙΟΣ');
  });
});

describe('applyAmbient: clock', () => {
  it('follows settings.tz', () => {
    applyAmbient(stateWith('ili', { tz: 'UTC' }), ['clock']);
    expect(nowHM()).toBe('10:30');
    applyAmbient(stateWith('ili', { tz: '' }), ['clock']);
    expect(nowHM()).toBe('13:30');
  });

  it('follows settings.clockFix', () => {
    applyAmbient(stateWith('ili', { tz: 'UTC', clockFix: 5 }), WORKER_AMBIENT);
    expect(nowHM()).toBe('10:35');
  });
});

describe('applyAmbient: unlisted parts are not applied', () => {
  it("['clock'] leaves the unit kind and the namesakes alone", () => {
    const state = stateWith('lochos', { tz: 'UTC' });
    applyAmbient(state, ['clock']);
    expect(nowHM()).toBe('10:30');
    expect(HK()).toBe('ΗΚΑΙ');
    expect(fullName(state.people[0])).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ');
  });

  it("['unit'] leaves the clock alone", () => {
    applyAmbient(stateWith('lochos', { tz: 'UTC' }), ['unit']);
    expect(HK()).toBe('ΗΚΑΛ');
    expect(nowHM()).toBe('13:30');
  });

  it('an empty list changes nothing', () => {
    applyAmbient(stateWith('lochos', { tz: 'UTC' }), []);
    expect(HK()).toBe('ΗΚΑΙ');
    expect(nowHM()).toBe('13:30');
  });
});

describe('presets', () => {
  const sorted = (parts: readonly AmbientPart[]) => [...parts].sort();
  it('keep exactly the parts each call site applied before the module existed', () => {
    expect(sorted(SCREEN_AMBIENT)).toEqual(['clock', 'namesakes', 'unit']);
    expect(sorted(STORE_AMBIENT)).toEqual(['clock', 'namesakes']);
    expect(sorted(WORKER_AMBIENT)).toEqual(['clock']);
    expect(sorted(HISTORY_AMBIENT)).toEqual(['unit']);
  });
  it('are frozen', () => {
    expect([SCREEN_AMBIENT, STORE_AMBIENT, WORKER_AMBIENT, HISTORY_AMBIENT].map(Object.isFrozen)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
