// Έξτρα στοιχεία ατόμου (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ. Μόνο στην καρτέλα (οπλίτη και στελέχους): δεν γράφονται σε Excel,
// έντυπα, εκτυπώσεις ή άλλες οθόνες. Ελαφρύς έλεγχος που δεν εμποδίζει ποτέ την αποθήκευση.

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
