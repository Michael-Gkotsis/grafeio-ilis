// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './db';
import { writeAll, LockedError } from './files';
import { preflight, hasErrors } from '../shared/preflight';
import { apply, type Command } from '../shared/commands';
import { dm, dow, nowHM, pskDays, today, type ISODate } from '../shared/dates';
import { Workbook, mergeFirstSheets } from './xlsx';
import JSZip from 'jszip';
import type { Boot, CmdResult, Diag, ExportKind, ExportResult, FormInfo, FormOut, ImportPreview, SourceBook, SourceStatus, TemplateInfo, WritePreview } from '../shared/api';
import { SourceMetaStore, OldFormatError, readBook, stamp, writeSource } from './sources';
import { parseRoster, type RawSheet, type RosterOverride } from '../shared/roster';
import { KIND, STATUS_KINDS, bestFor, defaultBinding, describeSets, detectHkai, detectTables, diffStatuses, hkaiMapOf, isStatusKind, parseStatuses, planPeopleWrite, planWrite, snapFromSheet,
  type FormBinding, type FormKind, type ListKind, type SourceBinding, type StatusKind } from '../shared/sources';
import { normGreek } from '../shared/text';
import { fillFroura, fillHkai, fillOuts, TemplateError } from './exports';
import type { ImportRow } from '../shared/commands';
import type { AppState, AuditEntry } from '../shared/domain';

const DEV = !app.isPackaged;
const ROOT = DEV ? process.cwd() : path.dirname(process.execPath);
const BUNDLED = DEV ? process.cwd() : path.join(process.resourcesPath, 'app');

// Φορητή εγκατάσταση: τα δεδομένα δίπλα στο .exe αν ο φάκελος γράφεται, αλλιώς στο προφίλ του χρήστη
function writableDir(dir: string): boolean {
  try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, '.w'); fs.writeFileSync(t, ''); fs.unlinkSync(t); return true; } catch { return false; }
}
const DATA = writableDir(path.join(ROOT, 'data')) ? path.join(ROOT, 'data') : path.join(app.getPath('userData'), 'data');
const BACKUPS = path.join(DATA, 'backups');
const T0 = Date.now();
// Διακόπτης GPU (έρευνα §5.6): σε παλιές κάρτες γραφικών με Windows 7 η επιτάχυνση μπορεί να κοστίζει μνήμη ή να δίνει μαύρη οθόνη.
// Αλλάζει από την οθόνη «Διάγνωση» και ισχύει στην επόμενη εκκίνηση.
const FLAGS = path.join(DATA, 'flags.json');
const readFlags = (): { disableGpu?: boolean } => { try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); } catch { return {}; } };
// Μικρά στοιχεία που δεν ανήκουν στη βάση (για να μη χάνονται με μια επαναφορά): τελευταίο αντίγραφο σε USB, ως πού είδε ο χρήστης το ιστορικό
const META = path.join(DATA, 'meta.json');
type Meta = { lastUsb?: string; usbDir?: string; seenAudit?: number };
const readMeta = (): Meta => { try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch { return {}; } };
const writeMeta = (m: Partial<Meta>) => { try { fs.writeFileSync(META, JSON.stringify({ ...readMeta(), ...m })); } catch (e) { console.error('meta', e); } };
const USB_DIR = 'Γραφείο Ίλης αντίγραφα';
const USB_KEEP = 10;
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
const USER_TPL = path.join(ROOT, 'templates');   // ο λοχίας μπορεί να βάλει εδώ δική του έκδοση εντύπου
const TPL: { id: ExportKind; name: string; file: string }[] = [
  { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΒΕΝ)', file: 'froura.xlsx' },
  { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΠΕΝ)', file: 'froura-spen.xlsx' },
  { id: 'hkai', name: 'ΗΚΑΙ (μπροστινο, πισω)', file: 'hkai.xlsx' },
  { id: 'outs', name: 'Εξοδούχοι / Παραμένοντες', file: 'exodouxoi.xlsx' }
];
const tplPath = (file: string) => (fs.existsSync(path.join(USER_TPL, file)) ? path.join(USER_TPL, file) : path.join(BUNDLED, 'templates', file));
// Έντυπα: ποιο template και ποιος φάκελος (Αρχεία Excel). Χωρίς επιλογή: τα templates της εφαρμογής.
const FORM_FILE: Record<Exclude<FormKind, 'check'>, string> = { froura: 'froura.xlsx', frouraSpen: 'froura-spen.xlsx', hkai: 'hkai.xlsx', outs: 'exodouxoi.xlsx' };
const formBinding = (f: FormKind): FormBinding => store.state.settings.forms?.[f] || {};
const formOf = (kind: ExportKind, s: AppState): FormKind => (kind === 'froura' || kind === 'frouraPsk' ? (s.settings.phase === 'spen' ? 'frouraSpen' : 'froura') : kind === 'hkai' ? 'hkai' : kind === 'check' ? 'check' : 'outs');
function formTpl(f: Exclude<FormKind, 'check'>): string {
  const b = formBinding(f);
  if (b.file) { if (!fs.existsSync(b.file)) throw new Error('Δεν βρέθηκε το template ' + b.file + '. Διάλεξε άλλο στα «Αρχεία Excel» ή γύρνα στο template της εφαρμογής.'); return b.file; }
  const file = tplPath(FORM_FILE[f]);
  if (!fs.existsSync(file)) throw new Error('Λείπει το έντυπο ' + FORM_FILE[f] + ' από τον φάκελο templates');
  return file;
}
const formDir = (f: FormKind, date: ISODate) => { const b = formBinding(f); return b.dir ? (b.monthly === false ? b.dir : path.join(b.dir, date.slice(0, 7))) : path.join(outputDir(), date.slice(0, 7)); };
const templates = (): TemplateInfo[] => [
  ...TPL.map(t => { const f: FormKind = t.file === 'froura.xlsx' ? 'froura' : t.file === 'froura-spen.xlsx' ? 'frouraSpen' : t.id === 'hkai' ? 'hkai' : 'outs'; const b = store?.state.settings.forms?.[f];
    return b?.file ? { id: t.id, name: t.name, file: b.file, ok: fs.existsSync(b.file), custom: true } : { id: t.id, name: t.name, file: t.file, ok: fs.existsSync(tplPath(t.file)), custom: fs.existsSync(path.join(USER_TPL, t.file)) }; }),
  { id: 'check', name: 'Έλεγχος υπηρεσιών (μηνιαίο πλέγμα)', file: 'δημιουργείται από την εφαρμογή', ok: true, custom: false }
];

