// Αρχεία Excel της Ίλης στον main: ανάγνωση με την αντιστοίχιση του χρήστη και εγγραφή των αλλαγών της εφαρμογής
// πίσω στο ίδιο αρχείο. Η εγγραφή αλλάζει μόνο τιμές κελιών (xlsx.ts): στυλ, τύποι, άλλα φύλλα και μακροεντολές μένουν.
// Περνά από το writeAll: πρώτα .tmp και έλεγχος, η προηγούμενη έκδοση στο «_προηγούμενα», τίποτα αν είναι ανοιχτό στο Excel.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Workbook, colName, toSerial, type Sheet } from './xlsx';
import { writeAll, writeJson, LockedError } from './files';
import type { RawSheet } from '../shared/roster';
import { exactCountif } from '../shared/codes';
import { itemKey, type UserLists } from '../shared/ranks';
import type { AppState } from '../shared/domain';
import type { ISODate } from '../shared/dates';
import { HASH_V, ROOM_HEAD, canCreate, cellText, planDutiesNew, roomSheetNew, isStatusKind, listColumns, locateHeader, remapNeed, planRoomSheet, roomBlocks, planSource, stepFin, stepRows, refitCols, tableHash, tableRows, timeCols, titleSpans, stampHeads, type ListKind, type PersonSnap, type SourceBinding, type WVal } from '../shared/sources';

export interface SourceMeta { mtime: number; size: number; hash?: string; keys: string[]; snap?: Record<number, PersonSnap>; psnap?: Record<number, PersonSnap>; at: string; error?: string; locked?: boolean; pending?: boolean;
  hold?: string;        // η εφαρμογή δεν γράφει μόνη της εδώ μέχρι νέα ανάγνωση ή «Ενημέρωση Excel» (μετά από αναίρεση ανάγνωσης ή επαναφορά βάσης)
  base?: Record<string, string> }   // οι εγγραφές όπως ήταν στην τελευταία ανάγνωση/εγγραφή (για τη σύγκρουση)
export type Metas = Partial<Record<ListKind, SourceMeta>>;

// Τι ξέρουμε για κάθε αρχείο από την τελευταία ανάγνωση/εγγραφή: ώρα και μέγεθος (για να φαίνεται αν άλλαξε
// εκτός εφαρμογής) και ποιες εγγραφές έγραψε η εφαρμογή. Δεν μπαίνει στη βάση: δεν είναι δεδομένο της Ίλης.
// Και τα αρχεία που έδωσαν οι διάλογοι της εφαρμογής (_paths): μόνο σε αυτά δέχεται ο main να διαβάζει και να γράφει (S9).
// Κρατιέται στη μνήμη (το γράφει μόνο ο main): ανάγνωση μία φορά, κάθε αλλαγή γράφεται αμέσως και στον δίσκο.
export class SourceMetaStore {
  private cache: (Metas & { _paths?: string[] }) | null = null;
  constructor(private file: string) {}
  private raw(): Metas & { _paths?: string[] } {
    if (!this.cache) { try { this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.cache = {}; } }
    return this.cache!;
  }
  all(): Metas { const x = { ...this.raw() }; delete x._paths; return x; }
  allowed(file: string): boolean { return (this.raw()._paths || []).includes(path.resolve(file)); }
  allow(files: string[]) {
    const all = this.raw(); const had = new Set(all._paths || []); const add = files.filter(Boolean).map(x => path.resolve(x)).filter(x => !had.has(x));
    if (!add.length) return;
    all._paths = [...had, ...add];
    try { writeJson(this.file, all); } catch (e) { console.error('sources meta', e); }
  }
  get(kind: ListKind): SourceMeta | undefined { return this.all()[kind]; }
  set(kind: ListKind, m: Partial<SourceMeta> | null) {
    const all = this.raw();
    if (m === null) delete all[kind]; else all[kind] = { ...(all[kind] || { mtime: 0, size: 0, keys: [], at: '' }), ...m };
    try { writeJson(this.file, all); } catch (e) { console.error('sources meta', e); }
  }
  // Όλο από την αρχή (νέα ΕΣΣΟ: κανένα είδος δεν έχει Excel· επαναφορά ΕΣΣΟ: ό,τι ήξερε τότε). Τα γνωστά αρχεία μένουν.
  reset(data: Metas & { _paths?: string[] } = {}) {
    const paths = [...new Set([...(this.raw()._paths || []), ...(data._paths || [])])];
    this.cache = { ...data, _paths: paths };
    try { writeJson(this.file, this.cache); } catch (e) { console.error('sources meta', e); }
  }
  dump(): Metas & { _paths?: string[] } { return JSON.parse(JSON.stringify(this.raw())); }
  // Για να γυρίσει ακριβώς όπως είναι τώρα (π.χ. όταν το «Νέο αρχείο» δεν φτιάχτηκε και η αντιστοίχιση γυρνά στο παλιό)
  keep(kind: ListKind): () => void {
    const was = this.get(kind);
    return () => { const all = this.raw(); if (was) all[kind] = was; else delete all[kind]; try { writeJson(this.file, all); } catch (e) { console.error('sources meta', e); } };
  }
}
// Τι αλλάζει στο meta όταν ένα είδος μπαίνει σε αναμονή (αναίρεση ανάγνωσης, επαναφορά βάσης). Στον έλεγχο υπηρεσιών οι
// «γνωστές» εγγραφές (keys) ξεχνιούνται: η εφαρμογή γύρισε πίσω αλλά το Excel όχι, και οι εγγραφές που είχε δει θα
// φαίνονταν «σβησμένες στην εφαρμογή» και η επόμενη «Ενημέρωση Excel» θα τις έσβηνε. Χωρίς keys δεν σβήνεται ποτέ κελί του Excel.
export const holdPatch = (kind: ListKind, why: string): Partial<SourceMeta> => (kind === 'duties' ? { hold: why, keys: [] } : { hold: why });
export const stamp = (file: string): { mtime: number; size: number } | null => { try { const st = fs.statSync(file); return { mtime: Math.round(st.mtimeMs), size: st.size }; } catch { return null; } };

