// The filter of a term of a values row (platoon, room, rank, arms, soldiers or cadres).
//
// Purpose: `applyFilter` (restrict a set of people), `filterChoices` (what the user can choose) and `filterText`.
// Does NOT: decide which terms a row has (valueEval.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/lib,
//   core/reports/valueCtx, core/reports/valueRows.
// Why: the index of the details of each person is kept in the context memo, so a form with many filtered rows reads
//   the people once.
// Covering tests: test/values.test.ts.
import type { VFilter } from '../model/reportTypes';
import { unitOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { normGreek } from '../lib/text';
import { type VCtx, type VSet, memo, unarmedSet } from './valueCtx';
import { hasFilter } from './valueRows';

interface PInfo {
  cad: boolean;
  unit: string;
  room: number | null;
  rank: string;
  armed: boolean | null;
}
function index(c: VCtx): Map<string, PInfo> {
  return memo(c, 'idx', () => {
    const m = new Map<string, PInfo>();
    const un = unarmedSet(c);
    for (const p of c.s.people)
      m.set('p' + p.id, {
        cad: false,
        unit: unitOf(p, c.s.settings),
        room: p.room ?? null,
        rank: p.rank,
        armed: !un.has(p.id),
      });
    for (const x of c.s.cadreList || [])
      m.set('c' + x.id, { cad: true, unit: '—', room: null, rank: x.rank, armed: null });
    return m;
  });
}
/** Keeps the people of the set `v` that pass the filter (unit, room, rank, arms, who). */
export function applyFilter(c: VCtx, v: VSet, f: VFilter): VSet {
  const idx = index(c);
  const o = new Set<string>();
  const rk = f.rank ? normGreek(f.rank) : '';
  v.forEach((k) => {
    const i = idx.get(k);
    if (!i) return;
    if (f.who && (f.who === 'cadre') !== i.cad) return;
    if (f.unit != null && i.unit !== f.unit) return;
    if (f.room != null && i.room !== f.room) return;
    if (rk && normGreek(i.rank) !== rk) return;
    if (f.arm && i.armed !== (f.arm === 'armed')) return;
    o.add(k);
  });
  return o;
}
/** The filter choices that exist: the platoons, rooms and ranks of the people in the app. */
export function filterChoices(s: AppState): { units: string[]; rooms: number[]; ranks: string[] } {
  const units = new Set<string>(),
    rooms = new Set<number>(),
    ranks = new Set<string>();
  for (const p of s.people) {
    if (!p.active) continue;
    const u = unitOf(p, s.settings);
    if (u !== '—') units.add(u);
    if (p.room != null) rooms.add(p.room);
    if (p.rank) ranks.add(p.rank);
  }
  for (const x of s.cadreList || []) if (x.active && x.rank) ranks.add(x.rank);
  return {
    units: [...units],
    rooms: [...rooms].sort((a, b) => a - b),
    ranks: [...ranks].sort((a, b) => a.localeCompare(b, 'el')),
  };
}
/** The filter as text, for the list. */
export function filterText(f?: VFilter): string {
  if (!hasFilter(f)) return '';
  return [
    f.unit,
    f.room != null && 'Θ' + f.room,
    f.rank,
    f.arm === 'armed' ? 'ένοπλοι' : f.arm === 'unarmed' ? 'άοπλοι' : '',
    f.who === 'soldiers' ? 'στρατιώτες' : f.who === 'cadre' ? 'στελέχη' : '',
  ]
    .filter(Boolean)
    .join(', ');
}
