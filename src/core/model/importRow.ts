// One person row that the roster import (Excel «Δυναμολόγιο») hands to the `importPeople` command.
//
// Purpose: the `ImportRow` type (a person without the fields the app owns, plus the optional ones the file may carry).
// Does NOT: read any Excel file (core/excel-in/roster.ts does) or apply the row (src/shared/commands.ts does).
// Owner layer: core/model (types only: no fs, no Electron, no React).
// Why: core/excel-in/roster.ts builds these rows and commands.ts consumes them; keeping the type in a neutral file
//   keeps the import `roster -> commands` out of core (commands.ts re-exports the type, so importers keep working).
// Covering tests: test/roster-sync.test.ts, test/origin.test.ts.
import type { Person } from './person';

/**
 * One imported person. `post`, `attached`, `notes` and `active` are set only when the file has a source for them;
 * whatever is missing stays as it is in the app.
 */
export interface ImportRow extends Omit<Person, 'id' | 'active' | 'post' | 'attached' | 'notes'> {
  active?: boolean;
  post?: string | null;
  attached?: boolean;
  notes?: string;
}
