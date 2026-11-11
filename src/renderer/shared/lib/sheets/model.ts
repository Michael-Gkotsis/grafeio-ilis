// The model of a form preview: a grid of cells.
// Purpose: `Cell`, `SheetModel` and `E` (a cell builder) are what the form builders (froura.ts, hkai.ts, check.ts) return and
//   what the excel-preview widget draws.
// Does NOT: draw anything or know any form.
// Owner layer: renderer/shared/lib. Why: moved verbatim from renderer/common.ts (Phase 5.3c part 2b); the builders and the
//   widget both need them and a widget may not import a screen or the other way round.
// Covering test: test/custom-excel.test.ts, test/shifts.test.ts, test/epop.test.ts.
import type { Line } from '../../../../shared/hkaiText';

/**
 * One cell of the preview. `s` is the space-separated class list («b c hdr…»), `cs`/`rs` the column/row span.
 * `rich`: lines with underlined parts (ΗΚΑΙ, penalties); `v` keeps the same text, plain.
 */
export interface Cell {
  v: string;
  s: string;
  cs: number;
  rs: number;
  rich?: Line[];
}

/** A sheet: column widths in px (0 = default) and the rows of cells (`null` = covered by a span). */
export interface SheetModel {
  cols: number[];
  rows: (Cell | null)[][];
}

/** Builds a cell. @param v text (null/undefined = empty) @param s classes @param cs column span @param rs row span */
export const E = (v: unknown, s?: string, cs?: number, rs?: number): Cell => ({
  v: v == null ? '' : String(v),
  s: s || '',
  cs: cs || 1,
  rs: rs || 1,
});
