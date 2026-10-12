// Το συμβόλαιο ανάμεσα στο UI (renderer) και στο main process. Ό,τι γράφει δεδομένα περνά από εδώ.
import type { AppState, AuditEntry } from './domain';
import type { Command } from './commands';
import type { ISODate } from './dates';
import type { Check } from './preflight';
import type { RawSheet } from './roster';
import type { FormBinding, FormKind, HkaiMap, ListKind, PlanLine, SourceBinding, StatusKind, TableHit } from './sources';

export type ExportKind = 'froura' | 'hkai' | 'outs' | 'check' | 'frouraPsk' | 'outsPsk';
// Φάκελος αρχείων στις Ρυθμίσεις: ο γενικός, ενός εντύπου ή των νέων Excel ενός είδους
export type DirTarget = 'output' | { form: FormKind } | { kind: StatusKind };
export interface Boot { state: AppState; audit: AuditEntry[]; dataDir: string; outputDir: string; templatesDir: string; version: string; templates: TemplateInfo[]; lastUsb: string | null; seenUntil: number; sessionStart: number }
export interface TemplateInfo { id: string; name: string; file: string; ok: boolean; custom: boolean }
// Μετά από κάθε ενέργεια ο main στέλνει μόνο τα κομμάτια της κατάστασης που άλλαξαν (changes) και τις νέες γραμμές
// του ιστορικού (newAudit)· όλο το ιστορικό (audit) μόνο όταν άλλαξε κάποια παλιά γραμμή (αναίρεση).
// Σε έναν χρόνο οι καταστάσεις είναι πάνω από 400 KB: να μην περνούν σε κάθε κλικ.
export type CmdResult = { ok: true; changes: Partial<AppState>; newAudit: AuditEntry[]; audit?: AuditEntry[]; text: string } | { ok: false; error: string };
export type ExportResult = { ok: true; file: string; warnings: string[] } | { ok: false; error: string; checks?: Check[]; needAck?: boolean; locked?: boolean };
export type UsbResult = { ok: true; file: string; day: string; warning?: string } | { ok: false; error: string } | null;
export interface BackupInfo { name: string; day: string; label: string; size: number }
export interface Diag { startupMs: number; procs: { type: string; kb: number; cpu: number }[]; gpuDisabled: boolean; versions: Record<string, string>; dbKb: number; people: number; statuses: number; guardDays: number; dataDir: string; backups: number }
export interface ImportPreview { ok: true; token: string; file: string; total: number; active: number; added: number; updated: number; missing: number; warnings: string[]; essos: string; skipped: string[]; declared: number | null; found: number; suspicious: string[]; changes: { who: string; what: string }[]; same: number }

// Αρχεία Excel: ένα βιβλίο όπως το βλέπει η αντιστοίχιση (τιμές κελιών και πίνακες που αναγνωρίστηκαν)
export interface SourceBook { ok: true; file: string; name: string; mtime: number; size: number; sheets: RawSheet[]; hits: TableHit[]; binding?: SourceBinding }   // binding: η αντιστοίχιση όπως είναι τώρα στο αρχείο
export type Fail = { ok: false; error: string; locked?: boolean };
// Κατάσταση κάθε είδους: αν βρίσκεται το αρχείο, αν άλλαξε εκτός εφαρμογής, αν περιμένει εγγραφή (π.χ. ήταν ανοιχτό)
export interface SourceStatus { kind: ListKind; file: string; exists: boolean; changed: boolean; synced: boolean; at: string; error?: string; locked?: boolean; pending?: boolean;
  hold?: string;      // δεν γράφει μόνη της μέχρι νέα ανάγνωση ή «Ενημέρωση Excel» (και γιατί)
  month?: string;     // έλεγχος υπηρεσιών: ο μήνας του φύλλου
}
export interface WritePreview { ok: true; file: string; create: boolean; lines: PlanLine[]; total: number; foreign: number; notFound: string[] }
export interface FormInfo { ok: true; file: string; custom: boolean; sheets: string[]; sheet: string; sheet2?: string; hkai?: { map: HkaiMap; found: number; total: number; missing: string[] } }
export interface FormOut { form: FormKind; date: string; file: string; at: string; error?: string; pending?: boolean; manual?: boolean }

export interface Api {
  boot(): Promise<Boot>;
  run(cmd: Command): Promise<CmdResult>;
  undo(): Promise<CmdResult>;
  sync(): Promise<CmdResult>;   // ό,τι άλλαξε στον main χωρίς εντολή από το UI (εξαγωγή, λήξεις, φάκελος)
  exportFile(kind: ExportKind, date: ISODate, opts?: { open?: boolean; ack?: boolean; print?: boolean }): Promise<ExportResult>;   // print: προεπισκόπηση εκτύπωσης αντί για Excel
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
  srcKeys(kind: StatusKind): Promise<{ keys: string[]; base: Record<string, string> }>;
  srcApply(kind: ListKind, b: SourceBinding, cmd: Command, keep?: string[]): Promise<CmdResult>;   // πόστα, εκτός δύναμης, δυνατότητες, έλεγχος υπηρεσιών
  srcPeople(b: SourceBinding): Promise<ImportPreview | Fail>;
  srcPlan(kind: ListKind): Promise<WritePreview | Fail>;
  srcWrite(kind: ListKind): Promise<{ ok: true; text: string; file: string } | Fail>;
  srcNewFile(kind: StatusKind): Promise<{ ok: true; file: string } | Fail | null>;
  srcStatus(): Promise<{ sources: SourceStatus[]; forms: FormOut[] }>;
  onSources(cb: (st: { sources: SourceStatus[]; forms: FormOut[] }) => void): () => void;
  formPick(form: FormKind): Promise<FormInfo | Fail | null>;
  formInfo(form: FormKind): Promise<FormInfo | Fail>;
  formSave(form: FormKind, b: FormBinding | null): Promise<CmdResult>;
  formDir(form: FormKind): Promise<string | null>;
  openPath(file: string): Promise<void>;
  printFile(file: string, sheet?: string): Promise<{ ok: true } | Fail>;   // προεπισκόπηση εκτύπωσης χωρίς Excel (sheet: το φύλλο που τσεκάρεται)
}
declare global { interface Window { api: Api } }
