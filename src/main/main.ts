// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './db';
import { copyDurable, dataDirOf, writeAll, writeJson, freeName, LockedError } from './files';
import { preflight, hasErrors } from '../shared/preflight';
import { apply, rosterChanges, type Command } from '../shared/commands';
import { dm, dow, nowHM, pskDays, today, type ISODate } from '../shared/dates';
import { Workbook, mergeFirstSheets } from './xlsx';
import JSZip from 'jszip';
import type { Boot, CmdResult, Diag, DirTarget, EssoArchiveInfo, EssoInfo, EssoResult, EssoStart, ExportKind, ExportResult, FormInfo, FormOut, ImportPreview, SourceBook, SourceStatus, TemplateInfo, WritePreview } from '../shared/api';
import { SourceMetaStore, OldFormatError, holdPatch, bookNow, locateCheck, locateNow, writeGroup, type WriteOutcome, readBook, stamp, valuesHash, syncStamp, syncStampNow, tableState, tidyPreview, writeSource, type SourceMeta } from './sources';
import { parseRoster, type CellValue, type RawSheet, type RosterOverride } from '../shared/roster';
import { FORM_KINDS, KIND, KINDS, colLetter, timeCols, NEW_KINDS, ambiguousLines, dutiesBinding, dutiesSheet, canCreate, STATUS_KINDS, baseOf, bestFor, refitCols, keepHeads, bindingMonth, defaultBinding, describeSets, detectHkai, kindsForPeople, detectTables, diffStatuses, hkaiMapOf, inRoster, isStatusKind, parseStatuses, planPeopleWrite, planSource, snapFromSheet, snapPeople, rowName, stepRows, withRows,
  tableHash, type FormBinding, type FormKind, type ListKind, type SourceBinding, type StatusKind } from '../shared/sources';
import { normGreek } from '../shared/text';
import { fillFroura, fillHkai, fillOuts, TemplateError } from './exports';
import { previewHtml, renderBook } from './print';
import type { ImportRow } from '../shared/commands';
import type { AppState, AuditEntry } from '../shared/domain';
import { ESSO_SERIES, currentEsso, essoName, freshState, parseEsso, restoredPath } from '../shared/esso';
import { SOURCES_FILE, listArchives, readArchive, writeArchive } from './esso';

const DEV = !app.isPackaged;
const ROOT = DEV ? process.cwd() : path.dirname(process.execPath);
const BUNDLED = DEV ? process.cwd() : path.join(process.resourcesPath, 'app');

// Φορητή εγκατάσταση: τα δεδομένα δίπλα στο .exe αν ο φάκελος γράφεται, αλλιώς στο προφίλ του χρήστη
function writableDir(dir: string): boolean {
  try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, '.w'); fs.writeFileSync(t, ''); fs.unlinkSync(t); return true; } catch { return false; }
}
// Το όνομα άλλαξε σε «Γραφείο Λοχία» (11/10). Το προφίλ μένει στον παλιό φάκελο για να βρίσκει τα δεδομένα και τις προτιμήσεις.
app.setPath('userData', path.join(app.getPath('appData'), 'Γραφείο Ίλης'));
// Όπου υπάρχει ήδη η βάση (πρώτα δίπλα στο exe): μια στιγμιαία αποτυχία του ελέγχου εγγραφής δεν χωρίζει πια τα δεδομένα στα δύο
const DATA_AT = dataDirOf(path.join(ROOT, 'data'), path.join(app.getPath('userData'), 'data'), writableDir);
const DATA = DATA_AT.dir;
const BACKUPS = path.join(DATA, 'backups');
const T0 = Date.now();
// Διακόπτης GPU (έρευνα §5.6): σε παλιές κάρτες γραφικών με Windows 7 η επιτάχυνση μπορεί να κοστίζει μνήμη ή να δίνει μαύρη οθόνη.
// Αλλάζει από την οθόνη «Διάγνωση» και ισχύει στην επόμενη εκκίνηση.
const FLAGS = path.join(DATA, 'flags.json');
const readFlags = (): { disableGpu?: boolean } => { try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); } catch { return {}; } };
// Μικρά στοιχεία που δεν ανήκουν στη βάση (για να μη χάνονται με μια επαναφορά): τελευταίο αντίγραφο σε USB, ως πού είδε ο χρήστης το ιστορικό
const META = path.join(DATA, 'meta.json');
type Meta = { lastUsb?: string; usbDir?: string; seenAudit?: number; essoArchives?: string[] };   // essoArchives: φάκελοι αρχείων ΕΣΣΟ που γράφτηκαν
const readMeta = (): Meta => { try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch { return {}; } };
const writeMeta = (m: Partial<Meta>) => { try { writeJson(META, { ...readMeta(), ...m }); } catch (e) { console.error('meta', e); } };
const USB_DIR = 'Γραφείο Ίλης αντίγραφα';
const USB_KEEP = 10;
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
// Ελληνικά για το Chromium: τα πεδία ημερομηνίας δείχνουν ημέρα/μήνα/έτος και σε Windows με αγγλικές ρυθμίσεις (αλλιώς μήνας/ημέρα)
app.commandLine.appendSwitch('lang', 'el');
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
const formDir = (f: FormKind, date: ISODate) => { const b = formBinding(f); const dir = b.dir || outputDir(); return b.monthly === false ? dir : path.join(dir, date.slice(0, 7)); };
// Νέα Excel ανά είδος: στον φάκελο του είδους (Ρυθμίσεις → Φάκελοι), αλλιώς στον γενικό
const newDir = (k: ListKind) => store.state.settings.newDirs?.[k] || outputDir();
const dirOf = (t: DirTarget) => (t === 'output' ? outputDir() : 'form' in t ? formBinding(t.form).dir || outputDir() : newDir(t.kind));
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
    // μία εγγραφή της βάσης στον δίσκο ανά ενέργεια, όχι μία ανά γραμμή ιστορικού· αν δεν γραφτεί, γυρίζουν όλα πίσω
    store.transact(() => {
      if (changed) {
        const patch = store.commit(r.state);
        const undoable = r.undoable !== false;
        if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable }, undoable ? patch : null, false);
      } else if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable: false }, null, false);
      for (const t of r.extra || []) store.addAudit({ at: nowHM(), day: today(), text: t, files: [], source: 'auto', undoable: false }, null, false);
    }, !!(changed || r.text || r.extra?.length));
    if (changed) scheduleAuto(prev, store.state);
    return { ok: true, text: r.text };
  } catch (e) { return fail(e); }
}

