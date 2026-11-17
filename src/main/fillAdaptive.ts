// The adaptive fill of the ΗΚΑΙ/ΗΚΑΛ: the unit's OWN template (any columns, rows, words) gets the numbers of the day.
//   fillAdaptive(tpl, state, date, profile, opts) → { buffer, report }     every write goes through safeWrite (formulas, labels, merge children are never touched)
//   restoreFormulas(model)   proposes SUM formulas for total cells that lost theirs (a list; applyFormulaFixes applies it, separately and explicitly)
// Rows and columns come from the rule model (src/shared/hkRules.ts) over the same classification hkaiCounts uses. A column or row without a rule
// (a unit's own outpost not mapped yet) is reported and never written. Totals: a cell with a formula is left to the template; without one
// (formulas turned into numbers) the engine computes and writes the number. When the front cells COUNT another sheet (COUNTIF/COUNTIFS over a
// Παρουσιολόγιο) the data sheet is filled with one row per person in the file's own words, so the template's own formulas do the counting.
// After the fill a tiny evaluator (sheetEval.ts) recomputes the template's formulas and compares them with the expected numbers.
// NOT wired into fillHkai: the bundled templates keep their code and stay byte-identical. Coordinates are 0-based.
import { Workbook } from './xlsx';
import { modelOfBuffer } from './bookModel';
import { safeWrite, type PlannedWrite, type Refused, type WriteResult } from './safeWrite';
import { Grid, cellRef, colLetter, key as cellKey, valueText, type SheetModel } from '../shared/sheetModel';
import { buildLexicon, hkRowOfRankId, phraseKey, type Lexicon } from '../shared/lexicon';
import { detectBook, type BookShape, type DrivenCell, type ListRegion, type MatrixRegion, type SheetShape } from '../shared/shape';
import { learnedNames } from '../shared/tplProfile';
import type { TplProfile } from '../shared/tplStore';
import { hkaiClassify, type HkWho } from '../shared/rules';
import { hkRowList, type UserLists } from '../shared/ranks';
import { hkOn, type AppState } from '../shared/domain';
import type { ISODate } from '../shared/dates';
import { ABS_KEYS, expectedCells, HkEngine, KOL_KEYS, mapMatrix, pickFront, unplaced, type FrontMap, type RuleCtx } from '../shared/hkRules';
import { critMatches, Evaluator, UNSUPPORTED } from '../shared/sheetEval';
import { emptyBack, planExtras, type BackReport } from './backFill';
import type { Sig } from '../shared/sigs';
import { HK_COLS } from '../shared/sources';

export interface FillOpts {
  dryRun?: boolean;
  sheet?: string;                         // the front sheet (default: the one with the most ΗΚΑΙ rows)
  lexicon?: Lexicon;
  ours?: Record<string, string>;          // TplProfile.ours
  cross?: boolean;                        // recompute the template's formulas afterwards (default true)
  sigs?: Sig[] | null;                    // the signatures given for this output (else the unit's own of the settings)
  extras?: boolean;                       // the title, date, signatures and the back side (default true)
}
export interface Mismatch { sheet: string; ref: string; expected: number; got: number | string | boolean | null }
export interface FillReport {
  dryRun: boolean;
  front: string | null;                   // the sheet that was filled; null = no ΗΚΑΙ/ΗΚΑΛ table found, nothing written
  written: WriteResult[];
  refused: Refused[];
  kept: number;                           // cells with a formula the template keeps
  unmappedCols: { ref: string; text: string; hasData: boolean; why: string }[];
  unmappedRows: { ref: string; text: string; hasData: boolean; why: string }[];
  unplacedRows: { key: string; n: number }[];          // people no template row counts
  unplacedStates: { key: string; n: number }[];        // people in a state no template column shows
  totalsSkipped: { ref: string; why: string }[];
  data: { sheet: string; rows: number; columns: { rank: string; status: string | null }; vocab: { col: string; text: string; concept: string | null; source: 'formula' | 'list' }[]; unwritable: string[]; cleared: number } | null;
  cross: { checked: number; matched: number; unevaluated: number; mismatches: Mismatch[] };
  warnings: string[];
  ours: Record<string, string>;
  back: BackReport;                       // the back side: sections found, lines placed, lines that continue on another page, what was not written
}
const emptyReport = (dryRun: boolean): FillReport => ({ dryRun, front: null, written: [], refused: [], kept: 0, unmappedCols: [], unmappedRows: [], unplacedRows: [], unplacedStates: [], totalsSkipped: [], data: null, cross: { checked: 0, matched: 0, unevaluated: 0, mismatches: [] }, warnings: [], ours: {}, back: emptyBack() });

