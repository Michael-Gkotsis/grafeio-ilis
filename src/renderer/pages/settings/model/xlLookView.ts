// Pure rules of the «Γράμματα Excel» card: the texts, the part change and the sample's styles.
// Purpose: `xlLookView` helpers for `useXlLook`, `XlLookCard` and their test.
// Does NOT: render anything, touch React or save (model/useXlLook.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision Michael 20/10: font, size and alignment of every cell the app writes into Excel; default Arial 12, centred
//   both ways. The forms with a fixed layout and the user's own Excel files stay as they are.
// @decision Michael 21/10: each part (header, title, headings, rows, signatures) has its own size, bold, italic and
//   underline; the header and the signatures also on the forms.
// Covering test: test/settings-xl-look-view.test.ts.
import type { CSSProperties } from 'react';
import {
  XL_H,
  XL_V,
  tablePart,
  type XL_STYLES,
  type XlLook,
  type XlPart,
  type XlPartKey,
} from '../../../../shared/xlLook';

/** «Arial 12, κέντρο / μέση» as the history line and the toast say it. */
export const lookText = (x: XlLook): string =>
  x.font +
  ' ' +
  x.sz +
  ', ' +
  XL_H.find((o) => o.value === x.h)!.label.toLowerCase() +
  ' / ' +
  XL_V.find((o) => o.value === x.v)!.label.toLowerCase() +
  (x.parts ? ', με δικά τους γράμματα σε κομμάτια' : '');

/** Label and help of each part. */
export const PART_LBL: Record<XlPartKey, [string, string]> = {
  hdr: ['Κεφαλίδα', 'Οι γραμμές της μονάδας (μονάδα, γραφείο). Σε όλα τα έντυπα.'],
  title: ['Τίτλος', 'Ο τίτλος του φύλλου ή του εντύπου.'],
  head: ['Επικεφαλίδες στηλών', 'Η γραμμή με τα ονόματα των στηλών.'],
  data: ['Γραμμές του πίνακα', 'Τα στοιχεία κάτω από τις επικεφαλίδες.'],
  sig: ['Υπογραφές', 'Λέξη, θέση και όνομα κάτω από τον πίνακα. Σε όλα τα έντυπα.'],
};

/** The three style buttons: key, letter, tooltip and the letter's own look. */
export const STYLE_BTN: [(typeof XL_STYLES)[number], string, string, Record<string, string>][] = [
  ['b', 'Β', 'Έντονα', { fontWeight: '800' }],
  ['i', 'Π', 'Πλάγια', { fontStyle: 'italic', fontFamily: 'Georgia,serif' }],
  ['u', 'Υ', 'Υπογράμμιση', { textDecoration: 'underline' }],
];

/** The header and the signatures follow the form unless the user sets them; the table parts have defaults. */
export const formLike = (k: XlPartKey): boolean => k === 'hdr' || k === 'sig';

/** How the part comes out: what the user set for the header and signatures, the table's defaults for the rest. */
export const partNow = (x: XlLook, k: XlPartKey): XlPart =>
  formLike(k) ? x.parts?.[k] || {} : tablePart(x, k as 'title' | 'head' | 'data');

/**
 * One part changed (`undefined` in `ch`: back to its default); an emptied part leaves `parts`, and so does `parts`
 * itself when nothing is left.
 */
export function withPart(x: XlLook, k: XlPartKey, ch: XlPart): XlLook {
  const merged = { ...x.parts?.[k], ...ch };
  const p = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as XlPart;
  const parts = { ...x.parts, [k]: p };
  if (!Object.keys(p).length) delete parts[k];
  const { parts: _, ...rest } = x;
  return Object.keys(parts).length ? { ...rest, parts } : rest;
}

/** CSS `font-family` of the sample for a font name. */
export const sampleFamily = (font: string): string =>
  font === 'Times New Roman'
    ? '"Times New Roman",serif'
    : font === 'Calibri'
      ? 'Calibri,Carlito,Arial,sans-serif'
      : 'Arial,"Liberation Sans",sans-serif';

/** The sample's text style per part (header 10 pt when it stays as the form; signatures as large as the rows). */
export function sampleLook(x: XlLook, k: XlPartKey): CSSProperties {
  const p = partNow(x, k);
  const sz = k === 'data' ? x.sz : (p.sz ?? (k === 'hdr' ? 10 : x.sz));
  return {
    fontFamily: sampleFamily(x.font),
    fontSize: sz + 'pt',
    fontWeight: p.b ? 700 : 400,
    fontStyle: p.i ? 'italic' : 'normal',
    textDecoration: p.u ? 'underline' : 'none',
    color: '#202124',
  };
}

/** The sample's table cell: the part's text plus the alignment, the border and the row height. */
export const sampleCell = (x: XlLook, k: XlPartKey): CSSProperties => ({
  ...sampleLook(x, k),
  textAlign: x.h,
  verticalAlign: x.v === 'center' ? 'middle' : x.v,
  border: '1px solid #9aa0a6',
  padding: '0 6px',
  height: x.sz * 2.6 + 'pt',
  background: k === 'head' ? '#d9d9d9' : '#fff',
});

/** The text of the «automatic» size option of a part. */
export const sizeAuto = (x: XlLook, k: XlPartKey): string =>
  formLike(k) ? 'Όπως το έντυπο' : k === 'title' ? 'Αυτόματα (' + (x.sz + 2) + ')' : 'Όπως οι γραμμές (' + x.sz + ')';

/** The unit lines the sample's header shows: the first two filled ones, or the form's own example. */
export const sampleUnits = (unit: readonly string[]): string[] => {
  const filled = unit.filter(Boolean).slice(0, 2);
  return filled.length ? filled : ['ΚΕΘΤ', 'ΓΡΑΦΕΙΟ ΛΟΧΙΑ'];
};
