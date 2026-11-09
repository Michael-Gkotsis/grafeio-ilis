// Types of the report forms («Έντυπα»): the Report, its columns, picks, extra tables and the value tables.
//
// Purpose: `Report`/`RepTpl` (Settings.reports / reportTpls) with everything they hold: `RepCol`, `RepPick`,
// `RepTable`,
//   `BuildOpts` (the «Φτιάξ' το εδώ» builder), `ValueTable` and its rows/expressions, table positions `Bands`.
// Does NOT: pick people, evaluate expressions or write any Excel (src/shared/reports.ts, values.ts, repBands.ts keep
//   the functions and re-export these types).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: Settings holds the user's reports, so their shape lives in the model; reports.ts used to be imported by the
//   settings type and imported the settings in turn (a type cycle of 33 files).
// Covering tests: test/reports-phase3.test.ts, test/report-narrow-date.test.ts, test/values.test.ts.
import type { RosterFilter, WeaponFilter } from './lists';
import type { TypeKey } from './status';
import type { Sig, Moves } from './documents';

export type RepKind = 'people' | 'cadre' | 'status' | 'duty' | 'weapon' | 'wmove' | 'blank';
// «Γραμμές από φίλτρο» (Michael, 31/10): the blank table with src ('people' | 'cadre') first has the people chosen by
// the table's pick (the filters of step 4,
// as in the people table) and below them the user's own rows (pick.n, grid, who; here it may also be 0)
export type BlankSrc = 'people' | 'cadre';
// ------------------------------------------------------------------ column format (statuses, combination)
// sf: how each status is written, with {TAGS} (ST_TAGS); parts/fmt: the elements of the combination and its format with
// {1}, {2}…
export interface ColOpts {
  sf?: string;
  st?: 'new';
  parts?: string[];
  fmt?: string;
  vals?: string[];
} // st: 'new' = only those that start on the day of the form (empty: those in force)
export interface RepCol {
  c: number;
  f: string;
  text?: string;
  h?: string;
  o?: ColOpts;
} // c: column from 1 · h: the header when it was matched (to find it again)
export interface RepCell {
  ref: string;
  k: string;
}
export interface RepPick {
  // everyone in the strength, those present on the day, or a filter of the strength sheet
  from: 'all' | 'present' | RosterFilter;
  view?: string; // saved list of the strength sheet (SavedView.id)
  noDuty?: boolean; // (old) without those who have a duty on the day or the next: now not: ['duty']
  need?: RepCond[];
  not?: RepCond[]; // combined filters: all of need and none of not must hold
  // (Michael 03/11) other groups of filters: whoever passes group 1 (need/not) OR one of these gets in
  or?: { need?: RepCond[]; not?: RepCond[] }[];
  always?: number[];
  never?: number[]; // soldiers: always in (whatever the filters say) / never in this form
  gap?: number; // random: not those picked for this form in the last `gap` days (from the history)
  si?: string[];
  rooms?: number[]; // only these Σ.Ι. / these rooms (empty = all)
  mode: 'all' | 'first' | 'random';
  n?: number;
  even?: boolean; // random: evenly from every room
  fair?: boolean; // random: first those picked fewer times for this form (memory per ΕΣΣΟ)
  cats?: StCat[]; // Statuses: which kinds (empty = medical, penalties, leaves)
  // Statuses: only these kinds inside the categories (Michael 4/11: «μόνο οι ελεύθεροι υπηρεσίας»); empty = all
  types?: TypeKey[];
  // Statuses: those in force on the day, those in force from the day on, or only those that start on the day
  when?: 'on' | 'from' | 'new';
  blocks?: string[]; // Duties: only these groups of posts (empty = all)
  empty?: boolean; // Duties: also the posts nobody has
  wf?: WeaponFilter; // Weapons: filter of the «Οπλισμός» tab (default: with a weapon)
  open?: boolean; // Weapon moves: only those still out
  // only those declared (started) on the day of the form: in the medical/penalty/leave/admission filters and in all
  // status columns
  stNew?: true;
}
// Soldier filters that combine (Michael 20/10: «π.χ. όχι πόστα και με ιατρικά»), all for the day of the form
export type RepCond = 'present' | 'duty' | 'post' | 'med' | 'pun' | 'leave' | 'other' | 'dnright' | 'weapon' | 'pdata';
export type RepSort = 'name' | 'room' | 'rank' | 'pick' | 'from' | 'seat';
export type StCat = 'med' | 'pun' | 'abs' | 'other' | 'out';
// Where it comes out as a sheet: in the strength sheet (its file, whichever it is when it comes out) or in another
// Excel.
// auto: rewrites itself after every change (not for random ones, which would change every time)
export interface RepTarget {
  to: 'people' | 'file';
  file?: string;
  sheet: string;
  auto?: boolean;
}
export type RepSplit = 'none' | 'room' | 'unit' | 'si';
export interface Report {
  id: string;
  name: string;
  tpl: string;
  kind: RepKind;
  sheet: string;
  head: number; // sheet and header row (from 1)
  cols: RepCol[];
  cells: RepCell[];
  title?: string; // for the element «Τίτλος»
  tday?: string; // «Για ποια μέρα» for the 1st table: empty = as the form, 'next' = next working day, '+N'

