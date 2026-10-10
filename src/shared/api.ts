// Το συμβόλαιο ανάμεσα στο UI (renderer) και στο main process. Ό,τι γράφει δεδομένα περνά από εδώ.
import type { AppState, AuditEntry } from './domain';
import type { Command } from './commands';
import type { ISODate } from './dates';

export type ExportKind = 'froura' | 'hkai' | 'outs' | 'check';
export interface Boot { state: AppState; audit: AuditEntry[]; dataDir: string; outputDir: string; templatesDir: string; version: string; templates: TemplateInfo[] }
export interface TemplateInfo { id: string; name: string; file: string; ok: boolean; custom: boolean }
export type CmdResult = { ok: true; state: AppState; audit: AuditEntry[]; text: string } | { ok: false; error: string };
export type ExportResult = { ok: true; file: string; warnings: string[] } | { ok: false; error: string };
export interface ImportPreview { ok: true; token: string; file: string; total: number; active: number; added: number; updated: number; missing: number; warnings: string[]; essos: string }

export interface Api {
  boot(): Promise<Boot>;
  run(cmd: Command): Promise<CmdResult>;
  undo(): Promise<CmdResult>;
  exportFile(kind: ExportKind, date: ISODate, opts?: { open?: boolean }): Promise<ExportResult>;
  pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null>;
  applyRoster(token: string, deactivateMissing: boolean): Promise<CmdResult>;
  backup(): Promise<{ ok: boolean; file?: string; error?: string }>;
  openFolder(which: 'output' | 'templates' | 'data' | 'backups'): Promise<void>;
  chooseOutputDir(): Promise<string | null>;
}
declare global { interface Window { api: Api } }
