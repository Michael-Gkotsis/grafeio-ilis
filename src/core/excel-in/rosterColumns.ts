// The column rules of the roster sheets: header patterns, the ΔΝ words and the «is this row a person» test.
//
// Purpose: `HEADERS` (header text -> field), `Field`, the ΔΝ helpers (`DN_HEAD`, `DN_WORD`, `isDnYes`, `stripDn`),
//   `isPersonRow` and `essosOf`.
// Does NOT: read a sheet, hold the user's column choice (`OV`) or build import rows (core/excel-in/roster.ts does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/people.
// Why: split out of roster.ts so that each file stays under 400 lines; roster.ts re-exports every name, so
//   `import { HEADERS } from '.../roster'` keeps working.
// Covering tests: test/roster-sync.test.ts, test/column-heads.test.ts, test/esso.test.ts.
import { norm, normGreek } from '../lib/text';
import type { PKey } from '../people/personal';

/**
 * ΔΝ right: a column «ΔΝ» (ΝΑΙ, Χ, ✓…), the word ΔΝ in the remarks, or a sheet «ΔΝ» with a list of names.
 * @see test/roster-sync.test.ts
 */
export const DN_HEAD =
  /^Δ\s*[./]?\s*[ΝN]\s*\.?(\s*\(.*\))?$|ΔΙΚΑΙΩΜΑ\s*Δ\s*[./]?\s*[ΝN]|ΔΙΚΑΙΟΥΧ\S*\s*Δ\s*[./]?\s*[ΝN]|^ΔΙΑΝΥΚΤΕΡΕΥΣ/;
/** The word ΔΝ inside a remark, delimited by space, comma, semicolon, slash or brackets. */
export const DN_WORD = /(^|[\s,;/(])Δ\s?\.?\s?[ΝN]\s?\.?(?=$|[\s,;/)])/;
/**
 * True when the cell value of a ΔΝ column means «yes».
 * `normGreek` turns look-alike Latin letters (OXI, NO, N/A) into Greek, so that «OXI» does not give ΔΝ.
 */
export const isDnYes = (v: string) => {
  const t = normGreek(v).replace(/\s+/g, ' ').trim();
  return !!t && !/^(ΟΧΙ|Ο|ΝΟ|Ν\/Α|-+|0|ΧΩΡΙΣ.*)$/.test(t);
};
/** The role without the word ΔΝ («ΘΑΛΑΜΑΡΧΗΣ ΔΝ» -> «ΘΑΛΑΜΑΡΧΗΣ»). */
export const stripDn = (v: string) =>
  norm(v)
    .replace(new RegExp(DN_WORD.source, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;/-]+|[\s,;/-]+$/g, '')
    .trim();
/** A field that a roster column can carry. */
export type Field =
  | 'rank'
  | 'origin'
  | 'spec'
  | 'last'
  | 'first'
  | 'father'
  | 'asm'
  | 'phone'
  | 'room'
  | 'si'
  | 'remarks'
  | 'post'
  | 'dn'
  | PKey;
/** Header patterns, tried in this order on the normalised header cell. */
export const HEADERS: [Field, RegExp][] = [
  ['rank', /^ΒΑΘΜΟΣ$/],
  ['origin', /^ΠΡΟΕΛΕΥΣΗ$/],
  ['spec', /^Ο\s*[/\-]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$/],
  ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/],
  ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$/],
  ['asm', /^ΑΣΜ$|^Α\.Σ\.Μ\.?$|ΑΡ.*ΜΗΤΡΩΟΥ/],
  ['phone', /ΚΙΝΗΤΟ|ΤΗΛΕΦΩΝΟ/],
  ['room', /^ΘΑΛΑΜΟΣ$/],
  ['si', /^Σ\.?\s*Ι\.?$/],
  ['remarks', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/],
  ['post', /^ΠΟΣΤΟ$/],
  ['dn', DN_HEAD],
  // IBAN, ΑΜΚΑ, ΑΦΜ (@decision Michael 3/11): both Latin and Greek letters are accepted in the header
  ['iban', /^[ΙI]BAN$/],
  ['amka', /^[ΑA][ΜM][ΚK][ΑA]$/],
  ['afm', /^[ΑA][ΦF][ΜM]$/],
];

// Below the names the roster has summary tables (ΣΥΝΟΛΟ, ΘΑΛΑΜΟΙ, 1ΟΣ…8ΟΣ, ΑΔΕΙΕΣ…).
// In merged cells the same text arrives in both the last-name and the first-name column, and the «father» is a number.
const SUMMARY =
  /^(ΣΥΝΟΛΟ|ΣΥΝΟΛΑ|ΓΕΝΙΚΟ|ΘΑΛΑΜΟΙ|ΘΑΛΑΜΟΣ|ΕΙΣΑΓΩΓΕΣ|ΑΔΕΙΕΣ|ΑΝΑΡ+ΩΤΙΚΕΣ|ΣΤΡΑΤΙΩΤΕΣ|ΠΑΡΟΝΤΕΣ|ΑΠΟΝΤΕΣ|ΔΥΝΑΜΗ|ΕΚΤΟΣ|ΝΟΣΟΚΟΜΕΙΟ|ΟΥΛΑΜΟΣ|ΔΙΑΘΕΣΙΜΟΙ)\b/;
/**
 * Is this row a person and not a summary line, a merged cell or a note?
 * The slash is allowed in names (ΝΙΚΟΛΑΟΣ/ΛΟΥΚΑΣ): without it such a row was lost silently, not even listed in
 * «Χωρίς άτομο».
 * @see test/roster-sync.test.ts
 */
export function isPersonRow(last: string, first: string, father: string): boolean {
  const L = norm(last),
    F = norm(first),
    P = norm(father);
  if (/\d/.test(L) || /\d/.test(F)) return false; // 1ΟΣ, 8ΟΣ…
  if (L === F) return false; // merged cell
  if (SUMMARY.test(L) || SUMMARY.test(F)) return false;
  if (P && /^[\d\s.,]+$/.test(P)) return false; // a number in the place of the father's name
  return /^[Α-ΩA-Z][Α-ΩA-Z\s'΄\-./]*$/.test(L) && /^[Α-ΩA-Z][Α-ΩA-Z\s'΄\-./]*$/.test(F);
}

/** The ΕΣΣΟ of a sheet title, e.g. «ΔΥΝΑΜΟΛΟΓΙΟ Β' ΕΣΣΟ 2026» -> «2026 Β΄»; empty when the title has none. */
export function essosOf(title: string): string {
  const m = /([Α-Δ])\s*['΄’`]?\s*ΕΣΣΟ\s*(\d{4})/.exec(norm(title));
  return m ? m[2] + ' ' + m[1] + '΄' : '';
}
