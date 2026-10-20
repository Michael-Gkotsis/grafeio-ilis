// Γέφυρα του παραθύρου εκτύπωσης: εκτυπωτές, διάταξη, τύπωσε, PDF, ρυθμίσεις του εντύπου και «κλείσε»
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printer', {
  print: (o: { landscape: boolean; pageSize: string; part: string; device?: string; copies?: number; duplex?: string }) => ipcRenderer.invoke('print:go', o),
  printers: () => ipcRenderer.invoke('print:printers'),
  layout: (req: { opts: unknown; sheets: string[] | null; save: boolean }) => ipcRenderer.invoke('print:layout', req),
  forget: () => ipcRenderer.invoke('print:forget'),
  duplex: (on: boolean) => ipcRenderer.invoke('print:duplex', on),
  pdf: () => ipcRenderer.invoke('print:pdf'),
  close: () => ipcRenderer.invoke('print:close')
});
