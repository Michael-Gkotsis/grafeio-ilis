// Έντυπα (Michael, 19/10): συμπλήρωση δικών σου προτύπων Excel και πρότυπα που φτιάχνει η εφαρμογή («Φτιάξ' το εδώ»).
// Με το ελαφρύ xlsx.ts, όπως η ΦΡΟΥΡΑ και η ΗΚΑΙ: αλλάζουν μόνο οι τιμές, η μορφοποίηση του προτύπου μένει όπως είναι.
// Η πρώτη γραμμή κάτω από τις επικεφαλίδες είναι η «γραμμή-πρότυπο»: κάθε άτομο παίρνει τη μορφή της και ό,τι είναι
// από κάτω (υπογραφές, σύνολα) κατεβαίνει όσο μεγαλώνει η λίστα.
import { NOHEAD_MARK, Workbook, colName, colNum, sheetSafe, type Sheet, type XlValue } from './xlsx';
import { TemplateError, signSheets, unitWords } from './exports';
import { blockOf } from './layout';
import type { LayoutSheet } from '../shared/layout';
import { SIG_TAG } from './sigs';
import { renderBook } from './print';
import { cutSample, type PvCount } from '../shared/repPage';
import { normGreek, upper } from '../shared/text';
import { FILLS, TAB_WIDTHS, blankFill, blankN, blankTags, gridOn, metricFn, TAG_RE, byGroup, byIds, cellValue, fieldOf, fieldValue, groupOf, groupsOf, guessField, moreRows, repFileName, splitOk, tagKey, type BuildOpts, type BuildVal, type BuiltOut, type RepCell, type RepCol, type RepGroup, type RepKind, type Report, type Row, type TabLay } from '../shared/reports';
import type { AppState } from '../shared/domain';
import { XL_LOOK, formPart, tablePart, xlLook, type XlLook } from '../shared/xlLook';
import { atOf, evalTables, rowText, tagId, tagText, tagsOf as valTags, valsMissing, valsUsed, type Spot, type TAlign, type ValueOut } from '../shared/values';
import { MAIN, bandIndex, bandsOf, isDefault } from '../shared/repBands';
import { nowMin, today as todayISO, type ISODate } from '../shared/dates';
import type { TplInspect } from '../shared/api';

export const MAX_ROWS = 2000;
export const GTITLE = '#title';   // το κελί του τίτλου σε φτιαγμένο πρότυπο (όχι στοιχείο που διαλέγεις)
const SCAN_ROWS = 80, SCAN_COLS = 40, TAG_ROWS = 400;
const key = (v: unknown) => normGreek(String(v ?? '')).replace(/[\s.\-_:/\\(){}]/g, '');
const str = (v: XlValue | undefined) => (v == null ? '' : v instanceof Date ? '' : String(v).trim());


// Η γραμμή των δεδομένων κάτω από τις επικεφαλίδες: αν μια επικεφαλίδα είναι συγχωνευμένη σε δύο γραμμές, μετά από αυτές
function dataRowOf(ws: Sheet, head: number): number {
  let last = head;
  for (const m of ws.merges()) if (m.r1 === head && m.r2 > last && m.r2 - head < 4) last = m.r2;
  return last + 1;
}
// Επικεφαλίδες σε δύο γραμμές με τη γραμμή των υπότιτλων ως «γραμμή επικεφαλίδων»: οι στήλες που είναι συγχωνευμένες
// κάθετα ξεκινούν πιο πάνω, οπότε ο πίνακας ξεκινά από εκεί (αλλιώς χάνονται οι τίτλοι τους)
function headTop(ws: Sheet, head: number): number {
  let top = head;
  for (const m of ws.merges()) if (m.r1 < head && m.r2 >= head && head - m.r1 < 4) top = Math.min(top, m.r1);
  return top;
}
// Η γραμμή των επικεφαλίδων: όπου τα περισσότερα κείμενα μοιάζουν με γνωστά ονόματα (ΒΑΘΜΟΣ, ΑΣΜ…), αλλιώς η πρώτη με 3+ κείμενα
function findHead(rows: XlValue[][], kind: RepKind): { head: number; guessed: boolean; score: number } {
  let best = -1, score = 1;
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const n = (rows[r] || []).filter(v => typeof v === 'string' && guessField(kind, v)).length;
    if (n > score) { best = r; score = n; }
  }
  if (best >= 0) return { head: best + 1, guessed: true, score };
  for (let r = 0; r < Math.min(rows.length, 60); r++) if ((rows[r] || []).filter(v => typeof v === 'string' && v.trim()).length >= 3) return { head: r + 1, guessed: false, score: 0 };
  return { head: 1, guessed: false, score: 0 };
}
// Οι επικεφαλίδες κάθε στήλης (από τη γραμμή head ως πριν τα δεδομένα: η πιο κάτω που έχει κείμενο)
function headersOf(ws: Sheet, rows: XlValue[][], head: number, data: number, kind: RepKind) {
  const inMerge = new Set<string>();
  for (const m of ws.merges()) if (m.r1 >= head && m.r1 < data) for (let c = m.c1 + 1; c <= m.c2; c++) inMerge.add(m.r1 + ':' + c);
  let last = 0;
  for (let r = head; r <= data; r++) (rows[r - 1] || []).forEach((v, c) => { if (str(v)) last = Math.max(last, c + 1); });
  const out: TplInspect['headers'] = [];
  for (let c = 1; c <= Math.min(last, SCAN_COLS); c++) {
    let text = '';
    for (let r = data - 1; r >= head; r--) { if (inMerge.has(r + ':' + c)) continue; const v = str(rows[r - 1]?.[c - 1]); if (v) { text = v; break; } }
    const tag = str(rows[data - 1]?.[c - 1]); const tm = /^\{([^{}]+)\}$/.exec(tag);
    if (!text && !tm) continue;
    out.push({ c, text: text || tag, f: guessField(kind, tm ? tm[1] : text) ?? (tm ? null : guessField(kind, text)) });
  }
  // με δική του στήλη «Προέλευση», ο «Βαθμός» είναι μόνο ο βαθμός (αλλιώς ΕΠΟΠ ΛΧΙΑΣ, με την προέλευση μπροστά)
  if (out.some(h => h.f === 'origin')) out.forEach(h => { if (h.f === 'rank') h.f = 'rank1'; });
  return out;
}
// Πόσες έτοιμες κενές γραμμές έχει το πρότυπο κάτω από τις επικεφαλίδες (τουλάχιστον 1: η γραμμή-πρότυπο). Έτοιμη
// γραμμή μπορεί να έχει ήδη τον αύξοντα αριθμό της στη στήλη Α/Α (aa: 2, 3, 4…, όπως τα αριθμούν πολλοί στο Excel)
function preparedRows(ws: Sheet, data: number, cols: number[], aa?: number): number {
  if (!cols.length) return 1;
  const s0 = ws.style(colName(cols[0]) + data);
  let k = 1;
  for (let r = data + 1; r < data + 500; r++) {
    const ref0 = colName(cols[0]) + r;
    if (!ws.raw(ref0) && ws.style(ref0) == null) break;   // η γραμμή δεν υπάρχει
    if (ws.style(ref0) !== s0) break;
    if (cols.some(c => { const x = ws.raw(colName(c) + r); if (!x || x.inner.includes('<f') || !/<v>|<is>/.test(x.inner)) return false; return !(c === aa && Number((ws.get(colName(c) + r) || '').trim()) === k + 1); })) break;
    k++;
  }
  return k;
}
const tagsOf = (rows: XlValue[][], skipRow: number): RepCell[] => {
  const out: RepCell[] = [];
  rows.forEach((row, r) => { if (r + 1 === skipRow) return; (row || []).forEach((v, c) => { if (typeof v !== 'string') return; for (const m of v.matchAll(TAG_RE)) { const k = tagKey(m[1]); if (k) out.push({ ref: colName(c + 1) + (r + 1), k }); } }); });
  return out;
};

// {ΟΝΟΜΑ} που δεν είναι στοιχείο εντύπου: μπορεί να είναι ετικέτα γραμμής ενός πίνακα τιμών (ο οδηγός τις ταιριάζει με τις γραμμές)
const unknownTags = (rows: XlValue[][], skipRow: number): { ref: string; tag: string }[] => {
  const out: { ref: string; tag: string }[] = [];
  rows.forEach((row, r) => { if (r + 1 === skipRow) return; (row || []).forEach((v, c) => { if (typeof v !== 'string') return; for (const m of v.matchAll(TAG_RE)) if (!tagKey(m[1])) out.push({ ref: colName(c + 1) + (r + 1), tag: tagText(m[1]) }); }); });
  return out;
};
// Κελιά με {ΕΤΙΚΕΤΑ} (κείμενο όπως είναι)
const tagCells = (rows: XlValue[][]) => {
  const out: { ref: string; text: string }[] = [];
  rows.forEach((row, r) => (row || []).forEach((v, c) => { if (typeof v === 'string' && /\{[^{}]+\}/.test(v)) out.push({ ref: colName(c + 1) + (r + 1), text: v }); }));
  return out;
};
export async function inspectTemplate(buf: Buffer | Uint8Array, kind: RepKind, sheet?: string, head?: number): Promise<TplInspect> {
  const wb = await Workbook.open(buf);
  const sheets = wb.sheetNames();
  // χωρίς φύλλο: αυτό με τις περισσότερες γνωστές επικεφαλίδες (όχι ένα φύλλο οδηγιών μπροστά), αλλιώς το πρώτο
  let name = sheet && wb.hasSheet(sheet) ? sheet : sheets[0];
  if (!sheet || !wb.hasSheet(sheet)) {
    const score = (rows: XlValue[][]) => findHead(rows, kind).score * 100 + rows.flat().filter(v => typeof v === 'string' && (guessField(kind, v) || /\{[^{}]+\}/.test(v))).length;
    let top = 0;
    for (const n of sheets) { const sc = score(await wb.values(n, SCAN_ROWS, SCAN_COLS)); if (sc > top) { top = sc; name = n; } }
  }
  const ws = await wb.sheet(name); const rows = await wb.values(name, SCAN_ROWS, SCAN_COLS);
  const found = head ? { head, guessed: false } : findHead(rows, kind);
  found.head = headTop(ws, found.head);
  const data = dataRowOf(ws, found.head);
  const headers = headersOf(ws, rows, found.head, data, kind);
  return { sheets, sheet: name, head: found.head, data, headers, tags: tagsOf(rows, data), unknown: unknownTags(rows, data), prepared: preparedRows(ws, data, headers.map(h => h.c), headers.find(h => h.f === 'aa')?.c), guessed: found.guessed };
}

