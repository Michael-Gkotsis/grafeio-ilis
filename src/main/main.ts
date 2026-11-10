// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './db';
import {
  copyDurable,
  writeAll,
  writeJson,
  freeName,
  isLocked,
  ChangedError,
  LockedError,
} from './files';
// The next three bare imports keep the module evaluation order of the file: their code moved into features/exports,
// but they must still be evaluated at this position, before app/paths.ts runs setPath('userData').
import '../shared/preflight';
import { apply, rosterChanges, type Command } from '../shared/commands';
import { nowHM, nowParts, today, type ISODate } from '../shared/dates';
import { Workbook, sheetSafe } from './xlsx';
import './ziphash';
import { off, useWorker, warmWorker, workerUp } from './offload';
import { eventChannel, handle, handleGuarded, handlePrint } from './ipc/handle';
import type { Fail, LayoutPv, LayoutReq } from '../shared/api';
import type { LayoutSheet } from '../shared/layout';
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
  ImportPreview,
  SourceBook,
  SourceStatus,
  WritePreview,
} from '../shared/api';
import {
  PREV_EVERY,
  OldFormatError,
  bookNow,
  setBookReader,
  locateCheck,
  readBook,
  stamp,
  syncStamp,
  syncStampNow,
  tableState,
  tidyPreview,
  type SourceMeta,
} from './sources';
import { withRoomExtras } from '../shared/roomExtra';
import { parseRoster, type CellValue, type RawSheet, type RosterOverride } from '../shared/roster';
import {
  FORM_KINDS,
  KIND,
  KINDS,
  colLetter,
  timeCols,
  capExtraCols,
  NEW_KINDS,
  ambiguousLines,
  dutiesBinding,
  dutiesSheet,
  canCreate,
  baseOf,
  bestFor,
  refitCols,
  keepHeads,
  bindingMonth,
  defaultBinding,
  describeSets,
  detectHkai,
  detectTables,
  diffStatuses,
  inRoster,
  isCadreKind,
  sheetHost,
  isStatusKind,
  parseStatuses,
  planPeopleWrite,
  planSource,
  snapFromSheet,
  snapPeople,
  rowName,
  stepRows,
  withRows,
  tableHash,
  type FormBinding,
  type FormKind,
  type ListKind,
  type SourceBinding,
  type StatusKind,
} from '../shared/sources';
import { normGreek, upper } from '../shared/text';
import { cadreMeta } from '../shared/cadreSource';
import { TemplateError } from './exports';
import './hdDocx';
import {
  cleanOpts,
  infoOf,
  openBook,
  previewHtml,
  printDefaults,
  printKey,
  rememberedSheets,
  renderBook,
  renderOpen,
  sectionsHtml,
  sheetFontSize,
  type PrintOpts,
} from './print';
import { xlLook } from '../shared/xlLook';
import {
  buildTemplate,
  fillReport,
  inspectTemplate,
  placeSheets,
  previewReport,
  previewTemplate,
} from './reports';
import {
  forBuild,
  repDate,
  rowsOf,
  sigsNone,
  splitOk,
  withBuilt,
  type BuildOpts,
  type RepKind,
  type Report,
} from '../shared/reports';
import { PV_PAGES } from '../shared/repPage';
import type { AppState } from '../shared/domain';
import { ESSO_SERIES, currentEsso, essoName, freshState, parseEsso, restoredPath } from '../shared/esso';
import { SOURCES_FILE, listArchives, readArchive, writeArchive } from './esso';
import { hkRowsOf } from '../shared/ranks';
import { createUpdater } from './updater';
import { SHEET_CMDS, type MadeKind } from './app/tables';
import type { NewOut, PrintJob, RepOut } from './app/types';
import {
  autoBusy, autoTimer, dirty, formsDirty, pending, seenUntil, sessionStart, store, win,
  setAutoTimer, setFormsDirty, setRepDirty, setSeenUntil, setSessionStart, setStore, setWin,
} from './app/state';
import { ctx, fail, onCommandApplied, registerCommandsIpc, reply, runCmd, snapshot } from './features/commands';
import { newDir, outputDir } from './app/dirs';
import { serial } from './app/serial';
// The exports feature (and, through it, app/paths.ts) is evaluated right before the last two imports below.
import {
  formBinding, formTpl, lastDay, made, onPrintPreview, produce, readOuts,
  registerExportsIpc, registerHdIpc, registerImerIpc, templates, writeOuts,
} from './features/exports';
// bindings/autowrite stay after the exports import: app/bindings reads DATA, so app/paths.ts must not run earlier.
import { bindingOf, current, moveBinding, sameTable, srcMeta, stampNow } from './app/bindings';
import {
  HOLD_RESTORE, HOLD_UNDO, autoReps, daily, hold, holdAll, kindsOf, logWrite, onAutoWriteDeps, retryPending, runAuto,
  scheduleAuto, syncOut, writeLog,
} from './features/autowrite';
// These two stay the LAST imports: app/paths.ts runs app.setPath('userData', ...) when it is evaluated, which must stay
// after every other imported module and before this file's body (as when it was a line of this file).
import {
  BACKUPS,
  DATA,
  DATA_AT,
  DEV,
  DOCS,
  TPL_DIR,
  TPL_MAX,
  TPL_NAME,
  USB_DIR,
  USB_KEEP,
  USER_TPL,
  archiveRoot,
  tplBuf,
  writableDir,
} from './app/paths';
import { FLAGS, HIST_MAX, readFlags, readMeta, writeMeta, type RepHist } from './app/meta';

const T0 = Date.now();
// GPU switch and Chromium switches stay here, at their boot position: flags.json is read by app/meta.ts.
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
// Ελληνικά για το Chromium: τα πεδία ημερομηνίας δείχνουν ημέρα/μήνα/έτος και σε Windows με αγγλικές ρυθμίσεις (αλλιώς μήνας/ημέρα)
app.commandLine.appendSwitch('lang', 'el');
// αποθηκευμένο έντυπο που βγαίνει: «Υπογραφές: Καμία» του «Φτιάξ' το εδώ» ισχύει και για όσα αποθηκεύτηκαν πριν τη διόρθωση (shared/reports sigsNone)
const savedSigs = (r: Report, file: string): Report => {
  const t = (store.state.settings.reportTpls || []).find((x) => x.id === r.tpl);
  if (r.sigs || !t?.built) return r;
  let edited = false;
  try {
    edited = !!t.mtime && Math.abs(fs.statSync(path.join(TPL_DIR, file)).mtimeMs - t.mtime) > 2000;
  } catch {
    /* λείπει: το λέει το tplBuf */
  }
  return sigsNone(r, store.state.settings.reportTpls, edited);
};
const dirOf = (t: DirTarget) =>
  t === 'output' ? outputDir() : 'form' in t ? formBinding(t.form).dir || outputDir() : newDir(t.kind);

