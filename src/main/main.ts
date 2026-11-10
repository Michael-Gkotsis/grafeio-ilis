// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './db';
import { copyDurable, writeJson } from './files';
// The bare imports keep the module evaluation order of the file: their code moved into features/exports,
// features/sources and features/reports, but they must still be evaluated at this position, before app/paths.ts runs
// setPath('userData').
import '../shared/preflight';
import '../shared/commands';
import { nowHM, nowParts, today } from '../shared/dates';
import './xlsx';
import './ziphash';
import { off, useWorker, warmWorker, workerUp } from './offload';
import { handle, handleGuarded, handlePrint } from './ipc/handle';
import type {
  Boot,
  CmdResult,
  Diag,
  DirTarget,
  EssoArchiveInfo,
  EssoInfo,
  EssoResult,
  EssoStart,
  FormInfo,
} from '../shared/api';
import { setBookReader, readBook, stamp } from './sources';
import {
  FORM_KINDS,
  KIND,
  KINDS,
  NEW_KINDS,
  canCreate,
  detectHkai,
  inRoster,
  type FormBinding,
  type FormKind,
  type ListKind,
  type SourceBinding,
} from '../shared/sources';
import { normGreek } from '../shared/text';
import '../shared/cadreSource';
import './hdDocx';
import {
  cleanOpts,
  infoOf,
  openBook,
  previewHtml,
  printDefaults,
  printKey,
  rememberedSheets,
  renderOpen,
  sectionsHtml,
  sheetFontSize,
  type PrintOpts,
} from './print';
import './reports';
import type { AppState } from '../shared/domain';
import { ESSO_SERIES, currentEsso, essoName, freshState, parseEsso, restoredPath } from '../shared/esso';
import { SOURCES_FILE, listArchives, readArchive, writeArchive } from './esso';
import { hkRowsOf } from '../shared/ranks';
import { createUpdater } from './updater';
import './app/tables';
import type { NewOut, PrintJob } from './app/types';
import {
  autoBusy, autoTimer, dirty, formsDirty, pending, seenUntil, sessionStart, store, win,
  setFormsDirty, setSeenUntil, setSessionStart, setStore, setWin,
} from './app/state';
import { fail, onCommandApplied, registerCommandsIpc, reply, runCmd, snapshot } from './features/commands';
import { newDir, outputDir } from './app/dirs';
import { serial } from './app/serial';
// The exports feature (and, through it, app/paths.ts) is evaluated right before the last two imports below.
import {
  formBinding, formTpl, onPrintPreview, readOuts, registerExportsIpc, registerHdIpc, registerImerIpc, templates,
  writeOuts,
} from './features/exports';
// bindings/autowrite stay after the exports import: app/bindings reads DATA, so app/paths.ts must not run earlier.
import { bindingOf, srcMeta } from './app/bindings';
import {
  HOLD_RESTORE, HOLD_UNDO, daily, hold, holdAll, kindsOf, onAutoWriteDeps, retryPending, runAuto, scheduleAuto,
  writeLog,
} from './features/autowrite';
import {
  afterRoster, createNew, notify, registerRosterIpc, registerSourcesIpc, registerSourcesWriteIpc, rosterPreview,
} from './features/sources';
import {
  regenReports, registerLayoutPreviewIpc, registerReportFilesIpc, registerReportPreviewIpc, registerReportRunIpc,
  registerReportTemplatesIpc,
} from './features/reports';
import { msgOf } from './app/errors';
// These two stay the LAST imports: app/paths.ts runs app.setPath('userData', ...) when it is evaluated, which must stay
// after every other imported module and before this file's body (as when it was a line of this file).
import {
  BACKUPS,
  DATA,
  DATA_AT,
  DEV,
  DOCS,
  USB_DIR,
  USB_KEEP,
  USER_TPL,
  archiveRoot,
  writableDir,
} from './app/paths';
import { FLAGS, readFlags, readMeta, writeMeta } from './app/meta';

const T0 = Date.now();
// GPU switch and Chromium switches stay here, at their boot position: flags.json is read by app/meta.ts.
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
// Ελληνικά για το Chromium: τα πεδία ημερομηνίας δείχνουν ημέρα/μήνα/έτος και σε Windows με αγγλικές ρυθμίσεις (αλλιώς μήνας/ημέρα)
app.commandLine.appendSwitch('lang', 'el');
const dirOf = (t: DirTarget) =>
  t === 'output' ? outputDir() : 'form' in t ? formBinding(t.form).dir || outputDir() : newDir(t.kind);
// runCmd (features/commands) may not import this file: it calls the auto-write scheduling through this hook, which is
// installed while main.ts loads, before any command can run.
onCommandApplied((prev, next) => scheduleAuto(prev, next));
onPrintPreview(printPreview);
// runAuto (features/autowrite) calls the status push (features/sources, which imports autowrite) and the report writer
// (features/reports, which imports autowrite's autoReps and logWrite): either import would be a cycle, so main.ts hands
// both over.
onAutoWriteDeps({ notify, regenReports });

// Έντυπο: φύλλα του template και (ΗΚΑΙ) πού βρέθηκαν οι γραμμές και οι στήλες
async function formInfo(f: FormKind, file?: string): Promise<FormInfo | { ok: false; error: string }> {
  if (f === 'check') return { ok: true, file: '', custom: false, sheets: [], sheet: '' };
  try {
    const b = formBinding(f);
    const src = file || formTpl(f);
    const book = await readBook(src, 120, 40);
    const names = book.sheets.map((x) => x.name);
    const has = (n?: string) => (n && names.includes(n) ? n : undefined);
    const find = (re: RegExp) =>
      book.sheets.find(
        (x) =>
          re.test(normGreek(x.name)) ||
          x.rows.slice(0, 12).some((r) => (r || []).some((v) => typeof v === 'string' && re.test(normGreek(v)))),
      )?.name;
    const keep = !file || (b.file && path.resolve(b.file) === path.resolve(file));
    const custom = !!file || !!b.file;
    if (f === 'hkai') {
      const scored = book.sheets
        .map((x) => ({ x, d: detectHkai(x, store.state.settings.place) }))
        .sort((a, c) => c.d.found - a.d.found);
      const front = (keep && has(b.sheet)) || scored[0]?.x.name || names[0];
      const back =
        (keep && has(b.sheet2)) ||
        find(/ΑΠΟΦΑΣΕΙΣ|ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|ΦΡΟΥΡΕΣ/) ||
        names.find((n) => n !== front) ||
        front;
      const d = detectHkai(
        book.sheets.find((x) => x.name === front)!,
        store.state.settings.place,
        [...hkRowsOf(store.state.settings.lists).own],
        store.state.settings.lists?.hkNames,
      );
      if (keep && b.cells)
        d.map = {
          title: b.cells.title || d.map.title,
          date: b.cells.date || d.map.date,
          rows: { ...d.map.rows, ...(b.cells.rows || {}) },
          cols: { ...d.map.cols, ...(b.cells.cols || {}) },
        };
      return { ok: true, file: src, custom, sheets: names, sheet: front, sheet2: back, hkai: d };
    }
    if (f === 'outs')
      return {
        ok: true,
        file: src,
        custom,
        sheets: names,
        sheet: (keep && has(b.sheet)) || find(/ΕΞΟΔΟΥΧ/) || names[0],
        sheet2: (keep && has(b.sheet2)) || find(/ΠΑΡΑΜΕΝ/) || names[1] || names[0],
      };
    return {
      ok: true,
      file: src,
      custom,
      sheets: names,
      sheet: (keep && has(b.sheet)) || find(/ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ|ΦΡΟΥΡΑ/) || names[0],
    };
  } catch (e) {
    return fail(e);
  }
}
// Ο χρήστης ανοίγει μόνο αρχεία και φακέλους που ξέρει η εφαρμογή (πηγές, templates, έντυπα που βγήκαν)
function knownPath(file: string): boolean {
  const f = path.resolve(file);
  const known = [
    ...Object.values(store.state.settings.sources || {}).map((b) => b && b.file),
    ...Object.values(store.state.settings.forms || {}).map((b) => b && b.file),
    ...readOuts().map((o) => o.file),
    ...Object.values(readMeta().repSheets || {}).map((x) => x.file),
    ...Object.values(readMeta().repHist || {})
      .flat()
      .map((x) => x.file),
  ]
    .filter(Boolean)
    .map((x) => path.resolve(x as string));
  return known.some((k) => k === f || path.dirname(k) === f);
}

