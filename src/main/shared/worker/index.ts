// Public face of the Excel worker (the client that main uses, the typed protocol and the error table).
//
// Purpose: what the old src/main/offload.ts exported (`off`, `useWorker`, `workerUp`, `warmWorker`, `fromWorker`),
//   plus the protocol types and the error table. The host (the thread's side, `host.ts`) is NOT exported here: only
//   the worker entry imports it, so the main bundle never carries the job table.
// Does NOT: contain code (re-exports only).
// Owner layer: main (architecture), `shared/worker`.
// Why: src/main/offload.ts re-exports this folder so the importers do not change; they move here later (Phase 4.9b).
// Covering test: test/offload.test.ts and test/worker-protocol.test.ts.
export { off, useWorker, warmWorker, workerUp } from './client';
export { ERROR_KINDS, fromWireError, toWireError } from './errors';
export type {
  WireArgs,
  WireError,
  WorkerArgs,
  WorkerFns,
  WorkerName,
  WorkerReply,
  WorkerRequest,
  WorkerResult,
} from './protocol';
export { buf, fromWorker, toBuf } from './wire';
