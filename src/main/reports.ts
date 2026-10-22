// Έντυπα (Michael, 19/10): συμπλήρωση δικών σου προτύπων Excel και πρότυπα που φτιάχνει η εφαρμογή («Φτιάξ' το εδώ»).
// Με το ελαφρύ xlsx.ts, όπως η ΦΡΟΥΡΑ και η ΗΚΑΙ: αλλάζουν μόνο οι τιμές, η μορφοποίηση του προτύπου μένει όπως είναι.
// Η πρώτη γραμμή κάτω από τις επικεφαλίδες είναι η «γραμμή-πρότυπο»: κάθε άτομο παίρνει τη μορφή της και ό,τι είναι
// από κάτω (υπογραφές, σύνολα) κατεβαίνει όσο μεγαλώνει η λίστα.
import { Workbook, colName, colNum, sheetSafe, type Sheet, type XlValue } from './xlsx';
import { TemplateError, signSheets, unitWords } from './exports';
import { blockOf } from './layout';
import type { LayoutSheet } from '../shared/layout';
import { SIG_TAG } from './sigs';
import { renderBook } from './print';
import { normGreek, upper } from '../shared/text';
import { FILLS, TAG_RE, byIds, cellValue, fieldOf, fieldValue, groupsOf, guessField, repFileName, tagKey, type BuildOpts, type RepCell, type RepCol, type RepGroup, type RepKind, type Report, type Row } from '../shared/reports';
import type { AppState } from '../shared/domain';
import { XL_LOOK, formPart, tablePart, type XlLook } from '../shared/xlLook';
import type { ISODate } from '../shared/dates';
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
  return { sheets, sheet: name, head: found.head, data, headers, tags: tagsOf(rows, data), prepared: preparedRows(ws, data, headers.map(h => h.c), headers.find(h => h.f === 'aa')?.c), guessed: found.guessed };
}

