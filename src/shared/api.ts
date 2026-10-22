// Το συμβόλαιο ανάμεσα στο UI (renderer) και στο main process. Ό,τι γράφει δεδομένα περνά από εδώ.
import type { AppState, AuditEntry, Settings } from './domain';
import type { Command } from './commands';
import type { ISODate } from './dates';
import type { Check } from './preflight';
import type { Esso } from './esso';
import type { RawSheet } from './roster';
import type { Sig } from './sigs';
import type { Block, Layout, LayoutForm, LayoutSheet } from './layout';
import type { BuildOpts, RepCell, RepCol, RepKind, Report, RepTpl } from './reports';
import type { FormBinding, FormKind, HkaiMap, ListKind, PlanLine, SourceBinding, StatusKind, TableHit } from './sources';

export type ExportKind = 'froura' | 'hkai' | 'outs' | 'check' | 'frouraPsk' | 'outsPsk';
// print: προεπισκόπηση εκτύπωσης αντί για Excel · sigs: υπογραφές μόνο για αυτή τη φορά (Ρυθμίσεις › Υπογραφές για όλες)
export interface ExportOpts { open?: boolean; ack?: boolean; print?: boolean; sigs?: Sig[] }
// Φάκελος αρχείων στις Ρυθμίσεις: ο γενικός, ενός εντύπου ή των νέων Excel ενός είδους
export type DirTarget = 'output' | { form: FormKind } | { kind: ListKind };
export interface Boot { state: AppState; audit: AuditEntry[]; dataDir: string; outputDir: string; templatesDir: string; version: string; templates: TemplateInfo[]; lastUsb: string | null; seenUntil: number; sessionStart: number; dataFallback?: boolean }   // dataFallback: τα δεδομένα είναι στο προφίλ, όχι δίπλα στο exe
export interface TemplateInfo { id: string; name: string; file: string; ok: boolean; custom: boolean }
// Μετά από κάθε ενέργεια ο main στέλνει μόνο τα κομμάτια της κατάστασης που άλλαξαν (changes) και τις νέες γραμμές
// του ιστορικού (newAudit)· όλο το ιστορικό (audit) μόνο όταν άλλαξε κάποια παλιά γραμμή (αναίρεση).
// Σε έναν χρόνο οι καταστάσεις είναι πάνω από 400 KB: να μην περνούν σε κάθε κλικ.
export type CmdResult = { ok: true; changes: Partial<AppState>; newAudit: AuditEntry[]; audit?: AuditEntry[]; text: string } | { ok: false; error: string };
export type ExportResult = { ok: true; file: string; warnings: string[] } | { ok: false; error: string; checks?: Check[]; needAck?: boolean; locked?: boolean };
export interface RepHistEntry { at: string; date: ISODate; ids: (number | string)[]; n: number; file: string; sheets?: string[]; exists: boolean }
export type RepRunResult = { ok: true; file: string; warnings: string[]; sheets?: string[] } | { ok: false; error: string; locked?: boolean; confirm?: string[] };
export type UsbResult = { ok: true; file: string; day: string; warning?: string } | { ok: false; error: string } | null;
export interface BackupInfo { name: string; day: string; label: string; size: number }
export interface Diag { startupMs: number; procs: { type: string; kb: number; cpu: number }[]; gpuDisabled: boolean; versions: Record<string, string>; dbKb: number; people: number; statuses: number; guardDays: number; dataDir: string; backups: number; writes: WriteTime[]; worker: boolean }
export interface WriteTime { at: string; what: string; ms: number; error?: string }   // μία εγγραφή στο Excel και πόσο κράτησε
export interface ExcelBusy { on: boolean; at?: string; error?: string }   // ένδειξη «Γράφεται στο Excel…» / «Γράφτηκε 10:42»
export interface ImportPreview { ok: true; token: string; file: string; total: number; active: number; added: number; updated: number; missing: number; warnings: string[]; essos: string; skipped: string[]; declared: number | null; found: number; suspicious: string[]; changes: { who: string; what: string }[]; same: number }

