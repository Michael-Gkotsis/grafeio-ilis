// Typed registration of IPC handlers: the channel comes from the contract, never from a string literal in main.
//
// Purpose: `handle` (an `Api` method), `handlePrint` (a `Printer` method), `handleGuarded` (an update method whose
//   failure must not reach the UI) and `eventChannel` (the channel for `webContents.send`).
// Does NOT: change what a handler does; the handler bodies stay where they were. The only check here is `handle`
//   running the guard of guards.ts (when the method has one) before the handler.
// Owner layer: main (architecture).
// Why: `ipcMain.handle('export:lists', ...)` repeated the channel by hand; a method renamed in `Api` now fails to
//   compile here instead of silently leaving a dead handler.
// Covering test: test/ipc-contract.test.ts (helpers register on the contract channel). Registration completeness of
//   main.ts was checked once by comparing every (channel, handler) pair before/after (PR description).
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { EVENTS, INVOKE, type EventMethod, type InvokeMethod, type WireArgs } from '../../shared/ipc/contract';
import { guardError, hasGuard } from './guards';
import { PRINT, type PrintMethod, type Printer } from '../../shared/ipc/print';

/**
 * Registers the handler of one `Api` method on its contract channel.
 * @param method key of `Api` (e.g. `'exportLists'`), looked up in INVOKE.
 * A method listed in GUARDS answers `{ ok: false, error }` for a rejected argument and `fn` does not run.
 * @param fn receives the IPC event and the arguments as the preload sends them (`WireArgs`); its result goes back to
 *   the renderer.
 */
export function handle<M extends InvokeMethod>(
  method: M,
  fn: (event: IpcMainInvokeEvent, ...args: WireArgs<M>) => unknown,
): void {
  if (!hasGuard(method)) {
    ipcMain.handle(INVOKE[method].channel, fn);
    return;
  }
  ipcMain.handle(INVOKE[method].channel, (event, ...args: unknown[]) => {
    const error = guardError(method, args);
    return error === undefined ? fn(event, ...(args as WireArgs<M>)) : { ok: false, error };
  });
}

/**
 * Registers the handler of one print-window method on its contract channel.
 * @param method key of `Printer` (e.g. `'pdf'`), looked up in PRINT.
 * @param fn receives the IPC event (its sender is the print window) and the arguments, typed like the method.
 */
export function handlePrint<M extends PrintMethod>(
  method: M,
  fn: (event: IpcMainInvokeEvent, ...args: Parameters<Printer[M]>) => unknown,
): void {
  ipcMain.handle(PRINT[method].channel, fn);
}

/**
 * Like `handle`, but a throwing handler is logged and answers `fallback` instead of rejecting in the renderer.
 * Used by the update methods: nothing about the update may block the app from opening.
 * @param method key of `Api`.
 * @param fn the handler without the IPC event.
 * @param fallback what the renderer receives when `fn` throws.
 */
export const handleGuarded = <T extends unknown[], R>(method: InvokeMethod, fn: (...args: T) => R, fallback: R) =>
  ipcMain.handle(INVOKE[method].channel, (_e, ...args: unknown[]) => {
    try {
      return fn(...(args as T));
    } catch (e) {
      console.error(INVOKE[method].channel, e);
      return fallback;
    }
  });

/**
 * The channel main uses in `webContents.send` for a push event.
 * @param method key of EVENTS (`'onUpdate'`, `'onBusy'`, `'onSources'`).
 */
export const eventChannel = (method: EventMethod): string => EVENTS[method].channel;