// ------------------------------------------------------------------ choosing the front table (hkRules.ts)
export { pickFront };
const lexOf = (lists: UserLists | undefined, profile: TplProfile | null | undefined, given?: Lexicon): Lexicon => given ?? buildLexicon({ lists, ...(profile && Object.keys(profile.words).length ? { learned: learnedNames(profile) } : {}) });

// ------------------------------------------------------------------ the data sheet
// status concepts that name one ΗΚΑΙ column: a word whose concept names another column than the rule's is a conflict
const STATUS_COL: Record<string, string> = {
  'status:ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ': 'ka', 'status:ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ': 'an', 'status:ΕΙΔΙΚΗ ΑΔΕΙΑ': 'eid', 'status:ΝΟΣΟΚΟΜΕΙΟ': 'nos', 'status:ΑΠΑΛΛΑΓΗ': 'apal',
  'status:ΕΚΠΑΙΔΕΥΣΗ': 'ekp', 'status:ΦΥΛΛΟ ΠΟΡΕΙΑΣ': 'fp', 'status:ΑΔΙΚΑΙΟΛΟΓΗΤΩΣ ΑΠΩΝ': 'adik', 'status:ΦΥΛΑΚΙΟ': 'fyl', 'status:ΑΠΟΣΠΑΣΗ': 'allh', 'status:ΤΙΜΩΡΙΑ': 'tim', 'status:ΕΥ': 'ey', 'status:ΥΠΗΡΕΣΙΑ': 'yp'
};
const SPLIT_ROW: Record<string, string> = { 'rank:ΥΠΟΛΟΧΑΓΟΣ': 'Ανθυπίλαρχοι-Ανθλγοι', 'rank:ΑΝΘΥΠΟΛΟΧΑΓΟΣ': 'Ανθυπίλαρχοι-Ανθλγοι' };
const CELL = /^\$?([A-Z]{1,3})\$?(\d+)$/;
interface DataPlan { plan: PlannedWrite[]; box: { sheet: string; r1: number; c1: number; r2: number; c2: number } | null; info: NonNullable<FillReport['data']>; warnings: string[] }

