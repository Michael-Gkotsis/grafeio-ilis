// Η βαριά δουλειά των Excel (ανάγνωση, συμπλήρωση εντύπων, εγγραφή στο Δυναμολόγιο) σε ξεχωριστό νήμα (worker.ts), για να
// μην παγώνει το παράθυρο όσο γράφονται τα αρχεία μετά από κάθε αλλαγή. Ίδιος κώδικας και στα δύο νήματα: αν το νήμα δεν
// ξεκινά ή σταματήσει, η ίδια δουλειά γίνεται εδώ, όπως πριν. Τα λάθη ξαναγίνονται του ίδιου είδους (LockedError κ.λπ.).
import { Worker } from 'worker_threads';
import fs from 'fs';
import { LockedError, ChangedError } from './files';
import { TemplateError } from './exports';
import { OldFormatError } from './sources';
import type { AppState } from '../shared/domain';

type Job = { resolve: (v: any) => void; reject: (e: unknown) => void; local: () => Promise<unknown> };
let w: Worker | null = null; let file = ''; let broken = false; let seq = 0; let sent: AppState | null = null;
const jobs = new Map<number, Job>();

export function useWorker(f: string) { file = f; }
function start(): Worker | null {
  if (w || broken || !file || !fs.existsSync(file)) return w;
  try {
    w = new Worker(file);
    w.on('message', (m: { id: number; ok: boolean; r?: any; err?: { name: string; message: string; file?: string } }) => {
      const j = jobs.get(m.id); if (!j) return; jobs.delete(m.id);
      if (m.ok) j.resolve(fromWorker(m.r)); else j.reject(toError(m.err!));
    });
    // το νήμα σταμάτησε: ό,τι περίμενε γίνεται εδώ, και από εδώ και πέρα όλα εδώ
    const down = (e: unknown) => {
      console.error('excel worker', e); broken = true; w = null; sent = null;
      const left = [...jobs.values()]; jobs.clear();
      for (const j of left) j.local().then(j.resolve, j.reject);
    };
    w.on('error', down);
    w.on('exit', code => { if (w) down('exit ' + code); });
    w.unref();
  } catch (e) { console.error('excel worker start', e); broken = true; w = null; }
  return w;
}
function toError(e: { name: string; message: string; file?: string }): Error {
  if (e.name === 'LockedError') return new LockedError(e.file || '');
  if (e.name === 'ChangedError') return new ChangedError(e.file || '');
  if (e.name === 'TemplateError') return new TemplateError(e.message);
  if (e.name === 'OldFormatError') return new OldFormatError(e.message);
  return new Error(e.message);
}
// Buffer → Uint8Array στο πέρασμα· ξανά Buffer εδώ (π.χ. r.data για writeAll). Μόνο ένα επίπεδο: τα φύλλα ενός βιβλίου
// (χιλιάδες κελιά) δεν ξαναπερνιούνται ένα ένα.
const toBuf = (v: any) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : v);
export function fromWorker(v: any): any {
  if (v instanceof Uint8Array) return toBuf(v);
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) { for (const k in v) if (v[k] instanceof Uint8Array) v[k] = toBuf(v[k]); }
  return v;
}
// fn: όνομα στο worker.ts· state: η κατάσταση της εφαρμογής (στέλνεται μόνο όταν άλλαξε)· local: το ίδιο εδώ
export function off<T>(fn: string, args: unknown[], local: () => Promise<T>, state?: AppState): Promise<T> {
  const wk = start(); if (!wk) return local();
  return new Promise<T>((resolve, reject) => {
    const id = ++seq; jobs.set(id, { resolve, reject, local });
    const st = state && state !== sent ? state : undefined; if (st) sent = st;
    try { wk.postMessage({ id, fn, args, state: st }); }
    catch (e) { jobs.delete(id); if (st) sent = null; local().then(resolve, reject); }
  });
}
export const workerUp = () => !!w && !broken;
