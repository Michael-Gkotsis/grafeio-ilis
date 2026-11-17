// Mock files for the template engine (Lexicon + shape detector), each with GROUND TRUTH: which column/row/cell means what.
// Randomised by seed: shifted/reordered columns and rows, spacers, tables anywhere, 1–3 header rows with merges, renamed/extra/hidden
// sheets, formulas vs values vs formulas-turned-into-numbers, data-validation lists, synonyms/abbreviations/typos/accents/case/Latin
// look-alikes in the labels, missing and duplicate headers, unknown extra columns. Plus structure-faithful SYNTHETIC replicas of the
// seven real unit files (same headers, layout, formulas; fake names, no unit identifiers). The truth is checked by test/shape-accuracy.test.ts.
import ExcelJS from 'exceljs';
import type { SheetModel } from '../src/shared/sheetModel';
import { rng, int, pick, chance, shuffle, col as colName, type Rnd } from './tplgen';
import { genHkState, DAYS } from './hk-gen';
import { activePeople, hkaiCounts, hkRankOf } from '../src/shared/rules';
import { hkRowName } from '../src/shared/unit';
import { phraseKey } from '../src/shared/lexicon';
import type { AppState } from '../src/shared/domain';
import type { ISODate } from '../src/shared/dates';
import type { TplProfile } from '../src/shared/tplStore';

export type MockKind = 'hkai' | 'hkal' | 'hkal-countifs' | 'duty-grid' | 'service-list' | 'roster' | 'weapons'
  | 'real-hkai-2509' | 'real-hkai-own-cols' | 'real-hkal-countifs' | 'real-ypiresies' | 'real-ypiresies-kath' | 'real-dynamologio' | 'real-oplismos';
export const KINDS: MockKind[] = ['hkai', 'hkal', 'hkal-countifs', 'duty-grid', 'service-list', 'roster', 'weapons'];
export const REAL_KINDS: MockKind[] = ['real-hkai-2509', 'real-hkai-own-cols', 'real-hkal-countifs', 'real-ypiresies', 'real-ypiresies-kath', 'real-dynamologio', 'real-oplismos'];

// ------------------------------------------------------------------ truth
type Cn = string | string[] | null;
export interface Item {
  shape: 'matrix' | 'list' | 'grid' | 'label' | 'formula';
  what: 'col' | 'row' | 'span' | 'geom' | 'label' | 'labelConcept' | 'driven';
  sheet: string;
  r?: number; c?: number;
  concept?: Cn;                       // expected concept(s); null = a column the lexicon cannot know (must not come out SURE)
  maxLevel?: 'sure' | 'suggest';      // 'suggest': ambiguous by nature, a SURE answer is a mistake
  geom?: string; value?: number | string | { r: number; c: number };
  ref?: { r: number; c: number };     // a cell inside the table the item belongs to
  c2?: number;
}
export interface Mock { kind: MockKind; seed: number; buf: Buffer; items: Item[]; desc: string[] }

// ------------------------------------------------------------------ sheet helper (0-based)
class S {
  constructor(readonly ws: ExcelJS.Worksheet) {}
  put(r: number, c: number, v: string | number | null, f?: { f?: string; b?: boolean; box?: boolean }) {
    const x = this.ws.getCell(r + 1, c + 1);
    x.value = f?.f ? { formula: f.f, result: typeof v === 'number' ? v : undefined } as ExcelJS.CellFormulaValue : v;
    x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (f?.b) x.font = { bold: true };
    if (f?.box) x.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    return this;
  }
  merge(r1: number, c1: number, r2: number, c2: number) { if (r2 > r1 || c2 > c1) this.ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1); return this; }
  list(r1: number, c1: number, r2: number, c2: number, formula: string) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.ws.getCell(r + 1, c + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [formula] };
  }
}
const ref = (r: number, c: number) => colName(c + 1) + (r + 1);

// ------------------------------------------------------------------ spelling variants
const GR = 'ΑΒΕΗΙΚΜΝΟΡΤΧΥ', LAT = 'ABEHIKMNOPTXY';
const NOACC = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export function spell(r: Rnd, s: string, o: { typo?: boolean; plain?: boolean } = {}): string {
  if (o.plain) return s;
  let t = s; const m = r();
  if (m < 0.35) t = s; else if (m < 0.5) t = s.toUpperCase(); else if (m < 0.6) t = s.toLowerCase(); else if (m < 0.75) t = NOACC(s); else if (m < 0.85) t = NOACC(s).toUpperCase();
  else if (m < 0.92) { t = s.toUpperCase().split('').map(ch => (GR.includes(ch) && chance(r, 0.3) ? LAT[GR.indexOf(ch)] : ch)).join(''); }
  else if (m < 0.96) t = ' ' + s.replace(' ', '  ') + (chance(r, 0.5) ? ' ' : '.');
  else t = s.replace(/\s+/g, ' ');
  if (o.typo && chance(r, 0.5) && t.length >= 9) { const i = int(r, 2, t.length - 3); const before = t; t = chance(r, 0.5) ? t.slice(0, i) + t.slice(i + 1) : t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2); if (/^μαγειρα[ςσ]?$/i.test(NOACC(t.trim()))) t = before; /* a real other word (a cook), not a typo */ }
  return t;
}

// ------------------------------------------------------------------ ΗΚΑΙ / ΗΚΑΛ
// header pools per column (the first is the plain name; later ones are real-world variants; the last may be unseen by the lexicon)
interface ColDef { key: string; names: string[]; group: 'force' | 'kol' | 'abs' | null; bare?: boolean }
const HKC: ColDef[] = [
  { key: 'prov', names: ['Προβλέπονται από τη σύνθεση', 'Προβλεπόμενοι στη Σύνθεση'], group: null },
  { key: 'placed', names: ['Τοποθετημένοι', 'ΤΟΠΟΘΕΤΗΜΕΝΟΙ'], group: 'force' },
  { key: 'attached', names: ['Προσκολλημένοι', 'Προσκολημένοι', 'ΠΡΟΣΚΟΛΛΗΜΕΝΟΙ'], group: 'force' },
  { key: 'sum', names: ['Σύνολο'], group: 'force', bare: true },
  { key: 'yp', names: ['Υπηρεσία εντός στρατοπέδου', 'Υπηρεσία εντός'], group: 'kol' },
  { key: 'ey', names: ['Ελεύθεροι υπηρεσίας', 'Ελεύθεροι Υπηρ.'], group: 'kol' },
  { key: 'tim', names: ['Τιμωρημένοι', 'ΤΙΜΩΡΗΜΕΝΟΙ'], group: 'kol' },
  { key: 'os', names: ['Ο/Σ', 'Ο-Σ'], group: 'kol' },
  { key: 'mag', names: ['ΜΑΓΕΙΡΙΑ', 'Μαγειρεία'], group: 'kol' },
  { key: 'sid', names: ['ΣΙΔΗΡΟΥΡΓΕΙΟ', 'Σιδηρουργείο'], group: 'kol' },
  { key: 'kin', names: ['Σε κίνηση', 'ΣΕ ΚΙΝΗΣΗ'], group: 'kol' },
  { key: 'sumK', names: ['Σύνολο κωλυομένων', 'Σύνολο κωλιωμένων'], group: 'kol', bare: true },
  { key: 'ka', names: ['Κανονικές Άδειες / ΑΜΔ / ΥΕΘΑ', 'Κανονικές άδειες', 'Κανονικες Άδειες'], group: 'abs' },
  { key: 'an', names: ['Αναρρωτικές Άδειες', 'Αναρρωτικές'], group: 'abs' },
  { key: 'eid', names: ['Ειδικές Άδειες', 'ΕΙΔΙΚΕΣ ΑΔΕΙΕΣ'], group: 'abs' },
  { key: 'nos', names: ['Νοσοκομείο / .401 ΓΣΝΑ', 'Νοσοκομείο'], group: 'abs' },
  { key: 'prat', names: ['Πρατήριο'], group: 'abs' },
  { key: 'adik', names: ['Αγνοούμενοι/Αδικαιολογήτως Απών', 'Αδικαιολογήτως Απών'], group: 'abs' },
  { key: 'fp', names: ['Φύλλα Πορείας - Μεταβάσεως', 'Φύλλα Πορείας'], group: 'abs' },
  { key: 'fyl', names: ['Φυλάκια', 'ΦΥΛΑΚΙΑ'], group: 'abs' },
  { key: 'apal', names: ['Απαλλαγή', 'Απαλλαγη'], group: 'abs' },
  { key: 'ekp', names: ['Σε εκπαίδευση', 'Σε Εκπαίδευση'], group: 'abs' },
  { key: 'allh', names: ['Σε άλλη Μονάδα', 'Σε άλλη μονάδα'], group: 'abs' },
  { key: 'sumA', names: ['Σύνολο απόντων', 'ΣΥΝΟΛΟ ΑΠΟΝΤΩΝ'], group: 'abs', bare: true },
  { key: 'avail', names: ['Διαθέσιμοι για εκπαίδευση', 'Διαθέσιμοι'], group: null },
  { key: 'ab', names: ['Μισθοτροφοδοτηθέντες την προηγούμενη', 'Μισθοτροφοτηθέντες την προηγούμενη'], group: null }
];
// extra columns the lexicon knows (services/posts) or cannot know (unit-specific words), and compound headers
const HKX: { names: string[]; concept: Cn; maxLevel?: 'suggest' }[] = [
  { names: ['Σκοπός', 'Σκοποί'], concept: 'service:ΣΚΟΠΟΣ' }, { names: ['Θαλαμοφύλακες'], concept: 'service:ΘΑΛΑΜΟΦΥΛΑΚΑΣ' },
  { names: ['Εστιάτορας'], concept: 'post:ΕΣΤΙΑΤΟΡΑΣ' }, { names: ['Πωλητής ΚΨΜ'], concept: 'post:ΠΩΛΗΤΗΣ ΚΨΜ' },
  { names: ['Αδικαιολογήτως Απών'], concept: 'hkcol:adik' },
  { names: ['ΛΑΦ Πόλης'], concept: null }, { names: ['ΕΚΕ'], concept: null }, { names: ['Βραχονησίδα'], concept: null }, { names: ['Α/Μ'], concept: null },
  { names: ['Σε ειδική Υπηρεσίας'], concept: null }, { names: ['Σιτιστές - Γραφείς-Μάγειρες'], concept: null, maxLevel: 'suggest' },
  { names: ['Νοσοκομείο ΧΧ - ΕΥ'], concept: 'hkcol:nos', maxLevel: 'suggest' }, { names: ['Φυλάκιο Κορυφή-900'], concept: 'hkcol:fyl', maxLevel: 'suggest' }
];
interface RowDef { label: string[]; concept: Cn; maxLevel?: 'suggest'; total?: boolean }
const R = (label: string[], concept: Cn, o: Partial<RowDef> = {}): RowDef => ({ label, concept, ...o });
const OFF = (l: boolean): RowDef[] => [
  R(l ? ['Ταγματάρχες'] : ['Επίλαρχοι'], 'hkrow:Επίλαρχοι'), R(l ? ['Λοχαγοί'] : ['Ίλαρχοι'], 'hkrow:Ίλαρχοι'),
  ...(l ? [R(['Υπολοχαγοί'], 'hkrow:Ανθυπίλαρχοι-Ανθλγοι', { maxLevel: 'suggest' }), R(['Ανθυπολοχαγοί'], 'hkrow:Ανθυπίλαρχοι-Ανθλγοι')] : [R(['Ανθυπίλαρχοι-Ανθλγοι'], 'hkrow:Ανθυπίλαρχοι-Ανθλγοι')]),
  R(['Ανθυπασπιστές', 'ΑΝΘΥΠΑΣΠΙΣΤΕΣ'], 'hkrow:Ανθυπασπιστές'), R(['ΔΕΑ'], 'hkrow:ΔΕΑ')
];
const NCO = (l: boolean): RowDef[] => [
  R(['Αρχιλοχίες', 'Αλχίες'], 'hkrow:Αρχιλοχίες'), R(['Επιλοχίες', 'Επχίες'], 'hkrow:Επιλοχίες'), R(['Λοχίες', 'Λχίες'], 'hkrow:Λοχίες'), R(['Δεκανείς', 'Δνείς'], 'hkrow:Δεκανείς'),
  R(l ? ['Εποπ Στρ'] : ['ΕΠΟΠ Στρατιώτης', 'ΕΠΟΠ Στρτης'], 'hkrow:ΕΠΟΠ Στρατιώτης'), R(['ΟΒΑ Στρατιώτης', 'OBΑ Στρατιώτης'], 'hkrow:ΟΒΑ Στρατιώτης'), R(['Στρατιώτες', 'Στρτες'], 'hkrow:Στρατιώτες')
];
const hkRows = (r: Rnd, l: boolean): RowDef[] => {
  const off = OFF(l), nco = NCO(l);
  const rows: RowDef[] = [...(l && chance(r, 0.5) ? [R(['Αντισυνταγματάρχες'], 'rank:ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ')] : []), ...off, R(['ΣΥΝΟΛΟ ΑΞΚΩΝ', 'Σύνολο αξκων'], 'total:officers', { total: true }), ...nco, R(['ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ'], 'total:soldiers', { total: true }), R(['ΓΕΝΙΚΟ ΣΥΝΟΛΟ'], 'total:grand', { total: true })];
  // our own units drop a row now and then (no ΔΕΑ), or have a single «Άθροιση» row
  return rows.filter(x => x.concept !== 'hkrow:ΔΕΑ' || chance(r, 0.8));
};
// the data sheet of an ΗΚΑΛ whose front sheet counts it (words as typed in the Παρουσιολόγιο)
const RANK_WORDS: Record<string, [string, string]> = {
  'rank:ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ': ['ΑΝΧΗΣ', 'rank:ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ'], 'hkrow:Επίλαρχοι': ['ΤΧΗΣ', 'rank:ΤΑΓΜΑΤΑΡΧΗΣ'], 'hkrow:Ίλαρχοι': ['ΛΓΟΣ', 'rank:ΛΟΧΑΓΟΣ'],
  'hkrow:Ανθυπίλαρχοι-Ανθλγοι': ['ΑΝΘΛΓΟΣ', 'rank:ΑΝΘΥΠΟΛΟΧΑΓΟΣ'], 'hkrow:Ανθυπασπιστές': ['ΑΝΘΣΤΗΣ', 'rank:ΑΝΘΥΠΑΣΠΙΣΤΗΣ'], 'hkrow:ΔΕΑ': ['ΔΕΑ', 'rank:ΔΕΑ'],
  'hkrow:Αρχιλοχίες': ['ΑΛΧΙΑΣ', 'rank:ΑΡΧΙΛΟΧΙΑΣ'], 'hkrow:Επιλοχίες': ['ΕΠΧΙΑΣ', 'rank:ΕΠΙΛΟΧΙΑΣ'], 'hkrow:Λοχίες': ['ΛΧΙΑΣ', 'rank:ΛΟΧΙΑΣ'], 'hkrow:Δεκανείς': ['ΔΝΕΑΣ', 'rank:ΔΕΚΑΝΕΑΣ'],
  'hkrow:ΕΠΟΠ Στρατιώτης': ['ΕΠΟΠ ΣΤΡΤΗΣ', 'hkrow:ΕΠΟΠ Στρατιώτης'], 'hkrow:ΟΒΑ Στρατιώτης': ['ΟΒΑ ΣΤΡΤΗΣ', 'hkrow:ΟΒΑ Στρατιώτης'], 'hkrow:Στρατιώτες': ['ΣΤΡΤΗΣ', 'rank:ΣΤΡΑΤΙΩΤΗΣ']
};
const STATUS_WORDS: Record<string, [string, string]> = {
  ka: ['ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ', 'status:ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'], an: ['ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ', 'status:ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ'], eid: ['ΕΙΔΙΚΗ ΑΔΕΙΑ', 'status:ΕΙΔΙΚΗ ΑΔΕΙΑ'], nos: ['ΝΟΣΟΚΟΜΕΙΟ', 'status:ΝΟΣΟΚΟΜΕΙΟ'],
  apal: ['ΑΠΑΛΛΑΓΗ', 'status:ΑΠΑΛΛΑΓΗ'], ekp: ['ΕΚΠΑΙΔΕΥΣΗ', 'status:ΕΚΠΑΙΔΕΥΣΗ'], fp: ['ΦΥΛΛΟ ΠΟΡΕΙΑΣ', 'status:ΦΥΛΛΟ ΠΟΡΕΙΑΣ'], adik: ['ΑΔΙΚΑΙΟΛΟΓΗΤΩΣ ΑΠΩΝ', 'status:ΑΔΙΚΑΙΟΛΟΓΗΤΩΣ ΑΠΩΝ']
};
interface HkOpts { l: boolean; header: 1 | 2 | 3; mode: 'formulas' | 'values' | 'numbers' | 'countifs'; numbering: boolean; panel: boolean; spacer: boolean; extras: number; dropCols: number; dupHeader: boolean; blankHeader: boolean; plain: boolean; dataSheet?: string; rankCol?: number; statusCol?: number }

