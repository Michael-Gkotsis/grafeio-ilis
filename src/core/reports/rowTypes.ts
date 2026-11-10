// The rows of a report: the types of a row and how a row is made from an id or a number.
//
// Purpose: `Row` and its kinds (`StatusRow`, `DutyRow`, `MoveRow`), the person of a «Κενός πίνακας» row (`WhoAt`,
//   `whoOf`), `blankRow`, `dutyRow` and `byIds` (rows from saved ids).
// Does NOT: pick the rows (candidates.ts) or compute a cell of a row (fieldValue.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/weapons.
// Why: a row can be six different things and every reader (filters, sort, split, values) must see the same shape, so
//   the shapes and their builders live here.
// Covering tests: test/report-blank-who.test.ts, test/reports-phase3.test.ts, test/armed.test.ts,
//   test/personal-entypa.test.ts.
import type { ISODate } from '../lib/dates';
import type { Status } from '../model/status';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import type { Post } from '../model/duty';
import type { WeaponMove } from '../model/records';
import { personMap, seatMap } from '../duty/indexes';
import { postBy } from '../duty/posts';
import { moveById } from '../weapons/weaponSheets';
import type { RepKind } from '../model/reportTypes';

/**
 * Statuses: one row = one status, with the soldier's details (room, rank… for the filters, the order and the split).
 */
export type StatusRow = Omit<Person, 'id'> & { id: string; pid: number; st: Status; p: Person };
/** Duties: one row = one post (`id` = the post key); `p`: the soldier, null in an empty post. */
export type DutyRow = Omit<Person, 'id'> & { id: string; pid: number | null; p: Person | null; seat: Post };
/** Weapon moves: one row = one weapon exit (`id` = the move's id). */
export type MoveRow = Omit<Person, 'id'> & { id: string; pid: number; p: Person; m: WeaponMove };
/** A row of a report: a soldier, a cadre, a status, a duty post or a weapon move, by kind. */
export type Row = Person | Cadre | StatusRow | DutyRow | MoveRow;
/**
 * The person of a row of «Κενός πίνακας»: 'p:12' a soldier (id), 'c:3' a cadre (the `Cadre` id, text); deleted or
 * unknown = null (an empty row).
 */
export type WhoAt = { kind: 'people'; x: Person } | { kind: 'cadre'; x: Cadre };
/** The reference of a soldier ('p:12') in a «Κενός πίνακας» row; `whoC` is the same for a cadre ('c:3'). */
export const whoP = (id: number) => 'p:' + id,
  whoC = (id: string) => 'c:' + id;
/** The person a row of «Κενός πίνακας» refers to; null when the reference is empty, deleted or unknown. */
export function whoOf(
  s: Pick<AppState, 'people' | 'cadreList'>,
  ref: string | null | undefined,
  pm?: Map<number, Person>,
): WhoAt | null {
  if (!ref) return null;
  const id = ref.slice(2);
  if (ref.startsWith('c:')) {
    const c = (s.cadreList || []).find((x) => x.id === id);
    return c ? { kind: 'cadre', x: c } : null;
  }
  if (ref.startsWith('p:')) {
    const p = (pm || personMap(s.people)).get(+id);
    return p ? { kind: 'people', x: p } : null;
  }
  return null;
}
/**
 * The place of a row of «Κενός πίνακας» among the user's own (cells, `who`): the row's own number when there are no
 * rows from a filter; -1 for a row from a filter.
 */
export const blankIdx = (x: unknown, i: number) => (x as { bm?: number }).bm ?? i;
/** The id of a row. */
export const rowId = (x: Row) => x.id;
/**
 * «Κενό»: one row = its number (0, 1, 2…), without person details.
 * `bw`: the row's person (`Report.who` or a row from a filter); `bm`: its place among the user's own (-1: from a
 * filter), only when it differs from `i`.
 */
export const blankRow = (i: number, w?: WhoAt | null, bm?: number) =>
  ({
    ...NOBODY,
    id: i,
    ...(w ? { bw: w } : {}),
    ...(bm != null && (bm < 0 || bm !== i) ? { bm } : {}),
  }) as unknown as Person;
const NOBODY = {
  rank: '',
  spec: '',
  last: '',
  first: '',
  father: '',
  asm: '',
  phone: '',
  si: '',
  room: null,
} as unknown as Omit<Person, 'id'>;
/** A duty row: the post `po` with the soldier or cadre `pid` who holds it; an empty post has no person. */
export function dutyRow(pm: Map<number, Person>, po: Post, pid: number | undefined): DutyRow {
  const p = pid != null ? pm.get(pid) : undefined;
  return p ? { ...p, id: po.k, pid: p.id, p, seat: po } : { ...NOBODY, id: po.k, pid: null, p: null, seat: po };
}
/**
 * The rows of a kind from their ids, as saved in a draw: the people, cadres, statuses, posts or weapon moves that
 * still exist.
 */
export const byIds = (
  s: AppState,
  kind: RepKind,
  ids: (number | string)[],
  d?: ISODate,
  who?: (string | null)[],
): Row[] => {
  if (kind === 'blank') {
    const pm = who?.some(Boolean) ? personMap(s.people) : undefined;
    return ids.map((i) => blankRow(+i, whoOf(s, who?.[+i], pm)));
  }
  if (kind === 'duty') {
    const pm = seatMap(s);
    const g = (d && s.guards[d]) || {};
    return ids
      .map((k) => {
        const po = postBy(s, String(k));
        return po ? dutyRow(pm, po, g[po.k]) : null;
      })
      .filter((x): x is DutyRow => !!x);
  }
  if (kind === 'wmove') {
    const pm = seatMap(s);
    return ids
      .map((id) => {
        const m = moveById(s, id as string);
        const p = m && pm.get(m.pid);
        return m && p ? ({ ...p, id: m.id, pid: p.id, p, m } as MoveRow) : null;
      })
      .filter((x): x is MoveRow => !!x);
  }
  if (kind === 'status') {
    const pm = personMap(s.people);
    const sm = new Map(s.statuses.map((x) => [x.id, x]));
    return ids
      .map((id) => {
        const st = sm.get(id as string);
        const p = st && pm.get(st.pid);
        return st && p ? ({ ...p, id: st.id, pid: p.id, st, p } as StatusRow) : null;
      })
      .filter((x): x is StatusRow => !!x);
  }
  if (kind === 'cadre') {
    const m = new Map((s.cadreList || []).map((c) => [c.id, c]));
    return ids.map((id) => m.get(id as string)).filter((x): x is Cadre => !!x);
  }
  const pm = personMap(s.people);
  return ids.map((id) => pm.get(id as number)).filter((x): x is Person => !!x);
};
