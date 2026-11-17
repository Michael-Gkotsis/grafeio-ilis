// The shape detector: finds what a sheet contains, whatever the layout. Pure functions over the sheet model.
//   matrix   row labels × column headers of counts (ΗΚΑΙ / ΗΚΑΛ / ΔΚΤΗΣ)
//   list     one row per person (Δυναμολόγιο, Παρουσιολόγιο, ΚΥ 1, weapons...), 1–3 header rows
//   grid     people × days 1..31 (monthly duties), merged multi-day cells are one absence span
//   label    a word followed by its value («Λ/Υ:», «Αυλώνας, 25/09/26», «1. ΕΓΓΡΑΦΕΣ:»)
//   formulas cells that count another sheet (COUNTIF/COUNTIFS/SUMIF…): the data sheet, its columns and the words counted
// Every column/row/label carries a lexicon Match (concept + sure/suggest/unknown). Rule: prefer unknown to a wrong sure.
import { Grid, cellRef, colIndex, colLetter, key, valueText, type SheetModel } from './sheetModel';
import { defaultLexicon, normText, type ConceptKind, type Lexicon, type Match } from './lexicon';

export interface ColInfo { c: number; text: string; leaf: string; parent: string; match: Match; total: boolean; panel: boolean }
export interface RowInfo { r: number; text: string; match: Match; total: boolean }
interface Box { r1: number; r2: number; c1: number; c2: number }
export interface MatrixRegion extends Box {
  type: 'matrix';
  labelCol: number;
  headerRows: [number, number];
  cols: ColInfo[];                 // data columns (c1..c2)
  rows: RowInfo[];                 // data rows (r1..r2): ranks, totals, unknown custom rows
  numberingRow?: number;           // the «1 2 3 …» row of column numbers, if any
  driven?: Driven;                 // the cells are formulas that count another sheet
}
export interface ListRegion extends Box {
  type: 'list';
  headerRows: [number, number];
  cols: ColInfo[];
  count: number;                   // rows with data
  totalRow?: number;               // a «ΣΥΝΟΛΟ» row right after the data
  subkind: 'weapons' | 'people' | 'other';
}
export interface GridRegion extends Box {
  type: 'grid';
  headerRow: number;
  dayCols: [number, number];
  days: number;
  weekdayRow?: number;
  left: ColInfo[];                 // columns before the days (A/A, name, post…)
  right: ColInfo[];                // columns after the days (totals, leave counts)
  spans: { r: number; c1: number; c2: number; text: string }[];   // merged multi-day cells
  people: number;
}
export type Region = MatrixRegion | ListRegion | GridRegion;
export interface LabelCell {
  r: number; c: number; text: string; match: Match;
  value: { r: number; c: number } | null;     // where the value goes
  side: 'right' | 'below' | 'inside' | 'none';
  occupied?: boolean;                         // the value cell already has text
  place?: string;                             // «Αυλώνας, 25/09/26» → Αυλώνας
}
export interface CountCond { col: number; crit: string | null; ref?: string }
export interface DrivenCell { r: number; c: number; fn: string; conds: CountCond[] }
export interface Driven {
  dataSheet: string;
  cells: number;                   // formula cells that count the data sheet
  critCols: { col: number; role: 'rank' | 'status' | 'other'; words: { text: string; match: Match; n: number }[] }[];
  rowCrit: Record<number, string>;       // matrix row → the word counted in its rank column
  colCrit: Record<number, string>;       // matrix column → the word counted in its status column
}
export interface FormulaSource { sheet: string; dataSheet: string; cells: DrivenCell[]; critCols: Driven['critCols'] }
export interface SheetShape {
  name: string; state: SheetModel['state'];
  regions: Region[]; labels: LabelCell[]; formulas: FormulaSource[];
  roles: string[];
}
export interface BookShape { sheets: SheetShape[] }
export interface DetectOpts { lexicon?: Lexicon; scanRows?: number }

const SCAN_ROWS = 400;
const COL_KINDS: ConceptKind[] = ['hkcol', 'status', 'service', 'post', 'total', 'group', 'label'];
const ROW_KINDS: ConceptKind[] = ['hkrow', 'rank', 'group', 'total'];
const FIELD_KINDS: ConceptKind[] = ['person', 'weapon'];
const usable = (m: Match) => m.confidence !== 'unknown';
const isNum = (t: string) => /^[\d\s.,:/+\-–]+$/.test(t);

