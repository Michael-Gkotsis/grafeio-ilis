// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './db';
import { writeXlsx, LockedError } from './files';
import { preflight, hasErrors } from '../shared/preflight';
import { apply, type Command } from '../shared/commands';
import { dm, dow, nowHM, pskDays, today, type ISODate } from '../shared/dates';
import { mergeFirstSheets } from './xlsx';
import type { Boot, CmdResult, Diag, ExportKind, ExportResult, ImportPreview, TemplateInfo } from '../shared/api';
import { fillFroura, fillHkai, fillOuts, TemplateError, FROURA_FORMS } from './exports';
import type { ImportRow } from '../shared/commands';

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
const templates = (): TemplateInfo[] => [
  ...TPL.map(t => ({ id: t.id, name: t.name, file: t.file, ok: fs.existsSync(tplPath(t.file)), custom: fs.existsSync(path.join(USER_TPL, t.file)) })),
  { id: 'check', name: 'Έλεγχος υπηρεσιών (μηνιαίο πλέγμα)', file: 'δημιουργείται από την εφαρμογή', ok: true, custom: false }
];

let store: Store;
let seenUntil = 0, sessionStart = 0;   // «Τι άλλαξε από το προηγούμενο άνοιγμα»: ενέργειες με id σε (seenUntil, sessionStart]
let win: BrowserWindow | null = null;
const ctx = () => ({ today: today(), newId: () => crypto.randomUUID() });
const outputDir = () => store.state.settings.outputDir || path.join(app.getPath('documents'), 'Γραφείο Ίλης');
const reply = (text: string): CmdResult => ({ ok: true, state: store.state, audit: store.audit(), text });
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

function runCmd(cmd: Command): CmdResult {
  try {
    const r = apply(store.state, cmd, ctx());
    if (r.state !== store.state) {
      const patch = store.commit(r.state);
      const undoable = r.undoable !== false;
      if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable }, undoable ? patch : null);
      else store.flush();
    } else if (r.text) store.addAudit({ at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable: false }, null);
    for (const t of r.extra || []) store.addAudit({ at: nowHM(), day: today(), text: t, files: [], source: 'auto', undoable: false }, null);
    return reply(r.text);
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

