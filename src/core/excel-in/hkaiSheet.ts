// Finding the cells of the «ΗΚΑΙ» form in the Excel of the unit.
//
// Purpose: `detectHkai` (rows per rank, columns per key, title and date found from the texts of the form),
//   `hkaiMapOf` (the map with the sample as default) and the sample itself (`HKAI_DEFAULT`, `HK_RANKS`, `HK_COLS`).
// Does NOT: fill the form (src/main/exports.ts does) or count the people (core/hkai does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model,
//   core/excel-in/cellText.
// Why: the sergeant may move rows and columns of the form; the app finds them from the texts, and what it cannot
//   find it does not write «blindly» at the place of the sample.
// Covering tests: test/sources.test.ts, test/hkai-auto.test.ts.
import { normGreek } from '../lib/text';
import type { RawSheet } from './roster';
import { hkRowNames } from '../model/unit';
import type { HkaiMap } from '../model/bindings';
import { cellText, headText, colLetter } from './cellText';

/** The base rank rows of the «ΗΚΑΙ» form, from top to bottom. */
export const HK_RANKS = [
  'Επίλαρχοι',
  'Ίλαρχοι',
  'Ανθυπίλαρχοι-Ανθλγοι',
  'Ανθυπασπιστές',
  'ΔΕΑ',
  'Αρχιλοχίες',
  'Επιλοχίες',
  'Λοχίες',
  'Δεκανείς',
  'ΕΠΟΠ Στρατιώτης',
  'ΟΒΑ Στρατιώτης',
  'Στρατιώτες',
];
/** The columns of the «ΗΚΑΙ» form: key → [name for the user, pattern of the header in the form]. */
export const HK_COLS: [string, string, RegExp][] = [
  ['placed', 'Τοποθετημένοι', /ΤΟΠΟΘΕΤΗΜΕΝΟΙ/],
  ['attached', 'Προσκολλημένοι', /ΠΡΟΣΚΟΛ/],
  ['sum', 'Σύνολο δύναμης (τύπος)', /^ΣΥΝΟΛΟ$/],
  ['yp', 'Υπηρεσία εντός στρατοπέδου', /ΥΠΗΡΕΣΙΑ ΕΝΤΟΣ/],
  ['ey', 'Ελεύθεροι υπηρεσίας', /ΕΛΕΥΘΕΡΟΙ ΥΠΗΡ/],
  ['tim', 'Τιμωρημένοι', /ΤΙΜΩΡΗΜΕΝΟΙ/],
  ['bl', '(κενή στήλη)', /^$/],
  ['os', 'Ο/Σ', /^Ο\s*\/\s*Σ$/],
  ['mag', 'Μαγειρεία', /ΜΑΓΕΙΡ/],
  ['sid', 'Σιδηρουργείο', /ΣΙΔΗΡΟΥΡΓ/],
  ['kin', 'Σε κίνηση', /ΚΙΝΗΣΗ/],
  ['sumK', 'Σύνολο κωλυομένων (τύπος)', /ΣΥΝΟΛΟ ΚΩΛΥΟΜ/],
  ['ka', 'Κανονικές άδειες', /ΚΑΝΟΝΙΚΕΣ/],
  ['an', 'Αναρρωτικές', /ΑΝΑΡΡΩΤ/],
  ['eid', 'Ειδικές άδειες', /ΕΙΔΙΚΕΣ/],
  ['nos', 'Νοσοκομείο', /ΝΟΣΟΚΟΜ/],
  ['prat', 'Πρατήριο', /ΠΡΑΤΗΡΙΟ/],
  ['adik', 'Αγνοούμενοι / αδικαιολόγητα', /ΑΓΝΟΟΥΜ|ΑΔΙΚΑΙΟΛ/],
  ['fp', 'Φύλλα πορείας', /ΠΟΡΕΙΑΣ/],
  ['fyl', 'Φυλάκια', /ΦΥΛΑΚΙΑ/],
  ['apal', 'Απαλλαγή', /ΑΠΑΛΛΑΓΗ/],
  ['ekp', 'Αποσπασμένοι σε εκπαίδευση', /ΣΕ ΕΚΠΑΙΔΕΥΣΗ/],
  ['allh', 'Αποσπασμένοι σε άλλη μονάδα', /ΑΛΛΗ ΜΟΝΑΔΑ/],
  ['sumA', 'Σύνολο απόντων (τύπος)', /ΣΥΝΟΛΟ ΑΠΟΝΤ/],
  ['avail', 'Διαθέσιμοι (τύπος)', /ΔΙΑΘΕΣΙΜΟΙ/],
  ['ab', 'Μισθοτροφοδοτηθέντες', /ΜΙΣΘΟΤΡΟΦ/],
];
/**
 * The cells of the «ΗΚΑΙ» sample (the Ίλη's form): the row of each rank, the column of each key, the title and the
 * date, used where nothing is detected.
 */
