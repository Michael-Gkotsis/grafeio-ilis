// Έντυπα (Michael, 19/10): συμπλήρωση δικών σου προτύπων Excel και πρότυπα που φτιάχνει η εφαρμογή («Φτιάξ' το εδώ»).
// Με το ελαφρύ xlsx.ts, όπως η ΦΡΟΥΡΑ και η ΗΚΑΙ: αλλάζουν μόνο οι τιμές, η μορφοποίηση του προτύπου μένει όπως είναι.
// Η πρώτη γραμμή κάτω από τις επικεφαλίδες είναι η «γραμμή-πρότυπο»: κάθε άτομο παίρνει τη μορφή της και ό,τι είναι
// από κάτω (υπογραφές, σύνολα) κατεβαίνει όσο μεγαλώνει η λίστα.
import { Workbook, colName, colNum, type Sheet, type XlValue } from './xlsx';
import { TemplateError } from './exports';
import { renderBook } from './print';
import { normGreek, upper } from '../shared/text';
import { FILLS, TAG_RE, byIds, cellValue, fieldOf, fieldValue, guessField, tagKey, type BuildOpts, type RepCell, type RepCol, type RepKind, type Report } from '../shared/reports';
import type { AppState } from '../shared/domain';
import type { ISODate } from '../shared/dates';
import type { TplInspect } from '../shared/api';

export const MAX_ROWS = 2000;
const SCAN_ROWS = 80, SCAN_COLS = 40, TAG_ROWS = 400;
const key = (v: unknown) => normGreek(String(v ?? '')).replace(/[\s.\-_:/\\(){}]/g, '');
const str = (v: XlValue | undefined) => (v == null ? '' : v instanceof Date ? '' : String(v).trim());