// Αν άλλαξε το πρότυπο στο Excel (π.χ. μπήκε γραμμή πάνω από τον πίνακα), οι επικεφαλίδες ξαναβρίσκονται από τα κείμενά τους.
// Οι πίνακες 2, 3… ψάχνονται κάτω από τον προηγούμενο (from), για να μη βρεθεί ο πρώτος αν έχουν ίδιες επικεφαλίδες.
function locateHead(ws: Sheet, rows: XlValue[][], cols: RepCol[], head: number, from = 1, nth = 1): number {
  const want = cols.filter(c => c.h && !/^\{/.test(c.h));
  if (!want.length) return Math.max(head, from);
  // οι επικεφαλίδες μπορεί να είναι σε δύο γραμμές (συγχωνευμένες): μετρά από τη γραμμή ως πριν τα δεδομένα
  const hits = (row: number) => { const end = dataRowOf(ws, row); return want.filter(c => { for (let x = row; x < end; x++) if (key(rows[x - 1]?.[c.c - 1]) === key(c.h)) return true; return false; }).length; };
  let best = head, score = head >= from ? hits(head) : -1;
  for (let row = from; row <= Math.min(rows.length, from === 1 ? SCAN_ROWS : TAG_ROWS); row++) { const h = hits(row); if (h > score) { best = row; score = h; } }
  if (score * 2 >= want.length) return best;
  throw new TemplateError('Το πρότυπο άλλαξε και δεν βρίσκω τις στήλες του πίνακα' + (nth > 1 ? ' ' + nth : '') + ' (' + want.map(c => c.h).slice(0, 4).join(', ') + '). Άνοιξε το έντυπο με «Αλλαγή» και δείξε ξανά τη γραμμή με τις επικεφαλίδες.');
}

// Το συμπληρωμένο έντυπο. ids: τα άτομα με τη σειρά που θα μπουν (η οθόνη έχει ήδη κάνει φίλτρα, τυχαία επιλογή, σειρά).
// Με χωρισμό (r.split) ένα φύλλο ανά ομάδα, αντίγραφα του προτύπου, με όνομα «ΘΑΛΑΜΟΣ 3» ή, με prefix, «ΑΓΓΑΡΕΙΑ Θ3»
// (φύλλα στο Δυναμολόγιο)· stale: ομάδες που είχαν βγει παλιότερα και τώρα δεν έχουν κανέναν (γράφονται άδειες, για να μη
// μείνουν παλιά ονόματα)
export type GroupKey = Omit<RepGroup, 'rows'>;
// clock: σήμερα και ώρα (λεπτά) για τη στιγμή μέτρησης των πινάκων τιμών (τα tests τα δίνουν· αλλιώς το ρολόι)
export interface FillOpts { prefix?: string; stale?: GroupKey[]; clock?: { today: ISODate; now: number } }
// Δείγμα της προεπισκόπησης (Έντυπα › σελίδα δημιουργίας): κάθε πίνακας δείχνει ως sample γραμμές (0: ως PV_MAX). Το βγάλσιμο (rep:run, αυτόματη
// ενημέρωση) δεν το περνά ποτέ: μπαίνει μόνο από το previewReport, και τότε το αποτέλεσμα έχει counts (πόσες από πόσες, ανά πίνακα του 1ου φύλλου)
export interface PvOpts { sample: number }
export async function fillReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate, o: FillOpts = {}, pv?: PvOpts): Promise<{ name: string; data: Buffer; warnings: string[]; sheets: string[]; groups: GroupKey[]; layout: LayoutSheet[]; counts?: PvCount[] }> {
  const wb = await Workbook.open(tpl); wb.widen = !r.fixed; const warnings: string[] = [];
  await unitWords(wb, s);
  // πίνακες τιμών: υπολογίζονται μία φορά και γράφονται σε κάθε φύλλο, κάτω από τους πίνακες
  const clock = o.clock || { today: todayISO(), now: nowMin() };
  const vo = valsUsed(r.vals).length ? evalTables(s, d, atOf(s, r.at, d, clock.today, clock.now), r.vals, clock.today) : [];
  const mv = metricFn(s, d, () => atOf(s, r.at, d, clock.today, clock.now), clock.today);   // μετρήσεις σε ετικέτες των κελιών του «Κενός πίνακας»
  for (const m of valsMissing(s, r.vals)) warnings.push('Στους πίνακες τιμών δεν υπάρχει πια η μέτρηση «' + m + '» (σβήστηκε υπηρεσία ή τύπος;). Δεν μετρά.');
  const sheet = r.sheet && wb.hasSheet(r.sheet) ? r.sheet : wb.sheetNames()[0];
  const rows = byIds(s, r.kind, ids.slice(0, MAX_ROWS), d);
  if (ids.length > MAX_ROWS) warnings.push('Μπήκαν οι πρώτοι ' + MAX_ROWS + '.');
  // οι πίνακες 2, 3…: όλοι όσοι περνούν τα φίλτρα τους (χωρίς τυχαίους), με τη σειρά τους
  const more = r.more || []; const extra = moreRows(s, r, d).map(x => x.slice(0, MAX_ROWS));
  const split = !!r.split && r.split !== 'none' && splitOk(r.kind) && !(vo.length && !r.cols.length);
  let groups = groupsOf(s, r.kind, rows, r.split);
  if (split) {
    // ένας θάλαμος που έχει μόνο π.χ. καταστάσεις στον 2ο πίνακα παίρνει κι αυτός φύλλο
    const keys = new Set(groups.map(g => g.key)); let added = false;
    more.forEach((t, i) => { if (splitOk(t.kind)) for (const x of extra[i]) { const g = groupOf(s, x, r.split!); if (!keys.has(g.key)) { keys.add(g.key); groups.push({ ...g, rows: [] }); added = true; } } });
    if (added) groups.sort(byGroup);
    groups = [...groups, ...(o.stale || []).filter(x => !groups.some(g => g.key === x.key)).map(x => ({ ...x, rows: [] }))];
  }
  if (!groups.length) groups = [{ key: '', label: '', short: '', rows: [] }];
  // οι πίνακες ενός φύλλου: ο πρώτος με τα άτομα της ομάδας, οι άλλοι με όσους από αυτούς είναι στην ομάδα (τα στελέχη όλα)
  // (πίνακας χωρίς στήλες σε έντυπο με πίνακες τιμών = έντυπο χωρίς άτομα: καμία γραμμή)
  const tabs = (g: RepGroup | null): Tab[] => [{ kind: r.kind, head: r.head, cols: r.cols, rows: g ? g.rows : rows, ...(r.nohead ? { nohead: true } : {}) },
    ...more.map((t, i) => ({ kind: t.kind, head: t.head, cols: t.cols, ...(t.nohead ? { nohead: true } : {}), rows: !g || !splitOk(t.kind) ? extra[i] : extra[i].filter(x => groupOf(s, x, r.split!).key === g.key) }))]
    .map(t => (vo.length && !t.cols.length ? { ...t, rows: [] } : t));
  const names: string[] = []; const layout: LayoutSheet[] = [];
  const cut = (t: Tab[]): Tab[] => (pv ? t.map(x => ({ ...x, rows: cutSample(x.rows, pv.sample) })) : t);
  const t0 = pv ? tabs(split ? groups[0] : null) : null;
  const counts = t0 ? t0.map(x => ({ shown: cutSample(x.rows, pv!.sample).length, total: x.rows.length })) : undefined;
  if (!split) { layout.push(...await fillSheet(wb, sheet, s, r, cut(tabs(null)), d, '', warnings, vo, mv)); names.push(sheet); }
  else {
    // πρώτα τα αντίγραφα (από το άδειο πρότυπο), μετά συμπλήρωση· το πρώτο φύλλο του προτύπου παίρνει την πρώτη ομάδα
    const want = groups.map(g => (o.prefix ? o.prefix.slice(0, Math.max(1, 30 - g.short.length)).trim() + ' ' + g.short : g.label) || 'ΦΥΛΛΟ');
    const used = new Set(wb.sheetNames().filter(x => x !== sheet));
    const uniq = want.map(w => { let x = sheetSafe(w), i = 2; while (used.has(x)) x = sheetSafe(w.slice(0, 27) + ' ' + i++); used.add(x); return x; });
    for (let i = 1; i < groups.length; i++) await wb.cloneSheet(sheet, uniq[i]);
    const first = wb.renameSheet(sheet, uniq[0]);
    for (let i = 0; i < groups.length; i++) { const l = await fillSheet(wb, i ? uniq[i] : first, s, r, cut(tabs(groups[i])), d, groups[i].label, warnings, vo, mv); if (!i) layout.push(...l); }
    names.push(first, ...uniq.slice(1));
  }
  const name = repFileName(r, d);
  return { name, data: await wb.save(), warnings: [...new Set(warnings)], sheets: names, groups: split ? groups.map(({ key, label, short }) => ({ key, label, short })) : [], layout, ...(counts ? { counts } : {}) };
}
// Ένας πίνακας του φύλλου: είδος, γραμμή επικεφαλίδων (όπως αποθηκεύτηκε), στήλες, γραμμές
// nohead: χωρίς γραμμή επικεφαλίδων στο έντυπο (η γραμμή μένει στο πρότυπο μέχρι να γεμίσει και μετά κρύβεται ή αδειάζει, δες noHead)
interface Tab { kind: RepKind; head: number; cols: RepCol[]; rows: Row[]; nohead?: boolean }
async function fillSheet(wb: Workbook, sheet: string, s: AppState, r: Report, tabs: Tab[], d: ISODate, group: string, warnings: string[], vo: ValueOut[], mv: (id: string) => number | null): Promise<LayoutSheet[]> {
  const ws = await wb.sheet(sheet); const tagScan = await wb.values(sheet, TAG_ROWS, SCAN_COLS); const scan = tagScan.slice(0, SCAN_ROWS);
  const colsOf = tabs.map(t => t.cols.filter(c => c.c >= 1 && fieldOf(t.kind, c.f)));
  // θέσεις πινάκων (Φάση 3, Report.bands): ο καθένας με το id του (ο 1ος 'main') και οι πίνακες τιμών με το δικό τους. Χωρίς bands (ή με την
  // προεπιλεγμένη διάταξη) όλα γίνονται όπως πριν: οι πίνακες ατόμων ο ένας κάτω από τον άλλον, οι πίνακες τιμών στο τέλος
  const rmore = r.more || []; const tid = (i: number) => (i ? rmore[i - 1]?.id ?? 'm' + i : MAIN);
  const vtab = vo.filter(v => !v.tagsOnly).map(v => (v.spot?.tt ? { ...v, title: '' } : v));   // tt: ο τίτλος είναι ήδη στο πρότυπο   // πίνακες τιμών που γράφονται (οι tagsOnly μόνο στις ετικέτες του Excel)
  const bids = [...tabs.map((_, i) => i).filter(i => colsOf[i].length).map(tid), ...vtab.map(v => v.id)];
  const bands = bandsOf(bids, r.bands); const phys = bands.flat().map(id => tabs.findIndex((_, i) => tid(i) === id)).filter(i => i >= 0);
  const custom = !isDefault(bids, bands) && phys.length > 0;
  // πού είναι οι πίνακες τώρα: ο πρώτος όπως πάντα, κάθε επόμενος κάτω από τον προηγούμενο (ή στην ίδια γραμμή, αν είναι δίπλα του)
  const order = custom ? phys : tabs.map((_, i) => i);
  const heads: number[] = tabs.map(() => 0);
  order.forEach((i, k) => {
    const t = tabs[i], p = order[k - 1];
    heads[i] = !k ? locateHead(ws, scan, t.cols, t.head) : locateHead(ws, tagScan, t.cols, t.head, custom && bandIndex(bands, tid(i)) === bandIndex(bands, tid(p)) ? heads[p] : heads[p] + 1, k + 1);
  });
  const datas = heads.map(h => dataRowOf(ws, h));
  const head = heads[0], data = datas[0];
  const n = tabs[0].rows.length;
  // στοιχεία εντύπου πρώτα (στις θέσεις του προτύπου, πριν μπουν γραμμές): όσα όρισες με κλικ και κάθε {ΕΤΙΚΕΤΑ} του φύλλου
  // κείμενο σε γραμμές (η κεφαλίδα): μία γραμμή σε κάθε κελί προς τα κάτω αν είναι άδεια, όπως γράφεται στο χαρτί·
  // αλλιώς (ή σε συγχωνευμένο κελί) όλες μέσα στο ίδιο κελί
  const merged = ws.merges();
  const inMerge = (c: number, row: number) => merged.some(m => row >= m.r1 && row <= m.r2 && c >= m.c1 && c <= m.c2);
  const put = async (ref: string, v: string | number | null) => {
    if (ws.hasFormula(ref)) return;
    if (typeof v === 'string' && v.includes('\n')) {
      const lines = v.split('\n'); const m = /^([A-Z]+)(\d+)$/.exec(ref)!; const col = m[1], row = +m[2]; const c = colNum(col);
      const below = lines.slice(1).map((_, i) => col + (row + i + 1));
      if (!inMerge(c, row) && below.every((x, i) => ws.get(x) == null && !inMerge(c, row + i + 1))) {
        const st = ws.style(ref);
        lines.forEach((t, i) => { const x = col + (row + i); ws.set(x, t); if (i && st != null) ws.setStyle(x, st); });
      } else await wb.setRich(ws, ref, lines.map(t => [{ t }]));
    } else ws.set(ref, v);
  };
  const inTable = new Set(colsOf.flatMap((cols, i) => cols.map(c => colName(c.c) + datas[i])));
  // χωρισμός σε φύλλα: αν το πρότυπο δεν έχει πουθενά {ΟΜΑΔΑ}, η ομάδα μπαίνει δίπλα στον τίτλο (ΑΓΓΑΡΕΙΑ - ΘΑΛΑΜΟΣ 3)
  const tags = tagCells(tagScan);
  const hasGroup = r.cells.some(c => c.k === 'group') || tags.some(t => [...t.text.matchAll(TAG_RE)].some(m => tagKey(m[1]) === 'group'));
  const val = (k: string) => { const v = cellValue(s, k, d, r, n, group); return k === 'title' && group && !hasGroup && v ? v + ' - ' + group : v; };
  // ο τίτλος του «Φτιάξ' το εδώ» είναι κείμενο του προτύπου (GTITLE): παίρνει μόνο την ομάδα
  for (const c of r.cells) if (c.k === GTITLE && group && !hasGroup && !r.cells.some(x => x.k === 'title')) { const t = ws.get(c.ref); if (t != null && String(t).trim()) ws.set(c.ref, String(t).trim() + ' - ' + group); }
  // κεφαλίδα, τόπος/ημερομηνία και τίτλος: για τη μετακίνηση πάνω στο χαρτί (layout.ts)· names: τα ονόματα κάτω από τις
  // υπογραφές του προτύπου ({ΛΟΧΙΑΣ}, {ΔΙΟΙΚΗΤΗΣ}), που φεύγουν αν το έντυπο έχει άλλες υπογραφές
  const parts: Record<'head' | 'date' | 'title' | 'names', string[]> = { head: [], date: [], title: [], names: [] };
  const mark = (k: string | null | undefined, ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!k || !m) return;
    if (k === 'placeDate') parts.date.push(ref);
    else if (k === 'title' || k === GTITLE) parts.title.push(ref);
    else if (k === 'sgtName' || k === 'cmdName') parts.names.push(ref);
    else if (/^head\d?$/.test(k)) parts.head.push(...(k === 'head' ? [0, 1, 2] : [0]).map(i => m[1] + (+m[2] + i)));
  };
  // ετικέτες των γραμμών των πινάκων τιμών (Φάση 3): {ΠΑΡΟΝΤΕΣ} σε κελί του Excel παίρνει την τιμή της γραμμής, ως αριθμό (το ποσοστό με μορφή %)
  const vt = valTags(valsUsed(r.vals), id => !!tagKey(id)); const vrow = (tg: string) => { const e = vt.map.get(tagId(tg)); return e ? vo.find(x => x.id === e.t.id)?.rows[e.i] : undefined; };
  const seenTags = new Set<string>(), unknown = new Set<string>();
  for (const t of tags) {
    if (inTable.has(t.ref)) continue;
    const whole = /^\{([^{}]+)\}$/.exec(t.text.trim());
    if (whole) mark(tagKey(whole[1]), t.ref);
    if (whole && tagKey(whole[1]) === 'sigs') continue;   // οι υπογραφές μπαίνουν στο τέλος, όταν ξέρουμε πού κατέληξε η γραμμή τους
    const wv = whole && !tagKey(whole[1]) ? vrow(whole[1]) : undefined;
    if (wv) {
      seenTags.add(tagId(whole![1])); if (ws.hasFormula(t.ref)) continue;
      if (wv.txt != null) ws.set(t.ref, wv.txt);   // δική σου τιμή, κείμενο
      else if (wv.v == null) ws.set(t.ref, '—');
      else { ws.set(t.ref, wv.v); if (wv.fmt !== 'int') ws.setStyle(t.ref, await wb.like(ws.style(t.ref), { fmt: wv.fmt === 'pct' ? '0%' : '0.0%' })); }
    }
    else if (whole && tagKey(whole[1])) await put(t.ref, val(tagKey(whole[1])!));
    else ws.set(t.ref, t.text.replace(TAG_RE, (m, tg: string) => {
      const kk = tagKey(tg);
      if (!kk) { const x = vrow(tg); if (!x) { if (vt.map.size) unknown.add(tg.trim()); return m; } seenTags.add(tagId(tg)); return rowText(x); }
      const v = val(kk); return v == null ? '' : String(v).replace(/\n/g, ' ');
    }));
    if (whole && !tagKey(whole[1]) && !wv && vt.map.size) unknown.add(whole[1].trim());
  }
  // «Κενός πίνακας»: κελιά με {ΕΤΙΚΕΤΑ} γραμμής πίνακα τιμών (δεν είναι στο Excel, είναι στα κελιά που έγραψες) μετρούν ως χρήση της ετικέτας
  const bx = blankTags(s, r, vo, mv, val); const badB = new Set<string>();
  tabs.forEach(t => { if (t.kind === 'blank') for (const c of t.cols) if (c.f === 'col') (c.o?.vals || []).slice(0, t.rows.length).forEach(v => { for (const m of String(v).matchAll(TAG_RE)) if (!tagKey(m[1]) && bx.row(m[1])) seenTags.add(tagId(m[1])); }); });
  for (const u of unknown) warnings.push('Στο πρότυπο υπάρχει η ετικέτα {' + u + '} που δεν είναι στοιχείο εντύπου ούτε γραμμή πίνακα τιμών. Μένει όπως είναι.');
  for (const t of vo) if (t.tagsOnly) for (const x of t.rows) if (x.tag && vt.map.has(tagId(x.tag)) && !seenTags.has(tagId(x.tag))) warnings.push('Ο πίνακας τιμών' + (t.title ? ' «' + t.title + '»' : '') + ' γράφεται μόνο στο Excel, αλλά το πρότυπο δεν έχει την ετικέτα {' + x.tag + '}.');
  if (vt.dup.length) warnings.push('Δύο γραμμές των πινάκων τιμών έχουν την ετικέτα ' + vt.dup.map(x => '{' + x + '}').join(', ') + ': μετρά η πρώτη.');
  if (vt.taken.length) warnings.push('Η ετικέτα ' + vt.taken.map(x => '{' + x + '}').join(', ') + ' είναι ήδη στοιχείο εντύπου (π.χ. {ΣΥΝΟΛΟ}): άλλαξε την ετικέτα της γραμμής.');
  for (const c of r.cells) if (/^[A-Z]{1,3}\d+$/.test(c.ref) && !inTable.has(c.ref)) { mark(c.k, c.ref); if (c.k === GTITLE) continue; if (c.k === 'sigs') ws.set(c.ref, SIG_TAG); else await put(c.ref, val(c.k)); }
  // οι πίνακες, από τον τελευταίο προς τον πρώτο (οι γραμμές που μπαίνουν σε έναν σπρώχνουν μόνο ό,τι είναι από κάτω):
  // όσες γραμμές χρειάζονται, με τη μορφή της γραμμής-προτύπου. Πίνακες δίπλα-δίπλα είναι μία ζώνη: μεγαλώνει όσο ο ψηλότερος
  // και οι γραμμές που προστέθηκαν αδειάζουν στον κοντύτερο, ώστε να μην σκιστεί κανένας. Τα στοιχεία (item) είναι ζώνες πινάκων
  // ατόμων και θέσεις μόνο για πίνακες τιμών (spot.row), από κάτω προς τα πάνω
  interface Item { top: number; tabs: number[]; vts: ValueOut[]; row?: number }
  const items: Item[] = [];
  const tail: ValueOut[] = [];   // πίνακες τιμών χωρίς θέση στο πρότυπο: αμέσως κάτω από τον τελευταίο πίνακα (όπως πριν τη Φάση 3)
  const groups: number[][] = [];
  order.forEach((i, k) => { if (k && custom && heads[i] === heads[order[k - 1]]) groups[groups.length - 1].push(i); else groups.push([i]); });
  for (const g of groups) items.push({ top: heads[g[0]], tabs: g, vts: [] });
  for (const v of vtab) {
    const sp = custom ? v.spot : undefined; const bi = bandIndex(bands, v.id);
    const host = sp && sp.row == null ? items.find(it => it.tabs.some(i => bandIndex(bands, tid(i)) === bi)) : undefined;
    if (host) host.vts.push(v);
    else if (sp && sp.row != null) { const slot = items.find(it => it.row === sp.row); if (slot) slot.vts.push(v); else items.push({ top: sp.row, tabs: [], vts: [v], row: sp.row }); }
    else tail.push(v);
  }
  items.sort((x, y) => y.top - x.top);
  // πού και πώς γράφονται οι πίνακες τιμών (πριν αλλάξει οτιδήποτε στο φύλλο)
  const f0 = colsOf[0].length ? 0 : Math.max(0, order.find(i => colsOf[i].length) ?? 0);
  const cs0 = colsOf[f0].map(c => c.c); const vc1 = cs0.length ? Math.min(...cs0) : 1, vc2 = cs0.length ? Math.max(...cs0) : Math.max(2, ws.lastCol());
  const look = xlLook(s.settings);
  const vref = { h: cs0.length ? ws.rowHeight(datas[f0]) : 0, data: ws.style(colName(vc1) + datas[f0]), head: ws.style(colName(vc1) + heads[f0]) };
  const vrows = (v: ValueOut) => (v.title ? 1 : 0) + v.rows.length;
  let end = -1;   // η τελευταία γραμμή του τελευταίου στοιχείου
  const shiftBy = (by: number, below: number) => { for (const key of ['head', 'date', 'title', 'names'] as const) parts[key] = parts[key].map(x => x.replace(/(\d+)$/, (_m, nn: string) => String(+nn > below ? Math.max(1, +nn + by) : +nn))); };
  for (let ii = 0; ii < items.length; ii++) {
    const it = items[ii]; const last = ii === 0;
    if (!it.tabs.length) {
      // θέση μόνο για πίνακες τιμών: η γραμμή spot.row μεγαλώνει όσο ο ψηλότερος πίνακας τιμών που είναι εκεί
      const need = Math.max(...it.vts.map(vrows)); const S = it.row!;
      end = last ? S + need - 1 : end + need - 1; shiftBy(need - 1, S);
      if (need > 1) ws.insertRows(S, need - 1, S, wb);
      await writeBoxes(wb, ws, it.vts, { row: S, setH: true, exact: !!r.fixed, ...vref, look });
      continue;
    }
    const G = it.tabs; const D = datas[G[0]], HR = heads[G[0]];
    // έτοιμες γραμμές του προτύπου κάτω από τις επικεφαλίδες· σταματούν πριν το επόμενο στοιχείο από κάτω
    const ks = G.map(i => { const aa = colsOf[i].find(c => c.f === 'aa'); return preparedRows(ws, D, colsOf[i].map(c => c.c), aa?.c); });
    let K = Math.max(...ks); if (!last) K = Math.max(1, Math.min(K, items[ii - 1].top - D));
    const nT = G.map(i => Math.max(tabs[i].rows.length, 1)); const vh = it.vts.length ? Math.max(...it.vts.map(vrows)) : 0;
    const N = Math.max(...nT, vh ? HR + vh - D : 0);
    const delta = N > K ? N - K : N < K && r.trim ? -(K - N) : 0;
    end = last ? D + K - 1 + delta : end + delta; shiftBy(delta, D + K - 1);
    if (N > K) {
      ws.insertRows(D + K - 1, N - K, D, wb);
      G.forEach((i, j) => { const aa = colsOf[i].find(c => c.f === 'aa'); if (aa && nT[j] === N) ws.chainAa(aa.c, D + K - 1, N - K); });
      await wb.growRanges(ws, D, D + K - 1, D + N - 1);
      // κοντύτεροι διπλανοί πίνακες: οι γραμμές που προστέθηκαν δεν έχουν δικά τους κελιά
      if (G.length > 1 || it.vts.length) {
        const mg = ws.merges();
        G.forEach((i, j) => {
          const from = D + Math.max(nT[j], K); if (from > D + N - 1) return;
          const cs = colsOf[i].map(c => c.c); const c2 = Math.max(...colsOf[i].map(c => mg.find(m => m.r1 === D && m.r2 === D && m.c1 === c.c)?.c2 ?? c.c));
          ws.clearBox(Math.min(...cs), c2, from, D + N - 1);
        });
        for (const v of it.vts) if (v.spot) ws.clearBox(v.spot.c1, v.spot.c2, D + K, D + N - 1);
      }
    } else if (N < K && r.trim) {
      for (let row = D + K - 1; row >= D + N; row--) if (!ws.deleteRow(row, wb)) break;
    }
    for (const i of G) {
      const t = tabs[i]; const cols = colsOf[i];
      for (let j = 0; j < Math.max(t.rows.length, 1); j++) {
        const row = D + j;
        for (const c of cols) {
          const ref = colName(c.c) + row; if (ws.hasFormula(ref)) continue;
          if (j >= t.rows.length && c.f === 'aa') continue;   // κενός πίνακας: ο αριθμός της έτοιμης γραμμής μένει όπως στο πρότυπο
          // «Κενός πίνακας»: κελί με {ΕΤΙΚΕΤΑ}· όλα τα άλλα κελιά όπως πριν
          const raw = j < t.rows.length && t.kind === 'blank' && c.f === 'col' ? c.o?.vals?.[j] : undefined;
          if (raw && raw.includes('{')) {
            const b = blankFill(raw, bx, badB); ws.set(ref, b.v);
            if (b.fmt) ws.setStyle(ref, await wb.like(ws.style(ref), { fmt: b.fmt === 'pct' ? '0%' : '0.0%' }));   // ποσοστό γραμμής πίνακα τιμών
            continue;
          }
          ws.set(ref, j < t.rows.length ? fieldValue(s, t.kind, t.rows[j], c.f, j, d, c.text, c.o) : null);
        }
      }
    }
    if (G.some(i => tabs[i].nohead)) noHead(wb, ws, G.filter(i => tabs[i].nohead).map(i => colsOf[i].map(c => c.c)), HR, G.every(i => tabs[i].nohead) && !it.vts.length);
    if (it.vts.length) await writeBoxes(wb, ws, it.vts, { row: HR, setH: false, exact: !!r.fixed, ...vref, look });
  }
  // πίνακες τιμών χωρίς θέση: αμέσως κάτω από τον τελευταίο πίνακα, πριν τις υπογραφές (ό,τι είναι από κάτω κατεβαίνει)
  if (tail.length) {
    const added = await writeValues(wb, ws, tail, { end, c1: vc1, c2: vc2, gap: cs0.length > 0, h: vref.h, data: vref.data, head: vref.head, look });
    shiftBy(added, end); end += added;
  }
  for (const u of badB) warnings.push('Στον κενό πίνακα υπάρχει η ετικέτα {' + u + '} που δεν είναι στοιχείο εντύπου, γραμμή πίνακα τιμών ούτε μέτρηση. Μένει όπως είναι.');
  // υπογραφές: στο {ΥΠΟΓΡΑΦΕΣ} (του εντύπου ή των Ρυθμίσεων), ή στις υπογραφές του προτύπου αν το έντυπο έχει δικές του
  const more = [blockOf(ws, 'head', parts.head), blockOf(ws, 'date', parts.date), blockOf(ws, 'title', parts.title)];
  const layout = await signSheets(wb, [{ ws, key: 'main', more, after: end, names: parts.names }], s, 'reports', r.sigs, warnings, () => r.layout);
  // στην εκτύπωση μικραίνει ή μεγαλώνει μόνο ο πίνακας· κεφαλίδα, ημερομηνία, τίτλος και υπογραφές μένουν στο μέγεθός τους
  wb.markFixed(ws.name, layout[0]?.blocks || []);
  // εκτύπωση: οι επικεφαλίδες σε κάθε σελίδα (με έναν πίνακα: με πολλούς θα έβγαιναν του πρώτου πάνω από τους άλλους)
  // και ο πίνακας στο πλάτος της σελίδας (μόνο αν το πρότυπο δεν έχει δικά του)
  if (tabs.length === 1 && colsOf[0].length && !items.some(it => it.tabs.length && it.vts.length) && !tabs[0].nohead) wb.setPrintTitles(sheet, head, data - 1);
  ws.setPrintFit(false);
  return layout;
}

