// Hours of a day plan: reading, checking and describing them.
//
// Purpose: `timesOf` (read the hours given in a plan), `checkOrder` (the outs return after they leave), `planDiff`
//   (what changed, for the history).
// Does NOT: save the plan or touch the state.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Shared by `setWeekRules`, `setDayPlan`, `setDayPlans` and the outs screen; the hours are unit rules (ΩΩ:ΛΛ,
//   return after start).
// Covering tests: test/dayplan.test.ts, test/return-hours.test.ts.
import type { DayPlan } from '../model/dutyRules';
import { mins } from '../statuses/hours';
import { normTime } from '../lib/time';
import type { WeekRow } from '../outs/dayTimes';

// Outing/return hours: ΩΩ:ΛΛ, only those given (the training is yes/no); an invalid hour does not pass.
const TIME_NAME = { out: 'αρχή εξόδου', backOut: 'επιστροφή εξοδούχων', backDn: 'επιστροφή ΔΝ' } as const;
/**
 * The hours given in a day plan, as `ΩΩ:ΛΛ`, and the training flag. Throws (with `where` in the message) for an
 * invalid hour.
 */
export function timesOf(p: DayPlan, where: string): Partial<WeekRow> {
  const r: Partial<WeekRow> = {};
  for (const k of ['out', 'backOut', 'backDn'] as const)
    if (p[k] != null) {
      const t = normTime(p[k]);
      if (!t) throw new Error(where + ': η ώρα (' + TIME_NAME[k] + ') δεν είναι σωστή');
      r[k] = t;
    }
  if (p.train != null) r.train = !!p.train;
  return r;
}
/** Throws when the outs return (`backOut`) before or when the outing starts (`out`). */
export const checkOrder = (r: WeekRow, where: string) => {
  if (mins(r.backOut) <= mins(r.out))
    throw new Error(where + ': οι εξοδούχοι γυρνούν (' + r.backOut + ') πριν ή όταν ξεκινά η έξοδος (' + r.out + ')');
};
/** What changed: «αρχή εξόδου 17:00 → 14:00», «πρωινή εκπαίδευση ναι → όχι». */
export const planDiff = (a: WeekRow, b: WeekRow): string[] => [
  ...(['out', 'backOut', 'backDn'] as const)
    .filter((k) => a[k] !== b[k])
    .map((k) => TIME_NAME[k] + ' ' + a[k] + ' → ' + b[k]),
  ...(a.train !== b.train
    ? ['πρωινή εκπαίδευση ' + (a.train ? 'ναι' : 'όχι') + ' → ' + (b.train ? 'ναι' : 'όχι')]
    : []),
];