// ------------------------------------------------------------------ Αρχεία Excel (πηγές ανά είδος)
const ovOf = (b?: SourceBinding, file?: string): RosterOverride | undefined =>
  b && (!file || path.resolve(b.file) === path.resolve(file))
    ? { sheet: b.sheet, header: b.header, cols: b.cols }
    : undefined;
const autoReading = new Set<ListKind>();
async function sourceStatus(): Promise<SourceStatus[]> {
  const metas = srcMeta.all();
  const out: SourceStatus[] = [];
  for (const [kind, b0] of Object.entries(store.state.settings.sources || {}) as [ListKind, SourceBinding][]) {
    if (!b0) continue;
    // πρώτα πού είναι τώρα ο πίνακας και οι στήλες του (νέα στήλη στο Excel): αλλιώς η αυτόματη ανάγνωση θα έπαιρνε
    // τιμές από λάθος στήλες. Αν δεν βρίσκονται με σιγουριά, το είδος περιμένει αντιστοίχιση.
    const loc = await locateCheck(kind, b0);
    if (loc.b !== b0) moveBinding(kind, loc.b);
    const b = bindingOf(kind) || loc.b;
    let m = metas[kind];
    let t = await tableState(b, m, kind);
    if (t.header != null) moveBinding(kind, { ...b, header: t.header });
    if (t.refresh) srcMeta.set(kind, t.refresh);
    // απλές αλλαγές στο Excel περνούν μόνες τους (με αναίρεση που δεν πειράζει το Excel)
    if (
      t.changed &&
      t.exists &&
      !loc.need &&
      isStatusKind(kind) &&
      b.autoRead !== false &&
      m?.at &&
      !m.hold &&
      !autoReading.has(kind)
    ) {
      autoReading.add(kind);
      try {
        const cur = bindingOf(kind) || b;
        if ((await importStatuses(kind, cur, {}, false, [], true)).ok) {
          m = srcMeta.get(kind);
          t = await tableState(cur, m, kind);
        }
      } finally {
        autoReading.delete(kind);
      }
    }
    // έλεγχος υπηρεσιών: ο μήνας του φύλλου, για την υπενθύμιση όταν αλλάζει ο μήνας
    let month: string | undefined;
    if (kind === 'duties' && t.exists) {
      try {
        const sh = (await bookNow(b.file))?.sheets.find((x) => x.name === b.sheet);
        month = (sh && bindingMonth(sh, bindingOf(kind) || b, today())) || undefined;
      } catch {
        /* ξανά αργότερα */
      }
    }
    out.push({
      kind,
      file: b.file,
      exists: t.exists,
      synced: !!m?.at,
      changed: t.changed,
      at: m?.at || '',
      error: m?.error,
      locked: m?.locked,
      pending: m?.pending,
      hold: m?.hold,
      month,
      ...(loc.need ? { remap: loc.need } : {}),
    });
  }
  return out;
}
const statusAll = async () => ({
  sources: await sourceStatus(),
  forms: readOuts()
    .filter((o) => lastDay(o) >= today())
    .map(({ form, date, file, at, error, pending, manual }) => ({ form, date, file, at, error, pending, manual })),
});
const notify = () => {
  statusAll().then(
    (st) => {
      try {
        win?.webContents.send(eventChannel('onSources'), st);
      } catch {
        /* παράθυρο κλειστό */
      }
    },
    (e) => console.error('sources status', e),
  );
};
async function bookOf(file: string): Promise<SourceBook> {
  const r = await readBook(file);
  const sheets = notReports(file, r.sheets);
  return {
    ok: true,
    file,
    name: path.basename(file),
    mtime: r.mtime,
    size: r.size,
    sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.slice(0, 1000) })),
    hits: detectTables(sheets),
  };
}
const sheetOf = (sheets: RawSheet[], name: string) => sheets.find((x) => x.name === name);
// runCmd (features/commands) may not import this file: it calls the auto-write scheduling through this hook, which is
// installed while main.ts loads, before any command can run.
onCommandApplied((prev, next) => scheduleAuto(prev, next));
onPrintPreview(printPreview);
// runAuto (features/autowrite) calls the status push and the report writer, which stay here until their areas move.
onAutoWriteDeps({ notify, regenReports });
// Έντυπα › «Φύλλο στο Δυναμολόγιο» / «Φύλλο σε άλλο Excel…»: το έντυπο γράφεται ως φύλλο (ή φύλλα, ένα ανά θάλαμο) μέσα
// στο αρχείο. Κάθε φορά ξαναγράφονται μόνο τα φύλλα του εντύπου· η εφαρμογή δεν τα διαβάζει ποτέ (εισαγωγή, Αρχεία Excel).
const repSheetBase = (r: Report) => sheetSafe(upper((r.target?.sheet || r.name || '').trim())).trim() || 'ΕΝΤΥΠΟ';
function repFileOf(r: Report): string | { error: string } {
  const t = r.target;
  const f = !t || t.to === 'people' ? bindingOf('people')?.file : t.file;
  if (!f)
    return {
      error:
        !t || t.to === 'people'
          ? 'Δεν έχει οριστεί Δυναμολόγιο. Όρισέ το στα Αρχεία Excel ή διάλεξε «Φύλλο σε άλλο Excel…».'
          : 'Δεν έχει διαλεχτεί αρχείο. Άνοιξε το έντυπο με «Αλλαγή» και διάλεξε το Excel.',
    };
  if (!/\.xls[xm]$/i.test(f))
    return { error: 'Το ' + path.basename(f) + ' δεν είναι .xlsx: φύλλο γράφεται μόνο σε .xlsx ή .xlsm.' };
  if (!fs.existsSync(f))
    return { error: 'Δεν βρίσκω το ' + path.basename(f) + '. Άνοιξε το έντυπο με «Αλλαγή» και διάλεξέ το ξανά.' };
  return f;
}
const sameFile = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// τα φύλλα ενός αρχείου που έγραψαν τα έντυπα (για να μην τα διαβάζει η εισαγωγή σαν πίνακες)
const repOwned = (file: string): Set<string> =>
  new Set(
    Object.values(readMeta().repSheets || {})
      .filter((x) => sameFile(x.file, file))
      .flatMap((x) => x.sheets),
  );
