// Αυτόματη ενημέρωση: καθαρή λογική (χωρίς Electron), ώστε να δοκιμάζεται σε προσωρινό φάκελο.
// Όλος ο κώδικας της εφαρμογής είναι στο resources\app· η ενημέρωση αλλάζει μόνο αυτόν τον φάκελο.
// Το data\ και το templates\ δίπλα στο exe δεν αγγίζονται ποτέ από εδώ.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export type Manifest = {
  version: string;
  date: string;
  electron: string;
  app: { file: string; size: number; sha256: string };
  notes: string[];
};
export type Fetcher = (
  url: string,
  o: { timeoutMs: number; maxBytes: number; onProgress?: (got: number, total: number) => void; signal?: AbortSignal },
) => Promise<Buffer>;

export const REPO = 'Michael-Gkotsis/grafeio-ilis';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`;
export const zipUrl = (m: Manifest) => `https://github.com/${REPO}/releases/download/v${m.version}/${m.app.file}`;
export const APP_MAX = 60 * 1024 * 1024; // το zip της εφαρμογής είναι ~2 MB· πάνω από αυτό κάτι δεν πάει καλά
const UNZIP_MAX = 200 * 1024 * 1024;

// ---- εκδόσεις και manifest ----
export const validVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,6}(\.\d{1,6}){1,3}$/.test(v);
// αριθμητική σύγκριση: 0.1.9 < 0.1.10. Θετικό αν a > b.
export function cmpVersion(a: string, b: string): number {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
export function parseManifest(raw: unknown): Manifest {
  const m = raw as any;
  if (!m || typeof m !== 'object') throw new Error('Το latest.json δεν είναι σωστό');
  if (!validVersion(m.version)) throw new Error('Το latest.json: άκυρη έκδοση');
  const a = m.app;
  if (!a || typeof a.file !== 'string' || !/^GrafeioIlis-app-[0-9A-Za-z.-]+\.zip$/.test(a.file))
    throw new Error('Το latest.json: άκυρο αρχείο εφαρμογής');
  if (!Number.isInteger(a.size) || a.size < 1 || a.size > APP_MAX) throw new Error('Το latest.json: άκυρο μέγεθος');
  if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(a.sha256))
    throw new Error('Το latest.json: άκυρο SHA-256');
  if (typeof m.electron !== 'string' || !m.electron) throw new Error('Το latest.json: λείπει το Electron');
  const notes = Array.isArray(m.notes)
    ? m.notes
        .filter((n: unknown) => typeof n === 'string' && n.trim())
        .slice(0, 20)
        .map((n: string) => n.trim().slice(0, 200))
    : [];
  return {
    version: m.version,
    date: typeof m.date === 'string' ? m.date.slice(0, 10) : '',
    electron: m.electron,
    app: { file: a.file, size: a.size, sha256: a.sha256.toLowerCase() },
    notes,
  };
}
export const sha256 = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex');
export function checkZip(buf: Buffer, m: Pick<Manifest, 'app'>): void {
  if (buf.length !== m.app.size) throw new Error('Λάθος μέγεθος αρχείου (' + buf.length + ' αντί ' + m.app.size + ')');
  if (sha256(buf) !== m.app.sha256.toLowerCase())
    throw new Error('Λάθος SHA-256: το αρχείο δεν είναι αυτό που αναμένεται');
}