// ------------------------------------------------------------------ helpers
const dayNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 31 ? v : -1;
  if (v instanceof Date) return v.getUTCDate();
  if (typeof v === 'string') { const m = /^\s*0?(\d{1,2})\s*(?:η|ης|\.)?\s*$/i.exec(v); if (m) { const n = Number(m[1]); return n >= 1 && n <= 31 ? n : -1; } }
  return -1;
};
function textsAt(g: Grid, rows: [number, number], c: number): string[] {
  const out: string[] = [];
  for (let r = rows[0]; r <= rows[1]; r++) { const t = g.textThrough(r, c); if (t && out[out.length - 1] !== t) out.push(t); }
  return out;
}
// a header merged across several columns is ONE column: only its first column counts
function spanTail(g: Grid, rows: [number, number], c: number): boolean {
  for (let r = rows[1]; r >= rows[0]; r--) { const m = g.mergeOf(r, c); if (g.textThrough(r, c)) return !!m && m.c1 < c && m.c2 > m.c1; }
  return false;
}
function colInfo(lex: Lexicon, g: Grid, rows: [number, number], c: number, kinds: ConceptKind[]): ColInfo {
  const parts = textsAt(g, rows, c); const leaf = parts[parts.length - 1] || ''; const parent = parts.length > 1 ? parts[parts.length - 2] : '';
  let m = lex.match(leaf, { kinds });
  if (!usable(m) && parts.length > 1) { const whole = lex.match(parts.join(' '), { kinds }); if (usable(whole) && !/^(group|label):/.test(whole.concept || '')) m = { ...whole, confidence: 'suggest', why: whole.why + ' (με την επικεφαλίδα της ομάδας)' }; }
  // «Σύνολο» under a group: ΔΥΝΑΜΗ → σύνολο δύναμης, ΚΩΛΥΟΜΕΝΟΙ → σύνολο κωλυομένων, ΑΠΟΝΤΕΣ → σύνολο απόντων
  if (parent && /^(total:sum|hkcol:sum)$/.test(m.concept || '')) {
    const pm = lex.match(parent, { kinds: ['group'] });
    const to = pm.concept === 'group:force' ? 'hkcol:sum' : pm.concept === 'group:kol' ? 'hkcol:sumK' : pm.concept === 'group:abs' ? 'hkcol:sumA' : null;
    if (to && pm.confidence === 'sure') m = { ...m, concept: to, confidence: 'sure', why: 'Σύνολο κάτω από «' + parent + '»' };
  }
  // a group name alone (a column under a group header that has no header of its own) is not a countable column
  if (/^group:/.test(m.concept || '')) m = { text: m.text, concept: null, confidence: 'unknown', why: 'επικεφαλίδα ομάδας «' + (m.text || '') + '», όχι στήλη' };
  return { c, text: parts.join(' / '), leaf, parent, match: m, total: /^(total:|hkcol:(sum|sumK|sumA)$)/.test(m.concept || ''), panel: /^label:/.test(m.concept || '') };
}

// ------------------------------------------------------------------ lists
interface Cluster { c1: number; c2: number }
// runs of filled header cells; a single empty column inside does not split a table, two do
function clusters(g: Grid, r: number, nCols: number): Cluster[] {
  const out: Cluster[] = []; let cur: Cluster | null = null; let gap = 0;
  for (let c = 0; c < nCols; c++) {
    const filled = g.textThrough(r, c) !== '';
    if (filled) { if (cur && gap <= 1) cur.c2 = c; else { cur = { c1: c, c2: c }; out.push(cur); } gap = 0; } else gap++;
  }
  return out;
}
const anchorsIn = (g: Grid, r: number, c1: number, c2: number) => { let n = 0; const row = g.sheet.rows[r] || []; for (let c = c1; c <= c2; c++) if (valueText(row[c]) !== '') n++; return n; };
const hasHMerge = (g: Grid, r: number, c1: number, c2: number) => g.sheet.merges.some(m => m.r1 <= r && m.r2 >= r && m.c2 > m.c1 && m.c1 <= c2 && m.c2 >= c1);

function valueProfile(lex: Lexicon, g: Grid, c: number, r1: number, r2: number): Match | null {
  const vals: string[] = []; for (let r = r1; r <= r2 && vals.length < 80; r++) { const t = g.text(r, c); if (t) vals.push(t); }
  if (vals.length < 3) return null;
  const share = (f: (t: string) => boolean) => vals.filter(f).length / vals.length;
  const d = (id: string, why: string): Match => ({ text: '', concept: id, confidence: 'suggest', why });
  if (share(t => /^69\d{8}$/.test(t.replace(/[\s-]/g, '')) || /^\+?30\s?69\d{8}$/.test(t)) >= 0.6) return d('person:phone', 'οι τιμές είναι κινητά τηλέφωνα');
  const nums = vals.map(Number); if (vals.every(t => /^\d+$/.test(t)) && nums.length >= 5 && share((_t) => true) === 1) {
    const inc = nums.slice(1).filter((n, i) => n === nums[i] + 1).length / (nums.length - 1);
    if (inc >= 0.8) return d('person:aa', 'οι τιμές είναι αύξων αριθμός');
  }
  const uniq = new Set(vals); if (uniq.size >= 2) {
    if (share(t => { const m = lex.match(t, { kinds: ['rank'] }); return usable(m); }) >= 0.7) return d('person:rank', 'οι τιμές είναι βαθμοί');
    if (share(t => { const m = lex.match(t, { kinds: ['status'] }); return usable(m); }) >= 0.7) return d('person:status', 'οι τιμές είναι καταστάσεις');
  }
  return null;
}

