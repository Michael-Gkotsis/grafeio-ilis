// The IPC contract: the single source of every channel name, argument count and argument coercion of `window.api`.
//
// Purpose: one table per direction. INVOKE (renderer -> main, `ipcRenderer.invoke` / `ipcMain.handle`) and EVENTS
//   (main -> renderer, `webContents.send` / `ipcRenderer.on`). The preload, the main handlers and the contract test
//   all read these tables, so a channel string is written exactly once.
// Does NOT: validate input (a later change), hold the types of the payloads (see types.ts), or import any runtime
//   code except the three coercers of spec.ts. It is bundled into the sandboxed preload: keep it type-only otherwise.
// Owner layer: shared/ipc (architecture).
// Why: every IPC method used to be written by hand in four places with the channel repeated; a typo compiled fine.
//   Now a method of `Api` missing here, or a key here that is not in `Api`, is a compile error, and `n` must equal
//   the real parameter count of the method.
// Covering test: test/ipc-contract.test.ts. Equivalence with the old hand-written preload was checked call by call.
import type { Api } from './types';
import { orEmptyList, orEmptyObject, toBool, type Coercer } from './spec';

/** Methods of `Api` that ask main something (they return a Promise). */
export type InvokeMethod = {
  [K in keyof Api]: Api[K] extends (...args: never[]) => Promise<unknown> ? K : never;
}[keyof Api];
/** Methods of `Api` that subscribe to something main pushes (they take a callback and return an unsubscribe). */
export type EventMethod = { [K in keyof Api]: Api[K] extends (cb: never) => () => void ? K : never }[keyof Api];
/** `true` when every method of `Api` is either an invoke or an event method; `never` if a new kind of method appears. */
export type ContractCoversApi = [Exclude<keyof Api, InvokeMethod | EventMethod>] extends [never] ? true : never;

/**
 * Shape of one INVOKE entry for method `K`: `n` is the exact (maximum) parameter count of `Api[K]`, optional
 * parameters included, because the old preload forwarded all of them.
 */
export interface InvokeEntry<K extends InvokeMethod> {
  readonly channel: string;
  readonly n: Required<Parameters<Api[K]>>['length'];
  readonly coerce?: Readonly<Record<number, Coercer>>;
}

/**
 * Renderer -> main. Key = method of `Api`; `channel` = the string on the wire (a running renderer and main always come
 * from the same build, but keep the names stable: logs and `console.error(channel, e)` use them).
 * `coerce` lists the arguments the preload normalised before sending (`!!x`, `x || {}`, `x || []`).
 * Arguments are forwarded by position, the count is fixed, and extra arguments are dropped.
 */