function renderHk(r: Rnd, wb: ExcelJS.Workbook, name: string, top: number, left: number, o: HkOpts, items: Item[], desc: string[]) {
  const s = new S(wb.addWorksheet(name));
  // columns: groups in order, shuffled inside a group; extras at group borders
  const keep = shuffle(r, HKC.filter(c => c.key !== 'prov' || chance(r, 0.5))).slice(0, Math.max(10, HKC.length - o.dropCols));
  const need = ['placed', 'ka', 'sum']; for (const k of need) if (!keep.some(x => x.key === k)) keep.push(HKC.find(x => x.key === k)!);
  const order: ColDef[] = [];
  for (const g of [null, 'force', 'kol', 'abs'] as const) { const part = keep.filter(c => c.group === g && c.key !== 'avail' && c.key !== 'ab'); const bare = part.filter(c => c.bare); const rest = shuffle(r, part.filter(c => !c.bare)); order.push(...(g === 'force' ? [...rest, ...bare] : [...rest, ...bare])); }
  order.push(...keep.filter(c => c.key === 'avail' || c.key === 'ab'));
  // «Σύνολο» columns must come after what they add up
  const sumIdx = (k: string) => order.findIndex(c => c.key === k); for (const k of ['sum', 'sumK', 'sumA']) { const i = sumIdx(k); if (i < 0) continue; const g = order[i].group; const last = Math.max(...order.map((c, j) => (c.group === g ? j : -1))); if (i !== last) { const [x] = order.splice(i, 1); order.splice(last, 0, x); } }
  type Cell = { def: ColDef | null; x?: typeof HKX[number]; text: string; concept: Cn; maxLevel?: 'suggest'; group: ColDef['group'] };
  const cells: Cell[] = order.map(def => {
    const bareOk = def.bare && o.header >= 2;
    const nm = bareOk ? 'Σύνολο' : (def.key === 'sumK' || def.key === 'sumA' ? (def.names[0]) : pick(r, def.names));
    const unseen = false; void unseen;
    return { def, text: spell(r, nm, { typo: true, plain: o.plain }), concept: 'hkcol:' + def.key, group: def.group };
  });
  // extras
  const xs = shuffle(r, HKX).slice(0, o.extras);
  for (const x of xs) { const at = int(r, 0, cells.length); const g = cells[Math.min(at, cells.length - 1)]?.group || null; cells.splice(at, 0, { def: null, x, text: spell(r, pick(r, x.names), { plain: o.plain }), concept: x.concept, maxLevel: x.maxLevel, group: at > 0 && at < cells.length ? g : null }); }
  if (o.dupHeader && cells.length > 6) { const i = int(r, 2, cells.length - 2); cells.splice(i, 0, { def: null, text: cells[i - 1].text, concept: null, group: cells[i - 1].group }); desc.push('διπλή επικεφαλίδα'); }
  if (o.blankHeader) { const i = int(r, 1, cells.length - 1); cells.splice(i, 0, { def: null, text: '', concept: null, group: null }); desc.push('κενή επικεφαλίδα'); }
  // extras inside a group keep the group header (they are under it), the others are free
  const labelCol = left, c0 = left + 1;
  // geometry
  const rowsDef = hkRows(r, o.l); const hdr = o.header;
  const bandTop = top; const bandBottom = top + hdr - 1; const numRow = o.numbering ? bandBottom + 1 : -1; const firstRow = (o.numbering ? numRow : bandBottom) + 1 + (chance(r, 0.4) ? 1 : 0);
  const colAt: number[] = []; let cc = c0;
  cells.forEach((c, i) => { colAt[i] = cc; cc++; if (o.spacer && i < cells.length - 1 && chance(r, 0.08)) cc++; });
  const lastCol = cc - 1;
  // header band
  s.put(bandTop, labelCol, hdr === 1 ? 'ΒΑΘΜΟΙ' : 'ΒΑΘΜΟΙ', { b: true, box: true }); s.merge(bandTop, labelCol, bandBottom, labelCol);
  cells.forEach((c, i) => {
    const x = colAt[i];
    const grouped = hdr >= 2 && c.group;
    if (grouped) {
      const prev = cells[i - 1], first = !prev || prev.group !== c.group || colAt[i - 1] !== x - 1;
      if (first) { let j = i; while (j + 1 < cells.length && cells[j + 1].group === c.group && colAt[j + 1] === colAt[j] + 1) j++; s.put(bandTop, x, { force: 'ΔΥΝΑΜΗ', kol: 'ΚΩΛΥΟΜΕΝΟΙ', abs: 'ΑΠΟΝΤΕΣ' }[c.group!], { b: true, box: true }); s.merge(bandTop, x, bandTop, colAt[j]); }
      if (c.text) s.put(bandTop + 1, x, c.text, { box: true }); s.merge(bandTop + 1, x, bandBottom, x);
    } else { if (c.text) s.put(bandTop, x, c.text, { b: true, box: true }); s.merge(bandTop, x, bandBottom, x); }
  });
  if (o.numbering) cells.forEach((_c, i) => s.put(numRow, colAt[i], i + 1));
  if (o.panel) { const pc = lastCol + 1; s.put(bandTop, pc, '  ΜΕΤΑΒΟΛΕΣ ΤΗΣ ΠΡΟΗΓΟΥΜΕΝΗΣ ΗΜΕΡΑΣ', { b: true }); s.merge(bandTop, pc, bandBottom, pc); ['ΕΓΓΡΑΦΗΚΑΝ', '1.', '2.', '3.', 'ΔΙΑΓΡΑΦΗΚΑΝ', '1.', '2.'].forEach((t, k) => s.put(firstRow + k, pc, t)); }
  // rows
  const rowAt: number[] = []; let rr = firstRow;
  rowsDef.forEach((d, i) => { rowAt[i] = rr; rr++; void i; });
  const lastRow = rr - 1;
  const idx = (k: string) => cells.findIndex(c => c.def?.key === k);
  rowsDef.forEach((d, i) => {
    const y = rowAt[i]; const label = spell(r, pick(r, d.label), { plain: o.plain });
    s.put(y, labelCol, label, { box: true });
    items.push({ shape: 'matrix', what: 'row', sheet: name, r: y, concept: d.concept, maxLevel: d.maxLevel, ref: { r: firstRow, c: c0 } });
    cells.forEach((c, k) => {
      const x = colAt[k]; const n = int(r, 0, 12);
      const sumOf = (a: string[]) => a.map(idx).filter(j => j >= 0).map(j => ref(y, colAt[j]));
      let f: string | undefined;
      if (o.mode === 'formulas' || o.mode === 'countifs') {
        if (c.def?.key === 'sum') f = 'SUM(' + sumOf(['placed', 'attached']).join(',') + ')';
        if (c.def?.key === 'sumK') f = 'SUM(' + sumOf(['yp', 'ey', 'tim', 'os', 'mag', 'sid', 'kin']).join(',') + ')';
        if (c.def?.key === 'sumA') f = 'SUM(' + sumOf(['ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh']).join(',') + ')';
        if (d.total) { const above = rowAt.slice(0, i).filter((_, j) => !rowsDef[j].total).map(j => j); if (above.length) f = 'SUM(' + ref(Math.min(...above.map(j => rowAt[j])), x) + ':' + ref(y - 1, x) + ')'; }
        if (o.mode === 'countifs' && !f && !d.total && o.dataSheet && d.concept && RANK_WORDS[d.concept as string]) {
          const rw = RANK_WORDS[d.concept as string][0]; const sh = "'" + o.dataSheet + "'!"; const rc = colName(o.rankCol! + 1), sc = colName(o.statusCol! + 1);
          const sw = c.def ? STATUS_WORDS[c.def.key] : undefined;
          if (c.def?.key === 'placed') f = 'COUNTIF(' + sh + rc + ':' + rc + ',"' + rw + '")';
          else if (sw) f = 'COUNTIFS(' + sh + rc + ':' + rc + ',"' + rw + '",' + sh + sc + ':' + sc + ',"' + sw[0] + '")';
        }
      }
      if (f) s.put(y, x, 0, { f, box: true }); else if (!(o.mode === 'numbers' && false)) s.put(y, x, chance(r, 0.5) ? n : null, { box: true });
    });
  });
  // column truth
  cells.forEach((c, i) => items.push({ shape: 'matrix', what: 'col', sheet: name, c: colAt[i], concept: c.concept, maxLevel: c.maxLevel, ref: { r: firstRow, c: c0 } }));
  items.push({ shape: 'matrix', what: 'geom', geom: 'first', sheet: name, ref: { r: firstRow, c: c0 }, value: firstRow }, { shape: 'matrix', what: 'geom', geom: 'last', sheet: name, ref: { r: firstRow, c: c0 }, value: lastRow }, { shape: 'matrix', what: 'geom', geom: 'labelCol', sheet: name, ref: { r: firstRow, c: c0 }, value: labelCol });
  // title and place/date labels
  s.put(Math.max(0, top - 2), labelCol, spell(r, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ 24/09/26', { plain: true }), { b: true });
  if (top >= 2) items.push({ shape: 'label', what: 'label', sheet: name, r: top - 2, c: labelCol, value: { r: top - 2, c: labelCol }, concept: 'label:title' });
  const pr = lastRow + 3; s.put(pr, lastCol - 1, pick(r, ['Αυλώνας, 25/09/26', 'Τρίπολη, 3/10/2026', 'Κως, 12 Οκτ 26']));
  items.push({ shape: 'label', what: 'label', sheet: name, r: pr, c: lastCol - 1, value: { r: pr, c: lastCol - 1 }, concept: 'label:placeDate' });
  return { s, firstRow, lastRow, c0, labelCol, colAt, cells, rowsDef, rowAt };
}

// the back page: labels with values to their right, or below when the right cell holds text
function backSheet(r: Rnd, wb: ExcelJS.Workbook, name: string, items: Item[]) {
  const s = new S(wb.addWorksheet(name)); const top = int(r, 0, 4), left = int(r, 0, 3);
  const labels: [string, string, string][] = shuffle(r, <[string, string, string][]>[['ΕΓΓΡΑΦΕΣ', '1. ΕΓΓΡΑΦΕΣ:', 'label:enroll'], ['ΔΙΑΓΡΑΦΕΣ', '2. ΔΙΑΓΡΑΦΕΣ:', 'label:delete'], ['ΑΔΕΙΕΣ', '3. ΑΔΕΙΕΣ:', 'label:leaves'], ['ΠΟΙΝΕΣ', '4. ΠΟΙΝΕΣ:', 'label:punish'], ['ΑΙΤΗΣΕΙΣ', '5.ΑΙΤΗΣΕΙΣ:', 'label:requests'], ['ΛΟΙΠΑ', '6. ΛΟΙΠΑ:', 'label:misc']]).slice(0, int(r, 3, 6));
  let y = top;
  labels.forEach(([, text, concept]) => {
    const w = int(r, 1, 3); s.put(y, left, text, { b: true }); s.merge(y, left, y, left + w - 1);
    const below = chance(r, 0.35);
    if (below) { s.put(y, left + w, pick(r, ['ΑΠΟΦΑΣΕΙΣ', 'ΕΙΣΗΓΗΣΗ'])); items.push({ shape: 'label', what: 'label', sheet: name, r: y, c: left, value: { r: y + 1, c: left }, concept }); y += 3; }
    else { items.push({ shape: 'label', what: 'label', sheet: name, r: y, c: left, value: { r: y, c: left + w }, concept }); y += 2; }
    items.push({ shape: 'label', what: 'labelConcept', sheet: name, r: y - (below ? 3 : 2), c: left, concept });
  });
  const dl = y + 1; for (const [t, c] of [['Λ/Υ:', 'label:cmdrDay'], ['Δ/Υ:', 'label:offDay']] as const) { s.put(dl + (c === 'label:offDay' ? 1 : 0), left, t, { b: true }); items.push({ shape: 'label', what: 'label', sheet: name, r: dl + (c === 'label:offDay' ? 1 : 0), c: left, value: { r: dl + (c === 'label:offDay' ? 1 : 0), c: left + 1 }, concept: c }); items.push({ shape: 'label', what: 'labelConcept', sheet: name, r: dl + (c === 'label:offDay' ? 1 : 0), c: left, concept: c }); }
  return s;
}

// ------------------------------------------------------------------ people lists
const RANKV = ['ΑΝΧΗΣ', 'ΤΧΗΣ', 'ΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΑΝΘΛΓΟΣ', 'ΑΝΘΣΤΗΣ', 'ΑΛΧΙΑΣ', 'ΕΠΧΙΑΣ', 'ΛΧΙΑΣ', 'ΔΝΕΑΣ', 'ΕΠΟΠ ΔΝΕΑΣ', 'ΣΤΡΤΗΣ', 'ΣΤΡΤΗΣ', 'ΣΤΡΤΗΣ', 'ΕΠΟΠ ΣΤΡΤΗΣ'];
const STATV = ['ΠΑΡΩΝ', 'ΠΑΡΩΝ', 'ΠΑΡΩΝ', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ', 'ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ', 'ΝΟΣΟΚΟΜΕΙΟ', 'ΑΠΑΛΛΑΓΗ', 'ΕΚΠΑΙΔΕΥΣΗ', 'ΕΙΔΙΚΗ ΑΔΕΙΑ'];
const LAST = ['ΠΑΠΑΔΟΠΟΥΛΟΣ', 'ΝΙΚΟΛΑΪΔΗΣ', 'ΑΝΤΩΝΙΟΥ', 'ΓΕΩΡΓΙΑΔΗΣ', 'ΚΩΝΣΤΑΝΤΙΝΟΥ', 'ΜΑΝΩΛΑΚΗΣ', 'ΣΤΑΥΡΟΥ'], FIRST = ['ΓΕΩΡΓΙΟΣ', 'ΝΙΚΟΛΑΟΣ', 'ΔΗΜΗΤΡΙΟΣ', 'ΙΩΑΝΝΗΣ', 'ΚΩΝΣΤΑΝΤΙΝΟΣ'];
interface FDef { k: string; concept: Cn; names: string[]; maxLevel?: 'suggest'; gen: (r: Rnd, i: number) => string | number | null }
const PF: FDef[] = [
  { k: 'aa', concept: 'person:aa', names: ['Α/Α', 'α/α', 'Νο', 'Α.Α.'], gen: (_r, i) => i + 1 },
  { k: 'rank', concept: 'person:rank', names: ['ΒΑΘΜΟΣ', 'Βαθμός', 'ΒΑΘΜ.'], gen: r => pick(r, RANKV) },
  { k: 'last', concept: 'person:last', names: ['ΕΠΩΝΥΜΟ', 'Επώνυμο', 'ΕΠΙΘΕΤΟ'], gen: r => pick(r, LAST) },
  { k: 'first', concept: 'person:first', names: ['ΟΝΟΜΑ', 'Όνομα'], gen: r => pick(r, FIRST) },
  { k: 'father', concept: 'person:father', names: ['ΠΑΤΡΩΝΥΜΟ', 'Πατρώνυμο'], gen: r => pick(r, FIRST) },
  { k: 'asm', concept: 'person:asm', names: ['ΑΣΜ', 'Α.Σ.Μ.', 'ΑΜ', 'ΑΡ. ΜΗΤΡΩΟΥ'], gen: r => '2' + int(r, 10, 99) + '/' + int(r, 1000, 9999) + '/2' + int(r, 0, 6) },
  { k: 'phone', concept: 'person:phone', names: ['ΤΗΛΕΦΩΝΟ', 'Κινητό', 'ΤΗΛ.'], gen: r => '69' + int(r, 10000000, 99999999) },
  { k: 'room', concept: 'person:room', names: ['ΘΑΛΑΜΟΣ', 'Θάλαμος'], gen: r => int(r, 1, 12) },
  { k: 'si', concept: 'person:si', names: ['Σ.Ι.', 'ΣΙ'], gen: r => pick(r, ['Α', 'Β', 'Γ', 'Ι4']) },
  { k: 'remarks', concept: 'person:remarks', names: ['ΠΑΡΑΤΗΡΗΣΕΙΣ', 'ΠΑΡ/ΣΕΙΣ'], gen: r => (chance(r, 0.2) ? 'ΔΙΑΘΕΣΗ' : null) },
  { k: 'post', concept: 'person:post', names: ['ΠΟΣΤΟ', 'Πόστο'], gen: r => pick(r, ['ΜΑΓΕΙΡΑΣ', 'ΓΡΑΦΕΑΣ', 'ΟΔΗΓΟΣ', null as unknown as string]) },
  { k: 'dn', concept: 'person:dn', names: ['ΔΝ'], gen: r => pick(r, ['ΝΑΙ', '', 'ΝΑΙ']) },
  { k: 'essos', concept: 'person:essos', names: ['ΕΣΣΟ', 'Ε.Σ.Σ.Ο.'], gen: r => pick(r, ['Α', 'Β', 'Γ']) },
  { k: 'sub', concept: 'person:sub', names: ['ΙΛΗ', 'ΛΟΧΟΣ'], gen: r => pick(r, ['Δ/Σ', 'ΕΠ.', '1', '2']) },
  { k: 'status', concept: 'person:status', names: ['ΚΑΤΑΣΤΑΣΗ', 'Κατάσταση'], gen: r => pick(r, STATV) },
  { k: 'iban', concept: 'person:iban', names: ['IBAN'], gen: () => 'GR1601101250000000012300695' },
  { k: 'afm', concept: 'person:afm', names: ['ΑΦΜ'], gen: r => int(r, 100000000, 999999999) }
];
const UNK = ['Ξένη γλώσσα', 'ΕΙΔΙΚΟΤΗΤΑ - ΕΣΣΟ', 'Δίπλωμα ΜΕΤ', 'Στήλη1', 'Χ'];
interface ListOpts { fields: string[]; header: 1 | 2 | 3; people: number; unknown: number; spacer: boolean; totalRow: boolean; blankInside: boolean; rankNoName: boolean; dv: boolean; plain: boolean; title: boolean }
function renderList(r: Rnd, wb: ExcelJS.Workbook, name: string, top: number, left: number, o: ListOpts, items: Item[], desc: string[], shape: 'list' = 'list') {
  const s = new S(wb.addWorksheet(name));
  const defs = o.fields.map(k => PF.find(x => x.k === k)!);
  type C = { def: FDef | null; text: string; concept: Cn; maxLevel?: 'suggest'; unk?: boolean };
  const cols: C[] = defs.map(def => ({ def, text: spell(r, pick(r, def.names), { plain: o.plain }), concept: def.concept }));
  for (let i = 0; i < o.unknown; i++) { const at = int(r, 0, cols.length); cols.splice(at, 0, { def: null, text: pick(r, UNK), concept: null, unk: true }); }
  const colAt: number[] = []; let cc = left; cols.forEach((_c, i) => { colAt[i] = cc; cc++; if (o.spacer && i < cols.length - 1 && chance(r, 0.1)) cc++; });
  const hdr = o.header; let y = top;
  if (o.title) { s.put(y, left, 'ΚΑΤΑΣΤΑΣΗ ΠΡΟΣΩΠΙΚΟΥ ΤΗΣ ' + int(r, 1, 28) + ' ΝΟΕΜΒΡΙΟΥ 2026', { b: true }); s.merge(y, left, y, colAt[cols.length - 1]); y += 2; desc.push('τίτλος πάνω από τον πίνακα'); }
  const hTop = y;
  // 2–3 header rows: a group header over name columns, the rest merged vertically
  const nameIdx = cols.map((c, i) => (c.def && ['last', 'first', 'father'].includes(c.def.k) ? i : -1)).filter(i => i >= 0);
  const contiguous = nameIdx.length >= 2 && nameIdx.every((v, k) => k === 0 || v === nameIdx[k - 1] + 1) && nameIdx.every((v, k) => k === 0 || colAt[v] === colAt[nameIdx[k - 1]] + 1);
  cols.forEach((c, i) => {
    const x = colAt[i];
    if (hdr >= 2 && contiguous && nameIdx.includes(i)) { if (i === nameIdx[0]) { s.put(hTop, x, 'ΣΤΟΙΧΕΙΑ', { b: true, box: true }); s.merge(hTop, x, hTop, colAt[nameIdx[nameIdx.length - 1]]); } s.put(hTop + 1, x, c.text, { b: true, box: true }); s.merge(hTop + 1, x, hTop + hdr - 1, x); }
    else { s.put(hTop, x, c.text, { b: true, box: true }); s.merge(hTop, x, hTop + hdr - 1, x); }
  });
  y = hTop + hdr;
  const first = y; let last = y - 1; let row = y;
  const n = o.people;
  const si = cols.findIndex(c => c.def?.k === 'status'), ri = cols.findIndex(c => c.def?.k === 'rank');
  for (let i = 0; i < n; i++) {
    if (o.blankInside && i > 0 && i % 9 === 0) row += int(r, 1, 2);
    cols.forEach((c, k) => { const v = c.def ? c.def.gen(r, i) : (chance(r, 0.4) ? int(r, 1, 99) : null); if (c.def?.k === 'last' && o.rankNoName && i % 7 === 3) return; if (v != null && v !== '') s.put(row, colAt[k], v as string | number); });
    last = row; row++;
  }
  if (o.totalRow) { s.put(row, colAt[0] + (cols.length > 1 ? 1 : 0), 'ΣΥΝΟΛΟ', { b: true }); s.put(row, colAt[cols.length - 1], n); }
  if (o.dv) { if (ri >= 0) s.list(first, colAt[ri], last, colAt[ri], '"' + [...new Set(RANKV)].join(',') + '"'); if (si >= 0) { const lc = colAt[cols.length - 1] + 3; STATV.slice(0, 5).forEach((t, k) => s.put(first + k, lc, t)); s.list(first, colAt[si], last, colAt[si], '$' + colName(lc + 1) + '$' + (first + 1) + ':$' + colName(lc + 1) + '$' + (first + 5)); } }
  cols.forEach((c, i) => items.push({ shape, what: 'col', sheet: name, c: colAt[i], concept: c.concept, maxLevel: c.maxLevel, ref: { r: first, c: colAt[0] } }));
  const refp = { r: first, c: colAt[0] };
  items.push({ shape, what: 'geom', geom: 'first', sheet: name, ref: refp, value: first }, { shape, what: 'geom', geom: 'last', sheet: name, ref: refp, value: last }, { shape, what: 'geom', geom: 'c1', sheet: name, ref: refp, value: colAt[0] });
  return { s, first, last, colAt, cols, ri, si };
}

// ------------------------------------------------------------------ month grid
const CODES = ['Θ1', 'Θ2', 'Θ3', 'ΕΞ', 'ΕΣΤ', 'Κ', 'ΦΓ', 'ΗΣΑ2', 'ΚΠ1', 'Π'];
interface GridOpts { days: number; people: number; weekday: boolean; spans: number; left: string[]; right: number; title: boolean; groupHdr: boolean }
function renderGrid(r: Rnd, wb: ExcelJS.Workbook, name: string, top: number, left: number, o: GridOpts, items: Item[], desc: string[]) {
  const s = new S(wb.addWorksheet(name));
  const defs = o.left.map(k => PF.find(x => x.k === k)!);
  const hr = top + (o.title ? 1 : 0) + (o.groupHdr ? 1 : 0) + (o.weekday ? 1 : 0);
  if (o.title) { s.put(top, left, 'ΥΠΗΡΕΣΙΕΣ ΟΠΛΙΤΩΝ ΜΗΝΑ ΙΟΥΛΙΟΥ', { b: true }); s.merge(top, left, top, left + defs.length + o.days - 1); }
  defs.forEach((d, i) => { s.put(hr, left + i, spell(r, pick(r, d.names)), { b: true, box: true }); items.push({ shape: 'grid', what: 'col', sheet: name, c: left + i, concept: d.concept, ref: { r: hr, c: left } }); });
  const d0 = left + defs.length;
  if (o.weekday) { const wd = 'ΔΤΤΠΠΣΚ'; for (let d = 0; d < o.days; d++) s.put(hr - 1, d0 + d, wd[d % 7]); }
  for (let d = 0; d < o.days; d++) s.put(hr, d0 + d, d + 1, { b: true, box: true });
  const rc0 = d0 + o.days; const rights = shuffle(r, [['Σ', null], ['ΚΑ', 'hkcol:ka'], ['ΕΤΑΠ', null], ['ΤΙΜ', null], ['ΔΙΑΘΕΣΙΜΟΣ', 'hkcol:avail']] as [string, Cn][]).slice(0, o.right);
  rights.forEach(([t, c], i) => { s.put(hr, rc0 + i, t, { b: true, box: true }); items.push({ shape: 'grid', what: 'col', sheet: name, c: rc0 + i, concept: c, ref: { r: hr, c: left } }); });
  if (o.groupHdr && rights.length > 1) { s.put(hr - (o.weekday ? 2 : 1), rc0, 'ΣΥΝΟΛΑ', { b: true }); s.merge(hr - (o.weekday ? 2 : 1), rc0, hr - (o.weekday ? 2 : 1), rc0 + rights.length - 1); }
  const p0 = hr + 1; const spans: Item[] = [];
  for (let i = 0; i < o.people; i++) {
    const y = p0 + i;
    defs.forEach((d, k) => { const v = d.gen(r, i); if (v != null && v !== '') s.put(y, left + k, v as string | number); });
    for (let d = 0; d < o.days; d++) if (chance(r, 0.6)) s.put(y, d0 + d, pick(r, CODES));
    rights.forEach((_t, k) => s.put(y, rc0 + k, 'COUNTIF', { f: 'COUNTIF(' + ref(y, d0) + ':' + ref(y, d0 + o.days - 1) + ',"Κ")' }));
  }
  for (let k = 0; k < o.spans; k++) {
    const y = p0 + int(r, 0, o.people - 1); const a = int(r, 0, o.days - 6); const b = a + int(r, 2, 5);
    if (spans.some(x => x.r === y && !(x.c2! < d0 + a || x.c! > d0 + b))) continue;
    s.put(y, d0 + a, 'ΑΔΕΙΑ'); s.merge(y, d0 + a, y, d0 + b); spans.push({ shape: 'grid', what: 'span', sheet: name, r: y, c: d0 + a, c2: d0 + b, ref: { r: hr, c: left } });
  }
  items.push(...spans);
  const rf = { r: hr, c: left };
  items.push({ shape: 'grid', what: 'geom', geom: 'header', sheet: name, ref: rf, value: hr }, { shape: 'grid', what: 'geom', geom: 'firstDay', sheet: name, ref: rf, value: d0 }, { shape: 'grid', what: 'geom', geom: 'days', sheet: name, ref: rf, value: o.days }, { shape: 'grid', what: 'geom', geom: 'people', sheet: name, ref: rf, value: o.people });
  desc.push(o.days + ' μέρες, ' + o.people + ' άτομα, ' + spans.length + ' διαστήματα');
}

// ------------------------------------------------------------------ list-style service status (ΚΥ 1)
const SVC = ['ΕΕΑΣ', 'ΑΥΔΜ', 'ΒΑΥΔΜ', 'ΟΔΗΓΟΣ ΕΠΙΦΥΛ.', 'ΕΠΟΠΤΗΣ ΕΣΤ', 'ΑΞΚΟΣ Κ ΠΥΛΗΣ', 'ΣΚΟΠΟΣ 1', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ 1'];
function renderServiceList(r: Rnd, wb: ExcelJS.Workbook, name: string, top: number, left: number, items: Item[], desc: string[], plain: boolean) {
  const s = new S(wb.addWorksheet(name)); const n = int(r, 8, 30);
  const hdr = pick(r, [1, 2] as const); const noHeaderSvc = chance(r, 0.7);
  s.put(top, left, 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ ' + int(r, 1, 28) + ' ΝΟΕΜΒΡΙΟΥ 2026', { b: true }); s.merge(top, left, top, left + 6);
  const h = top + 2; const cn = left + 1;
  const aa = spell(r, pick(r, ['Νο', 'Α/Α']), { plain }), rk = spell(r, pick(r, ['ΒΑΘΜΟΣ', 'Βαθμός']), { plain }), nm = spell(r, pick(r, ['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'Ονοματεπώνυμο']), { plain });
  s.put(h, cn, aa, { b: true, box: true }); s.merge(h, cn, h + hdr - 1, cn + 1);
  s.put(h, cn + 2, rk, { b: true, box: true }); s.merge(h, cn + 2, h + hdr - 1, cn + 3);
  s.put(h, cn + 4, nm, { b: true, box: true }); s.merge(h, cn + 4, h + hdr - 1, cn + 6);
  if (!noHeaderSvc) { s.put(h, left, spell(r, 'ΥΠΗΡΕΣΙΑ', { plain }), { b: true, box: true }); s.merge(h, left, h + hdr - 1, left); }
  const first = h + hdr; let last = first - 1;
  for (let i = 0; i < n; i++) {
    const y = first + i; s.put(y, left, pick(r, SVC)); s.put(y, cn + 1, pick(r, ['24 ΩΡΗ', '12 ΩΡΗ'])); s.put(y, cn + 2, pick(r, RANKV));
    if (i % 5 !== 2) s.put(y, cn + 4, pick(r, LAST) + ' ' + pick(r, FIRST)); last = y;
  }
  const rf = { r: first, c: cn };
  items.push({ shape: 'list', what: 'col', sheet: name, c: cn, concept: 'person:aa', ref: rf }, { shape: 'list', what: 'col', sheet: name, c: cn + 2, concept: 'person:rank', ref: rf }, { shape: 'list', what: 'col', sheet: name, c: cn + 4, concept: 'person:name', ref: rf });
  items.push({ shape: 'list', what: 'geom', geom: 'first', sheet: name, ref: rf, value: first }, { shape: 'list', what: 'geom', geom: 'last', sheet: name, ref: rf, value: last });
  desc.push('λίστα υπηρεσιών, ' + n + ' γραμμές, γραμμές με βαθμό χωρίς όνομα');
}

// ------------------------------------------------------------------ the generators
const extraSheets = (r: Rnd, wb: ExcelJS.Workbook, desc: string[]) => {
  const k = int(r, 0, 2);
  for (let i = 0; i < k; i++) { let nm = pick(r, ['ΟΔΗΓΙΕΣ', 'Φύλλο' + (i + 5), 'ΣΗΜΕΙΩΣΕΙΣ', 'Λίστες']); while (wb.getWorksheet(nm)) nm += '_'; const w = wb.addWorksheet(nm); w.getCell('A1').value = 'ΣΗΜΕΙΩΣΗ: δεν είναι πίνακας'; if (chance(r, 0.4)) { w.state = pick(r, ['hidden', 'veryHidden'] as const); desc.push('κρυφό φύλλο'); } }
};
const reorder = (r: Rnd, wb: ExcelJS.Workbook, mainName: string, desc: string[]) => {
  // the main sheet is not always first
  if (chance(r, 0.4) && wb.worksheets.length > 1) { const ws = wb.getWorksheet(mainName); if (ws && ws.id !== wb.worksheets[0].id) return; wb.addWorksheet('ΤΕΛΕΥΤΑΙΟ'); void desc; }
};
const rand = (r: Rnd): { top: number; left: number; plain: boolean; mode: HkOpts['mode'] } => ({ top: int(r, 3, 7), left: int(r, 0, 3), plain: chance(r, 0.25), mode: pick(r, ['formulas', 'values', 'numbers'] as const) });

export async function genMock(kind: MockKind, seed: number): Promise<Mock> {
  const r = rng(seed * 7919 + KINDS.concat(REAL_KINDS).indexOf(kind) * 104729 + 13); const wb = new ExcelJS.Workbook(); const items: Item[] = []; const desc: string[] = [];
  const g = rand(r); const sheetName = pick(r, ['ΚΑΤΑΣΤΑΣΗ', 'μπροστινο', 'Εμπρός Όψη', 'ΗΚΑΙ ' + seed]);
  if (kind === 'hkai' || kind === 'hkal') {
    const l = kind === 'hkal'; const front = renderHk(r, wb, sheetName, g.top, g.left, { l, header: pick(r, [1, 2, 3] as const), mode: g.mode, numbering: chance(r, 0.3), panel: chance(r, 0.4), spacer: chance(r, 0.3), extras: int(r, 0, 4), dropCols: int(r, 0, 5), dupHeader: chance(r, 0.15), blankHeader: chance(r, 0.15), plain: g.plain }, items, desc); void front;
    if (chance(r, 0.7)) backSheet(r, wb, pick(r, ['πισω', 'Πίσω Όψη', 'ΠΙΣΩ ΟΨΗ']), items);
  } else if (kind === 'hkal-countifs') {
    const dn = pick(r, ['Παρουσιολόγιο', 'ΠΑΡΟΝΤΕΣ', 'Δυναμολόγιο ' + seed]);
    // data sheet first so that we know its columns
    const lo = { fields: shuffle(r, ['aa', 'last', 'first', 'asm', 'phone', 'sub']), header: 1 as const, people: int(r, 15, 60), unknown: int(r, 0, 2), spacer: false, totalRow: false, blankInside: false, rankNoName: chance(r, 0.4), dv: chance(r, 0.6), plain: g.plain, title: false };
    const fields = ['rank', 'status', ...lo.fields];
    const its: Item[] = []; const lt = renderList(r, wb, dn, int(r, 0, 5), int(r, 0, 3), { ...lo, fields: shuffle(r, fields) }, its, desc);
    const front = renderHk(r, wb, sheetName, g.top, g.left, { l: true, header: pick(r, [2, 3] as const), mode: 'countifs', numbering: false, panel: chance(r, 0.4), spacer: false, extras: 0, dropCols: int(r, 0, 3), dupHeader: false, blankHeader: false, plain: false, dataSheet: dn, rankCol: lt.colAt[lt.ri], statusCol: lt.colAt[lt.si] }, items, desc);
    items.push(...its);
    const rf = { r: front.firstRow, c: front.c0 };
    items.push({ shape: 'formula', what: 'driven', sheet: sheetName, geom: 'dataSheet', ref: rf, value: dn }, { shape: 'formula', what: 'driven', sheet: sheetName, geom: 'rankCol', ref: rf, value: lt.colAt[lt.ri] }, { shape: 'formula', what: 'driven', sheet: sheetName, geom: 'statusCol', ref: rf, value: lt.colAt[lt.si] });
    for (let i = 0; i < front.rowsDef.length; i++) { const d = front.rowsDef[i]; const w = d.concept ? RANK_WORDS[d.concept as string] : undefined; if (w) items.push({ shape: 'formula', what: 'driven', sheet: sheetName, geom: 'rankWord', r: front.rowAt[i], ref: rf, concept: w[1], value: w[0] }); }
    for (let k = 0; k < front.cells.length; k++) { const key = front.cells[k].def?.key; const w = key ? STATUS_WORDS[key] : undefined; if (w) items.push({ shape: 'formula', what: 'driven', sheet: sheetName, geom: 'statusWord', c: front.colAt[k], ref: rf, concept: w[1], value: w[0] }); }
    desc.push('COUNTIFS πάνω από «' + dn + '»');
  } else if (kind === 'duty-grid') {
    renderGrid(r, wb, sheetName, int(r, 0, 4), int(r, 0, 3), { days: pick(r, [28, 29, 30, 31]), people: int(r, 8, 40), weekday: chance(r, 0.4), spans: int(r, 2, 8), left: ['aa', 'last', ...(chance(r, 0.6) ? ['post'] : []), ...(chance(r, 0.5) ? ['sub'] : []), ...(chance(r, 0.4) ? ['essos'] : [])], right: int(r, 0, 4), title: chance(r, 0.6), groupHdr: chance(r, 0.4) }, items, desc);
    if (chance(r, 0.4)) wb.addWorksheet('Φύλλο2');
  } else if (kind === 'service-list') {
    renderServiceList(r, wb, sheetName, int(r, 0, 4), int(r, 0, 2), items, desc, g.plain);
    if (chance(r, 0.5)) { const w = wb.addWorksheet('ΛΙΣΤΑ'); w.getCell('B2').value = 'ΕΠΩΝΥΜΟ'; }
  } else if (kind === 'roster') {
    const fields = ['aa', 'rank', ...pick(r, [['last', 'first'], ['last', 'first', 'father'], ['name']] as string[][]), ...shuffle(r, ['asm', 'phone', 'room', 'si', 'remarks', 'post', 'dn', 'essos', 'sub', 'status', 'iban', 'afm']).slice(0, int(r, 2, 8))];
    const f2 = fields.map(k => (k === 'name' ? 'last' : k)); const names = fields.includes('name');
    if (names) PF.find(x => x.k === 'last')!.names.push('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    renderList(r, wb, sheetName, int(r, 0, 5), int(r, 0, 3), { fields: shuffle(r, f2).sort((a, b) => (a === 'aa' ? -1 : b === 'aa' ? 1 : 0)), header: pick(r, [1, 2, 3] as const), people: int(r, 5, 80), unknown: int(r, 0, 3), spacer: chance(r, 0.3), totalRow: chance(r, 0.4), blankInside: chance(r, 0.4), rankNoName: chance(r, 0.5), dv: chance(r, 0.5), plain: g.plain, title: chance(r, 0.4) }, items, desc);
    if (names) { const nm = PF.find(x => x.k === 'last')!.names; nm.splice(nm.indexOf('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), 1); }
  } else if (kind === 'weapons') {
    const s = new S(wb.addWorksheet(sheetName)); const top = int(r, 0, 4), left = int(r, 0, 3); const n = int(r, 6, 60);
    s.put(top, left + 4, 'ΜΟΝΑΔΑ: 99 ΜΟΝΑΔΑ'); items.push({ shape: 'label', what: 'label', sheet: sheetName, r: top, c: left + 4, value: { r: top, c: left + 4 }, concept: 'label:unit' });
    const hdrs: [string, Cn][] = shuffle(r, [['ΤΥΠΟΣ ΟΠΛΟΥ', 'weapon:type'], ['ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'weapon:number'], [pick(r, ['ΘΕΣΗ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ', 'ΑΡΙΘΜΟΣ ΘΕΣΗΣ ΟΠΛΟΥ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ']), 'weapon:slot'], ...(chance(r, 0.4) ? [['ΑΡΙΘΜΟΣ ΚΑΝΗΣ', 'weapon:barrel']] : []), ['ΠΑΡΑΤΗΡΗΣΕΙΣ', 'person:remarks'], ...(chance(r, 0.4) ? [['ΕΛΕΓΧΟΣ', null]] : [])] as [string, Cn][]);
    const all: [string, Cn][] = [['Α/Α', 'person:aa'], ['ΒΑΘΜΟΣ', 'person:rank'], ['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'person:name'], ...hdrs];
    const h = top + 3; all.forEach(([t, c], i) => { s.put(h, left + i, spell(r, t, { plain: g.plain }), { b: true, box: true }); items.push({ shape: 'list', what: 'col', sheet: sheetName, c: left + i, concept: c, ref: { r: h + 1, c: left } }); });
    for (let i = 0; i < n; i++) all.forEach(([t], k) => s.put(h + 1 + i, left + k, t === 'Α/Α' ? i + 1 : t === 'ΒΑΘΜΟΣ' ? (chance(r, 0.8) ? pick(r, RANKV) : null) : t === 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' ? (i % 6 === 4 ? null : pick(r, LAST) + ' ' + pick(r, FIRST)) : t.startsWith('ΤΥΠΟΣ') ? pick(r, ['G3A3', 'G3A4', 'M1911']) : t.startsWith('ΑΡΙΘΜΟΣ ΟΠ') ? int(r, 100000, 999999) : t.startsWith('ΑΡΙΘΜΟΣ ΚΑΝ') ? int(r, 1000, 9999) : null));
    items.push({ shape: 'list', what: 'geom', geom: 'first', sheet: sheetName, ref: { r: h + 1, c: left }, value: h + 1 }, { shape: 'list', what: 'geom', geom: 'last', sheet: sheetName, ref: { r: h + 1, c: left }, value: h + n });
  } else if (kind.startsWith('real-')) { realReplica(kind, r, wb, items, desc); }
  extraSheets(r, wb, desc);
  // randomly make the first sheet something else
  if (!kind.startsWith('real-') && chance(r, 0.3)) { const w = wb.addWorksheet('ΜΠΡΟΣΤΑ'); w.getCell('A1').value = 'ΟΔΗΓΙΕΣ'; wb.worksheets.unshift(wb.worksheets.pop()!); void reorder; }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { kind, seed, buf, items, desc };
}

// ------------------------------------------------------------------ synthetic replicas of the seven real files
// Same headers, same layout and formulas as the unit files; names are fake and there are no unit identifiers.
function realReplica(kind: MockKind, r: Rnd, wb: ExcelJS.Workbook, items: Item[], desc: string[]) {
  const fake = (i: number) => 'ΕΠΩΝΥΜΟ' + (i + 1) + ' ΟΝΟΜΑ';
  if (kind === 'real-hkai-2509' || kind === 'real-hkai-own-cols' || kind === 'real-hkal-countifs') {
    const s = new S(wb.addWorksheet(kind === 'real-hkai-2509' ? 'μπροστινο' : kind === 'real-hkai-own-cols' ? 'ΚΑΤΑΣΤΑΣΗ' : 'Εμπρός Όψη'));
    const big = (t: string, rr: number, c1: number, c2: number, r2 = rr) => { s.put(rr, c1, t, { b: true, box: true }); s.merge(rr, c1, r2, c2); };
    const mk = (cols: [string, Cn, string?][], groups: [string, number, number][], hdrTop: number, hdrRows: number, labelHdr: string, rows: [string, Cn][], num?: boolean, c0 = 1, firstExtra = 0) => {
      // groups: [text, firstColIndex, lastColIndex] over cols
      big(labelHdr, hdrTop, 0, 0, hdrTop + hdrRows - 1);
      const inGroup = (i: number) => groups.find(g => i >= g[1] && i <= g[2]);
      cols.forEach(([t, cn], i) => { const x = c0 + i; const g = inGroup(i); if (g) { if (i === g[1]) big(g[0], hdrTop, c0 + g[1], c0 + g[2]); if (t) s.put(hdrTop + 1, x, t, { box: true }); s.merge(hdrTop + 1, x, hdrTop + hdrRows - 1, x); } else { if (t) s.put(hdrTop, x, t, { b: true, box: true }); s.merge(hdrTop, x, hdrTop + hdrRows - 1, x); }
        items.push({ shape: 'matrix', what: 'col', sheet: s.ws.name, c: x, concept: cn, ref: { r: hdrTop + hdrRows + (num ? 1 : 0) + firstExtra, c: c0 } }); });
      if (num) cols.forEach((_c, i) => s.put(hdrTop + hdrRows, c0 + i, i + 1));
      const fr = hdrTop + hdrRows + (num ? 1 : 0) + firstExtra; rows.forEach(([t, cn], i) => { s.put(fr + i, 0, t, { box: true }); items.push({ shape: 'matrix', what: 'row', sheet: s.ws.name, r: fr + i, concept: cn, ref: { r: fr, c: c0 } }); cols.forEach((_c, k) => s.put(fr + i, c0 + k, chance(r, 0.5) ? int(r, 0, 20) : null, { box: true })); });
      items.push({ shape: 'matrix', what: 'geom', geom: 'first', sheet: s.ws.name, ref: { r: fr, c: c0 }, value: fr }, { shape: 'matrix', what: 'geom', geom: 'last', sheet: s.ws.name, ref: { r: fr, c: c0 }, value: fr + rows.length - 1 });
      return fr;
    };
    if (kind === 'real-hkai-2509') {
      const cols: [string, Cn][] = [['Προβλέπονται από τη σύνθεση', 'hkcol:prov'], ['Τοποθετημένοι', 'hkcol:placed'], ['Προσκολημένοι', 'hkcol:attached'], ['Σύνολο', 'hkcol:sum'], ['Υπηρεσία εντός στρατοπέδου', 'hkcol:yp'], ['Ελεύθεροι υπηρεσίας', 'hkcol:ey'], ['Τιμωρημένοι', 'hkcol:tim'], ['       ', null], ['Ο/Σ', 'hkcol:os'], ['ΜΑΓΕΙΡΙΑ', 'hkcol:mag'], ['ΣΙΔΗΡΟΥΡΓΕΙΟ', 'hkcol:sid'], ['Σε κίνηση', 'hkcol:kin'], ['Σύνολο κωλυομένων', 'hkcol:sumK'], ['Κανονικές Άδειες / ΑΜΔ / ΥΕΘΑ', 'hkcol:ka'], ['Αναρρωτικές Άδειες', 'hkcol:an'], ['Ειδικές Άδειες', 'hkcol:eid'], ['Νοσοκομείο / .401 ΓΣΝΑ', 'hkcol:nos'], ['Πρατήριο', 'hkcol:prat'], ['Αγνοούμενοι/Αδικαιολογήτως Απών ', 'hkcol:adik'], ['Φύλλα Πορείας - Μεταβάσεως', 'hkcol:fp'], ['Φυλάκια', 'hkcol:fyl'], ['Απαλλαγή', 'hkcol:apal'], ['Σε εκπαίδευση', 'hkcol:ekp'], ['Σε άλλη Μονάδα', 'hkcol:allh'], ['Σύνολο απόντων', 'hkcol:sumA'], ['Διαθέσιμοι για εκπαίδευση', 'hkcol:avail'], ['Μισθοτροφοδοτηθέντες την προηγούμενη', 'hkcol:ab']];
      // as in the file: «ΔΥΝΑΜΗ» over two columns, «ΚΩΛΥΟΜΕΝΟΙ», «ΑΠΟΝΤΕΣ» over the rest, header rows 6–9 (4 rows)
      const rows: [string, Cn][] = [['Επίλαρχοι', 'hkrow:Επίλαρχοι'], ['Ίλαρχοι', 'hkrow:Ίλαρχοι'], ['Ανθυπίλαρχοι-Ανθλγοι', 'hkrow:Ανθυπίλαρχοι-Ανθλγοι'], ['Ανθυπασπιστές', 'hkrow:Ανθυπασπιστές'], ['ΔΕΑ', 'hkrow:ΔΕΑ'], ['ΣΥΝΟΛΟ ΑΞΚΩΝ', 'total:officers'], ['Αρχιλοχίες', 'hkrow:Αρχιλοχίες'], ['Επιλοχίες', 'hkrow:Επιλοχίες'], ['Λοχίες', 'hkrow:Λοχίες'], ['Δεκανείς', 'hkrow:Δεκανείς'], ['ΕΠΟΠ Στρατιώτης', 'hkrow:ΕΠΟΠ Στρατιώτης'], ['OBΑ Στρατιώτης', 'hkrow:ΟΒΑ Στρατιώτης'], ['Στρατιώτες', 'hkrow:Στρατιώτες'], ['ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', 'total:soldiers'], ['ΓΕΝΙΚΟ ΣΥΝΟΛΟ', 'total:grand']];
      s.put(3, 0, 'ΚΑΤΑΣΤΑΣΗ', { b: true }); s.merge(3, 0, 3, 28); s.put(3 + 1, 0, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ 24/09/26', { b: true }); s.merge(4, 0, 4, 28);
      items.push({ shape: 'label', what: 'label', sheet: s.ws.name, r: 4, c: 0, value: { r: 4, c: 0 }, concept: 'label:title' });
      const fr = mk(cols, [['ΔΥΝΑΜΗ', 1, 2], ['ΚΩΛΥΟΜΕΝΟΙ', 4, 11], ['ΑΠΟΝΤΕΣ', 13, 23]], 5, 4, 'ΒΑΘΜΟΙ', rows, false, 1, 1);
      s.put(fr + 17, 21, 'Αυλώνας, 25/09/26'); items.push({ shape: 'label', what: 'label', sheet: s.ws.name, r: fr + 17, c: 21, value: { r: fr + 17, c: 21 }, concept: 'label:placeDate' });
      const b = wb.addWorksheet('πισω'); const bs = new S(b);
      [['1. ΕΓΓΡΑΦΕΣ:  ', 'label:enroll'], ['2. ΔΙΑΓΡΑΦΕΣ:  ', 'label:delete'], ['3. ΑΔΕΙΕΣ:  ', 'label:leaves'], ['4. ΠΟΙΝΕΣ: ', 'label:punish'], ['5.ΑΙΤΗΣΕΙΣ:     ', 'label:requests'], ['6. ΛΟΙΠΑ:', 'label:misc']].forEach(([t, c], i) => { bs.put(7 + i, 5, t); bs.merge(7 + i, 5, 7 + i, 6); items.push({ shape: 'label', what: 'label', sheet: 'πισω', r: 7 + i, c: 5, value: { r: 7 + i, c: 7 }, concept: c }, { shape: 'label', what: 'labelConcept', sheet: 'πισω', r: 7 + i, c: 5, concept: c }); });
    } else if (kind === 'real-hkai-own-cols') {
      const cols: [string, Cn][] = [['', null], ['Προβλέπονται από την σύνθεση', 'hkcol:prov'], ['Τοποθετημένοι', 'hkcol:placed'], ['Προσκολλημένοι', 'hkcol:attached'], ['Σύνολο', 'hkcol:sum'], ['Α/Μ', null], ['Ελεύθεροι Υπηρεσίας', 'hkcol:ey'], ['Σκοπός', 'service:ΣΚΟΠΟΣ'], ['Σε ειδική Υπηρεσίας', null], ['Θαλαμοφύλακες', 'service:ΘΑΛΑΜΟΦΥΛΑΚΑΣ'], ['Εστιάτορας', 'post:ΕΣΤΙΑΤΟΡΑΣ'], ['Εποπτ. ΚΨΜ - Εστιατ.', 'post:ΕΠΟΠΤΗΣ ΚΨΜ'], ['Σιτιστές - Γραφείς-Μάγειρες', null], ['Πωλητής ΚΨΜ', 'post:ΠΩΛΗΤΗΣ ΚΨΜ'], ['Σύνολο κωλιωμένων', 'hkcol:sumK'], ['Κανονική άδεια', 'hkcol:ka'], ['Αναρρωτική άδεια', 'hkcol:an'], ['Νοσοκομείο', 'hkcol:nos'], ['Φυλάκιο Κορυφή-900', 'hkcol:fyl'], ['Αγνοούμενοι', 'hkcol:adik'], ['Φύλλα Πορείας', 'hkcol:fp'], ['Σε άλλη Μονάδα', 'hkcol:allh'], ['Σε Εκπαίδευση', 'hkcol:ekp'], ['ΛΑΦ Πόλης', null], ['ΕΚΕ', null], ['Απαλλαγη', 'hkcol:apal'], ['Σύνολο απόντων', 'hkcol:sumA'], ['Διαθέσιμοι για εκπαίδευση', 'hkcol:avail'], ['Μισθοτροφοτηθέντες την προηγούμενη', 'hkcol:ab']];
      cols.forEach((c) => { if (['Σιτιστές - Γραφείς-Μάγειρες', 'Φυλάκιο Κορυφή-900', 'Σε ειδική Υπηρεσίας', 'Εποπτ. ΚΨΜ - Εστιατ.'].includes(c[0])) items.push(); });
      const rows: [string, Cn | Cn[]][] = [['Ταγματάρχες', 'hkrow:Επίλαρχοι'], ['Λοχαγοί', 'hkrow:Ίλαρχοι'], ['Υπολοχαγοί', 'hkrow:Ανθυπίλαρχοι-Ανθλγοι'], ['Ανθυπολοχαγοί', 'hkrow:Ανθυπίλαρχοι-Ανθλγοι'], ['Ανθυπασπιστές', 'hkrow:Ανθυπασπιστές'], ['ΔΕΑ', 'hkrow:ΔΕΑ'], ['Αλχίες (M/ΕΜΘ)', 'hkrow:Αρχιλοχίες'], ['Επχίες (M/ΕΜΘ)', 'hkrow:Επιλοχίες'], ['Λχίες (Μ)', 'hkrow:Λοχίες'], ['Λχίες (ΕΠΟΠ)', 'hkrow:Λοχίες'], ['Δεκανείς (ΕΠΟΠ/ΕΦ)', 'hkrow:Δεκανείς'], ['Στρατιώτες (ΕΠΟΠ/ΕΦ)', 'hkrow:Στρατιώτες'], ['Άθροιση', 'total:sum']] as [string, Cn][];
      s.put(0, 0, '50η ΕΜΑ'); big('Ημερήσια αναφορά', 1, 2, 8);
      const n0 = items.length;
      mk(cols, [['ΔΥΝΑΜΗ', 2, 3], ['ΚΩΛΥΟΜΕΝΟΙ', 5, 13], ['ΑΠΕΣΠΑΣΜΕΝΟΙ', 20, 22]], 3, 3, 'ΒΑΘΜΟΙ', rows as [string, Cn][], true, 1, 0);
      // texts of these columns as in the file are compound or custom: a SURE answer is a mistake
      for (const it of items.slice(n0)) if (it.what === 'col' && it.concept === 'hkcol:fyl') it.maxLevel = 'suggest';
      for (const it of items.slice(n0)) if (it.what === 'row' && /Λχίες \(ΕΠΟΠ\)|Λχίες \(Μ\)|ΕΜΘ|ΕΠΟΠ\/ΕΦ/.test(String((it as Item).concept))) { /* qualifiers: the row text decides below */ }
      items.slice(n0).filter(x => x.what === 'row').forEach((x, i) => { if (/\(/.test(rows[i][0]) || /Υπολοχαγοί/.test(rows[i][0])) x.maxLevel = 'suggest'; });
      desc.push('99 ΜΟΝΑΔΑ: στήλες με δικές της λέξεις και γραμμές με παρενθέσεις');
      const b = new S(wb.addWorksheet('ΜΕΤΑΒΟΛΕΣ'));
      [['1. ΕΓΓΡΑΦΕΣ:', 'label:enroll'], ['2. ΔΙΑΓΡΑΦΕΣ:', 'label:delete'], ['3. ΛΟΙΠΑ:', 'label:misc']].forEach(([t, c], i) => { b.put(4 + i * 6, 5, t); b.merge(4 + i * 6, 5, 4 + i * 6, 8); b.put(4 + i * 6, 9, 'ΕΙΣΗΓΗΣΗ'); b.put(5 + i * 6, 5, 'α. Στρτης (ΤΘ) ' + fake(i)); items.push({ shape: 'label', what: 'labelConcept', sheet: 'ΜΕΤΑΒΟΛΕΣ', r: 4 + i * 6, c: 5, concept: c }, { shape: 'label', what: 'label', sheet: 'ΜΕΤΑΒΟΛΕΣ', r: 4 + i * 6, c: 5, value: { r: 5 + i * 6, c: 5 }, concept: c }); });
    } else {
      // ΗΚΑΛ whose cells count the sheet «Παρουσιολόγιο»
      const dn = 'Παρουσιολόγιο'; const st: [string, string, string][] = [['Κανονικες Άδειες', 'hkcol:ka', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'], ['Αναρρωτικές Άδειες', 'hkcol:an', 'ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ'], ['Άδεια Εορταστική', 'status:ΕΟΡΤΑΣΤΙΚΗ ΑΔΕΙΑ', 'ΕΟΡΤΑΣΤΙΚΗ ΑΔΕΙΑ'], ['Ειδικές Άδειες', 'hkcol:eid', 'ΕΙΔΙΚΗ ΑΔΕΙΑ'], ['Νοσοκομείο ΧΧ - ΕΥ', 'hkcol:nos', 'ΝΟΣΟΚΟΜΕΙΟ ΚΩ - ΕΥ'], ['401 ΓΣΝΑ', 'hkcol:nos', '401 ΓΣΝΑ'], ['Εκπαίδευση', 'hkcol:ekp', 'ΕΚΠΑΙΔΕΥΣΗ'], ['Απόσπαση - Διάθεση', 'hkcol:allh', 'ΑΠΟΣΠΑΣΗ - ΔΙΑΘΕΣΗ'], ['Φύλλα Πορείας', 'hkcol:fp', 'ΦΥΛΛΟ ΠΟΡΕΙΑΣ'], ['Φυλάκιο - Ράχη', 'hkcol:fyl', 'ΦΥΛΑΚΙΟ - ΠΕΡΙΠΟΛΟ'], ['Βραχονησίδα', null as unknown as string, 'ΒΡΑΧΟΝΗΣΙΔΑ'], ['Απαλλαγή', 'hkcol:apal', 'ΑΠΑΛΛΑΓΗ'], ['Καραντίνα', 'status:ΚΑΡΑΝΤΙΝΑ', 'ΚΑΡΑΝΤΙΝΑ'], ['Αδικαιολογήτως Απών', 'hkcol:adik', 'ΑΔΙΚΑΙΟΛΟΓΗΤΩΣ ΑΠΩΝ']];
      const rk: [string, Cn, string][] = [['Αντισυνταγματάρχες', 'rank:ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΗΣ', 'ΑΝΧΗΣ'], ['Ταγματάρχες', 'hkrow:Επίλαρχοι', 'ΤΧΗΣ'], ['Λοχαγοί', 'hkrow:Ίλαρχοι', 'ΛΓΟΣ'], ['Υπολοχαγοί', 'hkrow:Ανθυπίλαρχοι-Ανθλγοι', 'ΥΠΛΓΟΣ'], ['Ανθυπολοχαγοί', 'hkrow:Ανθυπίλαρχοι-Ανθλγοι', 'ΑΝΘΛΓΟΣ'], ['Ανθυπασπιστές', 'hkrow:Ανθυπασπιστές', 'ΑΝΘΣΤΗΣ'], ['ΔΕΑ', 'hkrow:ΔΕΑ', 'ΔΕΑ'], ['ΣΥΝΟΛΟ ΑΞΚΩΝ', 'total:officers', ''], ['Αρχιλοχίες', 'hkrow:Αρχιλοχίες', 'ΑΛΧΙΑΣ'], ['Επιλοχίες', 'hkrow:Επιλοχίες', 'ΕΠΧΙΑΣ'], ['Λοχίες', 'hkrow:Λοχίες', 'ΛΧΙΑΣ'], ['Δεκανείς', 'hkrow:Δεκανείς', 'ΔΝΕΑΣ'], ['Εποπ Στρ', 'hkrow:ΕΠΟΠ Στρατιώτης', 'ΕΠΟΠ ΣΤΡΤΗΣ'], ['Στρατιώτες', 'hkrow:Στρατιώτες', 'ΣΤΡΤΗΣ'], ['ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', 'total:soldiers', ''], ['ΓΕΝΙΚΟ ΣΥΝΟΛΟ', 'total:grand', '']];
      const cols: [string, Cn][] = [['Προβλεπόμενοι στη Συνθεση', 'hkcol:prov'], ['Τοποθετημένοι', 'hkcol:placed'], ['Προσκολλημένοι', 'hkcol:attached'], ['ΣΥΝΟΛΟ', 'hkcol:sum'], ...st.map(x => [x[0], x[1] as Cn] as [string, Cn]), ['ΣΥΝΟΛΟ', 'hkcol:sumA'], ['Διαθέσιμοι για Εκπαίδευση', 'hkcol:avail'], ['Μισθοτροφοδοτηθέντες την Προηγούμενη', 'hkcol:ab']];
      s.put(0, 0, '98 ΜΟΝΑΔΑ'); s.put(3, 0, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ΛΟΧΟΥ'); items.push({ shape: 'label', what: 'label', sheet: s.ws.name, r: 3, c: 0, value: { r: 3, c: 0 }, concept: 'label:title' });
      const n0 = items.length; const fr = mk(cols, [['ΔΥΝΑΜΗ', 1, 3], ['ΑΠΟΝΤΕΣ', 4, 17]], 6, 2, 'ΒΑΘΜΟΣ', rk.map(x => [x[0], x[1]] as [string, Cn]), false, 1, 0);
      items.slice(n0).forEach(x => { if (x.what === 'col' && (x.concept === 'hkcol:nos' && /ΚΩ|401/.test('') )) x.maxLevel = undefined; if (x.what === 'row' && x.concept === 'hkrow:Ανθυπίλαρχοι-Ανθλγοι' && x.r === fr + 3) x.maxLevel = 'suggest'; });
      // the counting formulas
      const sh = dn + '!'; const rc = 'C', sc = 'F'; const dataTop = 7;
      rk.forEach(([, , w], i) => { if (!w) return; s.put(fr + i, 2, 0, { f: 'COUNTIF(' + sh + rc + ':' + rc + ',"' + w + '")' }); st.forEach((x, k) => s.put(fr + i, 4 + k, 0, { f: 'COUNTIFS(' + sh + rc + ':' + rc + ',"' + w + '",' + sh + sc + ':' + sc + ',"' + x[2] + '")' })); });
      const p = new S(wb.addWorksheet(dn)); ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο-Σ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΚΑΤΑΣΤΑΣΗ', 'ΑΜ', 'ΤΗΛΕΦΩΝΟ', 'ΕΙΔΙΚΟΤΗΤΑ - ΕΣΣΟ', 'ΗΜ. ΑΠΟΛ'].forEach((t, i) => { p.put(dataTop - 1, 1 + i, t, { b: true }); });
      const pc = [['aa', 1], ['rank', 2], ['spec', 3], ['name', 4], ['status', 5], ['asm', 6], ['phone', 7]] as const;
      for (let i = 0; i < 20; i++) { p.put(dataTop + i, 1, i + 1); p.put(dataTop + i, 2, pick(r, rk.map(x => x[2]).filter(Boolean))); p.put(dataTop + i, 3, 'ΜΧ'); p.put(dataTop + i, 4, fake(i)); p.put(dataTop + i, 5, pick(r, st.map(x => x[2]))); p.put(dataTop + i, 6, '2' + i); }
      void pc;
      // lookup lists to the right + data validation
      const lk = ['ΒΑΘΜΟΣ', 'Ο-Σ', '', 'ΚΑΤΑΣΤΑΣΗ']; lk.forEach((t, i) => t && p.put(dataTop - 1, 12 + i, t, { b: true })); st.forEach((x, i) => p.put(dataTop + i, 15, x[2])); p.list(dataTop, 5, dataTop + 19, 5, '$P$' + (dataTop + 1) + ':$P$' + (dataTop + st.length));
      const rf = { r: fr, c: 1 };
      items.push({ shape: 'formula', what: 'driven', sheet: s.ws.name, geom: 'dataSheet', ref: rf, value: dn }, { shape: 'formula', what: 'driven', sheet: s.ws.name, geom: 'rankCol', ref: rf, value: 2 }, { shape: 'formula', what: 'driven', sheet: s.ws.name, geom: 'statusCol', ref: rf, value: 5 });
      rk.forEach(([, , w], i) => { if (w) items.push({ shape: 'formula', what: 'driven', sheet: s.ws.name, geom: 'rankWord', r: fr + i, ref: rf, concept: RANK_WORDS['hkrow:' + rk[i][1]]?.[1] || null, value: w }); });
      items.push(...[['ΒΑΘΜΟΣ', 'person:rank', 2], ['Ο-Σ', 'person:spec', 3], ['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'person:name', 4], ['ΚΑΤΑΣΤΑΣΗ', 'person:status', 5], ['ΑΜ', 'person:asm', 6], ['ΤΗΛΕΦΩΝΟ', 'person:phone', 7]].map(([, cn, c]) => ({ shape: 'list' as const, what: 'col' as const, sheet: dn, c: c as number, concept: cn as string, ref: { r: dataTop, c: 1 } })), { shape: 'list', what: 'geom', geom: 'first', sheet: dn, ref: { r: dataTop, c: 1 }, value: dataTop }, { shape: 'list', what: 'geom', geom: 'last', sheet: dn, ref: { r: dataTop, c: 1 }, value: dataTop + 19 });
      desc.push('ΗΚΑΛ 98 ΜΟΝΑΔΑ με COUNTIFS πάνω από το Παρουσιολόγιο');
    }
  } else if (kind === 'real-ypiresies') {
    const s = new S(wb.addWorksheet('Φύλλο1'));
    renderGridFixed(r, s, items, desc);
    wb.addWorksheet('Φύλλο2'); wb.addWorksheet('Φύλλο3');
  } else if (kind === 'real-ypiresies-kath') {
    renderServiceList(r, wb, 'ΚΥ 1', 4, 0, items, desc, true);
    const w = wb.addWorksheet('ΘΑΛΑΜΙΖΟΜΕΝΟΙ Δ.Σ'); const s = new S(w);
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΥΠΗΡΕΣΙΑ', 'Στήλη3', 'Στήλη1', 'Στήλη2'].forEach((t, i) => s.put(12, i, t, { b: true }));
    for (let i = 0; i < 40; i++) { s.put(13 + i, 0, i + 1); s.put(13 + i, 1, 'ΒΑΘΜΟΣ', { f: 'IF(C' + (14 + i) + '<>"",VLOOKUP(C' + (14 + i) + ',ΛΙΣΤΑ!D:H,5,0),"")' }); s.put(13 + i, 2, i % 3 ? fake(i) : null); }
    items.push(...['person:aa', 'person:rank', 'person:name', 'person:duty', null, null, null].map((cn, i) => ({ shape: 'list' as const, what: 'col' as const, sheet: 'ΘΑΛΑΜΙΖΟΜΕΝΟΙ Δ.Σ', c: i, concept: cn, ref: { r: 13, c: 0 } })), { shape: 'list', what: 'geom', geom: 'first', sheet: 'ΘΑΛΑΜΙΖΟΜΕΝΟΙ Δ.Σ', ref: { r: 13, c: 0 }, value: 13 }, { shape: 'list', what: 'geom', geom: 'last', sheet: 'ΘΑΛΑΜΙΖΟΜΕΝΟΙ Δ.Σ', ref: { r: 13, c: 0 }, value: 52 });
    const h = wb.addWorksheet('Φύλλο1'); h.state = 'hidden';
  } else if (kind === 'real-dynamologio') {
    const s = new S(wb.addWorksheet('ΑΛΦΑΒΗΤΙΚΗ ΚΑΤΑΣΤΑΣΗ '));
    ['α/α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑ', 'ΕΠΩΝΥΜΟ', 'ΙΛΗ', 'ΚΑΤΑΣΤΑΣΗ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'].forEach((t, i) => s.put(1, i, t, { b: true }));
    const cn = ['person:aa', 'person:rank', 'person:first', 'person:last', 'person:sub', 'person:status', 'person:remarks'];
    for (let i = 0; i < 60; i++) { s.put(2 + i, 0, i + 1); s.put(2 + i, 1, pick(r, ['ΑΝΧΗΣ', 'ΕΠΧΟΣ', 'ΙΛΧΟΣ', 'ΙΛΧΟΣ (ΑΤΘ)'])); if (i % 9 !== 7) { s.put(2 + i, 2, 'ΟΝΟΜΑ' + i); s.put(2 + i, 3, 'ΕΠΩΝΥΜΟ' + i); } s.put(2 + i, 4, pick(r, ['ΕΠ.', 'Δ/Σ', '2'])); s.put(2 + i, 5, pick(r, ['ΠΑΡΩΝ', 'ΔΙΑΘΕΣΗ', 'ΑΠΩΝ'])); }
    cn.forEach((c, i) => items.push({ shape: 'list', what: 'col', sheet: 'ΑΛΦΑΒΗΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ', c: i, concept: c, ref: { r: 2, c: 0 } }));
    items.push({ shape: 'list', what: 'geom', geom: 'first', sheet: 'ΑΛΦΑΒΗΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ', ref: { r: 2, c: 0 }, value: 2 }, { shape: 'list', what: 'geom', geom: 'last', sheet: 'ΑΛΦΑΒΗΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ', ref: { r: 2, c: 0 }, value: 61 });
    // the ΔΚΤΗΣ sheet: blocks of rank-groups × units
    const d = new S(wb.addWorksheet('ΔΚΤΗΣ ')); const blocks = [['ΠΑΡΟΝΤΕΣ', 18], ['ΑΠΟΝΤΕΣ', 26]] as const;
    blocks.forEach(([title, y0]) => { d.put(y0 - 1, 1, title, { b: true }); ['1η ΙΛΗ', '2η ΙΛΗ', '3η ΙΛΗ', 'ΙΛΗ Δ/Σ', 'ΕΠΙΤΕΛΕΙΟ', 'ΣΥΝΟΛΟ'].forEach((t, i) => { d.put(y0, 3 + i, t, { b: true }); items.push({ shape: 'matrix', what: 'col', sheet: 'ΔΚΤΗΣ ', c: 3 + i, concept: i === 5 ? ['total:sum', 'hkcol:sum'] : null, ref: { r: y0 + 1, c: 1 } }); }); [['ΑΞΚΟΙ', 'group:officers'], ['ΑΝΘΣΤΕΣ', 'hkrow:Ανθυπασπιστές'], ['ΥΠΑΞ-ΟΒΑ', null], ['ΣΤΡ', ['rank:ΣΤΡΑΤΙΩΤΗΣ', 'hkrow:Στρατιώτες'] as unknown as string], ['ΣΥΝΟΛΟ', 'total:sum']].forEach(([t, c], i) => { d.put(y0 + 1 + i, 1, t); items.push({ shape: 'matrix', what: 'row', sheet: 'ΔΚΤΗΣ ', r: y0 + 1 + i, concept: c as Cn, ref: { r: y0 + 1, c: 1 } }); for (let k = 0; k < 5; k++) d.put(y0 + 1 + i, 3 + k, int(r, 0, 20)); }); items.push({ shape: 'matrix', what: 'geom', geom: 'first', sheet: 'ΔΚΤΗΣ ', ref: { r: y0 + 1, c: 1 }, value: y0 + 1 }, { shape: 'matrix', what: 'geom', geom: 'last', sheet: 'ΔΚΤΗΣ ', ref: { r: y0 + 1, c: 1 }, value: y0 + 5 }); });
  } else if (kind === 'real-oplismos') {
    const mk = (name: string, h: string[], cn: Cn[], rows: number, top: number) => { const s = new S(wb.addWorksheet(name)); s.put(top - 3, 6, 'ΜΟΝΑΔΑ: 99 ΜΟΝΑΔΑ'); h.forEach((t, i) => { s.put(top, i, t, { b: true, box: true }); items.push({ shape: 'list', what: 'col', sheet: name, c: i, concept: cn[i], ref: { r: top + 2, c: 0 } }); }); for (let i = 0; i < rows; i++) { s.put(top + 2 + i, 0, i + 1); s.put(top + 2 + i, 1, '_'); s.put(top + 2 + i, 3, 'G3A3'); s.put(top + 2 + i, 4, 100000 + i); s.put(top + 2 + i, 5, 'ΚΙΒΩΤΙΟ ' + i); s.put(top + 2 + i, 6, pick(r, ['ΧΡΕΩΜΕΝΟ', 'ΑΧΡΕΩΤΟ'])); } items.push({ shape: 'list', what: 'geom', geom: 'first', sheet: name, ref: { r: top + 2, c: 0 }, value: top + 2 }, { shape: 'list', what: 'geom', geom: 'last', sheet: name, ref: { r: top + 2, c: 0 }, value: top + 1 + rows }); };
    mk('G3A3', ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΘΕΣΗ ΣΤΟΝ ΟΠΛΟΒΑ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ['person:aa', 'person:rank', 'person:name', 'weapon:type', 'weapon:number', 'weapon:slot', 'person:remarks'], 63, 4);
    mk('ΑΠΟΝΤΩΝ', ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΘΕΣΗΣ ΟΠΛΟΥ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ['person:aa', 'person:rank', 'person:name', 'weapon:type', 'weapon:number', 'weapon:slot', 'person:remarks'], 40, 8);
    mk('ΠΟΛ MG3', ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΚΑΝΗΣ', 'ΑΡΙΘΜΟΣ ΕΦΕΔΡΙΚΗΣ ΚΑΝΗΣ'], ['person:aa', 'person:rank', 'person:name', 'weapon:type', 'weapon:number', 'weapon:barrel', 'weapon:spareBarrel'], 6, 4);
    const h = wb.addWorksheet('Φύλλο1'); h.state = 'hidden';
  }
}
// the monthly duty file as in the real unit: «A/A, ΟΝΟΝ/ΜΟ, Ι, ΠΟΣΤΟ, ΙΛΗ, ΕΣΣΟ, 1…30, Σ, ΚΑ, ΕΤΑΠ, ΤΙΜ», merged leave spans
function renderGridFixed(r: Rnd, s: S, items: Item[], desc: string[]) {
  const name = s.ws.name; const hdr = ['A/A', 'ΟΝΟΝ/ΜΟ', 'Ι', 'ΠΟΣΤΟ', 'ΙΛΗ', 'ΕΣΣΟ']; const cn: Cn[] = ['person:aa', 'person:name', 'person:si', 'person:post', 'person:sub', 'person:essos'];
  s.put(0, 2, 'ΥΠΗΡΕΣΙΕΣ ΟΠΛΙΤΩΝ'); s.merge(0, 2, 0, 31); s.put(0, 37, 'ΑΔΕΙΕΣ'); s.merge(0, 37, 0, 39);
  hdr.forEach((t, i) => { s.put(1, i, t, { b: true, box: true }); items.push({ shape: 'grid', what: 'col', sheet: name, c: i, concept: cn[i] === 'person:si' ? ['person:si', null as unknown as string] : cn[i], maxLevel: undefined, ref: { r: 1, c: 0 } }); });
  for (let d = 0; d < 30; d++) s.put(1, 6 + d, d + 1, { b: true, box: true });
  [['Σ', null], ['ΚΑ', 'hkcol:ka'], ['ΕΤΑΠ', null], ['ΤΙΜ', null]].forEach(([t, c], i) => { s.put(1, 36 + i, t as string, { b: true }); items.push({ shape: 'grid', what: 'col', sheet: name, c: 36 + i, concept: c as Cn, ref: { r: 1, c: 0 } }); });
  const n = 70; let spans = 0;
  for (let i = 0; i < n; i++) { s.put(2 + i, 0, i + 1); s.put(2 + i, 2, pick(r, ['Ι3', 'Ι4'])); s.put(2 + i, 3, pick(r, ['ΑΟΠΛΟΣ', 'ΜΑΓΕΙΡΑΣ'])); s.put(2 + i, 4, 'Δ/Σ'); s.put(2 + i, 5, pick(r, ['Α', 'Β', 'Γ']));
    for (let d = 0; d < 30; d++) if (chance(r, 0.5)) s.put(2 + i, 6 + d, pick(r, CODES));
    s.put(2 + i, 36, 0, { f: 'COUNTIF(G' + (3 + i) + ':AJ' + (3 + i) + ',"ΕΞ")' });
    if (i % 25 === 0) { s.put(2 + i, 6, 'ΑΔΕΙΑ ΑΠΟΛΥΣ'); s.merge(2 + i, 6, 2 + i, 15); items.push({ shape: 'grid', what: 'span', sheet: name, r: 2 + i, c: 6, c2: 15, ref: { r: 1, c: 0 } }); spans++; } }
  items.push({ shape: 'grid', what: 'geom', geom: 'header', sheet: name, ref: { r: 1, c: 0 }, value: 1 }, { shape: 'grid', what: 'geom', geom: 'firstDay', sheet: name, ref: { r: 1, c: 0 }, value: 6 }, { shape: 'grid', what: 'geom', geom: 'days', sheet: name, ref: { r: 1, c: 0 }, value: 30 }, { shape: 'grid', what: 'geom', geom: 'people', sheet: name, ref: { r: 1, c: 0 }, value: n });
  desc.push('μηνιαίο πλέγμα, ' + spans + ' διαστήματα');
}

// ------------------------------------------------------------------ special files
export async function emptyWorkbook(): Promise<Buffer> { const wb = new ExcelJS.Workbook(); wb.addWorksheet('Φύλλο1'); return Buffer.from(await wb.xlsx.writeBuffer()); }
export async function bigRoster(rows: number): Promise<{ buf: Buffer; first: number; last: number }> {
  const r = rng(77); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ΔΥΝΑΜΟΛΟΓΙΟ'); const s = new S(ws);
  ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΑΛΑΜΟΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'].forEach((t, i) => s.put(2, i, t, { b: true }));
  for (let i = 0; i < rows; i++) { const y = 3 + i; s.put(y, 0, i + 1); s.put(y, 1, pick(r, RANKV)); s.put(y, 2, pick(r, LAST)); s.put(y, 3, pick(r, FIRST)); s.put(y, 4, pick(r, FIRST)); s.put(y, 5, '2' + i); s.put(y, 6, '69' + int(r, 10000000, 99999999)); s.put(y, 7, int(r, 1, 12)); }
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), first: 3, last: 2 + rows };
}

// ================================================================== PR 2: profiles, safe writes, roster edge cases
// ---- a modified copy of the same template (pure data on the sheet model): rows added above, a column added, a sheet renamed
export interface Mod { sheet: string; rowAt: number; rows: number; colAt: number; cols: number; rename?: string; extra?: { r: number; c: number; text: string } }   // extra: a new column next to the table (original coordinates)
const shiftKey = (k: string, m: Mod) => { const [r, c] = k.split(':').map(Number); return (r >= m.rowAt ? r + m.rows : r) + ':' + (c >= m.colAt ? c + m.cols : c); };
export function modifyModel(sheets: SheetModel[], m: Mod): SheetModel[] {
  return sheets.map(s => {
    if (s.name !== m.sheet) return s;
    const base = s.rows.map(row => [...(row || [])]);
    if (m.extra) { while (base.length <= m.extra.r) base.push([]); base[m.extra.r][m.extra.c] = m.extra.text; }
    const rows = base.map(row => { const x = row; if (m.cols && x.length > m.colAt) x.splice(m.colAt, 0, ...Array(m.cols).fill(undefined)); return x; });
    rows.splice(Math.min(m.rowAt, rows.length), 0, ...Array.from({ length: m.rows }, () => [] as never[]));
    const sr = (r: number) => (r >= m.rowAt ? r + m.rows : r), sc = (c: number) => (c >= m.colAt ? c + m.cols : c);
    return {
      ...s, name: m.rename || s.name, rows,
      fx: new Set([...s.fx].map(k => shiftKey(k, m))), formulas: new Map([...s.formulas].map(([k, v]) => [shiftKey(k, m), v])),
      merges: s.merges.map(x => ({ r1: sr(x.r1), r2: sr(x.r2), c1: sc(x.c1), c2: x.c2 >= m.colAt ? x.c2 + m.cols : x.c2 })),
      validations: s.validations.map(x => ({ ...x, r1: sr(x.r1), r2: sr(x.r2), c1: sc(x.c1), c2: x.c2 >= m.colAt ? x.c2 + m.cols : x.c2 }))
    };
  });
}
// where a truth item is after the modification
export const movedItem = (it: Item, m: Mod): { sheet: string; r?: number; c?: number } => ({ sheet: it.sheet, ...(it.r != null ? { r: it.r >= m.rowAt ? it.r + m.rows : it.r } : {}), ...(it.c != null ? { c: it.c >= m.colAt ? it.c + m.cols : it.c } : {}) });
// the concepts a mock file really contains (columns, rows, labels with one known concept): two files with a different set are different templates
export const conceptSet = (items: Item[]): Set<string> => new Set(items.filter(i => (i.what === 'col' || i.what === 'row' || i.what === 'labelConcept') && typeof i.concept === 'string').map(i => i.concept as string));

// ---- roster edge cases with ground truth
export interface EdgePerson { r: number; asm: string; kind: 'cadre' | 'soldier' | 'ask'; group?: string }
export interface EdgeRoster { buf: Buffer; people: EdgePerson[]; vacant: number; mode: string; desc: string[] }
const E_CADRE = ['ΤΧΗΣ', 'ΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΑΝΘΛΓΟΣ', 'ΑΝΘΣΤΗΣ', 'ΑΛΧΙΑΣ', 'ΕΠΧΙΑΣ', 'ΕΠΟΠ ΔΝΕΑΣ'], E_SOLD = ['ΣΤΡΤΗΣ', 'ΣΤΡΤΗΣ', 'ΥΔΝΕΑΣ'], E_ASK = ['ΛΧΙΑΣ', 'ΔΝΕΑΣ', 'ΞΧΖ'];
export async function genRosterEdge(seed: number): Promise<EdgeRoster> {
  const r = rng(seed * 6007 + 41); const wb = new ExcelJS.Workbook(); const s = new S(wb.addWorksheet(pick(r, ['ΔΥΝΑΜΟΛΟΓΙΟ', 'Φύλλο1', 'ΣΥΝΟΛΙΚΟ'])));
  const mode = pick(r, ['split3', 'split2', 'one', 'dash'] as const); const asmH = pick(r, ['ΑΣΜ', 'ΑΜ', 'Α.Σ.Μ.']);
  const heads: string[] = ['Α/Α', 'ΒΑΘΜΟΣ'];
  if (mode === 'split3') heads.push('ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ'); else if (mode === 'split2') heads.push('ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'); else if (mode === 'one') heads.push('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); else heads.push('ΕΠΩΝΥΜΟ - ΟΝΟΜΑ');
  heads.push(asmH); if (chance(r, 0.5)) heads.push('ΤΗΛΕΦΩΝΟ');
  const left = int(r, 0, 2); let y = int(r, 0, 3); const w = heads.length;
  const desc: string[] = [mode, asmH];
  if (chance(r, 0.5)) { s.put(y, left, 'ΚΑΤΑΣΤΑΣΗ ΠΡΟΣΩΠΙΚΟΥ'); s.merge(y, left, y, left + w - 1); y += 1; desc.push('τίτλος'); }
  const header = () => { heads.forEach((t, i) => s.put(y, left + i, t, { b: true, box: true })); y++; };
  header();
  const page = chance(r, 0.6) ? int(r, 10, 22) : 0; const groups = chance(r, 0.5); const gsize = int(r, 6, 15);
  const n = int(r, 25, 70); const people: EdgePerson[] = []; let vacant = 0; let group: string | undefined; let onPage = 0; let k = 0; let inGroup = 0; let gi = 0;
  if (page) desc.push('επικεφαλίδα ανά σελίδα'); if (groups) desc.push('τίτλοι ομάδων');
  while (k < n) {
    if (groups && inGroup === 0) {
      if (gi > 0 && chance(r, 0.5)) { s.put(y, left + 1, 'ΣΥΝΟΛΟ ΟΜΑΔΑΣ'); s.put(y, left + w - 1, gsize); y++; }
      group = pick(r, ['ΙΛΗ ', 'ΟΥΛΑΜΟΣ ', 'ΛΟΧΟΣ ']) + (gi + 1); gi++; s.put(y, left, group); s.merge(y, left, y, left + w - 1); y++;
    }
    if (page && onPage >= page) { if (chance(r, 0.5)) y++; if (chance(r, 0.4)) { s.put(y, left, 'ΣΕΛΙΔΑ ' + int(r, 2, 9)); s.merge(y, left, y, left + w - 1); y++; } header(); onPage = 0; }
    if (chance(r, 0.07)) { y++; continue; }                                                     // blank separator row
    k++; onPage++; inGroup = groups ? (inGroup + 1) % gsize : 0;
    const roll = r(); const rank = roll < 0.4 ? pick(r, E_CADRE) : roll < 0.8 ? pick(r, E_SOLD) : pick(r, E_ASK);
    const kind: EdgePerson['kind'] = E_CADRE.includes(rank) ? 'cadre' : E_SOLD.includes(rank) ? 'soldier' : 'ask';
    const asm = '2' + int(r, 10, 99) + '/' + (1000 + k) + '/2' + int(r, 0, 6);
    if (chance(r, 0.08)) { s.put(y, left, k); s.put(y, left + 1, pick(r, E_SOLD)); s.put(y, left + 2 + (mode.startsWith('split') ? 0 : 0), null); vacant++; y++; continue; }   // a position without a name
    const L = pick(r, LAST), F = pick(r, FIRST); let c = left;
    s.put(y, c++, k); s.put(y, c++, rank);
    if (mode === 'split3') { s.put(y, c++, L); s.put(y, c++, F); s.put(y, c++, pick(r, FIRST)); } else if (mode === 'split2') { s.put(y, c++, L); s.put(y, c++, F); } else if (mode === 'one') s.put(y, c++, F + ' ' + L); else s.put(y, c++, L + ' ' + F);
    s.put(y, c++, asm); if (heads.length > c - left) s.put(y, c++, '69' + int(r, 10000000, 99999999));
    people.push({ r: y, asm, kind, ...(group ? { group } : {}) }); y++;
  }
  if (chance(r, 0.8)) { y += int(r, 0, 2); s.put(y, left + 1, 'ΣΥΝΟΛΟ ΑΤΟΜΩΝ'); s.put(y, left + w - 1, people.length); y++; desc.push('υποσέλιδο ΣΥΝΟΛΟ'); }
  if (chance(r, 0.5)) { y += 2; s.put(y, left, 'ΥΠΟΜΝΗΜΑ'); s.put(y + 1, left, 'ΕΠΙΛΟΓΗ ΚΑΤΑΣΤΑΣΗΣ'); s.put(y + 2, left, 'ΘΑΛΑΜΟΣ 1'); s.put(y + 2, left + 1, 4); desc.push('πίνακας μετά το σύνολο'); }
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), people, vacant, mode, desc };
}


// ------------------------------------------------------------------ ΗΚΑΙ / ΗΚΑΛ to be FILLED (adaptive fill, PR 3)
// A random unit template with a random app state. The truth of every cell comes from hkaiCounts (the numbers of the bundled form), never from the
// rule engine: plain rows read hkaiCounts.rank, a row narrowed by origin reads the people of hkaiCounts.cols, a row split by rank reads the cadre of
// hkaiCounts.cadre. Variants: own columns (mapped by a profile rule, and unmapped), own rows, rows with words in brackets, missing columns and rows,
// reordered columns, blank/«·» separator columns, totals as formulas / plain numbers / missing, COUNTIFS templates over a data sheet in three
// word styles, Λόχος words.
export interface FillFlags {
  lochos: boolean; own: boolean; originSplit: boolean; rankSplit: boolean; countifs: boolean; totals: 'formulas' | 'numbers' | 'missing';
  seps: boolean; ownCols: number; drop: number; twoHeader: boolean; words: 'abbr' | 'labels' | 'accent'; typo: boolean; dropRows: boolean; unknownRow: boolean; dupHeader: boolean; hospitalSplit: boolean;
}
export interface FillMock {
  seed: number; buf: Buffer; s: AppState; date: ISODate; profile: TplProfile | null; flags: FillFlags; desc: string[]; sheet: string;
  truth: Map<string, number>;                                   // 'r:c' → what the cell must show (hkaiCounts), 0-based
  formulaCells: Set<string>;                                    // cells holding a formula in the template
  unmappedCols: { c: number; text: string; kind: string; data: boolean }[];   // columns the engine must NOT write
  dataSheet?: string;
}
interface Q { force: number; attached: number; st: (k: string) => number }
interface TRow { label: string; q: Q | null; total?: 'officers' | 'soldiers' | 'grand'; word?: string; unknown?: boolean }
interface TCol { kind: 'placed' | 'attached' | 'state' | 'sum' | 'sumK' | 'sumA' | 'avail' | 'own' | 'unmapped' | 'blank' | 'sep'; key?: string; text: string; group: 'force' | 'kol' | 'abs' | null; word?: string; data?: boolean }
const KOL = ['yp', 'ey', 'tim', 'os', 'mag', 'sid', 'kin'], ABS = ['ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh'];
const ACC_RANK: Record<string, string> = { 'Επίλαρχοι': 'Ταγματάρχης', 'Ίλαρχοι': 'Λοχαγός', 'Ανθυπίλαρχοι-Ανθλγοι': 'Ανθυπολοχαγός', 'Ανθυπασπιστές': 'Ανθυπασπιστής', 'ΔΕΑ': 'ΔΕΑ', 'Αρχιλοχίες': 'Αρχιλοχίας', 'Επιλοχίες': 'Επιλοχίας', 'Λοχίες': 'Λοχίας', 'Δεκανείς': 'Δεκανέας', 'ΕΠΟΠ Στρατιώτης': 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης': 'ΟΒΑ Στρατιώτης', 'Στρατιώτες': 'Στρατιώτης', 'Ειδικοί Οδηγοί': 'ΕΙΔ ΟΔΗΓΟΣ' };
const ACC_STATUS: Record<string, string> = { ka: 'Κανονική Άδεια', an: 'Αναρρωτική Άδεια', eid: 'Ειδική Άδεια', nos: 'Νοσοκομείο', apal: 'Απαλλαγή', ekp: 'Εκπαίδευση', fp: 'Φύλλο Πορείας', adik: 'Αδικαιολογήτως Απών' };
const OWN_COLS: { text: string; key?: string; split?: boolean }[] = [{ text: 'Βραχονησίδα', key: 'fyl' }, { text: 'Σιτιστές - Γραφείς - Μάγειρες', key: 'mag' }, { text: 'ΛΑΦ Πόλης' }, { text: 'ΕΚΕ' }, { text: 'Σε ειδική Υπηρεσίας' }];

export async function genFillMock(seed: number, force: Partial<FillFlags> = {}): Promise<FillMock> {
  const r = rng(seed * 6700417 + 91);
  const f: FillFlags = {
    lochos: chance(r, 0.3), own: chance(r, 0.3), originSplit: false, rankSplit: false, countifs: chance(r, 0.25),
    totals: pick(r, ['formulas', 'formulas', 'numbers', 'missing'] as const), seps: chance(r, 0.35), ownCols: pick(r, [0, 0, 1, 2]), drop: int(r, 0, 4), twoHeader: chance(r, 0.5),
    words: pick(r, ['abbr', 'labels', 'accent'] as const), typo: chance(r, 0.2), dropRows: chance(r, 0.3), unknownRow: chance(r, 0.15), dupHeader: chance(r, 0.15), hospitalSplit: chance(r, 0.15), ...force
  };
  if (!f.countifs && !force.originSplit) f.originSplit = chance(r, 0.3);
  if (f.countifs) f.originSplit = false;
  if (!f.originSplit && f.lochos && !force.rankSplit) f.rankSplit = chance(r, 0.5);
  const s = genHkState(seed, { own: f.own, lochos: f.lochos, cadre: !f.originSplit, nofixed: f.originSplit, attached: f.countifs ? chance(r, 0.2) : true, plainRanks: f.countifs && chance(r, 0.6) });
  const d = DAYS[int(r, 0, 5)]; const h = hkaiCounts(s, d); const lists = s.settings.lists; const desc: string[] = [];
  const stateOf = new Map<number, string>(); for (const [k, ps] of Object.entries(h.cols)) for (const p of ps) stateOf.set(p.id, k);
  const plainQ = (key: string): Q => ({ force: h.rank[key].n, attached: h.rank[key].attached, st: k => h.rank[key].c[k] || 0 });
  const originQ = (key: string, origins: string[]): Q => { const ps = activePeople(s).filter(p => hkRankOf(p.rank, lists, p.origin) === key && origins.includes(p.origin || '')); return { force: ps.length, attached: ps.filter(p => p.attached).length, st: k => ps.filter(p => stateOf.get(p.id) === k).length }; };
  const rankQ = (rank: string): Q => { const cs = (s.cadreList || []).filter(c => c.active && c.rank === rank); return { force: cs.length, attached: 0, st: k => (h.cadre[k] || []).filter(c => c.rank === rank).length }; };
  const lab = (key: string) => (f.lochos ? hkRowName(key, 'lochos') : key);
  const sp = (t: string) => (f.typo ? spell(r, t, { typo: true }) : t);
  const aw = (key: string, rank?: string) => (f.words === 'accent' ? ACC_RANK[key] : f.words === 'abbr' ? (key === 'Ειδικοί Οδηγοί' ? 'ΕΙΔ ΟΔΗΓΟΣ' : RANK_WORDS['hkrow:' + key]?.[0]) : undefined) ?? rank;
  // ---- rows
  const off: TRow[] = [], nco: TRow[] = [];
  for (const key of ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ']) {
    if (f.dropRows && key === 'ΔΕΑ') continue;
    if (key === 'Ανθυπίλαρχοι-Ανθλγοι' && f.rankSplit) { off.push({ label: 'Υπολοχαγοί', q: rankQ('ΥΠΛΓΟΣ'), word: f.words === 'accent' ? 'Υπολοχαγός' : 'ΥΠΛΓΟΣ' }, { label: 'Ανθυπολοχαγοί', q: rankQ('ΑΝΘΛΓΟΣ'), word: f.words === 'accent' ? 'Ανθυπολοχαγός' : 'ΑΝΘΛΓΟΣ' }); continue; }
    off.push({ label: sp(lab(key)), q: plainQ(key), word: aw(key) });
  }
  if (f.unknownRow) { off.splice(2, 0, { label: 'Επικουρικοί', q: null, unknown: true }); desc.push('άγνωστη γραμμή «Επικουρικοί» με στοιχεία'); }
  for (const key of ['Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες', 'Δεκανείς', 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης', 'Στρατιώτες']) {
    if (f.dropRows && key === 'Αρχιλοχίες') continue;
    if (key === 'Λοχίες' && f.originSplit) { nco.push({ label: 'Λχίες (ΕΠΟΠ)', q: originQ(key, ['ΕΠΟΠ']) }, { label: 'Λχίες (ΕΦ/ΟΒΑ)', q: originQ(key, ['ΕΦ', 'ΟΒΑ']) }); continue; }
    nco.push({ label: sp(lab(key)), q: plainQ(key), word: aw(key, key === 'ΕΠΟΠ Στρατιώτης' ? 'ΕΠΟΠ ΣΤΡΤΗΣ' : undefined) });
    if (key === 'Δεκανείς' && f.own) nco.push({ label: 'Ειδικοί Οδηγοί', q: plainQ('Ειδικοί Οδηγοί'), word: aw('Ειδικοί Οδηγοί') });
  }
  const rows: TRow[] = [...off]; if (f.totals !== 'missing') rows.push({ label: pick(r, ['ΣΥΝΟΛΟ ΑΞΚΩΝ', 'Σύνολο αξκων']), q: null, total: 'officers' });
  rows.push(...nco); if (f.totals !== 'missing') rows.push({ label: 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', q: null, total: 'soldiers' }, { label: 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ', q: null, total: 'grand' });
  // ---- columns
  const need = ['placed', 'attached', 'yp', 'ey', 'ka', 'an'];
  const cwords = (k: string) => (f.words === 'accent' ? ACC_STATUS[k] : STATUS_WORDS[k]?.[0]);
  let pool = [...KOL, ...ABS].filter(k => (!f.countifs || cwords(k) || KOL.includes(k)) && HKC.some(c => c.key === k));
  if (f.countifs) pool = pool.filter(k => !!cwords(k) || need.includes(k));
  pool = shuffle(r, pool.filter(k => !need.includes(k))).slice(0, Math.max(0, pool.length - need.length - f.drop)); pool.push(...need.filter(k => k !== 'placed' && k !== 'attached'));
  const def = (k: string) => HKC.find(c => c.key === k)!;
  const nm = (k: string) => sp(pick(r, def(k).names));
  const mk = (k: string, group: TCol['group']): TCol => ({ kind: 'state', key: k, text: nm(k), group, word: cwords(k) });
  const colsT: TCol[] = [];
  colsT.push({ kind: 'placed', text: nm('placed'), group: 'force' }, { kind: 'attached', text: nm('attached'), group: 'force' });
  if (f.totals !== 'missing') colsT.push({ kind: 'sum', text: f.twoHeader ? 'Σύνολο' : 'Σύνολο δύναμης', group: 'force' });
  const ownTaken = new Set<string>(); const ownCols: TCol[] = []; const profileCols: Record<string, unknown> = {};
  const wantOwn = shuffle(r, OWN_COLS).slice(0, f.ownCols);
  for (const o of wantOwn) {
    if (o.key && (pool.includes(o.key) || ownTaken.has(o.key)) && !o.split) { ownCols.push({ kind: 'unmapped', text: o.text, group: KOL.includes(o.key) ? 'kol' : 'abs', data: true }); continue; }
    if (o.key) { ownTaken.add(o.key); ownCols.push({ kind: 'own', key: o.key, text: o.text, group: KOL.includes(o.key) ? 'kol' : 'abs' }); profileCols[phraseKey(o.text)] = { t: 'state', keys: [o.key] }; }
    else ownCols.push({ kind: 'unmapped', text: o.text, group: 'kol', data: true });
  }
  if (f.hospitalSplit && !pool.includes('nos')) ownCols.push({ kind: 'unmapped', text: 'Νοσοκομείο ΧΧ', group: 'abs', data: true }, { kind: 'unmapped', text: '401 ΓΣΝΑ ΧΧ', group: 'abs', data: true });
  else if (f.hospitalSplit) { const i = pool.indexOf('nos'); pool.splice(i, 1); ownCols.push({ kind: 'unmapped', text: 'Νοσοκομείο ΧΧ', group: 'abs', data: true }, { kind: 'unmapped', text: '401 ΓΣΝΑ ΧΧ', group: 'abs', data: true }); }
  const kolK = pool.filter(k => KOL.includes(k)), absK = pool.filter(k => ABS.includes(k));
  const sepCols = (): TCol[] => (f.seps ? (chance(r, 0.5) ? [{ kind: 'sep' as const, text: '·', group: null }] : Array.from({ length: int(r, 2, 3) }, () => ({ kind: 'sep' as const, text: '', group: null }))) : []);
  colsT.push(...sepCols(), ...kolK.map(k => mk(k, 'kol')), ...ownCols.filter(o => o.group === 'kol'));
  if (f.totals !== 'missing') colsT.push({ kind: 'sumK', text: f.twoHeader ? 'Σύνολο' : 'Σύνολο κωλυομένων', group: 'kol' });
  colsT.push(...sepCols(), ...absK.map(k => mk(k, 'abs')), ...ownCols.filter(o => o.group === 'abs'));
  if (f.totals !== 'missing') colsT.push({ kind: 'sumA', text: f.twoHeader ? 'Σύνολο' : 'Σύνολο απόντων', group: 'abs' }, { kind: 'avail', text: 'Διαθέσιμοι για εκπαίδευση', group: null });
  if (f.dupHeader) { const i = colsT.findIndex(c => c.kind === 'state'); if (i >= 0) { colsT.splice(i + 1, 0, { kind: 'unmapped', text: colsT[i].text, group: colsT[i].group, data: true }); desc.push('διπλή επικεφαλίδα'); } }
  if (chance(r, 0.15)) { const i = int(r, 3, colsT.length - 2); if (colsT[i].kind === 'state') colsT.splice(i, 0, { kind: 'blank', text: '', group: colsT[i].group, data: true }); }
  // ---- workbook
  const wb = new ExcelJS.Workbook(); const sheet = pick(r, ['ΚΑΤΑΣΤΑΣΗ', 'Εμπρός Όψη', 'ΗΚΑΙ ' + seed]); const S1 = new S(wb.addWorksheet(sheet));
  const top = int(r, 2, 6), left = int(r, 0, 2); const hdr = f.twoHeader ? 2 : 1; const first = top + hdr;
  const colAt: number[] = []; let x = left + 1; for (let i = 0; i < colsT.length; i++) { colAt.push(x); x++; }
  S1.put(top, left, 'ΒΑΘΜΟΙ', { b: true, box: true }); S1.merge(top, left, top + hdr - 1, left);
  colsT.forEach((c, i) => {
    const cx = colAt[i];
    if (c.kind === 'sep') { if (c.text) S1.put(top, cx, c.text); return; }
    if (hdr === 2 && c.group) {
      const prev = colsT[i - 1], isFirst = !prev || prev.group !== c.group || prev.kind === 'sep';
      if (isFirst) { let j = i; while (j + 1 < colsT.length && colsT[j + 1].group === c.group && colsT[j + 1].kind !== 'sep') j++; S1.put(top, cx, { force: 'ΔΥΝΑΜΗ', kol: 'ΚΩΛΥΟΜΕΝΟΙ', abs: 'ΑΠΟΝΤΕΣ' }[c.group], { b: true, box: true }); S1.merge(top, cx, top, colAt[j]); }
      if (c.text) S1.put(top + 1, cx, c.text, { box: true });
    } else if (c.text) { S1.put(top, cx, c.text, { b: true, box: true }); if (hdr === 2) S1.merge(top, cx, top + 1, cx); }
  });
  const rowAt: number[] = rows.map((_, i) => first + i); const last = first + rows.length - 1;
  const truth = new Map<string, number>(); const formulaCells = new Set<string>(); const stale = () => (chance(r, 0.5) ? int(r, 1, 9) : null);
  const ds = 'Παρουσιολόγιο'; let dataCols: { rank: number; status: number } | null = null;
  const q = (c: TCol, qq: Q): number | null => {
    switch (c.kind) {
      case 'placed': return qq.force - qq.attached; case 'attached': return qq.attached;
      case 'state': case 'own': return qq.st(c.key!);
      case 'sum': return qq.force; case 'sumK': return KOL.reduce((a, k) => a + qq.st(k), 0); case 'sumA': return ABS.reduce((a, k) => a + qq.st(k), 0);
      case 'avail': return qq.force - ABS.reduce((a, k) => a + qq.st(k), 0);
      default: return null;
    }
  };
  // criteria that point at the labels: the word counted is the label itself
  if (f.countifs && f.words === 'labels') { for (const x of rows) if (!x.total && !x.unknown) x.word = x.label; for (const c of colsT) if (c.kind === 'state') c.word = c.text; }
  if (f.countifs) {
    const D = new S(wb.addWorksheet(ds)); const dh = int(r, 1, 4), dl = int(r, 0, 2);
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΚΑΤΑΣΤΑΣΗ', 'ΑΜ', 'ΤΗΛΕΦΩΝΟ'].forEach((t, i) => D.put(dh, dl + i, t, { b: true, box: true }));
    dataCols = { rank: dl + 1, status: dl + 3 };
    const stat = [...new Set(colsT.map(c => c.word).filter(Boolean) as string[]), 'ΠΑΡΩΝ'].join(',');
    const samples = int(r, 5, 12); for (let i = 0; i < samples; i++) { D.put(dh + 1 + i, dl, i + 1); D.put(dh + 1 + i, dl + 1, pick(r, ['ΑΛΛΟΣ ΒΑΘΜΟΣ', 'ΤΧΗΣ', 'ΣΤΡΤΗΣ'])); D.put(dh + 1 + i, dl + 2, 'ΔΕΙΓΜΑ ΟΝΟΜΑ' + i); D.put(dh + 1 + i, dl + 3, 'ΠΑΡΩΝ'); D.put(dh + 1 + i, dl + 4, '9' + i); }
    if (stat.length < 250) D.list(dh + 1, dl + 3, dh + 60, dl + 3, '"' + stat + '"');
    desc.push('COUNTIFS πάνω από «' + ds + '» (' + f.words + ')');
  }
  const hdrLeaf = top + hdr - 1; const refMode = f.countifs && f.words === 'labels';
  const A = (c: number) => '$' + colName(c + 1), Rr = (rr: number) => '$' + (rr + 1);
  rows.forEach((row, i) => {
    const y = rowAt[i]; S1.put(y, left, row.label, { box: true });
    colsT.forEach((c, k) => {
      const cx = colAt[k]; if (c.kind === 'sep') return;
      if (row.total || row.unknown || !row.q) {
        if (row.unknown) { if (c.kind !== 'blank') S1.put(y, cx, int(r, 1, 9), { box: true }); return; }
        // total rows
        if (c.kind === 'blank' || c.kind === 'unmapped') return;
        const members = rows.map((m, j) => ({ m, j })).filter(z => !z.m.total && (row.total === 'grand' || (row.total === 'officers' ? z.j < i : z.j > rows.findIndex(t => t.total === 'officers') && z.j < i)));
        if (f.totals === 'formulas') {
          const run = (a: number, b: number) => (a === b ? colName(cx + 1) + (rowAt[a] + 1) : colName(cx + 1) + (rowAt[a] + 1) + ':' + colName(cx + 1) + (rowAt[b] + 1));
          const oi = rows.findIndex(t => t.total === 'officers'), si = rows.findIndex(t => t.total === 'soldiers');
          const fx = row.total === 'officers' ? 'SUM(' + run(0, oi - 1) + ')' : row.total === 'soldiers' ? 'SUM(' + run(oi + 1, si - 1) + ')' : colName(cx + 1) + (rowAt[oi] + 1) + '+' + colName(cx + 1) + (rowAt[si] + 1);
          S1.put(y, cx, null, { f: fx, box: true }); formulaCells.add(y + ':' + cx);
        } else S1.put(y, cx, stale(), { box: true });
        if (members.some(z => !z.m.q)) return;   // an unknown row inside: no truth
        let sum = 0, ok = true; for (const z of members) { const v = q(c, z.m.q!); if (v == null) ok = false; else sum += v; } if (ok) truth.set(y + ':' + cx, sum);
        return;
      }
      const qq = row.q;
      if (c.kind === 'unmapped' || c.kind === 'blank') { S1.put(y, cx, i % 3 === 0 ? int(r, 1, 9) : stale(), { box: true }); return; }
      let fx: string | undefined;
      const fRef = (cc: number) => colName(colAt[cc] + 1) + (y + 1);
      if (c.kind === 'sum' && f.totals === 'formulas') fx = 'SUM(' + fRef(colsT.findIndex(z => z.kind === 'placed')) + ',' + fRef(colsT.findIndex(z => z.kind === 'attached')) + ')';
      if (c.kind === 'sumK' && f.totals === 'formulas') fx = 'SUM(' + colsT.map((z, j) => (z.kind === 'state' && KOL.includes(z.key!) ? fRef(j) : '')).filter(Boolean).concat(colsT.map((z, j) => (z.kind === 'own' && KOL.includes(z.key!) ? fRef(j) : '')).filter(Boolean)).join(',') + ')';
      if (c.kind === 'sumA' && f.totals === 'formulas') fx = 'SUM(' + colsT.map((z, j) => ((z.kind === 'state' || z.kind === 'own') && ABS.includes(z.key!) ? fRef(j) : '')).filter(Boolean).join(',') + ')';
      if (c.kind === 'avail' && f.totals === 'formulas') fx = fRef(colsT.findIndex(z => z.kind === 'sum')) + '-' + fRef(colsT.findIndex(z => z.kind === 'sumA'));
      if (f.countifs && dataCols && row.word && (c.kind === 'placed' || (c.kind === 'state' && c.word))) {
        const sh = "'" + ds + "'!"; const rc = colName(dataCols.rank + 1), sc = colName(dataCols.status + 1);
        const rcrit = refMode ? A(left) + (y + 1) : '"' + row.word + '"'; const scrit = refMode ? colName(cx + 1) + Rr(hdrLeaf) : '"' + c.word + '"';
        fx = c.kind === 'placed' ? 'COUNTIF(' + sh + rc + ':' + rc + ',' + rcrit + ')' : 'COUNTIFS(' + sh + rc + ':' + rc + ',' + rcrit + ',' + sh + sc + ':' + sc + ',' + scrit + ')';
      }
      if (fx && fx.endsWith('SUM()')) fx = undefined;
      if (fx) { S1.put(y, cx, null, { f: fx, box: true }); formulaCells.add(y + ':' + cx); }
      else S1.put(y, cx, (c.kind === 'sum' || c.kind === 'sumK' || c.kind === 'sumA' || c.kind === 'avail') && f.totals === 'numbers' ? int(r, 1, 30) : stale(), { box: true });
      const v = q(c, qq); if (v != null) truth.set(y + ':' + cx, v);
    });
  });
  S1.put(last + 3, left + 2, 'Αυλώνας, 25/09/26');
  // in COUNTIFS mode a total/derived cell without its parts keeps the template's own meaning: the truth stays the definition (differences must be reported)
  const unmappedCols = colsT.map((c, i) => ({ c: colAt[i], text: c.text, kind: c.kind, data: !!c.data })).filter(c => c.kind === 'unmapped' || c.kind === 'blank');
  const profile: TplProfile | null = Object.keys(profileCols).length ? { v: 1, id: 'hkai-1', kind: f.lochos ? 'hkal' : 'hkai', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], rules: { cols: profileCols, rows: {} } } : null;
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  desc.unshift(JSON.stringify({ ...f, rows: rows.length, cols: colsT.length }));
  return { seed, buf, s, date: d, profile, flags: f, desc, sheet, truth, formulaCells, unmappedCols, ...(f.countifs ? { dataSheet: ds } : {}) };
}
