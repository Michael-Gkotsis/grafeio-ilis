// Stamp the ΗΚΑΙ moves of people who joined or left.
//
// Purpose: `stampMoves`: the day a person leaves the strength goes to `outOn` (removed when he returns), the new
//   soldier and the new roster rows get `inOn`.
// Does NOT: stamp the first import (no one was in the strength before).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: ΗΚΑΙ «1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ» (Michael, 17/10).
// Covering tests: test/hkai.test.ts, test/roster-sync.test.ts.
import type { ISODate } from '../lib/dates';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Command } from './types';

/**
 * ΗΚΑΙ registrations and deletions (Michael, 17/10): whoever leaves the strength gets today in outOn (removed if he
 * comes back); the «Νέος στρατιώτης» and the new roster rows get inOn. The first import (with no one in strength
 * before) is not a registration.
 */
export function stampMoves(prev: AppState, next: AppState, c: Command, today: ISODate): AppState {
  if (prev.people === next.people) return next;
  const before = new Map(prev.people.map((p) => [p.id, p]));
  const joins =
    (c.t === 'addPerson' || c.t === 'addPeople' || c.t === 'importPeople') && prev.people.some((p) => p.active);
  let out: Person[] | null = null;
  next.people.forEach((p, i) => {
    const b = before.get(p.id);
    let q: Person | null = null;
    if (!b) {
      if (joins && p.active && !p.inOn) q = { ...p, inOn: today };
    } else if (b.active && !p.active && !p.outOn) q = { ...p, outOn: today };
    else if (!b.active && p.active && p.outOn) {
      q = { ...p };
      delete q.outOn;
    }
    if (q) {
      out = out || [...next.people];
      out[i] = q;
    }
  });
  return out ? { ...next, people: out } : next;
}