export const INVOKE = {
  boot: { channel: 'boot', n: 0 },
  run: { channel: 'cmd', n: 1 },
  undo: { channel: 'undo', n: 1 },
  sync: { channel: 'sync', n: 0 },
  dayCheck: { channel: 'day:check', n: 0 },
  exportFile: { channel: 'export', n: 3, coerce: { 2: orEmptyObject } },
  exportLists: { channel: 'export:lists', n: 2 },
  exportHd: { channel: 'export:hd', n: 1 },
  pickHdTpl: { channel: 'hd:tpl', n: 0 },
  exportImer: { channel: 'export:imer', n: 3 },
  exportRoster: { channel: 'export:roster', n: 3 },
  exportWeapons: { channel: 'export:weapons', n: 3 },
  exportCadre: { channel: 'export:cadre', n: 2 },
  pickRoster: { channel: 'roster:pick', n: 0 },
  applyRoster: { channel: 'roster:apply', n: 2 },
  backup: { channel: 'backup', n: 0 },
  openFolder: { channel: 'open', n: 1 },
  chooseOutputDir: { channel: 'outputDir:choose', n: 0 },
  dirChoose: { channel: 'dir:choose', n: 1 },
  dirReset: { channel: 'dir:reset', n: 1 },
  dirOpen: { channel: 'dir:open', n: 1 },
  listBackups: { channel: 'backups:list', n: 0 },
  restoreBackup: { channel: 'backups:restore', n: 1 },
  diag: { channel: 'diag', n: 0 },
  updInfo: { channel: 'upd:info', n: 0 },
  updCheck: { channel: 'upd:check', n: 0 },
  updAuto: { channel: 'upd:auto', n: 1, coerce: { 0: toBool } },
  updStart: { channel: 'upd:start', n: 0 },
  updCancel: { channel: 'upd:cancel', n: 0 },
  updSeen: { channel: 'upd:seen', n: 1, coerce: { 0: toBool } },
  updSkip: { channel: 'upd:skip', n: 0 },
  updRestart: { channel: 'upd:restart', n: 0 },
  updFile: { channel: 'upd:file', n: 0 },
  updRollback: { channel: 'upd:rollback', n: 0 },
  updOpenReleases: { channel: 'upd:releases', n: 0 },
  setGpu: { channel: 'flags:gpu', n: 1 },
  usbCopy: { channel: 'usb:copy', n: 0 },
  importBackup: { channel: 'backups:import', n: 0 },
  srcPick: { channel: 'src:pick', n: 1 },
  srcRead: { channel: 'src:read', n: 1 },
  srcSave: { channel: 'src:save', n: 2 },
  srcImport: { channel: 'src:import', n: 5, coerce: { 3: toBool, 4: orEmptyList } },
  srcKeys: { channel: 'src:keys', n: 1 },
  srcApply: { channel: 'src:apply', n: 4, coerce: { 3: orEmptyList } },
  srcPeople: { channel: 'src:people', n: 1 },
  srcPlan: { channel: 'src:plan', n: 1 },
  srcWrite: { channel: 'src:write', n: 1 },
  srcNewFile: { channel: 'src:new', n: 1 },
  srcStatus: { channel: 'src:status', n: 0 },
  formPick: { channel: 'form:pick', n: 1 },
  formInfo: { channel: 'form:info', n: 1 },
  formSave: { channel: 'form:save', n: 2 },
  formDir: { channel: 'form:dir', n: 1 },
  openPath: { channel: 'open:path', n: 1 },
  printFile: { channel: 'print:file', n: 2 },
  essoInfo: { channel: 'esso:info', n: 0 },
  essoDir: { channel: 'esso:dir', n: 1 },
  essoRoster: { channel: 'esso:roster', n: 0 },
  essoStart: { channel: 'esso:start', n: 1 },
  essoPick: { channel: 'esso:pick', n: 0 },
  essoRestore: { channel: 'esso:restore', n: 1 },
  essoOpen: { channel: 'esso:open', n: 1 },
  repUpload: { channel: 'rep:upload', n: 1 },
  repInspect: { channel: 'rep:inspect', n: 4 },
  repBuild: { channel: 'rep:build', n: 3 },
  repPreview: { channel: 'rep:preview', n: 6, coerce: { 4: toBool } },
  layoutPreview: { channel: 'layout:preview', n: 1 },
  repRun: { channel: 'rep:run', n: 7, coerce: { 4: toBool, 5: toBool, 6: orEmptyObject } },
  repHist: { channel: 'rep:hist', n: 1 },
  repTimes: { channel: 'rep:times', n: 1 },
  repPickFile: { channel: 'rep:pickFile', n: 0 },
  repOpenTpl: { channel: 'rep:openTpl', n: 1 },
  repFiles: { channel: 'rep:files', n: 1 },
  repLast: { channel: 'rep:last', n: 0 },
} as const satisfies { readonly [K in InvokeMethod]: InvokeEntry<K> };

/**
 * Main -> renderer events. Key = subscription method of `Api`; `channel` = the string main sends with
 * `webContents.send`. The payload type is the parameter of the callback in `Api`.
 */
export const EVENTS = {
  onUpdate: { channel: 'update' },
  onBusy: { channel: 'excel:busy' },
  onSources: { channel: 'sources' },
} as const satisfies { readonly [K in EventMethod]: { readonly channel: string } };

/** Indexes (as tuple keys, e.g. `'4'`) that the preload coerces for method `M`, from INVOKE's `coerce`. */
type CoercedIndex<M extends InvokeMethod> = (typeof INVOKE)[M] extends { readonly coerce: infer C }
  ? `${keyof C & number}`
  : never;
/** Mapped over the type parameter `R` (a fixed-length tuple), so TypeScript keeps the result a tuple. */
type Wire<R extends unknown[], O extends unknown[], C extends string> = {
  [I in keyof R]: I extends C ? R[I] : I extends keyof O ? O[I] : never;
};
/**
 * The arguments main really receives for `M`: exactly `n` of them (missing ones are `undefined`), and a coerced
 * argument is never `undefined` (the preload turned it into `false`, `{}` or `[]`).
 */
export type WireArgs<M extends InvokeMethod> = Wire<Required<Parameters<Api[M]>>, Parameters<Api[M]>, CoercedIndex<M>>;
