// Where a new person goes in the table of the roster.
//
// Purpose: `slotOf` / `groupSlot` (the row after which a new person is inserted, and the row whose format it copies)
//   and the small orderings they use.
// Does NOT: insert the row (personnelBack.ts, rooms.ts) or know the cells to fill.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model/person,
//   core/excel-in/cellText, core/excel-in/tableRows.
// Why: the roster is grouped by room and alphabetical inside the room; a new soldier goes where the sergeant would
//   put him, not at the bottom, and the same rule serves the roster and the ΘΑΛΑΜΟΙ sheet.
// Covering tests: test/insert-rows.test.ts, test/new-soldier.test.ts.
import { normGreek, collator } from '../lib/text';
import type { Person } from '../model/person';
import type { CellValue } from './roster';
import { cellText } from './cellText';
import type { TableRow } from './tableRows';

/** The room number of a cell (null when it is not a positive number). */
const roomNo = (v: CellValue) => {
  const n = parseInt(cellText(v), 10);
  return n > 0 ? n : null;
};
/** Orders by surname, then by name. */
export const byNameCmp = (a: { last: string; first: string }, c: { last: string; first: string }) =>
  collator.compare(a.last, c.last) || collator.compare(a.first, c.first);
/** The surname and name of a row. */
const rowName2 = (x: TableRow) => ({ last: cellText(x.v.last), first: cellText(x.v.first) });
// alphabetical by surname (same surname: the name does not count, the sergeant does not always order them)
/** True when the rows are in alphabetical order of surname. */
const sortedRows = (l: TableRow[]) =>
  l.every((x, i) => !i || collator.compare(rowName2(l[i - 1]).last, rowName2(x).last) <= 0);
/**
 * Inside a group (a room): alphabetically if the group is alphabetical (the room leader stays first), otherwise at the
 * end of the group.
 */
export function groupSlot(m: TableRow[], p: { last: string; first: string }): { after: number; tpl: number } {
  const lead =
    m.length > 1 &&
    (/ΘΑΛΑΜΑΡΧ/.test(normGreek(cellText(m[0].v.remarks))) || (!sortedRows(m) && sortedRows(m.slice(1))));
  const body = lead ? m.slice(1) : m;
  const i = sortedRows(body) ? body.findIndex((x) => byNameCmp(p, rowName2(x)) < 0) : -1;
  return i < 0 ? { after: m[m.length - 1].r, tpl: body[body.length - 1].r } : { after: body[i].r - 1, tpl: body[i].r };
}
/**
 * Where a new person goes in the table of the roster: when the people are grouped by room (1, 2, 3…), in their room —
 * alphabetically if the group is alphabetical (the room leader stays first), otherwise at the end of the group; a room
 * without a group goes between its neighbours. Null: at the end of the table.
 */
export function slotOf(people: TableRow[], p: Person, header: number): { after: number; tpl: number } | null {
  if (p.room == null || !people.length) return null;
  const runs: { room: number | null; rows: TableRow[] }[] = [];
  for (const x of people) {
    const r = roomNo(x.v.room);
    const l = runs[runs.length - 1];
    if (l && l.room === r) l.rows.push(x);
    else runs.push({ room: r, rows: [x] });
  }
  if (runs.length > 1 && runs[runs.length - 1].room == null) runs.pop(); // no room: at the end (as in the new roster)
  if (runs.some((g, i) => g.room == null || (i && g.room <= runs[i - 1].room!))) return null; // not groups of rooms
  const last = people[people.length - 1].r;
  const end = (after: number) => (after === last ? null : after);
  const g = runs.find((x) => x.room === p.room);
  if (g) {
    const x = groupSlot(g.rows, p);
    if (x.after === g.rows[g.rows.length - 1].r && end(x.after) == null) return null;
    return x;
  }
  const prev = runs.filter((x) => x.room! < p.room!).pop();
  if (!prev) return { after: header, tpl: (runs[0].rows[1] || runs[0].rows[0]).r };
  const a = end(prev.rows[prev.rows.length - 1].r);
  if (a == null) return null;
  return { after: a, tpl: (prev.rows.length > 1 ? prev.rows[prev.rows.length - 1] : prev.rows[0]).r };
}