// Κάθε μέρα: όσα ιατρικά/ποινές έληξαν χθες γράφονται στο ιστορικό (Κ-04, Κ-10), και ένα αντίγραφο της βάσης
function daily() {
  const d = today();
  if (store.state.statuses.some(x => x.open && x.to < d)) runCmd({ t: 'extendOpen' });
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
async function exportGuarded(kind: ExportKind, date: ISODate, opts: { open?: boolean; ack?: boolean; print?: boolean }): Promise<ExportResult> {
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

// Ένα γράψιμο αρχείων τη φορά: η αυτόματη ενημέρωση, το «Ενημέρωση Excel» και η εξαγωγή εντύπου δεν διαβάζουν και
// γράφουν το ίδιο Excel ή το forms.json ταυτόχρονα (αλλιώς χάνεται ό,τι έγραψε ο ένας)
let ioChain: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const p = ioChain.then(f, f); ioChain = p.catch(() => undefined); return p;
}

async function exportFile(kind: ExportKind, date: ISODate, opts: { open?: boolean; ack?: boolean; print?: boolean }): Promise<ExportResult> {
  try {
    const s = store.state;
    // Προέλεγχος: με ✕ δεν βγαίνει έντυπο, με ⚠ χρειάζεται επιβεβαίωση που γράφεται στο ιστορικό
    const checks = preflight(kind, s, date);
    if (hasErrors(checks)) return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη που πρέπει να διορθωθούν πρώτα', checks };
    if (checks.length && !opts.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
    const { r, out } = await serial(async () => {
      const r = await produce(kind, date, s);
      const [out] = await writeAll([{ dir: formDir(formOf(kind, s), date), name: r.name, data: r.data }]);
      rememberOut({ form: formOf(kind, s), kind, date, file: out, at: nowHM(), hash: await zipHash(r.data), vhash: await valuesHash(r.data), ...(stamp(out) || {}) });
      return { r, out };
    });
    for (const d of kind === 'frouraPsk' || kind === 'outsPsk' ? pskDays(date) : [date]) runCmd({ t: 'printed', date: d, at: nowHM(), files: [path.basename(out)] });
    for (const c of checks) store.addAudit({ at: nowHM(), day: today(), text: 'Βγήκε ' + path.basename(out) + ' με προειδοποίηση: ' + c.text, files: [], source: 'app', undoable: false }, null, false);
    if (checks.length) store.flush();
    const warnings = r.warnings || [];
    // «Εκτύπωση»: το Excel γράφεται όπως πάντα και ανοίγει η προεπισκόπηση εκτύπωσης αντί για τον Excel
    if (opts.print) { const p = await printPreview(out); if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error); }
    else if (opts.open) shell.openPath(out);
    return { ok: true, file: out, warnings };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    if (e instanceof TemplateError) return { ok: false, error: e.message, checks: [{ level: 'err', text: e.message }] };
    return fail(e);
  }
}

// ------------------------------------------------------------------ Excel που έχουν ήδη βγει: ενημερώνονται μόνα τους
// Κάθε έντυπο που βγήκε για σήμερα ή επόμενη μέρα ξαναγράφεται όταν αλλάξει κάτι στην εφαρμογή (Michael, 11/10).
// Αν δεν άλλαξε το περιεχόμενο δεν αγγίζεται· αν είναι ανοιχτό στο Excel ή ο προέλεγχος βρίσκει λάθος, περιμένει.
// vhash, mtime, size: τι έγραψε η εφαρμογή, για να φαίνεται αν ο χρήστης το άλλαξε μετά με το χέρι
type OutRec = FormOut & { kind: ExportKind; hash: string; vhash?: string; mtime?: number; size?: number };
const OUTS_FILE = path.join(DATA, 'forms.json');
const readOuts = (): OutRec[] => { try { return JSON.parse(fs.readFileSync(OUTS_FILE, 'utf8')); } catch { return []; } };
const writeOuts = (l: OutRec[]) => { try { writeJson(OUTS_FILE, l); } catch (e) { console.error('forms.json', e); } };
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
const regenForms = () => serial(regenFormsNow);
async function regenFormsNow(): Promise<boolean> {
  const t = today(); const list = readOuts().filter(o => lastDay(o) >= t); let any = false;
  for (const o of list) {
    if (!fs.existsSync(o.file)) { o.error = undefined; o.pending = false; continue; }   // το έσβησε ο χρήστης: δεν το ξαναφτιάχνουμε
    if (o.manual) continue;
    try {
      // Το διόρθωσε ο χρήστης με το χέρι στο Excel: δεν το πατάμε. Ξαναβγαίνει μόνο με το κουμπί της εφαρμογής.
      const st = stamp(o.file);
      if (st && o.vhash && (st.mtime !== o.mtime || st.size !== o.size)) {
        if ((await valuesHash(await fs.promises.readFile(o.file))) !== o.vhash) { o.manual = true; o.pending = false; o.error = 'Το άλλαξες με το χέρι στο Excel, οπότε δεν ξαναγράφεται μόνο του. Αν θες τα νέα στοιχεία της εφαρμογής, βγάλ\' το ξανά από την εφαρμογή.'; continue; }
        o.mtime = st.mtime; o.size = st.size;   // απλώς ανοίχτηκε και σώθηκε: ίδιες τιμές
      }
      const s = store.state;
      const errs = preflight(o.kind, s, o.date).filter(c => c.level === 'err');
      if (errs.length) { o.pending = true; o.error = 'Ο προέλεγχος βρήκε λάθος: ' + errs[0].text; continue; }
      const r = await produce(o.kind, o.date, s); const h = await zipHash(r.data);
      if (h === o.hash) { o.pending = false; o.error = undefined; continue; }
      await writeAll([{ dir: path.dirname(o.file), name: path.basename(o.file), data: r.data }]);
      o.hash = h; o.vhash = await valuesHash(r.data); Object.assign(o, stamp(o.file) || {}); o.at = nowHM(); o.pending = false; o.error = undefined; any = true;
      store.addAudit({ at: nowHM(), day: t, text: 'Ενημερώθηκε μόνο του το ' + path.basename(o.file) + ' (άλλαξαν δεδομένα)', files: [path.basename(o.file)], source: 'auto', undoable: false }, null, false);
    } catch (e) { o.pending = true; o.error = e instanceof Error ? e.message : String(e); }
  }
  writeOuts(list);
  if (any) store.flush();
  return any;
}

// ------------------------------------------------------------------ Αρχεία Excel (πηγές ανά είδος)
const srcMeta = new SourceMetaStore(path.join(DATA, 'sources.json'));
const bindingOf = (k: ListKind): SourceBinding | undefined => store.state.settings.sources?.[k];
const stampNow = () => today() + ' ' + nowHM();
const ovOf = (b?: SourceBinding, file?: string): RosterOverride | undefined => (b && (!file || path.resolve(b.file) === path.resolve(file)) ? { sheet: b.sheet, header: b.header, cols: b.cols } : undefined);
// Ο πίνακας μετακινήθηκε μέσα στο φύλλο (γραμμές από πάνω, από το Excel ή από εγγραφή της εφαρμογής σε άλλο πίνακα του
// ίδιου φύλλου): η αντιστοίχιση ακολουθεί. Δεν είναι ενέργεια του χρήστη, οπότε δεν μπαίνει στην αναίρεση.
// Το ίδιο για στήλες που μετακινήθηκαν ή προστέθηκαν (b.cols, από το refitCols).
function moveBinding(kind: ListKind, b: SourceBinding, colsText?: string) {
  const cur = bindingOf(kind); if (!cur) return;
  const row = cur.header !== b.header, cols = !!b.cols && JSON.stringify(cur.cols) !== JSON.stringify(b.cols), heads = !!b.heads && JSON.stringify(cur.heads || null) !== JSON.stringify(b.heads);
  if (!row && !cols && !heads) return;
  store.commit({ ...store.state, settings: { ...store.state.settings, sources: { ...(store.state.settings.sources || {}), [kind]: { ...cur, header: b.header, cols: cols ? b.cols : cur.cols, ...(b.heads ? { heads: b.heads } : {}) } } } });
  const lbl = 'Excel ' + KIND[kind].label.toLowerCase() + ': ';
  if (row) store.addAudit({ at: nowHM(), day: today(), text: lbl + 'ο πίνακας είναι πια στη γραμμή ' + (b.header + 1) + ' του φύλλου «' + b.sheet + '» (άλλαξαν γραμμές από πάνω)', files: [], source: 'auto', undoable: false }, null);
  if (cols && colsText) store.addAudit({ at: nowHM(), day: today(), text: lbl + colsText, files: [], source: 'auto', undoable: false }, null);
  else if (cols) store.addAudit({ at: nowHM(), day: today(), text: lbl + 'οι στήλες ακολούθησαν τις επικεφαλίδες τους στο φύλλο «' + b.sheet + '» (μπήκε ή μετακινήθηκε στήλη)', files: [], source: 'auto', undoable: false }, null);
}
const sameTable = (a?: SourceBinding, b?: SourceBinding) => !!a && !!b && path.resolve(a.file) === path.resolve(b.file) && a.sheet === b.sheet && a.header === b.header;
// Η αντιστοίχιση ενός είδους όπως είναι τώρα στο αρχείο
async function current(kind: ListKind, b = bindingOf(kind)): Promise<SourceBinding | undefined> {
  if (!b) return b;
  const nb = await locateNow(kind, b);
  if (nb !== b && sameTable(bindingOf(kind), b)) moveBinding(kind, nb);
  return nb;
}
const autoReading = new Set<ListKind>();
async function sourceStatus(): Promise<SourceStatus[]> {
  const metas = srcMeta.all(); const out: SourceStatus[] = [];
  for (const [kind, b0] of Object.entries(store.state.settings.sources || {}) as [ListKind, SourceBinding][]) {
    if (!b0) continue;
    // πρώτα πού είναι τώρα ο πίνακας και οι στήλες του (νέα στήλη στο Excel): αλλιώς η αυτόματη ανάγνωση θα έπαιρνε
    // τιμές από λάθος στήλες. Αν δεν βρίσκονται με σιγουριά, το είδος περιμένει αντιστοίχιση.
    const loc = await locateCheck(kind, b0);
    if (loc.b !== b0) moveBinding(kind, loc.b);
    const b = bindingOf(kind) || loc.b;
    let m = metas[kind]; let t = await tableState(b, m, kind);
    if (t.header != null) moveBinding(kind, { ...b, header: t.header });
    if (t.refresh) srcMeta.set(kind, t.refresh);
    // απλές αλλαγές στο Excel περνούν μόνες τους (με αναίρεση που δεν πειράζει το Excel)
    if (t.changed && t.exists && !loc.need && isStatusKind(kind) && b.autoRead !== false && m?.at && !m.hold && !autoReading.has(kind)) {
      autoReading.add(kind);
      try {
        const cur = bindingOf(kind) || b;
        if ((await importStatuses(kind, cur, {}, false, [], true)).ok) { m = srcMeta.get(kind); t = await tableState(cur, m, kind); }
      } finally { autoReading.delete(kind); }
    }
    // έλεγχος υπηρεσιών: ο μήνας του φύλλου, για την υπενθύμιση όταν αλλάζει ο μήνας
    let month: string | undefined;
    if (kind === 'duties' && t.exists) { try { const sh = (await bookNow(b.file))?.sheets.find(x => x.name === b.sheet); month = (sh && bindingMonth(sh, bindingOf(kind) || b, today())) || undefined; } catch { /* ξανά αργότερα */ } }
    out.push({ kind, file: b.file, exists: t.exists, synced: !!m?.at, changed: t.changed, at: m?.at || '', error: m?.error, locked: m?.locked, pending: m?.pending, hold: m?.hold, month, ...(loc.need ? { remap: loc.need } : {}) });
  }
  return out;
}
const statusAll = async () => ({ sources: await sourceStatus(), forms: readOuts().filter(o => lastDay(o) >= today()).map(({ form, date, file, at, error, pending, manual }) => ({ form, date, file, at, error, pending, manual })) });
const notify = () => { statusAll().then(st => { try { win?.webContents.send('sources', st); } catch { /* παράθυρο κλειστό */ } }, e => console.error('sources status', e)); };
async function bookOf(file: string): Promise<SourceBook> {
  const r = await readBook(file);
  return { ok: true, file, name: path.basename(file), mtime: r.mtime, size: r.size, sheets: r.sheets.map(x => ({ name: x.name, rows: x.rows.slice(0, 1000) })), hits: detectTables(r.sheets) };
}
const sheetOf = (sheets: RawSheet[], name: string) => sheets.find(x => x.name === name);
// Η μορφή που μπήκε, σύντομα (για το Ιστορικό)
const tidyWhat = (t: string[]) => [t.some(x => x.startsWith('Ο τίτλος')) && 'τίτλος στο κέντρο', t.some(x => x.startsWith('Λίστα')) && 'λίστες επιλογής'].filter(Boolean).join(' και ');
function writeText(kind: ListKind, file: string, r: { added: number; changed: number; cleared: number; notFound: string[]; warn?: string[]; created: boolean; rooms?: { n: number; added: number; placed?: number; sheet: string }; tidy?: string[] }, b: SourceBinding) {
  const parts = [r.created && 'φτιάχτηκε', r.added && r.added + (kind === 'people' ? (r.added === 1 ? ' νέος στρατιώτης' : ' νέοι στρατιώτες') : r.added === 1 ? ' νέα' : ' νέες'), r.changed && r.changed + (r.changed === 1 ? ' αλλαγή' : ' αλλαγές'), r.cleared && r.cleared + ' σβήστηκαν', r.tidy?.length && 'μορφή: ' + tidyWhat(r.tidy)].filter(Boolean).join(', ');
  return 'Excel ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(file) + ' › ' + b.sheet + (parts ? ' (' + parts + ')' : '') + (r.notFound.length ? '. Δεν βρέθηκαν στο φύλλο: ' + r.notFound.slice(0, 5).join(', ') : '')
    + (r.warn?.length ? '. ' + r.warn.join(' ') : '')
    + (r.rooms?.n ? '. Άλλαξε θάλαμος σε ' + (r.rooms.n === 1 ? '1 άτομο' : r.rooms.n + ' άτομα') + ': μετακίνησέ ' + (r.rooms.n === 1 ? 'τον' : 'τους') + ' και στο φύλλο ' + r.rooms.sheet + ' (δεν ενημερώνεται μόνο του)' : '')
    + (r.rooms?.placed ? '. ' + (r.rooms.placed === 1 ? 'Ο νέος γράφτηκε' : 'Οι ' + r.rooms.placed + ' νέοι γράφτηκαν') + ' και στο φύλλο ' + r.rooms.sheet + ', στον θάλαμό ' + (r.rooms.placed === 1 ? 'του' : 'τους') : '')
    + (r.rooms?.added ? '. ' + (r.rooms.added === 1 ? 'Νέος στρατιώτης: γράψ\' τον' : r.rooms.added + ' νέοι στρατιώτες: γράψ\' τους') + ' και στο φύλλο ' + r.rooms.sheet + ', στον θάλαμό ' + (r.rooms.added === 1 ? 'του' : 'τους') + ' (δεν ενημερώνεται μόνο του)' : '');
}
// Γράφει ένα είδος στο Excel του. auto: μόνο αν έχει ξαναγραφτεί/διαβαστεί και το αρχείο δεν άλλαξε από τότε.
type SyncOut = { ok: true; text: string; file: string; unchanged: boolean } | { ok: false; error: string; locked?: boolean };
const syncOut = (kind: ListKind, auto: boolean, create = false): Promise<SyncOut> => serial(() => syncOutNow(kind, auto, create));
// Πριν από αυτόματη εγγραφή: γράφει μόνη της εδώ; πού είναι τώρα ο πίνακας και οι στήλες του· άλλαξε εκτός εφαρμογής;
// Επιστρέφει την αντιστοίχιση για την εγγραφή, ή το αποτέλεσμα αν δεν γράφεται τώρα.
async function autoCheck(kind: ListKind): Promise<{ b: SourceBinding; m?: SourceMeta } | SyncOut> {
  let b = bindingOf(kind); if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο για ' + KIND[kind].label };
  const m = srcMeta.get(kind);
  if (b.write === false || !m?.at || m.hold) return { ok: true, text: '', file: b.file, unchanged: true };
  // οι στήλες όπως είναι τώρα (όπως στην «Ενημέρωση Excel»)· χωρίς σίγουρη αντιστοίχιση δεν γράφει μόνη της
  const loc = await locateCheck(kind, b);
  if (loc.b !== b) { moveBinding(kind, loc.b); b = bindingOf(kind) || loc.b; }
  if (loc.need) return { ok: false, error: 'Περιμένει αντιστοίχιση: ' + loc.need };
  const t = await tableState(b, m, kind);
  if (t.header != null) { moveBinding(kind, { ...b, header: t.header }); b = bindingOf(kind)!; }
  if (t.refresh) srcMeta.set(kind, t.refresh);
  if (t.changed) { srcMeta.set(kind, { pending: true, error: 'Το αρχείο άλλαξε εκτός εφαρμογής. Πάτα «Ανανέωση από Excel» και μετά «Ενημέρωση Excel».' }); return { ok: false, error: 'changed' }; }
  return { b, m };
}
// Μετά την εγγραφή ενός είδους: νέα αντιστοίχιση (στήλες ωρών, πίνακας που κατέβηκε), τι ξέρουμε για το αρχείο, Ιστορικό
function afterWrite(kind: ListKind, b: SourceBinding, r: WriteOutcome): SyncOut {
  if (!r.ok) { srcMeta.set(kind, { pending: true, error: r.error, locked: !!r.locked }); return r; }
  if (r.binding) { moveBinding(kind, r.binding, r.timeCols ? 'μπήκαν στήλες ' + KIND[kind].fields.filter(f => f.k === 'tout' || f.k === 'tin').map(f => '«' + f.head + '»').join(' και ') + ' στο φύλλο «' + b.sheet + '» (' + (kind === 'leave' ? 'άδειες' : 'εγγραφές') + ' με ώρα)' : undefined); b = bindingOf(kind) || r.binding; }
  srcMeta.set(kind, { ...r.meta, ...(isStatusKind(kind) ? { base: baseOf(kind, store.state, r.meta.keys || []) } : {}), at: stampNow(), pending: false, error: undefined, locked: false, hold: undefined });
  if (r.unchanged) return { ok: true, text: 'Το ' + path.basename(r.file) + ' είχε ήδη τα ίδια', file: r.file, unchanged: true };
  const text = writeText(kind, r.file, r, b);
  store.addAudit({ at: nowHM(), day: today(), text, files: [path.basename(r.file)], source: 'excel', undoable: false }, null);
  return { ok: true, text, file: r.file, unchanged: false };
}
async function syncOutNow(kind: ListKind, auto: boolean, create = false): Promise<SyncOut> {
  let b = bindingOf(kind); if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο για ' + KIND[kind].label };
  let m = srcMeta.get(kind);
  if (auto) { const c = await autoCheck(kind); if ('ok' in c) return c; b = c.b; m = c.m; }
  else b = (await current(kind, b))!;
  return afterWrite(kind, b, await writeSource(kind, b, store.state, m, today(), { tidy: !auto, create }));
}
// Αυτόματη εγγραφή όλων των ειδών ενός αρχείου μαζί (P2): ένα άνοιγμα και μία αποθήκευση, όχι μία ανά είδος
async function syncFileAuto(kinds: ListKind[]) {
  const jobs: { kind: ListKind; b: SourceBinding; meta?: SourceMeta }[] = [];
  for (const k of kinds) { const c = await autoCheck(k); if (!('ok' in c)) jobs.push({ kind: k, b: c.b, meta: c.m }); }
  if (!jobs.length) return;
  const rs = await writeGroup(jobs, store.state, today(), { tidy: false });
  jobs.forEach((j, i) => afterWrite(j.kind, j.b, rs[i]));
}
// Μετά από κάθε αλλαγή: τα είδη που άλλαξαν γράφονται στα Excel τους και τα έντυπα που έχουν βγει ενημερώνονται
const dirty = new Set<ListKind>(); let formsDirty = false; let autoTimer: NodeJS.Timeout | undefined; let autoBusy = false;
// Ποια είδη αφορά μια αλλαγή: ό,τι αλλάζει στα άτομα (βαθμός, θάλαμος, πόστο…) γράφεται στα φύλλα που έχουν στήλη γι' αυτό
function kindsOf(prev: AppState, next: AppState): Set<ListKind> {
  const out = new Set<ListKind>();
  if (prev.people !== next.people) kindsForPeople(prev.people, next.people, next.settings.sources || {}).forEach(k => out.add(k));
  if (prev.statuses !== next.statuses) STATUS_KINDS.forEach(k => out.add(k));
  if (prev.caps !== next.caps) out.add('caps');
  if (prev.guards !== next.guards || prev.dutyLog !== next.dutyLog) out.add('duties');
  return out;
}
// toExcel=false: μόνο τα έντυπα (π.χ. μετά από αναίρεση ανάγνωσης από Excel, που δεν πρέπει να γράψει πίσω στο Excel)
function scheduleAuto(prev: AppState, next: AppState, toExcel = true) {
  if (prev === next) return;
  if (toExcel) kindsOf(prev, next).forEach(k => dirty.add(k));
  // τα έντυπα δεν χρησιμοποιούν δυνατότητες ούτε το «βγήκε στις…»: χωρίς αυτά δεν ξαναπαράγονται
  if ((Object.keys(next) as (keyof AppState)[]).some(k => k !== 'printed' && k !== 'caps' && k !== 'lastExpire' && prev[k] !== next[k])) formsDirty = true;
  if (!dirty.size && !formsDirty) return;
  clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1200);
}
// Είδη που δεν γράφονται μόνα τους μέχρι νέα ανάγνωση ή «Ενημέρωση Excel»: το Excel ξέρει πράγματα που η εφαρμογή έχασε
const HOLD_UNDO = 'Αναιρέθηκε μια ανάγνωση από αυτό το Excel και το Excel δεν άλλαξε. Η εφαρμογή δεν γράφει εδώ μόνη της μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel» (με προεπισκόπηση).';
const HOLD_RESTORE = 'Έγινε επαναφορά της βάσης από αντίγραφο, οπότε το Excel μπορεί να έχει νεότερα στοιχεία. Η εφαρμογή δεν γράφει εδώ μόνη της μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel» (με προεπισκόπηση).';
function hold(kinds: Iterable<ListKind>, why: string) {
  for (const k of kinds) { if (!bindingOf(k) || !srcMeta.get(k)?.at) continue; dirty.delete(k); srcMeta.set(k, holdPatch(k, why)); }
}
const holdAll = (why: string) => hold(KINDS.map(k => k.id), why);
async function runAuto() {
  if (autoBusy) { clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1500); return; }
  autoBusy = true;
  try {
    // ανά αρχείο: όλα τα είδη του (π.χ. τα φύλλα του Δυναμολογίου) μαζί
    const byFile = new Map<string, ListKind[]>();
    for (const k of [...dirty]) { dirty.delete(k); const b = bindingOf(k); if (!b) continue; const f = path.resolve(b.file); byFile.set(f, [...(byFile.get(f) || []), k]); }
    for (const ks of byFile.values()) await serial(() => syncFileAuto(ks));
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
    if (b) b = refitCols('people', sheetOf(book.sheets, b.sheet), b);
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
    pending.clear();   // μία προεπισκόπηση τη φορά: όσες ακυρώθηκαν δεν κρατούν το φύλλο στη μνήμη
    pending.set(token, { rows: r.rows, file, binding: det, stamp: { mtime: book.mtime, size: book.size }, sheet: det ? sheetOf(book.sheets, det.sheet) || null : null });
    return { ok: true, token, file: path.basename(file), total: r.rows.length, active: r.rows.filter(x => x.active !== false).length, added, updated: r.rows.length - added, missing, warnings: r.warnings, essos: r.essos, skipped: r.skipped, declared: r.declared, found: r.found, suspicious: r.suspicious, ...rosterChanges(store.state, r.rows) };
  } catch (e) { return fail(e); }
}
async function pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null> {
  const res = await dialog.showOpenDialog(win!, { title: 'Δυναμολόγιο', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] });
  if (res.canceled || !res.filePaths[0]) return null;
  srcMeta.allow([res.filePaths[0]]);
  const cur = bindingOf('people');
  return rosterPreview(res.filePaths[0], cur && path.resolve(cur.file) === path.resolve(res.filePaths[0]) ? cur : null);
}
// Μετά την εισαγωγή: το αρχείο γίνεται η πηγή του προσωπικού (αν δεν υπάρχει άλλη) και κρατιέται τι γράφει το καθένα
function afterRoster(p: { file: string; binding: SourceBinding | null; stamp: { mtime: number; size: number }; sheet: RawSheet | null }) {
  if (!p.binding || !p.sheet) return;
  const cur = bindingOf('people');
  if (cur && path.resolve(cur.file) !== path.resolve(p.file)) return;
  if (!cur || cur.sheet !== p.binding.sheet || cur.header !== p.binding.header || JSON.stringify(cur.cols) !== JSON.stringify(p.binding.cols)) runCmd({ t: 'setSettings', settings: { sources: { ...(store.state.settings.sources || {}), people: { ...p.binding, write: cur ? cur.write : true } } }, text: 'πηγή προσωπικού ' + path.basename(p.file) + ' › ' + p.binding.sheet });
  srcMeta.set('people', { snap: snapFromSheet(p.sheet, p.binding, store.state.people), keys: [], mtime: p.stamp.mtime, size: p.stamp.size, hash: tableHash(p.sheet, p.binding), at: stampNow(), pending: false, error: undefined, locked: false, hold: undefined });
  // πόστα και εκτός δύναμης του ίδιου αρχείου διαβάστηκαν μαζί
  const linked = (['posts', 'outside'] as ListKind[]).filter(k => { const x = bindingOf(k); return x && path.resolve(x.file) === path.resolve(p.file); });
  Promise.all(linked.map(k => markSynced(k, bindingOf(k)!))).then(notify, e => console.error('roster linked', e));
  notify();
}