// Χωρίς γραμμή επικεφαλίδων (Michael, 29/10): η γραμμή hr μένει στο φύλλο ως τώρα, γιατί από τα κείμενά της βρίσκονται οι στήλες. Εδώ φεύγει από το
// έντυπο, χωρίς να μετακινηθεί καμία άλλη γραμμή (υπογραφές, θέσεις, πίνακες από κάτω μένουν όπου ήταν):
// - όλοι οι πίνακες της γραμμής χωρίς επικεφαλίδες (και τίποτα άλλο δεν γράφεται πάνω της): η γραμμή κρύβεται (Excel και εκτύπωση)
// - αλλιώς (διπλανός πίνακας με επικεφαλίδες, ή πίνακας τιμών που ξεκινά από αυτή τη γραμμή): αδειάζουν μόνο τα κελιά του πίνακα, όχι ολόκληρη η γραμμή
// Η εκτύπωση (print.ts) ξέρει από το κρυφό όνομα NOHEAD_MARK πού ήταν, ώστε να ταξινομεί ακόμα τον πίνακα (κρυφή γραμμή) και να μη μπερδεύει την
// πρώτη γραμμή δεδομένων με επικεφαλίδα (άδεια κελιά)
function noHead(wb: Workbook, ws: Sheet, cols: number[][], hr: number, whole: boolean) {
  const mg = ws.merges();
  const areas = cols.filter(cs => cs.length).map(cs => ({ r1: hr, r2: hr, c1: Math.min(...cs), c2: Math.max(...cs.map(c => mg.find(m => m.r1 === hr && m.c1 === c)?.c2 ?? c)) }));
  if (whole) { ws.setRowHidden(hr); wb.dropPrintTitles(ws.name, hr); } else for (const a of areas) ws.clearBox(a.c1, a.c2, hr, hr);
  wb.markAreas(ws.name, NOHEAD_MARK, areas, true);
}

