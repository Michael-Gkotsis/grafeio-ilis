// Γέφυρα του παραθύρου εκτύπωσης: μόνο «τύπωσε», «άλλαξε φύλλα» και «κλείσε»
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printer', {
  print: (o: { landscape: boolean; pageSize: string; part: string }) => ipcRenderer.invoke('print:go', o),
  sheets: (names: string[]) => ipcRenderer.invoke('print:sheets', names),
  close: () => ipcRenderer.invoke('print:close')
});
