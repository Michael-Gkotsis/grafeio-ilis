// Input guards for the IPC methods whose handler would let a malformed value reach fs, the database or a throw.
//
// Purpose: pure predicates (`isCommand`, `isIsoDate`, `oneOf`...) and `GUARDS`, the table that says which argument of
//   which `Api` method is checked. `handle()` runs the matching guard before the handler; a rejected call answers
//   `{ ok: false, error }` (the failure shape every guarded method already has in `Api`) and the handler never runs.
// Does NOT: import Electron, check anything that a handler already checks inline (openPath, printFile, srcMeta.allow,
//   TPL_NAME, okEssoDir...; moving those is a later change), or guard a method with no failure shape the renderer
//   handles.
// Owner layer: main (architecture), pure.
// Why: the renderer is our own sandboxed code, so this is defence against bugs: before this, `run` with an unknown
//   command, `exportFile` with an unknown kind or `srcSave` with an unknown list kind either threw in main or wrote a
//   junk key into settings / a junk file name. The audit of all 81 handlers is in the PR description.
// Covering test: test/ipc-guards.test.ts (every real value the renderer sends is accepted: all HANDLERS keys, all
//   ExportKinds, all list/form kinds).
import { HANDLERS } from '../../core/commands/handlers';
import { FORM_KINDS, KINDS, STATUS_KINDS } from '../../core/excel-in/fields';
import { EXPORT_KINDS } from '../../core/model/exportKind';
import type { InvokeMethod, WireArgs } from '../../shared/ipc/contract';

/** True for a function-style predicate over `unknown`. */
type Check = (x: unknown) => boolean;

/** `YYYY-MM-DD` shape only (the calendar is not checked: the rules handle 31 Feb like before). */
export const isIsoDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Predicate for "a string that is one of `list`". Use with the lists the core already exports. */
export const oneOf =
  <T extends string>(list: readonly T[]) =>
  (x: unknown): x is T =>
    typeof x === 'string' && list.includes(x as T);

/** The command types `apply` can run (own keys only: `toString` and `__proto__` are not commands). */
const COMMAND_TYPES: ReadonlySet<string> = new Set(Object.keys(HANDLERS));

/** A command object whose `t` is a key of `HANDLERS` (the only commands `apply` can run). */
export const isCommand = (x: unknown): boolean =>
  typeof x === 'object' && x !== null && COMMAND_TYPES.has((x as { t?: unknown }).t as string);

/** One of the `ExportKind`s. */
export const isExportKind = oneOf(EXPORT_KINDS);
/** One of the `ListKind`s of the Excel files screen (`KINDS` ids). */
export const isListKind = oneOf(KINDS.map((k) => k.id));
/** One of the `StatusKind`s. */
export const isStatusKindName = oneOf(STATUS_KINDS);
/** One of the `FormKind`s. */
export const isFormKind = oneOf(FORM_KINDS);

const BAD_DATE = 'Μη έγκυρη ημερομηνία';
const BAD_LIST = 'Άγνωστο είδος αρχείου';
const BAD_FORM = 'Άγνωστο έντυπο';
const BAD_CMD = 'Άγνωστη ενέργεια';

/** Message of the first failed check, or `undefined` when every `[check, message]` pair passes. */
const firstFail = (...pairs: [boolean, string][]): string | undefined => pairs.find(([ok]) => !ok)?.[1];
/** Same, for a check applied to a value. */
const need = (check: Check, value: unknown, message: string): [boolean, string] => [check(value), message];

type Guard<M extends InvokeMethod> = (...args: WireArgs<M>) => string | undefined;

/**
 * Per method: returns the Greek error for a rejected call, or `undefined` to let the handler run. Only methods whose
 * `Api` result is a failure shape the renderer already shows are listed (all answer `{ ok: false, error }`).
 * Not listed on purpose: openFolder (an unknown value opens the data folder, harmless),
 *   srcRead / srcPlan / srcKeys / formInfo / formPick / formDir (an unknown kind already ends in the method's own
 *   "no file" failure or an empty answer), rep* and layoutPreview (their whole body runs inside try/catch -> fail).
 */
export const GUARDS: { readonly [M in InvokeMethod]?: Guard<M> } = {
  run: (cmd) => firstFail(need(isCommand, cmd, BAD_CMD)),
  exportFile: (kind, date) => firstFail(need(isExportKind, kind, BAD_FORM), need(isIsoDate, date, BAD_DATE)),
  exportLists: (date) => firstFail(need(isIsoDate, date, BAD_DATE)),
  exportCadre: (date) => firstFail(need(isIsoDate, date, BAD_DATE)),
  exportRoster: (date) => firstFail(need(isIsoDate, date, BAD_DATE)),
  exportWeapons: (date) => firstFail(need(isIsoDate, date, BAD_DATE)),
  exportHd: (req) => firstFail(need(isIsoDate, req?.date, BAD_DATE)),
  exportImer: (req) => firstFail(need(isIsoDate, req?.to, BAD_DATE)),
  restoreBackup: (name) => firstFail(need((x) => typeof x === 'string' && x !== '', name, 'Άγνωστο αντίγραφο')),
  srcPick: (kind) => firstFail(need((x) => x === null || isListKind(x), kind, BAD_LIST)),
  srcSave: (kind) => firstFail(need(isListKind, kind, BAD_LIST)),
  srcImport: (kind) => firstFail(need(isStatusKindName, kind, BAD_LIST)),
  srcApply: (kind, _b, cmd) => firstFail(need(isListKind, kind, BAD_LIST), need(isCommand, cmd, BAD_CMD)),
  srcWrite: (kind) => firstFail(need(isListKind, kind, BAD_LIST)),
  formSave: (form) => firstFail(need(isFormKind, form, BAD_FORM)),
};

/** True when `method` has a guard (checked once at registration, so unguarded handlers stay registered as before). */
export const hasGuard = (method: InvokeMethod): boolean => method in GUARDS;

/**
 * Runs the guard of `method` on the wire arguments.
 * @param method key of `Api`.
 * @param args the arguments exactly as `ipcMain.handle` received them.
 * @returns the Greek error text, or `undefined` when the call may go on (also when `method` has no guard).
 */
export function guardError(method: InvokeMethod, args: readonly unknown[]): string | undefined {
  const guard = GUARDS[method] as ((...a: unknown[]) => string | undefined) | undefined;
  return guard?.(...args);
}