let store: Store;
let seenUntil = 0, sessionStart = 0;   // «Τι άλλαξε από το προηγούμενο άνοιγμα»: ενέργειες με id σε (seenUntil, sessionStart]
let win: BrowserWindow | null = null;
const ctx = () => ({ today: today(), newId: () => crypto.randomUUID() });
const outputDir = () => store.state.settings.outputDir || path.join(app.getPath('documents'), 'Γραφείο Ίλης');
// Τι έχει ήδη το UI: η κατάσταση και η τελευταία γραμμή ιστορικού που του στάλθηκαν. Οι εντολές δεν αλλάζουν
// αντικείμενα, φτιάχνουν νέα, οπότε ό,τι έχει την ίδια αναφορά με πριν δεν άλλαξε και δεν ξαναστέλνεται.
let sent: AppState | null = null, sentAudit = 0;
function snapshot(): { state: AppState; audit: AuditEntry[] } {
  const audit = store.audit(); sent = store.state; sentAudit = Math.max(sentAudit, audit[0]?.id || 0);
  return { state: store.state, audit };
}
function reply(text: string, fullAudit = false): CmdResult {
  const s = store.state; const changes: Partial<AppState> = {};
  for (const k of Object.keys(s) as (keyof AppState)[]) if (!sent || s[k] !== sent[k]) (changes as any)[k] = s[k];
  sent = s;
  const newAudit = fullAudit ? [] : store.audit(300, sentAudit);
  const audit = fullAudit ? store.audit() : undefined;
  sentAudit = Math.max(sentAudit, (audit || newAudit)[0]?.id || 0);
  return { ok: true, changes, newAudit, audit, text };
}
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// Τρέχει μια εντολή και τη γράφει. Ό,τι άλλαξε φτάνει στο UI με την επόμενη απάντηση reply() (και όσα έγιναν χωρίς αυτό, π.χ. λήξεις)
function runCmd(cmd: Command): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const prev = store.state;
    const r = apply(store.state, cmd, ctx());
    const changed = r.state !== store.state;
    if (changed) {
      const patch = store.commit(r.state);
      const undoable = r.undoable !== false;
      if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable }, undoable ? patch : null, false);
    } else if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable: false }, null, false);
    for (const t of r.extra || []) store.addAudit({ at: nowHM(), day: today(), text: t, files: [], source: 'auto', undoable: false }, null, false);
    // μία εγγραφή της βάσης στον δίσκο ανά ενέργεια, όχι μία ανά γραμμή ιστορικού
    if (changed || r.text || r.extra?.length) store.flush();
    if (changed) scheduleAuto(prev, store.state);
    return { ok: true, text: r.text };
  } catch (e) { return fail(e); }
}

// Κάθε μέρα: όσα ιατρικά/ποινές έληξαν χθες γράφονται στο ιστορικό (Κ-04, Κ-10), και ένα αντίγραφο της βάσης
function daily() {
  const d = today();
  if (!store.hasAuditToday(d, 'auto')) runCmd({ t: 'expire' });
  const dir = path.join(DATA, 'backups');
  const has = fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.startsWith('ilh_' + d));
  if (!has) { try { store.backup('ημερήσιο'); store.pruneBackups(); } catch (e) { console.error('backup', e); } }
}

// το βαρύ ExcelJS φορτώνεται μόνο όταν χρειαστεί
const nodeRequire: NodeRequire = require;
const excel = (): typeof import('./excel') => nodeRequire(path.join(__dirname, 'excel.js'));

// Μία εξαγωγή τη φορά, και ποτέ ατελείωτη αναμονή: αν κάτι κολλήσει (αργός δίσκος, antivirus), μετά από EXPORT_MAX
// το κουμπί ξεκλειδώνει με μήνυμα αντί να μένει στο «Δημιουργία…»
const EXPORT_MAX = 60000;
let exporting = false;
async function exportGuarded(kind: ExportKind, date: ISODate, opts: { open?: boolean; ack?: boolean }): Promise<ExportResult> {
  if (exporting) return { ok: false, error: 'Βγαίνει ήδη άλλο έντυπο. Περίμενε να τελειώσει και ξαναπάτα.' };
  exporting = true;
  let timer: NodeJS.Timeout | undefined;
  const slow = new Promise<ExportResult>(res => { timer = setTimeout(() => res({ ok: false, error: 'Η εξαγωγή άργησε πάνω από ένα λεπτό. Δες αν ο φάκελος των Excel είναι σε USB ή δίσκο δικτύου που δεν απαντά (Ρυθμίσεις → Φάκελος για τα Excel) και ξαναπάτα.' }), EXPORT_MAX); });
  const work = exportFile(kind, date, opts);
  try { return await Promise.race([work, slow]); }
  finally { clearTimeout(timer); work.finally(() => { exporting = false; }); }
}

