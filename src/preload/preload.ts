// Γέφυρα: το UI βλέπει μόνο αυτές τις συναρτήσεις (contextIsolation, χωρίς Node στο renderer)
import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  boot: () => ipcRenderer.invoke('boot'),
  run: cmd => ipcRenderer.invoke('cmd', cmd),
  undo: () => ipcRenderer.invoke('undo'),
  sync: () => ipcRenderer.invoke('sync'),
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
  importBackup: () => ipcRenderer.invoke('backups:import'),
  srcPick: kind => ipcRenderer.invoke('src:pick', kind),
  srcRead: kind => ipcRenderer.invoke('src:read', kind),
  srcSave: (kind, b) => ipcRenderer.invoke('src:save', kind, b),
  srcImport: (kind, b, choices, keepRemoved, keepApp) => ipcRenderer.invoke('src:import', kind, b, choices, !!keepRemoved, keepApp || []),
  srcKeys: kind => ipcRenderer.invoke('src:keys', kind),
  srcApply: (kind, b, cmd, keep) => ipcRenderer.invoke('src:apply', kind, b, cmd, keep || []),
  srcPeople: b => ipcRenderer.invoke('src:people', b),
  srcPlan: kind => ipcRenderer.invoke('src:plan', kind),
  srcWrite: kind => ipcRenderer.invoke('src:write', kind),
  srcNewFile: kind => ipcRenderer.invoke('src:new', kind),
  srcStatus: () => ipcRenderer.invoke('src:status'),
  onSources: cb => { const h = (_e: unknown, st: any) => cb(st); ipcRenderer.on('sources', h); return () => { ipcRenderer.removeListener('sources', h); }; },
  formPick: form => ipcRenderer.invoke('form:pick', form),
  formInfo: form => ipcRenderer.invoke('form:info', form),
  formSave: (form, b) => ipcRenderer.invoke('form:save', form, b),
  formDir: form => ipcRenderer.invoke('form:dir', form),
  openPath: file => ipcRenderer.invoke('open:path', file)
};
contextBridge.exposeInMainWorld('api', api);
