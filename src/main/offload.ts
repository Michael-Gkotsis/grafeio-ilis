// Deprecated path: import from './shared/worker' (the Excel worker client moved there in Phase 4.9b).
//
// Purpose: keeps the old import path alive so that the importers (main, features, test) do not change in this PR.
// Does NOT: contain code. It re-exports the public face of the worker client, with the same names as before. The bare
//   imports below only fix the order in which the bundle evaluates the dependencies.
// Owner layer: main (architecture). Importers migrate to the new path later; then this file is deleted.
// Why: the bare imports repeat, in the same order, the value imports the old file had, so that the modules it loaded
//   (files, exports, sources) are still evaluated in the same order in the main bundle.
// Covering test: test/offload.test.ts.
import 'worker_threads';
import 'fs';
import './files';
import './exports';
import './sources';
export * from './shared/worker';
