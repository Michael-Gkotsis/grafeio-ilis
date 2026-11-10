// Check of the hours of a status.
//
// Purpose: `checkTimes`: hours only for the kinds that have hours (leave, hospital, ΣΤΕΠ), as ΩΩ:ΛΛ; on the same day
//   the return is after the departure; no return hour without an end date.
// Does NOT: save the status.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Used by `declare`, `setTimes` and `endLeave`.
// Covering tests: test/leave-hours.test.ts, test/open-declare.test.ts.
import type { ISODate } from '../lib/dates';
import type { TypeKey } from '../model/status';
import { hasTimes, mins, timeNames } from '../statuses/hours';
import { normTime } from '../lib/time';

/**
 * Hours: only for the kinds with hours (leaves, hospital, ΣΤΕΠ, hours.ts), as ΩΩ:ΛΛ; on the same day the return is
 * after the departure. Without an end there is no return hour.
 */
export function checkTimes(c: {
  type: TypeKey;
  from: ISODate;
  to: ISODate;
  fromTime?: string;
  toTime?: string;
  open?: boolean;
}): { fromTime?: string; toTime?: string } {
  if (!hasTimes(c.type)) return {};
  const f = normTime(c.fromTime),
    t = c.open ? '' : normTime(c.toTime),
    n = timeNames(c.type);
  if (f == null) throw new Error('Η ώρα ' + n.fromG + ' «' + c.fromTime + '» δεν διαβάζεται. Γράψε π.χ. 14:00.');
  if (t == null) throw new Error('Η ώρα ' + n.toG + ' «' + c.toTime + '» δεν διαβάζεται. Γράψε π.χ. 22:00.');
  if (f && t && c.from === c.to && mins(t) <= mins(f))
    throw new Error('Την ίδια μέρα η ' + n.to + ' (' + t + ') πρέπει να είναι μετά την ' + n.from + ' (' + f + ')');
  return { ...(f ? { fromTime: f } : {}), ...(t ? { toTime: t } : {}) };
}
