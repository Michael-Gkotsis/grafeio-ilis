// The people of a table that is not a list of statuses.
//
// Purpose: `sheetPeople` (rows → people of the app, with the rows not matched and the repeated ones) and the types
//   of the plans that change a field of a person (`PeopleChange`, `FieldsPlan`).
// Does NOT: decide what to change (postsIn.ts, capsIn.ts, dutyCheckIn.ts do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/peopleMatch,
//   core/excel-in/tableRows, core/excel-in/roster.
// Why: posts, out of strength, capabilities and the duty check all list people; one reader keeps their matching and
//   their totals-row rule the same.
// Covering tests: test/sources.test.ts, test/namesakes.test.ts, test/excel-caps.test.ts.
import { fullName, type Person } from '../model/person';
import { isPersonRow } from './rosterColumns';
import type { CellValue, RawSheet } from './roster';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';
import { makeMatcher, rowName } from './peopleMatch';
import { tableRows } from './tableRows';

/**
 * A row of a sheet matched to a person: the row `r`, the name as written, `pid` (null = not matched; `cands` are the
 * suggestions) and the cells by field key.
 */
export interface SheetPerson {
  r: number;
  who: string;
  pid: number | null;
  cands: Person[];
  v: Record<string, CellValue>;
}
/**
 * The people of one table: `rows` matched to a person, `unmatched` rows (the user chooses), `dup` rows of a person
 * already seen.
 * @decision Michael 11/10: the sheets that are not statuses (posts, out of strength, capabilities, duty check) are
 *   each read on its own, with its own preview («it showed me the numbers as if it had read them from the whole
 *   sheet»).
 */
export interface SheetPeople {
  rows: (SheetPerson & { pid: number })[];
  unmatched: SheetPerson[];
  dup: number;
}
/** The people of a table: who is who in the app. `choices`: row → person for those who did not match (null = skip). */
export function sheetPeople(
  sheet: RawSheet,
  b: SourceBinding,
  people: Person[],
  choices: Record<number, number | null> = {},
): SheetPeople {
  const match = makeMatcher(people);
  const out: SheetPeople = { rows: [], unmatched: [], dup: 0 };
  const seen = new Set<number>();
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    // totals below the table («ΣΥΝΟΛΟ» in the name column) are not people
    if (
      b.cols.last != null &&
      b.cols.first != null &&
      !isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father))
    )
      continue;
    const m = match(v);
    const pid = m.pid ?? (r in choices ? choices[r] : null);
    const row: SheetPerson = { r, who: rowName(v), pid, cands: m.cands, v };
    if (pid == null) {
      if (!(r in choices)) out.unmatched.push(row);
      continue;
    }
    if (seen.has(pid)) {
      out.dup++;
      continue;
    }
    seen.add(pid);
    out.rows.push({ ...row, pid });
  }
  return out;
}
/** Those who may be a row that did not match: nothing changes for them «because they are missing from the sheet». */
export const maybeIn = (sp: SheetPeople) => new Set(sp.unmatched.flatMap((u) => u.cands.map((p) => p.id)));
/** The full name of a person, for the messages. */
export const nameOf = fullName;

/** The fields of a person that a sheet can change: post, in strength, notes. */
export type PeoplePatch = Partial<Pick<Person, 'post' | 'active' | 'notes'>>;
/** One change to a person: `patch`, who it is about and `what` changes (text for the user). */
export interface PeopleChange {
  pid: number;
  patch: PeoplePatch;
  who: string;
  what: string;
}
/**
 * The result of reading a sheet that sets a field of the people: the `changes`, the unchanged `same`, the number
 * `listed`, and the people found (`sp`).
 */
export interface FieldsPlan {
  changes: PeopleChange[];
  same: number;
  listed: number;
  sp: SheetPeople;
}
