// E-mail, relative's e-mail and blood group on the ΘΑΛΑΜΟΙ sheet of the roster (@decision Michael 3/11).
//
// Purpose: finds the extra columns from the header of each room table (`extraOf`), reads them into the import rows
//   (`withRoomExtras`) and plans the cells to write back (`planRoomExtras`).
// Does NOT: open or write the file (src/main/sources.ts does with the plan) or touch the «Νούμερο παραλλαγής» column.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in, core/people, core/model.
// Why: the columns are found from the header, not from a position; if there is no column, nothing is added or read.
// Covering tests: test/room-extras-totals.test.ts.
import { norm } from '../lib/text';
import type { ImportRow } from '../model/importRow';
import type { Person } from '../model/person';
import type { RawSheet } from './roster';
import { cellText } from './cellText';
import { makeMatcher } from './peopleMatch';
import { roomBlocks } from './rooms';
import type { TableRow } from './tableRows';
import type { WVal } from './writeCells';
import { XKEYS, normExtra, type XKey } from '../people/personal';

// Greek letters that look like Latin -> Latin, so «Ε-mail» with a Greek Ε is found too
const LAT: Record<string, string> = { Ε: 'E', Μ: 'M', Α: 'A', Ι: 'I', Ο: 'O', Τ: 'T' };
/** Which extra column a header is: `email`, `relEmail` (relative's), `blood`, or `null`. */
export function extraOf(head: unknown): XKey | null {
  const h = norm(head)
    .replace(/[^A-ZΑ-Ω]/g, '')
    .split('')
    .map((c) => LAT[c] || c)
    .join('');
  if (/^EMAIL/.test(h)) return /ΣΥΓΓ|ΠΡ.ΣΩΠ/.test(h) ? 'relEmail' : h === 'EMAIL' ? 'email' : null;
  return /AIMATO[ΣS]$/.test(h) ? 'blood' : null;
}
interface Blk {
  rows: TableRow[];
  cols: Partial<Record<XKey, number>>;
}
function blocks(sheet: RawSheet): Blk[] {
  return roomBlocks(sheet)
    .map((bl) => {
      const cols: Partial<Record<XKey, number>> = {};
      (sheet.rows[bl.header] || []).forEach((h, c) => {
        const k = extraOf(h);
        if (k && cols[k] == null) cols[k] = c;
      });
      return { rows: bl.rows, cols };
    })
    .filter((b) => XKEYS.some((k) => b.cols[k] != null));
}
/** True for a ΘΑΛΑΜΟΙ sheet other than the main roster sheet `main`. */
export const isRoomSheet = (name: string, main: string) => name !== main && /ΘΑΛΑΜ/.test(norm(name));

/** The values of the last sync: person id -> field -> value. */
type Snaps = Record<number, Record<string, string>> | undefined;
/**
 * Import: the values of the ΘΑΛΑΜΟΙ columns go into the rows of the ΣΥΝΟΛΙΚΟ. Rule (base = the value at the last
 * sync): if the app changed from the base, the app value stays; otherwise the Excel value passes (empty = no value).
 * Without a base only a non-empty Excel value passes. Whoever is not on the ΘΑΛΑΜΟΙ sheet, or has no column, stays as
 * is.
 */
export function withRoomExtras(
  rows: ImportRow[],
  sheets: RawSheet[],
  main: string,
  app: Person[] = [],
  psnap?: Snaps,
): ImportRow[] {
  const sh = sheets.find((x) => isRoomSheet(x.name, main));
  if (!sh) return rows;
  const bl = blocks(sh);
  if (!bl.length) return rows;
  const fake = rows.map(
    (r, i) => ({ id: i + 1, active: true, post: null, attached: false, notes: '', ...r }) as unknown as Person,
  );
  const match = makeMatcher(fake);
  const mApp = makeMatcher(app);
  const got = new Map<number, Partial<Record<XKey, string>>>();
  for (const b of bl)
    for (const x of b.rows) {
      const m = match(x.v);
      if (m.pid == null) continue;
      const row = rows[m.pid - 1];
      const ap = mApp(row as unknown as Record<string, never>);
      const cur = app.find((p) => p.id === ap.pid);
      const out = got.get(m.pid) || {};
      for (const k of XKEYS) {
        const c = b.cols[k];
        if (c == null) continue;
        const xl = normExtra(k, cellText((sh.rows[x.r] || [])[c]));
        const base = cur ? psnap?.[cur.id]?.[k] : undefined;
        const mine = cur?.[k] || '';
        const take = !cur ? true : base !== undefined ? mine === base : !!xl;
        if (take) out[k] = xl;
      }
      got.set(m.pid, out);
    }
  return rows.map((r, i) => (got.has(i + 1) ? { ...r, ...got.get(i + 1) } : r));
}

/**
 * Write: a cell is written only if (a) it is empty and the app has a value, or (b) the app changed from the base (and
 * empty, if the base had a value). A non-empty cell without a base is never touched; a change made in Excel after the
 * sync is not overwritten (the import takes it). Never written over a formula.
 * Each `{ r, c, v }` is a row, a column (both from 0) and the new value.
 */
export function planRoomExtras(sheet: RawSheet, people: Person[], psnap?: Snaps): { r: number; c: number; v: WVal }[] {
  const out: { r: number; c: number; v: WVal }[] = [];
  const bl = blocks(sheet);
  if (!bl.length) return out;
  const match = makeMatcher(people.filter((p) => p.active));
  const pm = new Map(people.map((p) => [p.id, p]));
  for (const b of bl)
    for (const x of b.rows) {
      const m = match(x.v);
      const p = m.pid == null ? undefined : pm.get(m.pid);
      if (!p) continue;
      for (const k of XKEYS) {
        const c = b.cols[k];
        if (c == null || sheet.fx?.has(x.r + ':' + c)) continue;
        const want = p[k] || '';
        const cur = normExtra(k, cellText((sheet.rows[x.r] || [])[c]));
        if (cur === want) continue;
        const base = psnap?.[p.id]?.[k];
        if ((!cur && want) || (cur && base !== undefined && want !== base)) out.push({ r: x.r, c, v: want || null });
      }
    }
  return out;
}
