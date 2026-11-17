// The safe write layer of the template engine: planned writes {sheet, r, c, value} go into a Workbook (src/main/xlsx.ts) only when
// they cannot damage the user's template. A write is REFUSED when the cell
//   holds a formula · holds label text (a non-empty string that this layer did not write before: the «ours» list) ·
//   is inside a merge but not its top-left cell · is further than `margin` rows/columns outside the sheet's used area.
// Everything written as text is in capitals (house rule, Sheet.set). The style of the target cell is kept. Dry run reports without changing anything.
// Not wired into the ΗΚΑΙ/ΗΚΑΛ/ΦΡΟΥΡΑ writers: those keep their own, byte-identical output. Coordinates are 0-based.
import { Workbook, colName, type Sheet } from './xlsx';
import { upper } from '../shared/text';

// exact: the text is a word the template's own formulas compare with (COUNTIF criteria): written as it is, not turned into capitals
export interface PlannedWrite { sheet: string; r: number; c: number; value: string | number | null; exact?: boolean }
export type Refusal = 'formula' | 'label' | 'merge-child' | 'outside' | 'no-sheet' | 'bad-value' | 'conflict';
export interface WriteResult { sheet: string; r: number; c: number; ref: string; value: string | number | null }
export interface Refused extends WriteResult { reason: Refusal; detail: string }
export interface WriteReport { dryRun: boolean; written: WriteResult[]; refused: Refused[]; ours: Record<string, string> }
export interface SafeOpts {
  margin?: number;                                  // rows/columns allowed beyond the used area (default 2)
  ours?: Record<string, string>;                    // 'sheet|r:c' -> text this layer wrote before (TplProfile.ours)
  dryRun?: boolean;
  // DATA AREAS (0-based, inclusive): value cells inside them (a list of people the app rewrites) may be replaced even when they hold text and may extend
  // past the used area. Formulas and merge children are still refused; header rows must stay outside the boxes.
  dataBoxes?: { sheet: string; r1: number; c1: number; r2: number; c2: number }[];
}
export const oursKey = (sheet: string, r: number, c: number) => sheet + '|' + r + ':' + c;
const cellText = (ws: Sheet, ref: string): string => {
  const raw = ws.raw(ref); if (!raw) return '';
  // only text cells count as labels: numbers and dates are data
  return raw.t === 's' || raw.t === 'inlineStr' || raw.t === 'str' ? (ws.get(ref) || '').trim() : '';
};

export async function safeWrite(wb: Workbook, plan: PlannedWrite[], o: SafeOpts = {}): Promise<WriteReport> {
  const margin = o.margin ?? 2; const ours = o.ours || {};
  const inBox = (w: PlannedWrite) => !!o.dataBoxes?.some(b => b.sheet === w.sheet && w.r >= b.r1 && w.r <= b.r2 && w.c >= b.c1 && w.c <= b.c2);
  const rep: WriteReport = { dryRun: !!o.dryRun, written: [], refused: [], ours: {} };
  const info = new Map<string, { ws: Sheet; rows: number; cols: number; merges: ReturnType<Sheet['merges']> }>();   // the used area is the one BEFORE the plan
  const planned = new Map<string, string>();       // two writes into one cell: the first wins, the second is a conflict
  for (const w of plan) {
    const ref = Number.isInteger(w.r) && Number.isInteger(w.c) && w.r >= 0 && w.c >= 0 && w.c < 16384 && w.r < 1048576 ? colName(w.c + 1) + (w.r + 1) : '';
    const res: WriteResult = { sheet: w.sheet, r: w.r, c: w.c, ref, value: w.value };
    const no = (reason: Refusal, detail: string) => { rep.refused.push({ ...res, reason, detail }); };
    if (!ref) { no('outside', 'θέση εκτός φύλλου'); continue; }
    if (typeof w.value === 'number' && !Number.isFinite(w.value)) { no('bad-value', 'μη έγκυρος αριθμός'); continue; }
    let si = info.get(w.sheet);
    if (!si) { try { const ws0 = await wb.sheet(w.sheet); si = { ws: ws0, rows: ws0.lastRow(), cols: ws0.lastCol(), merges: ws0.merges() }; info.set(w.sheet, si); } catch { no('no-sheet', 'δεν υπάρχει φύλλο «' + w.sheet + '»'); continue; } }
    const ws = si.ws;
    const k = oursKey(w.sheet, w.r, w.c);
    if (planned.has(k)) { no('conflict', 'δύο εγγραφές στο ίδιο κελί'); continue; }
    const box = inBox(w);
    if (!box && (w.r + 1 > si.rows + margin || w.c + 1 > si.cols + margin)) { no('outside', 'πολύ έξω από την περιοχή του φύλλου'); continue; }
    const m = si.merges.find(x => w.r + 1 >= x.r1 && w.r + 1 <= x.r2 && w.c + 1 >= x.c1 && w.c + 1 <= x.c2);
    if (m && (m.r1 !== w.r + 1 || m.c1 !== w.c + 1)) { no('merge-child', 'μέσα σε συγχώνευση, όχι πάνω αριστερά'); continue; }
    if (ws.hasFormula(ref)) { no('formula', 'το κελί έχει τύπο'); continue; }
    const cur = cellText(ws, ref);
    if (!box && cur && cur !== (ours[k] ?? null)) { no('label', 'το κελί έχει κείμενο που δεν γράφτηκε από την εφαρμογή'); continue; }
    planned.set(k, ref);
    const text = typeof w.value === 'string' ? (w.exact ? w.value.trim() : upper(w.value)) : null;
    if (!o.dryRun) ws.set(ref, w.value, !!w.exact);
    rep.written.push({ ...res, value: text ?? w.value });
    // the cell stays ours while it holds the text we wrote; a number or an empty cell is not remembered
    if (text) rep.ours[k] = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  }
  return rep;
}
// The «ours» list of a profile after a write (merged with what was already there; cleared cells are forgotten)
export function mergeOurs(prev: Record<string, string> | undefined, rep: WriteReport): Record<string, string> {
  const out = { ...(prev || {}), ...rep.ours };
  for (const w of rep.written) if (w.value == null || w.value === '' || typeof w.value === 'number') delete out[oursKey(w.sheet, w.r, w.c)];
  return out;
}
