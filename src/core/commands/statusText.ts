// Text helpers of the statuses: the file of a leave and a date range.
//
// Purpose: `leaveFile` (which Excel file a status belongs to) and `range` (dd/mm or dd/mm–dd/mm).
// Does NOT: change a status.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Shared by the declare and the status edit handlers.
// Covering tests: test/leave-text.test.ts, test/leaves-combos.test.ts.
import { HK } from '../model/unit';
import { dm, type ISODate } from '../lib/dates';
import type { Status } from '../model/status';

/** The Excel file a status belongs to: «Άδειες» for a leave, the ΗΚΑΙ file for a κωλυόμενος, else «Ιατρικά». */
export const leaveFile = (st: Status) =>
  st.type === 'LEAVE' || st.type === 'HON' ? 'Άδειες' : st.type === 'KOL' ? HK() : 'Ιατρικά';
/** `dd/mm`, or `dd/mm–dd/mm` when the dates differ. */
export const range = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));
