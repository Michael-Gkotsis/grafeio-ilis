// Deprecated path: import from './shared/db' (the database store moved there in Phase 4.9c).
//
// Purpose: keeps the old import path alive so that the importers (main, features, test, bench) do not change in this PR.
// Does NOT: contain code. It re-exports the public face of the database package, with the same names as before.
// Owner layer: main (architecture). Importers migrate to the new path later; then this file is deleted.
// Why: the evaluation order of the dependencies is fixed by the bare imports in shared/db/index.ts.
// Covering test: test/db.test.ts.
export * from './shared/db';
