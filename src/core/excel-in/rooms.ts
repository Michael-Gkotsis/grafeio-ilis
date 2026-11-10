// The ΘΑΛΑΜΟΙ sheet: one table per room.
//
// Purpose: `roomBlocks` (find the room tables), `planRoomSheet` (new soldiers in, leavers out, Α/Α renumbered) and
//   `snapFromSheet` (the roster values of each person found).
// Does NOT: build a new sheet (newRoster.ts `roomSheetNew`) or write the file.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/peopleSnap, core/excel-in/peopleSlot, core/excel-in/columns, core/excel-in/tableRows.
// Why: the ΘΑΛΑΜΟΙ sheet repeats the people of the roster by room; when a soldier is added or leaves, the same
//   change must reach it, or the two lists would disagree.
// Covering tests: test/room-extras-totals.test.ts, test/new-soldier.test.ts, test/roster-sync.test.ts.
import { norm, normGreek } from '../lib/text';
import type { Person } from '../model/person';
import { DN_WORD, isDnYes } from './rosterColumns';
import type { RawSheet } from './roster';
import { rankTxt } from '../people/ranks';
import { PKEYS, personalFromCell, type PKey } from '../people/personal';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';
import { isHeaderRow, mapColumns } from './columns';
import { PERSON_FIELDS } from './fields';
import { key2, makeMatcher } from './peopleMatch';
import { groupSlot } from './peopleSlot';
import { type PersonSnap, personVals, PEOPLE_SYNC, remarksOf } from './peopleSnap';
import { type RowInsert, placeRows } from './rowInsert';
import { type TableRow, tableRows } from './tableRows';
import { type WVal, rankCell, num } from './writeCells';

/**
 * One table of the ΘΑΛΑΜΟΙ sheet (one per room: «ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ», headers, people). It is not read as a
 * source; a new soldier goes at the end of his room.
 */
export interface RoomBlock {
  room: number;
  header: number;
  cols: Record<string, number>;
  rows: TableRow[];
}
/**
 * Finds the room tables of the ΘΑΛΑΜΟΙ sheet: a row with one cell naming a room, followed within 2 rows by a header
 * row with at least a surname column.
 */
export function roomBlocks(sheet: RawSheet): RoomBlock[] {
  const out: RoomBlock[] = [];
  for (let r = 0; r < sheet.rows.length; r++) {
    const t = (sheet.rows[r] || []).map(cellText).filter(Boolean);
    if (t.length !== 1) continue;
    const m = /(\d+)\s*(?:ΟΥ|ΟΣ|Ο)?\s*ΘΑΛΑΜ|ΘΑΛΑΜ\S*\s+(\d+)/.exec(normGreek(t[0]));
    if (!m) continue;
    let h = r + 1;
    while (h <= r + 2 && !isHeaderRow(sheet.rows[h])) h++;
    if (h > r + 2) continue;
    const cols = mapColumns(
      sheet.rows[h],
      PERSON_FIELDS.filter((f) => f.k !== 'name'),
    );
    if (cols.last == null) continue;
    out.push({ room: Number(m[1] || m[2]), header: h, cols, rows: tableRows(sheet, h, cols).records });
    r = h;
  }
  return out;
}
/**
 * The plan for the ΘΑΛΑΜΟΙ sheet: `inserts` and `sets` as in the other plans, `deletes`, and `missing` (people whose
 * room has no table).
 */
export interface RoomsPlan {
  inserts: RowInsert[];
  sets: { r: number; c: number; v: WVal }[];
  deletes: number[];
  missing: Person[];
}
/**
 * Adds the new people (`add`) at the end of their room's table, removes those who left (`gone`) and renumbers the Α/Α
 * of the room.
 */