// ------------------------------------------------------------------ πίνακες τιμών
// Κείμενο αριστερά (ενωμένα κελιά ως ~40 χαρακτήρες από την πρώτη στήλη του πίνακα) και η τιμή δεξιά, με τη μορφή των κελιών του
// πίνακα (πλαίσιο, γράμματα)· προαιρετικός τίτλος πάνω από κάθε πίνακα· μία κενή γραμμή πριν από τον καθένα (gap: και πριν τον πρώτο).
// Μπαίνουν μετά τη γραμμή end (ό,τι είναι από κάτω κατεβαίνει). Γυρνά πόσες γραμμές μπήκαν. at: θέση της πρώτης γραμμής αν χρειαστεί
// αργότερα (Φάση 3: δίπλα/κάτω από άλλον πίνακα) — όλα γράφονται από εδώ.
// η τιμή που γράφεται (δική σου τιμή κείμενο, «—» όταν λείπει, αλλιώς αριθμός) και η μορφή του κελιού της
const vcell = (x: ValueOut['rows'][number]): string | number => (x.txt != null ? x.txt : x.v == null ? '—' : x.v);
const vsty = (x: ValueOut['rows'][number]): string => (x.txt != null ? 'txt' : x.v == null ? 'int' : x.fmt);
export interface ValueAt { end: number; c1: number; c2: number; gap: boolean; h: number; data: number | null; head: number | null; look: XlLook }
export async function writeValues(wb: Workbook, ws: Sheet, vo: ValueOut[], a: ValueAt): Promise<number> {
  const n = vo.reduce((x, t, i) => x + (i || a.gap ? 1 : 0) + (t.title ? 1 : 0) + t.rows.length, 0);
  if (!n) return 0;
  ws.insertRows(a.end, n, 0, wb);
  // μέχρι ποια στήλη φτάνει το κείμενο: ~40 χαρακτήρες πλάτος, αφήνοντας μία στήλη του πίνακα για την τιμή (σε στενό πίνακα συνεχίζει δεξιά του)
  const cap = a.c2 > a.c1 ? a.c2 - 1 : a.c1; let e = a.c1, w = ws.colWidth(a.c1);
  while (e < cap && w < 40) { e++; w += ws.colWidth(e); }
  while (w < 40 && e < a.c2 + 3) { e++; w += ws.colWidth(e); }   // πίνακας στενός (π.χ. 2 στήλες): το κείμενο συνεχίζει δεξιά του, για να μένουν οι γραμμές σε κανονικό ύψος
  const vc = e + 1; const L = colName;
  const { font, h, v } = a.look;
  const base = a.data ?? await wb.style({ font, ...tablePart(a.look, 'data', 12), border: true, h, v });
  const lab = await wb.like(base, { h: 'left', wrap: true });
  const hd = await wb.like(a.head ?? await wb.style({ font, ...tablePart(a.look, 'head', 12), border: true, h, v, fill: FILLS.gray }), { h: 'left', b: true });
  const hdAt: Record<string, number> = {}; const hdOf = async (ta?: string) => (ta && ta !== 'left' ? (hdAt[ta] ??= await wb.like(hd, { h: ta as 'center' | 'right' })) : hd);   // στοίχιση τίτλου που γράφεται τώρα (μόνο όταν ζητήθηκε)
  const sty: Record<string, number> = {};
  const valSt = async (f: string) => (sty[f] ??= await wb.like(base, { h: 'right', ...(f === 'pct' ? { fmt: '0%' } : f === 'pct1' ? { fmt: '0.0%' } : f === 'txt' ? { wrap: true } : {}) }));
  let row = a.end + 1;
  for (let i = 0; i < vo.length; i++) {
    const t = vo[i];
    if (i || a.gap) { if (a.h) ws.setRowHeight(row, a.h); row++; }   // κενή γραμμή
    if (t.title) {
      if (a.h) ws.setRowHeight(row, a.h);
      ws.set(L(a.c1) + row, t.title);
      const ht = await hdOf(t.ta); for (let c = a.c1; c <= vc; c++) ws.setStyle(L(c) + row, ht);
      if (vc > a.c1) ws.addMerge(L(a.c1) + row + ':' + L(vc) + row);
      row++;
    }
    for (const x of t.rows) {
      ws.set(L(a.c1) + row, x.label || null);
      for (let c = a.c1; c <= e; c++) ws.setStyle(L(c) + row, lab);
      const lines = Math.ceil((x.label.length * 1.2) / Math.max(w - 1, 1));   // μεγάλο κείμενο: περισσότερες γραμμές στο ίδιο κελί (το Excel δεν μεγαλώνει μόνο του τα ενωμένα)
      if (lines > 1) ws.setRowHeight(row, Math.max(a.h, 16 * lines)); else if (a.h) ws.setRowHeight(row, a.h);
      if (e > a.c1) ws.addMerge(L(a.c1) + row + ':' + L(e) + row);
      ws.set(L(vc) + row, vcell(x)); ws.setStyle(L(vc) + row, await valSt(vsty(x)));
      row++;
    }
  }
  return n;
}

