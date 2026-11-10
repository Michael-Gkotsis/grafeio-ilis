// The kinds of report («Έντυπα») and the small facts about each kind.
//
// Purpose: `REP_KINDS` (what one row is), the predicates `isLinked`, `splitOk`, `dailyOk` and `manualKind`,
//   `rowNoun`, the sorts a kind offers (`sortsOf`, `srcSort`), the size of a «Κενό» table (`blankN`) and the grid
//   that follows its columns (`regrid`).
// Does NOT: list the fields of a kind (fields.ts) or pick its rows (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: the screen, the builder and the Excel writer must agree on what a kind can do, so the answer lives in one
//   place. The file also re-exports the types of core/model/reportTypes.ts that the old src/shared/reports.ts
//   exported.
// Covering tests: test/report-blank.test.ts, test/report-blank-more.test.ts, test/reports-flow.test.ts,
//   test/reports-phase3.test.ts.
import type { Report, RepKind, RepSort, BlankSrc, BuildCol } from '../model/reportTypes';
export type {
  BuildOpts,
  TabLay,
  BuildTable,
  BuildVal,
  BuildCol,
  RepTpl,
  RepTable,
  Report,
  RepSplit,
  RepTarget,
  StCat,
  RepSort,
  RepCond,
  RepPick,
  RepCell,
  RepCol,
  ColOpts,
  BlankSrc,
  RepKind,
} from '../model/reportTypes';

/** The kinds of report (what one row is), each with the name and the help text the user sees. */
export const REP_KINDS: { id: RepKind; label: string; help: string }[] = [
  { id: 'people', label: 'Στρατιώτες', help: 'Μία γραμμή για κάθε στρατιώτη' },
  { id: 'cadre', label: 'Στελέχη', help: 'Μία γραμμή για κάθε στέλεχος' },
  {
    id: 'status',
    label: 'Καταστάσεις',
    help: 'Μία γραμμή για κάθε ιατρικό, ποινή ή άδεια, με τα στοιχεία του στρατιώτη',
  },
  {
    id: 'duty',
    label: 'Υπηρεσίες ημέρας',
    help: 'Μία γραμμή για κάθε θέση υπηρεσίας της μέρας (θέση, ώρες), με τον στρατιώτη που την έχει',
  },
  {
    id: 'weapon',
    label: 'Οπλισμός',
    help: 'Μία γραμμή για κάθε στρατιώτη με όπλο: αριθμός, τύπος, οπλοβαστός, εντός ή εκτός',
  },
  {
    id: 'wmove',
    label: 'Κινήσεις όπλων',
    help: 'Μία γραμμή για κάθε έξοδο όπλου της μέρας: λόγος, ώρα εξόδου και εισόδου',
  },
  {
    id: 'blank',
    label: 'Κενός πίνακας',
    help: 'Δικές σου στήλες και γραμμές, χωρίς άτομα· γράφεις ό,τι θες στα κελιά ή τα αφήνεις για το χέρι',
  },
];
/**
 * Rows a new «Κενό» table starts with, and the most rows it can have.
 * @decision Michael 29/10: «Κενό» is a table from scratch, without people. The rows are as many as the user writes
 *   (`pick.n`); the cells are the grid of «Φτιάξ' το εδώ» (`ColOpts.vals` per column).
 */
export const BLANK_ROWS = 10,
  BLANK_MAX = 200;
/**
 * The number of rows of a «Κενό» table, from `pick.n`: 1 to `BLANK_MAX`, or from 0 when the table also has rows from a
 * filter (`src`).
 */
export const blankN = (n: unknown, src?: unknown) =>
  src
    ? Math.max(0, Math.min(BLANK_MAX, Math.round(Number(n)) || 0))
    : Math.max(1, Math.min(BLANK_MAX, Math.round(Number(n)) || BLANK_ROWS));
