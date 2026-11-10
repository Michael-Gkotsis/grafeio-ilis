// Bridge: the UI sees only these functions (contextIsolation, no Node in the renderer).
//
// Purpose: exposes `window.api`, built from the INVOKE and EVENTS tables of shared/ipc/contract.ts.
// Does NOT: contain any channel string, any logic, or validate input; it only forwards.
// Owner layer: preload.
// Why: 77 hand-written arrows used to repeat every channel and argument list; the table says it once and the type
//   system checks it against `Api`.
// Covering test: test/ipc-contract.test.ts.
import { contextBridge, ipcRenderer } from 'electron';
import { EVENTS, INVOKE } from '../shared/ipc/contract';
import { buildInvokers } from '../shared/ipc/spec';
import type { Api } from '../shared/ipc/types';

/** `on` + the unsubscribe function; the listener drops the IPC event and hands only the payload to the callback. */
const subscribe = (channel: string) => (cb: (payload: unknown) => void) => {
  const listener = (_e: unknown, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const invokers = buildInvokers(INVOKE, (channel, ...args) => ipcRenderer.invoke(channel, ...args));
const events = Object.fromEntries(Object.entries(EVENTS).map(([method, { channel }]) => [method, subscribe(channel)]));
const api = { ...invokers, ...events } as unknown as Api;
contextBridge.exposeInMainWorld('api', api);