// Πίνακες τιμών στη θέση που τους άφησε το πρότυπο (spot: στήλες c1–c2): δίπλα-δίπλα, ο καθένας από τη γραμμή row προς τα κάτω (οι γραμμές
// υπάρχουν ήδη, τις έβαλε ο καλών). exact (πλέγμα): το κείμενο και η τιμή μοιράζονται ακριβώς τις στήλες του· αλλιώς, όπως οι πίνακες στο τέλος.
// setH: ύψος γραμμών όπως του πίνακα ατόμων (μόνο σε δικές τους γραμμές· δίπλα σε πίνακα ατόμων οι γραμμές είναι κοινές και μεγαλώνουν μόνο για μεγάλο κείμενο)
export interface BoxAt { row: number; setH: boolean; exact: boolean; h: number; data: number | null; head: number | null; look: XlLook }
export async function writeBoxes(wb: Workbook, ws: Sheet, vts: ValueOut[], a: BoxAt): Promise<void> {
  const L = colName; const { font, h, v } = a.look;
  const base = a.data ?? await wb.style({ font, ...tablePart(a.look, 'data', 12), border: true, h, v });
  const lab = await wb.like(base, { h: 'left', wrap: true });
  const hd = await wb.like(a.head ?? await wb.style({ font, ...tablePart(a.look, 'head', 12), border: true, h, v, fill: FILLS.gray }), { h: 'left', b: true });
  const hdAt: Record<string, number> = {}; const hdOf = async (ta?: string) => (ta && ta !== 'left' ? (hdAt[ta] ??= await wb.like(hd, { h: ta as 'center' | 'right' })) : hd);   // στοίχιση τίτλου που γράφεται τώρα (μόνο όταν ζητήθηκε)
  const sty: Record<string, number> = {};
  const valSt = async (f: string) => (sty[f] ??= await wb.like(base, { h: 'right', ...(f === 'pct' ? { fmt: '0%' } : f === 'pct1' ? { fmt: '0.0%' } : f === 'txt' ? { wrap: true } : {}) }));
  for (const t of vts) {
    const c1 = t.spot?.c1 ?? 1, c2 = Math.max(c1 + 1, t.spot?.c2 ?? c1 + 1);
    // μέχρι ποια στήλη φτάνει το κείμενο και από ποια ξεκινά η τιμή
    let e: number, vc: number, w = ws.colWidth(c1);
    if (a.exact) { let vw = 1, wv = ws.colWidth(c2); while (vw < c2 - c1 && wv < 12) { vw++; wv += ws.colWidth(c2 - vw + 1); } vc = c2 - vw + 1; e = vc - 1; w = 0; for (let c = c1; c <= e; c++) w += ws.colWidth(c); }
    else { const cap = c2 > c1 ? c2 - 1 : c1; e = c1; while (e < cap && w < 40) { e++; w += ws.colWidth(e); } while (w < 40 && e < c2 + 3) { e++; w += ws.colWidth(e); } vc = e + 1; }
    let row = a.row;
    if (t.title) {
      if (a.setH && a.h) ws.setRowHeight(row, a.h);
      ws.set(L(c1) + row, t.title);
      const ht = await hdOf(t.ta); const last = a.exact ? c2 : vc; for (let c = c1; c <= last; c++) ws.setStyle(L(c) + row, ht);
      if (last > c1) ws.addMerge(L(c1) + row + ':' + L(last) + row);
      row++;
    }
    for (const x of t.rows) {
      ws.set(L(c1) + row, x.label || null);
      for (let c = c1; c <= e; c++) ws.setStyle(L(c) + row, lab);
      const lines = Math.ceil((x.label.length * 1.2) / Math.max(w - 1, 1));
      if (lines > 1) ws.setRowHeight(row, Math.max(a.setH ? a.h : ws.rowHeight(row), 16 * lines)); else if (a.setH && a.h) ws.setRowHeight(row, a.h);
      if (e > c1) ws.addMerge(L(c1) + row + ':' + L(e) + row);
      ws.set(L(vc) + row, vcell(x)); ws.setStyle(L(vc) + row, await valSt(vsty(x)));
      if (a.exact) { for (let c = vc + 1; c <= c2; c++) ws.setStyle(L(c) + row, await valSt(vsty(x))); if (c2 > vc) ws.addMerge(L(vc) + row + ':' + L(c2) + row); }
      row++;
    }
  }
}

