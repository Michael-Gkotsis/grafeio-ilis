// The key that identifies a person across imports.
//
// Purpose: `personKey`: last name | first name | father name, in normalized capitals.
// Does NOT: match by ΑΣΜ; callers check ΑΣΜ first.
// Owner layer: core/people (pure: no fs, no Electron, no React); imports core/lib.
// Why: Used by the roster import and by «Νέος στρατιώτης» / the quick add (core/people/quickAdd.ts). It lives in
//   core/people so that both the commands and the quick add depend on it, never the quick add on the commands.
// Covering tests: test/roster-sync.test.ts, test/quick-add.test.ts.
import { normGreek } from '../lib/text';

/** Import/update from the roster: match with ΑΣΜ, otherwise with full name + father name. */
export const personKey = (p: { last: string; first: string; father: string }) =>
  normGreek(p.last + '|' + p.first + '|' + p.father);
