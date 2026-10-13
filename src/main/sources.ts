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
import { HASH_V, cellText, isStatusKind, listColumns, locateHeader, planRoomSheet, planSource, stepFin, stepRows, refitCols, tableHash, tableRows, titleSpans, type ListKind, type PersonSnap, type SourceBinding, type WVal } from '../shared/sources';

export interface SourceMeta { mtime: number; size: number; hash?: string; keys: string[]; snap?: Record<number, PersonSnap>; psnap?: Record<number, PersonSnap>; keep?: string[]; at: string; error?: string; locked?: boolean; pending?: boolean;
  hold?: string;        // η εφαρμογή δεν γράφει μόνη της εδώ μέχρι νέα ανάγνωση ή «Ενημέρωση Excel» (μετά από αναίρεση ανάγνωσης ή επαναφορά βάσης)
  base?: Record<string, string> }   // οι εγγραφές όπως ήταν στην τελευταία ανάγνωση/εγγραφή (για τη σύγκρουση)
export type Metas = Partial<Record<ListKind, SourceMeta>>;

// Τι ξέρουμε για κάθε αρχείο από την τελευταία ανάγνωση/εγγραφή: ώρα και μέγεθος (για να φαίνεται αν άλλαξε
// εκτός εφαρμογής) και ποιες εγγραφές έγραψε η εφαρμογή. Δεν μπαίνει στη βάση: δεν είναι δεδομένο της Ίλης.
export class SourceMetaStore {
  constructor(private file: string) {}
  all(): Metas { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; } }
  get(kind: ListKind): SourceMeta | undefined { return this.all()[kind]; }
  set(kind: ListKind, m: Partial<SourceMeta> | null) {
    const all = this.all();
    if (m === null) delete all[kind]; else all[kind] = { ...(all[kind] || { mtime: 0, size: 0, keys: [], at: '' }), ...m };
    try { writeJson(this.file, all); } catch (e) { console.error('sources meta', e); }
  }
}
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
  const buf = await fs.promises.readFile(file);
  const st = fs.statSync(file);
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
// (νέα ή μετακινημένη στήλη, π.χ. «ΔΝ» στο ΣΥΝΟΛΙΚΟ). Ίδια αναφορά αν δεν άλλαξε τίποτα.
export async function locateNow(kind: ListKind, b: SourceBinding): Promise<SourceBinding> {
  let book; try { book = await bookNow(b.file); } catch { return b; }
  const sh = book?.sheets.find(x => x.name === b.sheet); if (!sh) return b;
  const h = locateHeader(kind, sh, b); const at = h === b.header ? b : { ...b, header: h };
  return refitCols(kind, sh, at);
}

// Αντίγραφο του αρχείου στα «_προηγούμενα» το πολύ ένα ανά 10 λεπτά (κρατά την έκδοση πριν από κάθε σειρά αλλαγών)
export const PREV_EVERY = 10 * 60 * 1000;
export type WriteOutcome =
  | { ok: true; file: string; unchanged: boolean; added: number; changed: number; cleared: number; foreign: number; notFound: string[]; warn?: string[]; created: boolean; meta: Partial<SourceMeta>; rooms?: { n: number; added: number; placed?: number; sheet: string }; tidy?: string[] }
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