// Αν άλλαξε το πρότυπο στο Excel (π.χ. μπήκε γραμμή πάνω από τον πίνακα), οι επικεφαλίδες ξαναβρίσκονται από τα κείμενά τους
function locateHead(ws: Sheet, rows: XlValue[][], r: Report): number {
  const want = r.cols.filter(c => c.h && !/^\{/.test(c.h));
  if (!want.length) return r.head;
  // οι επικεφαλίδες μπορεί να είναι σε δύο γραμμές (συγχωνευμένες): μετρά από τη γραμμή ως πριν τα δεδομένα
  const hits = (row: number) => { const end = dataRowOf(ws, row); return want.filter(c => { for (let x = row; x < end; x++) if (key(rows[x - 1]?.[c.c - 1]) === key(c.h)) return true; return false; }).length; };
  let best = r.head, score = hits(r.head);
  for (let row = 1; row <= Math.min(rows.length, SCAN_ROWS); row++) { const h = hits(row); if (h > score) { best = row; score = h; } }
  if (score * 2 >= want.length) return best;
  throw new TemplateError('Το πρότυπο άλλαξε και δεν βρίσκω τις στήλες του πίνακα (' + want.map(c => c.h).slice(0, 4).join(', ') + '). Άνοιξε το έντυπο με «Αλλαγή» και δείξε ξανά τη γραμμή με τις επικεφαλίδες.');
}

// Το συμπληρωμένο έντυπο. ids: τα άτομα με τη σειρά που θα μπουν (η οθόνη έχει ήδη κάνει φίλτρα, τυχαία επιλογή, σειρά).
// Με χωρισμό (r.split) ένα φύλλο ανά ομάδα, αντίγραφα του προτύπου, με όνομα «ΘΑΛΑΜΟΣ 3» ή, με prefix, «ΑΓΓΑΡΕΙΑ Θ3»
// (φύλλα στο Δυναμολόγιο)· stale: ομάδες που είχαν βγει παλιότερα και τώρα δεν έχουν κανέναν (γράφονται άδειες, για να μη
// μείνουν παλιά ονόματα)
export type GroupKey = Omit<RepGroup, 'rows'>;
export interface FillOpts { prefix?: string; stale?: GroupKey[] }
export async function fillReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate, o: FillOpts = {}): Promise<{ name: string; data: Buffer; warnings: string[]; sheets: string[]; groups: GroupKey[]; layout: LayoutSheet[] }> {
  const wb = await Workbook.open(tpl); wb.widen = true; const warnings: string[] = [];
  await unitWords(wb, s);
  const sheet = r.sheet && wb.hasSheet(r.sheet) ? r.sheet : wb.sheetNames()[0];
  const rows = byIds(s, r.kind, ids.slice(0, MAX_ROWS), d);
  if (ids.length > MAX_ROWS) warnings.push('Μπήκαν οι πρώτοι ' + MAX_ROWS + '.');
  const split = !!r.split && r.split !== 'none' && r.kind !== 'cadre';
  let groups = groupsOf(s, r.kind, rows, r.split);
  if (split) groups = [...groups, ...(o.stale || []).filter(x => !groups.some(g => g.key === x.key)).map(x => ({ ...x, rows: [] }))];
  if (!groups.length) groups = [{ key: '', label: '', short: '', rows: [] }];
  const names: string[] = []; const layout: LayoutSheet[] = [];
  if (!split) { layout.push(...await fillSheet(wb, sheet, s, r, rows, d, '', warnings)); names.push(sheet); }
  else {
    // πρώτα τα αντίγραφα (από το άδειο πρότυπο), μετά συμπλήρωση· το πρώτο φύλλο του προτύπου παίρνει την πρώτη ομάδα
    const want = groups.map(g => (o.prefix ? o.prefix.slice(0, Math.max(1, 30 - g.short.length)).trim() + ' ' + g.short : g.label) || 'ΦΥΛΛΟ');
    const used = new Set(wb.sheetNames().filter(x => x !== sheet));
    const uniq = want.map(w => { let x = sheetSafe(w), i = 2; while (used.has(x)) x = sheetSafe(w.slice(0, 27) + ' ' + i++); used.add(x); return x; });
    for (let i = 1; i < groups.length; i++) await wb.cloneSheet(sheet, uniq[i]);
    const first = wb.renameSheet(sheet, uniq[0]);
    for (let i = 0; i < groups.length; i++) { const l = await fillSheet(wb, i ? uniq[i] : first, s, r, groups[i].rows, d, groups[i].label, warnings); if (!i) layout.push(...l); }
    names.push(first, ...uniq.slice(1));
  }
  const name = repFileName(r, d);
  return { name, data: await wb.save(), warnings: [...new Set(warnings)], sheets: names, groups: split ? groups.map(({ key, label, short }) => ({ key, label, short })) : [], layout };
}
async function fillSheet(wb: Workbook, sheet: string, s: AppState, r: Report, rows: Row[], d: ISODate, group: string, warnings: string[]): Promise<LayoutSheet[]> {
  const ws = await wb.sheet(sheet); const tagScan = await wb.values(sheet, TAG_ROWS, SCAN_COLS); const scan = tagScan.slice(0, SCAN_ROWS);
  const head = locateHead(ws, scan, r); const data = dataRowOf(ws, head);
  const n = rows.length;
  const cols = r.cols.filter(c => c.c >= 1 && fieldOf(r.kind, c.f));
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
  const inTable = new Set(cols.map(c => colName(c.c) + data));
  // χωρισμός σε φύλλα: αν το πρότυπο δεν έχει πουθενά {ΟΜΑΔΑ}, η ομάδα μπαίνει δίπλα στον τίτλο (ΑΓΓΑΡΕΙΑ - ΘΑΛΑΜΟΣ 3)
  const tags = tagCells(tagScan);
  const hasGroup = r.cells.some(c => c.k === 'group') || tags.some(t => [...t.text.matchAll(TAG_RE)].some(m => tagKey(m[1]) === 'group'));
  const val = (k: string) => { const v = cellValue(s, k, d, r, n, group); return k === 'title' && group && !hasGroup && v ? v + ' - ' + group : v; };
  // ο τίτλος του «Φτιάξ' το εδώ» είναι κείμενο του προτύπου (GTITLE): παίρνει μόνο την ομάδα
  for (const c of r.cells) if (c.k === GTITLE && group && !hasGroup && !r.cells.some(x => x.k === 'title')) { const t = ws.get(c.ref); if (t != null && String(t).trim()) ws.set(c.ref, String(t).trim() + ' - ' + group); }
  // κεφαλίδα και τόπος/ημερομηνία: για τη μετακίνηση πάνω στο χαρτί (layout.ts)
  const parts: Record<'head' | 'date', string[]> = { head: [], date: [] };
  const mark = (k: string | null | undefined, ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!k || !m) return;
    if (k === 'placeDate') parts.date.push(ref);
    else if (/^head\d?$/.test(k)) parts.head.push(...(k === 'head' ? [0, 1, 2] : [0]).map(i => m[1] + (+m[2] + i)));
  };
  for (const t of tags) {
    if (inTable.has(t.ref)) continue;
    const whole = /^\{([^{}]+)\}$/.exec(t.text.trim());
    if (whole) mark(tagKey(whole[1]), t.ref);
    if (whole && tagKey(whole[1]) === 'sigs') continue;   // οι υπογραφές μπαίνουν στο τέλος, όταν ξέρουμε πού κατέληξε η γραμμή τους
    if (whole && tagKey(whole[1])) await put(t.ref, val(tagKey(whole[1])!));
    else ws.set(t.ref, t.text.replace(TAG_RE, (m, tg: string) => { const kk = tagKey(tg); if (!kk) return m; const v = val(kk); return v == null ? '' : String(v).replace(/\n/g, ' '); }));
  }
  for (const c of r.cells) if (c.k !== GTITLE && /^[A-Z]{1,3}\d+$/.test(c.ref) && !inTable.has(c.ref)) { mark(c.k, c.ref); if (c.k === 'sigs') ws.set(c.ref, SIG_TAG); else await put(c.ref, val(c.k)); }
  // ο πίνακας: όσες γραμμές χρειάζονται, με τη μορφή της γραμμής-προτύπου
  const aa = cols.find(c => c.f === 'aa');
  const k = preparedRows(ws, data, cols.map(c => c.c), aa?.c);
  // ό,τι είναι κάτω από τον πίνακα κατεβαίνει ή ανεβαίνει μαζί του
  const shift = (by: number) => { for (const key of ['head', 'date'] as const) parts[key] = parts[key].map(x => x.replace(/(\d+)$/, (_m, nn: string) => String(+nn > data + k - 1 ? Math.max(1, +nn + by) : +nn))); };
  if (n > k) shift(n - k);
  else if (n < k && r.trim) shift(-(k - Math.max(n, 1)));
  if (n > k) {
    ws.insertRows(data + k - 1, n - k, data, wb);
    if (aa) ws.chainAa(aa.c, data + k - 1, n - k);
    await wb.growRanges(ws, data, data + k - 1, data + n - 1);
  } else if (n < k && r.trim) {
    for (let row = data + k - 1; row >= data + Math.max(n, 1); row--) if (!ws.deleteRow(row, wb)) break;
  }
  for (let i = 0; i < Math.max(n, 1); i++) {
    const row = data + i;
    for (const c of cols) {
      const ref = colName(c.c) + row; if (ws.hasFormula(ref)) continue;
      if (i >= n && c.f === 'aa') continue;   // κενός πίνακας: ο αριθμός της έτοιμης γραμμής μένει όπως στο πρότυπο
      ws.set(ref, i < n ? fieldValue(s, r.kind, rows[i], c.f, i, d, c.text) : null);
    }
  }
  // υπογραφές: στο {ΥΠΟΓΡΑΦΕΣ} (του εντύπου ή των Ρυθμίσεων), ή στις υπογραφές του προτύπου αν το έντυπο έχει δικές του
  const layout = await signSheets(wb, [{ ws, key: 'main', more: [blockOf(ws, 'head', parts.head), blockOf(ws, 'date', parts.date)] }], s, 'reports', r.sigs, warnings, () => r.layout);
  // εκτύπωση: οι επικεφαλίδες σε κάθε σελίδα και ο πίνακας στο πλάτος της σελίδας (μόνο αν το πρότυπο δεν έχει δικά του)
  wb.setPrintTitles(sheet, head, data - 1);
  ws.setPrintFit(false);
  return layout;
}