// Το συμπληρωμένο έντυπο (χωρίς εγγραφή): το ίδιο για το κουμπί και για την αυτόματη ενημέρωση όσων έχουν ήδη βγει
async function produce(kind: ExportKind, date: ISODate, s: AppState): Promise<{ name: string; data: Buffer; warnings?: string[] }> {
  const form = formOf(kind, s);
  if (kind === 'check') return excel().dutyCheck(s, date.slice(0, 7));
  const b = formBinding(form);
  const buf = await fs.promises.readFile(formTpl(form as Exclude<FormKind, 'check'>));
  if (kind === 'frouraPsk' || kind === 'outsPsk') {
    // ΠΣΚ: ένα αρχείο, ένα φύλλο ανά ημέρα (Παρ, Σαβ, Κυρ)
    const fr = kind === 'frouraPsk'; const days = pskDays(date);
    const parts = await Promise.all(days.map(d => (fr ? fillFroura(buf, s, d, undefined, b.sheet) : fillOuts(buf, s, d, { outs: b.sheet, stay: b.sheet2 }))));
    const data = await mergeFirstSheets(parts.map(x => x.data), days.map(d => dow(d).toUpperCase() + ' ' + dm(d).replace('/', '-')), fr ? b.sheet : undefined);
    return { name: (fr ? 'ΦΡΟΥΡΑ ' + (s.settings.phase === 'spen' ? 'ΣΠΕΝ ' : '') : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ') + 'ΠΣΚ ' + dm(days[0]).replace('/', '-') + ' έως ' + dm(days[2]).replace('/', '-') + '-' + days[2].slice(0, 4) + '.xlsx', data, warnings: parts.flatMap(x => x.warnings || []) };
  }
  if (kind === 'froura') return fillFroura(buf, s, date, undefined, b.sheet);
  if (kind === 'hkai') return fillHkai(buf, s, date, { front: b.sheet, back: b.sheet2, map: await hkaiMap(buf, b) });
  return fillOuts(buf, s, date, { outs: b.sheet, stay: b.sheet2 });
}
// ΗΚΑΙ σε δικό του template: οι θέσεις βρίσκονται από τα κείμενα του εντύπου, και από πάνω ό,τι διόρθωσε ο χρήστης
async function hkaiMap(buf: Buffer, b: FormBinding) {
  if (!b.file) return hkaiMapOf(b.cells);
  const wb = await Workbook.open(buf); const front = b.sheet && wb.hasSheet(b.sheet) ? b.sheet : wb.sheetNames()[0];
  const det = detectHkai({ name: front, rows: await wb.values(front, 120, 40) }, store.state.settings.place).map;
  return { title: b.cells?.title || det.title, date: b.cells?.date || det.date, rows: { ...det.rows, ...(b.cells?.rows || {}) }, cols: { ...det.cols, ...(b.cells?.cols || {}) } };
}

async function exportFile(kind: ExportKind, date: ISODate, opts: { open?: boolean; ack?: boolean }): Promise<ExportResult> {
  try {
    const s = store.state;
    // Προέλεγχος: με ✕ δεν βγαίνει έντυπο, με ⚠ χρειάζεται επιβεβαίωση που γράφεται στο ιστορικό
    const checks = preflight(kind, s, date);
    if (hasErrors(checks)) return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη που πρέπει να διορθωθούν πρώτα', checks };
    if (checks.length && !opts.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
    const r = await produce(kind, date, s);
    const [out] = await writeAll([{ dir: formDir(formOf(kind, s), date), name: r.name, data: r.data }]);
    for (const d of kind === 'frouraPsk' || kind === 'outsPsk' ? pskDays(date) : [date]) runCmd({ t: 'printed', date: d, at: nowHM(), files: [path.basename(out)] });
    for (const c of checks) store.addAudit({ at: nowHM(), day: today(), text: 'Βγήκε ' + path.basename(out) + ' με προειδοποίηση: ' + c.text, files: [], source: 'app', undoable: false }, null, false);
    if (checks.length) store.flush();
    rememberOut({ form: formOf(kind, s), kind, date, file: out, at: nowHM(), hash: await zipHash(r.data) });
    if (opts.open) shell.openPath(out);
    return { ok: true, file: out, warnings: r.warnings || [] };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    if (e instanceof TemplateError) return { ok: false, error: e.message, checks: [{ level: 'err', text: e.message }] };
    return fail(e);
  }
}

// ------------------------------------------------------------------ Excel που έχουν ήδη βγει: ενημερώνονται μόνα τους
// Κάθε έντυπο που βγήκε για σήμερα ή επόμενη μέρα ξαναγράφεται όταν αλλάξει κάτι στην εφαρμογή (Michael, 11/10).
// Αν δεν άλλαξε το περιεχόμενο δεν αγγίζεται· αν είναι ανοιχτό στο Excel ή ο προέλεγχος βρίσκει λάθος, περιμένει.
type OutRec = FormOut & { kind: ExportKind; hash: string };
const OUTS_FILE = path.join(DATA, 'forms.json');
const readOuts = (): OutRec[] => { try { return JSON.parse(fs.readFileSync(OUTS_FILE, 'utf8')); } catch { return []; } };
const writeOuts = (l: OutRec[]) => { try { fs.writeFileSync(OUTS_FILE, JSON.stringify(l)); } catch (e) { console.error('forms.json', e); } };
const lastDay = (o: { kind: ExportKind; date: ISODate }) => (o.kind === 'frouraPsk' || o.kind === 'outsPsk' ? pskDays(o.date)[2] : o.kind === 'check' ? o.date.slice(0, 7) + '-31' : o.date);
function rememberOut(o: OutRec) {
  const t = today();
  writeOuts([...readOuts().filter(x => x.file !== o.file && lastDay(x) >= t), o]);
}
async function zipHash(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf); const h = crypto.createHash('sha1');
  for (const n of Object.keys(z.files).sort()) { if (z.files[n].dir) continue; h.update(n); h.update(await z.files[n].async('nodebuffer')); }
  return h.digest('hex');
}
async function regenForms(): Promise<boolean> {
  const t = today(); const list = readOuts().filter(o => lastDay(o) >= t); let any = false;
  for (const o of list) {
    if (!fs.existsSync(o.file)) { o.error = undefined; o.pending = false; continue; }   // το έσβησε ο χρήστης: δεν το ξαναφτιάχνουμε
    try {
      const s = store.state;
      const errs = preflight(o.kind, s, o.date).filter(c => c.level === 'err');
      if (errs.length) { o.pending = true; o.error = 'Ο προέλεγχος βρήκε λάθος: ' + errs[0].text; continue; }
      const r = await produce(o.kind, o.date, s); const h = await zipHash(r.data);
      if (h === o.hash) { o.pending = false; o.error = undefined; continue; }
      await writeAll([{ dir: path.dirname(o.file), name: path.basename(o.file), data: r.data }]);
      o.hash = h; o.at = nowHM(); o.pending = false; o.error = undefined; any = true;
      store.addAudit({ at: nowHM(), day: t, text: 'Ενημερώθηκε μόνο του το ' + path.basename(o.file) + ' (άλλαξαν δεδομένα)', files: [path.basename(o.file)], source: 'auto', undoable: false }, null, false);
    } catch (e) { o.pending = true; o.error = e instanceof Error ? e.message : String(e); }
  }
  writeOuts(list);
  if (any) store.flush();
  return any;
}

// ------------------------------------------------------------------ Αρχεία Excel (πηγές ανά είδος)
let srcMeta: SourceMetaStore;
const bindingOf = (k: ListKind): SourceBinding | undefined => store.state.settings.sources?.[k];
const stampNow = () => today() + ' ' + nowHM();
const ovOf = (b?: SourceBinding, file?: string): RosterOverride | undefined => (b && (!file || path.resolve(b.file) === path.resolve(file)) ? { sheet: b.sheet, header: b.header, cols: b.cols } : undefined);
function sourceStatus(): SourceStatus[] {
  const metas = srcMeta.all();
  return (Object.entries(store.state.settings.sources || {}) as [ListKind, SourceBinding][]).filter(([, b]) => b).map(([kind, b]) => {
    const st = stamp(b.file); const m = metas[kind];
    return { kind, file: b.file, exists: !!st, synced: !!m?.at, changed: !!(st && m?.at && (st.mtime !== m.mtime || st.size !== m.size)), at: m?.at || '', error: m?.error, locked: m?.locked, pending: m?.pending };
  });
}
const statusAll = () => ({ sources: sourceStatus(), forms: readOuts().filter(o => lastDay(o) >= today()).map(({ form, date, file, at, error, pending }) => ({ form, date, file, at, error, pending })) });
const notify = () => { try { win?.webContents.send('sources', statusAll()); } catch { /* παράθυρο κλειστό */ } };
async function bookOf(file: string): Promise<SourceBook> {
  const r = await readBook(file);
  return { ok: true, file, name: path.basename(file), mtime: r.mtime, size: r.size, sheets: r.sheets.map(x => ({ name: x.name, rows: x.rows.slice(0, 1000) })), hits: detectTables(r.sheets) };
}
const sheetOf = (sheets: RawSheet[], name: string) => sheets.find(x => x.name === name);
function writeText(kind: ListKind, file: string, r: { added: number; changed: number; cleared: number; notFound: string[]; created: boolean }, b: SourceBinding) {
  const parts = [r.created && 'φτιάχτηκε', r.added && r.added + (r.added === 1 ? ' νέα' : ' νέες'), r.changed && r.changed + (r.changed === 1 ? ' αλλαγή' : ' αλλαγές'), r.cleared && r.cleared + ' σβήστηκαν'].filter(Boolean).join(', ');
  return 'Excel ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(file) + ' › ' + b.sheet + (parts ? ' (' + parts + ')' : '') + (r.notFound.length ? '. Δεν βρέθηκαν στο φύλλο: ' + r.notFound.slice(0, 5).join(', ') : '');
}
// Γράφει ένα είδος στο Excel του. auto: μόνο αν έχει ξαναγραφτεί/διαβαστεί και το αρχείο δεν άλλαξε από τότε.
async function syncOut(kind: ListKind, auto: boolean): Promise<{ ok: true; text: string; file: string; unchanged: boolean } | { ok: false; error: string; locked?: boolean }> {
  const b = bindingOf(kind); if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο για ' + KIND[kind].label };
  const m = srcMeta.get(kind);
  if (auto) {
    if (b.write === false || !m?.at) return { ok: true, text: '', file: b.file, unchanged: true };
    const st = stamp(b.file);
    if (st && (st.mtime !== m.mtime || st.size !== m.size)) { srcMeta.set(kind, { pending: true, error: 'Το αρχείο άλλαξε εκτός εφαρμογής. Πάτα «Ανανέωση από Excel» και μετά «Ενημέρωση Excel».' }); return { ok: false, error: 'changed' }; }
  }
  const r = await writeSource(kind, b, store.state, m, today());
  if (!r.ok) { srcMeta.set(kind, { pending: true, error: r.error, locked: !!r.locked }); return r; }
  srcMeta.set(kind, { ...r.meta, at: stampNow(), pending: false, error: undefined, locked: false });
  if (r.unchanged) return { ok: true, text: 'Το ' + path.basename(r.file) + ' είχε ήδη τα ίδια', file: r.file, unchanged: true };
  const text = writeText(kind, r.file, r, b);
  store.addAudit({ at: nowHM(), day: today(), text, files: [path.basename(r.file)], source: 'excel', undoable: false }, null);
  return { ok: true, text, file: r.file, unchanged: false };
}
// Μετά από κάθε αλλαγή: τα είδη που άλλαξαν γράφονται στα Excel τους και τα έντυπα που έχουν βγει ενημερώνονται
const dirty = new Set<ListKind>(); let formsDirty = false; let autoTimer: NodeJS.Timeout | undefined; let autoBusy = false;
function scheduleAuto(prev: AppState, next: AppState) {
  if (prev === next) return;
  if (prev.people !== next.people) dirty.add('people');
  if (prev.statuses !== next.statuses || prev.people !== next.people) STATUS_KINDS.forEach(k => dirty.add(k));
  formsDirty = true;
  clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1200);
}
async function runAuto() {
  if (autoBusy) { clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1500); return; }
  autoBusy = true;
  try {
    for (const k of [...dirty]) { dirty.delete(k); if (bindingOf(k)) await syncOut(k, true); }
    if (formsDirty) { formsDirty = false; await regenForms(); }
  } catch (e) { console.error('auto', e); }
  finally { autoBusy = false; notify(); }
}
// όσα περιμένουν (ήταν ανοιχτά στο Excel) ξαναδοκιμάζονται κάθε λεπτό
function retryPending() {
  const metas = srcMeta.all(); let any = false;
  for (const [k, m] of Object.entries(metas) as [ListKind, NonNullable<ReturnType<SourceMetaStore['get']>>][]) if (m?.pending && m.locked) { dirty.add(k); any = true; }
  if (readOuts().some(o => o.pending)) { formsDirty = true; any = true; }
  if (any) runAuto();
}