function findLists(lex: Lexicon, g: Grid, scan: number, skipRows: number[]): ListRegion[] {
  const out: ListRegion[] = []; const nCols = g.nCols; const used: Box[] = []; const used2 = new Set<number>();
  const inUsed = (r: number, c: number) => used.some(b => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2);
  const rowHits = new Map<number, number[]>();
  for (let r = 0; r < Math.min(g.nRows, scan); r++) {
    const row = g.sheet.rows[r]; if (!row) continue; const cs: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const t = valueText(row[c]); if (!t || t.length > 48 || isNum(t)) continue;
      const m = lex.match(t, { kinds: FIELD_KINDS }); if (usable(m)) cs.push(c);
    }
    if (cs.length) rowHits.set(r, cs);
  }
  const rows = [...rowHits.keys()].sort((a, b) => a - b);
  for (const hr of rows) {
    if (skipRows.includes(hr) || skipRows.includes(hr - 1) || skipRows.includes(hr + 1)) continue;
    if ((rowHits.get(hr) || []).length < 2) continue;
    // table clusters in this row; the hits inside each one
    for (const cl of clusters(g, hr, nCols)) {
      if (inUsed(hr, cl.c1)) continue;
      const hits = (rowHits.get(hr) || []).filter(c => c >= cl.c1 && c <= cl.c2);
      const sure = hits.filter(c => lex.match(g.text(hr, c), { kinds: FIELD_KINDS }).confidence === 'sure').length;
      if (hits.length < 3 && !(hits.length >= 2 && sure >= 2)) continue;
      // header rows: this one, maybe the rows above it (group headers with merges) and below (vertical merges)
      let top = hr, bottom = hr;
      for (let k = 0; k < 2 && top > 0; k++) {
        const above = top - 1; let filled = 0; for (let c = cl.c1; c <= cl.c2; c++) if (g.textThrough(above, c) !== '') filled++;
        if (filled >= 1 && hasHMerge(g, above, cl.c1, cl.c2) && anchorsIn(g, above, cl.c1, cl.c2) >= 2 && !(rowHits.get(above) || []).some(c => c >= cl.c1 && c <= cl.c2 && (rowHits.get(above) || []).length >= 3)) top = above; else break;
      }
      for (const m of g.sheet.merges) if (m.r1 >= top && m.r1 <= hr && m.c1 >= cl.c1 && m.c1 <= cl.c2 && m.r2 > bottom && m.r2 <= hr + 2) bottom = Math.max(bottom, m.r2);
      // vertical merges that start above and reach beyond hr widen the band downward too (checked above); and a merged group in hr with sub-headers below
      if (bottom === hr) {
        const grp = g.sheet.merges.some(m => m.r1 === hr && m.r2 === hr && m.c2 > m.c1 && m.c1 >= cl.c1 && m.c2 <= cl.c2 && !usable(lex.match(g.text(hr, m.c1), { kinds: FIELD_KINDS })));
        if (grp) { let sub = 0; for (let c = cl.c1; c <= cl.c2; c++) { const t = g.text(hr + 1, c); if (t && !isNum(t) && usable(lex.match(t, { kinds: FIELD_KINDS }))) sub++; } if (sub >= 2) bottom = hr + 1; }
      }
      const hdr: [number, number] = [top, bottom];
      // data rows
      let r = bottom + 1; let first = -1, last = -1, gap = 0, count = 0;
      // a numbering row («1 2 3 …») or a row of «Στήλη1» hints right under the header is not data
      const rowNums = (rr: number) => { let n = 0, t = 0; for (let c = cl.c1; c <= cl.c2; c++) { const x = g.text(rr, c); if (!x) continue; t++; if (/^\d{1,2}$/.test(x)) n++; } return t >= 3 && n === t; };
      if (rowNums(r) && g.sheet.rows[r]?.every(v => typeof v !== 'string' || !v)) r++;
      for (; r < g.nRows; r++) {
        const nonEmpty = (() => { let n = 0; for (let c = cl.c1; c <= cl.c2; c++) if (g.text(r, c) !== '' || g.isFormula(r, c)) n++; return n; })();
        // another header of the same kind starts here
        if (nonEmpty >= 3 && (rowHits.get(r) || []).filter(c => c >= cl.c1 && c <= cl.c2).length >= 3) break;
        if (nonEmpty >= 2) { if (first < 0) first = r; last = r; gap = 0; count++; } else { gap++; if (gap >= 3) break; }
      }
      if (first < 0) { first = bottom + 1; last = bottom; }
      // the row after the data may be a total
      let totalRow: number | undefined;
      for (let rr = last + 1; rr <= last + 2 && rr < g.nRows; rr++) { for (let c = cl.c1; c <= cl.c2; c++) { const t = g.text(rr, c); if (t && /^(total:)/.test(lex.match(t, { kinds: ['total'] }).concept || '')) totalRow = rr; } if (totalRow != null) break; }
      // data columns next to the table that have no header of their own (a list of service names left of «ΒΑΘΜΟΣ»)
      if (first <= last) for (const dc of [-1, -2, cl.c2 + 1 - cl.c1]) {
        const c = dc < 0 ? cl.c1 + dc : cl.c1 + dc; if (c < 0 || c >= nCols) continue;
        if (c >= cl.c1 && c <= cl.c2) continue;
        if (g.textThrough(hdr[0], c) !== '' || (c < cl.c1 && c !== cl.c1 - 1 && !used2.has(cl.c1 - 1))) continue;
        let n = 0; for (let rr = first; rr <= last; rr++) if (g.text(rr, c)) n++;
        if (n >= Math.max(3, count * 0.5)) { if (c < cl.c1) { cl.c1 = c; used2.add(c); } else cl.c2 = c; }
      }
      const cols: ColInfo[] = [];
      for (let c = cl.c1; c <= cl.c2; c++) {
        if (spanTail(g, hdr, c)) continue;
        const ci = colInfo(lex, g, hdr, c, [...FIELD_KINDS, 'status']);
        if (!usable(ci.match) && first <= last) { const vp = valueProfile(lex, g, c, first, last); if (vp) ci.match = { ...vp, text: ci.leaf }; }
        cols.push(ci);
      }
      if (cols.filter(x => usable(x.match) && /^(person|weapon):/.test(x.match.concept || '')).length < 3) continue;
      const names = cols.map(x => x.match.concept);
      const subkind: ListRegion['subkind'] = names.some(n => /^weapon:/.test(n || '')) ? 'weapons' : names.some(n => n === 'person:name' || n === 'person:last') ? 'people' : 'other';
      const reg: ListRegion = { type: 'list', r1: first, r2: last, c1: cl.c1, c2: cl.c2, headerRows: hdr, cols, count, subkind, ...(totalRow != null ? { totalRow } : {}) };
      out.push(reg); used.push({ r1: top, r2: Math.max(last, totalRow ?? last), c1: cl.c1, c2: cl.c2 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ matrices
function findMatrices(lex: Lexicon, g: Grid, scan: number, lists: ListRegion[]): MatrixRegion[] {
  const out: MatrixRegion[] = [];
  const inList = (r: number, c: number) => lists.some(l => r >= l.headerRows[0] && r <= l.r2 && c >= l.c1 && c <= l.c2);
  const taken: Box[] = [];
  for (let c = 0; c < Math.min(g.nCols, 14); c++) {
    // hits of this column: row labels
    const lab: { r: number; m: Match }[] = [];
    for (let r = 0; r < Math.min(g.nRows, scan); r++) {
      if (inList(r, c)) continue;
      const t = g.text(r, c); if (!t || t.length > 40 || isNum(t)) continue;
      const m = lex.match(t, { kinds: ROW_KINDS }); lab.push({ r, m });
    }
    const hits = lab.filter(x => usable(x.m) && !/^total:/.test(x.m.concept || ''));
    if (hits.length < 3) continue;
    // runs of rows: consecutive rows with a label (hit, total or unknown label) inside, starting at a hit
    let i = 0;
    while (i < hits.length) {
      const i0 = i; const startRow = hits[i].r; let endRow = startRow; let nh = 1; let j = i + 1;
      // extend while rows are contiguous (no empty label row)
      for (let r = startRow + 1; r < g.nRows; r++) {
        const t = g.textThrough(r, c);
        if (!t) break;
        const x = lab.find(y => y.r === r);
        if (x && usable(x.m)) { endRow = r; if (!/^total:/.test(x.m.concept || '')) { nh++; if (j < hits.length && hits[j].r === r) j++; } } else if (r - endRow <= 1 && /^[\p{L}]/u.test(t) && t.length <= 40 && hasNumbersOrFormula(g, r, c)) endRow = r; else break;
      }
      i = Math.max(j, i + 1);
      const distinct = new Set(hits.filter(h => h.r >= startRow && h.r <= endRow).map(h => h.m.concept)).size;
      if (nh < 3 || distinct < 3 || distinct < nh * 0.7 || endRow - startRow > 80) continue;
      if (taken.some(b => startRow >= b.r1 && startRow <= b.r2 && c >= b.c1 && c <= b.c2)) continue;
      // header band: rows above with ≥2 filled cells right of the label column (one sparse row between is allowed: «ΒΑΘΜΟΙ» rows)
      let top = startRow; let numbering: number | undefined; let lastDense = -1; let sparse = 0;
      for (let r = startRow - 1; r >= 0 && startRow - r <= 9; r--) {
        let n = 0; let ints = 0; for (let cc = c + 1; cc < g.nCols; cc++) { const t = g.textThrough(r, cc); if (t) { n++; if (/^\d{1,3}$/.test(t)) ints++; } }
        if (n < 2) { sparse++; if (sparse > 1) break; continue; }
        sparse = 0; if (lastDense < 0) lastDense = r; top = r;
        if (ints === n && n >= 5) numbering = r;
      }
      // a «ΒΑΘΜΟΙ» header cell is itself a hit: the table starts at the next hit
      if (lastDense < 0) { if (/^group:/.test(hits[i0].m.concept || '')) i = i0 + 1; continue; }
      const band: [number, number] = [top, startRow - 1];
      // the number row sits at the bottom of the band: texts come from the rows above it
      const textBand: [number, number] = numbering != null && numbering === lastDense ? [band[0], lastDense - 1] : [band[0], lastDense];
      if (textBand[1] < textBand[0]) continue;
      // data columns: filled in the band, up to the last filled (a single empty column inside is allowed)
      let cEnd = c; let gapc = 0;
      for (let cc = c + 1; cc < g.nCols; cc++) { let f = false; for (let r = band[0]; r <= band[1]; r++) if (g.textThrough(r, cc) !== '') { f = true; break; } if (f) { cEnd = cc; gapc = 0; } else { gapc++; if (gapc > 1) break; } }
      const cols: ColInfo[] = []; for (let cc = c + 1; cc <= cEnd; cc++) if (!spanTail(g, textBand, cc)) cols.push(colInfo(lex, g, textBand, cc, COL_KINDS));
      // «Σύνολο» right after Τοποθετημένοι/Προσκολλημένοι is the force total
      cols.forEach((x, k) => { if (x.match.concept === 'hkcol:sum' && x.match.confidence !== 'sure' && k >= 2 && cols[k - 1].match.concept === 'hkcol:attached' && cols[k - 2].match.concept === 'hkcol:placed') x.match = { ...x.match, confidence: 'sure', why: 'Σύνολο μετά από Τοποθετημένοι και Προσκολλημένοι' }; });
      const rowsInfo: RowInfo[] = []; for (let r = startRow; r <= endRow; r++) { const t = g.textThrough(r, c); const m = lex.match(t, { kinds: ROW_KINDS }); rowsInfo.push({ r, text: t, match: m, total: /^total:/.test(m.concept || '') }); }
      if (cols.length < 4) continue;   // a lookup list of rank words next to a table is not a matrix
      const reg: MatrixRegion = { type: 'matrix', r1: startRow, r2: endRow, c1: c + 1, c2: cEnd, labelCol: c, headerRows: band, cols, rows: rowsInfo, ...(numbering != null ? { numberingRow: numbering } : {}) };
      out.push(reg); taken.push({ r1: top, r2: endRow, c1: c, c2: cEnd });
    }
  }
  return out;
}
function hasNumbersOrFormula(g: Grid, r: number, c: number): boolean {
  for (let cc = c + 1; cc < Math.min(g.nCols, c + 30); cc++) { const v = g.value(r, cc); if (typeof v === 'number' || g.isFormula(r, cc)) return true; }
  return false;
}

// ------------------------------------------------------------------ day grids
function findGrids(lex: Lexicon, g: Grid, scan: number, blocked: (r: number) => boolean): GridRegion[] {
  const out: GridRegion[] = [];
  for (let r = 0; r < Math.min(g.nRows, scan); r++) {
    if (blocked(r)) continue;
    const row = g.sheet.rows[r]; if (!row) continue;
    // longest run 1,2,3… in adjacent columns
    let best: { c1: number; n: number } | null = null;
    for (let c = 0; c < row.length; c++) {
      if (dayNum(row[c]) !== 1) continue;
      let n = 1; while (dayNum(row[c + n]) === n + 1) n++;
      if (n >= 28 && (!best || n > best.n)) best = { c1: c, n };
    }
    if (!best) continue;
    const c1 = best.c1, c2 = best.c1 + best.n - 1;
    // weekday letters above or below
    let weekdayRow: number | undefined;
    for (const rr of [r - 1, r + 1]) { if (rr < 0) continue; let n = 0; for (let c = c1; c <= c2; c++) if (/^\p{L}{1,3}$/u.test(g.text(rr, c))) n++; if (n >= best.n * 0.6) weekdayRow = rr; }
    // header texts left and right of the days
    const hdrRows: [number, number] = [r, r];
    const left: ColInfo[] = []; for (let c = 0; c < c1; c++) if (textsAt(g, hdrRows, c).length) left.push(colInfo(lex, g, hdrRows, c, [...FIELD_KINDS, 'status']));
    const right: ColInfo[] = []; for (let c = c2 + 1; c < Math.min(g.nCols, c2 + 12); c++) if (g.text(r, c)) right.push(colInfo(lex, g, hdrRows, c, [...COL_KINDS, 'person']));
    // people rows
    let first = r + (weekdayRow === r + 1 ? 2 : 1); let last = first - 1; let gap = 0; let people = 0;
    for (let rr = first; rr < g.nRows; rr++) {
      let n = 0; for (let c = 0; c < c1; c++) if (g.text(rr, c)) n++;
      let d = 0; for (let c = c1; c <= c2; c++) if (g.text(rr, c)) d++;
      if (n >= 1 || d >= 1) { last = rr; gap = 0; if (n >= 1) people++; } else { gap++; if (gap >= 3) break; }
    }
    const spans = g.sheet.merges.filter(m => m.r1 === m.r2 && m.r1 >= first && m.r1 <= last && m.c2 > m.c1 && m.c1 >= c1 && m.c2 <= c2).map(m => ({ r: m.r1, c1: m.c1, c2: m.c2, text: g.text(m.r1, m.c1) }));
    out.push({ type: 'grid', r1: first, r2: last, c1: 0, c2: right.length ? right[right.length - 1].c : c2, headerRow: r, dayCols: [c1, c2], days: best.n, ...(weekdayRow != null ? { weekdayRow } : {}), left, right, spans, people });
    r = Math.max(r, first);
  }
  return out;
}

// ------------------------------------------------------------------ labels with values
const PLACE_DATE = /^([^\d,:]{2,40}),\s*(\d{1,2})\s*[/.\-\s]\s*(\d{1,2}|\p{L}{3,9})\s*[/.\-\s]\s*(\d{2,4})\s*$/u;
const DATE_AT_END = /\d{1,2}\s*[/.]\s*\d{1,2}(\s*[/.]\s*\d{2,4})?\s*$/;
function findLabels(lex: Lexicon, g: Grid, scan: number, covered: (r: number, c: number) => boolean): LabelCell[] {
  const out: LabelCell[] = [];
  const freeAt = (r: number, c: number) => { if (r < 0 || c < 0) return false; const m = g.mergeOf(r, c); const ar = m ? m.r1 : r, ac = m ? m.c1 : c; return g.text(ar, ac) === '' && !g.isFormula(ar, ac); };
  for (let r = 0; r < Math.min(g.nRows, scan); r++) {
    const row = g.sheet.rows[r]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const t = valueText(row[c]); if (!t || t.length > 90 || covered(r, c)) continue;
      const mg = g.mergeAt(r, c); const r2 = mg ? mg.r2 : r, c2 = mg ? mg.c2 : c;
      const place = PLACE_DATE.exec(t);
      if (place) { out.push({ r, c, text: t, match: { text: t, concept: 'label:placeDate', confidence: 'sure', why: 'τόπος και ημερομηνία' }, value: { r, c }, side: 'inside', place: place[1].trim() }); continue; }
      const colon = /:\s*$/.test(t); const embedded = /^([^:()\d]{2,30}):\s*(\S.*)$/.exec(t); const shortLabel = !/\(/.test(t.split(':')[0]) && t.split(':')[0].trim().split(/\s+/).length <= 4;
      const base = t.replace(/^\s*\d{1,2}\s*[.)]\s*/, '').replace(/:\s*$/, '').replace(/:.*$/, '').trim();
      if ((!colon && !embedded) || !shortLabel) {
        // a known label word followed by a date inside the same cell («ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ … ΤΗΣ 24/09/26»)
        if (DATE_AT_END.test(t) && /\p{L}{3}/u.test(t)) {
          const lab = t.replace(DATE_AT_END, '').replace(/\s+ΤΗΣ\s*$/i, '').replace(/\s+\S*\d\S*(\s+|$)/g, ' ').trim();
          const m = lex.match(lab, { kinds: ['label'] });
          if (usable(m)) out.push({ r, c, text: t, match: m, value: { r, c }, side: 'inside' });
        }
        continue;
      }
      const m = lex.match(base, { kinds: ['label'] });
      if (embedded && !colon) { out.push({ r, c, text: t, match: m, value: { r, c }, side: 'inside' }); continue; }
      // the value goes to the right of the label (after its merge); if that cell has text, below it
      let value: LabelCell['value'] = null; let side: LabelCell['side'] = 'none';
      if (freeAt(r, c2 + 1) && c2 + 1 < Math.max(g.nCols, c2 + 2)) { const mm = g.mergeOf(r, c2 + 1); value = { r: mm ? mm.r1 : r, c: mm ? mm.c1 : c2 + 1 }; side = 'right'; }
      else if (r2 + 1 < Math.max(g.nRows, r2 + 2)) { const mm = g.mergeOf(r2 + 1, c); value = { r: mm ? mm.r1 : r2 + 1, c: mm ? mm.c1 : c }; side = 'below'; }
      out.push({ r, c, text: t, match: m, value, side, ...(side === 'below' && !freeAt(r2 + 1, c) ? { occupied: true } : {}) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ formulas that count another sheet
interface Call { fn: string; args: string[] }
function splitArgs(s: string): string[] {
  const out: string[] = []; let depth = 0, q = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q) { if (ch === '(') depth++; else if (ch === ')') depth--; else if ((ch === ',' || ch === ';') && depth === 0) { out.push(cur.trim()); cur = ''; continue; } }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
export function parseCalls(f: string): Call[] {
  const out: Call[] = []; const re = /\b(COUNTIFS|COUNTIF|SUMIFS|SUMIF|SUMPRODUCT|SUM|COUNTA|COUNT)\s*\(/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(f))) {
    let depth = 1, q = false, i = m.index + m[0].length; const start = i;
    for (; i < f.length && depth > 0; i++) { const ch = f[i]; if (ch === '"') q = !q; else if (!q) { if (ch === '(') depth++; else if (ch === ')') depth--; } }
    out.push({ fn: m[1].toUpperCase(), args: splitArgs(f.slice(start, i - 1)) });
  }
  return out;
}
const REF = /^(?:(?:'((?:[^']|'')+)'|([^'!:]+))!)?\$?([A-Z]{1,3})(?:\$?(\d+))?(?::\$?([A-Z]{1,3})(?:\$?(\d+))?)?$/;
export function parseRef(s: string): { sheet: string | null; col: number; col2: number } | null {
  const m = REF.exec(s.trim()); if (!m) return null;
  return { sheet: m[1] ? m[1].replace(/''/g, "'") : (m[2] || null), col: colIndex(m[3]), col2: m[5] ? colIndex(m[5]) : colIndex(m[3]) };
}
function findFormulas(lex: Lexicon, g: Grid): FormulaSource[] {
  const per = new Map<string, DrivenCell[]>();
  for (const [k, f] of g.sheet.formulas) {
    if (!/(COUNTIFS?|SUMIFS?)\s*\(/i.test(f)) continue;
    const [r, c] = k.split(':').map(Number);
    for (const call of parseCalls(f)) {
      if (!/^(COUNTIFS?|SUMIFS?)$/.test(call.fn)) continue;
      const conds: CountCond[] = [];
      const a = call.args; const step = call.fn.endsWith('S') ? [call.fn === 'SUMIFS' ? 1 : 0, 2] : [0, 2];
      let dataSheet: string | null = null;
      if (call.fn === 'COUNTIF' || call.fn === 'SUMIF') { const ref = parseRef(a[0] || ''); if (ref?.sheet) dataSheet = ref.sheet; if (ref) conds.push({ col: ref.col, crit: a[1] ? critText(a[1]) : null, ...(a[1] && !/^"/.test(a[1]) ? { ref: a[1] } : {}) }); }
      else for (let i = step[0]; i + 1 < a.length; i += 2) { const ref = parseRef(a[i]); if (!ref) continue; if (ref.sheet && !dataSheet) dataSheet = ref.sheet; conds.push({ col: ref.col, crit: critText(a[i + 1]), ...(!/^"/.test(a[i + 1]) ? { ref: a[i + 1] } : {}) }); }
      if (!dataSheet || dataSheet === g.sheet.name || !conds.length) continue;
      const arr = per.get(dataSheet) || []; arr.push({ r, c, fn: call.fn, conds }); per.set(dataSheet, arr);
    }
  }
  const out: FormulaSource[] = [];
  for (const [dataSheet, cells] of per) {
    const byCol = new Map<number, Map<string, number>>();
    for (const cell of cells) for (const cd of cell.conds) { if (cd.crit == null) continue; const mm = byCol.get(cd.col) || new Map<string, number>(); mm.set(cd.crit, (mm.get(cd.crit) || 0) + 1); byCol.set(cd.col, mm); }
    const critCols: Driven['critCols'] = [...byCol.entries()].map(([col, words]) => {
      const ws = [...words.entries()].map(([text, n]) => ({ text, n, match: lex.match(text, { kinds: ['rank', 'status', 'hkrow', 'hkcol', 'service', 'post'] }) }));
      const ranks = ws.filter(w => /^(rank|hkrow):/.test(w.match.concept || '') && usable(w.match)).length; const st = ws.filter(w => /^(status|hkcol|service):/.test(w.match.concept || '') && usable(w.match)).length;
      const role: 'rank' | 'status' | 'other' = ranks >= Math.max(2, ws.length * 0.5) ? 'rank' : st >= Math.max(2, ws.length * 0.5) ? 'status' : 'other';
      return { col, role, words: ws };
    }).sort((a, b) => a.col - b.col);
    out.push({ sheet: g.sheet.name, dataSheet, cells, critCols });
  }
  return out;
}
const critText = (s: string): string | null => { const m = /^"((?:[^"]|"")*)"$/.exec(s.trim()); return m ? m[1].replace(/""/g, '"') : null; };

// ------------------------------------------------------------------ one sheet / the book
export function detectSheet(sheet: SheetModel, o: DetectOpts = {}): SheetShape {
  const lex = o.lexicon || defaultLexicon(); const scan = o.scanRows ?? SCAN_ROWS; const g = new Grid(sheet);
  // days 1..31 in a header row make a day grid (checked first: its left columns would look like a list); the «1 2 3…» numbering
  // row of a ΗΚΑΙ is not one, and a matrix wins over a grid that would use its header
  const grids0 = findGrids(lex, g, scan, () => false);
  const lists0 = findLists(lex, g, scan, grids0.map(x => x.headerRow));
  // a table whose first column holds ≥4 different ΗΚΑΙ rank rows is a matrix even when its header words made a list;
  // a weaker matrix that overlaps a list gives way to the list (a roster's rank column is not a matrix)
  const touch = (m: MatrixRegion, l: ListRegion) => m.headerRows[0] <= l.r2 && l.headerRows[0] <= m.r2 && m.labelCol <= l.c2 && l.c1 <= m.c2;
  const peopleCols = (l: ListRegion) => l.cols.filter(c => c.match.confidence === 'sure' && /^person:(aa|name|last|first|father)$/.test(c.match.concept || '')).length;
  const wins = (m: MatrixRegion, l: ListRegion) => touch(m, l) && m.labelCol === l.c1 && peopleCols(l) === 0
    && new Set(m.rows.filter(x => /^hkrow:/.test(x.match.concept || '') && x.match.confidence !== 'unknown').map(x => x.match.concept)).size >= 4;
  const matrices = findMatrices(lex, g, scan, []).filter(m => !lists0.some(l => touch(m, l) && !wins(m, l)));
  const lists = lists0.filter(l => !matrices.some(m => wins(m, l)));
  const grids = grids0.filter(x => !matrices.some(m => x.headerRow >= m.headerRows[0] && x.headerRow <= m.headerRows[1]) && !lists.some(l => x.headerRow >= l.headerRows[0] && x.headerRow <= l.r2));
  const regions: Region[] = [...lists, ...matrices, ...grids].sort((a, b) => (a.type === 'list' ? a.headerRows[0] : a.type === 'matrix' ? a.headerRows[0] : a.headerRow) - (b.type === 'list' ? b.headerRows[0] : b.type === 'matrix' ? b.headerRows[0] : b.headerRow));
  const covered = (r: number, c: number) => regions.some(x => (x.type === 'list' ? r >= x.headerRows[0] && r <= x.r2 : x.type === 'matrix' ? r >= x.headerRows[0] && r <= x.r2 : r >= x.headerRow - 1 && r <= x.r2) && c >= (x.type === 'matrix' ? x.labelCol : x.c1) && c <= x.c2);
  // the same concept SURE in two columns of one table (a repeated header) is ambiguous: only the first stays sure
  for (const x of regions) for (const cs of x.type === 'grid' ? [x.left, x.right] : [x.cols]) {
    const seen = new Set<string>();
    for (const c of cs) { const k = c.match.concept; if (!k || c.match.confidence !== 'sure' || /^total:/.test(k)) continue; if (seen.has(k)) c.match = { ...c.match, confidence: 'suggest', why: 'ίδια στήλη δύο φορές' }; else seen.add(k); }
  }
  const labels = findLabels(lex, g, scan, covered);
  const formulas = findFormulas(lex, g);
  // matrices whose cells are counts of another sheet
  for (const m of regions) if (m.type === 'matrix') {
    for (const f of formulas) {
      const inside = f.cells.filter(x => x.r >= m.r1 && x.r <= m.r2 && x.c >= m.c1 && x.c <= m.c2);
      const area = (m.r2 - m.r1 + 1) * (m.c2 - m.c1 + 1);
      if (inside.length < Math.max(3, area * 0.15)) continue;
      const rowCrit: Record<number, string> = {}, colCrit: Record<number, string> = {};
      const rankCol = f.critCols.find(x => x.role === 'rank')?.col, statusCol = f.critCols.find(x => x.role === 'status')?.col;
      const votes = (k: 'r' | 'c', col: number | undefined, into: Record<number, string>) => {
        if (col == null) return; const acc = new Map<number, Map<string, number>>();
        for (const x of inside) { const cd = x.conds.find(y => y.col === col && y.crit != null); if (!cd) continue; const idx = k === 'r' ? x.r : x.c; const mm = acc.get(idx) || new Map(); mm.set(cd.crit!, (mm.get(cd.crit!) || 0) + 1); acc.set(idx, mm); }
        for (const [idx, mm] of acc) into[idx] = [...mm.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };
      votes('r', rankCol, rowCrit); votes('c', statusCol, colCrit);
      m.driven = { dataSheet: f.dataSheet, cells: inside.length, critCols: f.critCols, rowCrit, colCrit };
      break;
    }
  }
  const roles: string[] = [];
  for (const x of regions) {
    if (x.type === 'matrix') roles.push('matrix' + (x.rows.filter(r => /^hkrow:/.test(r.match.concept || '')).length >= 3 ? ':hk' : '') + (x.driven ? ':driven' : ''));
    else if (x.type === 'list') roles.push('list:' + x.subkind);
    else roles.push('grid');
  }
  return { name: sheet.name, state: sheet.state, regions, labels, formulas, roles };
}
export function detectBook(book: { sheets: SheetModel[] }, o: DetectOpts = {}): BookShape {
  return { sheets: book.sheets.map(s => detectSheet(s, o)) };
}

const cf = (m: Match) => (m.confidence === 'unknown' ? '-' : (m.confidence === 'sure' ? 'SURE ' : 'suggest ') + m.concept);
// short text for people (logs, the real-file test)
export function describeShape(s: SheetShape): string {
  const lines: string[] = [(s.state !== 'visible' ? '[' + s.state + '] ' : '') + '«' + s.name + '»: ' + (s.roles.join(', ') || 'τίποτα')];
  for (const x of s.regions) {
    if (x.type === 'matrix') lines.push('  matrix ' + cellRef(x.r1, x.labelCol) + ':' + cellRef(x.r2, x.c2) + ' rows=' + x.rows.length + ' cols=' + x.cols.length + (x.driven ? ' ← ' + x.driven.dataSheet : '')
      + '\n    cols: ' + x.cols.map(c => colLetter(c.c) + ':' + (c.leaf || '·') + '→' + cf(c.match)).join(' | ')
      + '\n    rows: ' + x.rows.map(r => r.text + '→' + cf(r.match)).join(' | '));
    else if (x.type === 'list') lines.push('  list ' + cellRef(x.headerRows[0], x.c1) + ':' + cellRef(x.r2, x.c2) + ' rows=' + x.count + ' ' + x.subkind + '\n    cols: ' + x.cols.map(c => colLetter(c.c) + ':' + (c.leaf || '·') + '→' + cf(c.match)).join(' | '));
    else lines.push('  grid header row ' + (x.headerRow + 1) + ' days ' + colLetter(x.dayCols[0]) + '-' + colLetter(x.dayCols[1]) + ' people=' + x.people + ' spans=' + x.spans.length + '\n    left: ' + x.left.map(c => c.leaf + '→' + cf(c.match)).join(' | ') + '\n    right: ' + x.right.map(c => c.leaf + '→' + cf(c.match)).join(' | '));
  }
  for (const l of s.labels.slice(0, 30)) lines.push('  label ' + cellRef(l.r, l.c) + ' «' + l.text.slice(0, 40) + '» ' + l.match.confidence + ' ' + (l.match.concept || '?') + ' value ' + (l.value ? cellRef(l.value.r, l.value.c) : '-') + ' (' + l.side + ')');
  for (const f of s.formulas) lines.push('  counts «' + f.dataSheet + '» in ' + f.cells.length + ' cells; ' + f.critCols.map(c => colLetter(c.col) + ' ' + c.role + ' [' + c.words.slice(0, 6).map(w => w.text).join(', ') + ']').join(' ; '));
  return lines.join('\n');
}
void key; void normText;