// Γράφει στο αρχείο ό,τι έχει η εφαρμογή για αυτό το είδος. Αν το αρχείο ή το φύλλο λείπει, το φτιάχνει.
// tidy: γράφει και μόνο για τη μορφή που λείπει (με την «Ενημέρωση Excel»)· αλλιώς η μορφή μπαίνει όταν γράφεται κάτι.
export async function writeSource(kind: ListKind, b: SourceBinding, s: AppState, meta: SourceMeta | undefined, today: ISODate, opts: { tidy?: boolean } = {}): Promise<WriteOutcome> {
  try {
    const exists = fs.existsSync(b.file);
    if (!exists && !isStatusKind(kind)) return { ok: false, error: 'Δεν βρέθηκε το ' + b.file };
    const wb = exists ? await Workbook.open(await fs.promises.readFile(b.file)) : await Workbook.blank(b.sheet);
    const had = wb.hasSheet(b.sheet);
    const ws = had ? await wb.sheet(b.sheet) : await wb.addSheet(b.sheet);
    const countif = had && kind === 'duties' ? await countifOf(wb, b.sheet) : [];
    const sheet: RawSheet = { name: b.sheet, rows: had ? await wb.values(b.sheet, 2000, MAX_COLS) : [], ...(countif.length ? { countif } : {}) };
    const ref = (r: number, c: number) => colName(c + 1) + (r + 1);
    const put = async (r: number, c: number, v: WVal, plain?: number) => {
      const at = ref(r, c);
      if (ws.hasFormula(at)) return;
      if (v != null && typeof v === 'object') { ws.setNumber(at, toSerial(v.date), await wb.dateStyle(ws.style(at) ?? plain ?? null)); return; }
      ws.set(at, v);
      if (plain != null && ws.style(at) == null) ws.setStyle(at, plain);
    };
    if (!had && !isStatusKind(kind)) return { ok: false, error: 'Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file) };
    const plan = planSource(kind, had ? sheet : null, b, s, meta, today);
    const fresh = plan.header.length > 0;        // καινούργιος πίνακας: δικό μας στυλ με πλαίσια, όλα στο κέντρο
    const tidy = tidyOf(kind, b, ws, sheet, s.settings.lists); if (fresh) tidy.titles = [];
    const tidied = tidyText(tidy);
    const res = { added: plan.added, changed: plan.changed, cleared: plan.cleared, foreign: plan.foreign, notFound: plan.notFound, warn: plan.warn, keys: plan.keys, snap: plan.snap };
    const keep = { keys: plan.keys, psnap: plan.psnap, ...(plan.snap ? { snap: plan.snap } : {}) };
    const steps = plan.inserts || [];
    if (!plan.sets.length && !plan.insert && !steps.length && !plan.deletes?.length && !fresh && !(opts.tidy && tidied.length)) return { ok: true, file: b.file, unchanged: true, ...res, created: false, meta: keep };
    await applyTidy(wb, ws, tidy);
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
    }
    if (plan.insert && !fresh) ws.insertRows(plan.insert.after + 1, plan.insert.n, plan.insert.tpl + 1, wb);
    // νέοι στρατιώτες μέσα στον πίνακα (στον θάλαμό τους): γραμμές με το στυλ του διπλανού, οι τύποι από κάτω κατεβαίνουν
    for (const st of steps) ws.insertRows(st.after + 1, st.n, st.tpl + 1, wb);
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
    for (const x of plan.sets) await put(x.r, x.c, x.v, data);
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
      for (const st of rp.inserts) rs.insertRows(st.after + 1, st.n, st.tpl + 1, wb);
      for (const x of rp.sets) { const at = ref(x.r, x.c); if (rs.hasFormula(at)) continue; if (x.v != null && typeof x.v === 'object') continue; rs.set(at, x.v); }
      for (const d of rp.deletes) rs.deleteRow(d + 1, wb);
      placed = add.length - rp.missing.length; missing = rp.missing.filter(p => p.room != null).length;
    }
    const roomSets = roomSheet && rc != null ? plan.sets.filter(x => x.c === rc && x.r > b.header && recs.has(x.r)) : [];
    const roomRows = new Set(roomSets.map(x => x.r)).size;
    const rooms = roomSheet && (roomRows || missing || placed) ? { n: roomRows, added: missing, placed, sheet: roomSheet } : undefined;
    const out = await writeAll([{ dir: path.dirname(b.file), name: path.basename(b.file), data: await wb.save() }], { prevEvery: PREV_EVERY });
    return { ok: true, file: out[0], unchanged: false, created: !exists || !had, ...res, rooms, ...(tidied.length && !fresh ? { tidy: tidied } : {}), meta: { ...keep, ...(await syncStampNow({ ...b, file: out[0] })), error: undefined, locked: false, pending: false } };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
