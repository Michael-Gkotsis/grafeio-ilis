// Bridge of the print window: printers, layout, print, PDF, the form's settings and «close».
//
// Purpose: exposes `window.printer`, built from the PRINT table of shared/ipc/print.ts (channels and arguments).
// Does NOT: contain any print logic, and exposes nothing but those seven methods (contextIsolation, no Node).
// Owner layer: preload.
// Why: the channel strings used to be written by hand here and again in main.
// Covering test: test/ipc-contract.test.ts.
import { contextBridge, ipcRenderer } from 'electron';
import { PRINT, type Printer } from '../shared/ipc/print';
import { buildInvokers } from '../shared/ipc/spec';

const printer = buildInvokers(PRINT, (channel, ...args) => ipcRenderer.invoke(channel, ...args)) as unknown as Printer;
contextBridge.exposeInMainWorld('printer', printer);