  pick: RepPick;
  sort: RepSort;
  day: 'today' | 'tomorrow' | 'ask';
  out: 'file' | 'print' | 'sheet';
  target?: RepTarget; // out = 'sheet'
  split?: RepSplit; // one sheet per room, platoon or Σ.Ι.
  trim?: boolean; // the ready empty rows of the template that are left over are deleted
  daily?: boolean; // also comes out of the «Έντυπα ημέρας» (Σήμερα), together with ΦΡΟΥΡΑ, «ΗΚΑΙ», outs
  sigs?: Sig[]; // its own signatures (empty = Settings › Υπογραφές › Έντυπα)
  layout?: Moves; // where the user moved signatures, header, date (all its sheets), layout.ts
  src?: BlankSrc; // «Κενός πίνακας»: rows from a filter (the people of the pick, before the user's own)
  // «Κενός πίνακας» (kind blank): the person of each row, 'p:12' (soldier) or 'c:3' (cadre member); empty/deleted =
  // empty row
  who?: (string | null)[];
  more?: RepTable[]; // more tables below the first, with their own columns and their own who gets in
  fixed?: boolean; // template on a grid (tables with their own width/position): the columns do not widen when it fills
  // value tables (shared/values.ts): text and value, below the tables, before the signatures; without a people table
  // the form may have only these
  vals?: ValueTable[];
  at?: VAt; // instant the value tables are measured at (empty: as the day's strength)
  // table positions (Phase 3, shared/repBands.ts): bands top to bottom, tables side by side inside a band; empty: one
  // below the other as before
  bands?: Bands;
  // «Σταθερό μέγεθος γραμμάτων» (Michael, 4/11): what is written does not shrink to fit (it wraps, the row grows) and
  // the print uses the Excel letters over as many pages as needed
  fixsz?: boolean;
  // the 1st table comes out without a header row (the row stays in the template so the columns can be found, it is
  // hidden in the form); set by «Φτιάξ' το εδώ»
  nohead?: boolean;
}
// Table 2, 3… of the form (Michael, 22/10: «παραπάνω από ένα table με διαφορετικές στήλες»): its own kind, header row,
// columns, filters and order. No random ones (the draw belongs to the first): everyone or the first N come out.
export interface RepTable {
  id: string;
  tday?: string;
  title?: string;
  kind: RepKind;
  head: number;
  cols: RepCol[];
  pick: RepPick;
  sort: RepSort;
  nohead?: boolean;
  who?: (string | null)[];
  src?: BlankSrc;
} // who, src: as in Report (kind blank only)
// Template: a file in the folder «Πρότυπα εντύπων» (file = file name); built: made in the app with these options
export interface RepTpl {
  id: string;
  name: string;
  file: string;
  built?: BuildOpts;
  mtime?: number;
}
export interface BuildCol {
  f: string;
  h: string;
  w: 'auto' | 'narrow' | 'wide';
  text?: string;
  o?: ColOpts;
}
// «Φτιάξ' το εδώ»: one more table below the first (table title, kind, columns)
// Value table in «Φτιάξ' το εδώ»: it has no columns in the template, it only keeps room (next to a people table or in a
// row of its own) that the form fills
export interface BuildVal {
  id: string;
  title?: string;
  ta?: TAlign;
  lay?: TabLay;
}
export interface BuildTable {
  id: string;
  tday?: string;
  title: string;
  ta?: TAlign;
  kind: RepKind;
  cols: BuildCol[];
  lay?: TabLay;
  nohead?: boolean;
  grid?: string[][];
  nrows?: number;
  who?: (string | null)[];
  src?: BlankSrc;
}
// who: person per row (Report.who), src: rows from a filter (Report.src) · nohead: no header row (Michael, 29/10) ·
// grid, nrows: «Κενός πίνακας» (as in BuildOpts, for tables 2, 3…)
// Size and position of a table on the paper (Michael, 22/10: «ένας πίνακας σε όλη τη σελίδα και ένας με 2 στήλες στο
// μισό,
// στο κέντρο»): width (as the columns need or part of the page), left/centre/right, equal columns, empty rows above
export interface TabLay {
  w?: 'auto' | 'full' | '3/4' | '2/3' | '1/2' | '1/3' | '1/4';
  at?: 'left' | 'center' | 'right';
  even?: boolean;
  gap?: number;
}
// sig: 'list' = the signatures of the form or of Settings (as many as there are); 'sgt'/'both': templates before 20/10
// (sergeant, commander)
export interface BuildOpts {
  tday?: string;
  title: string;
  cols: BuildCol[];
  head: boolean;
  date: boolean;
  sig: 'none' | 'list' | 'sgt' | 'both';
  land: boolean;
  sz: 10 | 11 | 12;
  fill: 'none' | 'gray' | 'olive';
  more?: BuildTable[];
  lay?: TabLay;
  nopeople?: boolean;
  bands?: Bands;
  vals?: BuildVal[];
  nohead?: boolean;
  t1?: string;
  ta1?: TAlign;
  tta?: TAlign;
  grid?: string[][];
  nrows?: number;
  who?: (string | null)[];
  src?: BlankSrc;
}
// src: rows from a filter ('people'/'cadre': first those who pass the filters of step 4, the nrows are the user's own
// below, down to 0) · who: the person of each row ('p:12', 'c:3', null), as in Report.who · grid, nrows: «Κενό» (1st
// table), the cells the user wrote (row × column, without Α/Α; kept beyond nrows) and how many rows come out (default
// 10) · ta1, tta: alignment of the 1st table's title and of the general title (empty: left and centre, as before) · t1:
// title of the 1st table (Michael, 29/10), top left like tables 2, 3… (title is the general title of the page) ·
// nohead: the 1st table without a header row · nopeople: no people table (value tables only, no tables 2, 3…) · bands,
// vals: table positions and value tables (set by forBuild, not chosen by the user here)
// ------------------------------------------------------------------ model
export interface VFilter {
  unit?: string;
  room?: number;
  rank?: string;
  arm?: 'armed' | 'unarmed';
  who?: 'soldiers' | 'cadre';
}
export interface VTerm {
  sign: '+' | '-';
  metric: string;
  filter?: VFilter;
}
export type VExpr = VTerm[];
export type VFmt = 'int' | 'pct' | 'pct1';
// tag: the {NAME} label of the row in a template of the user's own (empty: from the text of the row)
// man: «Δική σου τιμή» (Michael, 29/10): a number or text the user writes, fixed in the form. When present (even empty)
// the row
// is manual: expr (and percentOf, fmt) does not count but stays in the row so one can return to «Υπολογισμός» without
// losing it
export interface VRow {
  day?: string;
  time?: string;
  label: string;
  expr: VExpr;
  percentOf?: VExpr;
  fmt?: VFmt;
  tag?: string;
  man?: string;
}
// Position in the sheet left by «Φτιάξ' το εδώ» (columns c1–c2, and row if alone in a band): set by withBuilt, not by
// the user.
// The table's position relative to the others (below, next to) is Report.bands (shared/repBands.ts); lay: width and
// alignment (TabLay)
// tagsOnly: no table is written, only in the Excel cells that carry the row's label
// tt: the value table's title is already written in the template, in the title row of its band (next to a table with a
// title, Michael 29/10)
export interface Spot {
  c1: number;
  c2: number;
  row?: number;
  tt?: true;
}
// title alignment (Michael, 29/10): empty = as before (tables left, general title centre)
export type TAlign = 'left' | 'center' | 'right';
export interface ValueTable {
  id: string;
  title?: string;
  ta?: TAlign;
  rows: VRow[];
  lay?: TabLay;
  spot?: Spot;
  tagsOnly?: boolean;
}
// ------------------------------------------------------------------ instant of measurement
// undefined: as the day's strength (today the «ΗΚΑΙ» time or the current one if it is later, otherwise the «ΗΚΑΙ»
// time); 'hkai': «ΗΚΑΙ» time; 'out': out time
// of the day («Αρχή εξόδου»); 'now': the time the form comes out; 'HH:MM': the user's own
export type VAt = string | undefined;
export type Bands = string[][];
