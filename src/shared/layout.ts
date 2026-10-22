// Θέσεις πάνω στο χαρτί (Michael, 20/10): οι υπογραφές, η κεφαλίδα και ο τόπος/ημερομηνία πάνε όπου τα σύρεις.
// Κρατιέται πόσο μετακινήθηκε το καθένα από τη θέση του εντύπου (γραμμές κάτω, στήλες δεξιά), όχι το κελί: έτσι μένει
// σωστό και όταν το έντυπο μακραίνει (π.χ. περισσότεροι εξοδούχοι σπρώχνουν τις υπογραφές πιο κάτω).
import type { Sig, SigForm } from './sigs';

export type Move = [number, number];                 // [γραμμές κάτω, στήλες δεξιά]· αρνητικά = πάνω, αριστερά
export type Moves = Record<string, Move>;            // ανά κομμάτι: 'head', 'date', 'title', 's0', 's1', …
// Κάθε έντυπο εκτός από τα «Έντυπα» (εκεί οι θέσεις είναι ανά έντυπο, Report.layout)
export type LayoutForm = Exclude<SigForm, 'reports'>;
// τα φύλλα κάθε εντύπου (το καθένα με τις δικές του θέσεις)· όπου πολλά φύλλα έχουν την ίδια μορφή (ένα ανά φίλτρο),
// μοιράζονται ένα key και ό,τι μετακινείς πάει σε όλα
export const LAYOUT_SHEETS: Record<LayoutForm, { key: string; label: string }[]> = {
  hkai: [{ key: 'front', label: 'Μπροστινό' }, { key: 'back', label: 'Πίσω' }],
  froura: [{ key: 'main', label: 'ΦΡΟΥΡΑ' }],
  outs: [{ key: 'outs', label: 'Εξοδούχοι' }, { key: 'stay', label: 'Παραμένοντες' }],
  check: [{ key: 'main', label: 'Έλεγχος υπηρεσιών' }],
  roster: [{ key: 'print', label: 'Συνολικό (εκτύπωση)' }, { key: 'lists', label: 'Φύλλα του Excel' }],
  cadre: [{ key: 'main', label: 'Στελέχη' }],
  weapons: [{ key: 'main', label: 'Κατάσταση οπλισμού' }, { key: 'rest', label: 'Τα άλλα φύλλα' }]
};
export type Layout = Record<string, Moves>;          // ανά φύλλο (key)

// Ένα κομμάτι του χαρτιού: γραμμές r1..r2, στήλες c1..c2 (από 1)
export interface Block { id: string; r1: number; c1: number; r2: number; c2: number }
// Τα κομμάτια ενός φύλλου όπως βγήκαν, για τη μετακίνηση με το ποντίκι
export interface LayoutSheet { key: string; sheet: string; blocks: Block[] }

export const blockLabel = (id: string, sigs?: Sig[]) => {
  if (id === 'head') return 'Κεφαλίδα';
  if (id === 'date') return 'Τόπος και ημερομηνία';
  if (id === 'title') return 'Τίτλος';
  const i = Number(id.slice(1)); const x = sigs?.[i];
  return 'Υπογραφή ' + (i + 1) + (x?.title ? ': ' + x.title : '');
};
export const moved = (m?: Move) => !!m && (m[0] !== 0 || m[1] !== 0);
// Χωρίς μηδενικές μετακινήσεις και άδεια φύλλα (για αποθήκευση)
export function cleanLayout(l: Layout): Layout | undefined {
  const out: Layout = {};
  for (const [k, ms] of Object.entries(l || {})) { const x = Object.fromEntries(Object.entries(ms || {}).filter(([, m]) => moved(m))); if (Object.keys(x).length) out[k] = x; }
  return Object.keys(out).length ? out : undefined;
}
// Οι υπογραφές άλλαξαν πλήθος: οι παλιές θέσεις τους δεν ταιριάζουν πια (η κεφαλίδα και η ημερομηνία μένουν)
export function dropSigMoves(l: Layout | undefined): Layout | undefined {
  if (!l) return l;
  return cleanLayout(Object.fromEntries(Object.entries(l).map(([k, ms]) => [k, Object.fromEntries(Object.entries(ms).filter(([id]) => !/^s\d+$/.test(id)))])));
}
