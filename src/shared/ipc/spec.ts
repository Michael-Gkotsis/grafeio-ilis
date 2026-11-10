// The tiny runtime shared by the IPC bridges: what one invoke method forwards, and how a bridge is built from a table.
//
// Purpose: `InvokeSpec` (channel, exact argument count, optional argument coercions), the three coercers the old
//   hand-written preloads used, and `buildInvokers`, which turns a table of specs into the methods of a bridge.
// Does NOT: know about Electron (the caller passes `invoke`), import any core/ or shared/ runtime code, validate
//   input (guards are a separate, later change), or list any channel (see contract.ts and print.ts).
// Owner layer: shared. It is bundled into the sandboxed preload, so it must stay a few lines long.
// Why: 77 hand-written arrows repeated the channel string and the argument list; one table says it once.
// Covering test: test/ipc-contract.test.ts.

/** Turns one raw argument into what is sent over the channel. */
export type Coercer = (value: unknown) => unknown;

/**
 * What one invoke method sends.
 * - `channel`: the exact channel string of `ipcRenderer.invoke` / `ipcMain.handle`.
 * - `n`: the number of arguments forwarded. Missing ones are sent as `undefined`; extra ones are dropped, so a DOM
 *   event or a function that a caller passes by accident never reaches the channel.
 * - `coerce`: argument index -> normaliser, only where the old preload coerced (`!!x`, `x || {}`, `x || []`).
 */
export interface InvokeSpec {
  readonly channel: string;
  readonly n: number;
  readonly coerce?: Readonly<Record<number, Coercer>>;
}

/** `!!value`: the old preload sent real booleans for flags such as `keepRemoved` or `print`. */
export const toBool: Coercer = (value) => !!value;
/** `value || {}`: an absent options object becomes an empty one (any falsy value, as before). */
export const orEmptyObject: Coercer = (value) => value || {};
/** `value || []`: an absent list becomes an empty one (any falsy value, as before). */
export const orEmptyList: Coercer = (value) => value || [];

/**
 * The exact argument list a method sends: `n` entries, coerced where the spec says so.
 * @param spec the method's spec.
 * @param args what the caller passed (may be shorter or longer than `n`).
 */
export function forwardArgs(spec: InvokeSpec, args: readonly unknown[]): unknown[] {
  return Array.from({ length: spec.n }, (_, index) => {
    const coerce = spec.coerce?.[index];
    return coerce ? coerce(args[index]) : args[index];
  });
}

/**
 * Builds the methods of a bridge from a table of specs.
 * @param table method name -> spec.
 * @param invoke `ipcRenderer.invoke` bound by the caller, so this file never imports Electron.
 */
export function buildInvokers(
  table: Readonly<Record<string, InvokeSpec>>,
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(
    Object.entries(table).map(([name, spec]) => [
      name,
      (...args: unknown[]) => invoke(spec.channel, ...forwardArgs(spec, args)),
    ]),
  );
}
