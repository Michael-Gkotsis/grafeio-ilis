// Υπογραφές στα έντυπα (Michael, 20/10): όσες θέλεις, με τη σειρά που φαίνονται από αριστερά προς τα δεξιά.
// Μία λίστα ανά έντυπο στις Ρυθμίσεις (η προεπιλογή του), και αλλαγή τη στιγμή που βγαίνει (μόνο για εκείνη τη φορά,
// ή και για τις επόμενες). Οι λέξεις της μονάδας ακολουθούν τον τύπο της («ΔΚΤΗΣ ΙΛΗΣ» ↔ «ΔΚΤΗΣ ΛΟΧΟΥ»), ακόμα και
// σε υπογραφές που έγραψες εσύ πριν αλλάξεις από ίλη σε λόχο.
// Όλα τα έντυπα με τον ίδιο τρόπο (Michael, 22/10): και τα Excel που φτιάχνει η ίδια η εφαρμογή (Έλεγχος υπηρεσιών,
// Δυναμολόγιο, Στελέχη, Οπλισμός) έχουν λίστα υπογραφών, κενή αρχικά, όπως ήταν.
import type { Settings } from './domain';
import type { ExportKind } from './api';
import { unitKindOf, unitText } from './unit';
import { upper } from './text';

// art: η λέξη από πάνω («Ο», «Η», «ΤΟ» ή κενό) · title: η θέση («ΑΛΧΙΑΣ ΙΛΗΣ») · name: όνομα κάτω από την υπογραφή (προαιρετικό)
export interface Sig { art: string; title: string; name?: string }
export type SigForm = 'hkai' | 'froura' | 'outs' | 'check' | 'roster' | 'cadre' | 'weapons' | 'reports';
export const SIG_FORMS: SigForm[] = ['hkai', 'froura', 'outs', 'check', 'roster', 'cadre', 'weapons', 'reports'];
// Τα Excel που φτιάχνει η εφαρμογή από την αρχή (excel.ts): χωρίς υπογραφές μέχρι να βάλεις
export const MADE_FORMS: SigForm[] = ['check', 'roster', 'cadre', 'weapons'];
export const ARTS = ['Ο', 'Η', 'ΤΟ', ''];

const S = (art: string, title: string): Sig => ({ art, title });
// Όπως είναι στα έντυπα (templates) της εφαρμογής, με τις λέξεις της ίλης
const BASE: Record<Exclude<SigForm, 'reports'>, Sig[]> = {
  hkai: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ')],
  froura: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ'), S('ΤΟ', '2ο ΓΡΑΦΕΙΟ'), S('Ο', 'ΔΚΤΗΣ ΕΠΧΙΑΣ')],
  outs: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ')],
  check: [], roster: [], cadre: [], weapons: []
};
// Το έντυπο των υπογραφών για κάθε εξαγωγή (οι ΠΣΚ όπως τα μονά)
export const sigFormOf = (k: ExportKind): Exclude<SigForm, 'reports'> =>
  k === 'hkai' ? 'hkai' : k === 'froura' || k === 'frouraPsk' ? 'froura' : k === 'check' ? 'check' : 'outs';
// Τα ονόματα στις Ρυθμίσεις και στους διαλόγους (ΗΚΑΙ/ΗΚΑΛ: hk)
export const sigLabel = (f: SigForm, hk = 'ΗΚΑΙ') => ({ hkai: hk, froura: 'ΦΡΟΥΡΑ', outs: 'Εξοδούχοι', check: 'Έλεγχος υπηρεσιών', roster: 'Δυναμολόγιο', cadre: 'Στελέχη', weapons: 'Οπλισμός', reports: 'Έντυπα' }[f]);

// Η προεπιλογή όπως την έχει το έντυπο (στα Έντυπα: λοχίας και διοικητής, με τα ονόματα που είχες ήδη γράψει)
export function sigDefaults(st: Pick<Settings, 'signers'>, form: SigForm): Sig[] {
  if (form !== 'reports') return BASE[form].map(x => ({ ...x }));
  return [{ art: 'Ο', title: 'ΛΟΧΙΑΣ', name: st.signers?.sergeant || '' }, { art: 'Ο', title: 'ΔΙΟΙΚΗΤΗΣ', name: st.signers?.commander || '' }];
}
// Η λίστα ενός εντύπου όπως είναι στις Ρυθμίσεις (ή η προεπιλογή του), χωρίς αλλαγές στις λέξεις
export const sigsSaved = (st: Pick<Settings, 'signers' | 'sigs'>, form: SigForm): Sig[] => st.sigs?.[form]?.map(x => ({ ...x })) ?? sigDefaults(st, form);
export const sigsCustom = (st: Pick<Settings, 'sigs'>, form: SigForm) => !!st.sigs?.[form];