// Εισαγωγή προσωπικού: από το κουμπί (αναγνώριση μόνη της) ή από τα Αρχεία Excel (με την αντιστοίχιση του χρήστη)
const pending = new Map<string, { rows: ImportRow[]; file: string; binding: SourceBinding | null; stamp: { mtime: number; size: number }; sheet: RawSheet | null }>();
async function rosterPreview(file: string, b: SourceBinding | null): Promise<ImportPreview | { ok: false; error: string }> {
  try {
    const book = await readBook(file);
    const src = store.state.settings.sources || {};
    const r = parseRoster(book.sheets, { main: ovOf(b || undefined), posts: ovOf(src.posts, file), outside: ovOf(src.outside, file) });
    if (!r.rows.length) return { ok: false, error: r.warnings[0] || 'Δεν βρέθηκαν άτομα στο αρχείο' };
    // ποιος πίνακας διαβάστηκε: για να γράφονται εκεί οι διορθώσεις (Michael, 11/10)
    const det = b || (() => { const x = bestFor('people', book.sheets.filter(sh => sh.name === r.main)); return x ? { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding : null; })();
    const sim = apply(store.state, { t: 'importPeople', rows: r.rows, source: path.basename(file), deactivateMissing: true }, ctx()).state;
    const before = new Set(store.state.people.map(p => p.id));
    const added = sim.people.filter(p => !before.has(p.id)).length;
    const missing = sim.people.filter(p => before.has(p.id) && !p.active && store.state.people.find(q => q.id === p.id)!.active && !r.rows.some(x => x.asm && x.asm === p.asm)).length;
    const token = crypto.randomUUID();
    pending.set(token, { rows: r.rows, file, binding: det, stamp: { mtime: book.mtime, size: book.size }, sheet: det ? sheetOf(book.sheets, det.sheet) || null : null });
    return { ok: true, token, file: path.basename(file), total: r.rows.length, active: r.rows.filter(x => x.active).length, added, updated: r.rows.length - added, missing, warnings: r.warnings, essos: r.essos, skipped: r.skipped, declared: r.declared, found: r.found, suspicious: r.suspicious };
  } catch (e) { return fail(e); }
}
async function pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null> {
  const res = await dialog.showOpenDialog(win!, { title: 'Δυναμολόγιο', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] });
  if (res.canceled || !res.filePaths[0]) return null;
  const cur = bindingOf('people');
  return rosterPreview(res.filePaths[0], cur && path.resolve(cur.file) === path.resolve(res.filePaths[0]) ? cur : null);
}
// Μετά την εισαγωγή: το αρχείο γίνεται η πηγή του προσωπικού (αν δεν υπάρχει άλλη) και κρατιέται τι γράφει το καθένα
function afterRoster(p: { file: string; binding: SourceBinding | null; stamp: { mtime: number; size: number }; sheet: RawSheet | null }) {
  if (!p.binding || !p.sheet) return;
  const cur = bindingOf('people');
  if (cur && path.resolve(cur.file) !== path.resolve(p.file)) return;
  if (!cur || cur.sheet !== p.binding.sheet || cur.header !== p.binding.header) runCmd({ t: 'setSettings', settings: { sources: { ...(store.state.settings.sources || {}), people: { ...p.binding, write: cur ? cur.write : true } } }, text: 'πηγή προσωπικού ' + path.basename(p.file) + ' › ' + p.binding.sheet });
  srcMeta.set('people', { snap: snapFromSheet(p.sheet, p.binding, store.state.people), keys: [], mtime: p.stamp.mtime, size: p.stamp.size, at: stampNow(), pending: false, error: undefined, locked: false });
  notify();
}

