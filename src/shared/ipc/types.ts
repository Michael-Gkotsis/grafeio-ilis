// Types of the IPC contract between the UI (renderer) and the main process: every payload that crosses the bridge.
// Purpose: the `Api` interface (what `window.api` offers) and the request/result types it uses. Does NOT: hold
//   channel names or runtime code (contract.ts) or any logic. Owner layer: shared, type-only (zero runtime cost).
// Why: whatever writes data passes through here, so the shape of every call is written down once.
// Covering test: test/ipc-contract.test.ts (the contract must list exactly the invoke methods of `Api`).
import type { AppState, AuditEntry } from '../../core/model/state';
import type { Settings } from '../../core/model/settings';
import type { Command } from '../commands';
import type { ISODate } from '../../core/lib/dates';
import type { ExportKind } from '../../core/model/exportKind';
import type { Check } from '../preflight';
import type { Esso } from '../esso';
import type { RawSheet } from '../roster';
import type { Sig } from '../sigs';
import type { ImerReq } from '../imer';
import type { HdDoc } from '../hd';
import type { Block, Layout, LayoutForm, LayoutSheet } from '../layout';
import type { BuildOpts, BuiltOut, RepCell, RepKind, Report, RepTpl } from '../reports';
import type {
  FormBinding,
  FormKind,
  HkaiMap,
  ListKind,
  PlanLine,
  SourceBinding,
  StatusKind,
  TableHit,
} from '../sources';
export type { ExportKind };
// print: print preview instead of Excel · sigs: signatures for this export only (Settings › Signatures: permanent)
export interface ExportOpts {
  open?: boolean;
  ack?: boolean;
  print?: boolean;
  sigs?: Sig[];
}
// Folder choice in Settings: the general one, the one of a single form, or the one for the new Excel files of a kind
export type DirTarget = 'output' | { form: FormKind } | { kind: ListKind };
export interface Boot {
  state: AppState;
  audit: AuditEntry[];
  dataDir: string;
  outputDir: string;
  templatesDir: string;
  version: string;
  templates: TemplateInfo[];
  lastUsb: string | null;
  seenUntil: number;
  sessionStart: number;
  dataFallback?: boolean;
} // dataFallback: the data lives in the user profile, not next to the exe
export interface TemplateInfo {
  id: string;
  name: string;
  file: string;
  ok: boolean;
  custom: boolean;
}
// After every action main sends only the changed parts of the state (changes) and the new audit rows (newAudit); the
// whole audit only when an old row changed (undo). A year of state is over 400 KB: it must not travel on every click.
export type CmdResult =
  | { ok: true; changes: Partial<AppState>; newAudit: AuditEntry[]; audit?: AuditEntry[]; text: string }
  | { ok: false; error: string };
export type ExportResult =
  | { ok: true; file: string; warnings: string[] }
  | { ok: false; error: string; checks?: Check[]; needAck?: boolean; locked?: boolean };
export interface RepHistEntry {
  at: string;
  date: ISODate;
  ids: (number | string)[];
  n: number;
  file: string;
  sheets?: string[];
  exists: boolean;
}
export type RepRunResult =
  | { ok: true; file: string; warnings: string[]; sheets?: string[] }
  | { ok: false; error: string; locked?: boolean; confirm?: string[] };
export type UsbResult = { ok: true; file: string; day: string; warning?: string } | { ok: false; error: string } | null;
// Auto-update (main/update.ts): main keeps the state and sends the whole UpdInfo on every change
export interface UpdAvail {
  version: string;
  date: string;
  size: number;
  notes: string[];
  setup: boolean;
} // setup: a different Electron, needs Setup.exe
export interface UpdInfo {
  version: string;
  canApply: boolean;
  auto: boolean;
  lastCheck: number;
  lastOk: boolean;
  lastError: string;
  checking: boolean;
  avail: UpdAvail | null;
  offer: boolean;
  phase: 'idle' | 'working' | 'ready';
  step: number;
  got: number;
  total: number;
  backup: string;
  error: string;
  target: string;
  readyVersion: string;
  prev: string | null;
  releases: string;
}
export interface BackupInfo {
  name: string;
  day: string;
  label: string;
  size: number;
}
export interface Diag {
  startupMs: number;
  procs: { type: string; kb: number; cpu: number }[];
  gpuDisabled: boolean;
  versions: Record<string, string>;
  dbKb: number;
  people: number;
  statuses: number;
  guardDays: number;
  dataDir: string;
  backups: number;
  writes: WriteTime[];
  worker: boolean;
}
export interface WriteTime {
  at: string;
  what: string;
  ms: number;
  error?: string;
} // one write to Excel and how long it took
export interface ExcelBusy {
  on: boolean;
  at?: string;
  error?: string;
} // the indicator «Γράφεται στο Excel…» / «Γράφτηκε 10:42»
export interface ImportPreview {
  ok: true;
  token: string;
  file: string;
  total: number;
  active: number;
  added: number;
  updated: number;
  missing: number;
  warnings: string[];
  essos: string;
  skipped: string[];
  declared: number | null;
  found: number;
  suspicious: string[];
  changes: { who: string; what: string }[];
  same: number;
}