/** The order of the rows that come from a filter: as in the people table (there is no «as I chose» order). */
export const srcSort = (src: BlankSrc, sort: RepSort): RepSort =>
  sort !== 'pick' && sortsOf(src).some((x) => x.value === sort) ? sort : src === 'cadre' ? 'rank' : 'name';
/** True for the kinds that split into sheets by room, platoon or Σ.Ι. (not the cadres and not «Κενό»). */
export const splitOk = (k: RepKind) => k !== 'cadre' && k !== 'blank';
/**
 * The grid of «Φτιάξ' το εδώ» / «Κενό» (row × column, without the Α/Α) follows the columns when they come in, go out
 * or move.
 * `from`: the old column (its position in `was`) each new one comes from (-1: a new one); without `from`: the same
 * position. Empty rows at the end are dropped.
 */
export function regrid(
  grid: string[][] | undefined,
  was: Pick<BuildCol, 'f'>[],
  now: Pick<BuildCol, 'f'>[],
  from?: number[],
): string[][] {
  const src = was.flatMap((c, i) => (c.f === 'aa' ? [] : [i]));
  const pick = now.flatMap((c, i) => (c.f === 'aa' ? [] : [src.indexOf(from ? from[i] : i)]));
  if (grid && pick.length === src.length && pick.every((j, i) => j === i)) return grid; // same column order
  const out = (grid || []).map((row) => pick.map((j) => (j < 0 ? '' : (row?.[j] ?? ''))));
  while (out.length && out[out.length - 1].every((x) => !x)) out.pop();
  return out;
}
/**
 * True for the kinds with one row per «something» of a soldier (status, post, weapon move): the soldier's details are
 * in `p`.
 */
export const isLinked = (k: RepKind) => k === 'status' || k === 'duty' || k === 'wmove';
/**
 * True when the report comes out without asking, so not with random picks and not with «Ρώτα κάθε φορά» («Έντυπα
 * ημέρας»).
 */
export const dailyOk = (r: Pick<Report, 'pick' | 'day'>) => r.pick.mode !== 'random' && r.day !== 'ask';
/** What each kind counts: «20 άτομα», «12 θέσεις». */
export const rowNoun = (k: RepKind) =>
  k === 'cadre'
    ? 'στελέχη'
    : k === 'status'
      ? 'καταστάσεις'
      : k === 'duty'
        ? 'θέσεις'
        : k === 'wmove'
          ? 'κινήσεις'
          : k === 'blank'
            ? 'γραμμές'
            : 'άτομα';
/**
 * True for the kinds whose soldiers can be picked by name («Πάντα μέσα» / «Ποτέ»): only the kinds with one row per
 * soldier.
 */
export const manualKind = (k: RepKind) => k === 'people' || k === 'weapon';
// Sorts per kind (the «Ημερομηνία» one only for statuses and weapon moves, the «Σειρά ΦΡΟΥΡΑΣ» one only for duties).
const SORTS: { value: RepSort; label: string }[] = [
  { value: 'seat', label: 'Σειρά ΦΡΟΥΡΑΣ' },
  { value: 'name', label: 'Αλφαβητικά' },
  { value: 'room', label: 'Θάλαμος' },
  { value: 'rank', label: 'Βαθμός' },
  { value: 'from', label: 'Ημερομηνία' },
  { value: 'pick', label: 'Όπως βγήκαν' },
];
/** The sorts a kind offers, in the order of the list. For weapon moves the date sort is called «Ώρα εξόδου». */
export const sortsOf = (kind: RepKind) =>
  SORTS.filter((s) =>
    kind === 'blank'
      ? s.value === 'pick'
      : (kind !== 'cadre' || s.value !== 'room') &&
        (kind === 'status' || kind === 'wmove' || s.value !== 'from') &&
        (kind === 'duty' || s.value !== 'seat') &&
        !((kind === 'duty' || kind === 'wmove') && s.value === 'pick'),
  ).map((s) => (kind === 'wmove' && s.value === 'from' ? { ...s, label: 'Ώρα εξόδου' } : s));