// ------------------------------------------------------------------ «Φτιάξ' το εδώ»
const WMUL = { auto: 1, narrow: 0.7, wide: 1.6 };
const GRID = 24;   // πλέγμα: η σελίδα σε 24 στήλες
// span στήλες του πλέγματος σε κομμάτια ανάλογα με τα βάρη w (τουλάχιστον μία το καθένα, σύνολο ακριβώς span)
export function splitSpan(span: number, w: number[]): number[] {
  const tot = w.reduce((a, b) => a + b, 0) || 1; const want = w.map(x => (span * x) / tot);
  const a = want.map(x => Math.max(1, Math.floor(x)));
  while (a.reduce((x, y) => x + y, 0) < span) { let i = 0; want.forEach((x, j) => { if (x - a[j] > want[i] - a[i]) i = j; }); a[i]++; }
  while (a.reduce((x, y) => x + y, 0) > span) { let i = -1; a.forEach((x, j) => { if (x > 1 && (i < 0 || x - want[j] > a[i] - want[i])) i = j; }); if (i < 0) break; a[i]--; }
  return a;
}
// Το πρότυπο από τις επιλογές και πού μπήκαν τα πράγματα (για την αντιστοίχιση του εντύπου). Γραμματοσειρά και στοίχιση
// από τις Ρυθμίσεις › Γράμματα Excel (look)· το μέγεθος από τις επιλογές του προτύπου.
// Με πίνακες 2, 3… (o.more): ο καθένας μία γραμμή κάτω από τον προηγούμενο, με τον τίτλο του από πάνω· το πλάτος κάθε
// στήλης όσο χρειάζεται ο πιο φαρδύς πίνακας σε αυτή τη θέση.
export async function buildTemplate(o: BuildOpts, kind: RepKind, look: XlLook = XL_LOOK): Promise<BuiltOut & { data: Buffer }> {
  const sheet = 'ΚΑΤΑΣΤΑΣΗ';
  const wb = await Workbook.blank(sheet); const ws = await wb.sheet(0);
  const one = (cs: BuildOpts['cols']) => (cs.length ? cs : [{ f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }]);
  const cols = one(o.cols);
  // nop: χωρίς πίνακα ατόμων (μόνο πίνακες τιμών): τίτλος, δύο στήλες (κείμενο, τιμή) και οι υπογραφές
  const nop = !!o.nopeople && !(o.more || []).length;
  type Tab = { id: string; title: string; ta?: TAlign; kind: RepKind; cols: BuildOpts['cols']; lay?: TabLay; grid?: string[][]; nrows?: number };
  const tables: Tab[] = nop ? [] : [{ id: '', title: o.t1 || '', ta: o.ta1, kind, cols, lay: o.lay, ...(kind === 'blank' ? { grid: o.grid, nrows: blankN(o.nrows) } : {}) }, ...(o.more || []).map(t => ({ id: t.id, title: t.title, ta: t.ta, kind: t.kind, cols: one(t.cols), lay: t.lay, ...(t.kind === 'blank' ? { grid: t.grid, nrows: blankN(t.nrows) } : {}) }))];
  const sz = o.sz || 11; const fill = FILLS[o.fill] || '';
  const grid = !nop && gridOn(o); if (grid) wb.widen = false;   // πλέγμα: οι στήλες μένουν όσο τις έστησες
  // θέσεις πινάκων (Φάση 3): ζώνες πάνω-κάτω, μέσα σε κάθε ζώνη πίνακες ατόμων και χώρος για πίνακες τιμών που γεμίζουν όταν βγαίνει το έντυπο
  type Item = { id: string; t?: Tab; v?: BuildVal };
  const items = new Map<string, Item>();
  for (const t of tables) items.set(t.id || MAIN, { id: t.id || MAIN, t });
  for (const v of nop ? [] : o.vals || []) items.set(v.id, { id: v.id, v });
  const rows: Item[][] = nop ? [] : bandsOf([...items.keys()], o.bands).map(b => b.map(id => items.get(id)!));
  const gapOf = (x: Item) => Math.max(0, Math.min(10, (x.t ? x.t.lay : x.v?.lay)?.gap ?? 1));   // κενές γραμμές πάνω από κάθε πίνακα (προεπιλογή μία)
  // πλάτος κάθε στήλης όπως θα ήταν μόνη της (σε χαρακτήρες)
  const natural = (t: Tab) => t.cols.map(c => { const f = fieldOf(t.kind, c.f); const h = (c.h || f?.head || '').trim() || ' '; return Math.round(Math.max(4, Math.max(f?.w || 12, Math.min(40, h.length * 1.1 + 2)) * WMUL[c.w || 'auto'] * (sz / 11)) * 10) / 10; });
  const W = o.land ? 140 : 96;
  // πόσες στήλες του πλέγματος θέλει ένας πίνακας (min: όσες χρειάζεται για να χωρέσει) · πίνακας τιμών: το μισό της σελίδας αν δεν πεις αλλιώς
  const wantOf = (x: Item): { min: number; want: number } => {
    if (x.v) return { min: 4, want: Math.max(4, Math.round(GRID * (TAB_WIDTHS.find(w => w.value === (x.v!.lay?.w || 'auto'))?.f || 0.5))) };
    const t = x.t!; const fr = TAB_WIDTHS.find(w => w.value === (t.lay?.w || 'auto'))?.f || Math.min(1, natural(t).reduce((a, b) => a + b, 0) / W);
    return { min: t.cols.length, want: Math.max(t.cols.length, Math.round(GRID * fr)) };
  };
  // ζώνη με έναν: όπως πάντα· με πολλούς: μοιράζονται τις στήλες (ένα κενό ανάμεσα), αν δεν χωράνε μικραίνουν αναλογικά, ως το ελάχιστο του καθενός
  const spansOf = (band: Item[]): number[] => {
    const w = band.map(wantOf); if (band.length === 1) return [Math.min(GRID, w[0].want)];
    const avail = GRID - (band.length - 1);
    if (w.reduce((a, x) => a + x.want, 0) <= avail) return w.map(x => x.want);
    const sp = splitSpan(avail, w.map(x => x.want));
    for (let i = 0; i < sp.length; i++) while (sp[i] < w[i].min) { let j = -1; sp.forEach((x, k) => { if (k !== i && x > w[k].min && (j < 0 || x - w[k].min > sp[j] - w[j].min)) j = k; }); if (j < 0) break; sp[j]--; sp[i]++; }
    return sp.map((x, i) => Math.max(x, w[i].min));
  };
  const spans = rows.map(spansOf); const block = spans.map(sp => sp.reduce((a, b) => a + b, 0) + sp.length - 1);
  const N = grid ? Math.max(GRID, ...block) : 0;   // το πλέγμα μεγαλώνει μόνο αν σε μια ζώνη δεν χωράνε ούτε οι ελάχιστες στήλες
  const n = nop ? 2 : grid ? N : Math.max(...tables.map(t => t.cols.length)); const L = (c: number) => colName(c);
  // πού πέφτει κάθε στήλη: χωρίς πλέγμα η i-οστή στήλη του φύλλου· με πλέγμα ένα κομμάτι από τις στήλες της σελίδας (στη ζώνη: μετά τον προηγούμενο πίνακα)
  const boxes = new Map<string, [number, number]>();
  if (grid) rows.forEach((band, bi) => {
    const lay = (band[0].t ? band[0].t.lay : band[0].v?.lay) || {};
    let c = lay.at === 'center' ? 1 + Math.floor((N - block[bi]) / 2) : lay.at === 'right' ? N - block[bi] + 1 : 1;
    band.forEach((x, i) => { boxes.set(x.id, [c, c + spans[bi][i] - 1]); c += spans[bi][i] + 1; });
  });
  const placeOf = (t: Tab): [number, number][] => {
    if (!grid) return t.cols.map((_, i) => [i + 1, i + 1]);
    const [start, end] = boxes.get(t.id || MAIN)!; const lay = t.lay || {};
    const nat = natural(t); const parts = splitSpan(end - start + 1, lay.even ? nat.map(() => 1) : nat);
    let c = start; return parts.map(k => { const x: [number, number] = [c, c + k - 1]; c += k; return x; });
  };
  const { font, h, v } = look;
  // κάθε κομμάτι με τα γράμματά του από τις Ρυθμίσεις (μέγεθος, έντονα, πλάγια, υπογράμμιση), αλλιώς όπως πριν
  const T = tablePart(look, 'title', sz, { u: true }), H = tablePart(look, 'head', sz), C = tablePart(look, 'data', sz);
  const hd = { sz: 10, b: true, ...formPart(look, 'hdr') }, sg = formPart(look, 'sig') || {};
  const st = {
    hdr: await wb.style({ font, ...hd, h: 'left' }), date: await wb.style({ font, ...hd, h: 'right' }),
    title: await wb.style({ font, ...T, h: 'center' }),
    head: await wb.style({ font, ...H, border: true, h, v, wrap: true, fill }),
    cell: await wb.style({ font, ...C, border: true, h, v }),
    sig: await wb.style({ font, sz, b: true, ...sg, h: 'center' }), sigName: await wb.style({ font, sz, ...sg, h: 'center' }),
    sub: await wb.style({ font, ...H, h: 'left' })
  };
  // στοίχιση τίτλων (ta1, ta, tta): ένα στυλ ανά στοίχιση, μόνο όταν χρησιμοποιείται· χωρίς αυτές τα στυλ μένουν όπως πριν
  const subAt: Record<string, number> = {};
  for (const ta of new Set([...tables.map(t => t.ta), ...(nop ? [] : o.vals || []).map(x => x.ta)])) if (ta && ta !== 'left') subAt[ta] = await wb.like(st.sub, { h: ta });
  const pageTitle = o.tta && o.tta !== 'center' ? await wb.like(st.title, { h: o.tta }) : st.title;
  let r = 1;
  if (o.head || o.date) {
    if (o.head) ['ΚΕΦΑΛΙΔΑ 1', 'ΚΕΦΑΛΙΔΑ 2', 'ΚΕΦΑΛΙΔΑ 3'].forEach((t, i) => ws.set('A' + (i + 1), '{' + t + '}').setStyle('A' + (i + 1), st.hdr));
    if (o.date) {
      // πάνω δεξιά: στις δύο τελευταίες στήλες (συγχωνευμένες) αν χωράει δίπλα στην κεφαλίδα
      if (!grid && o.head && n <= 3) {
        // στενός πίνακας (π.χ. Α/Α, βαθμός, ονοματεπώνυμο): δίπλα στην κεφαλίδα (στήλη Β) δεν χωρά ούτε η μία ούτε η άλλη (και η αλλαγή θέσης κεφαλίδας-ημερομηνίας
        // την έσπρωχνε στη στενή στήλη), οπότε η ημερομηνία πάει στη γραμμή 4, ανάμεσα στην κεφαλίδα και τον τίτλο, δεξιά σε όλο το πλάτος
        ws.set('A4', '{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}').setStyle('A4', st.date);
        if (n >= 2) { for (let c = 2; c <= n; c++) ws.setStyle(L(c) + 4, st.date); ws.addMerge('A4:' + L(n) + '4'); }
      } else {
        const c1 = grid ? n - 7 : n >= 3 ? n - 1 : o.head ? Math.max(2, n) : 1;   // πλέγμα: στο τελευταίο 1/3 της σελίδας
        ws.set(L(c1) + 1, '{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}').setStyle(L(c1) + 1, st.date);
        if (n >= 3) { ws.setStyle(L(n) + 1, st.date); ws.addMerge(L(c1) + '1:' + L(n) + '1'); }
      }
    }
    r = o.head ? 5 : 3;
  }
  const tref = 'A' + r; ws.set(tref, o.title || ' ').setStyle(tref, pageTitle); if (n > 1) { ws.addMerge('A' + r + ':' + L(n) + r); for (let c = 2; c <= n; c++) ws.setStyle(L(c) + r, pageTitle); }
  ws.setRowHeight(r, T.sz * 1.6);
  const widths: Record<number, number> = {};
  const placed: { id: string; head: number; cols: RepCol[] }[] = [];
  const spots: ({ id: string } & Spot)[] = []; let besideMain = false;
  let next = nop ? r + 1 : r + 1 + gapOf(rows[0][0]), data = next;
  if (nop) { placed.push({ id: '', head: r, cols: [] }); data = r + 1; widths[1] = 46; widths[2] = 14; }
  rows.forEach((band, bi) => {
    const tabs = band.filter(x => x.t).map(x => x.t!), vs = band.filter(x => x.v).map(x => x.v!);
    const gapNext = rows[bi + 1] ? gapOf(rows[bi + 1][0]) : 1;
    if (!tabs.length) {
      // μόνο πίνακες τιμών: μία γραμμή που τη μεγαλώνει το έντυπο όσο χρειάζεται (Report.vals[].spot.row)
      for (const x of vs) { const [c1, c2] = boxes.get(x.id) || [1, n]; spots.push({ id: x.id, c1, c2, row: next }); }
      data = next; next = data + 1 + gapNext; return;
    }
    // τίτλος του πίνακα (2, 3…) στη γραμμή πάνω από τις επικεφαλίδες του· ζώνη με πίνακες δίπλα-δίπλα: μία γραμμή τίτλων για όλους,
    // και για τους πίνακες τιμών της ζώνης (Michael, 29/10: ο τίτλος τους έπεφτε στη γραμμή των επικεφαλίδων, κάτω από τον τίτλο του διπλανού)
    const vt = vs.filter(v => v.title?.trim()); const titled = new Set<string>();
    if (tabs.some(t => t.title.trim()) || vt.length) {
      const title = (c1: number, c2: number, text: string, ta?: TAlign) => {
        const sx = (ta && subAt[ta]) || st.sub;
        ws.set(L(c1) + next, text).setStyle(L(c1) + next, sx);
        if (c2 > c1) { for (let c = c1 + 1; c <= c2; c++) ws.setStyle(L(c) + next, sx); ws.addMerge(L(c1) + next + ':' + L(c2) + next); }
      };
      for (const t of tabs) {
        if (!t.title.trim()) continue;
        const at = placeOf(t); title(at[0][0], at[at.length - 1][1], t.title.trim(), t.ta);
      }
      for (const x of vt) { const [c1, c2] = boxes.get(x.id) || [1, n]; title(c1, c2, x.title!.trim(), x.ta); titled.add(x.id); }
      next++;
    }
    const head = next; data = head + 1;
    for (const t of tabs) {
      const at = placeOf(t);
      const out: RepCol[] = []; const nat = natural(t); let dj = 0;   // dj: ποια στήλη του πλέγματος (χωρίς το Α/Α) είναι η τωρινή, στο «Κενό»
      t.cols.forEach((c, i) => {
        const f = fieldOf(t.kind, c.f); const h = (c.h || f?.head || '').trim() || ' ';
        const [a, b] = at[i];
        ws.set(L(a) + head, h);
        for (let x = a; x <= b; x++) { ws.setStyle(L(x) + head, st.head); ws.setStyle(L(x) + data, st.cell); }
        if (b > a) { ws.addMerge(L(a) + head + ':' + L(b) + head); ws.addMerge(L(a) + data + ':' + L(b) + data); }
        if (!grid) widths[a] = Math.max(widths[a] || 0, nat[i]);
        // «Κενό»: τα κελιά της στήλης (όσα έγραψες, μέχρι τις γραμμές του πίνακα) πάνε στην αναφορά της στήλης· τα κενά στο τέλος φεύγουν
        let vals: string[] | undefined;
        if (t.kind === 'blank' && c.f !== 'aa') { const j = dj++; vals = (t.grid || []).slice(0, t.nrows).map(row => String(row?.[j] ?? '')); while (vals.length && !vals[vals.length - 1].trim()) vals.pop(); if (!vals.length) vals = undefined; }
        out.push({ c: a, f: c.f, h: upper(h), ...(c.f === 'text' && c.text ? { text: c.text } : {}), ...(c.o || vals ? { o: { ...c.o, ...(vals ? { vals } : {}) } } : {}) });
      });
      placed.push({ id: t.id, head, cols: out });
    }
    ws.setRowHeight(head, H.sz * 2.4); ws.setRowHeight(data, sz * 1.9);
    for (const x of vs) { const [c1, c2] = boxes.get(x.id) || [1, n]; spots.push({ id: x.id, c1, c2, ...(titled.has(x.id) ? { tt: true as const } : {}) }); if (tabs.some(t => !t.id)) besideMain = true; }
    next = data + 1 + gapNext;
  });
  if (grid) for (let c = 1; c <= N; c++) widths[c] = Math.round((W / GRID) * 10) / 10;
  ws.setColWidths(widths);
  if (o.sig === 'list') {
    // μία γραμμή για όλες: γεμίζει όταν βγαίνει, με τις υπογραφές του εντύπου ή των Ρυθμίσεων
    const sr = data + 2; ws.set('A' + sr, SIG_TAG).setStyle('A' + sr, st.sig);
    if (n > 1) { for (let c = 2; c <= n; c++) ws.setStyle(L(c) + sr, st.sig); ws.addMerge('A' + sr + ':' + L(n) + sr); }
  } else if (o.sig !== 'none') {
    const sr = data + 2; const half = Math.max(1, Math.floor(n / 2));
    const left = n > 1 ? 'A' + sr + ':' + L(half) + sr : null;
    ws.set('A' + sr, 'Ο ΛΟΧΙΑΣ').setStyle('A' + sr, st.sig); ws.set('A' + (sr + 3), '{ΛΟΧΙΑΣ}').setStyle('A' + (sr + 3), st.sigName);
    if (left && half > 1) { ws.addMerge(left); ws.addMerge('A' + (sr + 3) + ':' + L(half) + (sr + 3)); }
    if (o.sig === 'both') {
      const c1 = n > 1 ? half + 1 : 1, rr = n > 1 ? sr : sr + 5;
      ws.set(L(c1) + rr, 'Ο ΔΙΟΙΚΗΤΗΣ').setStyle(L(c1) + rr, st.sig); ws.set(L(c1) + (rr + 3), '{ΔΙΟΙΚΗΤΗΣ}').setStyle(L(c1) + (rr + 3), st.sigName);
      if (n > c1) { ws.addMerge(L(c1) + rr + ':' + L(n) + rr); ws.addMerge(L(c1) + (rr + 3) + ':' + L(n) + (rr + 3)); }
    }
  }
  ws.setPrintFit(!!o.land); ws.setFooter('ΣΕΛΙΔΑ &P ΑΠΟ &N');
  const main = placed.find(x => !x.id)!; const more = placed.filter(x => x.id);
  if (!more.length && !nop && !besideMain) wb.setPrintTitles(sheet, main.head, main.head);
  // οι ετικέτες μένουν μέσα στο αρχείο: αν το ανοίξεις στο Excel και το αλλάξεις, η εφαρμογή τις ξαναβρίσκει
  return { data: await wb.save(), sheet, head: main.head, cols: main.cols, cells: [{ ref: tref, k: GTITLE }], ...(more.length ? { more } : {}), ...(spots.length ? { vals: spots } : {}), ...(grid ? { fixed: true } : {}) };
}

