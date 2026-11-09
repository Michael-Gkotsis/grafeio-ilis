// Greek word helpers for the «ΗΚΑΙ» texts: article before the punishing officer, father's name in the genitive.
//
// Purpose: -ΟΣ, -ΗΣ, -ΑΣ names to the genitive, «ΤΟΝ» before an accusative name.
// Does NOT: handle what does not fit (feminine names, -ΟΥ, abbreviations without an ending): those stay as written.
// Owner layer: core/lib (no fs, no Electron, no React).
// Why: the «ΗΚΑΙ» back page prints names in grammatical cases and the output may not change by one byte.
// Covering tests: test/rules.test.ts, test/hkai.test.ts (text of the «ΗΚΑΙ» lines).
import { upper } from './text';

// Words already in the genitive that accompany a rank or post («ΔΚΤΗΣ ΙΛΗΣ», «ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ»): never inflected
const KEEP = new Set([
  'ΙΛΗΣ',
  'ΕΠΧΙΑΣ',
  'ΜΟΝΑΔΑΣ',
  'ΜΟΝΑΔΟΣ',
  'ΜΟΙΡΑΣ',
  'ΤΑΞΙΑΡΧΙΑΣ',
  'ΤΑΞΗΣ',
  'ΔΙΜΟΙΡΙΑΣ',
  'ΥΠΗΡΕΣΙΑΣ',
  'ΣΧΟΛΗΣ',
  'ΔΙΟΙΚΗΣΗΣ',
  'ΕΚΠΑΙΔΕΥΣΗΣ',
  'ΦΡΟΥΡΑΣ',
  'ΠΥΡΟΒΟΛΑΡΧΙΑΣ',
  'ΠΥΡΟΣΒΕΣΤΙΚΗΣ',
  'ΤΗΣ',
  'ΤΟΥ',
]);
const words = (s: string) => upper(s).trim().replace(/\s+/g, ' ').split(' ');
// the first word (the rank) is always inflected: «ΕΠΧΙΑΣ ΔΟΚΙΜΙΟΣ» is the sergeant, «ΔΚΤΗΣ ΕΠΧΙΑΣ» the squadron
const greek = (w: string, i: number) => w.length >= 3 && /^[Α-ΩΪΫ]+$/.test(w) && (i === 0 || !KEEP.has(w));

/**
 * The punishing officer, written as typed, in the accusative.
 * Only «ΤΟΝ» is put in front, unless an article is already there («την ΛΧΙΑ …»).
 * @decision Michael 17/10: «θα εισάγουμε τα στελέχη στην αιτιατική».
 */
export function withArticle(s: string): string {
  const w = words(s);
  if (!w[0]) return '';
  return (/^(ΤΟΝ|ΤΗΝ|ΤΟ|ΤΟΥΣ|ΤΙΣ)$/.test(w[0]) && w.length > 1 ? '' : 'ΤΟΝ ') + w.join(' ');
}
/**
 * Father's name in the genitive: «ΓΕΩΡΓΙΟΣ» → «ΓΕΩΡΓΙΟΥ», «ΙΩΑΝΝΗΣ» → «ΙΩΑΝΝΗ», «ΑΝΔΡΕΑΣ» → «ΑΝΔΡΕΑ» (a genitive
 * stays).
 */
export function genitive(s: string): string {
  const w = words(s);
  if (!w[0]) return '';
  return w
    .map((x, i) =>
      !greek(x, i) ? x : x.endsWith('ΟΣ') ? x.slice(0, -2) + 'ΟΥ' : /(ΗΣ|ΑΣ)$/.test(x) ? x.slice(0, -1) : x,
    )
    .join(' ');
}
