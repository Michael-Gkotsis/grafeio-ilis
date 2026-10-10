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
  chooseOutputDir: () => ipcRenderer.invoke('outputDir:choose'),
  listBackups: () => ipcRenderer.invoke('backups:list'),
  restoreBackup: name => ipcRenderer.invoke('backups:restore', name),
  diag: () => ipcRenderer.invoke('diag'),
  setGpu: disable => ipcRenderer.invoke('flags:gpu', disable),
  usbCopy: () => ipcRenderer.invoke('usb:copy'),
  importBackup: () => ipcRenderer.invoke('backups:import')
};
contextBridge.exposeInMainWorld('api', api);
