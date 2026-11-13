// Οι εικόνες της επικεφαλίδας όπως τις χρειάζονται οι γράφοντες Excel: τα byte, ο τύπος και το μέγεθος σε px.
import fs from 'fs';
import { imageDir, imageForOutput } from './eikones';

export interface HeadImage { bytes: Buffer; ext: 'png' | 'jpg'; mime: 'image/png' | 'image/jpeg'; w: number; h: number }
// Το μέγεθος από την κεφαλίδα του αρχείου: PNG (IHDR) ή JPEG (πρώτο SOFn)
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]; if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}
const warned = new Set<string>();
const cache = new Map<string, HeadImage | null>();
// null: κενό id, λείπει το αρχείο ή δεν διαβάζεται (η εικόνα δεν γράφεται· το λάθος καταγράφεται μία φορά)
export function loadHeadImage(id: string, gray: boolean, dir = imageDir()): HeadImage | null {
  if (!id) return null;
  const key = dir + '|' + id + '|' + (gray ? 'g' : '');
  if (cache.has(key)) return cache.get(key)!;
  let out: HeadImage | null = null;
  try {
    const f = imageForOutput(dir, id, gray);
    if (f) { const bytes = fs.readFileSync(f.file); const sz = imageSize(bytes); if (sz && sz.w > 0 && sz.h > 0) out = { bytes, ext: f.ext, mime: f.ext === 'png' ? 'image/png' : 'image/jpeg', w: sz.w, h: sz.h }; }
  } catch { /* λείπει ή δεν διαβάζεται */ }
  if (!out && !warned.has(key)) { warned.add(key); console.error('Επικεφαλίδα: δεν διαβάστηκε η εικόνα ' + id); }
  if (out) cache.set(key, out);
  return out;
}
