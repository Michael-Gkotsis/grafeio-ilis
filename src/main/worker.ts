// Το νήμα των Excel (offload.ts): ό,τι βαρύ γίνεται με τα αρχεία, με τα ίδια δεδομένα που έχει το παράθυρο.
import { parentPort } from 'worker_threads';
import path from 'path';
import { fillFroura, fillHkai, fillOuts, TemplateError } from './exports';
import { LockedError, ChangedError } from './files';
import { mergeFirstSheets } from './xlsx';
import { OldFormatError, readBook, valuesHash, writeGroup } from './sources';
import { zipHash } from './ziphash';
import { buildTemplate, fillReport, previewReport, previewTemplate } from './reports';
import type { AppState } from '../shared/domain';

const nodeRequire: NodeRequire = require;
let state: AppState;
const buf = (v: any) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : v);
const FNS: Record<string, (...a: any[]) => Promise<unknown>> = {
  fillFroura: (tpl, d, phase, sheet) => fillFroura(buf(tpl), state, d, phase, sheet),
  fillHkai: (tpl, d, opts) => fillHkai(buf(tpl), state, d, opts),
  fillOuts: (tpl, d, sheets) => fillOuts(buf(tpl), state, d, sheets),
  mergeFirstSheets: (bufs: Uint8Array[], names, pick) => mergeFirstSheets(bufs.map(buf), names, pick),
  fillReport: (tpl, r, ids, d) => fillReport(buf(tpl), state, r, ids, d),
  previewReport: (tpl, r, ids, d) => previewReport(buf(tpl), state, r, ids, d),
  previewTemplate: (tpl, sheet) => previewTemplate(buf(tpl), sheet),
  previewBuilt: async (o, r, ids, d) => { const b = await buildTemplate(o, r.kind); return previewReport(b.data, state, { ...r, sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells }, ids, d); },
  zipHash: b => zipHash(buf(b)),
  valuesHash: b => valuesHash(buf(b)),
  readBook: (file, rows, cols) => readBook(file, rows, cols),
  writeGroup: (jobs, today, opts) => writeGroup(jobs, state, today, opts),
  // ExcelJS (βαρύ): φορτώνεται μόνο αν χρειαστεί, όπως στο main
  dutyCheck: ym => (nodeRequire(path.join(__dirname, 'excel.js')) as typeof import('./excel')).dutyCheck(state, ym)
};
parentPort!.on('message', async (m: { id: number; fn: string; args: unknown[]; state?: AppState }) => {
  if (m.state) state = m.state;
  try { parentPort!.postMessage({ id: m.id, ok: true, r: await FNS[m.fn](...m.args) }); }
  catch (e: any) {
    // τα ονόματα των κλάσεων χάνονται στο minify: το είδος του λάθους με instanceof
    const name = e instanceof LockedError ? 'LockedError' : e instanceof ChangedError ? 'ChangedError' : e instanceof TemplateError ? 'TemplateError' : e instanceof OldFormatError ? 'OldFormatError' : 'Error';
    parentPort!.postMessage({ id: m.id, ok: false, err: { name, message: e?.message || String(e), file: e?.file } });
  }
});
