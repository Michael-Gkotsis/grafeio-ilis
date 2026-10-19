// Αποτύπωμα του περιεχομένου ενός xlsx (όλα τα αρχεία του zip): ίδιο αποτύπωμα = ίδιο έντυπο, δεν ξαναγράφεται
import crypto from 'crypto';
import JSZip from 'jszip';

export async function zipHash(buf: Buffer | Uint8Array): Promise<string> {
  const z = await JSZip.loadAsync(buf); const h = crypto.createHash('sha1');
  for (const n of Object.keys(z.files).sort()) { if (z.files[n].dir) continue; h.update(n); h.update(await z.files[n].async('nodebuffer')); }
  return h.digest('hex');
}