// ------------------------------------------------------------------ Εκτύπωση χωρίς Excel (print.ts): προεπισκόπηση και διάλογος εκτυπωτή των Windows
const printJobs = new Map<number, PrintJob>(); // ανά παράθυρο προεπισκόπησης (webContents)
// οι ρυθμίσεις του εντύπου: οι αποθηκευμένες (χωρίς τις αλλαγές σελίδας, που αφορούν μόνο το σημερινό), αλλιώς οι αρχικές του
function printPrefs(key: string, base: PrintOpts): { opts: PrintOpts; remember: boolean } {
  const saved = readMeta().printPrefs?.[key];
  return { opts: cleanOpts({ ...(saved || {}), breaks: undefined }, base), remember: true };
}
function savePrintPrefs(key: string, o: PrintOpts | null) {
  const all = { ...(readMeta().printPrefs || {}) };
  if (o) {
    const { breaks: _b, ...keep } = o;
    delete all[key];
    all[key] = keep;
  } else delete all[key];
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k]; // τα 200 τελευταία έντυπα
  writeMeta({ printPrefs: all });
}
// fix: έντυπο με «Σταθερό μέγεθος γραμμάτων» (Michael, 4/11): «Όσες χρειάζονται» με τα γράμματα του Excel, πάνω από ό,τι είχε αποθηκευτεί
async function printPage(file: string, sheets?: string[], fix?: boolean): Promise<Omit<PrintJob, 'file'>> {
  const book = await openBook(await fs.promises.readFile(file));
  const key = printKey(file);
  const visible = book.sheets.filter((x) => !x.hidden).map((x) => x.name);
  let base = printDefaults(key, sheets && sheets.length ? sheets : visible);
  const { opts, remember } = printPrefs(key, base);
  if (fix) {
    const sz = await sheetFontSize(book, (sheets && sheets[0]) || visible[0] || '');
    const f = cleanOpts({ pages: 'auto', size: sz }, base);
    base = { ...base, pages: f.pages, size: f.size };
    opts.pages = f.pages;
    opts.size = f.size;
  }
  // τα φύλλα που είχες διαλέξει την προηγούμενη φορά (αν δεν ζητήθηκαν συγκεκριμένα)· αν λείπει κάποιο, η αρχική επιλογή
  const rem = rememberedSheets(opts.sheets, visible);
  if (rem) opts.sheets = rem;
  else delete opts.sheets;
  const want = sheets && sheets.length ? sheets : rem;
  const doc = await renderOpen(book, { file: path.basename(file), sheets: want, layout: opts });
  const tmp = path.join(app.getPath('temp'), 'grafeio-print-' + crypto.randomUUID() + '.html');
  await fs.promises.writeFile(
    tmp,
    previewHtml(doc, path.basename(file), { opts, remember, duplex: !!readMeta().printDuplex }),
  );
  return { tmp, sheets: doc.sheets.map((x) => x.name), book, key, base, opts };
}
// Μία προεπισκόπηση τη φορά («Τύπωσε όλα» στα Έντυπα ημέρας): η επόμενη ανοίγει όταν κλείσει η προηγούμενη
let previewGate: Promise<void> = Promise.resolve();
async function printPreview(
  file: string,
  sheets?: string[],
  fix?: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prev = previewGate;
  let free = () => {};
  previewGate = new Promise<void>((r) => {
    free = r;
  });
  await prev;
  try {
    const p = await printPage(file, sheets, fix);
    const pw = new BrowserWindow({
      parent: win || undefined,
      modal: !!win,
      width: 1280,
      height: 880,
      minWidth: 820,
      minHeight: 520,
      show: false,
      title: 'Εκτύπωση · ' + path.basename(file),
      backgroundColor: '#5f6368',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'print.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    pw.setMenu(null);
    const id = pw.webContents.id;
    printJobs.set(id, { file, ...p });
    pw.once('ready-to-show', () => {
      if (win && win.isMaximized()) pw.maximize();
      pw.show();
    });
    pw.on('closed', () => {
      const j = printJobs.get(id);
      if (j) fs.rmSync(j.tmp, { force: true });
      printJobs.delete(id);
      free();
    });
    try {
      await pw.loadFile(p.tmp);
    } catch (e) {
      pw.destroy();
      throw e;
    }
    return { ok: true };
  } catch (e) {
    free();
    return fail(e);
  }
}

// ------------------------------------------------------------------ ΕΣΣΟ: αρχείο, νέα ΕΣΣΟ, επαναφορά (Ρυθμίσεις › ΕΣΣΟ, Michael 17/10)
// ο φάκελος της νέας ΕΣΣΟ φτιάχνεται δίπλα στον τωρινό αν αυτός είναι φάκελος ΕΣΣΟ («Β΄ ΕΣΣΟ 2026»), αλλιώς στα Έγγραφα
const newRoot = () => {
  const o = outputDir();
  return parseEsso(path.basename(o)) ? path.dirname(o) : DOCS();
};
const essoDirs = new Set<string>(); // φάκελοι που διάλεξε ο χρήστης στους διαλόγους της ΕΣΣΟ
const sameDir = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const okEssoDir = (d: unknown): d is string =>
  typeof d === 'string' && !!d && [archiveRoot(), ...essoDirs].some((x) => sameDir(x, d));
const knownArchives = () => (readMeta().essoArchives || []).filter((d) => typeof d === 'string');
let essoBusy = false;
// Ό,τι περιμένει να γραφτεί στα Excel γράφεται πριν μπουν στο αρχείο
async function settleAuto() {
  clearTimeout(autoTimer);
  while (autoBusy) await new Promise((r) => setTimeout(r, 100));
  await runAuto();
}
// Τα Excel της τωρινής ΕΣΣΟ: οι πηγές κάθε είδους και τα δικά σου templates εντύπων
function essoFiles(s: AppState): { orig: string; kind?: ListKind; form?: FormKind; label: string }[] {
  const st = s.settings;
  return [
    ...(Object.entries(st.sources || {}) as [ListKind, SourceBinding | undefined][])
      .filter(([, b]) => b?.file)
      .map(([k, b]) => ({ orig: b!.file, kind: k, label: KIND[k]?.label || k })),
    ...(Object.entries(st.forms || {}) as [FormKind, FormBinding | undefined][])
      .filter(([, b]) => b?.file)
      .map(([f, b]) => ({ orig: b!.file!, form: f, label: 'Template ' + f })),
  ];
}
const outDirsOf = (s: AppState) => [
  ...new Set(
    [
      outputDir(),
      ...Object.values(s.settings.forms || {}).map((b) => b?.dir),
      ...Object.values(s.settings.newDirs || {}),
    ].filter((x): x is string => !!x),
  ),
];
// Η τωρινή ΕΣΣΟ στο αρχείο: φάκελος με βάση, Excel, sources.json και ΕΣΣΟ.json. Ένα γράψιμο αρχείων τη φορά (serial).
function archiveNow(root: string) {
  const s = store.state;
  const e = currentEsso(s);
  const r = writeArchive({
    root,
    day: today(),
    db: store.data(),
    files: essoFiles(s).map(({ orig, kind, form }) => ({ orig, ...(kind ? { kind } : {}), ...(form ? { form } : {}) })),
    sources: srcMeta.dump(),
    manifest: {
      app: 'grafeio-ilis',
      v: 1,
      name: e ? essoName(e) : 'ΕΣΣΟ',
      ...(e ? { esso: e } : {}),
      at: today() + ' ' + nowHM(),
      version: app.getVersion(),
      people: s.people.filter((p) => p.active).length,
      outDirs: outDirsOf(s),
    },
  });
  writeMeta({ essoArchives: [r.dir, ...knownArchives().filter((d) => !sameDir(d, r.dir))].slice(0, 50) });
  return r;
}
function essoInfo(): EssoInfo {
  const s = store.state;
  const seen = new Set<string>();
  const archives: EssoArchiveInfo[] = [];
  const add = (dir: string, m: { name: string; at: string; people: number; files: unknown[] }) => {
    const k = path.resolve(dir).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    archives.push({
      dir,
      name: m.name,
      at: m.at,
      people: m.people,
      files: new Set(m.files.map((f: any) => f.copy)).size,
    });
  };
  for (const d of knownArchives()) {
    const r = readArchive(d);
    if (r.ok) add(d, r.manifest);
  }
  for (const x of listArchives(archiveRoot())) add(x.dir, x.manifest);
  archives.sort((a, b) => b.at.localeCompare(a.at));
  return {
    people: s.people.filter((p) => p.active).length,
    files: essoFiles(s).map((f) => ({ label: f.label, file: f.orig, exists: fs.existsSync(f.orig) })),
    outDirs: outDirsOf(s),
    archiveRoot: archiveRoot(),
    newRoot: newRoot(),
    archives,
  };
}
// Αντίγραφο στον φάκελο της νέας ΕΣΣΟ με το ίδιο όνομα (και επέκταση), χωρίς να πατήσει υπάρχον
function copyInto(dir: string, file: string): string {
  const ext = path.extname(file),
    stem = path.basename(file, ext);
  for (let i = 1; ; i++) {
    const f = path.join(dir, stem + (i > 1 ? ' (' + i + ')' : '') + ext);
    if (sameDir(f, file)) return f;
    if (!fs.existsSync(f)) {
      fs.mkdirSync(dir, { recursive: true });
      copyDurable(file, f);
      return f;
    }
  }
}
// Νέα ΕΣΣΟ: 1. αρχείο της τωρινής (αν δεν γραφτεί, δεν αλλάζει τίποτα), 2. η βάση ξεκινά για τη νέα (freshState) χωρίς το
// ιστορικό της παλιάς, 3. τα Excel της νέας στον φάκελό της: Δυναμολόγιο με τα φύλλα του (νέο, ή αυτό που σου έδωσαν) και
// έλεγχος υπηρεσιών, όλα συνδεδεμένα. Ό,τι δεν φτιάχτηκε στο 3 λέγεται στο τέλος και φτιάχνεται από τα «Αρχεία Excel».
async function startEsso(o: EssoStart): Promise<EssoResult> {
  const e = o?.esso;
  if (!e || !ESSO_SERIES.includes(e.s) || !Number.isInteger(e.y) || e.y < 2000 || e.y > 2100)
    return fail('Διάλεξε σειρά (Α΄, Β΄, Γ΄ ή Δ΄) και έτος');
  if (!okEssoDir(o.archiveRoot)) return fail('Άγνωστος φάκελος για το αρχείο. Διάλεξέ τον ξανά.');
  if (o.newDir && !okEssoDir(o.newDir)) return fail('Άγνωστος φάκελος για τα νέα Excel. Διάλεξέ τον ξανά.');
  const dir = o.newDir || path.join(newRoot(), essoName(e));
  const ros = o.roster ? pending.get(o.roster) : undefined;
  if (o.roster && !ros) return fail('Η επιλογή του Δυναμολογίου έληξε. Διάλεξέ το ξανά.');
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  for (const d of [o.archiveRoot, dir])
    if (!writableDir(d)) return fail('Δεν γράφεται ο φάκελος ' + d + '. Διάλεξε άλλον (π.χ. στα Έγγραφα ή σε USB).');
  essoBusy = true;
  try {
    await settleAuto();
    const prev = store.state;
    const old = currentEsso(prev);
    let arch: ReturnType<typeof archiveNow>;
    try {
      arch = await serial(async () => archiveNow(o.archiveRoot));
    } catch (err) {
      return fail('Δεν γράφτηκε το αρχείο της προηγούμενης ΕΣΣΟ, οπότε δεν άλλαξε τίποτα: ' + msgOf(err));
    }
    try {
      store.backup('πριν-νέα-ΕΣΣΟ');
    } catch (err) {
      console.error('backup', err);
    } // η βάση είναι ήδη και στο αρχείο
    // τύπος μονάδας και κεφαλίδα από το πρώτο βήμα: ισχύουν ήδη για τα νέα Excel που φτιάχνονται παρακάτω
    const u =
      o.unit &&
      (o.unit.unitKind === 'ili' || o.unit.unitKind === 'lochos') &&
      Array.isArray(o.unit.unit) &&
      o.unit.unit.length === 3 &&
      o.unit.unit.every((x) => typeof x === 'string') &&
      typeof o.unit.unitName === 'string'
        ? {
            unitKind: o.unit.unitKind,
            unit: o.unit.unit.map((x) => x.trim()) as [string, string, string],
            unitName: o.unit.unitName.trim(),
          }
        : undefined;
    try {
      store.transact(() => {
        store.commit(freshState(prev, e, today(), dir, u));
      });
    } catch (err) {
      return fail(
        'Δεν ξεκίνησε η νέα ΕΣΣΟ, η βάση έμεινε όπως ήταν (το αρχείο κρατήθηκε στο ' + arch.dir + '): ' + msgOf(err),
      );
    }
    // ό,τι ήξερε η εφαρμογή για τα παλιά Excel και τα έντυπα που βγήκαν δεν ισχύει πια
    clearTimeout(autoTimer);
    dirty.clear();
    setFormsDirty(false);
    srcMeta.reset();
    writeOuts([]);
    store.clearAudit();
    setSeenUntil(0);
    setSessionStart(0);
    writeMeta({ seenAudit: 0 });
    srcMeta.allow([dir]);
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          'Νέα ΕΣΣΟ: ' +
          essoName(e) +
          '. Η προηγούμενη (' +
          (old ? essoName(old) : 'χωρίς όνομα') +
          ', ' +
          arch.manifest.people +
          ' σε δύναμη) κρατήθηκε στο ' +
          arch.dir +
          ' και ξαναφορτώνεται από Ρυθμίσεις › ΕΣΣΟ › Επαναφορά',
        files: [],
        source: 'app',
        undoable: false,
      },
      null,
    );
    const warnings = arch.missing.map((f) => 'Δεν βρέθηκε (δεν μπήκε στο αρχείο): ' + f);
    const files: string[] = [];
    const made = (k: ListKind, r: NewOut) => {
      if (r.ok) files.push(r.file);
      else warnings.push(KIND[k].label + ': ' + r.error);
    };
    if (ros) {
      // το Δυναμολόγιο της νέας ΕΣΣΟ που σου έδωσαν: αντίγραφο στον φάκελό της, εισαγωγή, και τα φύλλα του για τα υπόλοιπα είδη
      pending.delete(o.roster!);
      try {
        const copy = copyInto(dir, ros.file);
        srcMeta.allow([copy]);
        const r = runCmd({ t: 'importPeople', rows: ros.rows, source: path.basename(copy), deactivateMissing: true });
        if (!r.ok) warnings.push('Δεν μπήκαν οι στρατιώτες από το ' + path.basename(copy) + ': ' + r.error);
        else {
          afterRoster({
            ...ros,
            file: copy,
            binding: ros.binding ? { ...ros.binding, file: copy } : null,
            stamp: stamp(copy) || ros.stamp,
          });
          files.push(copy);
        }
      } catch (err) {
        warnings.push('Δεν αντιγράφηκε το Δυναμολόγιο στο ' + dir + ': ' + msgOf(err));
      }
      if (bindingOf('people'))
        for (const k of NEW_KINDS.filter((x) => inRoster(x) && !bindingOf(x))) made(k, await createNew(k));
      else made('people', await createNew('people'));
    } else made('people', await createNew('people'));
    made('duties', await createNew('duties'));
    notify();
    return { ok: true, archive: arch.dir, dir, files: [...new Set(files)], warnings };
  } finally {
    essoBusy = false;
  }
}
// Επαναφορά ΕΣΣΟ από τον φάκελο του αρχείου της: πρώτα η τωρινή μπαίνει κι αυτή στο αρχείο (για να γυρίσεις σε αυτήν), μετά η
// βάση της παλιάς στη θέση της (όπως στην επαναφορά αντιγράφου) και τα Excel της: εκεί που ήταν, αν υπάρχουν ακόμα, αλλιώς
// τα αντίγραφα του αρχείου. Η εφαρμογή δεν γράφει μόνη της στα Excel μέχρι νέα ανάγνωση (HOLD_RESTORE). Επανεκκίνηση.
async function restoreEsso(dir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!okEssoDir(dir) && !knownArchives().some((d) => sameDir(d, dir)))
    return fail('Άγνωστος φάκελος. Διάλεξέ τον με το «Διάλεξε φάκελο…».');
  const a = readArchive(dir);
  if (!a.ok) return a;
  const bad = store.validate(a.db);
  if (bad) return fail('Η βάση του αρχείου δεν είναι καλή: ' + bad);
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  essoBusy = true;
  try {
    await settleAuto();
    const s0 = store.state;
    let kept = '';
    if (s0.people.length || Object.keys(s0.settings.sources || {}).length) {
      const root = writableDir(path.dirname(dir)) ? path.dirname(dir) : archiveRoot();
      try {
        kept = (await serial(async () => archiveNow(root))).dir;
      } catch (err) {
        return fail('Δεν γράφτηκε αρχείο της τωρινής ΕΣΣΟ, οπότε δεν έγινε η επαναφορά: ' + msgOf(err));
      }
    }
    const db = path.join(DATA, 'ilh.db'),
      tmp = db + '.restore.tmp';
    try {
      copyDurable(a.db, tmp);
      const b2 = store.validate(tmp);
      if (b2) throw new Error(b2);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err));
    }
    try {
      store.backup('πριν-επαναφορά-ΕΣΣΟ');
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      return fail(
        'Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης (' +
          msgOf(err) +
          '). Η βάση έμεινε όπως ήταν.',
      );
    }
    try {
      store.close();
    } catch {
      /* συνεχίζουμε */
    }
    try {
      for (let i = 0; ; i++) {
        try {
          fs.renameSync(tmp, db);
          break;
        } catch (err: any) {
          if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
      }
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      try {
        await store.open();
      } catch (e2) {
        dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2));
        app.exit(1);
      }
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err));
    }
    await store.open();
    const at = (rel: string) => path.join(dir, ...rel.split('/'));
    const re = (f: string) => restoredPath(f, a.manifest, at, fs.existsSync);
    const st = store.state.settings;
    const sources = Object.fromEntries(
      Object.entries(st.sources || {}).map(([k, b]) => [k, b && { ...b, file: re(b.file) }]),
    );
    const forms = Object.fromEntries(
      Object.entries(st.forms || {}).map(([k, b]) => [k, b?.file ? { ...b, file: re(b.file) } : b]),
    );
    store.commit({ ...store.state, settings: { ...st, sources, forms } });
    let sj: any = {};
    try {
      sj = JSON.parse(fs.readFileSync(path.join(dir, SOURCES_FILE), 'utf8')) || {};
    } catch {
      /* χωρίς: όλα ξανά από ανάγνωση */
    }
    srcMeta.reset(sj);
    srcMeta.allow([
      ...Object.values(sources).map((b) => b?.file || ''),
      ...Object.values(forms).flatMap((b) => [b?.file || '', b?.dir || '']),
    ]);
    holdAll(HOLD_RESTORE);
    writeOuts([]);
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          'Επαναφορά ΕΣΣΟ: ' +
          a.manifest.name +
          ' από ' +
          dir +
          (kept ? '. Η ΕΣΣΟ που έτρεχε κρατήθηκε στο ' + kept : ''),
        files: [],
        source: 'app',
        undoable: false,
      },
      null,
    );
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } finally {
    essoBusy = false;
  }
}

