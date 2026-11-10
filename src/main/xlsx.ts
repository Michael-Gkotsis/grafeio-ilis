// Deprecated path: import from './shared/excel/xlsx' (the xlsx engine moved there in Phase 4.7).
//
// Purpose: keeps the old import path alive so that the importers (src/main, test, bench) do not change in this PR.
// Does NOT: contain code. It re-exports the public face of the engine, with the same names as before.
// Owner layer: main (architecture). Importers migrate to the new path later; then this file is deleted.
// Covering test: every test that imports the engine (e.g. test/excel-misc.test.ts).
export * from './shared/excel/xlsx';