// Excel files: one workbook as the mapping sees it (cell values and the tables that were recognised)
export interface SourceBook {
  ok: true;
  file: string;
  name: string;
  mtime: number;
  size: number;
  sheets: RawSheet[];
  hits: TableHit[];
  binding?: SourceBinding;
} // binding: the mapping as it is now in the file
export type Fail = { ok: false; error: string; locked?: boolean };
// State of each kind: file found, changed outside the app, write pending (e.g. it was open)
export interface SourceStatus {
  kind: ListKind;
  file: string;
  exists: boolean;
  changed: boolean;
  synced: boolean;
  at: string;
  error?: string;
  locked?: boolean;
  pending?: boolean;
  hold?: string; // does not write by itself until a new read or «Ενημέρωση Excel» (and why)
  month?: string; // duty check: the month of the sheet
  remap?: string; // neither reads nor writes by itself: the columns are not found with certainty (and why)
}
export interface WritePreview {
  ok: true;
  file: string;
  create: boolean;
  lines: PlanLine[];
  total: number;
  foreign: number;
  notFound: string[];
  ambiguous?: PlanLine[];
  warn?: string[];
  tidy?: string[];
} // tidy: formatting that is missing (title, choice lists)
export interface FormInfo {
  ok: true;
  file: string;
  custom: boolean;
  sheets: string[];
  sheet: string;
  sheet2?: string;
  hkai?: { map: HkaiMap; found: number; total: number; missing: string[] };
}
export interface FormOut {
  form: FormKind;
  date: string;
  file: string;
  at: string;
  error?: string;
  pending?: boolean;
  manual?: boolean;
}

// ΕΣΣΟ (Settings › ΕΣΣΟ): what goes into the current one's archive, where, and the archives of old ΕΣΣΟ
export interface EssoArchiveInfo {
  dir: string;
  name: string;
  at: string;
  people: number;
  files: number;
}
export interface EssoInfo {
  people: number; // in strength now
  files: { label: string; file: string; exists: boolean }[]; // the Excel files that go into the archive
  outDirs: string[]; // where the forms that were produced stay
  archiveRoot: string;
  newRoot: string; // defaults: where the archive is written, inside which folder the folder of the new one is created
  archives: EssoArchiveInfo[];
}
// roster: preview (token) of the new ΕΣΣΟ's Δυναμολόγιο if you have it; newDir: own folder (else newRoot\<ΕΣΣΟ name>);
// unit: unit kind (Ίλη/Λόχος), header and unit of the title for the new ΕΣΣΟ
export interface EssoStart {
  esso: Esso;
  archiveRoot: string;
  newDir?: string;
  roster?: string;
  unit?: Pick<Settings, 'unitKind' | 'unit' | 'unitName'>;
}
export type EssoResult = { ok: true; archive: string; dir: string; files: string[]; warnings: string[] } | Fail;

// Forms: a template as the app found it (sheets, header row, columns, {TAGS})
export interface TplInspect {
  sheets: string[];
  sheet: string;
  head: number;
  data: number;
  headers: { c: number; text: string; f: string | null }[];
  tags: RepCell[];
  unknown?: { ref: string; tag: string }[];
  prepared: number;
  guessed: boolean;
}
// counts: per table, how many rows are shown out of how many (only when a sample was requested)
export interface RepPreview {
  html: string;
  css: string;
  pages: number;
  counts?: { shown: number; total: number }[];
}
// Positions on the paper: the form as it will come out (with the layout/sigs positions if given), or one of the Έντυπα
export type LayoutReq =
  | { form: LayoutForm; date: ISODate; sigs?: Sig[]; layout?: Layout }
  | { report: Report; file?: string; build?: BuildOpts; ids: (number | string)[]; date: ISODate };