let ready = 0;
// Χωρίς δίκτυο και χωρίς άδειες (έρευνα §4.3): ό,τι δεν είναι τοπικό αρχείο δεν φορτώνει
function lockdown() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  if (!DEV) ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/i.test(d.url) }));
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
    wc.on('will-navigate', (ev) => ev.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
// Χαλασμένη βάση: προτείνουμε επαναφορά από το πιο πρόσφατο αντίγραφο που περνά τον έλεγχο
async function recover(reason: string, empty = false): Promise<boolean> {
  const good = listBackups(BACKUPS).find((b) => !store.validate(path.join(BACKUPS, b.name)));
  const db = path.join(DATA, 'ilh.db');
  const aside = () => {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.renameSync(db, path.join(BACKUPS, 'χαλασμένη_' + Date.now() + '.db'));
  };
  if (!good) {
    // άδειο αρχείο χωρίς κανένα αντίγραφο: αλλιώς η εφαρμογή δεν θα άνοιγε ποτέ ξανά. Ξεκινά κενή, και από εκεί
    // γίνεται επαναφορά από USB.
    if (!empty) return false;
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'Γραφείο Λοχία',
      noLink: true,
      buttons: ['Ξεκίνα με κενή βάση', 'Έξοδος'],
      defaultId: 1,
      cancelId: 1,
      message: 'Η βάση δεδομένων είναι άδεια και δεν βρέθηκε αντίγραφο ασφαλείας.',
      detail:
        'Λεπτομέρεια: ' +
        reason +
        '\n\nΑν έχεις αντίγραφο σε USB, ξεκίνα με κενή βάση και κάνε επαναφορά από εκεί (Ρυθμίσεις → Αντίγραφα ασφαλείας → «Φέρε αντίγραφο από USB…»).\nΤο άδειο αρχείο θα κρατηθεί στον φάκελο backups.',
    });
    if (r.response !== 0) return false;
    aside();
    await store.open();
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text: 'Η βάση ήταν άδεια χωρίς αντίγραφο: ξεκίνησε κενή (' + reason + ')',
        files: [],
        source: 'auto',
        undoable: false,
      },
      null,
    );
    return true;
  }
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Γραφείο Λοχία',
    noLink: true,
    buttons: ['Επαναφορά', 'Έξοδος'],
    defaultId: 0,
    cancelId: 1,
    message: empty
      ? 'Η βάση δεδομένων είναι άδεια (π.χ. κόπηκε το ρεύμα την ώρα που γραφόταν).'
      : 'Η βάση δεδομένων φαίνεται χαλασμένη.',
    detail:
      'Λεπτομέρεια: ' +
      reason +
      '\n\nΕπαναφορά από το αντίγραφο ' +
      good.name +
      ';\nΗ χαλασμένη βάση θα κρατηθεί στον φάκελο backups.',
  });
  if (r.response !== 0) return false;
  aside();
  copyDurable(path.join(BACKUPS, good.name), db);
  await store.open();
  holdAll(HOLD_RESTORE);
  store.addAudit(
    {
      at: nowHM(),
      day: today(),
      text:
        'Επαναφορά βάσης από αντίγραφο ' + good.name + ' (η προηγούμενη ήταν ' + (empty ? 'άδεια' : 'χαλασμένη') + ')',
      files: [],
      source: 'auto',
      undoable: false,
    },
    null,
  );
  return true;
}

