// The esbuild entry of the Excel worker thread (`dist/main/worker.js`, found by `useWorker`).
//
// Purpose: starts the job server of shared/worker/host.ts on the thread's `parentPort`.
// Does NOT: contain the jobs or the protocol (shared/worker/*). The path `dist/main/worker.js` is part of how main
//   finds the worker, so this entry keeps its place and name (scripts/build.mjs).
// Owner layer: main (architecture).
// Why: the old worker.ts held the job table; it moved to shared/worker/host.ts (Phase 4.9b). The bundle of this entry
//   loads the same modules in the same order as before.
// Covering test: test/offload.test.ts (bundles this file and runs it as a Worker).
import { parentPort } from 'worker_threads';
import { serve } from './shared/worker/host';

serve(parentPort!);