const notReports = <T extends { name: string }>(file: string, sheets: T[]): T[] => {
  const own = repOwned(file);
  return own.size ? sheets.filter((x) => !own.has(x.name)) : sheets;
};
// Χωρίς serial μέσα: ο καλών (rep:run, αυτόματη ενημέρωση) το βάζει σε serial με όλη την ανάγνωση-εγγραφή
async function writeRepSheet(
  r: Report,
  tplFile: string,
  ids: (number | string)[],
  d: ISODate,
  force: boolean,
): Promise<RepOut> {
  r = savedSigs(r, tplFile);
  const file = repFileOf(r);
  if (typeof file !== 'string') return { ok: false, error: file.error };
  const s = store.state;
  const all = readMeta().repSheets || {};
  const prev = all[r.id] && sameFile(all[r.id].file, file) ? all[r.id] : undefined;
  const base = repSheetBase(r);
  const split = !!r.split && r.split !== 'none' && splitOk(r.kind);
  const tpl = await tplBuf(tplFile);
  const o = split ? { prefix: base, stale: prev?.groups || [] } : {};
  const out = await off('fillReport', [tpl, r, ids, d, o], () => fillReport(tpl, s, r, ids, d, o), s);
  const pairs: [string, string][] = split ? out.sheets.map((n) => [n, n]) : [[out.sheets[0], base]];
  // φύλλα που διαβάζει η εφαρμογή (Δυναμολόγιο, ιατρικά…) δεν γράφονται ποτέ από πάνω
  const bound = KINDS.map((k) => bindingOf(k.id))
    .filter((b): b is SourceBinding => !!b && sameFile(b.file, file))
    .map((b) => b.sheet.toUpperCase());
  const hit = pairs.map((p) => p[1]).find((n) => bound.includes(n.toUpperCase()));
  if (hit)
    return {
      ok: false,
      error:
        'Το φύλλο «' +
        hit +
        '» το διαβάζει η εφαρμογή (είναι πίνακας από τα Αρχεία Excel). Δώσε άλλο όνομα φύλλου στο έντυπο.',
    };
  const fj = path.join(path.dirname(file), path.basename(file));
  const st = stamp(fj);
  const target = await fs.promises.readFile(fj);
  const placed = await off('placeSheets', [target, out.data, pairs, force ? null : prev?.sheets || []], () =>
    placeSheets(target, out.data, pairs, force ? null : prev?.sheets || []),
  );
  if (placed.clash)
    return {
      ok: false,
      error:
        placed.clash.length === 1
          ? 'Υπάρχει ήδη φύλλο «' +
            placed.clash[0] +
            '» στο ' +
            path.basename(file) +
            ' που δεν το έφτιαξε αυτό το έντυπο.'
          : 'Υπάρχουν ήδη τα φύλλα ' +
            placed.clash.map((x) => '«' + x + '»').join(', ') +
            ' στο ' +
            path.basename(file) +
            ' που δεν τα έφτιαξε αυτό το έντυπο.',
      confirm: placed.clash,
    };
  const [f] = await writeAll([{ dir: path.dirname(fj), name: path.basename(fj), data: placed.data! }], {
    prevEvery: PREV_EVERY,
    expect: st ? { [fj]: st } : undefined,
  });
  const names = pairs.map((p) => p[1]);
  const m = readMeta().repSheets || {};
  writeMeta({
    repSheets: {
      ...m,
      [r.id]: { file: f, sheets: [...new Set([...(prev?.sheets || []), ...names])], groups: out.groups },
    },
  });
  return { ok: true, file: f, warnings: out.warnings || [], sheets: names };
}
// τυχαίοι: πόσες φορές βγήκε ο καθένας σε αυτό το έντυπο (η Νέα ΕΣΣΟ αλλάζει το settings.essos, άρα ξεκινά από την αρχή)
const essoKey = () => JSON.stringify(store.state.settings.essos || null);
function repTimes(id: string): Record<string, number> {
  const t = readMeta().repTimes?.[id];
  return t && t.essos === essoKey() ? t.n : {};
}
function countTimes(id: string, ids: (number | string)[]) {
  const n = { ...repTimes(id) };
  for (const x of ids) n[String(x)] = (n[String(x)] || 0) + 1;
  writeMeta({ repTimes: { ...(readMeta().repTimes || {}), [id]: { essos: essoKey(), n } } });
}
async function regenReports(): Promise<boolean> {
  let wrote = false;
  for (const r of autoReps()) {
    const tpl = (store.state.settings.reportTpls || []).find((t) => t.id === r.tpl);
    if (!tpl) continue;
    const t0 = Date.now();
    const d = repDate(r, today());
    try {
      const ids = rowsOf(store.state, r, d).map((x) => x.id);
      const res = await serial(() => writeRepSheet(r, tpl.file, ids, d, false));
      logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0, res.ok ? undefined : res.error);
      wrote = true;
    } catch (e) {
      if (e instanceof LockedError) setRepDirty(true);
      logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0, msgOf(e));
    }
  }
  return wrote;
}

// Εισαγωγή προσωπικού: από το κουμπί (αναγνώριση μόνη της) ή από τα Αρχεία Excel (με την αντιστοίχιση του χρήστη)
async function rosterPreview(
  file: string,
  b: SourceBinding | null,
): Promise<ImportPreview | { ok: false; error: string }> {
  try {
    const book0 = await readBook(file);
    const book = { ...book0, sheets: notReports(file, book0.sheets) };
    if (b) b = refitCols('people', sheetOf(book.sheets, b.sheet), b);
    const src = store.state.settings.sources || {};
    const r = parseRoster(
      book.sheets,
      { main: ovOf(b || undefined), posts: ovOf(src.posts, file), outside: ovOf(src.outside, file) },
      store.state.settings.lists,
    );
    r.rows = withRoomExtras(r.rows, book.sheets, r.main, store.state.people, srcMeta.get('people')?.psnap); // e-mail, e-mail συγγενή, ομάδα αίματος από το φύλλο ΘΑΛΑΜΟΙ
    if (!r.rows.length) return { ok: false, error: r.warnings[0] || 'Δεν βρέθηκαν άτομα στο αρχείο' };
    // ποιος πίνακας διαβάστηκε: για να γράφονται εκεί οι διορθώσεις (Michael, 11/10)
    const det =
      b ||
      (() => {
        const x = bestFor(
          'people',
          book.sheets.filter((sh) => sh.name === r.main),
        );
        return x ? ({ file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding) : null;
      })();
    const sim = apply(
      store.state,
      { t: 'importPeople', rows: r.rows, source: path.basename(file), deactivateMissing: true },
      ctx(),
    ).state;
    const before = new Set(store.state.people.map((p) => p.id));
    const added = sim.people.filter((p) => !before.has(p.id)).length;
    const missing = sim.people.filter(
      (p) =>
        before.has(p.id) &&
        !p.active &&
        store.state.people.find((q) => q.id === p.id)!.active &&
        !r.rows.some((x) => x.asm && x.asm === p.asm),
    ).length;
    const token = crypto.randomUUID();
    pending.clear(); // μία προεπισκόπηση τη φορά: όσες ακυρώθηκαν δεν κρατούν το φύλλο στη μνήμη
    pending.set(token, {
      rows: r.rows,
      file,
      binding: det,
      stamp: { mtime: book.mtime, size: book.size },
      sheet: det ? sheetOf(book.sheets, det.sheet) || null : null,
    });
    return {
      ok: true,
      token,
      file: path.basename(file),
      total: r.rows.length,
      active: r.rows.filter((x) => x.active !== false).length,
      added,
      updated: r.rows.length - added,
      missing,
      warnings: r.warnings,
      essos: r.essos,
      skipped: r.skipped,
      declared: r.declared,
      found: r.found,
      suspicious: r.suspicious,
      ...rosterChanges(store.state, r.rows),
    };
  } catch (e) {
    return fail(e);
  }
}
async function pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Δυναμολόγιο',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  srcMeta.allow([res.filePaths[0]]);
  const cur = bindingOf('people');
  return rosterPreview(res.filePaths[0], cur && path.resolve(cur.file) === path.resolve(res.filePaths[0]) ? cur : null);
}
// Μετά την εισαγωγή: το αρχείο γίνεται η πηγή του προσωπικού (αν δεν υπάρχει άλλη) και κρατιέται τι γράφει το καθένα
function afterRoster(p: {
  file: string;
  binding: SourceBinding | null;
  stamp: { mtime: number; size: number };
  sheet: RawSheet | null;
}) {
  if (!p.binding || !p.sheet) return;
  const cur = bindingOf('people');
  if (cur && path.resolve(cur.file) !== path.resolve(p.file)) return;
  if (
    !cur ||
    cur.sheet !== p.binding.sheet ||
    cur.header !== p.binding.header ||
    JSON.stringify(cur.cols) !== JSON.stringify(p.binding.cols)
  )
    runCmd({
      t: 'setSettings',
      settings: {
        sources: { ...(store.state.settings.sources || {}), people: { ...p.binding, write: cur ? cur.write : true } },
      },
      text: 'πηγή προσωπικού ' + path.basename(p.file) + ' › ' + p.binding.sheet,
    });
  srcMeta.set('people', {
    snap: snapFromSheet(p.sheet, p.binding, store.state.people),
    keys: [],
    mtime: p.stamp.mtime,
    size: p.stamp.size,
    hash: tableHash(p.sheet, p.binding),
    at: stampNow(),
    pending: false,
    error: undefined,
    locked: false,
    hold: undefined,
  });
  // πόστα και εκτός δύναμης του ίδιου αρχείου διαβάστηκαν μαζί
  const linked = (['posts', 'outside'] as ListKind[]).filter((k) => {
    const x = bindingOf(k);
    return x && path.resolve(x.file) === path.resolve(p.file);
  });
  Promise.all(linked.map((k) => markSynced(k, bindingOf(k)!))).then(notify, (e) => console.error('roster linked', e));
  notify();
}

