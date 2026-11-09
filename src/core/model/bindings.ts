// Where each kind of list reads from and writes to, and where a form comes out: the binding types of Settings.
//
// Purpose: `ListKind`/`FormKind`, `SourceBinding` (file, sheet, header row, columns per field), `FormBinding`
// (template,
//   sheet, folder) and `HkaiMap` (cells of the «ΗΚΑΙ» sample).
// Does NOT: read or write any Excel (src/shared/sources.ts, src/main/sources.ts) or hold the field definitions.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: these are the types of Settings.sources/forms; they sit in the model so settings.ts needs no import from the
//   Excel code (sources.ts re-exports them, so existing imports keep working).
// Covering tests: test/sources.test.ts, test/custom-excel.test.ts.
import type { TypeKey } from './status';

export type ListKind =
  | 'people'
  | 'punish'
  | 'medical'
  | 'hospital'
  | 'step'
  | 'leave'
  | 'dn'
  | 'posts'
  | 'outside'
  | 'caps'
  | 'duties'
  | 'cadres'
  | 'cadreAbs';
export type FormKind = 'froura' | 'frouraSpen' | 'hkai' | 'outs' | 'check';
// Where a kind lives: file, sheet, header row (from 0) and the column of each field (from 0)
export interface SourceBinding {
  file: string;
  sheet: string;
  header: number;
  cols: Record<string, number>;
  write?: boolean; // the app writes its changes here (statuses only)
  // what it writes: all entries or only those valid today and later (default since 30/10: active, expired ones are
  // deleted)
  scope?: 'all' | 'active';
  values?: Record<string, TypeKey>; // Excel values that are not recognised by themselves (e.g. «ΕΛ ΑΡΒ») → kind
  month?: string; // duty check: the month of the sheet (YYYY-MM), when the title does not write it
  autoRead?: boolean; // statuses: plain Excel changes (new entries, another date) pass by themselves (default yes)
  // header (headText) of each field's column as main saw it (stampHeads): tells «the field's column changed» from «it
  // always had a header of the user's own»
  heads?: Record<string, string>;
}
// A form: which template (file and sheet) and where it comes out. Empty = the app's default.
export interface FormBinding {
  file?: string;
  sheet?: string; // «ΗΚΑΙ»: front page; outs: the outs sheet
  sheet2?: string; // «ΗΚΑΙ»: back page; outs: the staying sheet
  dir?: string; // output folder (empty = the general one of Settings)
  monthly?: boolean; // a subfolder per month (default yes), also in the general folder
  cells?: Partial<HkaiMap>; // «ΗΚΑΙ»: cells the user changed
}
// ------------------------------------------------------------------ «ΗΚΑΙ»: where each number goes
// A row per rank and a column per kind (prevented, absent), as in the form of sample 15.
export interface HkaiMap {
  title: string;
  date: string;
  rows: Record<string, number>;
  cols: Record<string, string>;
}
