// Fixed lookup tables of the main process: template files, made-Excel signature forms, source-sheet commands.
//
// Purpose: the four constant tables that more than one service group reads.
// Does NOT: read the disk, `store` or any path (file NAMES only; app/paths.ts turns them into paths), and it never
//   changes a user-facing Greek text: the names below are shown in the UI and written to files as they are.
// Owner layer: main (architecture), `app/`.
// Why: they sat in the middle of main.ts between the functions that use them. Moved verbatim (Phase 4.1b) so the
//   `features/<area>/service.ts` files of Phase 4.2-4.6 import them instead of reaching into main.ts.
// Covering test: test/architecture.test.ts (layer imports); the template file names are part of the frozen
//   `templates/` contract (CLAUDE.md rule 1), checked by `npm run bench:golden`.
import type { Command } from '../../shared/commands';
import type { ExportKind } from '../../shared/api';
import type { SigForm } from '../../shared/sigs';
import type { FormKind, ListKind } from '../../shared/sources';

/** The bundled form templates: export kind, the name the UI shows, and the file name inside `templates/`. */
export const TPL: { id: ExportKind; name: string; file: string }[] = [
  { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΒΕΝ)', file: 'froura.xlsx' },
  { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΠΕΝ)', file: 'froura-spen.xlsx' },
  { id: 'hkai', name: 'ΗΚΑΙ (μπροστινο, πισω)', file: 'hkai.xlsx' },
  { id: 'outs', name: 'Εξοδούχοι / Παραμένοντες', file: 'exodouxoi.xlsx' },
];

/** Template file name of each form kind (`check` has none: it is built by the app). */
export const FORM_FILE: Record<Exclude<FormKind, 'check'>, string> = {
  froura: 'froura.xlsx',
  frouraSpen: 'froura-spen.xlsx',
  hkai: 'hkai.xlsx',
  outs: 'exodouxoi.xlsx',
};

/** The Excel files the app builds itself (excel.ts), by what they are. */
export type MadeKind = 'check' | 'lists' | 'rosterPrint' | 'rosterPreview' | 'cadre' | 'weapons' | 'imer';
/** Which signature set (Ρυθμίσεις › Υπογραφές) each made Excel uses. */
export const MADE_FORM: Record<MadeKind, SigForm> = {
  check: 'check',
  lists: 'roster',
  rosterPrint: 'roster',
  rosterPreview: 'roster',
  cadre: 'cadre',
  weapons: 'weapons',
  imer: 'imer',
};

/** The command that applies a sheet read from Excel, for the kinds that are not the personnel list or a status. */
export const SHEET_CMDS: Partial<Record<ListKind, Command['t']>> = {
  posts: 'setPeopleFields',
  outside: 'setPeopleFields',
  caps: 'importCaps',
  duties: 'importDuties',
  cadres: 'importCadres',
  cadreAbs: 'importCadreAbs',
};
