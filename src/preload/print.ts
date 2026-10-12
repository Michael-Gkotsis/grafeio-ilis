// Γέφυρα του παραθύρου εκτύπωσης: μόνο «εκτυπωτές», «τύπωσε», «άλλαξε φύλλα» και «κλείσε»
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printer', {
  print: (o: { landscape: boolean; pageSize: string; part: string; device?: string; copies?: number }) => ipcRenderer.invoke('print:go', o),
  printers: () => ipcRenderer.invoke('print:printers'),
  sheets: (names: string[]) => ipcRenderer.invoke('print:sheets', names),
  close: () => ipcRenderer.invoke('print:close')
});