export function planRoomSheet(sheet: RawSheet, add: Person[], gone: PersonSnap[]): RoomsPlan {
  const blocks = roomBlocks(sheet);
  const out: RoomsPlan = { inserts: [], sets: [], deletes: [], missing: [] };
  const same2 = (x: TableRow, v: { asm?: string; last?: string; first?: string; father?: string }) => {
    const asm = cellText(x.v.asm).replace(/\s/g, '');
    if (v.asm && asm) return asm === v.asm;
    return (
      key2(cellText(x.v.last), cellText(x.v.first)) === key2(v.last || '', v.first || '') &&
      normGreek(cellText(x.v.father)) === normGreek(v.father || '')
    );
  };
  const aaOf = (bl: RoomBlock, r: number) => {
    const c = bl.cols.aa;
    if (c == null || sheet.fx?.has(r + ':' + c)) return null;
    const t = cellText((sheet.rows[r] || [])[c]);
    return /^\d+$/.test(t) ? Number(t) : null;
  };
  const dels: { bl: RoomBlock; r: number }[] = [];
  for (const g of gone)
    for (const bl of blocks) {
      const x = bl.rows.find((y) => same2(y, g));
      if (x) {
        dels.push({ bl, r: x.r });
        break;
      }
    }
  const ins: (RowInsert & { bl: RoomBlock; ps: Person[] })[] = [];
  for (const p of add) {
    if (p.room == null) continue;
    const bl = blocks.find((x) => x.room === p.room);
    if (!bl) {
      out.missing.push(p);
      continue;
    }
    if (bl.rows.some((y) => same2(y, p))) continue;
    // empty room (e.g. a new roster with all the rooms): right below the headers, shaped like the row of a person
    const at0 = bl.rows.length
      ? groupSlot(bl.rows, p)
      : { after: bl.header, tpl: blocks.find((x) => x.rows.length)?.rows[0].r ?? bl.header };
    const x = ins.find((y) => y.after === at0.after);
    if (x) {
      x.n++;
      x.ps.push(p);
      continue;
    }
    ins.push({ ...at0, n: 1, bl, ps: [p] });
  }
  ins.sort((x, y) => x.after - y.after);
  // Α/Α of the room: those below a new one get the next number, those below a row that leaves the previous one
  const shift = (bl: RoomBlock, r: number) =>
    ins.reduce((t, x) => t + (x.bl === bl && x.after < r ? x.n : 0), 0) -
    dels.filter((e) => e.bl === bl && e.r < r).length;
  const { steps, fin, at } = placeRows(ins);
  out.inserts = steps;
  const orig: { r: number; c: number; v: WVal }[] = [];
  for (const bl of blocks)
    for (const x of bl.rows) {
      const a = aaOf(bl, x.r);
      const d = shift(bl, x.r);
      if (a != null && d && !dels.some((e) => e.r === x.r)) orig.push({ r: x.r, c: bl.cols.aa!, v: a + d });
    }
  out.sets = orig.map((x) => ({ ...x, r: fin(x.r) }));
  ins.forEach((x, i) =>
    x.ps.forEach((p, j) => {
      const r = at(i) + j;
      const c = x.bl.cols;
      // the number of the one above + 1 (or 1 if he is first)
      const above = x.bl.rows.filter((y) => y.r <= x.after && !dels.some((e) => e.r === y.r));
      const prevAa = above.length ? aaOf(x.bl, above[above.length - 1].r) : 0;
      const vals: Record<string, WVal> = {
        aa: prevAa == null ? null : (above.length ? prevAa + shift(x.bl, above[above.length - 1].r) : 0) + 1 + j,
        rank: rankCell(p, x.bl),
        origin: p.origin || null,
        spec: p.spec || null,
        last: p.last,
        first: p.first,
        father: p.father || null,
        asm: p.asm ? num(p.asm) : null,
        phone: p.phone ? num(p.phone) : null,
      };
      for (const [k, v] of Object.entries(vals)) if (c[k] != null && v != null) out.sets.push({ r, c: c[k], v });
    }),
  );
  out.deletes = dels.map((d) => fin(d.r)).sort((x, y) => y - x);
  return out;
}
/**
 * The values of the Excel for each person found, as the import would write them: the starting point for what changed
 * in the app. What differs in the app (e.g. a correction made before the file was set) will be written at the next
 * update.
 */
export function snapFromSheet(sheet: RawSheet, b: SourceBinding, people: Person[]): Record<number, PersonSnap> {
  const match = makeMatcher(people);
  const out: Record<number, PersonSnap> = {};
  for (const { v } of tableRows(sheet, b.header, b.cols).records) {
    const m = match(v);
    if (m.pid == null || out[m.pid]) continue;
    const t = (k: string) => (b.cols[k] == null ? null : cellText(v[k]));
    const p = people.find((x) => x.id === m.pid)!;
    const cur = personVals(p, b);
    const snap: PersonSnap = {};
    for (const k of PEOPLE_SYNC) {
      const x = t(k);
      if (x == null) {
        snap[k] = cur[k];
        continue;
      } // } // the column does not exist: nothing to write
      // rank in a table with an «Προέλευση» column: together with it, as `personVals` does
      if (k === 'rank' && b.cols.origin != null) {
        snap[k] = rankTxt({ rank: normGreek(x), origin: normGreek(t('origin') || '') });
        continue;
      }
      if (!p.active && (k === 'remarks' || k === 'dn')) {
        snap[k] = cur[k];
        continue;
      } // } // out of strength: the role does not pass to the app
      snap[k] =
        k === 'asm' || k === 'phone'
          ? x.replace(/\s/g, '')
          : k === 'room'
            ? parseInt(x, 10) > 0
              ? String(parseInt(x, 10))
              : ''
            : PKEYS.includes(k as PKey)
              ? personalFromCell(k as PKey, x)
              : k === 'dn'
                ? isDnYes(x)
                  ? 'ΝΑΙ'
                  : ''
                : k === 'remarks'
                  ? remarksOf(x, DN_WORD.test(norm(x)), b.cols.dn == null)
                  : k === 'rank' || k === 'spec' || k === 'si'
                    ? normGreek(x)
                    : norm(x); // norm(x); // as the roster reads them (roster.ts)
    }
    out[m.pid] = snap;
  }
  return out;
}