// Αρχεία Excel: ένα βιβλίο όπως το βλέπει η αντιστοίχιση (τιμές κελιών και πίνακες που αναγνωρίστηκαν)
export interface SourceBook { ok: true; file: string; name: string; mtime: number; size: number; sheets: RawSheet[]; hits: TableHit[]; binding?: SourceBinding }   // binding: η αντιστοίχιση όπως είναι τώρα στο αρχείο
export type Fail = { ok: false; error: string; locked?: boolean };
// Κατάσταση κάθε είδους: αν βρίσκεται το αρχείο, αν άλλαξε εκτός εφαρμογής, αν περιμένει εγγραφή (π.χ. ήταν ανοιχτό)
export interface SourceStatus { kind: ListKind; file: string; exists: boolean; changed: boolean; synced: boolean; at: string; error?: string; locked?: boolean; pending?: boolean;
  hold?: string;      // δεν γράφει μόνη της μέχρι νέα ανάγνωση ή «Ενημέρωση Excel» (και γιατί)
  month?: string;     // έλεγχος υπηρεσιών: ο μήνας του φύλλου
  remap?: string;     // δεν διαβάζει ούτε γράφει μόνη της: οι στήλες δεν βρίσκονται με σιγουριά (και γιατί)
}
export interface WritePreview { ok: true; file: string; create: boolean; lines: PlanLine[]; total: number; foreign: number; notFound: string[]; ambiguous?: PlanLine[]; warn?: string[]; tidy?: string[] }   // tidy: μορφή που λείπει (τίτλος, λίστες επιλογής)
export interface FormInfo { ok: true; file: string; custom: boolean; sheets: string[]; sheet: string; sheet2?: string; hkai?: { map: HkaiMap; found: number; total: number; missing: string[] } }
export interface FormOut { form: FormKind; date: string; file: string; at: string; error?: string; pending?: boolean; manual?: boolean }

// ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ): τι θα μπει στο αρχείο της τωρινής, πού, και τα αρχεία παλιών ΕΣΣΟ
export interface EssoArchiveInfo { dir: string; name: string; at: string; people: number; files: number }
export interface EssoInfo {
  people: number;                                  // σε δύναμη τώρα
  files: { label: string; file: string; exists: boolean }[];   // τα Excel που μπαίνουν στο αρχείο
  outDirs: string[];                               // πού μένουν τα έντυπα που βγήκαν
  archiveRoot: string; newRoot: string;            // προεπιλογές: πού γράφεται το αρχείο, μέσα σε ποιον φάκελο φτιάχνεται ο φάκελος της νέας
  archives: EssoArchiveInfo[];
}
// roster: προεπισκόπηση (token) του Δυναμολογίου της νέας ΕΣΣΟ, αν το έχεις ήδη· newDir: δικός σου φάκελος (αλλιώς newRoot\<όνομα ΕΣΣΟ>)
// unit: τύπος μονάδας (Ίλη/Λόχος), κεφαλίδα και μονάδα του τίτλου για τη νέα ΕΣΣΟ
export interface EssoStart { esso: Esso; archiveRoot: string; newDir?: string; roster?: string; unit?: Pick<Settings, 'unitKind' | 'unit' | 'unitName'> }
export type EssoResult = { ok: true; archive: string; dir: string; files: string[]; warnings: string[] } | Fail;