// Η γραμμή των δεδομένων κάτω από τις επικεφαλίδες: αν μια επικεφαλίδα είναι συγχωνευμένη σε δύο γραμμές, μετά από αυτές
function dataRowOf(ws: Sheet, head: number): number {
  let last = head;
  for (const m of ws.merges()) if (m.r1 === head && m.r2 > last && m.r2 - head < 4) last = m.r2;
  return last + 1;
}
// Η γραμμή των επικεφαλίδων: όπου τα περισσότερα κείμενα μοιάζουν με γνωστά ονόματα (ΒΑΘΜΟΣ, ΑΣΜ…), αλλιώς η πρώτη με 3+ κείμενα
function findHead(rows: XlValue[][], kind: RepKind): { head: number; guessed: boolean } {
  let best = -1, score = 1;
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const n = (rows[r] || []).filter(v => typeof v === 'string' && guessField(kind, v)).length;
    if (n > score) { best = r; score = n; }
  }
  if (best >= 0) return { head: best + 1, guessed: true };
  for (let r = 0; r < Math.min(rows.length, 60); r++) if ((rows[r] || []).filter(v => typeof v === 'string' && v.trim()).length >= 3) return { head: r + 1, guessed: false };
  return { head: 1, guessed: false };
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
  return out;
}
// Πόσες έτοιμες κενές γραμμές έχει το πρότυπο κάτω από τις επικεφαλίδες (τουλάχιστον 1: η γραμμή-πρότυπο)
function preparedRows(ws: Sheet, data: number, cols: number[]): number {
  if (!cols.length) return 1;
  const s0 = ws.style(colName(cols[0]) + data);
  let k = 1;
  for (let r = data + 1; r < data + 500; r++) {
    const ref0 = colName(cols[0]) + r;
    if (!ws.raw(ref0) && ws.style(ref0) == null) break;   // η γραμμή δεν υπάρχει
    if (ws.style(ref0) !== s0) break;
    if (cols.some(c => { const x = ws.raw(colName(c) + r); return x && !x.inner.includes('<f'); })) break;
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
  const sheets = wb.sheetNames(); const name = sheet && wb.hasSheet(sheet) ? sheet : sheets[0];
  const ws = await wb.sheet(name); const rows = await wb.values(name, SCAN_ROWS, SCAN_COLS);
  const found = head ? { head, guessed: false } : findHead(rows, kind);
  const data = dataRowOf(ws, found.head);
  const headers = headersOf(ws, rows, found.head, data, kind);
  return { sheets, sheet: name, head: found.head, data, headers, tags: tagsOf(rows, data), prepared: preparedRows(ws, data, headers.map(h => h.c)), guessed: found.guessed };
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

// Το συμπληρωμένο έντυπο. ids: τα άτομα με τη σειρά που θα μπουν (η οθόνη έχει ήδη κάνει φίλτρα, τυχαία επιλογή, σειρά)
export async function fillReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate): Promise<{ name: string; data: Buffer; warnings: string[] }> {
  const wb = await Workbook.open(tpl); const warnings: string[] = [];
  const sheet = r.sheet && wb.hasSheet(r.sheet) ? r.sheet : wb.sheetNames()[0];
  const ws = await wb.sheet(sheet); const tagScan = await wb.values(sheet, TAG_ROWS, SCAN_COLS); const scan = tagScan.slice(0, SCAN_ROWS);
  const head = locateHead(ws, scan, r); const data = dataRowOf(ws, head);
  const rows = byIds(s, r.kind, ids.slice(0, MAX_ROWS)); const n = rows.length;
  if (ids.length > MAX_ROWS) warnings.push('Μπήκαν οι πρώτοι ' + MAX_ROWS + '.');
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
  const val = (k: string) => cellValue(s, k, d, r, n);
  const inTable = new Set(cols.map(c => colName(c.c) + data));
  for (const t of tagCells(tagScan)) {
    if (inTable.has(t.ref)) continue;
    const whole = /^\{([^{}]+)\}$/.exec(t.text.trim());
    if (whole && tagKey(whole[1])) await put(t.ref, val(tagKey(whole[1])!));
    else ws.set(t.ref, t.text.replace(TAG_RE, (m, tg: string) => { const kk = tagKey(tg); if (!kk) return m; const v = val(kk); return v == null ? '' : String(v).replace(/\n/g, ' '); }));
  }
  for (const c of r.cells) if (/^[A-Z]{1,3}\d+$/.test(c.ref) && !inTable.has(c.ref)) await put(c.ref, val(c.k));
  // ο πίνακας: όσες γραμμές χρειάζονται, με τη μορφή της γραμμής-προτύπου
  const k = preparedRows(ws, data, cols.map(c => c.c));
  const aa = cols.find(c => c.f === 'aa');
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
      ws.set(ref, i < n ? fieldValue(s, r.kind, rows[i], c.f, i, d, c.text) : null);
    }
  }
  // εκτύπωση: οι επικεφαλίδες σε κάθε σελίδα και ο πίνακας στο πλάτος της σελίδας (μόνο αν το πρότυπο δεν έχει δικά του)
  wb.setPrintTitles(sheet, head, data - 1);
  ws.setPrintFit(false);
  const name = upper(r.name).replace(/[\\/:*?"<>|]/g, '-').trim() + ' ' + d.split('-').reverse().join('-') + '.xlsx';
  return { name, data: await wb.save(), warnings };
}

// ------------------------------------------------------------------ «Φτιάξ' το εδώ»
const WMUL = { auto: 1, narrow: 0.7, wide: 1.6 };
// Το πρότυπο από τις επιλογές και πού μπήκαν τα πράγματα (για την αντιστοίχιση του εντύπου)
export async function buildTemplate(o: BuildOpts, kind: RepKind): Promise<{ data: Buffer; sheet: string; head: number; cols: RepCol[]; cells: RepCell[] }> {
  const sheet = 'ΚΑΤΑΣΤΑΣΗ';
  const wb = await Workbook.blank(sheet); const ws = await wb.sheet(0);
  const cols = o.cols.length ? o.cols : [{ f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
  const n = cols.length; const L = (c: number) => colName(c);
  const sz = o.sz || 11; const fill = FILLS[o.fill] || '';
  const st = {
    hdr: await wb.style({ sz: 10, b: true, h: 'left' }), date: await wb.style({ sz: 10, b: true, h: 'right' }),
    title: await wb.style({ sz: sz + 2, b: true, u: true, h: 'center' }),
    head: await wb.style({ sz, b: true, border: true, h: 'center', wrap: true, fill }),
    left: await wb.style({ sz, border: true, h: 'left' }), center: await wb.style({ sz, border: true, h: 'center' }),
    sig: await wb.style({ sz, b: true, h: 'center' }), sigName: await wb.style({ sz, h: 'center' })
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
  ws.set('A' + r, o.title || ' ').setStyle('A' + r, st.title); if (n > 1) { ws.addMerge('A' + r + ':' + L(n) + r); for (let c = 2; c <= n; c++) ws.setStyle(L(c) + r, st.title); }
  ws.setRowHeight(r, (sz + 2) * 1.6);
  const head = r + 2, data = head + 1;
  const out: RepCol[] = [];
  const widths: Record<number, number> = {};
  cols.forEach((c, i) => {
    const f = fieldOf(kind, c.f); const h = (c.h || f?.head || '').trim() || ' ';
    ws.set(L(i + 1) + head, h).setStyle(L(i + 1) + head, st.head);
    ws.setStyle(L(i + 1) + data, f?.al === 'left' ? st.left : st.center);
    widths[i + 1] = Math.round(Math.max(4, Math.max(f?.w || 12, Math.min(40, h.length * 1.1 + 2)) * WMUL[c.w || 'auto'] * (sz / 11)) * 10) / 10;
    out.push({ c: i + 1, f: c.f, h: upper(h), ...(c.f === 'text' && c.text ? { text: c.text } : {}) });
  });
  ws.setRowHeight(head, sz * 2.4); ws.setRowHeight(data, sz * 1.9);
  ws.setColWidths(widths);
  if (o.sig !== 'none') {
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
  return { data: await wb.save(), sheet, head, cols: out, cells: [] };
}

// Προεπισκόπηση: η πρώτη σελίδα όπως θα τυπωθεί, με τα κελιά σημαδεμένα (data-a) για να διαλέγεις με κλικ
export async function previewReport(tpl: Buffer | Uint8Array, s: AppState, r: Report, ids: (number | string)[], d: ISODate, pages = 1): Promise<{ html: string; css: string; pages: number; error?: string }> {
  const out = await fillReport(tpl, s, r, ids.slice(0, 120), d);
  const doc = await renderBook(out.data, { file: out.name, sheets: [r.sheet], refs: true, maxPages: pages });
  const sh = doc.sheets[0];
  return { html: sh ? sh.html : '', css: doc.css, pages: sh ? sh.pages : 0 };
}
// Μόνο το πρότυπο όπως είναι (χωρίς στοιχεία): για να δείξεις τη γραμμή των επικεφαλίδων και τα κελιά πριν την αντιστοίχιση
export async function previewTemplate(tpl: Buffer | Uint8Array, sheet: string, pages = 1): Promise<{ html: string; css: string; pages: number }> {
  const doc = await renderBook(tpl, { file: 'πρότυπο.xlsx', sheets: [sheet], refs: true, maxPages: pages });
  const sh = doc.sheets[0];
  return { html: sh ? sh.html : '', css: doc.css, pages: sh ? sh.pages : 0 };
}
