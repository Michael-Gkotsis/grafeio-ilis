// Personal details: IBAN, ΑΜΚΑ, ΑΦΜ (all people) and e-mail, relative's e-mail, blood group (soldiers only).
//
// Purpose: the field lists (`PFIELDS`, `XFIELDS`), the normal form that is stored (`normPersonal`, `normExtra`,
//   `normBlood`), the soft warnings (`warnPersonal`), the reading form (`showPersonal`) and the Excel-cell reader
//   (`personalFromCell`).
// Does NOT: write or read any Excel file (src/main does), save anything, or ever block a save: the check is a warning.
// Owner layer: core/people (no fs, no Electron, no React).
// Why: the person sheet, the Δυναμολόγιο reader/writer and the Έντυπα columns must agree on one stored form.
// Covering tests: test/personal.test.ts, test/personal-excel.test.ts.
import { upper } from '../lib/text';

/** Key of a field that every person (soldier and cadre) can have. */
export type PKey = 'iban' | 'amka' | 'afm';
/** One personal field: key, label, placeholder text and the exact length it should have (null = no fixed length). */
export interface PField {
  k: PKey;
  label: string;
  ph: string;
  len: number | null;
}
/**
 * The personal fields in screen order. They are on the person sheet (soldier and cadre), in the Δυναμολόγιο of the
 * soldiers (columns IBAN, ΑΜΚΑ, ΑΦΜ) and as columns in the Έντυπα, with the filter «Προσωπικά στοιχεία».
 * @decision Michael 3/11: IBAN, ΑΜΚΑ, ΑΦΜ on the sheet, and written to and read from the Excel.
 * @decision Michael 4/11: columns in the Έντυπα (soldiers and cadre) and the filter «Προσωπικά στοιχεία».
 */
export const PFIELDS: PField[] = [
  { k: 'iban', label: 'IBAN', ph: 'π.χ. GR16 0110 1250 0000 0001 2300 695', len: 27 },
  { k: 'amka', label: 'ΑΜΚΑ', ph: '11 ψηφία', len: 11 },
  { k: 'afm', label: 'ΑΦΜ', ph: '9 ψηφία', len: 9 },
];
/** The personal values of a person, by key. */
export type Personal = { [K in PKey]?: string };

// Greek letters that look like Latin ones (ΓΡ typed instead of GR on a Greek keyboard) -> Latin capitals
const LAT: Record<string, string> = {
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'R',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Γ: 'G',
  Δ: 'D',
  Σ: 'S',
  Φ: 'F',
  Λ: 'L',
  Π: 'P',
};
/**
 * The stored form of a personal value: the IBAN without spaces, in Latin capitals; ΑΜΚΑ / ΑΦΜ without spaces and
 * dashes. Spaces, dashes and dots are dropped for all three.
 */
export function normPersonal(k: PKey, v: unknown): string {
  const t = String(v ?? '').replace(/[\s\-.]/g, '');
  if (k !== 'iban') return t;
  return t.toUpperCase().replace(/[Α-Ω]/g, (c) => LAT[c] || c);
}
/** What does not look right ('' = fine or empty). A warning only: it never blocks a save. */
export function warnPersonal(k: PKey, v: unknown): string {
  const t = normPersonal(k, v);
  if (!t) return '';
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
/** The IBAN in groups of 4 for reading (GR16 0110 …); the other values as they are. */
export const showPersonal = (k: PKey, v: unknown): string => {
  const t = normPersonal(k, v);
  return k === 'iban' ? t.replace(/(.{4})(?=.)/g, '$1 ') : t;
};
/** The keys of `PFIELDS`, in the same order. */
export const PKEYS: PKey[] = PFIELDS.map((f) => f.k);
/**
 * From an Excel cell, the same as on the person sheet. A ΑΜΚΑ / ΑΦΜ that came as a number lost its leading zero
 * (01019012345 becomes 1019012345): it is put back when exactly one digit is missing.
 */
export function personalFromCell(k: PKey, v: unknown): string {
  const t = normPersonal(k, v);
  const n = PFIELDS.find((f) => f.k === k)!.len;
  return k !== 'iban' && n && /^\d+$/.test(t) && t.length === n - 1 ? '0' + t : t;
}

/** Key of a field that only soldiers have. */
export type XKey = 'email' | 'relEmail' | 'blood';
/** One extra field of a soldier: key, label and placeholder text. */
export interface XField {
  k: XKey;
  label: string;
  ph: string;
}
/**
 * E-mail, relative's e-mail and blood group: soldiers only. They are written to the sheet ΘΑΛΑΜΟΙ of the
 * Δυναμολόγιο (not to ΣΥΝΟΛΙΚΟ) and exist as columns in the Έντυπα. E-mails stay as typed (they are addresses, not
 * capitals).
 * @decision Michael 3/11: e-mail, relative's e-mail and blood group, soldiers only.
 */
export const XFIELDS: XField[] = [
  { k: 'email', label: 'E-mail', ph: 'π.χ. onoma@example.gr' },
  { k: 'relEmail', label: 'E-mail συγγενή', ph: 'π.χ. του πατέρα' },
  { k: 'blood', label: 'Ομάδα αίματος', ph: '' },
];
/** The keys of `XFIELDS`, in the same order. */
export const XKEYS: XKey[] = XFIELDS.map((f) => f.k);
/** The extra values of a soldier, by key. */
export type Extras = { [K in XKey]?: string };
/** The blood groups of the pick-list (Greek letters, the digit «0»). */
export const BLOOD_GROUPS = ['Α+', 'Α-', 'Β+', 'Β-', 'ΑΒ+', 'ΑΒ-', '0+', '0-'];
/**
 * A blood group in one form (Greek letters, «0» as a digit): A+, a +, ΑΒ θετικό, o neg become Α+, Α+, ΑΒ+, 0-.
 * What is not recognised stays, in capitals (it is not lost).
 */
export function normBlood(v: unknown): string {
  const raw = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  let t = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[＋]/g, '+')
    .replace(/[−–—‐]/g, '-');
  let sign = t.includes('+') ? '+' : t.includes('-') ? '-' : '';
  if (/ΘΕΤΙΚ|POS/.test(t)) sign = '+';
  else if (/ΑΡΝΗΤΙΚ|NEG/.test(t)) sign = '-';
  const g = t
    .replace(/ΘΕΤΙΚ\S*|ΑΡΝΗΤΙΚ\S*|POSITIVE|NEGATIVE|POS|NEG|RH/g, '')
    .replace(/[^A-ZΑ-Ω0]/g, '')
    .split('')
    .map((c) => (({ A: 'Α', Α: 'Α', B: 'Β', Β: 'Β', O: '0', Ο: '0', 0: '0' }) as Record<string, string>)[c] || c)
    .join('');
  return sign && ['Α', 'Β', 'ΑΒ', '0'].includes(g) ? g + sign : upper(raw);
}
/** The stored form of an extra value: the blood group is normalised, the e-mails are only trimmed. */
export const normExtra = (k: XKey, v: unknown): string => (k === 'blood' ? normBlood(v) : String(v ?? '').trim());