export const HKAI_DEFAULT: HkaiMap = {
  title: 'A4',
  date: 'V34',
  rows: Object.fromEntries(HK_RANKS.map((r, i) => [r, i < 5 ? 17 + i : 23 + i - 5])),
  cols: {
    prov: 'B',
    placed: 'C',
    attached: 'D',
    sum: 'E',
    yp: 'F',
    ey: 'G',
    tim: 'H',
    bl: 'I',
    os: 'J',
    mag: 'K',
    sid: 'L',
    kin: 'M',
    sumK: 'N',
    ka: 'O',
    an: 'P',
    eid: 'Q',
    nos: 'R',
    prat: 'S',
    adik: 'T',
    fp: 'U',
    fyl: 'V',
    apal: 'W',
    ekp: 'X',
    allh: 'Y',
    sumA: 'Z',
    avail: 'AA',
    ab: 'AB',
  },
};
/**
 * Finds the rows and columns of the «ΗΚΑΙ» from the texts of the form. What is not found stays as in the sample.
 * `own`: rows the user added (Settings): if the form already has them they are written there, otherwise new ones come
 * in (they are not missing).
 */
export function detectHkai(
  sheet: RawSheet,
  place = 'Αυλώνας',
  own: string[] = [],
  names: Record<string, string> = {},
): { map: HkaiMap; found: number; total: number; missing: string[] } {
  const map: HkaiMap = JSON.parse(JSON.stringify(HKAI_DEFAULT));
  const missing: string[] = [];
  let found = 0;
  const rows = sheet.rows.slice(0, 120);
  const rk = (s: string) => normGreek(s).replace(/[^Α-ΩA-Z]/g, '');
  const rowOf = (names: string[]) =>
    rows.findIndex((row) => (row || []).slice(0, 4).some((v) => names.some((n) => rk(cellText(v)) === rk(n))));
  // every base row also with its name in the ΗΚΑΛ (Ταγματάρχες, Λοχαγοί…) or the user's own (Settings › «Άλλο όνομα»)
  for (const r of HK_RANKS) {
    const i = rowOf([...hkRowNames(r), ...(names[r] ? [names[r]] : [])]);
    if (i >= 0) {
      map.rows[r] = i + 1;
      found++;
    } else missing.push(r);
  }
  for (const r of own) {
    const i = rowOf([r, ...(names[r] ? [names[r]] : [])]);
    if (i >= 0) map.rows[r] = i + 1;
  }
  // headers: the rows above the first rank
  const top = Math.min(...Object.values(map.rows)) - 1;
  const at: Record<string, number> = {};
  for (let r = Math.max(0, top - 14); r < top; r++)
    (rows[r] || []).forEach((v, c) => {
      const h = headText(v);
      if (!h) return;
      for (const [k, , re] of HK_COLS)
        if (at[k] == null && k !== 'bl' && re.test(h)) {
          at[k] = c;
          break;
        }
    });
  // empty column between Τιμωρημένοι and Ο/Σ (sample): only if it is not another header
  if (at.tim != null && at.os != null && at.os - at.tim === 2 && !Object.values(at).includes(at.tim + 1))
    at.bl = at.tim + 1;
  // «Προβλέπονται από τη σύνθεση»: optional column (Settings of the ΗΚΑΙ), it does not count in the «found»
  let pv: string | null = null;
  for (let r = Math.max(0, top - 14); r < top && !pv; r++)
    (rows[r] || []).forEach((v, c) => {
      if (!pv && /^ΠΡΟΒΛΕΠΟΝΤΑΙ/.test(headText(v))) pv = colLetter(c);
    });
  if (pv) map.cols.prov = pv;
  for (const [k, label] of HK_COLS) {
    if (at[k] != null) {
      map.cols[k] = colLetter(at[k]);
      found++;
    } else missing.push(label);
  }
  const cell = (re: RegExp) => {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) if (re.test(headText(row[c]))) return colLetter(c) + (r + 1);
    }
    return null;
  };
  const t = cell(/ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ/);
  if (t) {
    map.title = t;
    found++;
  } else missing.push('Τίτλος');
  const pl = normGreek(place).replace(/[^Α-ΩA-Z]/g, '');
  const d = pl ? cell(new RegExp('^' + pl + '\\s*,')) : null;
  if (d) {
    map.date = d;
    found++;
  } else missing.push('Τόπος και ημερομηνία');
  // what a recognized form does not have is not written «blindly» at the place of the sample (another
  // column or row may be there): row 0 (the app adds it if it has people), column without a letter, title/date empty
  if (found) {
    for (const r of HK_RANKS) if (missing.includes(r)) map.rows[r] = 0;
    for (const [k] of HK_COLS) if (at[k] == null) delete map.cols[k];
    if (!pv) delete map.cols.prov;
    if (!t) map.title = '';
    if (!d) map.date = '';
  }
  return { map, found, total: HK_RANKS.length + HK_COLS.length + 2, missing };
}
/** The cells of the «ΗΚΑΙ» form from the settings of the user (`cells`), with the sample for what is missing. */
export const hkaiMapOf = (cells?: Partial<HkaiMap>): HkaiMap => ({
  title: cells?.title || HKAI_DEFAULT.title,
  date: cells?.date || HKAI_DEFAULT.date,
  rows: { ...HKAI_DEFAULT.rows, ...(cells?.rows || {}) },
  cols: { ...HKAI_DEFAULT.cols, ...(cells?.cols || {}) },
});