// Διάβασμα ενός είδους από το Excel του (καταστάσεις): νέες εγγραφές και αλλαγές μπαίνουν στην εφαρμογή
// auto: από τον έλεγχο αλλαγών, χωρίς προεπισκόπηση. Περνά μόνο αν είναι απλό: νέες εγγραφές ή αλλαγές, όλα τα άτομα
// γνωστά, τίποτα σβησμένο, διπλό, με άγνωστο είδος ή λάθος ημερομηνία, και τίποτα που άλλαξε και στην εφαρμογή.
async function importStatuses(
  kind: StatusKind,
  b: SourceBinding,
  choices: Record<number, number | null>,
  keepRemoved = false,
  keepApp: string[] = [],
  auto = false,
): Promise<CmdResult> {
  try {
    const book = await readBook(b.file);
    const sheet = sheetOf(book.sheets, b.sheet);
    if (!sheet) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const parsed = parseStatuses(kind, sheet, b, store.state.people, today(), store.state.settings.lists);
    const d = diffStatuses(kind, store.state, parsed, b, choices, keysOf(kind, b), baseFor(kind, b), today());
    if (
      auto &&
      (parsed.unknown.length ||
        parsed.skipped.length ||
        d.unmatched.length ||
        d.dup.length ||
        d.removed.length ||
        d.update.some((u) => u.conflict) ||
        d.add.some((a) => a.open) ||
        d.update.some((u) => u.patch.open) ||
        !(d.add.length + d.update.length))
    )
      return fail('όχι απλό');
    saveBinding(kind, b);
    // άλλαξαν και στις δύο πλευρές και ο χρήστης κράτησε της εφαρμογής: δεν περνούν, και γράφονται μετά στο Excel
    const kept = new Set(keepApp);
    const r = runCmd({
      t: 'importRecords',
      adds: d.add,
      updates: d.update.filter((u) => !kept.has(u.id)).map((u) => ({ id: u.id, patch: u.patch })),
      deletes: keepRemoved ? [] : d.removed.map((x) => x.id),
      source: path.basename(b.file),
      what: KIND[kind].label.toLowerCase() + (auto ? ' (αυτόματα, χωρίς προεπισκόπηση)' : ''),
    });
    if (!r.ok) return r;
    srcMeta.set(kind, {
      keys: d.keys,
      base: baseOf(kind, store.state, d.keys),
      ...syncStamp(b, book),
      psnap: snapPeople(store.state.people),
      at: stampNow(),
      pending: false,
      error: undefined,
      locked: false,
      hold: undefined,
    });
    // ό,τι έχει η εφαρμογή και λείπει από το Excel (ή κράτησε ο χρήστης από την εφαρμογή) γράφεται αμέσως μετά (αν το είδος γράφει μόνο του)
    if (b.write !== false && (d.appOnly.length || d.kept.length || kept.size)) {
      dirty.add(kind);
      clearTimeout(autoTimer);
      setAutoTimer(setTimeout(runAuto, 1200));
    }
    notify();
    // αυτόματα (από τον έλεγχο αλλαγών): η απάντηση δεν φτάνει στο UI, οπότε δεν σημειώνουμε τις αλλαγές ως σταλμένες.
    // Τις φέρνει το sync() που κάνει το UI μόλις πάρει την κατάσταση των αρχείων.
    if (auto) return { ok: true, changes: {}, newAudit: [], text: r.text || '' };
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) {
    return fail(e);
  }
}
// Μετά από ανάγνωση: πότε, τι αποτύπωμα είχε ο πίνακας και τι στοιχεία είχαν τα άτομα (για να περνούν μετά οι αλλαγές τους)
async function markSynced(kind: ListKind, b: SourceBinding, extra: Partial<SourceMeta> = {}) {
  srcMeta.set(kind, {
    ...(await syncStampNow(b)),
    psnap: snapPeople(store.state.people),
    at: stampNow(),
    pending: false,
    error: undefined,
    locked: false,
    hold: undefined,
    ...extra,
  });
}
// keys (έλεγχος υπηρεσιών): «μέρα|άτομο» του Excel που είδε πια η εφαρμογή· μόνο αυτά σβήνει μετά η εγγραφή
async function applySheet(kind: ListKind, b: SourceBinding, cmd: Command, keys: string[] = []): Promise<CmdResult> {
  if (SHEET_CMDS[kind] !== cmd.t) return fail('Λάθος είδος εισαγωγής');
  try {
    saveBinding(kind, b);
    const r = runCmd(cmd);
    if (!r.ok) return r;
    await markSynced(
      kind,
      b,
      kind === 'duties' ? { keys: [...new Set(keys.map(String))] } : isCadreKind(kind) ? await cadreExtra(kind, b) : {},
    );
    dirty.add(kind);
    clearTimeout(autoTimer);
    setAutoTimer(setTimeout(runAuto, 1200));
    notify();
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) {
    return fail(e);
  }
}
// Στελέχη: μετά την ανάγνωση, ποια είναι στο φύλλο και οι τιμές της εφαρμογής εκείνη τη στιγμή (η επόμενη εγγραφή γράφει μόνο ό,τι άλλαξε μετά)
async function cadreExtra(kind: 'cadres' | 'cadreAbs', b: SourceBinding): Promise<Partial<SourceMeta>> {
  const sh = sheetOf((await readBook(b.file)).sheets, b.sheet);
  return sh ? cadreMeta(kind, sh, b, store.state, today()) : {};
}
// οι εγγραφές που είχε το Excel στην προηγούμενη ανάγνωση/εγγραφή (μόνο αν είναι ο ίδιος πίνακας)
function keysOf(kind: ListKind, b: SourceBinding): string[] {
  return sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.keys || [] : [];
}
const baseFor = (kind: ListKind, b: SourceBinding): Record<string, string> =>
  sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.base || {} : {};