function planData(sheets: SheetModel[], shape: BookShape, front: SheetShape, region: MatrixRegion, map: FrontMap, who: HkWho[], eng: HkEngine, lex: Lexicon): DataPlan | null {
  const d = region.driven; if (!d) return null;
  const dm = sheets.find(s => s.name === d.dataSheet); const fsrc = front.formulas.find(f => f.dataSheet === d.dataSheet); if (!dm || !fsrc) return null;
  const warnings: string[] = []; const info: DataPlan['info'] = { sheet: dm.name, rows: 0, columns: { rank: '', status: null }, vocab: [], unwritable: [], cleared: 0 };
  const rankCol = d.critCols.find(x => x.role === 'rank')?.col, statusCol = d.critCols.find(x => x.role === 'status')?.col;
  if (rankCol == null) { warnings.push('Το φύλλο «' + dm.name + '»: δεν βρέθηκε στήλη βαθμού στους τύπους· δεν γράφτηκε'); return { plan: [], box: null, info, warnings }; }
  info.columns = { rank: colLetter(rankCol), status: statusCol != null ? colLetter(statusCol) : null };
  const fg = new Grid(sheets.find(s => s.name === front.name)!);
  // the word of a condition: the quoted text, or the text of the cell it points at («$A7» = the row label)
  const wordOf = (cd: DrivenCell['conds'][number]): string | null => {
    if (cd.crit != null) return cd.crit;
    const m = cd.ref ? CELL.exec(cd.ref.trim()) : null; if (!m) return null;
    const c = m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; const t = fg.textThrough(Number(m[2]) - 1, c); return t || null;
  };
  const rowW = new Map<number, Map<string, number>>(), colW = new Map<number, Map<string, number>>();
  const vote = (m: Map<number, Map<string, number>>, k: number, w: string) => { const x = m.get(k) || new Map<string, number>(); x.set(w, (x.get(w) || 0) + 1); m.set(k, x); };
  for (const cell of fsrc.cells) {
    if (cell.r < region.r1 || cell.r > region.r2 || cell.c < region.c1 || cell.c > region.c2) continue;
    const rc = cell.conds.find(x => x.col === rankCol), sc = statusCol != null ? cell.conds.find(x => x.col === statusCol) : undefined;
    const rw = rc && wordOf(rc), sw = sc && wordOf(sc);
    if (rw) vote(rowW, cell.r, rw); if (sw) vote(colW, cell.c, sw);
  }
  const top = (m: Map<number, Map<string, number>>, k: number) => { const x = m.get(k); return x ? [...x.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined; };
  // vocabularies: the words of the formulas plus the validation list of the column, each with its concept
  const vocab = (col: number, kinds: ('rank' | 'hkrow' | 'status' | 'hkcol')[], words: string[]) => {
    const seen = new Set<string>();
    for (const w of words) if (!seen.has(w)) { seen.add(w); const m = lex.match(w, { kinds }); info.vocab.push({ col: colLetter(col), text: w, concept: m.confidence === 'sure' ? m.concept : null, source: 'formula' }); }
    for (const v of dm.validations) if (v.type === 'list' && v.c1 <= col && v.c2 >= col) for (const w of v.items || []) if (w && !seen.has(w)) { seen.add(w); const m = lex.match(w, { kinds }); info.vocab.push({ col: colLetter(col), text: w, concept: m.confidence === 'sure' ? m.concept : null, source: 'list' }); }
  };
  vocab(rankCol, ['rank', 'hkrow'], [...new Set([...rowW.values()].flatMap(m => [...m.keys()]))]);
  if (statusCol != null) vocab(statusCol, ['status', 'hkcol'], [...new Set([...colW.values()].flatMap(m => [...m.keys()]))]);
  const presentWord = info.vocab.find(v => v.col === colLetter(statusCol ?? -1) && v.concept === 'status:ΠΑΡΩΝ')?.text;
  // where is the data area? the list region of the data sheet that holds the rank column
  const dshape = shape.sheets.find(s => s.name === dm.name);
  const list = dshape?.regions.find((x): x is ListRegion => x.type === 'list' && x.c1 <= rankCol && x.c2 >= rankCol && (statusCol == null || (x.c1 <= statusCol && x.c2 >= statusCol)));
  if (!list) { warnings.push('Το φύλλο «' + dm.name + '»: δεν αναγνωρίστηκε η περιοχή των ατόμων· δεν γράφτηκε'); return { plan: [], box: null, info, warnings }; }
  // template row of a person, and the check that the row's word says the same as its label
  const rowOfWho = (w: HkWho) => map.rows.find(r => r.rule && eng.matches(r.rule, w));
  const badRow = new Set<number>();
  for (const r of map.rows) {
    if (!r.rule) continue; const word = top(rowW, r.r); if (!word) continue;
    const m = lex.match(word, { kinds: ['hkrow', 'rank'] });
    if (m.confidence !== 'sure' || !m.concept) continue;
    const rowKey = m.concept.startsWith('hkrow:') ? m.concept.slice(6) : SPLIT_ROW[m.concept] ?? hkRowOfRankId(m.concept);
    if (rowKey && !r.rule.keys.includes(rowKey)) { badRow.add(r.r); warnings.push('Η γραμμή «' + r.text + '» μετρά τη λέξη «' + word + '» που είναι άλλη γραμμή: δεν γράφτηκε στο φύλλο δεδομένων'); }
    else if (r.rule.ranks && m.concept.startsWith('rank:') && !r.rule.ranks.includes(m.concept)) { badRow.add(r.r); warnings.push('Η γραμμή «' + r.text + '» μετρά τη λέξη «' + word + '» που είναι άλλος βαθμός: δεν γράφτηκε στο φύλλο δεδομένων'); }
  }
  // template column of a state key, and the same check for its word
  const badCol = new Set<number>(); const colOfKey = new Map<string, number>();
  for (const c of map.cols) {
    if (c.rule?.t !== 'state' || c.derived) continue; const word = colW.get(c.c) && top(colW, c.c); if (!word) continue;
    const m = lex.match(word, { kinds: ['status', 'hkcol'] });
    const k = m.confidence === 'sure' && m.concept ? STATUS_COL[m.concept] ?? (m.concept.startsWith('hkcol:') ? m.concept.slice(6) : null) : null;
    if (k && !c.rule.keys.includes(k)) { badCol.add(c.c); warnings.push('Η στήλη «' + c.text + '» μετρά τη λέξη «' + word + '» που είναι άλλη κατάσταση: δεν γράφτηκε στο φύλλο δεδομένων'); continue; }
    for (const k2 of c.rule.keys) if (!colOfKey.has(k2)) colOfKey.set(k2, c.c);
  }
  const attachedShown = map.cols.some(c => c.rule?.t === 'attached' && map.rows.some(r => r.rule && !dm.formulas.has(cellKey(r.r, c.c)) && !sheets.find(s => s.name === front.name)!.formulas.has(cellKey(r.r, c.c))));
  const people: { w: HkWho; rank: string; status: string | null }[] = [];
  for (const w of who) {
    if (attachedShown && w.attached) { info.unwritable.push('προσκολλημένος: μετριέται στη στήλη Προσκολλημένοι'); continue; }
    const row = rowOfWho(w); const rw = row && !badRow.has(row.r) ? top(rowW, row.r) : undefined;
    if (!rw) { info.unwritable.push(row ? 'η γραμμή «' + row.text + '» δεν έχει λέξη βαθμού στους τύπους' : 'κανένα γραμμή του εντύπου δεν τον μετρά (' + w.row + ')'); continue; }
    const rank = rw.replace(/[*?~]/g, ''); if (!critMatches(rw, rank)) { info.unwritable.push('η λέξη «' + rw + '» έχει μπαλαντέρ'); continue; }
    let status: string | null = null;
    if (w.col == null) status = presentWord ?? null;
    else {
      const c = colOfKey.get(w.col); const sw = c != null && !badCol.has(c) ? top(colW, c) : undefined;
      if (!sw) info.unwritable.push('κατάσταση «' + w.col + '» χωρίς λέξη στο φύλλο· γράφτηκε χωρίς κατάσταση');
      else { status = sw.replace(/[*?~]/g, ''); if (!critMatches(sw, status)) { status = null; info.unwritable.push('η λέξη «' + sw + '» έχει μπαλαντέρ'); } }
    }
    people.push({ w, rank, status });
  }
  if (info.unwritable.length) warnings.push(info.unwritable.length + ' άτομα δεν γράφτηκαν ή γράφτηκαν χωρίς κατάσταση στο φύλλο «' + dm.name + '»');
  // writes: the data area is the rows below the header(s); every value cell of it is replaced, formulas and merge children stay
  const r1 = list.r1, n = people.length;
  if (list.totalRow != null && r1 + n - 1 >= list.totalRow) { warnings.push('Το φύλλο «' + dm.name + '»: δεν χωρούν ' + n + ' γραμμές πριν το σύνολο· δεν γράφτηκε'); return { plan: [], box: null, info, warnings }; }
  const r2 = Math.max(list.r2, r1 + n - 1); const c1 = list.c1, c2 = list.c2;
  const box = { sheet: dm.name, r1, c1, r2, c2 };
  const cols = new Map<string, number>(); for (const c of list.cols) { const k = c.match.confidence === 'sure' ? c.match.concept : null; if (k && !cols.has(k)) cols.set(k, c.c); }
  const plan: PlannedWrite[] = []; const put = (r: number, c: number, v: string | number | null, exact = false) => {
    if (dm.formulas.has(cellKey(r, c)) || dm.fx.has(cellKey(r, c))) return;
    const cur = dm.rows[r]?.[c]; if ((v == null || v === '') && (cur == null || cur === '')) return;
    plan.push({ sheet: dm.name, r, c, value: v, ...(exact ? { exact } : {}) });
  };
  const fieldsOf = (w: HkWho) => { const x = w.p ?? w.c!; const last = x.last, first = x.first; return { last, first, name: (last + ' ' + first).trim(), father: w.p?.father ?? '', asm: w.p?.asm ?? w.c?.am ?? '', phone: x.phone ?? '' }; };
  for (let i = 0; i < Math.max(r2 - r1 + 1, 0); i++) {
    const r = r1 + i; const p = people[i];
    for (let c = c1; c <= c2; c++) {
      let v: string | number | null = null, exact = false;
      if (p) {
        if (c === rankCol) { v = p.rank; exact = true; } else if (c === statusCol) { v = p.status; exact = true; }
        else {
          const f = fieldsOf(p.w); const own = [...cols.entries()].find(([, cc]) => cc === c)?.[0];
          v = own === 'person:aa' ? i + 1 : own === 'person:name' ? f.name : own === 'person:last' ? f.last : own === 'person:first' ? f.first : own === 'person:father' ? f.father || null : own === 'person:asm' ? f.asm || null : own === 'person:phone' ? f.phone || null : null;
        }
      }
      const cur = dm.rows[r]?.[c]; if ((cur != null && cur !== '') && v == null) info.cleared++;
      put(r, c, v, exact);
    }
  }
  info.rows = n;
  return { plan, box, info, warnings };
}

// ------------------------------------------------------------------ the fill
export async function fillAdaptive(tpl: Buffer, s: AppState, date: ISODate, profile: TplProfile | null, opts: FillOpts = {}): Promise<{ buffer: Buffer; report: FillReport }> {
  const rep = emptyReport(!!opts.dryRun); const out = (): { buffer: Buffer; report: FillReport } => ({ buffer: tpl, report: rep });
  const sheets = await modelOfBuffer(tpl);
  const lex = lexOf(s.settings.lists, profile, opts.lexicon);
  const shape = detectBook({ sheets }, { lexicon: lex });
  const pick = pickFront(shape, opts.sheet);
  if (!pick) { rep.warnings.push('Δεν βρέθηκε πίνακας ΗΚΑΙ/ΗΚΑΛ στο αρχείο: δεν γράφτηκε τίποτα'); return out(); }
  const { sh, region } = pick; rep.front = sh.name;
  const model = sheets.find(x => x.name === sh.name)!;
  const ctx: RuleCtx = { lex, rows: hkRowList(s.settings.lists), settings: s.settings, profile };
  const cls = hkaiClassify(s, date); const prov = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  const eng = new HkEngine(cls, lex, prov);
  const map = mapMatrix(model, region, ctx); rep.warnings.push(...map.warnings);
  const exp = expectedCells(map, eng);
  const rowAt = new Map(map.rows.map(r => [r.r, r])), colAt = new Map(map.cols.map(c => [c.c, c]));
  const plan: PlannedWrite[] = [];
  for (const [k, val] of exp) {
    const [r, c] = k.split(':').map(Number); const row = rowAt.get(r)!, col = colAt.get(c)!;
    // a total that cannot be computed safely is reported; a formula total only when it adds up a row that is unrecognised and has typed data (its formula would count that stale data)
    if (val == null) { if (row.total && (row.unsafe || (!model.formulas.has(cellKey(r, c)) && !model.fx.has(cellKey(r, c))))) rep.totalsSkipped.push({ ref: cellRef(r, c), why: row.unsafe || 'γραμμή χωρίς κανόνα' }); continue; }
    if (model.formulas.has(cellKey(r, c)) || model.fx.has(cellKey(r, c))) { rep.kept++; continue; }
    const number = row.total || col.derived ? val : val || null;
    plan.push({ sheet: sh.name, r, c, value: number });
  }
  // «Αγνόησε» of the mapping screen: left as it is, not reported
  const ignored = (type: 'col' | 'row', text: string) => !!profile?.ignore.some(m => m.type === type && phraseKey(m.text) === phraseKey(text));
  for (const c of map.cols) if (!c.rule && (c.text || c.hasData) && !ignored('col', c.text)) rep.unmappedCols.push({ ref: colLetter(c.c), text: c.text, hasData: c.hasData, why: c.why });
  // columns of the table the detector gave no header cell at all (blank under a group header) but that hold typed numbers: reported, never written
  for (let c = region.c1; c <= region.c2; c++) if (!colAt.has(c) && map.rows.some(r => !r.total && (() => { const v = model.rows[r.r]?.[c]; return v != null && v !== '' && !model.formulas.has(cellKey(r.r, c)); })())) rep.unmappedCols.push({ ref: colLetter(c), text: '', hasData: true, why: 'στήλη χωρίς επικεφαλίδα' });
  for (const r of map.rows) if (!r.rule && !r.total && !ignored('row', r.text)) rep.unmappedRows.push({ ref: String(r.r + 1), text: r.text, hasData: r.hasData, why: r.why });
  const un = unplaced(map, eng); rep.unplacedRows = un.rows; rep.unplacedStates = un.states;
  for (const x of rep.unmappedCols.filter(x => x.hasData)) rep.warnings.push('Η στήλη «' + x.text + '» (' + x.ref + ') έχει στοιχεία και δεν έχει αντιστοιχιστεί: δεν γράφτηκε (' + x.why + ')');
  for (const x of rep.unmappedRows.filter(x => x.hasData)) rep.warnings.push('Η γραμμή «' + x.text + '» (' + x.ref + ') έχει στοιχεία και δεν αναγνωρίζεται: δεν γράφτηκε (' + x.why + ')');
  for (const x of un.rows) rep.warnings.push(x.n + ' άτομα της γραμμής «' + x.key + '» δεν μετριούνται σε καμία γραμμή του εντύπου');
  // in the user's words: the column's name, not the key; a total with a formula cannot count them either
  for (const x of un.states) {
    const name = HK_COLS.find(c => c[0] === x.key)?.[1] ?? x.key; const kolA = KOL_KEYS.includes(x.key) ? 'Σύνολο κωλυομένων' : 'Σύνολο απόντων';
    rep.warnings.push((x.n === 1 ? '1 άτομο' : x.n + ' άτομα') + ' στην κατάσταση «' + name + '» δεν ' + (x.n === 1 ? 'έχει' : 'έχουν') + ' στήλη στο έντυπο: δεν ' + (x.n === 1 ? 'φαίνεται' : 'φαίνονται') + ' σε καμία στήλη, και αν το «' + kolA + '» του εντύπου έχει τύπο, δεν ' + (x.n === 1 ? 'μετριέται' : 'μετριούνται') + ' ούτε εκεί');
  }
  // the data sheet that the template's own formulas count
  let dataBoxes: { sheet: string; r1: number; c1: number; r2: number; c2: number }[] = [];
  if (region.driven) {
    const dp = planData(sheets, shape, sh, region, map, cls.who, eng, lex);
    if (dp) { plan.push(...dp.plan); if (dp.box) dataBoxes = [dp.box]; rep.data = dp.info; rep.warnings.push(...dp.warnings); }
  }
  const wb = await Workbook.open(tpl);
  if (opts.extras !== false) {
    const ex = await planExtras(wb, sheets, sh.name, lex, s, date, profile, { sigs: opts.sigs });
    plan.push(...ex.plan.filter(w => !ex.blocked(w))); rep.warnings.push(...ex.warnings); rep.back = ex.report;
  }
  const wr = await safeWrite(wb, plan, { dryRun: opts.dryRun, ours: opts.ours ?? profile?.ours, dataBoxes });
  rep.written = wr.written; rep.refused = wr.refused; rep.ours = wr.ours;
  if (rep.refused.length) rep.warnings.push(rep.refused.length + ' κελιά δεν γράφτηκαν (τύπος, κείμενο, συγχώνευση)');
  // cross-check: the template's own formulas, recomputed over the filled values, against the numbers the engine expects
  if (opts.cross !== false) {
    const over = sheets.map(x => ({ ...x, rows: x.rows.map(r => (r ? [...r] : r)) }));
    for (const w of wr.written) { const t = over.find(x => x.name === w.sheet); if (!t) continue; while (t.rows.length <= w.r) t.rows.push([]); if (!t.rows[w.r]) t.rows[w.r] = []; t.rows[w.r][w.c] = w.value; }
    const ev = new Evaluator(over); const fm = over.find(x => x.name === sh.name)!;
    for (const [k, val] of exp) {
      if (val == null) continue; const [r, c] = k.split(':').map(Number);
      const got = ev.cell(fm, r, c);
      if (got === UNSUPPORTED) { rep.cross.unevaluated++; continue; }
      rep.cross.checked++;
      const g = got == null || got === '' ? 0 : typeof got === 'number' ? got : NaN;
      if (g === val) rep.cross.matched++; else rep.cross.mismatches.push({ sheet: sh.name, ref: cellRef(r, c), expected: val, got });
    }
    if (rep.cross.mismatches.length) rep.warnings.push('Έλεγχος με τους τύπους του εντύπου: ' + rep.cross.mismatches.length + ' κελιά δεν βγάζουν τον αριθμό που αναμένεται');
  }
  return { buffer: opts.dryRun ? tpl : await wb.save(), report: rep };
}

// ------------------------------------------------------------------ total cells that lost their formulas
export interface FormulaFix { sheet: string; r: number; c: number; ref: string; formula: string; why: string }
export function restoreFormulas(sheets: SheetModel[], profile?: TplProfile | null, o: { lists?: UserLists; sheet?: string; lexicon?: Lexicon } = {}): FormulaFix[] {
  const lex = lexOf(o.lists, profile, o.lexicon); const shape = detectBook({ sheets }, { lexicon: lex });
  const pick = pickFront(shape, o.sheet); if (!pick) return [];
  const model = sheets.find(x => x.name === pick.sh.name)!;
  const map = mapMatrix(model, pick.region, { lex, rows: hkRowList(o.lists), settings: o.lists ? ({ lists: o.lists } as never) : undefined, profile });
  const out: FormulaFix[] = []; const has = (r: number, c: number) => model.formulas.has(cellKey(r, c)) || model.fx.has(cellKey(r, c));
  const fix = (r: number, c: number, formula: string, why: string) => { if (!has(r, c)) out.push({ sheet: model.name, r, c, ref: cellRef(r, c), formula, why }); };
  const colOf = (f: (c: FrontMap['cols'][number]) => boolean) => map.cols.filter(f);
  const placed = colOf(c => c.rule?.t === 'placed')[0], attached = colOf(c => c.rule?.t === 'attached')[0];
  const sumC = colOf(c => c.derived === 'sum')[0], sumA = colOf(c => c.derived === 'sumA')[0];
  const kol = colOf(c => !c.derived && c.rule?.t === 'state' && c.rule.keys.every(k => KOL_KEYS.includes(k)));
  const abs = colOf(c => !c.derived && c.rule?.t === 'state' && c.rule.keys.every(k => ABS_KEYS.includes(k)));
  for (const row of map.rows) {
    if (row.rule) {
      for (const col of map.cols) {
        if (col.derived === 'sum' && placed && attached) fix(row.r, col.c, 'SUM(' + cellRef(row.r, placed.c) + ',' + cellRef(row.r, attached.c) + ')', 'Σύνολο δύναμης = Τοποθετημένοι + Προσκολλημένοι');
        if (col.derived === 'sumK' && kol.length) fix(row.r, col.c, 'SUM(' + kol.map(k => cellRef(row.r, k.c)).join(',') + ')', 'Σύνολο κωλυομένων');
        if (col.derived === 'sumA' && abs.length) fix(row.r, col.c, 'SUM(' + abs.map(k => cellRef(row.r, k.c)).join(',') + ')', 'Σύνολο απόντων');
        if (col.derived === 'avail' && sumC && sumA) fix(row.r, col.c, cellRef(row.r, sumC.c) + '-' + cellRef(row.r, sumA.c), 'Διαθέσιμοι = Σύνολο δύναμης − Σύνολο απόντων');
      }
    } else if (row.total && row.members?.length && !row.unsafe) {
      // runs of consecutive member rows, so that a total row between them is never summed
      const runs: [number, number][] = []; for (const m of [...row.members].sort((a, b) => a - b)) { const l = runs[runs.length - 1]; if (l && m === l[1] + 1) l[1] = m; else runs.push([m, m]); }
      for (const col of map.cols) if (col.rule) fix(row.r, col.c, 'SUM(' + runs.map(([a, b]) => (a === b ? cellRef(a, col.c) : cellRef(a, col.c) + ':' + cellRef(b, col.c))).join(',') + ')', 'Σύνολο γραμμών ' + (runs.map(([a, b]) => a + 1 + (a === b ? '' : '–' + (b + 1))).join(', ')));
    }
  }
  return out;
}
// Applies proposed fixes (a separate, explicit call): only cells that still have no formula are touched
export async function applyFormulaFixes(tpl: Buffer, fixes: FormulaFix[]): Promise<{ buffer: Buffer; applied: FormulaFix[]; skipped: FormulaFix[] }> {
  const wb = await Workbook.open(tpl); const applied: FormulaFix[] = [], skipped: FormulaFix[] = [];
  for (const f of fixes) {
    let ws; try { ws = await wb.sheet(f.sheet); } catch { skipped.push(f); continue; }
    if (ws.hasFormula(f.ref)) { skipped.push(f); continue; }
    ws.setFormula(f.ref, f.formula); applied.push(f);
  }
  return { buffer: applied.length ? await wb.save() : tpl, applied, skipped };
}
void valueText;