// ---- έλεγχος και κατέβασμα (με οποιονδήποτε fetcher: στην εφαρμογή το net του Electron) ----
export async function fetchManifest(get: Fetcher, url = MANIFEST_URL): Promise<Manifest> {
  const buf = await get(url, { timeoutMs: 8000, maxBytes: 64 * 1024 });
  let raw: unknown;
  try {
    raw = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new Error('Το latest.json δεν διαβάζεται');
  }
  return parseManifest(raw);
}
export async function downloadApp(
  get: Fetcher,
  m: Manifest,
  o: { url?: string; onProgress?: (got: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Buffer> {
  const buf = await get(o.url || zipUrl(m), {
    timeoutMs: 20000,
    maxBytes: m.app.size + 1024,
    onProgress: o.onProgress,
    signal: o.signal,
  });
  checkZip(buf, m);
  return buf;
}

// ---- zip ----
const safeName = (n: string): string | null => {
  const p = n.replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.includes('\0')) return null;
  const parts = p.split('/').filter((x) => x && x !== '.');
  if (parts.some((x) => x === '..')) return null;
  return parts.join('/');
};
export async function extractZip(buf: Buffer, dest: string): Promise<void> {
  const z = await JSZip.loadAsync(buf);
  const entries = Object.values(z.files);
  // πρώτα έλεγχος όλων των ονομάτων, μετά γράφεται οτιδήποτε
  for (const e of entries) if (safeName(e.name) === null) throw new Error('Το zip έχει επικίνδυνη διαδρομή: ' + e.name);
  const root = path.resolve(dest);
  fs.mkdirSync(root, { recursive: true });
  let total = 0;
  for (const e of entries) {
    const rel = safeName(e.name)!;
    if (!rel) continue;
    const out = path.resolve(root, rel);
    if (out !== root && !out.startsWith(root + path.sep)) throw new Error('Το zip έχει επικίνδυνη διαδρομή: ' + e.name);
    if (e.dir) {
      fs.mkdirSync(out, { recursive: true });
      continue;
    }
    const data = await e.async('nodebuffer');
    total += data.length;
    if (total > UNZIP_MAX) throw new Error('Το zip είναι υπερβολικά μεγάλο');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
}
export const appOk = (dir: string): boolean =>
  fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'dist', 'main', 'main.js'));
export function versionIn(dir: string): string | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    return validVersion(v) ? v : null;
  } catch {
    return null;
  }
}
// Η έκδοση μέσα σε ένα zip εφαρμογής (για ενημέρωση από αρχείο χωρίς latest.json)
export async function zipVersion(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  const f = z.file('package.json');
  if (!f) throw new Error('Το zip δεν έχει package.json στη ρίζα: δεν είναι αρχείο εφαρμογής');
  if (!z.file('dist/main/main.js')) throw new Error('Το zip δεν έχει dist/main/main.js: δεν είναι αρχείο εφαρμογής');
  let v: unknown;
  try {
    v = JSON.parse(await f.async('string')).version;
  } catch {
    /* παρακάτω */
  }
  if (!validVersion(v)) throw new Error('Το zip έχει άκυρη έκδοση');
  return v;
}

// ---- φάκελοι ----
const P = (res: string) => ({
  app: path.join(res, 'app'),
  nw: path.join(res, 'app.new'),
  old: path.join(res, 'app.old'),
  failed: path.join(res, 'app.new-failed'),
  tmp: path.join(res, 'app.swap'),
});
const rm = (p: string) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
type Ops = { rename?: (a: string, b: string) => void; tries?: number };
function sleep(ms: number) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* χωρίς αναμονή */
  }
}
// στα Windows ένα antivirus κρατά για λίγο τον φάκελο: μερικές προσπάθειες πριν τα παρατήσουμε
function renameRetry(a: string, b: string, o: Ops) {
  const f = o.rename || fs.renameSync,
    n = o.tries ?? 4;
  let err: unknown;
  for (let i = 0; i < n; i++) {
    try {
      f(a, b);
      return;
    } catch (e) {
      err = e;
      if (i < n - 1) sleep(250);
    }
  }
  throw err;
}
export function dirWritable(dir: string): boolean {
  try {
    const t = path.join(dir, '.w' + process.pid);
    fs.writeFileSync(t, '');
    fs.unlinkSync(t);
    return true;
  } catch {
    return false;
  }
}

export function pendingVersion(res: string): string | null {
  try {
    const v = fs.readFileSync(path.join(P(res).nw, '.ready'), 'utf8').trim();
    return validVersion(v) ? v : null;
  } catch {
    return null;
  }
}
// Αποσυμπίεση στο app.new· το σήμα .ready γράφεται ΤΕΛΕΥΤΑΙΟ: χωρίς αυτό ο φάκελος δεν είναι έτοιμος
export async function stage(res: string, zip: Buffer, expect?: string): Promise<string> {
  const p = P(res);
  rm(p.nw);
  try {
    await extractZip(zip, p.nw);
    if (!appOk(p.nw)) throw new Error('Το zip δεν έχει package.json και dist/main/main.js');
    const v = versionIn(p.nw);
    if (!v) throw new Error('Το zip έχει άκυρη έκδοση');
    if (expect && v !== expect)
      throw new Error('Η έκδοση μέσα στο zip (' + v + ') δεν είναι η αναμενόμενη (' + expect + ')');
    fs.writeFileSync(path.join(p.nw, '.ready'), v);
    return v;
  } catch (e) {
    try {
      rm(p.nw);
    } catch {
      /* ήδη */
    }
    throw e;
  }
}

