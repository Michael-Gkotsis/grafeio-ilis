// Has a leave (or hospital / ΣΤΕΠ stay) already begun?
// Purpose: `leaveStarted`, the one rule that decides between «Ακύρωση» (not started) and «Γύρισε» (started).
// Does NOT: read the store or write anything; the clock comes from `nowHM()`.
// Owner layer: renderer/features/leave-end. Why: the leaves list needs the rule too, for the label of its button.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { nowHM } from '../../../../shared/dates';
import type { Status } from '../../../../shared/domain';

/**
 * A leave (normal, honorary, sick) that has begun or not yet.
 * @param st - the leave
 * @param today - ISODate, local app time
 * @returns true when `from` is before today, or today and the out time (if any) has passed (`nowHM()`, local time)
 * @decision Michael, 18/10: «να μπορείς να ακυρώσεις / τερματίσεις άδεια».
 */
export const leaveStarted = (st: Status, today: string): boolean =>
  st.from < today || (st.from === today && (!st.fromTime || st.fromTime <= nowHM()));
