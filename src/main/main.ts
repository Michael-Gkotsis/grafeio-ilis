// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store } from './db';
import { apply, type Command } from '../shared/commands';
import { nowHM, today, type ISODate } from '../shared/dates';
import type { Boot, CmdResult, ExportKind, ExportResult, ImportPreview, TemplateInfo } from '../shared/api';
import { fillFroura, fillHkai, fillOuts } from './exports';
import type { ImportRow } from '../shared/commands';

const DEV = !app.isPackaged;
const ROOT = DEV ? process.cwd() : path.dirname(process.execPath);
const BUNDLED = DEV ? process.cwd() : path.join(process.resourcesPath, 'app');

// Φορητή εγκατάσταση: τα δεδομένα δίπλα στο .exe αν ο φάκελος γράφεται, αλλιώς στο προφίλ του χρήστη
function writableDir(dir: string): boolean {
  try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, '.w'); fs.writeFileSync(t, ''); fs.unlinkSync(t); return true; } catch { return false; }
}
const DATA = writableDir(path.join(ROOT, 'data')) ? path.join(ROOT, 'data') : path.join(app.getPath('userData'), 'data');
const USER_TPL = path.join(ROOT, 'templates');   // ο λοχίας μπορεί να βάλει εδώ δική του έκδοση εντύπου
const TPL: { id: ExportKind; name: string; file: string }[] = [
  { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΒΕΝ)', file: 'froura.xlsx' },
  { id: 'hkai', name: 'ΗΚΑΙ (μπροστινο, πισω)', file: 'hkai.xlsx' },
  { id: 'outs', name: 'Εξοδούχοι / Παραμένοντες', file: 'exodouxoi.xlsx' }
];
const tplPath = (file: string) => (fs.existsSync(path.join(USER_TPL, file)) ? path.join(USER_TPL, file) : path.join(BUNDLED, 'templates', file));
const templates = (): TemplateInfo[] => [
  ...TPL.map(t => ({ id: t.id, name: t.name, file: t.file, ok: fs.existsSync(tplPath(t.file)), custom: fs.existsSync(path.join(USER_TPL, t.file)) })),
  { id: 'check', name: 'Έλεγχος υπηρεσιών (μηνιαίο πλέγμα)', file: 'δημιουργείται από την εφαρμογή', ok: true, custom: false }
];

let store: Store;
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

function safeWrite(dir: string, name: string, data: Buffer): string {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(name), base = name.slice(0, -ext.length);
  for (let i = 1; i < 50; i++) {
    const f = path.join(dir, i === 1 ? name : `${base} (${i})${ext}`);
    try { fs.writeFileSync(f, data); return f; }
    catch (e: any) { if (e.code !== 'EBUSY' && e.code !== 'EPERM' && e.code !== 'EACCES') throw e; } // ανοιχτό στο Excel: γράφουμε δίπλα
  }
  throw new Error('Δεν γράφτηκε το αρχείο. Κλείσε το στο Excel και ξαναδοκίμασε.');
}
// το βαρύ ExcelJS φορτώνεται μόνο όταν χρειαστεί
const nodeRequire: NodeRequire = require;
const excel = (): typeof import('./excel') => nodeRequire(path.join(__dirname, 'excel.js'));

async function exportFile(kind: ExportKind, date: ISODate, opts: { open?: boolean }): Promise<ExportResult> {
  try {
    const s = store.state;
    let r: { name: string; data: Buffer; warnings?: string[] };
    if (kind === 'check') r = await excel().dutyCheck(s, date.slice(0, 7));
    else {
      const t = TPL.find(x => x.id === kind)!; const file = tplPath(t.file);
      if (!fs.existsSync(file)) throw new Error('Λείπει το έντυπο ' + t.file + ' από τον φάκελο templates');
      const buf = fs.readFileSync(file);
      r = kind === 'froura' ? await fillFroura(buf, s, date) : kind === 'hkai' ? await fillHkai(buf, s, date) : await fillOuts(buf, s, date);
    }
    const out = safeWrite(path.join(outputDir(), date.slice(0, 7)), r.name, r.data);
    runCmd({ t: 'printed', date, at: nowHM(), files: [path.basename(out)] });
    if (opts.open) shell.openPath(out);
    return { ok: true, file: out, warnings: r.warnings || [] };
  } catch (e) { return fail(e); }
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
    return { ok: true, token, file: path.basename(file), total: r.rows.length, active: r.rows.filter(x => x.active).length, added, updated: r.rows.length - added, missing, warnings: r.warnings, essos: r.essos };
  } catch (e) { return fail(e); }
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
    store = new Store(DATA, path.join(__dirname, 'sql-wasm.wasm'));
    try { await store.open(); }
    catch (e) { dialog.showErrorBox('Γραφείο Ίλης', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA); app.quit(); return; }
    daily(); setInterval(daily, 10 * 60 * 1000);

    ipcMain.handle('boot', (): Boot => ({ state: store.state, audit: store.audit(), dataDir: DATA, outputDir: outputDir(), templatesDir: USER_TPL, version: app.getVersion(), templates: templates() }));
    ipcMain.handle('cmd', (_e, cmd: Command) => runCmd(cmd));
    ipcMain.handle('undo', (): CmdResult => {
      const last = store.lastUndoable(); if (!last) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      try {
        store.revert(last.patch); store.markUndone(last.id);
        store.addAudit({ at: nowHM(), day: today(), text: 'Αναίρεση: ' + last.text, files: [], source: 'app', undoable: false }, null);
        return reply('Αναιρέθηκε: ' + last.text);
      } catch (e) { return fail(e); }
    });
    ipcMain.handle('export', (_e, kind: ExportKind, date: ISODate, opts) => exportFile(kind, date, opts || {}));
    ipcMain.handle('roster:pick', () => pickRoster());
    ipcMain.handle('roster:apply', (_e, token: string, deactivateMissing: boolean) => {
      const p = pending.get(token); if (!p) return fail('Η εισαγωγή έληξε, διάλεξε ξανά το αρχείο');
      pending.delete(token);
      try { store.backup('πριν-εισαγωγή'); } catch { /* συνεχίζουμε */ }
      return runCmd({ t: 'importPeople', rows: p.rows, source: path.basename(p.file), deactivateMissing });
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
  });
  app.on('window-all-closed', () => { try { store?.close(); } catch { /* ήδη κλειστή */ } app.quit(); });
}