// Διάβασμα ενός είδους από το Excel του (καταστάσεις): νέες εγγραφές και αλλαγές μπαίνουν στην εφαρμογή
async function importStatuses(kind: StatusKind, b: SourceBinding, choices: Record<number, number | null>): Promise<CmdResult> {
  try {
    const book = await readBook(b.file); const sheet = sheetOf(book.sheets, b.sheet);
    if (!sheet) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const parsed = parseStatuses(kind, sheet, b, store.state.people, today());
    const d = diffStatuses(kind, store.state, parsed, b, choices);
    saveBinding(kind, b);
    const r = runCmd({ t: 'importRecords', adds: d.add, updates: d.update.map(u => ({ id: u.id, patch: u.patch })), source: path.basename(b.file), what: KIND[kind].label.toLowerCase() });
    if (!r.ok) return r;
    srcMeta.set(kind, { keys: d.keys, mtime: book.mtime, size: book.size, at: stampNow(), pending: false, error: undefined, locked: false });
    // ό,τι έχει η εφαρμογή και λείπει από το Excel γράφεται αμέσως μετά (αν το είδος γράφει μόνο του)
    if (b.write !== false && d.appOnly.length) { dirty.add(kind); clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1200); }
    notify();
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) { return fail(e); }
}
function saveBinding(kind: ListKind, b: SourceBinding | null) {
  const cur = bindingOf(kind);
  if (JSON.stringify(cur || null) === JSON.stringify(b)) return;
  const sources = { ...(store.state.settings.sources || {}) };
  if (b) sources[kind] = b; else delete sources[kind];
  runCmd({ t: 'setSettings', settings: { sources }, text: b ? 'Excel για ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(b.file) + ' › ' + b.sheet : 'χωρίς Excel για ' + KIND[kind].label.toLowerCase() });
  // άλλο αρχείο ή άλλος πίνακας: ό,τι ξέραμε για το παλιό δεν ισχύει
  if (!b || !cur || path.resolve(cur.file) !== path.resolve(b.file) || cur.sheet !== b.sheet || cur.header !== b.header) srcMeta.set(kind, null);
}
async function planOut(kind: ListKind): Promise<WritePreview | { ok: false; error: string }> {
  const b = bindingOf(kind); if (!b) return fail('Δεν έχει οριστεί αρχείο');
  try {
    const exists = fs.existsSync(b.file);
    const book = exists ? await readBook(b.file) : null;
    const sheet = (book && sheetOf(book.sheets, b.sheet)) || { name: b.sheet, rows: [] };
    const m = srcMeta.get(kind);
    if (kind === 'people') {
      if (!book) return fail('Δεν βρέθηκε το ' + b.file);
      const p = planPeopleWrite(sheet, b, store.state, m?.snap || snapFromSheet(sheet, b, store.state.people));
      const lines = describeSets(kind, sheet, b, p.sets);
      return { ok: true, file: b.file, create: false, lines, total: p.changed, foreign: 0, notFound: p.notFound };
    }
    if (!isStatusKind(kind)) return fail(KIND[kind].label + ': διαβάζεται μαζί με το προσωπικό, δεν γράφεται');
    const plan = planWrite(kind, sheet, b, store.state, m?.keys || [], today());
    const lines = describeSets(kind, sheet, b, plan.sets);
    return { ok: true, file: b.file, create: !exists || !book?.sheets.some(x => x.name === b.sheet), lines, total: plan.added + plan.changed + plan.cleared, foreign: plan.foreign, notFound: [] };
  } catch (e) { return fail(e); }
}
// Έντυπο: φύλλα του template και (ΗΚΑΙ) πού βρέθηκαν οι γραμμές και οι στήλες
async function formInfo(f: FormKind, file?: string): Promise<FormInfo | { ok: false; error: string }> {
  if (f === 'check') return { ok: true, file: '', custom: false, sheets: [], sheet: '' };
  try {
    const b = formBinding(f); const src = file || formTpl(f);
    const book = await readBook(src, 120, 40); const names = book.sheets.map(x => x.name);
    const has = (n?: string) => (n && names.includes(n) ? n : undefined);
    const find = (re: RegExp) => book.sheets.find(x => re.test(normGreek(x.name)) || x.rows.slice(0, 12).some(r => (r || []).some(v => typeof v === 'string' && re.test(normGreek(v)))))?.name;
    const keep = !file || (b.file && path.resolve(b.file) === path.resolve(file));
    const custom = !!file || !!b.file;
    if (f === 'hkai') {
      const scored = book.sheets.map(x => ({ x, d: detectHkai(x, store.state.settings.place) })).sort((a, c) => c.d.found - a.d.found);
      const front = (keep && has(b.sheet)) || scored[0]?.x.name || names[0];
      const back = (keep && has(b.sheet2)) || find(/ΑΠΟΦΑΣΕΙΣ|ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|ΦΡΟΥΡΕΣ/) || names.find(n => n !== front) || front;
      const d = detectHkai(book.sheets.find(x => x.name === front)!, store.state.settings.place);
      if (keep && b.cells) d.map = { title: b.cells.title || d.map.title, date: b.cells.date || d.map.date, rows: { ...d.map.rows, ...(b.cells.rows || {}) }, cols: { ...d.map.cols, ...(b.cells.cols || {}) } };
      return { ok: true, file: src, custom, sheets: names, sheet: front, sheet2: back, hkai: d };
    }
    if (f === 'outs') return { ok: true, file: src, custom, sheets: names, sheet: (keep && has(b.sheet)) || find(/ΕΞΟΔΟΥΧ/) || names[0], sheet2: (keep && has(b.sheet2)) || find(/ΠΑΡΑΜΕΝ/) || names[1] || names[0] };
    return { ok: true, file: src, custom, sheets: names, sheet: (keep && has(b.sheet)) || find(/ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ|ΦΡΟΥΡΑ/) || names[0] };
  } catch (e) { return fail(e); }
}
// Ο χρήστης ανοίγει μόνο αρχεία και φακέλους που ξέρει η εφαρμογή (πηγές, templates, έντυπα που βγήκαν)
function knownPath(file: string): boolean {
  const f = path.resolve(file);
  const known = [...Object.values(store.state.settings.sources || {}).map(b => b && b.file), ...Object.values(store.state.settings.forms || {}).map(b => b && b.file), ...readOuts().map(o => o.file)].filter(Boolean).map(x => path.resolve(x as string));
  return known.some(k => k === f || path.dirname(k) === f);
}

let ready = 0;
// Χωρίς δίκτυο και χωρίς άδειες (έρευνα §4.3): ό,τι δεν είναι τοπικό αρχείο δεν φορτώνει
function lockdown() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  if (!DEV) ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/i.test(d.url) }));
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', ev => ev.preventDefault());
    wc.on('will-navigate', ev => ev.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
// Χαλασμένη βάση: προτείνουμε επαναφορά από το πιο πρόσφατο αντίγραφο που περνά τον έλεγχο
async function recover(reason: string): Promise<boolean> {
  const good = listBackups(BACKUPS).find(b => !store.validate(path.join(BACKUPS, b.name)));
  if (!good) return false;
  const r = await dialog.showMessageBox({ type: 'warning', title: 'Γραφείο Ίλης', noLink: true, buttons: ['Επαναφορά', 'Έξοδος'], defaultId: 0, cancelId: 1,
    message: 'Η βάση δεδομένων φαίνεται χαλασμένη.', detail: 'Λεπτομέρεια: ' + reason + '\n\nΕπαναφορά από το αντίγραφο ' + good.name + ';\nΗ χαλασμένη βάση θα κρατηθεί στον φάκελο backups.' });
  if (r.response !== 0) return false;
  const db = path.join(DATA, 'ilh.db');
  fs.mkdirSync(BACKUPS, { recursive: true });
  fs.renameSync(db, path.join(BACKUPS, 'χαλασμένη_' + Date.now() + '.db'));
  fs.copyFileSync(path.join(BACKUPS, good.name), db);
  await store.open();
  store.addAudit({ at: nowHM(), day: today(), text: 'Επαναφορά βάσης από αντίγραφο ' + good.name + ' (η προηγούμενη ήταν χαλασμένη)', files: [], source: 'auto', undoable: false }, null);
  return true;
}

function createWindow() {
  const icon = path.join(__dirname, '..', 'renderer', 'icon.png');   // λογότυπο στη γραμμή εργασιών (στο dev μπορεί να λείπει)
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 600, show: false, title: 'Γραφείο Ίλης', backgroundColor: '#f4f5f0',
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.once('ready-to-show', () => { win!.maximize(); win!.show(); });
  // καμία πλοήγηση ή νέο παράθυρο προς τα έξω
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV && process.env.VITE_URL) win.loadURL(process.env.VITE_URL);
  else win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(DEV ? Menu.buildFromTemplate([{ role: 'viewMenu' }]) : null);
    lockdown();
    store = new Store(DATA, path.join(__dirname, 'sql-wasm.wasm'));
    try { await store.open(); }
    catch (e) {
      if (!(e instanceof CorruptDbError) || !(await recover(String(e.message)))) {
        dialog.showErrorBox('Γραφείο Ίλης', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA); app.quit(); return;
      }
    }
    daily(); setInterval(daily, 10 * 60 * 1000);
    sessionStart = store.audit(1)[0]?.id || 0;
    const meta = readMeta();
    seenUntil = typeof meta.seenAudit === 'number' && meta.seenAudit <= sessionStart ? meta.seenAudit : sessionStart;
    writeMeta({ seenAudit: sessionStart });

    ipcMain.handle('boot', (): Boot => ({ ...snapshot(), dataDir: DATA, outputDir: outputDir(), templatesDir: USER_TPL, version: app.getVersion(), templates: templates(), lastUsb: readMeta().lastUsb || null, seenUntil, sessionStart }));
    const answer = (r: ReturnType<typeof runCmd>): CmdResult => (r.ok ? reply(r.text) : r);
    ipcMain.handle('cmd', (_e, cmd: Command) => answer(runCmd(cmd)));
    ipcMain.handle('sync', () => reply(''));
    ipcMain.handle('undo', (): CmdResult => {
      const last = store.lastUndoable(); if (!last) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      try {
        const prev = store.state;
        store.revert(last.patch); store.markUndone(last.id);
        scheduleAuto(prev, store.state);
        store.addAudit({ at: nowHM(), day: today(), text: 'Αναίρεση: ' + last.text, files: [], source: 'app', undoable: false }, null);
        return reply('Αναιρέθηκε: ' + last.text, true);   // άλλαξε και η παλιά γραμμή (Αναιρέθηκε): όλο το ιστορικό
      } catch (e) { return fail(e); }
    });
    ipcMain.handle('export', (_e, kind: ExportKind, date: ISODate, opts) => exportGuarded(kind, date, opts || {}));
    ipcMain.handle('roster:pick', () => pickRoster());
    ipcMain.handle('roster:apply', (_e, token: string, deactivateMissing: boolean) => {
      const p = pending.get(token); if (!p) return fail('Η εισαγωγή έληξε, διάλεξε ξανά το αρχείο');
      pending.delete(token);
      try { store.backup('πριν-εισαγωγή'); } catch (e) { return fail('Δεν πάρθηκε αντίγραφο ασφαλείας πριν την εισαγωγή: ' + String(e)); }
      const r = runCmd({ t: 'importPeople', rows: p.rows, source: path.basename(p.file), deactivateMissing });
      if (r.ok) afterRoster(p);
      return answer(r);
    });
    // Αρχεία Excel
    srcMeta = new SourceMetaStore(path.join(DATA, 'sources.json'));
    const pickXlsx = async (title: string) => { const res = await dialog.showOpenDialog(win!, { title, filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }], properties: ['openFile'] }); return res.canceled ? null : res.filePaths[0] || null; };
    ipcMain.handle('src:pick', async (_e, kind: ListKind | null) => {
      const file = await pickXlsx(kind ? 'Excel για ' + KIND[kind].label : 'Εισαγωγή Excel'); if (!file) return null;
      try { return await bookOf(file); } catch (e) { return fail(e instanceof OldFormatError ? e.message : e); }
    });
    ipcMain.handle('src:read', async (_e, kind: ListKind) => { const b = bindingOf(kind); if (!b) return fail('Δεν έχει οριστεί αρχείο'); try { return await bookOf(b.file); } catch (e) { return fail(e); } });
    ipcMain.handle('src:save', async (_e, kind: ListKind, b: SourceBinding | null) => {
      try {
        saveBinding(kind, b);
        // προσωπικό: αφετηρία για τις διορθώσεις είναι ό,τι γράφει τώρα το Excel
        // αν η εφαρμογή έχει ήδη τα ίδια με το Excel γράφει μόνη της από εδώ και πέρα· αλλιώς πρώτα «Ενημέρωση Excel» με προεπισκόπηση
        if (b && kind === 'people' && !srcMeta.get('people')) {
          const book = await readBook(b.file); const sh = sheetOf(book.sheets, b.sheet);
          if (sh) { const snap = snapFromSheet(sh, b, store.state.people); srcMeta.set('people', { snap, keys: [], mtime: book.mtime, size: book.size, at: planPeopleWrite(sh, b, store.state, snap).sets.length ? '' : stampNow() }); }
        }
        notify(); return reply('');
      } catch (e) { return fail(e); }
    });
    ipcMain.handle('src:import', (_e, kind: StatusKind, b: SourceBinding, choices: Record<number, number | null>) => importStatuses(kind, b, choices || {}));
    ipcMain.handle('src:people', async (_e, b: SourceBinding) => { const r = await rosterPreview(b.file, b); return r; });
    ipcMain.handle('src:plan', (_e, kind: ListKind) => planOut(kind));
    ipcMain.handle('src:write', async (_e, kind: ListKind) => { const r = await syncOut(kind, false); notify(); return r.ok ? { ok: true, text: r.text, file: r.file } : r; });
    ipcMain.handle('src:new', async (_e, kind: StatusKind) => {
      const res = await dialog.showSaveDialog(win!, { title: 'Νέο Excel για ' + KIND[kind].label, defaultPath: path.join(outputDir(), KIND[kind].title.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx'), filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (res.canceled || !res.filePath) return null;
      if (fs.existsSync(res.filePath)) return fail('Υπάρχει ήδη αρχείο με αυτό το όνομα. Για υπάρχον αρχείο πάτα «Διάλεξε Excel…».');
      saveBinding(kind, defaultBinding(kind, res.filePath));
      const r = await syncOut(kind, false); notify();
      return r.ok ? { ok: true, file: r.file } : r;
    });
    ipcMain.handle('src:status', () => { retryPending(); return statusAll(); });
    ipcMain.handle('form:pick', async (_e, f: FormKind) => { const file = await pickXlsx('Template για ' + f); if (!file) return null; return formInfo(f, file); });
    ipcMain.handle('form:info', (_e, f: FormKind) => formInfo(f));
    ipcMain.handle('form:save', (_e, f: FormKind, b: FormBinding | null) => {
      const forms = { ...(store.state.settings.forms || {}) };
      if (b && Object.values(b).some(v => v !== undefined && v !== '')) forms[f] = b; else delete forms[f];
      const r = runCmd({ t: 'setSettings', settings: { forms }, text: 'έντυπο ' + f + (b?.file ? ': ' + path.basename(b.file) : b?.dir ? ': φάκελος ' + b.dir : ': προεπιλογή') });
      return r.ok ? reply(r.text, false) : r;
    });
    ipcMain.handle('form:dir', async (_e, f: FormKind) => {
      const r = await dialog.showOpenDialog(win!, { title: 'Φάκελος για το έντυπο', defaultPath: formBinding(f).dir || outputDir(), properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0] || null;
    });
    ipcMain.handle('open:path', (_e, file: string) => { if (knownPath(file) && fs.existsSync(file)) return shell.openPath(file); return 'άγνωστο αρχείο'; });
    setInterval(retryPending, 60 * 1000);
    ipcMain.handle('backups:list', () => listBackups(BACKUPS));
    ipcMain.handle('backups:restore', (_e, name: string) => {
      const file = path.join(BACKUPS, path.basename(name));
      const bad = fs.existsSync(file) ? store.validate(file) : 'Δεν βρέθηκε το αντίγραφο';
      if (bad) return { ok: false, error: 'Το αντίγραφο δεν είναι καλό: ' + bad };
      try { store.backup('πριν-επαναφορά'); store.close(); } catch { /* συνεχίζουμε */ }
      fs.copyFileSync(file, path.join(DATA, 'ilh.db'));
      app.relaunch(); app.exit(0);
      return { ok: true };
    });
    ipcMain.handle('diag', (): Diag => ({
      startupMs: ready - T0,
      procs: app.getAppMetrics().map(m => ({ type: m.type, kb: m.memory.workingSetSize, cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10 })),
      gpuDisabled: !!readFlags().disableGpu, versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
      dbKb: Math.round(fs.statSync(path.join(DATA, 'ilh.db')).size / 1024), people: store.state.people.length, statuses: store.state.statuses.length, guardDays: Object.keys(store.state.guards).length,
      dataDir: DATA, backups: listBackups(BACKUPS).length
    }));
    ipcMain.handle('flags:gpu', (_e, disable: boolean) => { fs.writeFileSync(FLAGS, JSON.stringify({ ...readFlags(), disableGpu: !!disable })); app.relaunch(); app.exit(0); });
    // Αντίγραφο σε USB (έρευνα §4.2): αν χαλάσει ο δίσκος του PC, τα δεδομένα είναι αλλού
    ipcMain.handle('usb:copy', async () => {
      const m = readMeta();
      const r = await dialog.showOpenDialog(win!, { title: 'Διάλεξε το USB (ή φάκελο σε άλλο δίσκο)', defaultPath: m.usbDir && fs.existsSync(m.usbDir) ? m.usbDir : undefined, properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const chosen = r.filePaths[0]; const dir = path.join(chosen, USB_DIR);
      try {
        const file = store.backup('usb', dir);
        const bad = store.validate(file);
        if (bad) { fs.rmSync(file, { force: true }); return { ok: false, error: 'Το αντίγραφο δεν γράφτηκε σωστά (' + bad + '). Δοκίμασε άλλο USB.' }; }
        listBackups(dir).slice(USB_KEEP).forEach(b => fs.rmSync(path.join(dir, b.name), { force: true }));
        const day = today(); writeMeta({ lastUsb: day, usbDir: chosen });
        store.addAudit({ at: nowHM(), day, text: 'Αντίγραφο ασφαλείας σε ' + dir, files: [], source: 'app', undoable: false }, null);
        const same = path.parse(path.resolve(chosen)).root.toLowerCase() === path.parse(path.resolve(DATA)).root.toLowerCase();
        return { ok: true, file, day, warning: same ? 'Ο φάκελος είναι στον ίδιο δίσκο με την εφαρμογή. Αν χαλάσει ο δίσκος, χάνεται και το αντίγραφο. Προτίμησε USB.' : undefined };
      } catch (e) { return fail('Δεν γράφτηκε στο ' + chosen + ': ' + (e instanceof Error ? e.message : String(e))); }
    });
    // Φέρνει ένα αντίγραφο από USB στη λίστα αντιγράφων, για να γίνει επαναφορά από εκεί (π.χ. σε καινούργιο PC)
    ipcMain.handle('backups:import', async () => {
      const m = readMeta();
      const r = await dialog.showOpenDialog(win!, { title: 'Διάλεξε αντίγραφο (ilh_….db)', defaultPath: m.usbDir ? path.join(m.usbDir, USB_DIR) : undefined, filters: [{ name: 'Αντίγραφο Γραφείου Ίλης', extensions: ['db'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const src = r.filePaths[0];
      const bad = store.validate(src);
      if (bad) return { ok: false, error: 'Το αρχείο δεν είναι καλό αντίγραφο: ' + bad };
      const d = new Date(); const name = 'ilh_' + today() + '_' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('') + '_από-αρχείο.db';
      fs.mkdirSync(BACKUPS, { recursive: true }); fs.copyFileSync(src, path.join(BACKUPS, name));
      return { ok: true, name };
    });
    ipcMain.handle('backup', () => { try { return { ok: true, file: store.backup('χειροκίνητο') }; } catch (e) { return { ok: false, error: String(e) }; } });
    ipcMain.handle('open', (_e, which: string) => {
      const dir = which === 'output' ? outputDir() : which === 'templates' ? USER_TPL : which === 'backups' ? path.join(DATA, 'backups') : DATA;
      fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir);
    });
    ipcMain.handle('outputDir:choose', async () => {
      const r = await dialog.showOpenDialog(win!, { title: 'Φάκελος για τα Excel', defaultPath: outputDir(), properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      runCmd({ t: 'setSettings', settings: { outputDir: r.filePaths[0] }, text: 'φάκελος αρχείων ' + r.filePaths[0] });
      return r.filePaths[0];
    });
    createWindow();
    ready = Date.now();
  });
  app.on('window-all-closed', () => { try { store?.close(); } catch { /* ήδη κλειστή */ } app.quit(); });
}
