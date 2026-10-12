// Λίστες επιλογής για βαθμό και Ο/Σ (όπλο/σώμα): στις φόρμες της εφαρμογής και ως dropdown στα Excel.
// Πάντα επιτρέπεται και άλλη τιμή γραμμένη με το χέρι· η λίστα συμπληρώνεται με όσες υπάρχουν ήδη στα δεδομένα.
import { collator } from './text';

// Βαθμοί στρατιωτών (Δυναμολόγιο)
export const SOLDIER_RANKS = ['ΣΤΡ', 'ΥΔΝΕΑΣ', 'ΔΝΕΑΣ', 'ΛΧΙΑΣ', 'ΕΠΟΠ ΣΤΡ', 'ΕΠΟΠ ΔΝΕΑΣ', 'ΕΠΟΠ ΛΧΙΑΣ', 'ΔΕΑ'];
// Βαθμοί στελεχών (από τον μικρότερο στον μεγαλύτερο)
export const CADRE_RANKS = ['ΛΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΑΛΧΙΑΣ', 'ΑΝΘΣΤΗΣ', 'ΑΝΘΛΧΟΣ', 'ΥΠΛΧΟΣ', 'ΙΛΧΟΣ', 'ΑΝΘΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΛΓΟΣ', 'ΕΠΛΧΟΣ', 'ΤΧΗΣ', 'ΔΕΑ'];
// Όπλα και σώματα (στήλη «Ο/Σ»)
export const SPECS = ['ΠΖ', 'ΤΘ', 'ΠΒ', 'ΜΧ', 'ΔΒ', 'ΔΒ-ΗΠ', 'ΑΣ', 'ΤΧ', 'ΕΜ', 'ΥΓ', 'ΥΠ', 'ΓΕ'];

// Η βασική λίστα και από κάτω (αλφαβητικά) όσες άλλες τιμές υπάρχουν ήδη, χωρίς διπλές και κενά
export function optionsOf(base: readonly string[], seen: Iterable<string | null | undefined>): string[] {
  const key = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  const have = new Set(base.map(key)); const extra: string[] = [];
  for (const v of seen) {
    if (!v || !v.trim()) continue;
    const k = key(v); if (have.has(k)) continue;
    have.add(k); extra.push(v.trim().replace(/\s+/g, ' '));
  }
  return [...base, ...extra.sort(collator.compare)];
}
