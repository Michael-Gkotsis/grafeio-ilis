// A day as words for the texts.
//
// Purpose: `describeDay`: «σήμερα», «αύριο», a weekday name… in lower case.
// Does NOT: format a date; see core/lib/dates.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Kept as exported by the old commands.ts.
// Covering tests: test/dates.test.ts.
import { dayName, type ISODate } from '../lib/dates';

/** The day as lower-case words: «σήμερα», «αύριο», a weekday name… (`dayName` of the unit). */
export const describeDay = (d: ISODate, today: ISODate) => dayName(d, today).toLowerCase();
