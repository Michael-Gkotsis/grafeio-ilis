// What a measure of the catalogue of values tables is.
//
// Purpose: `Metric`, the two builders `S` (a set of people) and `N` (a number), the groups `G` and the category
//   names.
// Does NOT: list the measures (metrics.ts) or look one up (metricLookup.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/reports/valueCtx.
// Why: the catalogue file is one long function; the types and the builders it needs are kept out of it.
// Covering tests: test/values.test.ts, test/note-only.test.ts.
import type { VCtx, VSet } from './valueCtx';

/**
 * One measure of the catalogue: kind 'set' gives a set of people, 'num' a plain number; `group` and `label` are what
 * the menu shows, `tip` the help.
 */
export interface Metric {
  id: string;
  label: string;
  group: string;
  kind: 'set' | 'num';
  tip?: string;
  fn: (c: VCtx) => VSet | number;
}
/** A measure that gives a set of people. */
export const S = (id: string, group: string, label: string, fn: (c: VCtx) => VSet | number, tip?: string): Metric => ({
  id,
  label,
  group,
  kind: 'set',
  fn,
  ...(tip ? { tip } : {}),
});
/** A measure that gives a number. */
export const N = (id: string, group: string, label: string, fn: (c: VCtx) => number, tip?: string): Metric => ({
  id,
  label,
  group,
  kind: 'num',
  fn,
  ...(tip ? { tip } : {}),
});
/** The groups of the catalogue, with the names the menu shows. */
export const G = {
  str: 'Δύναμη',
  st: 'Καταστάσεις',
  med: 'Ιατρικά',
  req: 'Αιτήσεις',
  out: 'Έξοδοι και παραμένοντες',
  duty: 'Υπηρεσίες της μέρας',
  kol: 'Κωλυόμενοι (εξωτερική υπηρεσία)',
  cadre: 'Στελέχη',
  w: 'Οπλισμός',
  hk: 'Σύνολα ΗΚΑΙ',
};
/** The names of the status categories in the catalogue. */
export const CAT_LBL: Record<string, string> = {
  abs: 'Άδειες (ΚΑ, τιμητική, αναρρωτική)',
  pun: 'Ποινές',
  out: 'Έξοδοι (εξοδούχοι και ΔΝ)',
  other: 'ΣΤΕΠ και νοσοκομείο',
  med: 'Όλα τα ιατρικά (ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και δικά σου)',
};
