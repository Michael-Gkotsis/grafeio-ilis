// The cells of a form («Έντυπα»): header, date, signatures… and the {TAGS} that mark them.
//
// Purpose: `CELLS` / `CellDef` / `cellOf`, `TAG_RE` (finds a {TAG}) and `tagKey` (tag to cell key).
// Does NOT: compute the value of a cell (cellValue.ts) or of a tag in a «Κενός πίνακας» (blankFill.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib.
// Why: a template can mark a cell by clicking it or by a {TAG} inside the Excel, and both ways must name the same
//   cells.
// Covering tests: test/report-blank-tags.test.ts, test/report-titles.test.ts, test/report-narrow-date.test.ts.
import { normGreek } from '../lib/text';

/**
 * A cell of the form (header, date, signatures…), set either by clicking the cell or with a {LABEL} inside the Excel.
 */
export interface CellDef {
  k: string;
  label: string;
  tag: string;
}
/** Every form cell with its key, its name in the list and the {TAG} that marks it in the Excel. */
export const CELLS: CellDef[] = [
  { k: 'head', label: 'Κεφαλίδα εγγράφων (3 γραμμές, Ρυθμίσεις)', tag: 'ΚΕΦΑΛΙΔΑ' },
  { k: 'head1', label: 'Κεφαλίδα, 1η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 1' },
  { k: 'head2', label: 'Κεφαλίδα, 2η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 2' },
  { k: 'head3', label: 'Κεφαλίδα, 3η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 3' },
  { k: 'unitName', label: 'Όνομα μονάδας (π.χ. 4ης ΙΛΗΣ)', tag: 'ΜΟΝΑΔΑ' },
  { k: 'placeDate', label: 'Τόπος και ημερομηνία (ΑΥΛΩΝΑΣ, 19 ΟΚΤ 26)', tag: 'ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ' },
  { k: 'date', label: 'Ημερομηνία (19/10/2026)', tag: 'ΗΜΕΡΟΜΗΝΙΑ' },
  { k: 'title', label: 'Τίτλος του εντύπου', tag: 'ΤΙΤΛΟΣ' },
  { k: 'count', label: 'Σύνολο ατόμων', tag: 'ΣΥΝΟΛΟ' },
  { k: 'sigs', label: 'Υπογραφές (όλες, από αριστερά προς τα δεξιά, Ρυθμίσεις)', tag: 'ΥΠΟΓΡΑΦΕΣ' },
  { k: 'sgtName', label: 'Υπογραφή λοχία (όνομα, Ρυθμίσεις)', tag: 'ΛΟΧΙΑΣ' },
  { k: 'cmdName', label: 'Υπογραφή Διοικητή (όνομα, Ρυθμίσεις)', tag: 'ΔΙΟΙΚΗΤΗΣ' },
  { k: 'esso', label: 'ΕΣΣΟ (Γ΄ ΕΣΣΟ 2026)', tag: 'ΕΣΣΟ' },
  { k: 'officer', label: 'Αξιωματικός υπηρεσίας', tag: 'ΑΞΙΩΜΑΤΙΚΟΣ ΥΠΗΡΕΣΙΑΣ' },
  { k: 'group', label: 'Ομάδα του φύλλου (π.χ. ΘΑΛΑΜΟΣ 3, όταν χωρίζεται σε φύλλα)', tag: 'ΟΜΑΔΑ' },
];
/** The definition of the form cell `k`, or undefined. */
export const cellOf = (k: string) => CELLS.find((x) => x.k === k);
const TAG_KEY = new Map(CELLS.map((c) => [normGreek(c.tag), c.k]));
/** Matches a {TAG} inside a cell text (up to 40 characters between the braces). */
export const TAG_RE = /\{([^{}]{1,40})\}/g;
/** The key of the form cell a tag names ({ΗΜΕΡΟΜΗΝΙΑ} → 'date'), or null. */
export const tagKey = (tag: string) => TAG_KEY.get(normGreek(tag).replace(/\s+/g, ' ').trim()) || null;