async function exportFile(kind: ExportKind, date: ISODate, opts: { open?: boolean; ack?: boolean }): Promise<ExportResult> {
  try {
    const s = store.state;
    // Προέλεγχος: με ✕ δεν βγαίνει έντυπο, με ⚠ χρειάζεται επιβεβαίωση που γράφεται στο ιστορικό
    const checks = preflight(kind, s, date);
    if (hasErrors(checks)) return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη που πρέπει να διορθωθούν πρώτα', checks };
    if (checks.length && !opts.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
    let r: { name: string; data: Buffer; warnings?: string[] };
    if (kind === 'check') r = await excel().dutyCheck(s, date.slice(0, 7));
    else if (kind === 'frouraPsk' || kind === 'outsPsk') {
      // ΠΣΚ: ένα αρχείο, ένα φύλλο ανά ημέρα (Παρ, Σαβ, Κυρ)
      const fr = kind === 'frouraPsk';
      const file = tplPath(fr ? FROURA_FORMS[s.settings.phase || 'sven'].file : 'exodouxoi.xlsx');
      if (!fs.existsSync(file)) throw new Error('Λείπει το έντυπο ' + path.basename(file) + ' από τον φάκελο templates');
      const buf = await fs.promises.readFile(file); const days = pskDays(date);
      const parts = await Promise.all(days.map(d => (fr ? fillFroura(buf, s, d) : fillOuts(buf, s, d))));
      const data = await mergeFirstSheets(parts.map(x => x.data), days.map(d => dow(d).toUpperCase() + ' ' + dm(d).replace('/', '-')));
      r = { name: (fr ? 'ΦΡΟΥΡΑ ' + (s.settings.phase === 'spen' ? 'ΣΠΕΝ ' : '') : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ') + 'ΠΣΚ ' + dm(days[0]).replace('/', '-') + ' έως ' + dm(days[2]).replace('/', '-') + '-' + days[2].slice(0, 4) + '.xlsx', data, warnings: parts.flatMap(x => x.warnings || []) };
    } else {
      const t = kind === 'froura' ? { file: FROURA_FORMS[s.settings.phase || 'sven'].file } : TPL.find(x => x.id === kind)!; const file = tplPath(t.file);
      if (!fs.existsSync(file)) throw new Error('Λείπει το έντυπο ' + t.file + ' από τον φάκελο templates');
      const buf = await fs.promises.readFile(file);
      r = kind === 'froura' ? await fillFroura(buf, s, date) : kind === 'hkai' ? await fillHkai(buf, s, date) : await fillOuts(buf, s, date);
    }
    const out = await writeXlsx(path.join(outputDir(), date.slice(0, 7)), r.name, r.data);
    for (const d of kind === 'frouraPsk' || kind === 'outsPsk' ? pskDays(date) : [date]) runCmd({ t: 'printed', date: d, at: nowHM(), files: [path.basename(out)] });
    for (const c of checks) store.addAudit({ at: nowHM(), day: today(), text: 'Βγήκε ' + path.basename(out) + ' με προειδοποίηση: ' + c.text, files: [], source: 'app', undoable: false }, null);
    if (opts.open) shell.openPath(out);
    return { ok: true, file: out, warnings: r.warnings || [] };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    if (e instanceof TemplateError) return { ok: false, error: e.message, checks: [{ level: 'err', text: e.message }] };
    return fail(e);
  }
}

const pending = new Map<string, { rows: ImportRow[]; file: string }>();
async function pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null> {
  const res = await dialog.showOpenDialog(win!, { title: 'Δυναμολόγιο', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] });
  if (res.canceled || !res.filePaths[0]) return null;
  try {
    const file = res.filePaths[0];
    const r = await excel().readRoster(file);
    if (!r.rows.length) return { ok: false, error: r.warnings[0] || 'Δεν βρέθηκαν άτομα στο αρχείο' };
    const sim = apply(store.state, { t: 'importPeople', rows: r.rows, source: path.basename(file), deactivateMissing: true }, ctx()).state;
    const before = new Set(store.state.people.map(p => p.id));
    const added = sim.people.filter(p => !before.has(p.id)).length;
    const missing = sim.people.filter(p => before.has(p.id) && !p.active && store.state.people.find(q => q.id === p.id)!.active && !r.rows.some(x => x.asm && x.asm === p.asm)).length;
    const token = crypto.randomUUID(); pending.set(token, { rows: r.rows, file });
    return { ok: true, token, file: path.basename(file), total: r.rows.length, active: r.rows.filter(x => x.active).length, added, updated: r.rows.length - added, missing, warnings: r.warnings, essos: r.essos, skipped: r.skipped, declared: r.declared, found: r.found, suspicious: r.suspicious };
  } catch (e) { return fail(e); }
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
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 600, show: false, title: 'Γραφείο Ίλης', backgroundColor: '#f4f5f0',
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

    ipcMain.handle('boot', (): Boot => ({ state: store.state, audit: store.audit(), dataDir: DATA, outputDir: outputDir(), templatesDir: USER_TPL, version: app.getVersion(), templates: templates(), lastUsb: readMeta().lastUsb || null, seenUntil, sessionStart }));
    ipcMain.handle('cmd', (_e, cmd: Command) => runCmd(cmd));
    ipcMain.handle('undo', (): CmdResult => {
      const last = store.lastUndoable(); if (!last) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      try {
        store.revert(last.patch); store.markUndone(last.id);
        store.addAudit({ at: nowHM(), day: today(), text: 'Αναίρεση: ' + last.text, files: [], source: 'app', undoable: false }, null);
        return reply('Αναιρέθηκε: ' + last.text);
      } catch (e) { return fail(e); }
    });
    ipcMain.handle('export', (_e, kind: ExportKind, date: ISODate, opts) => exportGuarded(kind, date, opts || {}));
    ipcMain.handle('roster:pick', () => pickRoster());
    ipcMain.handle('roster:apply', (_e, token: string, deactivateMissing: boolean) => {
      const p = pending.get(token); if (!p) return fail('Η εισαγωγή έληξε, διάλεξε ξανά το αρχείο');
      pending.delete(token);
      try { store.backup('πριν-εισαγωγή'); } catch (e) { return fail('Δεν πάρθηκε αντίγραφο ασφαλείας πριν την εισαγωγή: ' + String(e)); }
      return runCmd({ t: 'importPeople', rows: p.rows, source: path.basename(p.file), deactivateMissing });
    });
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