// Εξοδούχοι «Όλη η δύναμη» (Michael, 31/10): η σελίδα 2 (ΔΥΝΑΜΗ) έχει τις ίδιες υπογραφές με τη σελίδα 1 (προεπιλογή), καμία, ή δική της λίστα
export type OutsSig2 = 'same' | 'none' | 'own';
export const OUTS_SIG2: [OutsSig2, string][] = [['same', 'Οι ίδιες με τη σελίδα 1'], ['none', 'Καμία'], ['own', 'Δικές της']];
export const outsSig2Of = (st: Pick<Settings, 'outsSig2'>): OutsSig2 => (st.outsSig2 === 'none' || st.outsSig2 === 'own' ? st.outsSig2 : 'same');
// Η δική της λίστα (outsSigs2), αλλιώς ξεκινά από τις υπογραφές των Εξοδούχων
export const sigsPage2 = (st: Pick<Settings, 'signers' | 'sigs' | 'outsSigs2'>): Sig[] => st.outsSigs2?.map(x => ({ ...x })) ?? sigsSaved(st, 'outs');

// Για το Excel: κεφαλαία, χωρίς κενές, με τις λέξεις του τύπου της μονάδας
export function sigsFor(st: Pick<Settings, 'unitKind'>, list: Sig[]): Sig[] {
  const kind = unitKindOf(st); const t = (v?: string) => unitText(upper((v || '').replace(/\s+/g, ' ').trim()), kind);
  return list.map(x => ({ art: t(x.art), title: t(x.title), name: t(x.name) })).filter(x => x.title || x.name);
}
// Καθαρή λίστα για αποθήκευση (κενά έξω, κενές γραμμές έξω)
export const sigsClean = (list: Sig[]): Sig[] =>
  list.map(x => ({ art: (x.art || '').trim(), title: (x.title || '').replace(/\s+/g, ' ').trim(), ...((x.name || '').trim() ? { name: (x.name || '').replace(/\s+/g, ' ').trim() } : {}) })).filter(x => x.title || x.name);
export const sameSigs = (a: Sig[], b: Sig[]) => JSON.stringify(sigsClean(a)) === JSON.stringify(sigsClean(b));

// Η λέξη από πάνω που ταιριάζει σε μια θέση: «ΤΟ 2ο ΓΡΑΦΕΙΟ», αλλιώς «Ο»
export const artOf = (title: string) => (/ΓΡΑΦΕΙΟ|ΤΜΗΜΑ|ΚΕΝΤΡΟ/.test(upper(title)) ? 'ΤΟ' : 'Ο');
// Προτάσεις για τη θέση (στη μονάδα που ισχύει)
export const sigTitles = (st: Pick<Settings, 'unitKind'>) =>
  ['ΑΛΧΙΑΣ ΙΛΗΣ', 'ΔΚΤΗΣ ΙΛΗΣ', 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ', 'ΥΔΚΤΗΣ ΙΛΗΣ', 'ΔΚΤΗΣ ΕΠΧΙΑΣ', 'ΥΔΚΤΗΣ ΕΠΧΙΑΣ', '2ο ΓΡΑΦΕΙΟ', 'ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ', 'ΕΠΟΠΤΗΣ', 'ΛΟΧΙΑΣ', 'ΔΙΟΙΚΗΤΗΣ']
    .map(t => unitText(t, unitKindOf(st)));
// Μία γραμμή για λίστες και κουμπιά: «Ο ΑΛΧΙΑΣ ΙΛΗΣ · Ο ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ»
export const sigsText = (list: Sig[]) => (list.length ? list.map(x => [x.art, x.title].filter(Boolean).join(' ') + (x.name ? ' (' + x.name + ')' : '')).join(' · ') : 'καμία');
