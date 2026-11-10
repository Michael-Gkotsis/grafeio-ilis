// One sheet of the Excel files «Δυναμολόγιο» and «Δυναμικό στελεχών»: the shape that the sheet builders return.
//
// Purpose: the `RosterSheet` type (name, title, head row, body rows) shared by core/people (roster) and core/cadre.
// Does NOT: build any sheet or write any file (src/main does).
// Owner layer: core/model (types only: no fs, no Electron, no React).
// Why: `cadreSheets` (core/cadre) and `rosterSheets` (core/people) return the same shape, and keeping the type in one
//   neutral file closes the type cycle cadre -> rosterLists -> hkaiText -> cadre.
// Covering tests: test/roster-lists.test.ts, test/cadre-excel.test.ts.

/** One Excel sheet: its tab `name`, the `title` row, the `head` row of column names and the body `rows`. */
export interface RosterSheet {
  name: string;
  title: string;
  head: string[];
  rows: (string | number)[][];
}
