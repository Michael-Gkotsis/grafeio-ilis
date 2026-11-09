// Greek text normalisation: search keys, transliteration, the Greek collator and document capitals.
//
// Purpose: turn user text into comparable keys (norm, normGreek, translit) and into the capitals every Excel and Word
//   output uses (upper, no accents, diaereses kept).
// Does NOT: inflect words (core/lib/greek.ts) or know any domain concept.
// Owner layer: core/lib (no fs, no Electron, no React).
// Why: hard rule 2 (everything written into Excel is in capitals) needs exactly one implementation of "capitals".
// Covering tests: test/text-fit.test.ts, test/dates.test.ts (indirect); every output test goes through upper().
// Greek normalisation for search: no accents, upper case, Latin look-alikes → Greek
const LOOKALIKE: Record<string, string> = {
  A: 'Α',
  B: 'Β',
  E: 'Ε',
  H: 'Η',
  I: 'Ι',
  K: 'Κ',
  M: 'Μ',
  N: 'Ν',
  O: 'Ο',
  P: 'Ρ',
  T: 'Τ',
  X: 'Χ',
  Y: 'Υ',
  Z: 'Ζ',
};
const GR2LAT: Record<string, string> = {
  Α: 'A',
  Β: 'V',
  Γ: 'G',
  Δ: 'D',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'I',
  Θ: 'TH',
  Ι: 'I',
  Κ: 'K',
  Λ: 'L',
  Μ: 'M',
  Ν: 'N',
  Ξ: 'X',
  Ο: 'O',
  Π: 'P',
  Ρ: 'R',
  Σ: 'S',
  Τ: 'T',
  Υ: 'Y',
  Φ: 'F',
  Χ: 'CH',
  Ψ: 'PS',
  Ω: 'O',
};

/** Upper case, trimmed, accents (combining marks U+0300–U+036F) removed. null/undefined → ''. */
export const norm = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
/** norm() plus Latin look-alike letters turned into the Greek ones (A → Α, B → Β…), for matching typed text. */
export const normGreek = (s: unknown): string =>
  norm(s)
    .split('')
    .map((c) => LOOKALIKE[c] || c)
    .join('');
/** norm() with Greek letters turned into Latin ones (Θ → TH, Χ → CH…), for file names and search keys. */
export const translit = (s: unknown): string =>
  norm(s)
    .split('')
    .map((c) => GR2LAT[c] || c)
    .join('');
/** Greek collation, accent- and case-insensitive: the one sort order used for names. */
export const collator = new Intl.Collator('el', { sensitivity: 'base' });
/** Upper case without accents, as written in documents (diaereses stay): «Στέρηση εξόδου» → «ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ». */
export const upper = (s: unknown): string =>
  String(s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/́/g, '')
    .normalize('NFC');