// Έντυπα: πρότυπο όπως το βρήκε η εφαρμογή (φύλλα, γραμμή επικεφαλίδων, στήλες, {ΕΤΙΚΕΤΕΣ})
export interface TplInspect { sheets: string[]; sheet: string; head: number; data: number; headers: { c: number; text: string; f: string | null }[]; tags: RepCell[]; prepared: number; guessed: boolean }
export interface RepPreview { html: string; css: string; pages: number }
// Θέσεις πάνω στο χαρτί: το έντυπο όπως θα βγει (με τις θέσεις layout/sigs αν δόθηκαν), ή ένα από τα Έντυπα
export type LayoutReq = { form: LayoutForm; date: ISODate; sigs?: Sig[]; layout?: Layout } | { report: Report; file?: string; build?: BuildOpts; ids: (number | string)[]; date: ISODate };
export interface LayoutPv { css: string; sheets: (LayoutSheet & { html: string; pages: number })[]; warnings: string[] }
export type { Block };
export interface TplFile { exists: boolean; mtime: number }
// Πρόχειρο εντύπου για προεπισκόπηση: από αρχείο προτύπου, ή από τις επιλογές του «Φτιάξ' το εδώ» (χωρίς αρχείο ακόμα)
export type RepSource = { file: string } | { build: BuildOpts };
export interface Api {
  boot(): Promise<Boot>;
  run(cmd: Command): Promise<CmdResult>;
  undo(id?: number): Promise<CmdResult>;   // id: αναιρεί μόνο αν αυτή είναι ακόμα η τελευταία ενέργεια
  sync(): Promise<CmdResult>;
  dayCheck(): Promise<CmdResult>;   // άλλαξε η μέρα με την εφαρμογή ανοιχτή: λήξεις, αντίγραφο της μέρας, και ό,τι άλλαξε   // ό,τι άλλαξε στον main χωρίς εντολή από το UI (εξαγωγή, λήξεις, φάκελος)
  exportFile(kind: ExportKind, date: ISODate, opts?: ExportOpts): Promise<ExportResult>;
  // sigs: υπογραφές μόνο για αυτή τη φορά (αλλιώς Ρυθμίσεις › Υπογραφές)
  exportLists(date: ISODate, sigs?: Sig[]): Promise<ExportResult>;   // Δυναμολόγιο: ένα Excel με ένα φύλλο ανά φίλτρο (rosterLists.ts), ανοίγει μόλις γραφτεί
  exportRoster(date: ISODate, print?: boolean, sigs?: Sig[]): Promise<ExportResult>;   // Συνολικό Δυναμολόγιο με κεφαλίδα ΗΚΑΙ· print: προεπισκόπηση εκτύπωσης
  exportWeapons(date: ISODate, print?: boolean, sigs?: Sig[]): Promise<ExportResult>;   // Οπλισμός: ένα Excel με ένα φύλλο ανά φίλτρο (weapons.ts)· print: προεπισκόπηση εκτύπωσης
  exportCadre(date: ISODate, sigs?: Sig[]): Promise<ExportResult>;   // Στελέχη: ένα Excel (στελέχη, καταστάσεις, εκτός δύναμης), ανοίγει μόλις γραφτεί
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
  setGpu(disable: boolean): Promise<void>;
  usbCopy(): Promise<UsbResult>;
  importBackup(): Promise<{ ok: boolean; error?: string; name?: string } | null>;
  srcPick(kind: ListKind | null): Promise<SourceBook | Fail | null>;
  srcRead(kind: ListKind): Promise<SourceBook | Fail>;
  srcSave(kind: ListKind, b: SourceBinding | null): Promise<CmdResult>;
  // keepApp: εγγραφές που άλλαξαν και στις δύο πλευρές και κρατιέται η τιμή της εφαρμογής (γράφεται μετά στο Excel)
  srcImport(kind: StatusKind, b: SourceBinding, choices: Record<number, number | null>, keepRemoved?: boolean, keepApp?: string[]): Promise<CmdResult>;
  srcKeys(kind: StatusKind | 'duties'): Promise<{ keys: string[]; base: Record<string, string> }>;
  srcApply(kind: ListKind, b: SourceBinding, cmd: Command, keys?: string[]): Promise<CmdResult>;   // πόστα, εκτός δύναμης, δυνατότητες, έλεγχος υπηρεσιών (keys: κελιά που είδε η εφαρμογή)
  srcPeople(b: SourceBinding): Promise<ImportPreview | Fail>;
  srcPlan(kind: ListKind): Promise<WritePreview | Fail>;
  srcWrite(kind: ListKind): Promise<{ ok: true; text: string; file: string } | Fail>;
  // sheet: το φύλλο που φτιάχτηκε· inRoster: μπήκε ως φύλλο στο Δυναμολόγιο· found: το Δυναμολόγιο είχε ήδη τέτοιο πίνακα
  srcNewFile(kind: ListKind): Promise<{ ok: true; file: string; sheet: string; inRoster?: boolean; found?: boolean; sheets?: string[] } | Fail | null>;   // sheets: τα φύλλα που μπήκαν μαζί στο νέο Δυναμολόγιο
  srcStatus(): Promise<{ sources: SourceStatus[]; forms: FormOut[] }>;
  onSources(cb: (st: { sources: SourceStatus[]; forms: FormOut[] }) => void): () => void;
  onBusy(cb: (b: ExcelBusy) => void): () => void;
  formPick(form: FormKind): Promise<FormInfo | Fail | null>;
  formInfo(form: FormKind): Promise<FormInfo | Fail>;
  formSave(form: FormKind, b: FormBinding | null): Promise<CmdResult>;
  formDir(form: FormKind): Promise<string | null>;
  openPath(file: string): Promise<void>;
  printFile(file: string, sheet?: string | string[]): Promise<{ ok: true } | Fail>;   // προεπισκόπηση εκτύπωσης χωρίς Excel (sheet: τα φύλλα που τσεκάρονται)
  essoInfo(): Promise<EssoInfo>;
  essoDir(def?: string): Promise<string | null>;                 // διάλογος φακέλου (αρχείο ή φάκελος νέας ΕΣΣΟ)
  essoRoster(): Promise<ImportPreview | Fail | null>;           // το Δυναμολόγιο της νέας ΕΣΣΟ (προεπισκόπηση, χωρίς εισαγωγή)
  essoStart(o: EssoStart): Promise<EssoResult>;
  essoPick(): Promise<EssoArchiveInfo | Fail | null>;            // διάλεξε φάκελο αρχείου ΕΣΣΟ για επαναφορά
  essoRestore(dir: string): Promise<{ ok: true } | Fail>;        // επαναφορά και επανεκκίνηση
  essoOpen(dir: string): Promise<void>;
  // Έντυπα (file: όνομα αρχείου στον φάκελο «Πρότυπα εντύπων»)
  repUpload(kind: RepKind): Promise<{ ok: true; tpl: RepTpl; insp: TplInspect } | Fail | null>;
  repInspect(file: string, kind: RepKind, sheet?: string, head?: number): Promise<TplInspect | Fail>;
  repBuild(o: BuildOpts, kind: RepKind, file?: string): Promise<{ ok: true; file: string; mtime: number; sheet: string; head: number; cols: RepCol[]; cells: RepCell[] } | Fail>;
  repPreview(src: RepSource, r: Report, ids: (number | string)[], date: ISODate, raw?: boolean): Promise<RepPreview | Fail>;
  layoutPreview(q: LayoutReq): Promise<LayoutPv | Fail>;
  // out 'sheet': γράφει φύλλο στο Δυναμολόγιο/άλλο Excel· confirm: φύλλα με ίδιο όνομα που δεν έφτιαξε το έντυπο (ξανά με force)
  repRun(r: Report, file: string, ids: (number | string)[], date: ISODate, print?: boolean, force?: boolean, opts?: { quiet?: boolean; again?: boolean }): Promise<RepRunResult>;
  repHist(id: string): Promise<RepHistEntry[]>;   // ιστορικό εκδόσεων: τα 10 τελευταία, νεότερο πρώτο
  repTimes(id: string): Promise<Record<string, number>>;   // τυχαίοι: πόσες φορές βγήκε ο καθένας σε αυτό το έντυπο σε αυτή την ΕΣΣΟ
  repPickFile(): Promise<string | null>;
  repOpenTpl(file: string): Promise<void>;
  repFiles(files: string[]): Promise<Record<string, TplFile>>;
  repLast(): Promise<Record<string, string>>;   // πότε βγήκε τελευταία φορά κάθε έντυπο (id → «2026-10-19 09:12»)
}
declare global { interface Window { api: Api } }
