// Column grids and row heights of the two tables of the «Οπλισμός» screen.
// Purpose: `GRID`, `GRID_MIN`, `WHEAD`, `ROW_H` (tab «Όπλα») and `MV_GRID`, `MV_MIN`, `MV_HEAD`, `MV_ROW` (tab
//   «Κινήσεις»), shared by the rows, the headers, the virtual lists and the «go to row» helper.
// Does NOT: draw anything or hold state.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts and screens/weaponMoves.ts
//   (Phase 6); the values are measured for the 1366 px screen and must not change.
// Covering test: test/perf.test.ts (rows in the page), test/screens-main.test.ts (markup).

/**
 * Fits 1366 px without sideways scroll (1140 px): no father's name (it is in the card and in the Excel). The status
 * column is the widest: the exit reason is read whole.
 */
export const GRID =
  '26px 30px 58px minmax(120px,1fr) minmax(70px,.8fr) 66px 40px 80px 80px 92px minmax(236px,2fr) 64px 64px minmax(160px,1fr)';
/** Minimum width of the table content in px. */
export const GRID_MIN = 1186;
/** Header height in px (two lines: «Αριθμός όπλου», «Κατάσταση όπλου»). */
export const WHEAD = 52;
/** Row height in px: the reason is written whole under the ΕΝΤΟΣ/ΕΚΤΟΣ switch (Michael, 24/10). */
export const ROW_H = 46;

/** Columns of the «Κινήσεις» tab: fit 1366 px, names, reasons and buttons are not cut (Michael, 24/10). */
export const MV_GRID =
  '36px minmax(150px,1.4fr) 104px minmax(150px,1fr) 116px minmax(120px,1fr) 116px minmax(100px,.6fr) 212px';
/** Minimum width of the «Κινήσεις» table in px. */
export const MV_MIN = 1104;
/** Header height of the «Κινήσεις» table in px. */
export const MV_HEAD = 40;
/** Row height of the «Κινήσεις» table in px. */
export const MV_ROW = 50;
