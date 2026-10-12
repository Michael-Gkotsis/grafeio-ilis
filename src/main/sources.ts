// Αρχεία Excel της Ίλης στον main: ανάγνωση με την αντιστοίχιση του χρήστη και εγγραφή των αλλαγών της εφαρμογής
// πίσω στο ίδιο αρχείο. Η εγγραφή αλλάζει μόνο τιμές κελιών (xlsx.ts): στυλ, τύποι, άλλα φύλλα και μακροεντολές μένουν.
// Περνά από το writeAll: πρώτα .tmp και έλεγχος, η προηγούμενη έκδοση στο «_προηγούμενα», τίποτα αν είναι ανοιχτό στο Excel.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Workbook, colName, toSerial } from './xlsx';
import { writeAll, writeJson, LockedError } from './files';
import type { RawSheet } from '../shared/roster';
import type { AppState } from '../shared/domain';
import type { ISODate } from '../shared/dates';
import { HASH_V, isStatusKind, locateHeader, planSource, refitCols, tableHash, type ListKind, type PersonSnap, type SourceBinding, type WVal } from '../shared/sources';

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

export class OldFormatError extends Error {}
export async function readBook(file: string, maxRows = 2000, maxCols = MAX_COLS): Promise<{ sheets: RawSheet[]; mtime: number; size: number }> {
  if (/\.xls$/i.test(file)) throw new OldFormatError('Το «' + path.basename(file) + '» είναι παλιό .xls. Άνοιξέ το στο Excel και κάνε «Αποθήκευση ως» .xlsx (ή .xlsm αν έχει μακροεντολές).');
  const buf = await fs.promises.readFile(file);
  const st = fs.statSync(file);
  let wb: Workbook;
  try { wb = await Workbook.open(buf); } catch { throw new Error('Το «' + path.basename(file) + '» δεν διαβάζεται ως Excel (.xlsx/.xlsm).'); }
  const sheets: RawSheet[] = [];
  for (const name of wb.sheetNames()) { const fx = new Set<string>(); try { sheets.push({ name, rows: await wb.values(name, maxRows, maxCols, fx), fx }); } catch { sheets.push({ name, rows: [] }); } }
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
  | { ok: true; file: string; unchanged: boolean; added: number; changed: number; cleared: number; foreign: number; notFound: string[]; created: boolean; meta: Partial<SourceMeta>; rooms?: { n: number; sheet: string } }
  | { ok: false; error: string; locked?: boolean };

// Γράφει στο αρχείο ό,τι έχει η εφαρμογή για αυτό το είδος. Αν το αρχείο ή το φύλλο λείπει, το φτιάχνει.
export async function writeSource(kind: ListKind, b: SourceBinding, s: AppState, meta: SourceMeta | undefined, today: ISODate): Promise<WriteOutcome> {
  try {
    const exists = fs.existsSync(b.file);
    if (!exists && !isStatusKind(kind)) return { ok: false, error: 'Δεν βρέθηκε το ' + b.file };
    const wb = exists ? await Workbook.open(await fs.promises.readFile(b.file)) : await Workbook.blank(b.sheet);
    const had = wb.hasSheet(b.sheet);
    const ws = had ? await wb.sheet(b.sheet) : await wb.addSheet(b.sheet);
    const sheet: RawSheet = { name: b.sheet, rows: had ? await wb.values(b.sheet, 2000, MAX_COLS) : [] };
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
    const fresh = plan.header.length > 0;        // καινούργιος πίνακας: δικό μας απλό στυλ με πλαίσια
    const blank = !exists;
    const res = { added: plan.added, changed: plan.changed, cleared: plan.cleared, foreign: plan.foreign, notFound: plan.notFound, keys: plan.keys, snap: plan.snap };
    const keep = { keys: plan.keys, psnap: plan.psnap, ...(plan.snap ? { snap: plan.snap } : {}) };
    if (!plan.sets.length && !plan.insert && !fresh) return { ok: true, file: b.file, unchanged: true, ...res, created: false, meta: keep };
    for (const h of plan.header) { ws.set(ref(h.r, h.c), h.v); if (blank) ws.setStyle(ref(h.r, h.c), h.title ? 0 : 1); }
    if (plan.insert && !fresh) ws.insertRows(plan.insert.after + 1, plan.insert.n, plan.insert.tpl + 1, wb);
    for (const x of plan.sets) await put(x.r, x.c, x.v, blank ? 2 : undefined);
    // Θάλαμοι: το φύλλο ΘΑΛΑΜΟΙ δεν συνδέεται, οπότε όταν αλλάζει θάλαμος θυμίζουμε να μετακινηθεί και εκεί ο στρατιώτης
    const rc = kind === 'people' ? b.cols.room : undefined;
    const roomSheet = rc != null ? wb.sheetNames().find(x => x !== b.sheet && /ΘΑΛΑΜ/i.test(x)) : undefined;
    const roomRows = roomSheet ? new Set(plan.sets.filter(x => x.c === rc && x.r > b.header).map(x => x.r)).size : 0;
    const rooms = roomRows ? { n: roomRows, sheet: roomSheet! } : undefined;
    const data = await wb.save();
    const out = await writeAll([{ dir: path.dirname(b.file), name: path.basename(b.file), data }], { prevEvery: PREV_EVERY });
    return { ok: true, file: out[0], unchanged: false, created: !exists || !had, ...res, rooms, meta: { ...keep, ...(await syncStampNow({ ...b, file: out[0] })), error: undefined, locked: false, pending: false } };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