export interface LayoutPv {
  css: string;
  sheets: (LayoutSheet & { html: string; pages: number })[];
  warnings: string[];
}
export type { Block };
export interface TplFile {
  exists: boolean;
  mtime: number;
}
// Draft of a form for the preview: from a template file, or from the options of «Φτιάξ' το εδώ» (no file yet)
export type RepSource = { file: string } | { build: BuildOpts };
export interface Api {
  boot(): Promise<Boot>;
  run(cmd: Command): Promise<CmdResult>;
  undo(id?: number): Promise<CmdResult>; // id: undoes only if that is still the last action
  sync(): Promise<CmdResult>;
  // the day changed with the app open: expiries, the day's backup, and whatever main changed without a UI command
  dayCheck(): Promise<CmdResult>;
  exportFile(kind: ExportKind, date: ISODate, opts?: ExportOpts): Promise<ExportResult>;
  // sigs: signatures for this one time only (otherwise Settings › Signatures)
  exportLists(date: ISODate, sigs?: Sig[]): Promise<ExportResult>; // Δυναμολόγιο: a sheet per filter (rosterLists.ts)
  // Ημερήσια Διαταγή: Word (your own template or the built-in one) or print without Word
  exportHd(req: { date: ISODate; doc: HdDoc; print?: boolean; sigs?: Sig[] }): Promise<ExportResult>;
  // your own Word template with {…} tags
  pickHdTpl(): Promise<{ ok: true; file: string; name: string } | { ok: false; error: string } | null>;
  exportImer(req: ImerReq, print?: boolean, sigs?: Sig[]): Promise<ExportResult>; // Ημερολόγιο κωλυομένων
  exportRoster(date: ISODate, print?: boolean, sigs?: Sig[]): Promise<ExportResult>; // total Δυναμολόγιο, ΗΚΑΙ header
  exportWeapons(date: ISODate, print?: boolean, sigs?: Sig[]): Promise<ExportResult>; // Οπλισμός (weapons.ts)
  exportCadre(date: ISODate, sigs?: Sig[]): Promise<ExportResult>; // Στελέχη: cadre, statuses, out of strength
  pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null>;
  applyRoster(token: string, deactivateMissing: boolean): Promise<CmdResult>;
  backup(): Promise<{ ok: boolean; file?: string; error?: string }>;
  openFolder(which: 'output' | 'templates' | 'data' | 'backups'): Promise<void>;
  chooseOutputDir(): Promise<string | null>;
  dirChoose(t: DirTarget): Promise<CmdResult | null>;
  dirReset(t: DirTarget): Promise<CmdResult>;
  dirOpen(t: DirTarget): Promise<string>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(name: string): Promise<{ ok: boolean; error?: string }>;
  diag(): Promise<Diag>;
  updInfo(): Promise<UpdInfo>;
  updCheck(): Promise<UpdInfo>;
  updAuto(on: boolean): Promise<UpdInfo>;
  updStart(): Promise<void>;
  updCancel(): Promise<void>;
  updSeen(later: boolean): Promise<void>; // the «Νέα έκδοση» window opens by itself once a day
  updSkip(): Promise<void>; // «Να μη με ξαναρωτήσει για αυτή την έκδοση» (do not ask again for this version)
  updRestart(): Promise<void>;
  updFile(): Promise<{ ok: boolean; error?: string } | null>;
  updRollback(): Promise<{ ok: boolean; error?: string }>;
  updOpenReleases(): Promise<void>;
  onUpdate(cb: (i: UpdInfo) => void): () => void;
  setGpu(disable: boolean): Promise<void>;
  usbCopy(): Promise<UsbResult>;
  importBackup(): Promise<{ ok: boolean; error?: string; name?: string } | null>;
  srcPick(kind: ListKind | null): Promise<SourceBook | Fail | null>;
  srcRead(kind: ListKind): Promise<SourceBook | Fail>;
  srcSave(kind: ListKind, b: SourceBinding | null): Promise<CmdResult>;
  // keepApp: records changed on both sides where the app's value is kept (written to Excel afterwards)
  srcImport(
    kind: StatusKind,
    b: SourceBinding,
    choices: Record<number, number | null>,
    keepRemoved?: boolean,
    keepApp?: string[],
  ): Promise<CmdResult>;
  srcKeys(kind: ListKind): Promise<{ keys: string[]; base: Record<string, string> }>;
  // posts, out of strength, abilities, duty check (keys: cells the app has seen)
  srcApply(kind: ListKind, b: SourceBinding, cmd: Command, keys?: string[]): Promise<CmdResult>;
  srcPeople(b: SourceBinding): Promise<ImportPreview | Fail>;
  srcPlan(kind: ListKind): Promise<WritePreview | Fail>;
  srcWrite(kind: ListKind): Promise<{ ok: true; text: string; file: string } | Fail>;
  // sheet: the sheet created; inRoster: it went into the Δυναμολόγιο as a sheet; found: Δυναμολόγιο had such a table
  srcNewFile(
    kind: ListKind,
  ): Promise<
    { ok: true; file: string; sheet: string; inRoster?: boolean; found?: boolean; sheets?: string[] } | Fail | null
  >; // sheets: the sheets that went together into the new Δυναμολόγιο
  srcStatus(): Promise<{ sources: SourceStatus[]; forms: FormOut[] }>;
  onSources(cb: (st: { sources: SourceStatus[]; forms: FormOut[] }) => void): () => void;
  onBusy(cb: (b: ExcelBusy) => void): () => void;
  formPick(form: FormKind): Promise<FormInfo | Fail | null>;
  formInfo(form: FormKind): Promise<FormInfo | Fail>;
  formSave(form: FormKind, b: FormBinding | null): Promise<CmdResult>;
  formDir(form: FormKind): Promise<string | null>;
  openPath(file: string): Promise<void>;
  printFile(file: string, sheet?: string | string[]): Promise<{ ok: true } | Fail>; // preview, no Excel (sheet: ticked)
  essoInfo(): Promise<EssoInfo>;
  essoDir(def?: string): Promise<string | null>; // folder dialog (archive or folder of the new ΕΣΣΟ)
  essoRoster(): Promise<ImportPreview | Fail | null>; // the Δυναμολόγιο of the new ΕΣΣΟ (preview, no import)
  essoStart(o: EssoStart): Promise<EssoResult>;
  essoPick(): Promise<EssoArchiveInfo | Fail | null>; // pick an ΕΣΣΟ archive folder to restore
  essoRestore(dir: string): Promise<{ ok: true } | Fail>; // restore and restart
  essoOpen(dir: string): Promise<void>;
  // Forms (file: file name inside the folder «Πρότυπα εντύπων»)
  repUpload(kind: RepKind): Promise<{ ok: true; tpl: RepTpl; insp: TplInspect } | Fail | null>;
  repInspect(file: string, kind: RepKind, sheet?: string, head?: number): Promise<TplInspect | Fail>;
  repBuild(
    o: BuildOpts,
    kind: RepKind,
    file?: string,
  ): Promise<({ ok: true; file: string; mtime: number } & BuiltOut) | Fail>;
  repPreview(
    src: RepSource,
    r: Report,
    ids: (number | string)[],
    date: ISODate,
    raw?: boolean,
    opts?: { sample?: number },
  ): Promise<RepPreview | Fail>;
  layoutPreview(q: LayoutReq): Promise<LayoutPv | Fail>;
  // out 'sheet': writes a sheet into the Δυναμολόγιο/another Excel; confirm: same-name sheets the form did not make
  repRun(
    r: Report,
    file: string,
    ids: (number | string)[],
    date: ISODate,
    print?: boolean,
    force?: boolean,
    opts?: { quiet?: boolean; again?: boolean },
  ): Promise<RepRunResult>;
  repHist(id: string): Promise<RepHistEntry[]>; // history of versions: the last 10, newest first
  repTimes(id: string): Promise<Record<string, number>>; // random picks: times each came out in this ΕΣΣΟ
  repPickFile(): Promise<string | null>;
  repOpenTpl(file: string): Promise<void>;
  repFiles(files: string[]): Promise<Record<string, TplFile>>;
  repLast(): Promise<Record<string, string>>; // when each form last came out (id → «2026-10-19 09:12»)
}
declare global {
  interface Window {
    api: Api;
  }
}
