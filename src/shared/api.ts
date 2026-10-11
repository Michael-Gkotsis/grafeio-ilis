// Το συμβόλαιο ανάμεσα στο UI (renderer) και στο main process. Ό,τι γράφει δεδομένα περνά από εδώ.
import type { AppState, AuditEntry } from './domain';
import type { Command } from './commands';
import type { ISODate } from './dates';
import type { Check } from './preflight';

export type ExportKind = 'froura' | 'hkai' | 'outs' | 'check' | 'frouraPsk' | 'outsPsk';
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
export interface ImportPreview { ok: true; token: string; file: string; total: number; active: number; added: number; updated: number; missing: number; warnings: string[]; essos: string; skipped: string[]; declared: number | null; found: number; suspicious: string[] }

export interface Api {
  boot(): Promise<Boot>;
  run(cmd: Command): Promise<CmdResult>;
  undo(): Promise<CmdResult>;
  sync(): Promise<CmdResult>;   // ό,τι άλλαξε στον main χωρίς εντολή από το UI (εξαγωγή, λήξεις, φάκελος)
  exportFile(kind: ExportKind, date: ISODate, opts?: { open?: boolean; ack?: boolean }): Promise<ExportResult>;
  pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null>;
  applyRoster(token: string, deactivateMissing: boolean): Promise<CmdResult>;
  backup(): Promise<{ ok: boolean; file?: string; error?: string }>;
  openFolder(which: 'output' | 'templates' | 'data' | 'backups'): Promise<void>;
  chooseOutputDir(): Promise<string | null>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(name: string): Promise<{ ok: boolean; error?: string }>;
  diag(): Promise<Diag>;
  setGpu(disable: boolean): Promise<void>;
  usbCopy(): Promise<UsbResult>;
  importBackup(): Promise<{ ok: boolean; error?: string; name?: string } | null>;
}
declare global { interface Window { api: Api } }