function saveBinding(kind: ListKind, b0: SourceBinding | null) {
  const cur = bindingOf(kind);
  const b = b0 && keepHeads(b0, cur); // οι επικεφαλίδες των στηλών (heads) μένουν μόνο αν ο πίνακας και οι στήλες δεν άλλαξαν· αλλιώς ξαναμπαίνουν στην επόμενη ανάγνωση
  if (b) srcMeta.allow([b.file]); // αρχείο που όρισε ή έφτιαξε ο ίδιος ο main
  if (JSON.stringify(cur || null) === JSON.stringify(b)) return;
  const sources = { ...(store.state.settings.sources || {}) };
  if (b) sources[kind] = b;
  else delete sources[kind];
  runCmd({
    t: 'setSettings',
    settings: { sources },
    text: b
      ? 'Excel για ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(b.file) + ' › ' + b.sheet
      : 'χωρίς Excel για ' + KIND[kind].label.toLowerCase(),
  });
  // άλλο αρχείο ή άλλος πίνακας: ό,τι ξέραμε για το παλιό δεν ισχύει
  if (!b || !cur || path.resolve(cur.file) !== path.resolve(b.file) || cur.sheet !== b.sheet || cur.header !== b.header)
    srcMeta.set(kind, null);
}
// Πού φτιάχνεται ένα νέο είδος: ως φύλλο στο Δυναμολόγιο (όπως στο αρχείο της Ίλης), αν έχει οριστεί, υπάρχει και η
// εφαρμογή γράφει εκεί· αλλιώς χωριστό αρχείο στον φάκελο του είδους. Αν το Δυναμολόγιο έχει ήδη πίνακα αυτού του
// είδους, ορίζεται αυτός (found) αντί να φτιαχτεί δεύτερος. Υπάρχον φύλλο ή αρχείο δεν γράφεται ποτέ από πάνω.
async function newPlace(
  kind: ListKind,
): Promise<{ b: SourceBinding; found?: boolean; inRoster?: boolean } | { error: string }> {
  const host = sheetHost(kind);
  const ros = host ? bindingOf(host) : undefined; // φύλλο μέσα στο αρχείο του «οικοδεσπότη»: Δυναμολόγιο ή στελέχη
  if (host && ros && ros.write !== false && /\.xls[xm]$/i.test(ros.file) && fs.existsSync(ros.file)) {
    try {
      const book = await readBook(ros.file);
      const hit = detectTables(notReports(ros.file, book.sheets)).find((h) => h.best === kind);
      if (hit)
        return {
          b: { file: ros.file, sheet: hit.sheet, header: hit.header, cols: hit.cols, write: true, scope: 'active' },
          found: true,
        };
      const names = new Set(book.sheets.map((x) => normGreek(x.name)));
      const title = KIND[kind].title.slice(0, 28);
      let name = title;
      for (let i = 2; names.has(normGreek(name)); i++) name = title + ' ' + i;
      return { b: { ...defaultBinding(kind, ros.file, name), write: true }, inRoster: true };
    } catch {
      /* δεν διαβάζεται (ανοιχτό, παλιό .xls): χωριστό αρχείο */
    }
  }
  // έλεγχος υπηρεσιών: φύλλο του τρέχοντος μήνα, στο ίδιο αρχείο με τους προηγούμενους μήνες αν υπάρχει
  if (kind === 'duties') {
    const ym = today().slice(0, 7);
    const cur = bindingOf('duties');
    if (cur && /\.xls[xm]$/i.test(cur.file) && fs.existsSync(cur.file)) {
      try {
        const book = await readBook(cur.file);
        const mine = book.sheets.find((x) => {
          const h = bestFor('duties', [x]);
          return h && bindingMonth(x, { ...cur, header: h.header }, today()) === ym;
        });
        if (mine) {
          const h = bestFor('duties', [mine])!;
          return { b: { ...cur, sheet: mine.name, header: h.header, cols: h.cols, month: ym }, found: true };
        }
        const names = new Set(book.sheets.map((x) => normGreek(x.name)));
        let name = dutiesSheet(ym);
        for (let i = 2; names.has(normGreek(name)); i++) name = dutiesSheet(ym) + ' ' + i;
        return { b: dutiesBinding(cur.file, ym, name, store.state.settings), inRoster: true };
      } catch {
        /* δεν διαβάζεται: νέο αρχείο */
      }
    }
  }
  const dir = newDir(kind);
  if (!writableDir(dir))
    return { error: 'Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλο στις Ρυθμίσεις → Φάκελοι αρχείων.' };
  // με γνωστή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ) το όνομά της μπαίνει στο όνομα του αρχείου: «ΔΥΝΑΜΟΛΟΓΙΟ Γ΄ ΕΣΣΟ 2026 4ης ΙΛΗΣ»
  const es = store.state.settings.essos ? essoName(store.state.settings.essos) : '';
  if (kind === 'duties')
    return {
      b: dutiesBinding(
        freeName(dir, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + (es || today().slice(0, 4))),
        today().slice(0, 7),
        undefined,
        store.state.settings,
      ),
    };
  const name =
    kind === 'people'
      ? ('ΔΥΝΑΜΟΛΟΓΙΟ ' + es + ' ' + (store.state.settings.unitName || '')).replace(/\s+/g, ' ').trim()
      : KIND[kind].title;
  return { b: { ...defaultBinding(kind, freeName(dir, name)), write: true } };
}
// «Νέο αρχείο…» ενός είδους (Αρχεία Excel) και τα Excel της νέας ΕΣΣΟ
async function createNew(kind: ListKind): Promise<NewOut> {
  if (!KIND[kind] || !canCreate(kind)) return fail('Αυτό το είδος δεν φτιάχνεται ακόμα από την εφαρμογή');
  const prev = bindingOf(kind);
  const prevMeta = srcMeta.keep(kind);
  const at = await newPlace(kind);
  if ('error' in at) return fail(at.error);
  if (at.found) {
    saveBinding(kind, at.b);
    notify();
    return { ok: true, file: at.b.file, sheet: at.b.sheet, found: true };
  }
  saveBinding(kind, at.b);
  const r = await syncOut(kind, false, true);
  // δεν φτιάχτηκε: η αντιστοίχιση γυρνά όπως ήταν (όχι σε αρχείο που δεν υπάρχει), μαζί με ό,τι ήξερε η εφαρμογή για
  // το παλιό αρχείο (πότε διαβάστηκε, τι είχε): αλλιώς θα έμενε «Νέο» και δεν θα έγραφε μόνη της
  if (!r.ok) {
    saveBinding(kind, prev || null);
    prevMeta();
    notify();
    return r;
  }
  // νέο Δυναμολόγιο: και τα φύλλα του (ΤΙΜΩΡΗΜΕΝΟΙ, ΑΔΕΙΕΣ, ΠΟΣΤΑ…) για όσα είδη δεν έχουν ακόμα αρχείο
  const sheets: string[] = [];
  if (kind === 'people' || kind === 'cadres')
    for (const k of NEW_KINDS.filter((x) => sheetHost(x) === kind && !bindingOf(x))) {
      const at2 = await newPlace(k);
      if ('error' in at2 || !at2.inRoster) continue;
      saveBinding(k, at2.b);
      if ((await syncOut(k, false, true)).ok) sheets.push(at2.b.sheet);
      else saveBinding(k, null);
    }
  notify();
  return { ok: true, file: r.file, sheet: at.b.sheet, inRoster: at.inRoster, ...(sheets.length ? { sheets } : {}) };
}
async function planOut(kind: ListKind): Promise<WritePreview | { ok: false; error: string }> {
  const b0 = await current(kind);
  if (!b0) return fail('Δεν έχει οριστεί αρχείο');
  let b: SourceBinding = b0;
  try {
    const exists = fs.existsSync(b.file);
    const book = exists ? await readBook(b.file) : null;
    const sheet = (book && sheetOf(book.sheets, b.sheet)) || { name: b.sheet, rows: [] };
    if (!book && !isStatusKind(kind)) return fail('Δεν βρέθηκε το ' + b.file);
    const had = !!book?.sheets.some((x) => x.name === b.sheet);
    if (!had && !isStatusKind(kind)) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const tc0 = timeCols(kind, had ? sheet : null, b, store.state, today());
    const tc1 = capExtraCols(kind, had ? sheet : null, tc0.b, store.state);
    b = tc1.b;
    const tc = {
      head: [
        ...tc0.head.map((h) => ({
          ...h,
          why: kind === 'people' ? 'για τα στοιχεία των καρτελών (IBAN, ΑΜΚΑ, ΑΦΜ)' : 'για τις ώρες των αδειών',
        })),
        ...tc1.head.map((h) => ({ ...h, why: 'για όσους δεν κάνουν αυτή την υπηρεσία' })),
      ],
    };
    const plan = planSource(kind, had ? sheet : null, b, store.state, srcMeta.get(kind), today());
    const steps = plan.inserts || [],
      sheet2 = steps.length ? withRows(sheet, steps) : sheet;
    const lines = describeSets(
      kind,
      sheet2,
      b,
      plan.sets,
      plan.insert
        ? new Set(Array.from({ length: plan.insert.n }, (_, i) => plan.insert!.after + 1 + i))
        : stepRows(steps),
    );
    for (const d of plan.deletes || []) {
      const v: Record<string, CellValue> = {};
      for (const k in b.cols) v[k] = (sheet2.rows[d] || [])[b.cols[k]];
      lines.push({ r: d, who: rowName(v), text: 'η γραμμή σβήνεται (αναιρέθηκε στην εφαρμογή)' });
    }
    lines.sort((x, y) => x.r - y.r);
    const tidy = [
      ...tc.head.map((h) => 'Νέα στήλη «' + h.v + '» (' + colLetter(h.c) + ') στο τέλος του πίνακα, ' + h.why),
      ...(had && book ? await tidyPreview(kind, b, store.state.settings.lists) : []),
    ];
    return {
      ok: true,
      file: b.file,
      create: !exists || !had,
      lines,
      total: plan.added + plan.changed + plan.cleared,
      foreign: plan.foreign,
      notFound: plan.notFound,
      ambiguous: ambiguousLines(sheet, b, plan.ambiguous),
      warn: plan.warn,
      ...(tidy.length ? { tidy } : {}),
    };
  } catch (e) {
    return fail(e);
  }
}
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
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
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
function registerReportTemplatesIpc() {
  // Έντυπα: πρότυπα στον φάκελο «Πρότυπα εντύπων», έντυπα που βγαίνουν στον φάκελο των Excel
  handle('repUpload', async (_e, kind: RepKind) => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε το Excel που θα γίνει πρότυπο',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    const src = res.canceled ? null : res.filePaths[0];
    if (!src) return null;
    try {
      if (/\.xls$/i.test(src))
        return fail(
          'Το ' + path.basename(src) + ' είναι παλιό .xls. Άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx.',
        );
      const st = fs.statSync(src);
      if (st.size > TPL_MAX)
        return fail(
          'Το αρχείο είναι πάνω από 5 MB. Κράτα σε ένα αρχείο μόνο το φύλλο του εντύπου και ξαναδοκίμασε.',
        );
      const buf = await fs.promises.readFile(src);
      const insp = await inspectTemplate(buf, kind);
      const file = crypto.randomUUID() + (/\.xlsm$/i.test(src) ? '.xlsm' : '.xlsx');
      await fs.promises.mkdir(TPL_DIR, { recursive: true });
      await fs.promises.writeFile(path.join(TPL_DIR, file), buf);
      return {
        ok: true,
        tpl: {
          id: crypto.randomUUID(),
          name: path.basename(src).replace(/\.xls[xm]$/i, ''),
          file,
          mtime: Math.round(fs.statSync(path.join(TPL_DIR, file)).mtimeMs),
        },
        insp,
      };
    } catch (e) {
      return fail('Δεν διαβάστηκε το ' + path.basename(src) + ': ' + msgOf(e));
    }
  });
  handle('repInspect', async (_e, file: string, kind: RepKind, sheet?: string, head?: number) => {
    try {
      return await inspectTemplate(await tplBuf(file), kind, sheet, head);
    } catch (e) {
      return fail(e);
    }
  });
  handle('repBuild', async (_e, o: BuildOpts, kind: RepKind, file?: string) => {
    try {
      const b = await buildTemplate(o, kind, xlLook(store.state.settings));
      const name = file && TPL_NAME.test(file) ? file : crypto.randomUUID() + '.xlsx';
      await fs.promises.mkdir(TPL_DIR, { recursive: true });
      const f = path.join(TPL_DIR, name);
      if (isLocked(f)) return fail('Το πρότυπο είναι ανοιχτό στο Excel. Κλείσε το Excel και ξαναπάτα.');
      await fs.promises.writeFile(f, b.data);
      return {
        ok: true,
        file: name,
        mtime: Math.round(fs.statSync(f).mtimeMs),
        sheet: b.sheet,
        head: b.head,
        cols: b.cols,
        cells: b.cells,
        ...(b.more ? { more: b.more } : {}),
        ...(b.vals ? { vals: b.vals } : {}),
        ...(b.fixed ? { fixed: true } : {}),
      };
    } catch (e) {
      return fail(e);
    }
  });
}
function registerReportPreviewIpc() {
  // opts.sample (σελίδα δημιουργίας): πόσες γραμμές δείχνει κάθε πίνακας· τότε και πολλές σελίδες. Μόνο εδώ, ποτέ στο rep:run
  handle(
    'repPreview',
    async (
      _e,
      src: { file?: string; build?: BuildOpts },
      r: Report,
      ids: (number | string)[],
      date: ISODate,
      raw: boolean,
      opts?: { sample?: number },
    ) => {
      try {
        const s = store.state;
        const sample = typeof opts?.sample === 'number' ? opts.sample : undefined;
        const pages = sample == null ? 1 : PV_PAGES;
        if (src.build)
          return await off(
            'previewBuilt',
            [src.build, r, ids, date, pages, sample],
            async () => {
              const o = forBuild(src.build!, r);
              const b = await buildTemplate(o, r.kind, xlLook(s.settings));
              return previewReport(b.data, s, withBuilt(r, b, o), ids, date, pages, sample);
            },
            s,
          );
        const buf = await tplBuf(src.file || '');
        if (raw) return await off('previewTemplate', [buf, r.sheet], () => previewTemplate(buf, r.sheet));
        return await off(
          'previewReport',
          [buf, r, ids, date, pages, sample],
          () => previewReport(buf, s, r, ids, date, pages, sample),
          s,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
function registerLayoutPreviewIpc() {
  // out 'sheet': φύλλο μέσα στο Δυναμολόγιο ή σε άλλο Excel (force: ο χρήστης είπε να γραφτεί πάνω σε φύλλο που δεν έφτιαξε)·
  // print: πάντα νέο αρχείο στον φάκελο των Excel και προεπισκόπηση εκτύπωσης όλων των φύλλων του
  // opts.quiet: δεν ανοίγει το Excel (Έντυπα ημέρας › «Τύπωσε όλα») · opts.again: «Ξαναβγάλε» από το ιστορικό (δεν μετρά ξανά τους τυχαίους)
  // Θέσεις πάνω στο χαρτί: το έντυπο όπως θα βγει (σήμερα), με 8 γραμμές παραπάνω για να μπορείς να κατεβάσεις κάτι
  handle('layoutPreview', async (_e, q: LayoutReq): Promise<LayoutPv | Fail> => {
    try {
      const s = store.state;
      let out: { data: Buffer; warnings?: string[]; layout?: LayoutSheet[] };
      if ('report' in q) {
        // «Φτιάξ' το εδώ» μέσα στον οδηγό: το πρότυπο από τις επιλογές, χωρίς αρχείο ακόμα (όπως η προεπισκόπηση)
        const bo = q.build ? forBuild(q.build, q.report) : null;
        const b = bo ? await buildTemplate(bo, q.report.kind, xlLook(s.settings)) : null;
        const buf = b ? b.data : await tplBuf(q.file || '');
        const rep = b ? withBuilt(q.report, b, bo!) : savedSigs(q.report, q.file || '');
        out = await off(
          'fillReport',
          [buf, rep, q.ids.slice(0, 120), q.date],
          () => fillReport(buf, s, rep, q.ids.slice(0, 120), q.date),
          s,
        );
      } else {
        const s2 = q.layout
          ? { ...s, settings: { ...s.settings, layout: { ...s.settings.layout, [q.form]: q.layout } } }
          : s;
        const f = q.form;
        out =
          f === 'hkai' || f === 'froura' || f === 'outs' || f === 'check'
            ? await produce(f, q.date, s2, q.sigs)
            : await made((f === 'roster' ? 'rosterPreview' : f) as MadeKind, q.date, s2, q.sigs);
      }
      // φύλλα με την ίδια μορφή (ίδιο key, π.χ. ένα ανά φίλτρο): δείχνεται μόνο το πρώτο
      const ls = (out.layout || []).filter((l, i, a) => a.findIndex((x) => x.key === l.key) === i);
      const wb = await Workbook.open(out.data);
      for (const l of ls) {
        const r = wb.printLastRow(l.sheet);
        if (r) wb.printDownTo(l.sheet, r + 8);
      }
      const doc = await renderBook(await wb.save(), {
        file: 'προεπισκόπηση.xlsx',
        sheets: ls.map((l) => l.sheet),
        refs: true,
        maxPages: 2,
      });
      return {
        css: doc.css,
        warnings: out.warnings || [],
        sheets: ls.map((l) => {
          const sh = doc.sheets.find((x) => x.name === l.sheet);
          return { ...l, html: sh?.html || '', pages: sh?.pages || 0 };
        }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
function registerReportRunIpc() {
  handle(
    'repRun',
    async (
      _e,
      r: Report,
      file: string,
      ids: (number | string)[],
      date: ISODate,
      print: boolean,
      force?: boolean,
      opts?: { quiet?: boolean; again?: boolean },
    ): Promise<RepOut> => {
      try {
        const s = store.state;
        const t0 = Date.now();
        let res: RepOut;
        if (r.out === 'sheet' && !print) {
          res = await serial(() => writeRepSheet(r, file, ids, date, !!force));
          if (res.ok) {
            logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0);
            notify();
          }
        } else {
          const buf = await tplBuf(file);
          const rs = savedSigs(r, file);
          const out = await off('fillReport', [buf, rs, ids, date], () => fillReport(buf, s, rs, ids, date), s);
          const ext = /\.xlsm$/i.test(file) ? '.xlsm' : '.xlsx';
          const [f] = await serial(() =>
            writeAll([{ dir: outputDir(), name: out.name.replace(/\.xlsx$/, ext), data: out.data }]),
          );
          logWrite('Έντυπο ' + r.name, t0);
          const warnings = [...(out.warnings || [])];
          if (print) {
            const p = await printPreview(f, out.sheets, !!r.fixsz);
            if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
          } else if (!opts?.quiet) shell.openPath(f);
          res = { ok: true, file: f, warnings, sheets: out.sheets };
        }
        if (!res.ok) return res;
        if (r.pick.mode === 'random' && !opts?.again) countTimes(r.id, ids);
        const at = today() + ' ' + nowHM();
        const m = readMeta();
        const h: RepHist = {
          at,
          date,
          ids: ids.slice(0, 2000),
          n: ids.length,
          file: res.file,
          ...(res.sheets && r.out === 'sheet' && !print ? { sheets: res.sheets } : {}),
        };
        writeMeta({
          repLast: { ...(m.repLast || {}), [r.id]: at },
          repHist: { ...(m.repHist || {}), [r.id]: [h, ...(m.repHist?.[r.id] || [])].slice(0, HIST_MAX) },
        });
        return res;
      } catch (e) {
        if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
        if (e instanceof ChangedError)
          return {
            ok: false,
            error: 'Το ' + path.basename(e.file || '') + ' άλλαξε την ώρα που γραφόταν. Πάτα ξανά.',
          };
        if (e instanceof TemplateError) return { ok: false, error: e.message };
        return fail(e);
      }
    },
  );
  handle('repTimes', (_e, id: string) => repTimes(id));
  handle('repHist', (_e, id: string) =>
    (readMeta().repHist?.[id] || []).map((h) => ({ ...h, exists: fs.existsSync(h.file) })),
  );
}
function registerReportFilesIpc() {
  // «Φύλλο σε άλλο Excel…»: το αρχείο που θα πάρει το φύλλο
  handle('repPickFile', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Σε ποιο Excel θα γράφεται το φύλλο',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  });
  handle('repOpenTpl', async (_e, file: string) => {
    if (TPL_NAME.test(file) && fs.existsSync(path.join(TPL_DIR, file)))
      await shell.openPath(path.join(TPL_DIR, file));
  });
  handle('repFiles', (_e, files: string[]) =>
    Object.fromEntries(
      (Array.isArray(files) ? files : [])
        .filter((f) => TPL_NAME.test(f))
        .map((f) => {
          try {
            return [f, { exists: true, mtime: Math.round(fs.statSync(path.join(TPL_DIR, f)).mtimeMs) }];
          } catch {
            return [f, { exists: false, mtime: 0 }];
          }
        }),
    ),
  );
  handle('repLast', () => readMeta().repLast || {});
}
function registerRosterIpc(answer: (r: ReturnType<typeof runCmd>) => CmdResult) {
  handle('pickRoster', () => pickRoster());
  handle('applyRoster', (_e, token: string, deactivateMissing: boolean) => {
    const p = pending.get(token);
    if (!p) return fail('Η εισαγωγή έληξε, διάλεξε ξανά το αρχείο');
    pending.delete(token);
    try {
      store.backup('πριν-εισαγωγή');
    } catch (e) {
      return fail('Δεν πάρθηκε αντίγραφο ασφαλείας πριν την εισαγωγή: ' + String(e));
    }
    const r = runCmd({ t: 'importPeople', rows: p.rows, source: path.basename(p.file), deactivateMissing });
    if (r.ok) afterRoster(p);
    return answer(r);
  });
}
function registerSourcesIpc(pickXlsx: (title: string) => Promise<string | null>) {
  handle('srcPick', async (_e, kind: ListKind | null) => {
    const file = await pickXlsx(kind ? 'Excel για ' + KIND[kind].label : 'Εισαγωγή Excel');
    if (!file) return null;
    try {
      return await bookOf(file);
    } catch (e) {
      return fail(e instanceof OldFormatError ? e.message : e);
    }
  });
  handle('srcRead', async (_e, kind: ListKind) => {
    try {
      const b = await current(kind);
      if (!b) return fail('Δεν έχει οριστεί αρχείο');
      return { ...(await bookOf(b.file)), binding: b };
    } catch (e) {
      return fail(e);
    }
  });
  handle('srcSave', async (_e, kind: ListKind, b: SourceBinding | null) => {
    if (b && (typeof b.file !== 'string' || !srcMeta.allowed(b.file)))
      return fail('Άγνωστο αρχείο: διάλεξέ το με το «Διάλεξε Excel…»');
    try {
      saveBinding(kind, b);
      // προσωπικό: αφετηρία για τις διορθώσεις είναι ό,τι γράφει τώρα το Excel
      // αν η εφαρμογή έχει ήδη τα ίδια με το Excel γράφει μόνη της από εδώ και πέρα· αλλιώς πρώτα «Ενημέρωση Excel» με προεπισκόπηση
      if (b && kind === 'people' && !srcMeta.get('people')) {
        const book = await readBook(b.file);
        const sh = sheetOf(book.sheets, b.sheet);
        if (sh) {
          const snap = snapFromSheet(sh, b, store.state.people);
          srcMeta.set('people', {
            snap,
            keys: [],
            ...syncStamp(b, book),
            at: planPeopleWrite(sh, b, store.state, snap).sets.length ? '' : stampNow(),
          });
        }
      }
      notify();
      return reply('');
    } catch (e) {
      return fail(e);
    }
  });
  const known = (b: SourceBinding | null | undefined) =>
    !!b && typeof b.file === 'string' && srcMeta.allowed(b.file);
  handle(
    'srcImport',
    (
      _e,
      kind: StatusKind,
      b: SourceBinding,
      choices: Record<number, number | null>,
      keepRemoved: boolean,
      keepApp: string[],
    ) =>
      !known(b)
        ? fail('Άγνωστο αρχείο')
        : importStatuses(kind, b, choices || {}, !!keepRemoved, Array.isArray(keepApp) ? keepApp : []),
  );
  handle('srcApply', (_e, kind: ListKind, b: SourceBinding, cmd: Command, keys?: string[]) =>
    !known(b) ? fail('Άγνωστο αρχείο') : applySheet(kind, b, cmd, Array.isArray(keys) ? keys : []),
  );
  handle('srcKeys', (_e, kind: ListKind) => ({
    keys: srcMeta.get(kind)?.keys || [],
    base: srcMeta.get(kind)?.base || {},
  }));
  handle('srcPeople', async (_e, b: SourceBinding) => {
    if (!b || typeof b.file !== 'string' || !srcMeta.allowed(b.file)) return fail('Άγνωστο αρχείο');
    const nb = (await current('people', b))!;
    return rosterPreview(nb.file, nb);
  });
}
function registerSourcesWriteIpc() {
  handle('srcPlan', (_e, kind: ListKind) => planOut(kind));
  handle('srcWrite', async (_e, kind: ListKind) => {
    const r = await syncOut(kind, false);
    notify();
    return r.ok ? { ok: true, text: r.text, file: r.file } : r;
  });
  handle('srcNewFile', (_e, kind: ListKind) => createNew(kind));
  handle('srcStatus', async () => {
    retryPending();
    return statusAll();
  });
}
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
      registerReportRunIpc();
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