// Αυτόματη ενημέρωση: ό,τι χρειάζεται το UI (ο έλεγχος και το κατέβασμα γίνονται στον main, βλ. updater.ts)
let upd: ReturnType<typeof createUpdater> | null = null;
function registerUpdate() {
  const on = handleGuarded;
  on(
    'updInfo',
    () => {
      upd?.confirm();
      return upd!.info();
    },
    null as any,
  );
  on('updCheck', () => upd!.check(true), null as any);
  on('updAuto', (v: boolean) => upd!.setAuto(v), null as any);
  on('updStart', () => upd!.start(), undefined);
  on('updCancel', () => upd!.cancel(), undefined);
  on('updSeen', () => upd!.seen(), undefined);
  on('updSkip', () => upd!.skip(), undefined);
  on('updRestart', () => upd!.restart(), undefined);
  on('updFile', () => upd!.fromFile(), { ok: false, error: 'Δεν ξεκίνησε η ενημέρωση' } as any);
  on('updRollback', () => upd!.rollback(), { ok: false, error: 'Δεν έγινε η επιστροφή' });
  on('updOpenReleases', () => upd!.openReleases(), undefined);
}

// IPC registrations by future feature area (Phase 4.2-4.6); the boot closure calls them in the original order.
function registerFormsIpc(pickXlsx: (title: string) => Promise<string | null>) {
  handle('formPick', async (_e, f: FormKind) => {
    const file = await pickXlsx('Template για ' + f);
    if (!file) return null;
    return formInfo(f, file);
  });
  handle('formInfo', (_e, f: FormKind) => formInfo(f));
  handle('formSave', (_e, f: FormKind, b: FormBinding | null) => {
    const cur = formBinding(f);
    if (b?.file && b.file !== cur.file && !srcMeta.allowed(b.file))
      return fail('Άγνωστο αρχείο: διάλεξέ το με το «Template…»');
    if (b?.dir && b.dir !== cur.dir && !srcMeta.allowed(b.dir))
      return fail('Άγνωστος φάκελος: διάλεξέ τον με το «Φάκελος…»');
    const forms = { ...(store.state.settings.forms || {}) };
    if (b && Object.values(b).some((v) => v !== undefined && v !== '')) forms[f] = b;
    else delete forms[f];
    const r = runCmd({
      t: 'setSettings',
      settings: { forms },
      text:
        'έντυπο ' + f + (b?.file ? ': ' + path.basename(b.file) : b?.dir ? ': φάκελος ' + b.dir : ': προεπιλογή'),
    });
    return r.ok ? reply(r.text, false) : r;
  });
  handle('formDir', async (_e, f: FormKind) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος για το έντυπο',
      defaultPath: formBinding(f).dir || outputDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (dir) srcMeta.allow([dir]);
    return dir;
  });
  handle('openPath', (_e, file: string) => {
    if (typeof file === 'string' && /\.xls[xm]?$/i.test(file) && knownPath(file) && fs.existsSync(file))
      return shell.openPath(file);
    return 'άγνωστο αρχείο';
  });
}
function registerPrintIpc() {
  handle('printFile', (_e, file: string, sheet?: string | string[]) => {
    // αρχεία που ξέρει η εφαρμογή ή έντυπα στους φακέλους εξαγωγής (και παλιότερων ημερών)
    const inside = (dir?: string) =>
      !!dir &&
      !path.relative(path.resolve(dir), path.resolve(file)).startsWith('..') &&
      !path.isAbsolute(path.relative(path.resolve(dir), path.resolve(file)));
    const known =
      knownPath(file) ||
      [outputDir(), ...Object.values(store.state.settings.forms || {}).map((b) => b?.dir)].some(inside);
    if (!known || !/\.xls[xm]?$/i.test(file) || !fs.existsSync(file))
      return fail('Δεν βρέθηκε το ' + path.basename(file));
    if (/\.xls$/i.test(file))
      return fail(
        'Το ' +
          path.basename(file) +
          ' είναι παλιό .xls. Άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx για να τυπώνεται από εδώ.',
      );
    return printPreview(
      file,
      Array.isArray(sheet) ? sheet.filter((x) => typeof x === 'string') : sheet ? [sheet] : undefined,
    );
  });
  // από το παράθυρο προεπισκόπησης: νέα διάταξη (σελίδες, προσανατολισμός, φύλλα…) από το ήδη ανοιγμένο Excel
  handlePrint('layout', async (e, req: { opts?: unknown; sheets?: unknown; save?: boolean }) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return fail('Έκλεισε η εκτύπωση');
    try {
      const opts = cleanOpts(req?.opts, job.base);
      const sheets = Array.isArray(req?.sheets)
        ? req!.sheets.filter((x): x is string => typeof x === 'string')
        : job.sheets;
      const doc = await renderOpen(job.book, { file: path.basename(job.file), sheets, layout: opts });
      job.sheets = doc.sheets.map((x) => x.name);
      job.opts = opts;
      if (req?.save) savePrintPrefs(job.key, opts);
      return { ok: true, html: sectionsHtml(doc), css: doc.css, info: infoOf(doc) };
    } catch (err) {
      return fail(err);
    }
  });
  // «Να θυμάται» ξετσεκαρισμένο ή «Αρχικές ρυθμίσεις»: σβήνει τις αποθηκευμένες, γυρίζει τις αρχικές του εντύπου
  handlePrint('forget', (e) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return null;
    savePrintPrefs(job.key, null);
    return job.base;
  });
  handlePrint('duplex', (_e, on: unknown) => {
    writeMeta({ printDuplex: on === true });
  });
}
function registerPrintOutputIpc() {
  // PDF: ίδιο με το χαρτί, στον φάκελο του αρχείου (ή όπου διαλέξει)
  handlePrint('pdf', async (e) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return fail('Έκλεισε η εκτύπωση');
    const pw = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(pw!, {
      title: 'Αποθήκευση PDF',
      defaultPath: path.join(path.dirname(job.file), path.basename(job.file).replace(/\.xls[xm]?$/i, '') + '.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, error: '' };
    try {
      const data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true });
      await fs.promises.writeFile(r.filePath, data);
      store.addAudit(
        {
          at: nowHM(),
          day: today(),
          text: 'PDF ' + path.basename(r.filePath) + ' από ' + path.basename(job.file),
          files: [path.basename(job.file)],
          source: 'app',
          undoable: false,
        },
        null,
      );
      return { ok: true, name: path.basename(r.filePath) };
    } catch (err) {
      return fail(err);
    }
  });
  handlePrint('printers', async (e) => {
    try {
      return (await e.sender.getPrintersAsync()).map((p) => ({
        name: p.name,
        label: p.displayName || p.name,
        def: !!p.isDefault,
      }));
    } catch {
      return [];
    }
  });
}
function registerPrintJobIpc() {
  // Με εκτυπωτή από τη μπάρα: τυπώνει χωρίς τον διάλογο των Windows, ώστε να μένουν το χαρτί και ο προσανατολισμός
  // του φύλλου (ο διάλογος παίρνει τις προεπιλογές του εκτυπωτή, συνήθως κατακόρυφο, και κόβει τα οριζόντια φύλλα)
  handlePrint(
    'print',
    async (
      e,
      o: {
        landscape?: boolean;
        pageSize?: string;
        part?: string;
        device?: string;
        copies?: number;
        duplex?: string;
      },
    ) => {
      const job = printJobs.get(e.sender.id);
      if (!job) return fail('Έκλεισε η εκτύπωση');
      const pageSize = ['A3', 'A4', 'A5', 'Legal', 'Letter'].includes(String(o?.pageSize))
        ? String(o.pageSize)
        : 'A4';
      let device = typeof o?.device === 'string' && o.device ? o.device : '';
      if (device) {
        try {
          if (!(await e.sender.getPrintersAsync()).some((p) => p.name === device)) device = '';
        } catch {
          device = '';
        }
      }
      const copies = Math.min(99, Math.max(1, Math.floor(Number(o?.copies) || 1)));
      const duplexMode = o?.duplex === 'longEdge' || o?.duplex === 'shortEdge' ? o.duplex : 'simplex';
      return new Promise((res) =>
        e.sender.print(
          {
            silent: !!device,
            ...(device ? { deviceName: device, copies, collate: true } : {}),
            printBackground: true,
            landscape: !!o?.landscape,
            pageSize,
            duplexMode,
            margins: { marginType: 'none' },
          },
          (ok, reason) => {
            if (ok)
              store.addAudit(
                {
                  at: nowHM(),
                  day: today(),
                  text:
                    'Εκτύπωση ' +
                    path.basename(job.file) +
                    (job.sheets.length > 1 || o?.part
                      ? ' (' + job.sheets.join(', ') + (o?.part ? ', μέρος ' + o.part : '') + ')'
                      : ''),
                  files: [path.basename(job.file)],
                  source: 'app',
                  undoable: false,
                },
                null,
              );
            res(ok ? { ok: true } : { ok: false, error: reason === 'cancelled' ? '' : 'Δεν τυπώθηκε: ' + reason });
          },
        ),
      );
    },
  );
  handlePrint('close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
}
function registerBackupsIpc() {
  handle('listBackups', () => listBackups(BACKUPS));
  handle('restoreBackup', async (_e, name: string) => {
    const file = path.join(BACKUPS, path.basename(name));
    const bad = fs.existsSync(file) ? store.validate(file) : 'Δεν βρέθηκε το αντίγραφο';
    if (bad) return { ok: false, error: 'Το αντίγραφο δεν είναι καλό: ' + bad };
    // πρώτα αντίγραφο δίπλα στη βάση και έλεγχος· η τωρινή βάση κλείνει μόνο αν αυτό πέτυχε
    const db = path.join(DATA, 'ilh.db'),
      tmp = db + '.restore.tmp';
    try {
      copyDurable(file, tmp);
      const b2 = store.validate(tmp);
      if (b2) throw new Error(b2);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return fail(
        'Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
    // χωρίς αντίγραφο της τωρινής βάσης δεν γίνεται επαναφορά: αλλιώς ό,τι έγινε μετά το αντίγραφο θα χανόταν οριστικά
    try {
      store.backup('πριν-επαναφορά');
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return fail(
        'Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης πριν από αυτή (' +
          (e instanceof Error ? e.message : String(e)) +
          '). Η βάση έμεινε όπως ήταν. Δες αν ο φάκελος data\\backups γράφεται ή αν ο δίσκος είναι γεμάτος.',
      );
    }
    try {
      store.close();
    } catch {
      /* συνεχίζουμε */
    }
    try {
      for (let i = 0; ; i++) {
        try {
          fs.renameSync(tmp, db);
          break;
        } catch (e: any) {
          if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
      }
    } catch (e) {
      // η βάση ξανανοίγει όπως ήταν, ώστε η εφαρμογή να συνεχίσει να δουλεύει
      fs.rmSync(tmp, { force: true });
      try {
        await store.open();
      } catch (e2) {
        dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2));
        app.exit(1);
      }
      return fail(
        'Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
    holdAll(HOLD_RESTORE);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
}
function registerDiagIpc() {
  handle(
    'diag',
    (): Diag => ({
      startupMs: ready - T0,
      procs: app.getAppMetrics().map((m) => ({
        type: m.type,
        kb: m.memory.workingSetSize,
        cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
      })),
      gpuDisabled: !!readFlags().disableGpu,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
      dbKb: Math.round(fs.statSync(path.join(DATA, 'ilh.db')).size / 1024),
      people: store.state.people.length,
      statuses: store.state.statuses.length,
      guardDays: Object.keys(store.state.guards).length,
      dataDir: DATA,
      backups: listBackups(BACKUPS).length,
      writes: writeLog,
      worker: workerUp(),
    }),
  );
  handle('setGpu', (_e, disable: boolean) => {
    writeJson(FLAGS, { ...readFlags(), disableGpu: !!disable });
    app.relaunch();
    app.exit(0);
  });
  // Αντίγραφο σε USB (έρευνα §4.2): αν χαλάσει ο δίσκος του PC, τα δεδομένα είναι αλλού
  handle('usbCopy', async () => {
    const m = readMeta();
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε το USB (ή φάκελο σε άλλο δίσκο)',
      defaultPath: m.usbDir && fs.existsSync(m.usbDir) ? m.usbDir : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const chosen = r.filePaths[0];
    const dir = path.join(chosen, USB_DIR);
    try {
      const file = store.backup('usb', dir);
      const bad = store.validate(file);
      if (bad) {
        fs.rmSync(file, { force: true });
        return { ok: false, error: 'Το αντίγραφο δεν γράφτηκε σωστά (' + bad + '). Δοκίμασε άλλο USB.' };
      }
      listBackups(dir)
        .slice(USB_KEEP)
        .forEach((b) => fs.rmSync(path.join(dir, b.name), { force: true }));
      const day = today();
      writeMeta({ lastUsb: day, usbDir: chosen });
      store.addAudit(
        { at: nowHM(), day, text: 'Αντίγραφο ασφαλείας σε ' + dir, files: [], source: 'app', undoable: false },
        null,
      );
      const same =
        path.parse(path.resolve(chosen)).root.toLowerCase() === path.parse(path.resolve(DATA)).root.toLowerCase();
      return {
        ok: true,
        file,
        day,
        warning: same
          ? 'Ο φάκελος είναι στον ίδιο δίσκο με την εφαρμογή. Αν χαλάσει ο δίσκος, χάνεται και το αντίγραφο. Προτίμησε USB.'
          : undefined,
      };
    } catch (e) {
      return fail('Δεν γράφτηκε στο ' + chosen + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  });
}
function registerBackupFoldersIpc() {
  // Φέρνει ένα αντίγραφο από USB στη λίστα αντιγράφων, για να γίνει επαναφορά από εκεί (π.χ. σε καινούργιο PC)
  handle('importBackup', async () => {
    const m = readMeta();
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε αντίγραφο (ilh_….db)',
      defaultPath: m.usbDir ? path.join(m.usbDir, USB_DIR) : undefined,
      filters: [{ name: 'Αντίγραφο Γραφείου Ίλης', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const bad = store.validate(src);
    if (bad) return { ok: false, error: 'Το αρχείο δεν είναι καλό αντίγραφο: ' + bad };
    const d = nowParts();
    const name =
      'ilh_' + today() + '_' + [d.h, d.mi, d.s].map((n) => String(n).padStart(2, '0')).join('') + '_από-αρχείο.db';
    fs.mkdirSync(BACKUPS, { recursive: true });
    copyDurable(src, path.join(BACKUPS, name));
    return { ok: true, name };
  });
  handle('backup', () => {
    try {
      return { ok: true, file: store.backup('χειροκίνητο') };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
  handle('openFolder', (_e, which: string) => {
    const dir =
      which === 'output'
        ? outputDir()
        : which === 'templates'
          ? USER_TPL
          : which === 'backups'
            ? path.join(DATA, 'backups')
            : DATA;
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
  handle('chooseOutputDir', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος για τα Excel',
      defaultPath: outputDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    runCmd({
      t: 'setSettings',
      settings: { outputDir: r.filePaths[0] },
      text: 'φάκελος αρχείων ' + r.filePaths[0],
    });
    return r.filePaths[0];
  });
}
function registerDirsIpc() {
  // Φάκελοι αρχείων (Ρυθμίσεις): ο γενικός, ένας ανά έντυπο και ένας ανά είδος για τα νέα Excel. Κενό = ο γενικός.
  const setDir = (t: DirTarget, dir: string | undefined, what: string) => {
    if (t === 'output')
      return runCmd({ t: 'setSettings', settings: { outputDir: dir || '' }, text: 'φάκελος αρχείων ' + what });
    if ('form' in t) {
      const forms = { ...(store.state.settings.forms || {}) };
      const b = { ...formBinding(t.form), dir };
      if (Object.values(b).some((v) => v !== undefined && v !== '')) forms[t.form] = b;
      else delete forms[t.form];
      return runCmd({
        t: 'setSettings',
        settings: { forms },
        text: 'φάκελος για το έντυπο ' + t.form + ': ' + what,
      });
    }
    const newDirs = { ...(store.state.settings.newDirs || {}) };
    if (dir) newDirs[t.kind] = dir;
    else delete newDirs[t.kind];
    return runCmd({
      t: 'setSettings',
      settings: { newDirs },
      text: 'φάκελος για νέα Excel (' + KIND[t.kind].label + '): ' + what,
    });
  };
  const okTarget = (t: DirTarget) =>
    t === 'output' ||
    (!!t &&
      typeof t === 'object' &&
      (('form' in t && FORM_KINDS.includes(t.form)) || ('kind' in t && canCreate(t.kind))));
  handle('dirChoose', async (_e, t: DirTarget) => {
    if (!okTarget(t)) return fail('άγνωστος φάκελος');
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε φάκελο',
      defaultPath: dirOf(t),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = r.filePaths[0];
    if (!writableDir(dir)) return fail('Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλον.');
    const c = setDir(t, dir, dir);
    return c.ok ? reply(c.text, false) : c;
  });
  handle('dirReset', (_e, t: DirTarget) => {
    if (!okTarget(t)) return fail('άγνωστος φάκελος');
    const c = setDir(t, undefined, t === 'output' ? 'προεπιλογή' : 'ο γενικός');
    return c.ok ? reply(c.text, false) : c;
  });
  handle('dirOpen', (_e, t: DirTarget) => {
    if (!okTarget(t)) return 'άγνωστος φάκελος';
    const dir = dirOf(t);
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
}
function registerEssoIpc() {
  // ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ)
  handle('essoInfo', () => essoInfo());
  handle('essoDir', async (_e, def?: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε φάκελο',
      defaultPath: typeof def === 'string' && def ? def : DOCS(),
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (dir) essoDirs.add(dir);
    return dir;
  });
  handle('essoRoster', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Δυναμολόγιο της νέας ΕΣΣΟ',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return rosterPreview(res.filePaths[0], null);
  });
  handle('essoStart', (_e, o: EssoStart) => startEsso(o));
  handle('essoPick', async (): Promise<EssoArchiveInfo | { ok: false; error: string } | null> => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος αρχείου ΕΣΣΟ (με το ΕΣΣΟ.json)',
      defaultPath: fs.existsSync(archiveRoot()) ? archiveRoot() : DOCS(),
      properties: ['openDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (!dir) return null;
    const a = readArchive(dir);
    if (!a.ok) return a;
    essoDirs.add(dir);
    return {
      dir,
      name: a.manifest.name,
      at: a.manifest.at,
      people: a.manifest.people,
      files: new Set(a.manifest.files.map((f) => f.copy)).size,
    };
  });
  handle('essoRestore', (_e, dir: string) => restoreEsso(dir));
  handle('essoOpen', (_e, dir: string) => {
    if (
      typeof dir !== 'string' ||
      !(
        okEssoDir(dir) ||
        knownArchives().some((d) => sameDir(d, dir)) ||
        sameDir(dir, outputDir()) ||
        sameDir(dir, newRoot())
      ) ||
      !fs.existsSync(dir)
    )
      return 'άγνωστος φάκελος';
    return shell.openPath(dir);
  });
}
function createWindow() {
  const icon = path.join(__dirname, '..', 'renderer', 'icon.png'); // λογότυπο στη γραμμή εργασιών (στο dev μπορεί να λείπει)
  setWin(new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 600,
    show: false,
    title: 'Γραφείο Λοχία',
    backgroundColor: '#f4f5f0',
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  }));
  win!.once('ready-to-show', () => {
    win!.maximize();
    win!.show();
  });
  // καμία πλοήγηση ή νέο παράθυρο προς τα έξω
  win!.webContents.on('will-navigate', (e) => e.preventDefault());
  win!.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV && process.env.VITE_URL) win!.loadURL(process.env.VITE_URL);
  else win!.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win!.on('closed', () => {
    setWin(null);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      // Αυτόματη ενημέρωση: αν περιμένει αλλαγή του resources\app (ή η νέα έκδοση απέτυχε 2 φορές), γίνεται ΠΡΙΝ ανοίξει παράθυρο
      try {
        upd = createUpdater({ dataDir: DATA, getWin: () => win, backup: (l) => store.backup(l), today });
        if (upd.startup()) return;
      } catch (e) {
        console.error('update', e);
      }
      Menu.setApplicationMenu(DEV ? Menu.buildFromTemplate([{ role: 'viewMenu' }]) : null);
      lockdown();
      // το νήμα των Excel: ανάγνωση, έντυπα και εγγραφή στο Δυναμολόγιο χωρίς να παγώνει το παράθυρο
      useWorker(path.join(__dirname, 'worker.js'));
      setBookReader((f) => off('readBook', [f], () => readBook(f)));
      setStore(new Store(DATA, path.join(__dirname, 'sql-wasm.wasm')));
      try {
        await store.open();
      } catch (e) {
        if (!(e instanceof CorruptDbError) || !(await recover(String(e.message), e.empty))) {
          dialog.showErrorBox('Γραφείο Λοχία', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA);
          app.quit();
          return;
        }
      }
      daily();
      setInterval(daily, 10 * 60 * 1000);
      // τα αρχεία που είναι ήδη ορισμένα (από παλιότερη έκδοση) είναι γνωστά
      const st0 = store.state.settings;
      srcMeta.allow([
        ...Object.values(st0.sources || {}).map((x) => x?.file || ''),
        ...Object.values(st0.forms || {}).flatMap((x) => [x?.file || '', x?.dir || '']),
      ]);
      setSessionStart(store.audit(1)[0]?.id || 0);
      const meta = readMeta();
      setSeenUntil(
        typeof meta.seenAudit === 'number' && meta.seenAudit <= sessionStart ? meta.seenAudit : sessionStart,
      );
      writeMeta({ seenAudit: sessionStart });

      handle(
        'boot',
        (): Boot => ({
          ...snapshot(),
          dataDir: DATA,
          outputDir: outputDir(),
          templatesDir: USER_TPL,
          version: app.getVersion(),
          templates: templates(),
          lastUsb: readMeta().lastUsb || null,
          seenUntil,
          sessionStart,
          dataFallback: DATA_AT.fallback,
        }),
      );
      const answer = (r: ReturnType<typeof runCmd>): CmdResult => (r.ok ? reply(r.text) : r);
      // αρχεία και φάκελοι αλλάζουν μόνο από τους διαλόγους του main (src:save, form:save, φάκελοι), όχι με εντολή από το UI
      const MAIN_ONLY = ['sources', 'forms', 'outputDir', 'newDirs'];
      registerCommandsIpc(answer, MAIN_ONLY, { daily, hold, kindsOf, HOLD_UNDO, scheduleAuto, notify });
      registerExportsIpc();
      registerHdIpc();
      registerImerIpc();
      registerReportTemplatesIpc();
      registerReportPreviewIpc();
      registerLayoutPreviewIpc();
      registerReportRunIpc({ printPreview });
      registerReportFilesIpc();
      registerRosterIpc(answer);
      // Αρχεία Excel
      const pickXlsx = async (title: string) => {
        const res = await dialog.showOpenDialog(win!, {
          title,
          filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }],
          properties: ['openFile'],
        });
        const file = res.canceled ? null : res.filePaths[0] || null;
        if (file) srcMeta.allow([file]);
        return file;
      };
      registerSourcesIpc(pickXlsx);
      registerSourcesWriteIpc();
      registerFormsIpc(pickXlsx);
      registerPrintIpc();
      registerPrintOutputIpc();
      registerPrintJobIpc();
      setInterval(retryPending, 60 * 1000);
      registerBackupsIpc();
      registerDiagIpc();
      registerBackupFoldersIpc();
      registerDirsIpc();
      registerEssoIpc();
      registerUpdate();
      createWindow();
      ready = Date.now();
      win?.once('ready-to-show', () => {
        try {
          upd?.schedule();
        } catch {
          /* σιωπηλά */
        }
      });
      // Στην εκκίνηση: ό,τι δεν πρόλαβε να γραφτεί την προηγούμενη φορά (κλείσιμο, ρεύμα). Γράφεται μόνο ό,τι λείπει από τα
      // Excel και μόνο όπου ο πίνακας δεν άλλαξε στο μεταξύ, όπως σε κάθε αυτόματη εγγραφή.
      setTimeout(warmWorker, 2500);
      setTimeout(() => {
        for (const k of KINDS) if (bindingOf(k.id)) dirty.add(k.id);
        setFormsDirty(true);
        runAuto();
      }, 4000);
    })
    .catch((e) => {
      // λάθος στην εκκίνηση (π.χ. στην επαναφορά): μήνυμα και κλείσιμο, όχι διεργασία χωρίς παράθυρο που κρατά την εφαρμογή «ανοιχτή»
      console.error('startup', e);
      try {
        dialog.showErrorBox(
          'Γραφείο Λοχία',
          'Η εφαρμογή δεν ξεκίνησε:\n' + (e instanceof Error ? e.message : String(e)) + '\n\nΦάκελος: ' + DATA,
        );
      } finally {
        app.exit(1);
      }
    });
  // Στο κλείσιμο: ό,τι περιμένει να γραφτεί στα Excel και στα έντυπα (το χρονόμετρο των 1,2 δευτ.) γράφεται πριν κλείσει
  // η εφαρμογή, το πολύ για 10 δευτ. Αλλιώς μια αλλαγή λίγο πριν το κλείσιμο δεν θα έφτανε ποτέ στο Excel.
  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting || !store || (!dirty.size && !formsDirty && !autoBusy)) return;
    e.preventDefault();
    quitting = true;
    clearTimeout(autoTimer);
    const work = (async () => {
      while (autoBusy) await new Promise((r) => setTimeout(r, 100));
      await runAuto();
    })();
    Promise.race([work, new Promise((r) => setTimeout(r, 10000))])
      .catch((err) => console.error('quit', err))
      .finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    try {
      store?.close();
    } catch {
      /* ήδη κλειστή */
    }
    try {
      upd?.atQuit();
    } catch {
      /* θα ξαναδοκιμαστεί στην επόμενη εκκίνηση */
    }
  });
}
