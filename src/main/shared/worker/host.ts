// The worker end: the thread that runs the Excel jobs for client.ts, with the data the window has.
//
// Purpose: `FNS` (every job of the protocol, one to one with `WorkerFns`) and the message handler that applies the
//   ambient state, runs the job and answers with the result or the error.
// Does NOT: decide when a job runs (client.ts), start listening by itself (src/main/worker.ts, the esbuild entry of
//   `dist/main/worker.js`, calls `serve(parentPort)`; a test can call it with its own port), or rebuild errors
//   (errors.ts).
// Owner layer: main (architecture), `shared/worker`. Meant for a `worker_threads` Worker; no Electron.
// Why: heavy file work must not freeze the window. The state of the app arrives with a request only when it changed;
//   `applyAmbient` sets the clock, namesakes and unit kind the rules read implicitly (core/ambient.ts).
// Covering test: test/offload.test.ts, test/worker-protocol.test.ts (`FNS` keys equal `WorkerFns` keys).
import { WORKER_AMBIENT, applyAmbient } from '../../../core/ambient';
import type { MessagePort } from 'worker_threads';
import path from 'path';
import { fillFroura, fillHkai, fillOuts, signMade } from '../../exports';
import { mergeFirstSheets, mergeSheets } from '../../xlsx';
import { readBook, valuesHash, writeGroup } from '../../sources';
import { zipHash } from '../../ziphash';
import { buildTemplate, fillReport, placeSheets, previewReport, previewTemplate } from '../../reports';
import type { AppState } from '../../../shared/domain';
import { xlLook } from '../../../shared/xlLook';
import { forBuild, withBuilt } from '../../../shared/reports';
import { toWireError } from './errors';
import type { WireArgs, WorkerName, WorkerReply, WorkerRequest, WorkerResult } from './protocol';
import { buf } from './wire';

let state: AppState;
const nodeRequire: NodeRequire = require;

/** The job table: for each name, the function the worker runs with the wire arguments (Buffers arrive as bytes). */
export const FNS: { [K in WorkerName]: (...args: WireArgs<K>) => Promise<WorkerResult<K>> } = {
  fillFroura: (tpl, d, phase, sheet, sigs) => fillFroura(buf(tpl), state, d, phase, sheet, sigs),
  fillHkai: (tpl, d, opts) => fillHkai(buf(tpl), state, d, opts),
  fillOuts: (tpl, d, sheets, sigs) => fillOuts(buf(tpl), state, d, sheets, sigs),
  signMade: (data, form, marks, sigs) => signMade(buf(data), state, form, marks, sigs),
  mergeFirstSheets: (bufs, names, pick) => mergeFirstSheets(bufs.map(buf), names, pick),
  mergeSheets: (bufs, picks, names) => mergeSheets(bufs.map(buf), picks, names),
  fillReport: (tpl, r, ids, d, o) => fillReport(buf(tpl), state, r, ids, d, o),
  placeSheets: (target, out, pairs, mine) => placeSheets(buf(target), buf(out), pairs, mine),
  previewReport: (tpl, r, ids, d, pages, sample) => previewReport(buf(tpl), state, r, ids, d, pages, sample),
  previewTemplate: (tpl, sheet) => previewTemplate(buf(tpl), sheet),
  previewBuilt: async (o0, r, ids, d, pages, sample) => {
    const o = forBuild(o0, r);
    const b = await buildTemplate(o, r.kind, xlLook(state.settings));
    return previewReport(b.data, state, withBuilt(r, b, o), ids, d, pages, sample);
  },
  zipHash: (b) => zipHash(buf(b)),
  valuesHash: (b) => valuesHash(buf(b)),
  readBook: (file, rows, cols) => readBook(file, rows, cols),
  writeGroup: (jobs, today, opts) => writeGroup(jobs, state, today, opts),
  // ExcelJS (heavy): loaded only when needed, as in the main process
  dutyCheck: (ym) =>
    (nodeRequire(path.join(__dirname, 'excel.js')) as typeof import('../../excel')).dutyCheck(state, ym),
};

/**
 * Answers the requests that arrive on `port` (in the worker thread: its `parentPort`). One reply per request, with the
 * result or, when the job throws (or the result cannot be cloned), the error in its wire form.
 */
export function serve(port: MessagePort): void {
  const run = async <K extends WorkerName>(m: WorkerRequest<K>) => {
    try {
      const reply: WorkerReply = { id: m.id, ok: true, r: await FNS[m.fn](...m.args) };
      port.postMessage(reply);
    } catch (e) {
      // class names are lost in minify: the kind of the error is found with instanceof (errors.ts)
      const reply: WorkerReply = { id: m.id, ok: false, err: toWireError(e) };
      port.postMessage(reply);
    }
  };
  port.on('message', async (m: WorkerRequest) => {
    if (m.state) {
      state = m.state;
      applyAmbient(state, WORKER_AMBIENT);
    }
    await run(m);
  });
}