// Προεπισκόπηση: η πρώτη σελίδα όπως θα τυπωθεί, με τα κελιά σημαδεμένα (data-a) για να διαλέγεις με κλικ
// sample (σελίδα δημιουργίας): πόσες γραμμές δείχνει κάθε πίνακας (0: όλοι)· τότε το αποτέλεσμα έχει και counts. Χωρίς sample: οι πρώτοι 120 του 1ου πίνακα, όπως πριν.
export async function previewReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate, pages = 1, sample?: number): Promise<{ html: string; css: string; pages: number; counts?: PvCount[]; error?: string }> {
  const out = sample == null ? await fillReport(tpl, s, r, ids.slice(0, 120), d) : await fillReport(tpl, s, r, ids, d, {}, { sample });
  const doc = await renderBook(out.data, { file: out.name, sheets: [out.sheets[0]], refs: true, maxPages: pages });
  const sh = doc.sheets[0];
  return { html: sh ? sh.html : '', css: doc.css, pages: sh ? sh.pages : 0, ...(out.counts ? { counts: out.counts } : {}) };
}
// Μόνο το πρότυπο όπως είναι (χωρίς στοιχεία): για να δείξεις τη γραμμή των επικεφαλίδων και τα κελιά πριν την αντιστοίχιση
export async function previewTemplate(tpl: Buffer | Uint8Array, sheet: string, pages = 1): Promise<{ html: string; css: string; pages: number }> {
  const doc = await renderBook(tpl, { file: 'πρότυπο.xlsx', sheets: [sheet], refs: true, maxPages: pages });
  const sh = doc.sheets[0];
  return { html: sh ? sh.html : '', css: doc.css, pages: sh ? sh.pages : 0 };
}
// «Φύλλο στο Δυναμολόγιο» / «Φύλλο σε άλλο Excel»: τα φύλλα του εντύπου μέσα στο αρχείο (pairs: [φύλλο εντύπου, όνομα εκεί]).
// Ένα υπάρχον φύλλο με αυτό το όνομα γράφεται από πάνω στην ίδια θέση· τα άλλα φύλλα, οι τύποι και οι μακροεντολές δεν αλλάζουν.
// mine: τα φύλλα που έφτιαξε ήδη αυτό το έντυπο· όποιο άλλο υπάρχει με ίδιο όνομα επιστρέφεται (clash) χωρίς να γραφτεί
// τίποτα (null: γράφονται όλα, ο χρήστης είπε «Αντικατάσταση»). Το Excel δεν ξεχωρίζει κεφαλαία-μικρά στα ονόματα φύλλων.
export async function placeSheets(target: Buffer | Uint8Array, out: Buffer | Uint8Array, pairs: [string, string][], mine: string[] | null): Promise<{ data?: Buffer; clash?: string[] }> {
  const wb = await Workbook.open(target);
  const same = (to: string) => wb.sheetNames().find(n => n.toUpperCase() === to.toUpperCase());
  if (mine) { const clash = pairs.map(p => same(p[1])).filter((n): n is string => !!n && !mine.includes(n)); if (clash.length) return { clash }; }
  const src = await Workbook.open(out);
  for (const [from, to] of pairs) { const ex = same(to); if (ex && ex !== to) wb.renameSheet(ex, to); await wb.importSheet(src, from, to); wb.markReport(to); }
  return { data: await wb.save() };
}
