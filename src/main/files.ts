// Ασφαλής εγγραφή Excel (έρευνα §4.1):
// 1. το template δεν γράφεται ποτέ (διαβάζεται μόνο), 2. πρώτα έλεγχος αν το αρχείο είναι ανοιχτό στο Excel,
// 3. γράφεται σε .tmp, ξαναδιαβάζεται, και μόνο τότε μετονομάζεται, 4. η προηγούμενη έκδοση κρατιέται στα «_προηγούμενα».
import fs from 'fs';
const fsp = fs.promises;
import path from 'path';
import JSZip from 'jszip';

export const PREV_DIR = '_προηγούμενα';
export const KEEP_PREV = 10;

// Ελεύθερο όνομα στον φάκελο: «Τίτλος.xlsx», αλλιώς «Τίτλος (2).xlsx» κ.ο.κ.
export function freeName(dir: string, title: string): string {
  const stem = title.replace(/[\\/:*?"<>|]/g, '-');
  for (let i = 1; ; i++) { const f = path.join(dir, stem + (i > 1 ? ' (' + i + ')' : '') + '.xlsx'); if (!fs.existsSync(f)) return f; }
}

export class LockedError extends Error {
  constructor(public file: string) { super('Το αρχείο «' + path.basename(file) + '» είναι ανοιχτό στο Excel. Κλείσ\' το και πάτα «Ξανά». Δεν άλλαξε τίποτα.'); }
}
const BUSY = ['EBUSY', 'EPERM', 'EACCES'];

// Το Excel κρατά το αρχείο κλειδωμένο όσο είναι ανοιχτό. Το «~$όνομα» μόνο του δεν αρκεί (μένει ορφανό αν κρεμάσει το Excel),
// οπότε δοκιμάζουμε να ανοίξουμε το ίδιο το αρχείο για εγγραφή.
export function isLocked(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  try { const fd = fs.openSync(file, 'r+'); fs.closeSync(fd); return false; }
  catch (e: any) { if (BUSY.includes(e.code)) return true; throw e; }
}
export function ownerFile(file: string): boolean {
  const dir = path.dirname(file), base = path.basename(file);
  return [base, base.slice(2)].some(b => fs.existsSync(path.join(dir, '~$' + b)));
}

async function verifyXlsx(file: string) {
  const zip = await JSZip.loadAsync(await fsp.readFile(file));
  if (!zip.file('xl/workbook.xml') || !zip.file('[Content_Types].xml')) throw new Error('Το αρχείο που γράφτηκε δεν διαβάζεται σωστά');
}
const stamp = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };

export function prunePrev(dir: string, base: string, keep = KEEP_PREV) {
  const pdir = path.join(dir, PREV_DIR); if (!fs.existsSync(pdir)) return;
  const ext = path.extname(base), stem = base.slice(0, -ext.length);
  const mine = fs.readdirSync(pdir).filter(f => f.startsWith(stem + ' @ ') && f.endsWith(ext)).sort().reverse();
  mine.slice(keep).forEach(f => fs.unlinkSync(path.join(pdir, f)));
}

// Πότε κρατήθηκε το νεότερο αντίγραφο ενός αρχείου στα «_προηγούμενα» (από το όνομα «όνομα @ ΕΕΕΕ-ΜΜ-ΗΗ ωωλλδδ.xlsx»)
export function lastPrev(dir: string, base: string): number | null {
  const pdir = path.join(dir, PREV_DIR); if (!fs.existsSync(pdir)) return null;
  const ext = path.extname(base), stem = base.slice(0, -ext.length);
  const newest = fs.readdirSync(pdir).filter(f => f.startsWith(stem + ' @ ') && f.endsWith(ext)).sort().pop();
  const m = newest && /@ (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})/.exec(newest);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
}
// Γράφει όλα τα αρχεία ή κανένα: πρώτα όλα τα .tmp, μετά οι μετονομασίες.
// prevEvery: αντίγραφο στα «_προηγούμενα» μόνο αν το προηγούμενο είναι παλιότερο από τόσα ms. Οι αυτόματες εγγραφές στο
// ίδιο Δυναμολόγιο (μία ανά είδος, πολλές στη σειρά) αλλιώς θα έσπρωχναν έξω τις 10 εκδόσεις μέσα σε λίγα λεπτά.
export async function writeAll(items: { dir: string; name: string; data: Buffer }[], opts: { prevEvery?: number } = {}): Promise<string[]> {
  const plan = items.map(x => ({ ...x, file: path.join(x.dir, x.name), tmp: path.join(x.dir, x.name + '.tmp') }));
  for (const x of plan) { if (isLocked(x.file)) throw new LockedError(x.file); }
  try {
    // ασύγχρονα: σε αργό δίσκο ή USB το παράθυρο δεν παγώνει όσο γράφεται το αρχείο
    for (const x of plan) { await fsp.mkdir(x.dir, { recursive: true }); await fsp.writeFile(x.tmp, x.data); await verifyXlsx(x.tmp); }
  } catch (e) { plan.forEach(x => fs.rmSync(x.tmp, { force: true })); throw e; }
  const done: string[] = [];
  for (const x of plan) {
    const recent = opts.prevEvery ? lastPrev(x.dir, x.name) : null;
    if (fs.existsSync(x.file) && !(recent != null && Date.now() - recent < opts.prevEvery!)) {
      const pdir = path.join(x.dir, PREV_DIR); fs.mkdirSync(pdir, { recursive: true });
      const ext = path.extname(x.name);
      await fsp.copyFile(x.file, path.join(pdir, x.name.slice(0, -ext.length) + ' @ ' + stamp() + ext));
      prunePrev(x.dir, x.name);
    }
    try { fs.renameSync(x.tmp, x.file); done.push(x.file); }
    catch (e: any) {
      plan.forEach(y => fs.rmSync(y.tmp, { force: true }));
      if (BUSY.includes(e.code)) throw new LockedError(x.file);
      throw e;
    }
  }
  return done;
}
// Ασφαλής εγγραφή στον δίσκο: .tmp, fsync (τα δεδομένα φτάνουν στον δίσκο πριν από τη μετονομασία, αλλιώς μετά από
// κόψιμο ρεύματος το NTFS μπορεί να κρατήσει τη μετονομασία με αρχείο γεμάτο μηδενικά) και μετονομασία. Στα Windows το
// antivirus μπορεί να κρατά το αρχείο για λίγο: ξαναδοκιμάζουμε.
export function writeDurable(file: string, data: string | Uint8Array, retries = 20) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { const buf = typeof data === 'string' ? Buffer.from(data) : data; for (let o = 0; o < buf.length;) o += fs.writeSync(fd, buf, o, buf.length - o); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); break; }
    catch (e: any) { if (i >= retries || !BUSY.includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  }
  // και ο φάκελος, για να μείνει η μετονομασία (στα Windows δεν γίνεται για φάκελο: αγνοείται)
  try { const d = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* Windows */ }
}
// Μικρά αρχεία ρυθμίσεων (sources.json, forms.json…): ώστε ένα κόψιμο ρεύματος να μην τα αφήνει μισά
export const writeJson = (file: string, data: unknown) => writeDurable(file, JSON.stringify(data), 4);
export const writeXlsx = async (dir: string, name: string, data: Buffer) => (await writeAll([{ dir, name, data }]))[0];
