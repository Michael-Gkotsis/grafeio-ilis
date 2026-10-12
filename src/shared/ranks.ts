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

// Μαντεύει την κατηγορία της ΗΚΑΙ από τον βαθμό που γράφει ο χρήστης
export function guessHk(rank: string): string {
  const r = rank.toUpperCase().replace(/[.\s]/g, '');
  if (/ΕΠΧ|ΕΠΙΛΑΡΧ|ΕΠΛΧΟ|ΤΧΗΣ/.test(r)) return 'Επίλαρχοι';
  if (/ΑΝΘΥΠΑΣ|ΑΝΘΣΤ/.test(r)) return 'Ανθυπασπιστές';
  if (/ΑΝΘΛΧ|ΑΝΘΥΠΙΛ|ΑΝΘΛΓ|ΥΠΛΓ|ΥΠΛΧ/.test(r)) return 'Ανθυπίλαρχοι-Ανθλγοι';
  if (/ΙΛΧ|ΙΛΑΡΧ|ΛΓΟΣ/.test(r)) return 'Ίλαρχοι';
  if (/ΔΕΑ/.test(r)) return 'ΔΕΑ';
  if (/ΑΡΧΙΛ|ΑΛΧΙ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛ|ΕΠΛΧΙ/.test(r)) return 'Επιλοχίες';
  return 'Λοχίες';
}
