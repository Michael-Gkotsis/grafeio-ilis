// Έξτρα στοιχεία ατόμου (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ. Στην καρτέλα (οπλίτη και στελέχους)· από 3/11 (Michael: «θέλω να γράφονται
// στο Excel») γράφονται και διαβάζονται και στο Δυναμολόγιο των οπλιτών (στήλες IBAN, ΑΜΚΑ, ΑΦΜ), όχι σε έντυπα/εκτυπώσεις.
import { upper } from './text';
// Ελαφρύς έλεγχος που δεν εμποδίζει ποτέ την αποθήκευση.

export type PKey = 'iban' | 'amka' | 'afm';
export interface PField { k: PKey; label: string; ph: string; len: number | null }
export const PFIELDS: PField[] = [
  { k: 'iban', label: 'IBAN', ph: 'π.χ. GR16 0110 1250 0000 0001 2300 695', len: 27 },
  { k: 'amka', label: 'ΑΜΚΑ', ph: '11 ψηφία', len: 11 },
  { k: 'afm', label: 'ΑΦΜ', ph: '9 ψηφία', len: 9 }
];
export type Personal = { [K in PKey]?: string };

// ελληνικά γράμματα που μοιάζουν με λατινικά (ΓΡ αντί GR από ελληνικό πληκτρολόγιο) → λατινικά, κεφαλαία
const LAT: Record<string, string> = { Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'R', Τ: 'T', Υ: 'Y', Χ: 'X', Γ: 'G', Δ: 'D', Σ: 'S', Φ: 'F', Λ: 'L', Π: 'P' };
// Αποθηκεύεται συμπαγές: IBAN χωρίς κενά, κεφαλαία λατινικά· ΑΜΚΑ/ΑΦΜ χωρίς κενά και παύλες
export function normPersonal(k: PKey, v: unknown): string {
  const t = String(v ?? '').replace(/[\s\-.]/g, '');
  if (k !== 'iban') return t;
  return t.toUpperCase().replace(/[Α-Ω]/g, c => LAT[c] || c);
}
// Τι δεν φαίνεται σωστό (κενό = εντάξει ή άδειο). Μόνο προειδοποίηση.
export function warnPersonal(k: PKey, v: unknown): string {
  const t = normPersonal(k, v); if (!t) return '';
  if (k === 'iban') {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(t)) return 'Ο IBAN ξεκινά με 2 γράμματα και 2 ψηφία (π.χ. GR16…)';
    if (t.startsWith('GR') && t.length !== 27) return 'Ο ελληνικός IBAN έχει 27 χαρακτήρες· εδώ έχει ' + t.length;
    if (t.length < 15 || t.length > 34) return 'Ασυνήθιστο μήκος IBAN: ' + t.length + ' χαρακτήρες';
    return '';
  }
  const n = k === 'amka' ? 11 : 9;
  if (!/^\d+$/.test(t)) return 'Μόνο ψηφία';
  return t.length === n ? '' : 'Έχει ' + t.length + ' ψηφία, θέλει ' + n;
}
// IBAN ανά 4 για ανάγνωση (GR16 0110 …)· τα άλλα όπως είναι
export const showPersonal = (k: PKey, v: unknown): string => { const t = normPersonal(k, v); return k === 'iban' ? t.replace(/(.{4})(?=.)/g, '$1 ') : t; };
export const PKEYS: PKey[] = PFIELDS.map(f => f.k);
// Από κελί του Excel: όπως στην καρτέλα· ΑΜΚΑ/ΑΦΜ που ήρθαν ως αριθμός έχασαν το αρχικό μηδέν (01019012345 → 1019012345): το ξαναβάζουμε
export function personalFromCell(k: PKey, v: unknown): string {
  const t = normPersonal(k, v); const n = PFIELDS.find(f => f.k === k)!.len;
  return k !== 'iban' && n && /^\d+$/.test(t) && t.length === n - 1 ? '0' + t : t;
}

// E-mail, e-mail συγγενή, ομάδα αίματος (Michael, 3/11): μόνο οπλίτες. Γράφονται στο φύλλο ΘΑΛΑΜΟΙ του Δυναμολογίου (όχι στο ΣΥΝΟΛΙΚΟ)
// και υπάρχουν ως στήλες στα Έντυπα. Τα e-mail μένουν όπως γράφτηκαν (είναι διευθύνσεις, όχι κεφαλαία).
export type XKey = 'email' | 'relEmail' | 'blood';
export interface XField { k: XKey; label: string; ph: string }
export const XFIELDS: XField[] = [
  { k: 'email', label: 'E-mail', ph: 'π.χ. onoma@example.gr' },
  { k: 'relEmail', label: 'E-mail συγγενή', ph: 'π.χ. του πατέρα' },
  { k: 'blood', label: 'Ομάδα αίματος', ph: '' }
];
export const XKEYS: XKey[] = XFIELDS.map(f => f.k);
export type Extras = { [K in XKey]?: string };
export const BLOOD_GROUPS = ['Α+', 'Α-', 'Β+', 'Β-', 'ΑΒ+', 'ΑΒ-', '0+', '0-'];
// Ομάδα αίματος σε μία μορφή (ελληνικά γράμματα, «0» αριθμός): A+, a +, ΑΒ θετικό, o neg → Α+, Α+, ΑΒ+, 0-.
// Ό,τι δεν αναγνωρίζεται μένει με κεφαλαία (δεν χάνεται).
export function normBlood(v: unknown): string {
  const raw = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!raw) return '';
  let t = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[＋]/g, '+').replace(/[−–—‐]/g, '-');
  let sign = t.includes('+') ? '+' : t.includes('-') ? '-' : '';
  if (/ΘΕΤΙΚ|POS/.test(t)) sign = '+'; else if (/ΑΡΝΗΤΙΚ|NEG/.test(t)) sign = '-';
  const g = t.replace(/ΘΕΤΙΚ\S*|ΑΡΝΗΤΙΚ\S*|POSITIVE|NEGATIVE|POS|NEG|RH/g, '').replace(/[^A-ZΑ-Ω0]/g, '')
    .split('').map(c => ({ A: 'Α', Α: 'Α', B: 'Β', Β: 'Β', O: '0', Ο: '0', 0: '0' } as Record<string, string>)[c] || c).join('');
  return sign && ['Α', 'Β', 'ΑΒ', '0'].includes(g) ? g + sign : upper(raw);
}
export const normExtra = (k: XKey, v: unknown): string => (k === 'blood' ? normBlood(v) : String(v ?? '').trim());
