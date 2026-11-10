// The typed contract between the main process and the Excel worker thread.
//
// Purpose: `WorkerFns` (every function the worker runs, with the exact arguments `off(...)` sends and the result it
//   gets back), the request and reply messages (`WorkerRequest`, `WorkerReply`) and the shape an error takes on the
//   wire (`WireError`). Both ends (client.ts and host.ts) are typed from this one file.
// Does NOT: contain runtime code (types only, so importing it adds nothing to a bundle), run anything, or know how an
//   error is rebuilt (errors.ts).
// Owner layer: main (architecture), `shared/worker`. Imports only types of the engines and of the shared domain.
// Why: before Phase 4.9b `off(fn: string, args: unknown[], ...)` and `FNS: Record<string, untyped function>` let a
//   wrong name, a wrong argument or a wrong result type compile. The signatures below are taken from the real
//   functions (`Parameters<>`/`ReturnType<>`), so the compiler now checks every `off(...)` call site against them.
// Wire rules: the app state is NEVER an argument (it travels in `WorkerRequest.state`, only when it changed, and the
//   host puts it back as the second argument of the engines that need it). A `Buffer` crosses the thread boundary as
//   a plain `Uint8Array` (structured clone), so the host side types them as `Uint8Array` (`WireArgs`) and turns them
//   back into Buffers; results come back as Buffers again, one level deep (wire.ts).
// Covering test: test/worker-protocol.test.ts (types and runtime), test/offload.test.ts (the worker end to end).
import type { AppState } from '../../../shared/domain';
import type { forBuild } from '../../../core/reports/builder';
import type { dutyCheck } from '../../excel';
import type { fillFroura, fillHkai, fillOuts, signMade } from '../../exports';
import type { mergeFirstSheets, mergeSheets } from '../../xlsx';
import type { readBook, valuesHash, writeGroup } from '../../sources';
import type { fillReport, placeSheets, previewReport, previewTemplate } from '../../reports';
import type { zipHash } from '../../ziphash';

/** Drops the app state (the 2nd parameter of an engine): `[tpl, state, ...rest]` becomes `[tpl, ...rest]`. */
type DropState<A extends unknown[]> = A extends [infer First, AppState, ...infer Rest] ? [First, ...Rest] : never;
/** The parameters after the template and the app state: `[tpl, state, ...rest]` gives `rest`. */
type AfterTemplateAndState<A extends unknown[]> = A extends [unknown, AppState, ...infer Rest] ? Rest : never;
type FillReportArgs = Parameters<typeof fillReport>;
type PreviewReportArgs = Parameters<typeof previewReport>;

/**
 * Every function the Excel worker runs, as the caller sees it: the arguments `off(name, args, ...)` takes (Buffers as
 * Buffers, no app state) and the result it resolves to. The host table (`host.ts`) is typed from this, one to one.
 */
export interface WorkerFns {
  fillFroura: (...a: DropState<Parameters<typeof fillFroura>>) => ReturnType<typeof fillFroura>;
  fillHkai: (...a: DropState<Parameters<typeof fillHkai>>) => ReturnType<typeof fillHkai>;
  fillOuts: (...a: DropState<Parameters<typeof fillOuts>>) => ReturnType<typeof fillOuts>;
  signMade: (...a: DropState<Parameters<typeof signMade>>) => ReturnType<typeof signMade>;
  mergeFirstSheets: (...a: Parameters<typeof mergeFirstSheets>) => ReturnType<typeof mergeFirstSheets>;
  mergeSheets: (...a: Parameters<typeof mergeSheets>) => ReturnType<typeof mergeSheets>;
  /** The worker passes the first five parameters only: `pv` (the preview options) is not part of the wire. */
  fillReport: (
    tpl: FillReportArgs[0],
    r: FillReportArgs[2],
    ids: FillReportArgs[3],
    d: FillReportArgs[4],
    o?: FillReportArgs[5],
  ) => ReturnType<typeof fillReport>;
  placeSheets: (...a: Parameters<typeof placeSheets>) => ReturnType<typeof placeSheets>;
  previewReport: (...a: DropState<PreviewReportArgs>) => ReturnType<typeof previewReport>;
  /** The worker passes `tpl` and `sheet` only: the default `pages` (1) applies. */
  previewTemplate: (
    tpl: Parameters<typeof previewTemplate>[0],
    sheet: Parameters<typeof previewTemplate>[1],
  ) => ReturnType<typeof previewTemplate>;
  /** Builds the template from the wizard's choices (`BuildOpts`), then previews it like `previewReport`. */
  previewBuilt: (
    build: Parameters<typeof forBuild>[0],
    ...a: AfterTemplateAndState<PreviewReportArgs>
  ) => ReturnType<typeof previewReport>;
  zipHash: (...a: Parameters<typeof zipHash>) => ReturnType<typeof zipHash>;
  valuesHash: (...a: Parameters<typeof valuesHash>) => ReturnType<typeof valuesHash>;
  readBook: (...a: Parameters<typeof readBook>) => ReturnType<typeof readBook>;
  writeGroup: (...a: DropState<Parameters<typeof writeGroup>>) => ReturnType<typeof writeGroup>;
  /** `ym` is `YYYY-MM`. Runs `excel.dutyCheck(state, ym)`; ExcelJS is loaded in the worker on first use only. */
  dutyCheck: (ym: Parameters<typeof dutyCheck>[1]) => ReturnType<typeof dutyCheck>;
}

/** The name of a worker function. */
export type WorkerName = keyof WorkerFns;
/** The arguments `off(name, args, ...)` takes for `K`. */
export type WorkerArgs<K extends WorkerName> = Parameters<WorkerFns[K]>;
/** What `off(name, ...)` resolves to for `K`. */
export type WorkerResult<K extends WorkerName> = Awaited<ReturnType<WorkerFns[K]>>;

/** A `Buffer` becomes a `Uint8Array` on the wire; arrays and tuples are mapped element by element. */
type Wire<T> = T extends Buffer ? Uint8Array : T extends readonly unknown[] ? { [I in keyof T]: Wire<T[I]> } : T;
/** The arguments of `K` as the host receives them (Buffers are plain `Uint8Array`s). */
export type WireArgs<K extends WorkerName> = Wire<WorkerArgs<K>>;

/**
 * One call to the worker. `id` pairs the reply; `state` is present only when it differs from the one the worker has
 * (the client remembers what it sent last).
 */
export interface WorkerRequest<K extends WorkerName = WorkerName> {
  id: number;
  fn: K;
  args: WireArgs<K>;
  state?: AppState;
}

/** An error as it crosses the thread boundary: `name` is one of the `ERROR_KINDS` names or `'Error'`. */
export interface WireError {
  name: string;
  message: string;
  /** Only `LockedError` and `ChangedError` carry it (the path of the file). */
  file?: string;
}

/** The answer to one `WorkerRequest`: the result (`ok: true`) or the error (`ok: false`). */
export type WorkerReply = { id: number; ok: true; r: unknown } | { id: number; ok: false; err: WireError };
