// The choices «Φτιάξ' το εδώ» and the report form offer: categories, splits, widths and fills.
//
// Purpose: `ST_CATS` / `DEF_CATS`, `SPLITS`, `TAB_WIDTHS`, `FILLS` and `gridOn` (does the sheet need the grid of
//   columns).
// Does NOT: apply a choice (the builder in src/main/reports.ts and builder.ts do).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/reports/bands.
// Why: these lists are the text the user sees in the drop-downs and their values are saved in the report, so the
//   screen and the Excel writer read them from the same place.
// Covering tests: test/report-bands.test.ts, test/layout.test.ts, test/report-narrow-date.test.ts.
import type { StCat, RepSplit, TabLay, BuildOpts } from '../model/reportTypes';
import { hasBeside } from './bands';

/** The status categories a «Καταστάσεις» table can show, in the order of the list. */
export const ST_CATS: { id: StCat; label: string }[] = [
  { id: 'med', label: 'Ιατρικά' },
  { id: 'pun', label: 'Ποινές' },
  { id: 'abs', label: 'Άδειες' },
  { id: 'other', label: 'ΣΤΕΠ, νοσοκομείο' },
  { id: 'out', label: 'Έξοδοι' },
];
/** The categories a «Καταστάσεις» table starts with (medical, penalties, leaves). */
export const DEF_CATS: StCat[] = ['med', 'pun', 'abs'];
/** How a report splits into sheets: none, per room, per platoon, per Σ.Ι. */
export const SPLITS: { value: RepSplit; label: string }[] = [
  { value: 'none', label: 'Ένα για όλους' },
  { value: 'room', label: 'Ανά θάλαμο' },
  { value: 'unit', label: 'Ανά ουλαμό' },
  { value: 'si', label: 'Ανά Σ.Ι.' },
];
/**
 * The widths a table can take on the sheet; `f` is the fraction of the 24 grid columns (0 = as wide as its columns
 * need).
 */
export const TAB_WIDTHS: { value: NonNullable<TabLay['w']>; label: string; f: number }[] = [
  { value: 'auto', label: 'Όσο χρειάζονται οι στήλες', f: 0 },
  { value: 'full', label: 'Όλο το πλάτος', f: 1 },
  { value: '3/4', label: 'Τα 3/4', f: 3 / 4 },
  { value: '2/3', label: 'Τα 2/3', f: 2 / 3 },
  { value: '1/2', label: 'Το μισό', f: 1 / 2 },
  { value: '1/3', label: 'Το 1/3', f: 1 / 3 },
  { value: '1/4', label: 'Το 1/4', f: 1 / 4 },
];
/**
 * True when the sheet is laid out as a grid of columns (a table column = merged cells): some table has its own width
 * or position, or tables sit side by side (bands) and share the 24 columns.
 */
export const gridOn = (o: Pick<BuildOpts, 'lay' | 'more'> & Partial<Pick<BuildOpts, 'bands' | 'vals'>>) =>
  [o.lay, ...(o.more || []).map((t) => t.lay), ...(o.vals || []).map((t) => t.lay)].some(
    (l) => !!l && ((l.w && l.w !== 'auto') || (l.at && l.at !== 'left') || !!l.even),
  ) || hasBeside(o.bands || []);
/** The fill colour (RGB hex) of the table header by the `fill` option; '' means no fill. */
export const FILLS: Record<BuildOpts['fill'], string> = { none: '', gray: 'D9D9D9', olive: 'D8DFC4' };