// Διάβασμα ενός είδους από το Excel του (καταστάσεις): νέες εγγραφές και αλλαγές μπαίνουν στην εφαρμογή
// auto: από τον έλεγχο αλλαγών, χωρίς προεπισκόπηση. Περνά μόνο αν είναι απλό: νέες εγγραφές ή αλλαγές, όλα τα άτομα
// γνωστά, τίποτα σβησμένο, διπλό, με άγνωστο είδος ή λάθος ημερομηνία, και τίποτα που άλλαξε και στην εφαρμογή.
async function importStatuses(kind: StatusKind, b: SourceBinding, choices: Record<number, number | null>, keepRemoved = false, keepApp: string[] = [], auto = false): Promise<CmdResult> {
  try {
    const book = await readBook(b.file); const sheet = sheetOf(book.sheets, b.sheet);
    if (!sheet) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const parsed = parseStatuses(kind, sheet, b, store.state.people, today(), store.state.settings.lists);
    const d = diffStatuses(kind, store.state, parsed, b, choices, keysOf(kind, b), baseFor(kind, b));
    if (auto && (parsed.unknown.length || parsed.skipped.length || d.unmatched.length || d.dup.length || d.removed.length || d.update.some(u => u.conflict) || d.add.some(a => a.open) || d.update.some(u => u.patch.open) || !(d.add.length + d.update.length))) return fail('όχι απλό');
    saveBinding(kind, b);
    // άλλαξαν και στις δύο πλευρές και ο χρήστης κράτησε της εφαρμογής: δεν περνούν, και γράφονται μετά στο Excel
    const kept = new Set(keepApp);
    const r = runCmd({ t: 'importRecords', adds: d.add, updates: d.update.filter(u => !kept.has(u.id)).map(u => ({ id: u.id, patch: u.patch })), deletes: keepRemoved ? [] : d.removed.map(x => x.id), source: path.basename(b.file), what: KIND[kind].label.toLowerCase() + (auto ? ' (αυτόματα, χωρίς προεπισκόπηση)' : '') });
    if (!r.ok) return r;
    srcMeta.set(kind, { keys: d.keys, base: baseOf(kind, store.state, d.keys), ...syncStamp(b, book), psnap: snapPeople(store.state.people), at: stampNow(), pending: false, error: undefined, locked: false, hold: undefined });
    // ό,τι έχει η εφαρμογή και λείπει από το Excel (ή κράτησε ο χρήστης από την εφαρμογή) γράφεται αμέσως μετά (αν το είδος γράφει μόνο του)
    if (b.write !== false && (d.appOnly.length || d.kept.length || kept.size)) { dirty.add(kind); clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1200); }
    notify();
    // αυτόματα (από τον έλεγχο αλλαγών): η απάντηση δεν φτάνει στο UI, οπότε δεν σημειώνουμε τις αλλαγές ως σταλμένες.
    // Τις φέρνει το sync() που κάνει το UI μόλις πάρει την κατάσταση των αρχείων.
    if (auto) return { ok: true, changes: {}, newAudit: [], text: r.text || '' };
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) { return fail(e); }
}
// Μετά από ανάγνωση: πότε, τι αποτύπωμα είχε ο πίνακας και τι στοιχεία είχαν τα άτομα (για να περνούν μετά οι αλλαγές τους)
async function markSynced(kind: ListKind, b: SourceBinding, extra: Partial<SourceMeta> = {}) {
  srcMeta.set(kind, { ...(await syncStampNow(b)), psnap: snapPeople(store.state.people), at: stampNow(), pending: false, error: undefined, locked: false, hold: undefined, ...extra });
}
const SHEET_CMDS: Partial<Record<ListKind, Command['t']>> = { posts: 'setPeopleFields', outside: 'setPeopleFields', caps: 'importCaps', duties: 'importDuties' };
// keys (έλεγχος υπηρεσιών): «μέρα|άτομο» του Excel που είδε πια η εφαρμογή· μόνο αυτά σβήνει μετά η εγγραφή
async function applySheet(kind: ListKind, b: SourceBinding, cmd: Command, keys: string[] = []): Promise<CmdResult> {
  if (SHEET_CMDS[kind] !== cmd.t) return fail('Λάθος είδος εισαγωγής');
  try {
    saveBinding(kind, b);
    const r = runCmd(cmd); if (!r.ok) return r;
    await markSynced(kind, b, kind === 'duties' ? { keys: [...new Set(keys.map(String))] } : {});
    dirty.add(kind); clearTimeout(autoTimer); autoTimer = setTimeout(runAuto, 1200);
    notify();
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) { return fail(e); }
}
// οι εγγραφές που είχε το Excel στην προηγούμενη ανάγνωση/εγγραφή (μόνο αν είναι ο ίδιος πίνακας)
function keysOf(kind: ListKind, b: SourceBinding): string[] {
  return sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.keys || [] : [];
}
const baseFor = (kind: ListKind, b: SourceBinding): Record<string, string> => (sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.base || {} : {});
function saveBinding(kind: ListKind, b0: SourceBinding | null) {
  const cur = bindingOf(kind);
  const b = b0 && keepHeads(b0, cur);   // οι επικεφαλίδες των στηλών (heads) μένουν μόνο αν ο πίνακας και οι στήλες δεν άλλαξαν· αλλιώς ξαναμπαίνουν στην επόμενη ανάγνωση
  if (b) srcMeta.allow([b.file]);   // αρχείο που όρισε ή έφτιαξε ο ίδιος ο main
  if (JSON.stringify(cur || null) === JSON.stringify(b)) return;
  const sources = { ...(store.state.settings.sources || {}) };
  if (b) sources[kind] = b; else delete sources[kind];
  runCmd({ t: 'setSettings', settings: { sources }, text: b ? 'Excel για ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(b.file) + ' › ' + b.sheet : 'χωρίς Excel για ' + KIND[kind].label.toLowerCase() });
  // άλλο αρχείο ή άλλος πίνακας: ό,τι ξέραμε για το παλιό δεν ισχύει
  if (!b || !cur || path.resolve(cur.file) !== path.resolve(b.file) || cur.sheet !== b.sheet || cur.header !== b.header) srcMeta.set(kind, null);
}
// Πού φτιάχνεται ένα νέο είδος: ως φύλλο στο Δυναμολόγιο (όπως στο αρχείο της Ίλης), αν έχει οριστεί, υπάρχει και η
// εφαρμογή γράφει εκεί· αλλιώς χωριστό αρχείο στον φάκελο του είδους. Αν το Δυναμολόγιο έχει ήδη πίνακα αυτού του
// είδους, ορίζεται αυτός (found) αντί να φτιαχτεί δεύτερος. Υπάρχον φύλλο ή αρχείο δεν γράφεται ποτέ από πάνω.
async function newPlace(kind: ListKind): Promise<{ b: SourceBinding; found?: boolean; inRoster?: boolean } | { error: string }> {
  const ros = bindingOf('people');
  if (inRoster(kind) && ros && ros.write !== false && /\.xls[xm]$/i.test(ros.file) && fs.existsSync(ros.file)) {
    try {
      const book = await readBook(ros.file);
      const hit = detectTables(book.sheets).find(h => h.best === kind);
      if (hit) return { b: { file: ros.file, sheet: hit.sheet, header: hit.header, cols: hit.cols, write: true, scope: 'all' }, found: true };
      const names = new Set(book.sheets.map(x => normGreek(x.name)));
      const title = KIND[kind].title.slice(0, 28); let name = title;
      for (let i = 2; names.has(normGreek(name)); i++) name = title + ' ' + i;
      return { b: { ...defaultBinding(kind, ros.file, name), write: true }, inRoster: true };
    } catch { /* δεν διαβάζεται (ανοιχτό, παλιό .xls): χωριστό αρχείο */ }
  }
  // έλεγχος υπηρεσιών: φύλλο του τρέχοντος μήνα, στο ίδιο αρχείο με τους προηγούμενους μήνες αν υπάρχει
  if (kind === 'duties') {
    const ym = today().slice(0, 7); const cur = bindingOf('duties');
    if (cur && /\.xls[xm]$/i.test(cur.file) && fs.existsSync(cur.file)) {
      try {
        const book = await readBook(cur.file);
        const mine = book.sheets.find(x => { const h = bestFor('duties', [x]); return h && bindingMonth(x, { ...cur, header: h.header }, today()) === ym; });
        if (mine) { const h = bestFor('duties', [mine])!; return { b: { ...cur, sheet: mine.name, header: h.header, cols: h.cols, month: ym }, found: true }; }
        const names = new Set(book.sheets.map(x => normGreek(x.name))); let name = dutiesSheet(ym);
        for (let i = 2; names.has(normGreek(name)); i++) name = dutiesSheet(ym) + ' ' + i;
        return { b: dutiesBinding(cur.file, ym, name), inRoster: true };
      } catch { /* δεν διαβάζεται: νέο αρχείο */ }
    }
  }
  const dir = newDir(kind);
  if (!writableDir(dir)) return { error: 'Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλο στις Ρυθμίσεις → Φάκελοι αρχείων.' };
  // με γνωστή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ) το όνομά της μπαίνει στο όνομα του αρχείου: «ΔΥΝΑΜΟΛΟΓΙΟ Γ΄ ΕΣΣΟ 2026 4ης ΙΛΗΣ»
  const es = store.state.settings.essos ? essoName(store.state.settings.essos) : '';
  if (kind === 'duties') return { b: dutiesBinding(freeName(dir, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + (es || today().slice(0, 4))), today().slice(0, 7)) };
  const name = kind === 'people' ? ('ΔΥΝΑΜΟΛΟΓΙΟ ' + es + ' ' + (store.state.settings.unitName || '')).replace(/\s+/g, ' ').trim() : KIND[kind].title;
  return { b: { ...defaultBinding(kind, freeName(dir, name)), write: true } };
}
// «Νέο αρχείο…» ενός είδους (Αρχεία Excel) και τα Excel της νέας ΕΣΣΟ
type NewOut = { ok: true; file: string; sheet: string; inRoster?: boolean; found?: boolean; sheets?: string[] } | { ok: false; error: string; locked?: boolean };
async function createNew(kind: ListKind): Promise<NewOut> {
  if (!KIND[kind] || !canCreate(kind)) return fail('Αυτό το είδος δεν φτιάχνεται ακόμα από την εφαρμογή');
  const prev = bindingOf(kind); const prevMeta = srcMeta.keep(kind);
  const at = await newPlace(kind); if ('error' in at) return fail(at.error);
  if (at.found) { saveBinding(kind, at.b); notify(); return { ok: true, file: at.b.file, sheet: at.b.sheet, found: true }; }
  saveBinding(kind, at.b);
  const r = await syncOut(kind, false, true);
  // δεν φτιάχτηκε: η αντιστοίχιση γυρνά όπως ήταν (όχι σε αρχείο που δεν υπάρχει), μαζί με ό,τι ήξερε η εφαρμογή για
  // το παλιό αρχείο (πότε διαβάστηκε, τι είχε): αλλιώς θα έμενε «Νέο» και δεν θα έγραφε μόνη της
  if (!r.ok) { saveBinding(kind, prev || null); prevMeta(); notify(); return r; }
  // νέο Δυναμολόγιο: και τα φύλλα του (ΤΙΜΩΡΗΜΕΝΟΙ, ΑΔΕΙΕΣ, ΠΟΣΤΑ…) για όσα είδη δεν έχουν ακόμα αρχείο
  const sheets: string[] = [];
  if (kind === 'people') for (const k of NEW_KINDS.filter(x => inRoster(x) && !bindingOf(x))) {
    const at2 = await newPlace(k); if ('error' in at2 || !at2.inRoster) continue;
    saveBinding(k, at2.b);
    if ((await syncOut(k, false, true)).ok) sheets.push(at2.b.sheet); else saveBinding(k, null);
  }
  notify();
  return { ok: true, file: r.file, sheet: at.b.sheet, inRoster: at.inRoster, ...(sheets.length ? { sheets } : {}) };
}
async function planOut(kind: ListKind): Promise<WritePreview | { ok: false; error: string }> {
  const b0 = await current(kind); if (!b0) return fail('Δεν έχει οριστεί αρχείο');
  let b: SourceBinding = b0;
  try {
    const exists = fs.existsSync(b.file);
    const book = exists ? await readBook(b.file) : null;
    const sheet = (book && sheetOf(book.sheets, b.sheet)) || { name: b.sheet, rows: [] };
    if (!book && !isStatusKind(kind)) return fail('Δεν βρέθηκε το ' + b.file);
    const had = !!book?.sheets.some(x => x.name === b.sheet);
    if (!had && !isStatusKind(kind)) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const tc = timeCols(kind, had ? sheet : null, b, store.state, today()); b = tc.b;
    const plan = planSource(kind, had ? sheet : null, b, store.state, srcMeta.get(kind), today());
    const steps = plan.inserts || [], sheet2 = steps.length ? withRows(sheet, steps) : sheet;
    const lines = describeSets(kind, sheet2, b, plan.sets, plan.insert ? new Set(Array.from({ length: plan.insert.n }, (_, i) => plan.insert!.after + 1 + i)) : stepRows(steps));
    for (const d of plan.deletes || []) { const v: Record<string, CellValue> = {}; for (const k in b.cols) v[k] = (sheet2.rows[d] || [])[b.cols[k]]; lines.push({ r: d, who: rowName(v), text: 'η γραμμή σβήνεται (αναιρέθηκε στην εφαρμογή)' }); }
    lines.sort((x, y) => x.r - y.r);
    const tidy = [...tc.head.map(h => 'Νέα στήλη «' + h.v + '» (' + colLetter(h.c) + ') στο τέλος του πίνακα, για τις ώρες των αδειών'), ...(had && book ? await tidyPreview(kind, b, store.state.settings.lists) : [])];
    return { ok: true, file: b.file, create: !exists || !had, lines, total: plan.added + plan.changed + plan.cleared, foreign: plan.foreign, notFound: plan.notFound, ambiguous: ambiguousLines(sheet, b, plan.ambiguous), warn: plan.warn, ...(tidy.length ? { tidy } : {}) };
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

// ------------------------------------------------------------------ Εκτύπωση χωρίς Excel (print.ts): προεπισκόπηση και διάλογος εκτυπωτή των Windows
type PrintJob = { file: string; sheets: string[]; tmp: string };
const printJobs = new Map<number, PrintJob>();   // ανά παράθυρο προεπισκόπησης (webContents)
async function printPage(file: string, sheets?: string[]): Promise<{ tmp: string; sheets: string[] }> {
  const doc = await renderBook(await fs.promises.readFile(file), { file: path.basename(file), sheets });
  const tmp = path.join(app.getPath('temp'), 'grafeio-print-' + crypto.randomUUID() + '.html');
  await fs.promises.writeFile(tmp, previewHtml(doc, path.basename(file)));
  return { tmp, sheets: doc.sheets.map(x => x.name) };
}
async function printPreview(file: string, sheets?: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const p = await printPage(file, sheets);
    const pw = new BrowserWindow({
      parent: win || undefined, modal: !!win, width: 1180, height: 860, minWidth: 700, minHeight: 500, show: false, title: 'Εκτύπωση · ' + path.basename(file), backgroundColor: '#5f6368',
      webPreferences: { preload: path.join(__dirname, '..', 'preload', 'print.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    pw.setMenu(null);
    const id = pw.webContents.id; printJobs.set(id, { file, ...p });
    pw.once('ready-to-show', () => { if (win && win.isMaximized()) pw.maximize(); pw.show(); });
    pw.on('closed', () => { const j = printJobs.get(id); if (j) fs.rmSync(j.tmp, { force: true }); printJobs.delete(id); });
    try { await pw.loadFile(p.tmp); } catch (e) { pw.destroy(); throw e; }
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ ΕΣΣΟ: αρχείο, νέα ΕΣΣΟ, επαναφορά (Ρυθμίσεις › ΕΣΣΟ, Michael 17/10)
const DOCS = () => path.join(app.getPath('documents'), 'Γραφείο Ίλης');
const archiveRoot = () => path.join(DOCS(), 'Αρχείο ΕΣΣΟ');
// ο φάκελος της νέας ΕΣΣΟ φτιάχνεται δίπλα στον τωρινό αν αυτός είναι φάκελος ΕΣΣΟ («Β΄ ΕΣΣΟ 2026»), αλλιώς στα Έγγραφα
const newRoot = () => { const o = outputDir(); return parseEsso(path.basename(o)) ? path.dirname(o) : DOCS(); };
const essoDirs = new Set<string>();   // φάκελοι που διάλεξε ο χρήστης στους διαλόγους της ΕΣΣΟ
const sameDir = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const okEssoDir = (d: unknown): d is string => typeof d === 'string' && !!d && [archiveRoot(), ...essoDirs].some(x => sameDir(x, d));
const knownArchives = () => (readMeta().essoArchives || []).filter(d => typeof d === 'string');
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
let essoBusy = false;
// Ό,τι περιμένει να γραφτεί στα Excel γράφεται πριν μπουν στο αρχείο
async function settleAuto() { clearTimeout(autoTimer); while (autoBusy) await new Promise(r => setTimeout(r, 100)); await runAuto(); }
// Τα Excel της τωρινής ΕΣΣΟ: οι πηγές κάθε είδους και τα δικά σου templates εντύπων
function essoFiles(s: AppState): { orig: string; kind?: ListKind; form?: FormKind; label: string }[] {
  const st = s.settings;
  return [...(Object.entries(st.sources || {}) as [ListKind, SourceBinding | undefined][]).filter(([, b]) => b?.file).map(([k, b]) => ({ orig: b!.file, kind: k, label: KIND[k]?.label || k })),
    ...(Object.entries(st.forms || {}) as [FormKind, FormBinding | undefined][]).filter(([, b]) => b?.file).map(([f, b]) => ({ orig: b!.file!, form: f, label: 'Template ' + f }))];
}
const outDirsOf = (s: AppState) => [...new Set([outputDir(), ...Object.values(s.settings.forms || {}).map(b => b?.dir), ...Object.values(s.settings.newDirs || {})].filter((x): x is string => !!x))];
// Η τωρινή ΕΣΣΟ στο αρχείο: φάκελος με βάση, Excel, sources.json και ΕΣΣΟ.json. Ένα γράψιμο αρχείων τη φορά (serial).
function archiveNow(root: string) {
  const s = store.state; const e = currentEsso(s);
  const r = writeArchive({ root, day: today(), db: store.data(), files: essoFiles(s).map(({ orig, kind, form }) => ({ orig, ...(kind ? { kind } : {}), ...(form ? { form } : {}) })), sources: srcMeta.dump(),
    manifest: { app: 'grafeio-ilis', v: 1, name: e ? essoName(e) : 'ΕΣΣΟ', ...(e ? { esso: e } : {}), at: today() + ' ' + nowHM(), version: app.getVersion(), people: s.people.filter(p => p.active).length, outDirs: outDirsOf(s) } });
  writeMeta({ essoArchives: [r.dir, ...knownArchives().filter(d => !sameDir(d, r.dir))].slice(0, 50) });
  return r;
}
function essoInfo(): EssoInfo {
  const s = store.state; const seen = new Set<string>(); const archives: EssoArchiveInfo[] = [];
  const add = (dir: string, m: { name: string; at: string; people: number; files: unknown[] }) => { const k = path.resolve(dir).toLowerCase(); if (seen.has(k)) return; seen.add(k); archives.push({ dir, name: m.name, at: m.at, people: m.people, files: new Set(m.files.map((f: any) => f.copy)).size }); };
  for (const d of knownArchives()) { const r = readArchive(d); if (r.ok) add(d, r.manifest); }
  for (const x of listArchives(archiveRoot())) add(x.dir, x.manifest);
  archives.sort((a, b) => b.at.localeCompare(a.at));
  return { people: s.people.filter(p => p.active).length, files: essoFiles(s).map(f => ({ label: f.label, file: f.orig, exists: fs.existsSync(f.orig) })), outDirs: outDirsOf(s), archiveRoot: archiveRoot(), newRoot: newRoot(), archives };
}
// Αντίγραφο στον φάκελο της νέας ΕΣΣΟ με το ίδιο όνομα (και επέκταση), χωρίς να πατήσει υπάρχον
function copyInto(dir: string, file: string): string {
  const ext = path.extname(file), stem = path.basename(file, ext);
  for (let i = 1; ; i++) { const f = path.join(dir, stem + (i > 1 ? ' (' + i + ')' : '') + ext); if (sameDir(f, file)) return f; if (!fs.existsSync(f)) { fs.mkdirSync(dir, { recursive: true }); copyDurable(file, f); return f; } }
}
// Νέα ΕΣΣΟ: 1. αρχείο της τωρινής (αν δεν γραφτεί, δεν αλλάζει τίποτα), 2. η βάση ξεκινά για τη νέα (freshState) χωρίς το
// ιστορικό της παλιάς, 3. τα Excel της νέας στον φάκελό της: Δυναμολόγιο με τα φύλλα του (νέο, ή αυτό που σου έδωσαν) και
// έλεγχος υπηρεσιών, όλα συνδεδεμένα. Ό,τι δεν φτιάχτηκε στο 3 λέγεται στο τέλος και φτιάχνεται από τα «Αρχεία Excel».
async function startEsso(o: EssoStart): Promise<EssoResult> {
  const e = o?.esso;
  if (!e || !ESSO_SERIES.includes(e.s) || !Number.isInteger(e.y) || e.y < 2000 || e.y > 2100) return fail('Διάλεξε σειρά (Α΄, Β΄, Γ΄ ή Δ΄) και έτος');
  if (!okEssoDir(o.archiveRoot)) return fail('Άγνωστος φάκελος για το αρχείο. Διάλεξέ τον ξανά.');
  if (o.newDir && !okEssoDir(o.newDir)) return fail('Άγνωστος φάκελος για τα νέα Excel. Διάλεξέ τον ξανά.');
  const dir = o.newDir || path.join(newRoot(), essoName(e));
  const ros = o.roster ? pending.get(o.roster) : undefined;
  if (o.roster && !ros) return fail('Η επιλογή του Δυναμολογίου έληξε. Διάλεξέ το ξανά.');
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  for (const d of [o.archiveRoot, dir]) if (!writableDir(d)) return fail('Δεν γράφεται ο φάκελος ' + d + '. Διάλεξε άλλον (π.χ. στα Έγγραφα ή σε USB).');
  essoBusy = true;
  try {
    await settleAuto();
    const prev = store.state; const old = currentEsso(prev);
    let arch: ReturnType<typeof archiveNow>;
    try { arch = await serial(async () => archiveNow(o.archiveRoot)); }
    catch (err) { return fail('Δεν γράφτηκε το αρχείο της προηγούμενης ΕΣΣΟ, οπότε δεν άλλαξε τίποτα: ' + msgOf(err)); }
    try { store.backup('πριν-νέα-ΕΣΣΟ'); } catch (err) { console.error('backup', err); }   // η βάση είναι ήδη και στο αρχείο
    try { store.transact(() => { store.commit(freshState(prev, e, today(), dir)); }); }
    catch (err) { return fail('Δεν ξεκίνησε η νέα ΕΣΣΟ, η βάση έμεινε όπως ήταν (το αρχείο κρατήθηκε στο ' + arch.dir + '): ' + msgOf(err)); }
    // ό,τι ήξερε η εφαρμογή για τα παλιά Excel και τα έντυπα που βγήκαν δεν ισχύει πια
    clearTimeout(autoTimer); dirty.clear(); formsDirty = false;
    srcMeta.reset(); writeOuts([]); store.clearAudit();
    seenUntil = 0; sessionStart = 0; writeMeta({ seenAudit: 0 });
    srcMeta.allow([dir]);
    store.addAudit({ at: nowHM(), day: today(), text: 'Νέα ΕΣΣΟ: ' + essoName(e) + '. Η προηγούμενη (' + (old ? essoName(old) : 'χωρίς όνομα') + ', ' + arch.manifest.people + ' σε δύναμη) κρατήθηκε στο ' + arch.dir + ' και ξαναφορτώνεται από Ρυθμίσεις › ΕΣΣΟ › Επαναφορά', files: [], source: 'app', undoable: false }, null);
    const warnings = arch.missing.map(f => 'Δεν βρέθηκε (δεν μπήκε στο αρχείο): ' + f);
    const files: string[] = [];
    const made = (k: ListKind, r: NewOut) => { if (r.ok) files.push(r.file); else warnings.push(KIND[k].label + ': ' + r.error); };
    if (ros) {
      // το Δυναμολόγιο της νέας ΕΣΣΟ που σου έδωσαν: αντίγραφο στον φάκελό της, εισαγωγή, και τα φύλλα του για τα υπόλοιπα είδη
      pending.delete(o.roster!);
      try {
        const copy = copyInto(dir, ros.file); srcMeta.allow([copy]);
        const r = runCmd({ t: 'importPeople', rows: ros.rows, source: path.basename(copy), deactivateMissing: true });
        if (!r.ok) warnings.push('Δεν μπήκαν οι στρατιώτες από το ' + path.basename(copy) + ': ' + r.error);
        else { afterRoster({ ...ros, file: copy, binding: ros.binding ? { ...ros.binding, file: copy } : null, stamp: stamp(copy) || ros.stamp }); files.push(copy); }
      } catch (err) { warnings.push('Δεν αντιγράφηκε το Δυναμολόγιο στο ' + dir + ': ' + msgOf(err)); }
      if (bindingOf('people')) for (const k of NEW_KINDS.filter(x => inRoster(x) && !bindingOf(x))) made(k, await createNew(k));
      else made('people', await createNew('people'));
    } else made('people', await createNew('people'));
    made('duties', await createNew('duties'));
    notify();
    return { ok: true, archive: arch.dir, dir, files: [...new Set(files)], warnings };
  } finally { essoBusy = false; }
}
// Επαναφορά ΕΣΣΟ από τον φάκελο του αρχείου της: πρώτα η τωρινή μπαίνει κι αυτή στο αρχείο (για να γυρίσεις σε αυτήν), μετά η
// βάση της παλιάς στη θέση της (όπως στην επαναφορά αντιγράφου) και τα Excel της: εκεί που ήταν, αν υπάρχουν ακόμα, αλλιώς
// τα αντίγραφα του αρχείου. Η εφαρμογή δεν γράφει μόνη της στα Excel μέχρι νέα ανάγνωση (HOLD_RESTORE). Επανεκκίνηση.
async function restoreEsso(dir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!okEssoDir(dir) && !knownArchives().some(d => sameDir(d, dir))) return fail('Άγνωστος φάκελος. Διάλεξέ τον με το «Διάλεξε φάκελο…».');
  const a = readArchive(dir); if (!a.ok) return a;
  const bad = store.validate(a.db); if (bad) return fail('Η βάση του αρχείου δεν είναι καλή: ' + bad);
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  essoBusy = true;
  try {
    await settleAuto();
    const s0 = store.state; let kept = '';
    if (s0.people.length || Object.keys(s0.settings.sources || {}).length) {
      const root = writableDir(path.dirname(dir)) ? path.dirname(dir) : archiveRoot();
      try { kept = (await serial(async () => archiveNow(root))).dir; }
      catch (err) { return fail('Δεν γράφτηκε αρχείο της τωρινής ΕΣΣΟ, οπότε δεν έγινε η επαναφορά: ' + msgOf(err)); }
    }
    const db = path.join(DATA, 'ilh.db'), tmp = db + '.restore.tmp';
    try { copyDurable(a.db, tmp); const b2 = store.validate(tmp); if (b2) throw new Error(b2); }
    catch (err) { fs.rmSync(tmp, { force: true }); return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err)); }
    try { store.backup('πριν-επαναφορά-ΕΣΣΟ'); }
    catch (err) { fs.rmSync(tmp, { force: true }); return fail('Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης (' + msgOf(err) + '). Η βάση έμεινε όπως ήταν.'); }
    try { store.close(); } catch { /* συνεχίζουμε */ }
    try {
      for (let i = 0; ; i++) {
        try { fs.renameSync(tmp, db); break; }
        catch (err: any) { if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
      }
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      try { await store.open(); } catch (e2) { dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2)); app.exit(1); }
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err));
    }
    await store.open();
    const at = (rel: string) => path.join(dir, ...rel.split('/'));
    const re = (f: string) => restoredPath(f, a.manifest, at, fs.existsSync);
    const st = store.state.settings;
    const sources = Object.fromEntries(Object.entries(st.sources || {}).map(([k, b]) => [k, b && { ...b, file: re(b.file) }]));
    const forms = Object.fromEntries(Object.entries(st.forms || {}).map(([k, b]) => [k, b?.file ? { ...b, file: re(b.file) } : b]));
    store.commit({ ...store.state, settings: { ...st, sources, forms } });
    let sj: any = {}; try { sj = JSON.parse(fs.readFileSync(path.join(dir, SOURCES_FILE), 'utf8')) || {}; } catch { /* χωρίς: όλα ξανά από ανάγνωση */ }
    srcMeta.reset(sj);
    srcMeta.allow([...Object.values(sources).map(b => b?.file || ''), ...Object.values(forms).flatMap(b => [b?.file || '', b?.dir || ''])]);
    holdAll(HOLD_RESTORE); writeOuts([]);
    store.addAudit({ at: nowHM(), day: today(), text: 'Επαναφορά ΕΣΣΟ: ' + a.manifest.name + ' από ' + dir + (kept ? '. Η ΕΣΣΟ που έτρεχε κρατήθηκε στο ' + kept : ''), files: [], source: 'app', undoable: false }, null);
    app.relaunch(); app.exit(0);
    return { ok: true };
  } finally { essoBusy = false; }
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
async function recover(reason: string, empty = false): Promise<boolean> {
  const good = listBackups(BACKUPS).find(b => !store.validate(path.join(BACKUPS, b.name)));
  const db = path.join(DATA, 'ilh.db');
  const aside = () => { fs.mkdirSync(BACKUPS, { recursive: true }); fs.renameSync(db, path.join(BACKUPS, 'χαλασμένη_' + Date.now() + '.db')); };
  if (!good) {
    // άδειο αρχείο χωρίς κανένα αντίγραφο: αλλιώς η εφαρμογή δεν θα άνοιγε ποτέ ξανά. Ξεκινά κενή, και από εκεί
    // γίνεται επαναφορά από USB.
    if (!empty) return false;
    const r = await dialog.showMessageBox({ type: 'warning', title: 'Γραφείο Λοχία', noLink: true, buttons: ['Ξεκίνα με κενή βάση', 'Έξοδος'], defaultId: 1, cancelId: 1,
      message: 'Η βάση δεδομένων είναι άδεια και δεν βρέθηκε αντίγραφο ασφαλείας.', detail: 'Λεπτομέρεια: ' + reason + '\n\nΑν έχεις αντίγραφο σε USB, ξεκίνα με κενή βάση και κάνε επαναφορά από εκεί (Ρυθμίσεις → Αντίγραφα ασφαλείας → «Φέρε αντίγραφο από USB…»).\nΤο άδειο αρχείο θα κρατηθεί στον φάκελο backups.' });
    if (r.response !== 0) return false;
    aside(); await store.open();
    store.addAudit({ at: nowHM(), day: today(), text: 'Η βάση ήταν άδεια χωρίς αντίγραφο: ξεκίνησε κενή (' + reason + ')', files: [], source: 'auto', undoable: false }, null);
    return true;
  }
  const r = await dialog.showMessageBox({ type: 'warning', title: 'Γραφείο Λοχία', noLink: true, buttons: ['Επαναφορά', 'Έξοδος'], defaultId: 0, cancelId: 1,
    message: empty ? 'Η βάση δεδομένων είναι άδεια (π.χ. κόπηκε το ρεύμα την ώρα που γραφόταν).' : 'Η βάση δεδομένων φαίνεται χαλασμένη.', detail: 'Λεπτομέρεια: ' + reason + '\n\nΕπαναφορά από το αντίγραφο ' + good.name + ';\nΗ χαλασμένη βάση θα κρατηθεί στον φάκελο backups.' });
  if (r.response !== 0) return false;
  aside();
  copyDurable(path.join(BACKUPS, good.name), db);
  await store.open();
  holdAll(HOLD_RESTORE);
  store.addAudit({ at: nowHM(), day: today(), text: 'Επαναφορά βάσης από αντίγραφο ' + good.name + ' (η προηγούμενη ήταν ' + (empty ? 'άδεια' : 'χαλασμένη') + ')', files: [], source: 'auto', undoable: false }, null);
  return true;
}

function createWindow() {
  const icon = path.join(__dirname, '..', 'renderer', 'icon.png');   // λογότυπο στη γραμμή εργασιών (στο dev μπορεί να λείπει)
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 600, show: false, title: 'Γραφείο Λοχία', backgroundColor: '#f4f5f0',
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
      if (!(e instanceof CorruptDbError) || !(await recover(String(e.message), e.empty))) {
        dialog.showErrorBox('Γραφείο Λοχία', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA); app.quit(); return;
      }
    }
    daily(); setInterval(daily, 10 * 60 * 1000);
    // τα αρχεία που είναι ήδη ορισμένα (από παλιότερη έκδοση) είναι γνωστά
    const st0 = store.state.settings;
    srcMeta.allow([...Object.values(st0.sources || {}).map(x => x?.file || ''), ...Object.values(st0.forms || {}).flatMap(x => [x?.file || '', x?.dir || ''])]);
    sessionStart = store.audit(1)[0]?.id || 0;
    const meta = readMeta();
    seenUntil = typeof meta.seenAudit === 'number' && meta.seenAudit <= sessionStart ? meta.seenAudit : sessionStart;
    writeMeta({ seenAudit: sessionStart });

    ipcMain.handle('boot', (): Boot => ({ ...snapshot(), dataDir: DATA, outputDir: outputDir(), templatesDir: USER_TPL, version: app.getVersion(), templates: templates(), lastUsb: readMeta().lastUsb || null, seenUntil, sessionStart, dataFallback: DATA_AT.fallback }));
    const answer = (r: ReturnType<typeof runCmd>): CmdResult => (r.ok ? reply(r.text) : r);
    // αρχεία και φάκελοι αλλάζουν μόνο από τους διαλόγους του main (src:save, form:save, φάκελοι), όχι με εντολή από το UI
    const MAIN_ONLY = ['sources', 'forms', 'outputDir', 'newDirs'];
    ipcMain.handle('cmd', (_e, cmd: Command) => (cmd?.t === 'setSettings' && Object.keys(cmd.settings || {}).some(k => MAIN_ONLY.includes(k)) ? fail('Αυτή η ρύθμιση αλλάζει μόνο από τα Αρχεία Excel / τους Φακέλους') : answer(runCmd(cmd))));
    ipcMain.handle('sync', () => reply(''));
    // νέα μέρα με την εφαρμογή ανοιχτή: οι εργασίες της μέρας τώρα (όχι σε ως 10 λεπτά) και μόνο ό,τι άλλαξε
    ipcMain.handle('day:check', () => { daily(); return reply(''); });
    ipcMain.handle('undo', (_e, id?: number): CmdResult => {
      const last = store.lastUndoable(); if (!last) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      // «Αναίρεση» από μήνυμα: μόνο η ενέργεια του μηνύματος, όχι κάποια που έγινε μετά
      if (typeof id === 'number' && last.id !== id) return { ok: false, error: 'Έγινε άλλη ενέργεια μετά από αυτή, οπότε δεν αναιρείται από εδώ. Η τελευταία ήταν: «' + last.text + '». Δες το Ιστορικό.' };
      try {
        const prev = store.state;
        store.transact(() => { store.revert(last.patch); store.markUndone(last.id, false); }, true, () => store.markUndone(last.id, false, false));
        // Αναίρεση ανάγνωσης από Excel: η εφαρμογή γυρίζει πίσω, το Excel όχι. Αν γράφαμε τώρα, θα σβήναμε από το Excel
        // όσα μόλις διαβάστηκαν (ή θα ξαναγράφαμε παλιές τιμές στο Δυναμολόγιο). Τα είδη περιμένουν νέα ανάγνωση.
        const fromExcel = last.source === 'excel' || last.source === 'import';
        if (fromExcel) hold(kindsOf(prev, store.state), HOLD_UNDO);
        scheduleAuto(prev, store.state, !fromExcel);
        store.addAudit({ at: nowHM(), day: today(), text: 'Αναίρεση: ' + last.text + (fromExcel ? ' (το Excel δεν άλλαξε)' : ''), files: [], source: 'app', undoable: false }, null);
        if (fromExcel) notify();
        return reply('Αναιρέθηκε: ' + last.text + (fromExcel ? '. Το Excel δεν άλλαξε.' : ''), true);   // άλλαξε και η παλιά γραμμή (Αναιρέθηκε): όλο το ιστορικό
      } catch (e) { return fail(e); }
    });
    ipcMain.handle('export', (_e, kind: ExportKind, date: ISODate, opts) => exportGuarded(kind, date, opts || {}));
    ipcMain.handle('export:lists', async (_e, date: ISODate) => {
      try {
        const r = await excel().rosterLists(store.state, date);
        const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
        shell.openPath(out);
        return { ok: true, file: out, warnings: [] };
      } catch (e) { return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e); }
    });
    ipcMain.handle('export:cadre', async (_e, date: ISODate) => {
      try {
        const r = await excel().cadreLists(store.state, date);
        const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
        shell.openPath(out);
        return { ok: true, file: out, warnings: [] };
      } catch (e) { return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e); }
    });
    ipcMain.handle('export:roster', async (_e, date: ISODate, print?: boolean) => {
      try {
        const r = await excel().rosterPrint(store.state, date);
        const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
        const warnings: string[] = [];
        if (print) { const p = await printPreview(out); if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error); } else shell.openPath(out);
        return { ok: true, file: out, warnings };
      } catch (e) { return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e); }
    });
    // Οπλισμός: ένα Excel, φύλλο ανά φίλτρο· print: προεπισκόπηση εκτύπωσης της κατάστασης οπλισμού
    ipcMain.handle('export:weapons', async (_e, date: ISODate, print?: boolean) => {
      try {
        const r = await excel().weaponsBook(store.state, date);
        const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
        const warnings: string[] = [];
        if (print) { const p = await printPreview(out); if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error); } else shell.openPath(out);
        return { ok: true, file: out, warnings };
      } catch (e) { return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e); }
    });
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
    const pickXlsx = async (title: string) => { const res = await dialog.showOpenDialog(win!, { title, filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }], properties: ['openFile'] }); const file = res.canceled ? null : res.filePaths[0] || null; if (file) srcMeta.allow([file]); return file; };
    ipcMain.handle('src:pick', async (_e, kind: ListKind | null) => {
      const file = await pickXlsx(kind ? 'Excel για ' + KIND[kind].label : 'Εισαγωγή Excel'); if (!file) return null;
      try { return await bookOf(file); } catch (e) { return fail(e instanceof OldFormatError ? e.message : e); }
    });
    ipcMain.handle('src:read', async (_e, kind: ListKind) => { try { const b = await current(kind); if (!b) return fail('Δεν έχει οριστεί αρχείο'); return { ...(await bookOf(b.file)), binding: b }; } catch (e) { return fail(e); } });
    ipcMain.handle('src:save', async (_e, kind: ListKind, b: SourceBinding | null) => {
      if (b && (typeof b.file !== 'string' || !srcMeta.allowed(b.file))) return fail('Άγνωστο αρχείο: διάλεξέ το με το «Διάλεξε Excel…»');
      try {
        saveBinding(kind, b);
        // προσωπικό: αφετηρία για τις διορθώσεις είναι ό,τι γράφει τώρα το Excel
        // αν η εφαρμογή έχει ήδη τα ίδια με το Excel γράφει μόνη της από εδώ και πέρα· αλλιώς πρώτα «Ενημέρωση Excel» με προεπισκόπηση
        if (b && kind === 'people' && !srcMeta.get('people')) {
          const book = await readBook(b.file); const sh = sheetOf(book.sheets, b.sheet);
          if (sh) { const snap = snapFromSheet(sh, b, store.state.people); srcMeta.set('people', { snap, keys: [], ...syncStamp(b, book), at: planPeopleWrite(sh, b, store.state, snap).sets.length ? '' : stampNow() }); }
        }
        notify(); return reply('');
      } catch (e) { return fail(e); }
    });
    const known = (b: SourceBinding | null | undefined) => !!b && typeof b.file === 'string' && srcMeta.allowed(b.file);
    ipcMain.handle('src:import', (_e, kind: StatusKind, b: SourceBinding, choices: Record<number, number | null>, keepRemoved: boolean, keepApp: string[]) => !known(b) ? fail('Άγνωστο αρχείο') : importStatuses(kind, b, choices || {}, !!keepRemoved, Array.isArray(keepApp) ? keepApp : []));
    ipcMain.handle('src:apply', (_e, kind: ListKind, b: SourceBinding, cmd: Command, keys?: string[]) => !known(b) ? fail('Άγνωστο αρχείο') : applySheet(kind, b, cmd, Array.isArray(keys) ? keys : []));
    ipcMain.handle('src:keys', (_e, kind: StatusKind | 'duties') => ({ keys: srcMeta.get(kind)?.keys || [], base: srcMeta.get(kind)?.base || {} }));
    ipcMain.handle('src:people', async (_e, b: SourceBinding) => { if (!b || typeof b.file !== 'string' || !srcMeta.allowed(b.file)) return fail('Άγνωστο αρχείο'); const nb = (await current('people', b))!; return rosterPreview(nb.file, nb); });
    ipcMain.handle('src:plan', (_e, kind: ListKind) => planOut(kind));
    ipcMain.handle('src:write', async (_e, kind: ListKind) => { const r = await syncOut(kind, false); notify(); return r.ok ? { ok: true, text: r.text, file: r.file } : r; });
    ipcMain.handle('src:new', (_e, kind: ListKind) => createNew(kind));
    ipcMain.handle('src:status', async () => { retryPending(); return statusAll(); });
    ipcMain.handle('form:pick', async (_e, f: FormKind) => { const file = await pickXlsx('Template για ' + f); if (!file) return null; return formInfo(f, file); });
    ipcMain.handle('form:info', (_e, f: FormKind) => formInfo(f));
    ipcMain.handle('form:save', (_e, f: FormKind, b: FormBinding | null) => {
      const cur = formBinding(f);
      if (b?.file && b.file !== cur.file && !srcMeta.allowed(b.file)) return fail('Άγνωστο αρχείο: διάλεξέ το με το «Template…»');
      if (b?.dir && b.dir !== cur.dir && !srcMeta.allowed(b.dir)) return fail('Άγνωστος φάκελος: διάλεξέ τον με το «Φάκελος…»');
      const forms = { ...(store.state.settings.forms || {}) };
      if (b && Object.values(b).some(v => v !== undefined && v !== '')) forms[f] = b; else delete forms[f];
      const r = runCmd({ t: 'setSettings', settings: { forms }, text: 'έντυπο ' + f + (b?.file ? ': ' + path.basename(b.file) : b?.dir ? ': φάκελος ' + b.dir : ': προεπιλογή') });
      return r.ok ? reply(r.text, false) : r;
    });
    ipcMain.handle('form:dir', async (_e, f: FormKind) => {
      const r = await dialog.showOpenDialog(win!, { title: 'Φάκελος για το έντυπο', defaultPath: formBinding(f).dir || outputDir(), properties: ['openDirectory', 'createDirectory'] });
      const dir = r.canceled ? null : r.filePaths[0] || null; if (dir) srcMeta.allow([dir]); return dir;
    });
    ipcMain.handle('open:path', (_e, file: string) => { if (typeof file === 'string' && /\.xls[xm]?$/i.test(file) && knownPath(file) && fs.existsSync(file)) return shell.openPath(file); return 'άγνωστο αρχείο'; });
    ipcMain.handle('print:file', (_e, file: string, sheet?: string) => {
      // αρχεία που ξέρει η εφαρμογή ή έντυπα στους φακέλους εξαγωγής (και παλιότερων ημερών)
      const inside = (dir?: string) => !!dir && !path.relative(path.resolve(dir), path.resolve(file)).startsWith('..') && !path.isAbsolute(path.relative(path.resolve(dir), path.resolve(file)));
      const known = knownPath(file) || [outputDir(), ...Object.values(store.state.settings.forms || {}).map(b => b?.dir)].some(inside);
      if (!known || !/\.xls[xm]?$/i.test(file) || !fs.existsSync(file)) return fail('Δεν βρέθηκε το ' + path.basename(file));
      if (/\.xls$/i.test(file)) return fail('Το ' + path.basename(file) + ' είναι παλιό .xls. Άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx για να τυπώνεται από εδώ.');
      return printPreview(file, sheet ? [sheet] : undefined);
    });
    // από το παράθυρο προεπισκόπησης
    ipcMain.handle('print:sheets', async (e, names: string[]) => {
      const job = printJobs.get(e.sender.id); if (!job || !Array.isArray(names)) return fail('Έκλεισε η εκτύπωση');
      try {
        const p = await printPage(job.file, names.map(String));
        fs.rmSync(job.tmp, { force: true }); Object.assign(job, p);
        await e.sender.loadFile(p.tmp);
        return { ok: true };
      } catch (err) { return fail(err); }
    });
    ipcMain.handle('print:printers', async e => {
      try { return (await e.sender.getPrintersAsync()).map(p => ({ name: p.name, label: p.displayName || p.name, def: !!p.isDefault })); } catch { return []; }
    });
    // Με εκτυπωτή από τη μπάρα: τυπώνει χωρίς τον διάλογο των Windows, ώστε να μένουν το χαρτί και ο προσανατολισμός
    // του φύλλου (ο διάλογος παίρνει τις προεπιλογές του εκτυπωτή, συνήθως κατακόρυφο, και κόβει τα οριζόντια φύλλα)
    ipcMain.handle('print:go', async (e, o: { landscape?: boolean; pageSize?: string; part?: string; device?: string; copies?: number }) => {
      const job = printJobs.get(e.sender.id); if (!job) return fail('Έκλεισε η εκτύπωση');
      const pageSize = ['A3', 'A4', 'A5', 'Legal', 'Letter'].includes(String(o?.pageSize)) ? String(o.pageSize) : 'A4';
      let device = typeof o?.device === 'string' && o.device ? o.device : '';
      if (device) { try { if (!(await e.sender.getPrintersAsync()).some(p => p.name === device)) device = ''; } catch { device = ''; } }
      const copies = Math.min(99, Math.max(1, Math.floor(Number(o?.copies) || 1)));
      return new Promise(res => e.sender.print({ silent: !!device, ...(device ? { deviceName: device, copies } : {}), printBackground: true, landscape: !!o?.landscape, pageSize, margins: { marginType: 'none' } }, (ok, reason) => {
        if (ok) store.addAudit({ at: nowHM(), day: today(), text: 'Εκτύπωση ' + path.basename(job.file) + (job.sheets.length > 1 || o?.part ? ' (' + job.sheets.join(', ') + (o?.part ? ', μέρος ' + o.part : '') + ')' : ''), files: [path.basename(job.file)], source: 'app', undoable: false }, null);
        res(ok ? { ok: true } : { ok: false, error: reason === 'cancelled' ? '' : 'Δεν τυπώθηκε: ' + reason });
      }));
    });
    ipcMain.handle('print:close', e => { BrowserWindow.fromWebContents(e.sender)?.close(); });
    setInterval(retryPending, 60 * 1000);
    ipcMain.handle('backups:list', () => listBackups(BACKUPS));
    ipcMain.handle('backups:restore', async (_e, name: string) => {
      const file = path.join(BACKUPS, path.basename(name));
      const bad = fs.existsSync(file) ? store.validate(file) : 'Δεν βρέθηκε το αντίγραφο';
      if (bad) return { ok: false, error: 'Το αντίγραφο δεν είναι καλό: ' + bad };
      // πρώτα αντίγραφο δίπλα στη βάση και έλεγχος· η τωρινή βάση κλείνει μόνο αν αυτό πέτυχε
      const db = path.join(DATA, 'ilh.db'), tmp = db + '.restore.tmp';
      try { copyDurable(file, tmp); const b2 = store.validate(tmp); if (b2) throw new Error(b2); }
      catch (e) { fs.rmSync(tmp, { force: true }); return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e))); }
      // χωρίς αντίγραφο της τωρινής βάσης δεν γίνεται επαναφορά: αλλιώς ό,τι έγινε μετά το αντίγραφο θα χανόταν οριστικά
      try { store.backup('πριν-επαναφορά'); }
      catch (e) { fs.rmSync(tmp, { force: true }); return fail('Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης πριν από αυτή (' + (e instanceof Error ? e.message : String(e)) + '). Η βάση έμεινε όπως ήταν. Δες αν ο φάκελος data\\backups γράφεται ή αν ο δίσκος είναι γεμάτος.'); }
      try { store.close(); } catch { /* συνεχίζουμε */ }
      try {
        for (let i = 0; ; i++) {
          try { fs.renameSync(tmp, db); break; }
          catch (e: any) { if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
        }
      } catch (e) {
        // η βάση ξανανοίγει όπως ήταν, ώστε η εφαρμογή να συνεχίσει να δουλεύει
        fs.rmSync(tmp, { force: true });
        try { await store.open(); } catch (e2) { dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2)); app.exit(1); }
        return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e)));
      }
      holdAll(HOLD_RESTORE);
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
    ipcMain.handle('flags:gpu', (_e, disable: boolean) => { writeJson(FLAGS, { ...readFlags(), disableGpu: !!disable }); app.relaunch(); app.exit(0); });
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
      fs.mkdirSync(BACKUPS, { recursive: true }); copyDurable(src, path.join(BACKUPS, name));
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
    // Φάκελοι αρχείων (Ρυθμίσεις): ο γενικός, ένας ανά έντυπο και ένας ανά είδος για τα νέα Excel. Κενό = ο γενικός.
    const setDir = (t: DirTarget, dir: string | undefined, what: string) => {
      if (t === 'output') return runCmd({ t: 'setSettings', settings: { outputDir: dir || '' }, text: 'φάκελος αρχείων ' + what });
      if ('form' in t) {
        const forms = { ...(store.state.settings.forms || {}) }; const b = { ...formBinding(t.form), dir };
        if (Object.values(b).some(v => v !== undefined && v !== '')) forms[t.form] = b; else delete forms[t.form];
        return runCmd({ t: 'setSettings', settings: { forms }, text: 'φάκελος για το έντυπο ' + t.form + ': ' + what });
      }
      const newDirs = { ...(store.state.settings.newDirs || {}) }; if (dir) newDirs[t.kind] = dir; else delete newDirs[t.kind];
      return runCmd({ t: 'setSettings', settings: { newDirs }, text: 'φάκελος για νέα Excel (' + KIND[t.kind].label + '): ' + what });
    };
    const okTarget = (t: DirTarget) => t === 'output' || (!!t && typeof t === 'object' && (('form' in t && FORM_KINDS.includes(t.form)) || ('kind' in t && canCreate(t.kind))));
    ipcMain.handle('dir:choose', async (_e, t: DirTarget) => {
      if (!okTarget(t)) return fail('άγνωστος φάκελος');
      const r = await dialog.showOpenDialog(win!, { title: 'Διάλεξε φάκελο', defaultPath: dirOf(t), properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const dir = r.filePaths[0];
      if (!writableDir(dir)) return fail('Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλον.');
      const c = setDir(t, dir, dir); return c.ok ? reply(c.text, false) : c;
    });
    ipcMain.handle('dir:reset', (_e, t: DirTarget) => { if (!okTarget(t)) return fail('άγνωστος φάκελος'); const c = setDir(t, undefined, t === 'output' ? 'προεπιλογή' : 'ο γενικός'); return c.ok ? reply(c.text, false) : c; });
    ipcMain.handle('dir:open', (_e, t: DirTarget) => { if (!okTarget(t)) return 'άγνωστος φάκελος'; const dir = dirOf(t); fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); });
    // ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ)
    ipcMain.handle('esso:info', () => essoInfo());
    ipcMain.handle('esso:dir', async (_e, def?: string) => {
      const r = await dialog.showOpenDialog(win!, { title: 'Διάλεξε φάκελο', defaultPath: typeof def === 'string' && def ? def : DOCS(), properties: ['openDirectory', 'createDirectory'] });
      const dir = r.canceled ? null : r.filePaths[0] || null; if (dir) essoDirs.add(dir); return dir;
    });
    ipcMain.handle('esso:roster', async () => {
      const res = await dialog.showOpenDialog(win!, { title: 'Δυναμολόγιο της νέας ΕΣΣΟ', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] });
      if (res.canceled || !res.filePaths[0]) return null;
      return rosterPreview(res.filePaths[0], null);
    });
    ipcMain.handle('esso:start', (_e, o: EssoStart) => startEsso(o));
    ipcMain.handle('esso:pick', async (): Promise<EssoArchiveInfo | { ok: false; error: string } | null> => {
      const r = await dialog.showOpenDialog(win!, { title: 'Φάκελος αρχείου ΕΣΣΟ (με το ΕΣΣΟ.json)', defaultPath: fs.existsSync(archiveRoot()) ? archiveRoot() : DOCS(), properties: ['openDirectory'] });
      const dir = r.canceled ? null : r.filePaths[0] || null; if (!dir) return null;
      const a = readArchive(dir); if (!a.ok) return a;
      essoDirs.add(dir);
      return { dir, name: a.manifest.name, at: a.manifest.at, people: a.manifest.people, files: new Set(a.manifest.files.map(f => f.copy)).size };
    });
    ipcMain.handle('esso:restore', (_e, dir: string) => restoreEsso(dir));
    ipcMain.handle('esso:open', (_e, dir: string) => {
      if (typeof dir !== 'string' || !(okEssoDir(dir) || knownArchives().some(d => sameDir(d, dir)) || sameDir(dir, outputDir()) || sameDir(dir, newRoot())) || !fs.existsSync(dir)) return 'άγνωστος φάκελος';
      return shell.openPath(dir);
    });
    createWindow();
    ready = Date.now();
    // Στην εκκίνηση: ό,τι δεν πρόλαβε να γραφτεί την προηγούμενη φορά (κλείσιμο, ρεύμα). Γράφεται μόνο ό,τι λείπει από τα
    // Excel και μόνο όπου ο πίνακας δεν άλλαξε στο μεταξύ, όπως σε κάθε αυτόματη εγγραφή.
    setTimeout(() => { for (const k of KINDS) if (bindingOf(k.id)) dirty.add(k.id); formsDirty = true; runAuto(); }, 4000);
  }).catch(e => {
    // λάθος στην εκκίνηση (π.χ. στην επαναφορά): μήνυμα και κλείσιμο, όχι διεργασία χωρίς παράθυρο που κρατά την εφαρμογή «ανοιχτή»
    console.error('startup', e);
    try { dialog.showErrorBox('Γραφείο Λοχία', 'Η εφαρμογή δεν ξεκίνησε:\n' + (e instanceof Error ? e.message : String(e)) + '\n\nΦάκελος: ' + DATA); } finally { app.exit(1); }
  });
  // Στο κλείσιμο: ό,τι περιμένει να γραφτεί στα Excel και στα έντυπα (το χρονόμετρο των 1,2 δευτ.) γράφεται πριν κλείσει
  // η εφαρμογή, το πολύ για 10 δευτ. Αλλιώς μια αλλαγή λίγο πριν το κλείσιμο δεν θα έφτανε ποτέ στο Excel.
  let quitting = false;
  app.on('before-quit', e => {
    if (quitting || !store || (!dirty.size && !formsDirty && !autoBusy)) return;
    e.preventDefault(); quitting = true; clearTimeout(autoTimer);
    const work = (async () => { while (autoBusy) await new Promise(r => setTimeout(r, 100)); await runAuto(); })();
    Promise.race([work, new Promise(r => setTimeout(r, 10000))]).catch(err => console.error('quit', err)).finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { try { store?.close(); } catch { /* ήδη κλειστή */ } });
}
