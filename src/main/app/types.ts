// Result and job shapes that several service groups of the main process hand to each other.
//
// Purpose: the five result/job types that main.ts declared next to the code that returns them.
// Does NOT: contain any value, import any module at run time (type imports only, so loading it evaluates nothing),
//   or say how a result is produced.
// Owner layer: main (architecture), `app/`.
// Why: the IPC handlers, and later the `features/<area>/service.ts` files (Phase 4.2-4.6), all name these types.
//   Moved verbatim (Phase 4.1b) so they do not have to import main.ts.
// Covering test: `npm run typecheck` (types only); the behaviour is covered by test/*.test.ts of each producer.
import type { Book, PrintOpts } from '../print';
import type { ExportKind, FormOut } from '../../shared/api';
import type { Sig } from '../../shared/sigs';

/**
 * A form that was written to disk and is tracked so it can be refreshed after a change (forms.json record).
 * `hash`/`vhash`: what the app wrote (file hash, values hash); `mtime`/`size`: the file as the app left it.
 */
export type OutRec = FormOut & {
  kind: ExportKind;
  hash: string;
  vhash?: string;
  mtime?: number;
  size?: number;
  sigs?: Sig[];
};

/** Answer of writing one list into its Excel file: the text for the user, or the error (`locked`: open in Excel). */
export type SyncOut =
  | { ok: true; text: string; file: string; unchanged: boolean }
  | { ok: false; error: string; locked?: boolean };

/** Answer of running a saved report («Έντυπα»): the file written, or why not (`confirm`: what to confirm). */
export type RepOut =
  | { ok: true; file: string; warnings: string[]; sheets?: string[] }
  | { ok: false; error: string; locked?: boolean; confirm?: string[] };

/** Answer of «Νέο αρχείο…» for one list kind: the new file and sheet, or the error. */
export type NewOut =
  | { ok: true; file: string; sheet: string; inRoster?: boolean; found?: boolean; sheets?: string[] }
  | { ok: false; error: string; locked?: boolean };

/** One open print-preview window: the Excel file behind it, its sheets, and the options being edited. */
export type PrintJob = {
  file: string;
  sheets: string[];
  tmp: string;
  book: Book;
  key: string;
  base: PrintOpts;
  opts: PrintOpts;
};