export type Trial = { version: string; from: string; starts: number };
export const readTrial = (file: string): Trial | null => {
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validVersion(t?.version) && Number.isInteger(t.starts)
      ? { version: t.version, from: String(t.from || ''), starts: t.starts }
      : null;
  } catch {
    return null;
  }
};
const writeTrial = (file: string, t: Trial) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(t));
};
export const clearTrial = (file: string) => {
  try {
    fs.unlinkSync(file);
  } catch {
    /* δεν υπήρχε */
  }
};

export type SwapResult = { ok: true; version: string } | { ok: false; none?: boolean; error?: string };
// app → app.old, app.new → app. Αν κάτι αποτύχει, όλα γυρίζουν όπως ήταν και το app.new μένει για την επόμενη φορά.
export function swap(res: string, trialFile: string, ops: Ops = {}): SwapResult {
  const p = P(res);
  const version = pendingVersion(res);
  if (!version) return { ok: false, none: true };
  let moved = false;
  try {
    rm(p.old);
    if (fs.existsSync(p.app)) {
      renameRetry(p.app, p.old, ops);
      moved = true;
    }
    renameRetry(p.nw, p.app, ops);
  } catch (e) {
    if (moved) {
      try {
        if (fs.existsSync(p.app)) rm(p.app);
        renameRetry(p.old, p.app, { ...ops, rename: fs.renameSync });
      } catch {
        /* τελευταία προσπάθεια έγινε */
      }
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    fs.unlinkSync(path.join(p.app, '.ready'));
  } catch {
    /* δεν πειράζει */
  }
  try {
    writeTrial(trialFile, { version, from: versionIn(p.old) || '', starts: 0 });
  } catch {
    /* η δοκιμαστική περίοδος είναι έξτρα ασφάλεια */
  }
  return { ok: true, version };
}

// Επιστροφή στην προηγούμενη (app.old). Το κακό app μένει ως app.new-failed ώστε να μη χαθεί.
export function rollbackApp(res: string, ops: Ops = {}): boolean {
  const p = P(res);
  if (!appOk(p.old)) return false;
  try {
    rm(p.failed);
    const had = fs.existsSync(p.app);
    if (had) renameRetry(p.app, p.failed, ops);
    try {
      renameRetry(p.old, p.app, ops);
    } catch (e) {
      if (had) {
        try {
          renameRetry(p.failed, p.app, { ...ops, rename: fs.renameSync });
        } catch {
          /* τίποτα άλλο */
        }
      }
      throw e;
    }
    return true;
  } catch {
    return false;
  }
}

export type Health = { state: 'none' | 'trial' | 'rolledback'; version?: string };
// Στην εκκίνηση, πριν ανοίξει παράθυρο. Η νέα έκδοση μετρά τις εκκινήσεις της· αν φτάσει τη 2η χωρίς να επιβεβαιωθεί, επιστρέφουμε.
export function health(res: string, trialFile: string, running: string, ops: Ops = {}): Health {
  const t = readTrial(trialFile);
  if (!t) return { state: 'none' };
  if (t.version !== running) {
    clearTrial(trialFile);
    return { state: 'none' };
  }
  const starts = t.starts + 1;
  if (starts >= 2) {
    clearTrial(trialFile);
    return rollbackApp(res, ops) ? { state: 'rolledback', version: t.version } : { state: 'none' };
  }
  try {
    writeTrial(trialFile, { ...t, starts });
  } catch {
    /* χωρίς αρχείο δεν υπάρχει έλεγχος */
  }
  return { state: 'trial' };
}

// Χειροκίνητη επιστροφή: οι δύο φάκελοι αλλάζουν θέση (η νεότερη μένει ως app.old, άρα γίνεται και «μπροστά»)
export function prevVersion(res: string): string | null {
  const p = P(res);
  return appOk(p.old) ? versionIn(p.old) : null;
}
export function swapPrev(res: string, ops: Ops = {}): boolean {
  const p = P(res);
  if (!appOk(p.old) || !fs.existsSync(p.app)) return false;
  try {
    rm(p.tmp);
    renameRetry(p.app, p.tmp, ops);
    try {
      renameRetry(p.old, p.app, ops);
    } catch (e) {
      try {
        renameRetry(p.tmp, p.app, { ...ops, rename: fs.renameSync });
      } catch {
        /* τίποτα άλλο */
      }
      throw e;
    }
    renameRetry(p.tmp, p.old, { ...ops, rename: fs.renameSync });
    return true;
  } catch {
    return false;
  }
}
