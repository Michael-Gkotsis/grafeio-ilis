// The result and the shared shapes of the form engine.
//
// Purpose: types only: `ExportResult` (what every fill function returns), `SheetPart` (a sheet to sign), `MadeMark`
//   (the marks of an Excel the app made itself), `OutsLoc` (where a list of the Εξοδούχοι is) and `AllLine` (a line of
//   the "Όλη η δύναμη").
// Does NOT: contain code or import another file of this folder.
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: a small owner file for the shapes that several files share keeps the import graph free of cycles, type cycles
//   included (Phase 4.9a, verbatim).
// Covering test: test/exports.test.ts, test/outs-all.test.ts and test/head-date-swap.test.ts.
import type { DayRow } from '../../../shared/outsDay';
import type { Sheet } from '../excel/xlsx';
import type { Sig } from '../../../shared/sigs';
import type { Block, LayoutSheet } from '../../../shared/layout';

/**
 * The filled form: file name, the bytes of the .xlsx, the warnings for the user (Greek), the layout of the sheets,
 * `sheet` = the sheet of the form (ΠΣΚ: this one is kept) and `sheets` = the two sheets of the "Όλη η δύναμη" (outs,
 * force).
 */
export interface ExportResult {
  name: string;
  data: Buffer;
  warnings: string[];
  layout?: LayoutSheet[];
  sheet?: string;
  sheets?: string[];
}

/**
 * A sheet to sign. `more`: the other pieces of the sheet (heading, place and date); `key`: which sheet of the form
 * (LAYOUT_SHEETS); `tagOnly`: signatures only at {ΥΠΟΓΡΑΦΕΣ} (the Excel the app makes itself, without signatures of its
 * own); `after`, `names`: Έντυπα (placeSigs); `sigs`: the own signatures of this sheet (page 2 of the Εξοδούχοι "Όλη η
 * δύναμη"), else the signatures of the form.
 */
export interface SheetPart {
  ws: Sheet;
  key: string;
  more: (Block | null)[];
  tagOnly?: boolean;
  after?: number;
  names?: string[];
  sigs?: { sigs: Sig[] | null; def: Sig[] };
}

/**
 * Where the parts of a sheet that the app made itself are: `head`, `date` and `title` cell refs, `foot` = last used
 * row, `cols` = the width in columns.
 */
export interface MadeMark {
  sheet: string;
  key: string;
  head: string[];
  date: string[];
  title: string[];
  foot: number;
  cols: number;
}

/**
 * Where a list is: the sheet and the rows `from`..`to` of it; `rename` says the sheet is a copy that takes the name of
 * the list.
 */
export interface OutsLoc {
  sheet: string;
  from: number;
  to: number;
  rename?: boolean;
}

/**
 * One line of a sheet before it is written: its kind `k`, text, the person row `x`, the Α/Α `no`, the column ΓΙΑΤΙ
 * ΜΕΝΕΙ (`why`) and the cells of a "when" row (`cols`).
 */
export interface AllLine {
  k: 'title' | 'info' | 'gap' | 'banner' | 'sub' | 'head' | 'row' | 'dhead' | 'drow';
  text?: string;
  x?: DayRow;
  no?: number;
  why?: boolean;
  cols?: string[];
}