// Πόσες στήλες διαβάζουμε από κάθε φύλλο: ο έλεγχος υπηρεσιών έχει 12 στήλες στοιχείων + 31 μέρες (ως AQ)
export const MAX_COLS = 64;

// Αποτύπωμα των τιμών ενός Excel (όχι των bytes): το ίδιο αν ο χρήστης απλώς το άνοιξε και πάτησε «Αποθήκευση».
// Τα κελιά με τύπο δεν μετράνε, γιατί το Excel τα ξαναϋπολογίζει.
export async function valuesHash(buf: Buffer | Uint8Array): Promise<string> {
  const wb = await Workbook.open(buf); const h = crypto.createHash('sha1');
  for (const name of wb.sheetNames()) {
    const fx = new Set<string>(); let rows: unknown[][];
    try { rows = await wb.values(name, 2000, MAX_COLS, fx); } catch { continue; }
    h.update(name + '\u0001');
    rows.forEach((row, r) => (row || []).forEach((v, c) => { if (v == null || fx.has(r + ':' + c)) return; h.update(r + ':' + c + '=' + (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)) + '\u0002'); }));
  }
  return h.digest('hex');
}

// Κελιά με COUNTIF που μετρά σκέτο γράμμα υπηρεσίας (π.χ. COUNTIF(M3:AO3, "Θ")): εκεί δεν γράφονται κωδικοί θέσεων
async function countifOf(wb: Workbook, name: string): Promise<string[]> {
  // κοινόχρηστος τύπος (Excel «σύρσιμο»): μόνο το πρώτο κελί έχει το κείμενο, τα άλλα <f t="shared" si="0"/>
  const ws = await wb.sheet(name); const out: string[] = []; const si = new Set<string>(); const kids: { ref: string; si: string }[] = [];
  for (const c of ws.cells()) {
    if (!c.inner.includes('<f')) continue;
    const ref = colName(c.c) + c.r; const f = /<f([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.inner); if (!f) continue;
    const id = /\bt="shared"/.test(f[1]) ? /\bsi="(\d+)"/.exec(f[1])?.[1] : undefined;
    if (f[2] && exactCountif(f[2])) { out.push(ref); if (id != null) si.add(id); }
    else if (!f[2] && id != null) kids.push({ ref, si: id });
  }
  for (const k of kids) if (si.has(k.si)) out.push(k.ref);
  return out;
}
export class OldFormatError extends Error {}
export async function readBook(file: string, maxRows = 2000, maxCols = MAX_COLS): Promise<{ sheets: RawSheet[]; mtime: number; size: number }> {
  if (/\.xls$/i.test(file)) throw new OldFormatError('Το «' + path.basename(file) + '» είναι παλιό .xls. Άνοιξέ το στο Excel και κάνε «Αποθήκευση ως» .xlsx (ή .xlsm αν έχει μακροεντολές).');
  // ώρα και μέγεθος πριν και μετά την ανάγνωση: αν το έσωσε κάποιος στο μεταξύ, ξανά (αλλιώς θα κρατούσαμε την ώρα
  // του νέου αρχείου με το περιεχόμενο του παλιού, και η αλλαγή του δεν θα φαινόταν ποτέ)
  let buf: Buffer, st: fs.Stats;
  for (let i = 0; ; i++) {
    const a = fs.statSync(file); buf = await fs.promises.readFile(file); st = fs.statSync(file);
    if ((a.mtimeMs === st.mtimeMs && a.size === st.size) || i >= 4) break;
  }
  let wb: Workbook;
  try { wb = await Workbook.open(buf); } catch { throw new Error('Το «' + path.basename(file) + '» δεν διαβάζεται ως Excel (.xlsx/.xlsm).'); }
  const sheets: RawSheet[] = [];
  for (const name of wb.sheetNames()) {
    const fx = new Set<string>();
    try { const rows = await wb.values(name, maxRows, maxCols, fx); const countif = fx.size ? await countifOf(wb, name) : []; sheets.push({ name, rows, fx, ...(countif.length ? { countif } : {}) }); } catch { sheets.push({ name, rows: [] }); }
  }
  return { sheets, mtime: Math.round(st.mtimeMs), size: st.size };
}

// Το βιβλίο όπως είναι τώρα στον δίσκο (ξαναδιαβάζεται μόνο όταν άλλαξε)
const books = new Map<string, { mtime: number; size: number; sheets: RawSheet[] }>();
export async function bookNow(file: string): Promise<{ mtime: number; size: number; sheets: RawSheet[] } | null> {
  const st = stamp(file); if (!st) return null;
  const c = books.get(file); if (c && c.mtime === st.mtime && c.size === st.size) return c;
  const r = await readBook(file); books.set(file, r); if (books.size > 12) books.delete(books.keys().next().value!);
  return r;
}
// Τι κρατιέται μετά από ανάγνωση ή εγγραφή: ώρα, μέγεθος και αποτύπωμα του πίνακα
export const syncStamp = (b: SourceBinding, book: { mtime: number; size: number; sheets: RawSheet[] }) => ({ mtime: book.mtime, size: book.size, hash: tableHash(book.sheets.find(x => x.name === b.sheet), b) });
export async function syncStampNow(b: SourceBinding) { const book = await bookNow(b.file); return book ? syncStamp(b, book) : {}; }
// Άλλαξε ο πίνακας αυτού του είδους από την τελευταία ανάγνωση/εγγραφή; Αν άλλαξε μόνο το αρχείο (άλλο φύλλο, άλλος
// πίνακας, ή απλώς «Αποθήκευση» στο Excel), δεν μετράει: ανανεώνεται μόνο η ώρα (refresh).
// header: ο πίνακας κατέβηκε ή ανέβηκε (γραμμές από πάνω) και οι επικεφαλίδες είναι πια εκεί.
export async function tableState(b: SourceBinding, m: SourceMeta | undefined, kind?: ListKind): Promise<{ exists: boolean; changed: boolean; refresh?: Partial<SourceMeta>; header?: number }> {
  const st = stamp(b.file); if (!st) return { exists: false, changed: false };
  if (!m?.at || (st.mtime === m.mtime && st.size === m.size)) return { exists: true, changed: false };
  let book; try { book = await bookNow(b.file); } catch { return { exists: true, changed: false }; }   // ανοιχτό/μισογραμμένο: ξανά αργότερα
  if (!book) return { exists: false, changed: false };
  const sh = book.sheets.find(x => x.name === b.sheet);
  const h = kind && sh ? locateHeader(kind, sh, b) : b.header;
  const moved = h !== b.header ? { header: h } : {};
  const now = syncStamp({ ...b, header: h }, book);
  if (!m.hash || !m.hash.startsWith(HASH_V)) return { exists: true, changed: false, refresh: now, ...moved };   // από παλιότερη έκδοση: αφετηρία από εδώ
  return now.hash === m.hash ? { exists: true, changed: false, refresh: now, ...moved } : { exists: true, changed: true, ...moved };
}
// Η αντιστοίχιση όπως είναι τώρα στο αρχείο: πρώτα η γραμμή των επικεφαλίδων (γραμμές από πάνω), μετά οι στήλες
// (νέα ή μετακινημένη στήλη, π.χ. «ΔΝ» στο ΣΥΝΟΛΙΚΟ). Ίδια αναφορά αν δεν άλλαξε τίποτα. Θυμάται και τις επικεφαλίδες των
// στηλών (stampHeads), ώστε να φαίνεται αργότερα αν μπήκε στήλη μπροστά από κάποια.
export async function locateNow(kind: ListKind, b: SourceBinding): Promise<SourceBinding> {
  let book; try { book = await bookNow(b.file); } catch { return b; }
  const sh = book?.sheets.find(x => x.name === b.sheet); if (!sh) return b;
  const h = locateHeader(kind, sh, b); const at = h === b.header ? b : { ...b, header: h };
  return stampHeads(kind, sh, refitCols(kind, sh, at));
}

// Το ίδιο για τις αυτόματες διαδρομές (ανάγνωση απλών αλλαγών, εγγραφή): need = γιατί δεν γίνεται αυτόματα (στήλη που
// δεν βρίσκεται με σιγουριά)· τότε το είδος περιμένει να δείξει ο χρήστης τις στήλες
export async function locateCheck(kind: ListKind, b: SourceBinding): Promise<{ b: SourceBinding; need: string | null }> {
  let book; try { book = await bookNow(b.file); } catch { return { b, need: null }; }
  const sh = book?.sheets.find(x => x.name === b.sheet); if (!sh) return { b, need: null };
  const h = locateHeader(kind, sh, b); const nb = stampHeads(kind, sh, refitCols(kind, sh, h === b.header ? b : { ...b, header: h }));
  return { b: nb, need: remapNeed(kind, sh, nb) };
}

// Αντίγραφο του αρχείου στα «_προηγούμενα» το πολύ ένα ανά 10 λεπτά (κρατά την έκδοση πριν από κάθε σειρά αλλαγών)
export const PREV_EVERY = 10 * 60 * 1000;
export type WriteOutcome =
  | { ok: true; file: string; unchanged: boolean; added: number; changed: number; cleared: number; foreign: number; notFound: string[]; warn?: string[]; created: boolean; meta: Partial<SourceMeta>; rooms?: { n: number; added: number; placed?: number; sheet: string }; tidy?: string[]; binding?: SourceBinding; timeCols?: boolean }
  | { ok: false; error: string; locked?: boolean };

// Μορφή που λείπει από φύλλο που ήδη υπάρχει: τίτλος που δεν είναι στο κέντρο σε συγχωνευμένα κελιά, και λίστες
// επιλογής για βαθμό και Ο/Σ όπου το φύλλο δεν έχει ήδη δικές του. Τα δικά σου στυλ, συγχωνεύσεις και λίστες μένουν.
// Λίστα που έβαλε η ίδια η εφαρμογή παλιότερα συμπληρώνεται στο τέλος με ό,τι πρόσθεσες στις Λίστες· οι τιμές που
// έχει ήδη μένουν (και όσες έκρυψες: κάποιος μπορεί να τις έχει).
export interface Tidy { titles: { r: number; c1: number; c2: number }[]; lists: { c: number; r1: number; r2: number; items: string[]; what: string; base: string[] }[]; grow: { sqref: string; items: string[]; what: string; added: string[] }[] }
export function tidyOf(kind: ListKind, b: SourceBinding, ws: Sheet, sheet: RawSheet, lists?: UserLists): Tidy {
  const merges = ws.merges(); const cols = listColumns(kind, sheet, b, lists);
  const grow: Tidy['grow'] = [];
  for (const l of cols) {
    const own = ws.ownList(l.c + 1, l.r1 + 1, l.r2 + 1); if (!own) continue;
    const have = new Set(own.items.map(itemKey));
    // μόνο ό,τι είναι στις Λίστες (όχι τιμές που απλώς γράφτηκαν στη στήλη μετά): χωρίς προσθήκες, τίποτα δεν αλλάζει
    const mine = new Set(l.base.map(itemKey)); const added = l.items.filter(v => mine.has(itemKey(v)) && !have.has(itemKey(v)));
    if (!added.length || [...own.items, ...added].join(',').length > 250) continue;
    grow.push({ sqref: own.sqref, items: [...own.items, ...added], what: l.what, added });
  }
  return {
    titles: titleSpans(kind, sheet, b).filter(t => !merges.some(m => m.r1 <= t.r + 1 && t.r + 1 <= m.r2 && m.c1 <= t.c2 + 1 && t.c1 + 1 <= m.c2)),
    lists: cols.filter(l => !ws.hasValidation(l.c + 1, l.r1 + 1, l.r2 + 1)),
    grow
  };
}
export const tidyText = (t: Tidy): string[] => [
  ...t.titles.map(x => 'Ο τίτλος της γραμμής ' + (x.r + 1) + ' μπαίνει στο κέντρο, σε συγχωνευμένα κελιά ' + colName(x.c1 + 1) + (x.r + 1) + ':' + colName(x.c2 + 1) + (x.r + 1)),
  ...t.grow.map(l => 'Στη λίστα επιλογής της στήλης «' + l.what + '» μπαίνουν και: ' + l.added.join(', ')),
  ...t.lists.map(l => 'Λίστα επιλογής στη στήλη «' + l.what + '» (' + colName(l.c + 1) + '): ' + l.items.slice(0, 8).join(', ') + (l.items.length > 8 ? '…' : '') + '· δέχεται και ό,τι άλλο γραφτεί με το χέρι')
];
async function applyTidy(wb: Workbook, ws: Sheet, t: Tidy) {
  for (const x of t.titles) {
    const at = colName(x.c1 + 1) + (x.r + 1);
    ws.addMerge(at + ':' + colName(x.c2 + 1) + (x.r + 1)).setStyle(at, await wb.centered(ws.style(at)));
  }
  for (const l of t.lists) { const L = colName(l.c + 1); ws.addListValidation(L + (l.r1 + 1) + ':' + L + (l.r2 + 1), l.items); }
  for (const l of t.grow) ws.setListItems(l.sqref, l.items);
}

// Για την προεπισκόπηση της «Ενημέρωσης Excel»: ποια μορφή λείπει από το φύλλο (κενό για νέο φύλλο ή πίνακα)
export async function tidyPreview(kind: ListKind, b: SourceBinding, lists?: UserLists): Promise<string[]> {
  if (!fs.existsSync(b.file)) return [];
  const wb = await Workbook.open(await fs.promises.readFile(b.file)); if (!wb.hasSheet(b.sheet)) return [];
  const sheet: RawSheet = { name: b.sheet, rows: await wb.values(b.sheet, 2000, MAX_COLS) };
  if (!(sheet.rows[b.header] || []).some(v => cellText(v))) return [];
  return tidyText(tidyOf(kind, b, await wb.sheet(b.sheet), sheet, lists));
}

// Νέος μήνας στον έλεγχο υπηρεσιών: φύλλο με όλη τη δομή (planDutiesNew), σε νέο ή στο ίδιο αρχείο με τους άλλους μήνες
async function newDutiesSheet(wb: Workbook, ws: Sheet, b: SourceBinding, s: AppState, today: ISODate, expect?: Record<string, { mtime: number; size: number }>): Promise<WriteOutcome> {
  if (!b.month) return { ok: false, error: 'Δεν ορίστηκε ο μήνας του ελέγχου υπηρεσιών' };
  const lay = planDutiesNew(b, s, today);
  const st = { title: await wb.tableStyle('title'), head: await wb.tableStyle('head'), data: await wb.tableStyle('data'), code: 0 };
  st.code = st.data;
  const gray = new Map<number, number>(); const grayOf = async (x: number) => { if (!gray.has(x)) gray.set(x, await wb.grayed(x)); return gray.get(x)!; };
  for (const x of lay.cells) {
    const at = colName(x.c + 1) + (x.r + 1);
    if (x.f) ws.setFormula(at, x.f); else if (x.v != null && typeof x.v !== 'object') ws.set(at, x.v);
    if (x.st === 'title') { ws.setStyle(at, st.title); continue; }
    ws.setStyle(at, x.gray ? await grayOf(st[x.st]) : st[x.st]);
  }
  for (const m of lay.merges) ws.addMerge(colName(m.c1 + 1) + (m.r + 1) + ':' + colName(m.c2 + 1) + (m.r + 1));
  ws.setColWidths(lay.widths).setRowHeight(2, 30).setFreeze(b.cols.d1, 2).setPrintFit(true);
  const out = await writeAll([{ dir: path.dirname(b.file), name: path.basename(b.file), data: await wb.save() }], { prevEvery: PREV_EVERY, expect });
  return { ok: true, file: out[0], unchanged: false, created: true, added: lay.rows, changed: lay.filled, cleared: 0, foreign: 0, notFound: [], meta: { keys: lay.keys, ...(await syncStampNow({ ...b, file: out[0] })), error: undefined, locked: false, pending: false } };
}
// Γράφει στο αρχείο ό,τι έχει η εφαρμογή για αυτό το είδος. Αν το αρχείο ή το φύλλο λείπει, το φτιάχνει.
// tidy: γράφει και μόνο για τη μορφή που λείπει (με την «Ενημέρωση Excel»)· αλλιώς η μορφή μπαίνει όταν γράφεται κάτι.
// create: φτιάχνει το αρχείο ή το φύλλο και για τα άλλα είδη («Νέο αρχείο…»)· οι καταστάσεις φτιάχνονται πάντα.
export async function writeSource(kind: ListKind, b: SourceBinding, s: AppState, meta: SourceMeta | undefined, today: ISODate, opts: { tidy?: boolean; create?: boolean } = {}): Promise<WriteOutcome> {
  try {
    const exists = fs.existsSync(b.file);
    // ώρα και μέγεθος πριν από την ανάγνωση: αν αλλάξουν ως τη μετονομασία (το έσωσε κάποιος), δεν γράφεται (X1)
    const st0 = exists ? stamp(b.file) : null; const expect = st0 ? { [path.join(path.dirname(b.file), path.basename(b.file))]: st0 } : undefined;
    const create = isStatusKind(kind) || (!!opts.create && canCreate(kind));
    if (!exists && !create) return { ok: false, error: 'Δεν βρέθηκε το ' + b.file };
    const wb = exists ? await Workbook.open(await fs.promises.readFile(b.file)) : await Workbook.blank(b.sheet);
    const a = await applyKind(wb, kind, b, s, meta, today, opts, create, !exists);
    if ('error' in a) return { ok: false, error: a.error };
    if ('ws' in a) return await newDutiesSheet(wb, a.ws, b, s, today, expect);
    if (a.unchanged) return { ok: true, file: b.file, unchanged: true, ...a.res, created: false, meta: a.keep };
    const out = await writeAll([{ dir: path.dirname(b.file), name: path.basename(b.file), data: await wb.save() }], { prevEvery: PREV_EVERY, expect });
    return { ok: true, file: out[0], unchanged: false, created: a.created, ...a.res, rooms: a.rooms, ...(a.tidied.length && !a.fresh ? { tidy: a.tidied } : {}), ...(a.grown ? { binding: a.b, timeCols: true } : {}), meta: { ...a.keep, ...(await syncStampNow({ ...a.b, file: out[0] })), error: undefined, locked: false, pending: false } };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
// Πολλά είδη του ίδιου αρχείου (π.χ. όλα τα φύλλα του Δυναμολογίου μετά από μια αλλαγή τηλεφώνου): ένα άνοιγμα, όλα τα
// σχέδια πάνω στο ίδιο βιβλίο, μία αποθήκευση, και το αποτύπωμα κάθε πίνακα από το βιβλίο που μόλις γράφτηκε (όχι νέα
// ανάγνωση όλου του αρχείου ανά είδος). Είδος στο ίδιο φύλλο κάτω από πίνακα που μεγάλωσε βρίσκεται στη νέα του θέση.
// Όσα θέλουν καινούργιο φύλλο ή αρχείο γράφονται μετά, το καθένα μόνο του. Τα αποτελέσματα με τη σειρά των jobs.
export async function writeGroup(jobs: { kind: ListKind; b: SourceBinding; meta?: SourceMeta }[], s: AppState, today: ISODate, opts: { tidy?: boolean } = {}): Promise<WriteOutcome[]> {
  const one = async (j: typeof jobs[number]) => writeSource(j.kind, j.b, s, j.meta, today, opts);
  if (jobs.length < 2 || !fs.existsSync(jobs[0].b.file)) { const r: WriteOutcome[] = []; for (const j of jobs) r.push(await one(j)); return r; }
  const file = jobs[0].b.file; const out = new Map<typeof jobs[number], WriteOutcome>();
  try {
    const st0 = stamp(file); const expect = st0 ? { [path.join(path.dirname(file), path.basename(file))]: st0 } : undefined;
    const wb = await Workbook.open(await fs.promises.readFile(file));
    const here = jobs.filter(j => wb.hasSheet(j.b.sheet));
    const done: { j: typeof jobs[number]; a: Extract<Applied, { keep: unknown }>; moved: boolean }[] = []; let touched = false;
    for (const j of here) {
      let b = j.b;
      if (touched) { const sh: RawSheet = { name: b.sheet, rows: await wb.values(b.sheet, 2000, MAX_COLS) }; const h = locateHeader(j.kind, sh, b); b = refitCols(j.kind, sh, h === b.header ? b : { ...b, header: h }); }
      const a = await applyKind(wb, j.kind, b, s, j.meta, today, opts, isStatusKind(j.kind), false);
      if ('error' in a) { out.set(j, { ok: false, error: a.error }); continue; }
      if ('ws' in a) continue;   // δεν γίνεται εδώ (φύλλο υπάρχει): μένει για μόνο του
      if (!a.unchanged) touched = true;
      done.push({ j, a, moved: b !== j.b });
    }
    const written = touched ? (await writeAll([{ dir: path.dirname(file), name: path.basename(file), data: await wb.save() }], { prevEvery: PREV_EVERY, expect }))[0] : null;
    const st = written ? stamp(written) : null;
    // Είδος που γράφτηκε πριν από άλλο που έβαλε γραμμή πιο πάνω στο φύλλο: ο πίνακάς του κατέβηκε. Το αποτύπωμα και η γραμμή
    // επικεφαλίδων που κρατιέται πρέπει να είναι από το τελικό βιβλίο, αλλιώς το επόμενο άνοιγμα θα το δείξει «Άλλαξε στο Excel».
    const lastChanged = done.reduce((m, d, i) => (d.a.unchanged ? m : i), -1);
    for (const [i, { j, a, moved }] of done.entries()) {
      let meta: Partial<SourceMeta> = a.keep; let fb = a.b; let down = false;
      if (st) {
        const fx = new Set<string>(); const sheet: RawSheet = { name: a.b.sheet, rows: await wb.values(a.b.sheet, 2000, MAX_COLS, fx), fx };
        if (i < lastChanged) { const h = locateHeader(j.kind, sheet, a.b); if (h !== a.b.header) { fb = { ...a.b, header: h }; down = true; } }
        meta = { ...a.keep, mtime: st.mtime, size: st.size, hash: tableHash(sheet, fb), error: undefined, locked: false, pending: false };
      }
      const grown = !a.unchanged && a.grown;
      out.set(j, a.unchanged ? { ok: true, file, unchanged: true, ...a.res, created: false, meta, ...(moved || down ? { binding: fb } : {}) }
        : { ok: true, file: written!, unchanged: false, created: a.created, ...a.res, rooms: a.rooms, ...(a.tidied.length && !a.fresh ? { tidy: a.tidied } : {}), ...(grown || moved || down ? { binding: fb, timeCols: grown } : {}), meta });
    }
  } catch (e) {
    const r: WriteOutcome = e instanceof LockedError ? { ok: false, error: e.message, locked: true } : { ok: false, error: e instanceof Error ? e.message : String(e) };
    for (const j of jobs) if (!out.has(j)) out.set(j, r);
    return jobs.map(j => out.get(j)!);
  }
  for (const j of jobs) if (!out.has(j)) out.set(j, await one(j));
  return jobs.map(j => out.get(j)!);
}
type Applied = { error: string } | { ws: Sheet }
  | { unchanged: true; res: Omit<Extract<WriteOutcome, { ok: true }>, 'ok' | 'file' | 'unchanged' | 'created' | 'meta'>; keep: Partial<SourceMeta>; b: SourceBinding }
  | { unchanged: false; res: Omit<Extract<WriteOutcome, { ok: true }>, 'ok' | 'file' | 'unchanged' | 'created' | 'meta'>; keep: Partial<SourceMeta>; b: SourceBinding; rooms?: { n: number; added: number; placed?: number; sheet: string }; tidied: string[]; fresh: boolean; grown: boolean; created: boolean };
// Ό,τι έχει η εφαρμογή για ένα είδος, πάνω σε ανοιχτό βιβλίο (χωρίς αποθήκευση: αυτή γίνεται μία φορά για όλα τα είδη του
// ίδιου αρχείου). ws: καινούργιος μήνας στον έλεγχο υπηρεσιών (το φτιάχνει ο καλών). blank: το βιβλίο είναι καινούργιο.
async function applyKind(wb: Workbook, kind: ListKind, b: SourceBinding, s: AppState, meta: SourceMeta | undefined, today: ISODate, opts: { tidy?: boolean }, create: boolean, blank: boolean): Promise<Applied> {
  {
    const exists = !blank;
    const had = wb.hasSheet(b.sheet);
    const ws = had ? await wb.sheet(b.sheet) : await wb.addSheet(b.sheet);
    const countif = had && kind === 'duties' ? await countifOf(wb, b.sheet) : [];
    const sheet: RawSheet = { name: b.sheet, rows: had ? await wb.values(b.sheet, 2000, MAX_COLS) : [], ...(countif.length ? { countif } : {}) };
    const ref = (r: number, c: number) => colName(c + 1) + (r + 1);
    const put = async (r: number, c: number, v: WVal, plain?: number) => {
      const at = ref(r, c);
      if (ws.hasFormula(at)) return;
      if (v != null && typeof v === 'object') { ws.setNumber(at, toSerial(v.date, wb.date1904), await wb.dateStyle(ws.style(at) ?? plain ?? null)); return; }
      ws.set(at, v);
      if (plain != null && ws.style(at) == null) ws.setStyle(at, plain);
    };
    if (!had && !create) return { error: 'Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file) };
    if (kind === 'duties' && (!had || !exists)) return { ws };
    // άδειες με ώρα σε πίνακα χωρίς στήλες ωρών: οι στήλες μπαίνουν στο τέλος του πίνακα και κρατιούνται στην αντιστοίχιση
    const tc = timeCols(kind, had ? sheet : null, b, s, today); const grown = tc.b !== b; b = tc.b;
    const plan = planSource(kind, had ? sheet : null, b, s, meta, today);
    const fresh = plan.header.length > 0;        // καινούργιος πίνακας: δικό μας στυλ με πλαίσια, όλα στο κέντρο
    const tidy = tidyOf(kind, b, ws, sheet, s.settings.lists); if (fresh) tidy.titles = [];
    const tidied = tidyText(tidy);
    const res = { added: plan.added, changed: plan.changed, cleared: plan.cleared, foreign: plan.foreign, notFound: plan.notFound, warn: plan.warn };
    const keep = { keys: plan.keys, psnap: plan.psnap, ...(plan.snap ? { snap: plan.snap } : {}) };
    const steps = plan.inserts || [];
    if (!plan.sets.length && !plan.insert && !steps.length && !plan.deletes?.length && !fresh && !tc.head.length && !(opts.tidy && tidied.length)) return { unchanged: true, res, keep, b };
    await applyTidy(wb, ws, tidy);
    // νέες στήλες ωρών: επικεφαλίδα και κελιά με το στυλ της στήλης από αριστερά (πλαίσια, γραμματοσειρά)
    const newCols = new Set(tc.head.map(h => h.c));
    for (const h of tc.head) { const at = ref(h.r, h.c); ws.set(at, h.v); const st = ws.style(ref(h.r, h.c - 1)); if (st != null) ws.setStyle(at, st); }
    const data = fresh ? await wb.tableStyle('data') : undefined;
    if (fresh) {
      const head = await wb.tableStyle('head'), title = await wb.tableStyle('title');
      const c2 = Math.max(...Object.values(b.cols));
      const wide: Record<number, number> = {};
      const fit = (c: number, v: unknown) => { const n = v != null && typeof v === 'object' ? 10 : String(v ?? '').length; wide[c + 1] = Math.min(32, Math.max(wide[c + 1] || 6, n + 2)); };
      for (const h of plan.header) {
        ws.set(ref(h.r, h.c), h.v).setStyle(ref(h.r, h.c), h.title ? title : head);
        if (h.title && c2 > h.c) ws.addMerge(ref(h.r, h.c) + ':' + ref(h.r, c2)); else if (!h.title) fit(h.c, h.v);
      }
      for (const x of plan.sets) fit(x.c, x.v);
      ws.setColWidths(wide);
      ws.setPrintFit(c2 >= 10);
    }
    // Α/Α με τύπο (=A4+1): οι νέες γραμμές μπαίνουν στην αλυσίδα (οι αριθμοί του σχεδίου δεν γράφονται πάνω σε τύπο)
    const chain = (after: number, n: number) => { if (b.cols.aa != null) ws.chainAa(b.cols.aa + 1, after + 1, n); };
    if (plan.insert && !fresh) { ws.insertRows(plan.insert.after + 1, plan.insert.n, plan.insert.tpl + 1, wb); chain(plan.insert.after, plan.insert.n); }
    // νέοι στρατιώτες μέσα στον πίνακα (στον θάλαμό τους): γραμμές με το στυλ του διπλανού, οι τύποι από κάτω κατεβαίνουν
    for (const st of steps) { ws.insertRows(st.after + 1, st.n, st.tpl + 1, wb); chain(st.after, st.n); }
    // νέοι στρατιώτες κάτω από τον τελευταίο: τα σύνολα που μετράνε ως τον τελευταίο τους μετράνε κι αυτούς
    if (plan.grow) await wb.growRanges(ws, plan.grow.from, plan.grow.last, plan.grow.to);
    // Ελεύθερες γραμμές που γράφονται τώρα: παίρνουν πλαίσια και στοίχιση από τη γραμμή του πίνακα από πάνω
    // (ή το στυλ του νέου πίνακα) σε όσα κελιά δεν έχουν δικό τους στυλ. Οι γραμμές που μπήκαν με insertRows τα έχουν ήδη.
    const fin = stepFin(steps), newRows = stepRows(steps);
    const scan = tableRows(sheet, b.header, b.cols); const span = scan.width; const recs = new Set(scan.records.map(x => fin(x.r)));
    const inserted = (r: number) => newRows.has(r) || (!!plan.insert && !fresh && r > plan.insert.after && r <= plan.insert.after + plan.insert.n);
    const rowsOut = [...new Set(plan.sets.map(x => x.r))].filter(r => r > b.header && !inserted(r) && !recs.has(r)).sort((a, c) => a - c);
    const styled = (k: number) => { for (let c = span[0]; c <= span[1]; c++) if (ws.style(ref(k, c)) != null) return true; return false; };
    for (const r of rowsOut) {
      let tpl = r - 1; while (!fresh && tpl > b.header && (!styled(tpl) || newRows.has(tpl))) tpl--;
      if (tpl <= b.header) tpl = -1;
      for (let c = span[0]; c <= span[1]; c++) {
        if (ws.style(ref(r, c)) != null) continue;
        const st = fresh ? data! : tpl >= 0 ? ws.style(ref(tpl, c)) : null;
        if (st != null) ws.setStyle(ref(r, c), st);
      }
    }
    for (const x of plan.sets) if (newCols.has(x.c) && ws.style(ref(x.r, x.c)) == null) { const st = ws.style(ref(x.r, x.c - 1)); if (st != null) ws.setStyle(ref(x.r, x.c), st); }
    for (const x of plan.sets) await put(x.r, x.c, x.v, data);
    // νέο Δυναμολόγιο: τα σύνολα θαλάμων κάτω από τον πίνακα και το φύλλο ΘΑΛΑΜΟΙ (αν δεν υπάρχει ήδη)
    if (fresh && plan.extra?.length) {
      const head = await wb.tableStyle('head');
      for (const x of plan.extra) { const at = ref(x.r, x.c); if (x.f) ws.setFormula(at, x.f); else ws.set(at, x.v ?? null); ws.setStyle(at, x.head ? head : data!); }
      for (const m of plan.merges || []) ws.addMerge(ref(m.r, m.c1) + ':' + ref(m.r, m.c2));
    }
    if (fresh && kind === 'people' && !wb.sheetNames().some(x => x !== b.sheet && /ΘΑΛΑΜ/i.test(x))) {
      const rs = roomSheetNew(s.people);
      if (rs.cells.length) {
        const st = { title: await wb.tableStyle('title'), head: await wb.tableStyle('head'), data: data! };
        const ws2 = await wb.addSheet('ΘΑΛΑΜΟΙ');
        for (const x of rs.cells) { const at = ref(x.r, x.c); if (x.v != null) ws2.set(at, typeof x.v === 'object' ? null : x.v); ws2.setStyle(at, st[x.st]); }
        for (const m of rs.merges) ws2.addMerge(ref(m.r, m.c1) + ':' + ref(m.r, m.c2));
        ws2.setPrintFit(true);
        ws2.setColWidths(Object.fromEntries(ROOM_HEAD.map((h, c) => [c + 1, Math.min(32, Math.max(8, h.length + 2, ...rs.cells.filter(x => x.c === c && x.st === 'data').map(x => String(x.v ?? '').length + 2)))])));
      }
    }
    // νέος που αναιρέθηκε: η γραμμή του φεύγει (σε φύλλο με πίνακα του Excel απλώς αδειάζει)
    for (const d of plan.deletes || []) if (!ws.deleteRow(d + 1, wb)) for (let c = span[0]; c <= span[1]; c++) await put(d, c, null);
    // Θάλαμοι: στο φύλλο ΘΑΛΑΜΟΙ (ένας πίνακας ανά θάλαμο) ο νέος μπαίνει στο τέλος του θαλάμου του και ο αναιρεμένος φεύγει.
    // Όταν αλλάζει θάλαμος κάποιου που υπήρχε, ή δεν βρέθηκε πίνακας για τον θάλαμο, θυμίζουμε να γίνει με το χέρι.
    const rc = kind === 'people' ? b.cols.room : undefined;
    const roomSheet = kind === 'people' ? wb.sheetNames().find(x => x !== b.sheet && /ΘΑΛΑΜ/i.test(x)) : undefined;
    const pm = new Map(s.people.map(p => [p.id, p]));
    const add = (plan.fresh || []).map(id => pm.get(id)!).filter(Boolean);
    let placed = 0, missing = add.filter(p => p.room != null).length;
    if (roomSheet && (add.length || plan.gone?.length)) {
      const rs = await wb.sheet(roomSheet); const fx = new Set<string>();
      const rsheet: RawSheet = { name: roomSheet, rows: await wb.values(roomSheet, 2000, MAX_COLS, fx), fx };
      const rp = planRoomSheet(rsheet, add, plan.gone || []);
      const aaC = roomBlocks(rsheet).find(x => x.cols.aa != null)?.cols.aa;
      for (const st of rp.inserts) { rs.insertRows(st.after + 1, st.n, st.tpl + 1, wb); if (aaC != null) rs.chainAa(aaC + 1, st.after + 1, st.n); }
      for (const x of rp.sets) { const at = ref(x.r, x.c); if (rs.hasFormula(at)) continue; if (x.v != null && typeof x.v === 'object') continue; rs.set(at, x.v); }
      for (const d of rp.deletes) rs.deleteRow(d + 1, wb);
      placed = add.length - rp.missing.length; missing = rp.missing.filter(p => p.room != null).length;
    }
    const roomSets = roomSheet && rc != null ? plan.sets.filter(x => x.c === rc && x.r > b.header && recs.has(x.r)) : [];
    const roomRows = new Set(roomSets.map(x => x.r)).size;
    const rooms = roomSheet && (roomRows || missing || placed) ? { n: roomRows, added: missing, placed, sheet: roomSheet } : undefined;
    return { unchanged: false, res, keep, b, rooms, tidied, fresh, grown, created: !exists || !had };
  }
}
