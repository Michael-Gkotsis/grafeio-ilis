// Runs the heavy Excel work (reading, filling forms, writing the Δυναμολόγιο) on a worker thread of the main process.
//
// Purpose: `off` (run one named job on the worker, or here if the worker is not available), `useWorker` (which file
//   is the worker), `workerUp`, `warmWorker`. This is the main-process end of the protocol in protocol.ts.
// Does NOT: contain the jobs (host.ts runs them), decide what the work is, or keep the app state anywhere but here.
// Owner layer: main (architecture), `shared/worker`. Uses `worker_threads` and `fs`; no Electron.
// Why: the window must not freeze while files are written after every change. The same code runs in both threads:
//   if the worker cannot start, dies, or `postMessage` throws, the same job runs here as before, and errors come back
//   as the same class (LockedError etc., errors.ts).
// Covering test: test/offload.test.ts, test/worker-protocol.test.ts.
import { Worker } from 'worker_threads';
import fs from 'fs';
import type { AppState } from '../../../shared/domain';
import { fromWireError } from './errors';
import type { WorkerArgs, WorkerName, WorkerReply, WorkerRequest, WorkerResult } from './protocol';
import { fromWorker } from './wire';

interface Job {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  local: () => Promise<unknown>;
}
let w: Worker | null = null;
let file = '';
let broken = false;
let seq = 0;
let sent: AppState | null = null;
const jobs = new Map<number, Job>();

/** Tells the client which file is the worker (`dist/main/worker.js`); the worker starts on first use. */
export function useWorker(f: string) {
  file = f;
}
function start(): Worker | null {
  if (w || broken || !file || !fs.existsSync(file)) return w;
  try {
    w = new Worker(file);
    w.on('message', (m: WorkerReply) => {
      const j = jobs.get(m.id);
      if (!j) return;
      jobs.delete(m.id);
      if (m.ok) j.resolve(fromWorker(m.r));
      else j.reject(fromWireError(m.err));
    });
    // the worker stopped: whatever was waiting runs here, and from now on everything runs here
    const down = (e: unknown) => {
      console.error('excel worker', e);
      broken = true;
      w = null;
      sent = null;
      const left = [...jobs.values()];
      jobs.clear();
      for (const j of left) j.local().then(j.resolve, j.reject);
    };
    w.on('error', down);
    w.on('exit', (code) => {
      if (w) down('exit ' + code);
    });
    w.unref();
  } catch (e) {
    console.error('excel worker start', e);
    broken = true;
    w = null;
  }
  return w;
}

/**
 * Runs one worker job, on the worker thread when it is up, else with `local` in this process.
 * @param fn the job name (a key of `WorkerFns`)
 * @param args the arguments of that job, without the app state
 * @param local the same job done here; used when the worker cannot start, dies, or the message cannot be posted
 * @param state the app state for jobs that read it; sent to the worker only when it is not the one sent last
 * @returns the result, with Buffers restored one level deep; errors come back as the same class (errors.ts)
 */
export function off<K extends WorkerName>(
  fn: K,
  args: WorkerArgs<K>,
  local: () => Promise<WorkerResult<K>>,
  state?: AppState,
): Promise<WorkerResult<K>> {
  const wk = start();
  if (!wk) return local();
  return new Promise<WorkerResult<K>>((resolve, reject) => {
    const id = ++seq;
    // the reply is typed by the host table (host.ts) for the same `fn`, and `id` pairs it with this call
    jobs.set(id, { resolve: (v) => resolve(v as WorkerResult<K>), reject, local });
    const st = state && state !== sent ? state : undefined;
    if (st) sent = st;
    try {
      // `args` holds Buffers; structured clone delivers them as `Uint8Array`s (WireArgs in protocol.ts)
      const request = { id, fn, args, state: st } as WorkerRequest<K>;
      wk.postMessage(request);
    } catch {
      jobs.delete(id);
      if (st) sent = null;
      local().then(resolve, reject);
    }
  });
}
/** True while the worker thread is running. */
export const workerUp = () => !!w && !broken;
/** Starts the worker early (a little after the window opens), so the first write does not wait for it to load. */
export const warmWorker = () => {
  start();
};