// ------------------------------------------------------------------ «Φτιάξ' το εδώ»
const WMUL = { auto: 1, narrow: 0.7, wide: 1.6 };
// Το πρότυπο από τις επιλογές και πού μπήκαν τα πράγματα (για την αντιστοίχιση του εντύπου). Γραμματοσειρά και στοίχιση
// από τις Ρυθμίσεις › Γράμματα Excel (look)· το μέγεθος από τις επιλογές του προτύπου.
export async function buildTemplate(o: BuildOpts, kind: RepKind, look: XlLook = XL_LOOK): Promise<{ data: Buffer; sheet: string; head: number; cols: RepCol[]; cells: RepCell[] }> {
  const sheet = 'ΚΑΤΑΣΤΑΣΗ';
  const wb = await Workbook.blank(sheet); const ws = await wb.sheet(0);
  const cols = o.cols.length ? o.cols : [{ f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
  const n = cols.length; const L = (c: number) => colName(c);
  const sz = o.sz || 11; const fill = FILLS[o.fill] || '';
  const { font, h, v } = look;
  // κάθε κομμάτι με τα γράμματά του από τις Ρυθμίσεις (μέγεθος, έντονα, πλάγια, υπογράμμιση), αλλιώς όπως πριν
  const T = tablePart(look, 'title', sz, { u: true }), H = tablePart(look, 'head', sz), C = tablePart(look, 'data', sz);
  const hd = { sz: 10, b: true, ...formPart(look, 'hdr') }, sg = formPart(look, 'sig') || {};
  const st = {
    hdr: await wb.style({ font, ...hd, h: 'left' }), date: await wb.style({ font, ...hd, h: 'right' }),
    title: await wb.style({ font, ...T, h: 'center' }),
    head: await wb.style({ font, ...H, border: true, h, v, wrap: true, fill }),
    cell: await wb.style({ font, ...C, border: true, h, v }),
    sig: await wb.style({ font, sz, b: true, ...sg, h: 'center' }), sigName: await wb.style({ font, sz, ...sg, h: 'center' })
  };
  let r = 1;
  if (o.head || o.date) {
    if (o.head) ['ΚΕΦΑΛΙΔΑ 1', 'ΚΕΦΑΛΙΔΑ 2', 'ΚΕΦΑΛΙΔΑ 3'].forEach((t, i) => ws.set('A' + (i + 1), '{' + t + '}').setStyle('A' + (i + 1), st.hdr));
    if (o.date) {
      // πάνω δεξιά: στις δύο τελευταίες στήλες (συγχωνευμένες) αν χωράει δίπλα στην κεφαλίδα
      const c1 = n >= 3 ? n - 1 : o.head ? Math.max(2, n) : 1;
      ws.set(L(c1) + 1, '{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}').setStyle(L(c1) + 1, st.date);
      if (n >= 3) { ws.setStyle(L(n) + 1, st.date); ws.addMerge(L(c1) + '1:' + L(n) + '1'); }
    }
    r = o.head ? 5 : 3;
  }
  const tref = 'A' + r; ws.set(tref, o.title || ' ').setStyle(tref, st.title); if (n > 1) { ws.addMerge('A' + r + ':' + L(n) + r); for (let c = 2; c <= n; c++) ws.setStyle(L(c) + r, st.title); }
  ws.setRowHeight(r, T.sz * 1.6);
  const head = r + 2, data = head + 1;
  const out: RepCol[] = [];
  const widths: Record<number, number> = {};
  cols.forEach((c, i) => {
    const f = fieldOf(kind, c.f); const h = (c.h || f?.head || '').trim() || ' ';
    ws.set(L(i + 1) + head, h).setStyle(L(i + 1) + head, st.head);
    ws.setStyle(L(i + 1) + data, st.cell);
    widths[i + 1] = Math.round(Math.max(4, Math.max(f?.w || 12, Math.min(40, h.length * 1.1 + 2)) * WMUL[c.w || 'auto'] * (sz / 11)) * 10) / 10;
    out.push({ c: i + 1, f: c.f, h: upper(h), ...(c.f === 'text' && c.text ? { text: c.text } : {}) });
  });
  ws.setRowHeight(head, H.sz * 2.4); ws.setRowHeight(data, sz * 1.9);
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
  wb.setPrintTitles(sheet, head, head);
  // οι ετικέτες μένουν μέσα στο αρχείο: αν το ανοίξεις στο Excel και το αλλάξεις, η εφαρμογή τις ξαναβρίσκει
  return { data: await wb.save(), sheet, head, cols: out, cells: [{ ref: tref, k: GTITLE }] };
}

// Προεπισκόπηση: η πρώτη σελίδα όπως θα τυπωθεί, με τα κελιά σημαδεμένα (data-a) για να διαλέγεις με κλικ
export async function previewReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate, pages = 1): Promise<{ html: string; css: string; pages: number; error?: string }> {
  const out = await fillReport(tpl, s, r, ids.slice(0, 120), d);
  const doc = await renderBook(out.data, { file: out.name, sheets: [out.sheets[0]], refs: true, maxPages: pages });
  const sh = doc.sheets[0];
  return { html: sh ? sh.html : '', css: doc.css, pages: sh ? sh.pages : 0 };
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
