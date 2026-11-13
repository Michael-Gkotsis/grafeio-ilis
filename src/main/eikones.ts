// Εικόνες των επικεφαλίδων (Michael, 13/11): μικραίνουν ΜΙΑ φορά, όταν τις διαλέγεις (μεγαλύτερη πλευρά ως 600 px, PNG μένει PNG,
// JPG γίνεται JPEG 85), και μένουν ως αρχεία στο «eikones» του φακέλου δεδομένων με όνομα το sha1 τους (ίδια εικόνα = ένα αρχείο).
// Στο state μπαίνει μόνο το id. Με το αντίγραφο σε USB πάνε και οι εικόνες (main.ts, usb:copy).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeDurable } from './files';

export const IMG_DIR = 'eikones';
export const IMG_MAX_PX = 600;
export const JPEG_Q = 85;
const ID = /^[0-9a-f]{40}$/;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' };

// Ό,τι χρειάζεται από το nativeImage του Electron (έτσι δοκιμάζεται χωρίς Electron)
export interface Img { isEmpty(): boolean; getSize(): { width: number; height: number }; resize(o: { width: number; height: number; quality?: string }): Img; toPNG(): Buffer; toJPEG(q: number): Buffer; toBitmap(): Buffer }
export interface ImgApi { createFromPath(p: string): Img; createFromBitmap(b: Buffer, o: { width: number; height: number }): Img }
export type ImgAdd = { ok: true; id: string; ext: 'png' | 'jpg'; w: number; h: number } | { ok: false; error: string };

// Πού είναι ο φάκελος δεδομένων για όσους γράφουν Excel (και στο νήμα των Excel): το main βάζει GRAFEIO_DATA στην αρχή
let dirOverride: string | null = null;
export const setImageDir = (d: string | null) => { dirOverride = d; };
export const imageDir = () => dirOverride ?? process.env.GRAFEIO_DATA ?? '';
export const isImgId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);
export const extOf = (file: string): 'png' | 'jpg' | null => { const e = path.extname(file).toLowerCase(); return e === '.png' ? 'png' : e === '.jpg' || e === '.jpeg' ? 'jpg' : null; };
export const fitSize = (w: number, h: number, max = IMG_MAX_PX) => { const k = Math.max(w, h) > max ? max / Math.max(w, h) : 1; return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }; };

export function addImage(dataDir: string, file: string, native: ImgApi): ImgAdd {
  const ext = extOf(file); if (!ext) return { ok: false, error: 'Η εικόνα πρέπει να είναι PNG ή JPG.' };
  let img: Img;
  try { img = native.createFromPath(file); } catch (e) { return { ok: false, error: 'Δεν διαβάστηκε η εικόνα: ' + (e instanceof Error ? e.message : String(e)) }; }
  if (img.isEmpty()) return { ok: false, error: 'Δεν διαβάστηκε η εικόνα· το αρχείο δεν είναι έγκυρο PNG ή JPG.' };
  const s = img.getSize(); const f = fitSize(s.width, s.height);
  const out = f.width !== s.width || f.height !== s.height ? img.resize({ ...f, quality: 'best' }) : img;
  const buf = ext === 'png' ? out.toPNG() : out.toJPEG(JPEG_Q);
  const id = crypto.createHash('sha1').update(buf).digest('hex');
  try {
    const dir = path.join(dataDir, IMG_DIR); fs.mkdirSync(dir, { recursive: true });
    const to = path.join(dir, id + '.' + ext); if (!fs.existsSync(to)) writeDurable(to, buf);
  } catch (e) { return { ok: false, error: 'Δεν αποθηκεύτηκε η εικόνα: ' + (e instanceof Error ? e.message : String(e)) }; }
  makeGray(dataDir, id, out, native);
  return { ok: true, id, ext, w: f.width, h: f.height };
}

// Η ασπρόμαυρη εκδοχή (<id>-g.png), φτιάχνεται μία φορά όταν διαλέγεται η εικόνα (το nativeImage υπάρχει μόνο στο main)
export function makeGray(dataDir: string, id: string, img: Img, native: ImgApi): boolean {
  try {
    const to = path.join(dataDir, IMG_DIR, id + '-g.png'); if (fs.existsSync(to)) return true;
    const { width, height } = img.getSize(); const src = img.toBitmap(); const b = Buffer.from(src);   // BGRA
    for (let i = 0; i + 3 < b.length; i += 4) { const l = Math.round(0.114 * b[i] + 0.587 * b[i + 1] + 0.299 * b[i + 2]); b[i] = b[i + 1] = b[i + 2] = l; }
    writeDurable(to, native.createFromBitmap(b, { width, height }).toPNG()); return true;
  } catch { return false; }
}
// Το αρχείο για το γράψιμο στο Excel: η ασπρόμαυρη αν ζητήθηκε και υπάρχει, αλλιώς η κανονική
export function imageForOutput(dataDir: string, id: string, gray: boolean): { file: string; ext: 'png' | 'jpg' } | null {
  if (gray && isImgId(id)) { const g = path.join(dataDir, IMG_DIR, id + '-g.png'); if (fs.existsSync(g)) return { file: g, ext: 'png' }; }
  return imageFile(dataDir, id);
}

// Το αρχείο της εικόνας (ή null αν δεν υπάρχει)
export function imageFile(dataDir: string, id: string): { file: string; ext: 'png' | 'jpg' } | null {
  if (!isImgId(id)) return null;
  for (const ext of ['png', 'jpg'] as const) { const file = path.join(dataDir, IMG_DIR, id + '.' + ext); if (fs.existsSync(file)) return { file, ext }; }
  return null;
}
// Για την οθόνη: data URL
export function readImage(dataDir: string, id: string): string | null {
  const f = imageFile(dataDir, id); if (!f) return null;
  try { return 'data:' + MIME[f.ext] + ';base64,' + fs.readFileSync(f.file).toString('base64'); } catch { return null; }
}
// Αντίγραφο των εικόνων σε άλλον φάκελο (USB): μόνο όσες λείπουν. Επιστρέφει πόσες γράφτηκαν.
export function copyImages(dataDir: string, to: string): number {
  const from = path.join(dataDir, IMG_DIR); let n = 0;
  if (!fs.existsSync(from)) return 0;
  const dir = path.join(to, IMG_DIR); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (!/^[0-9a-f]{40}\.(png|jpg)$/.test(f) || fs.existsSync(path.join(dir, f))) continue;
    writeDurable(path.join(dir, f), fs.readFileSync(path.join(from, f))); n++;
  }
  return n;
}
