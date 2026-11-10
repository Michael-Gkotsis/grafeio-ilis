// The one table of errors that cross the thread boundary, and the two functions that use it.
//
// Purpose: `ERROR_KINDS` (name, class and how to rebuild it), `toWireError` (worker side: error to message) and
//   `fromWireError` (main side: message to error of the same class).
// Does NOT: send anything, or know the worker functions (protocol.ts, client.ts, host.ts).
// Owner layer: main (architecture), `shared/worker`. Imports the error classes of `files`, `exports` and `sources`.
// Why: the main process tells `LockedError`, `ChangedError`, `TemplateError` and `OldFormatError` apart with
//   `instanceof` to show the right message, so the worker must send the kind and the main process must rebuild the
//   same class. The two if-chains that did this lived in offload.ts and worker.ts; now both ends read this table, so
//   they cannot drift apart. The kind is found with `instanceof`, never with `constructor.name`: class names are lost
//   when the bundle is minified.
// Covering test: test/worker-protocol.test.ts (round trip of every kind), test/offload.test.ts.
import { LockedError, ChangedError } from '../../files';
import { TemplateError } from '../../exports';
import { OldFormatError } from '../../sources';
import type { WireError } from './protocol';

/** One transferable kind of error. */
interface ErrorKind {
  /** The name on the wire. Greek-free and stable: it is part of the message format between the two threads. */
  name: string;
  /** The class the worker tests with `instanceof`. */
  cls: abstract new (
    ...args: never[]
  ) => Error;
  /** Builds the same class on the main side from the wire form. */
  rebuild: (e: WireError) => Error;
}

/**
 * The transferable errors, in the order the worker tests them (the first `instanceof` match wins). Anything else
 * travels as a plain `Error` with its message.
 */
export const ERROR_KINDS: readonly ErrorKind[] = [
  { name: 'LockedError', cls: LockedError, rebuild: (e) => new LockedError(e.file || '') },
  { name: 'ChangedError', cls: ChangedError, rebuild: (e) => new ChangedError(e.file || '') },
  { name: 'TemplateError', cls: TemplateError, rebuild: (e) => new TemplateError(e.message) },
  { name: 'OldFormatError', cls: OldFormatError, rebuild: (e) => new OldFormatError(e.message) },
];

/**
 * Worker side: the wire form of anything that was thrown.
 * @param e the thrown value (an `Error`, or anything: `message` falls back to `String(e)`)
 */
export function toWireError(e: unknown): WireError {
  // Errors thrown by the engines may be any value; read the two fields the way the old code did (`e?.message`).
  const thrown = e as { message?: string; file?: string } | null | undefined;
  const name = ERROR_KINDS.find((k) => e instanceof k.cls)?.name ?? 'Error';
  return { name, message: thrown?.message || String(e), file: thrown?.file };
}

/**
 * Main side: the error of the same class as the one the worker threw.
 * @returns a `LockedError`/`ChangedError` (from `file`), `TemplateError`/`OldFormatError` (from `message`), else a
 *   plain `Error`
 */
export function fromWireError(e: WireError): Error {
  return ERROR_KINDS.find((k) => k.name === e.name)?.rebuild(e) ?? new Error(e.message);
}
