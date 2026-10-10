// Γέφυρα: το UI βλέπει μόνο αυτές τις συναρτήσεις (contextIsolation, χωρίς Node στο renderer)
import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  boot: () => ipcRenderer.invoke('boot'),
  run: cmd => ipcRenderer.invoke('cmd', cmd),
  undo: () => ipcRenderer.invoke('undo'),
  exportFile: (kind, date, opts) => ipcRenderer.invoke('export', kind, date, opts || {}),
  pickRoster: () => ipcRenderer.invoke('roster:pick'),
  applyRoster: (token, deactivateMissing) => ipcRenderer.invoke('roster:apply', token, deactivateMissing),
  backup: () => ipcRenderer.invoke('backup'),
  openFolder: which => ipcRenderer.invoke('open', which),
  chooseOutputDir: () => ipcRenderer.invoke('outputDir:choose')
};
contextBridge.exposeInMainWorld('api', api);
