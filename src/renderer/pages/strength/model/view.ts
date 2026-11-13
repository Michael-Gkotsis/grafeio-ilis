// Pure rules of the «Δύναμη» screen: which cards start open, the rows left after the search and platoon filter, the
// visible cards and the person ids the side card walks through.
// Purpose: `SV_OPEN`, `SV_ORDER`, `filterStrength`, `visibleCats`, `visibleIds`, `isCatOpen`, for the screen and
//   its test.
// Does NOT: render anything, touch React, read the store or navigate (model/useStrength.ts does).
// Owner layer: renderer/pages/strength. Why: moved verbatim from screens/other.ts (Phase 6) so it is testable without
//   a render.
// Covering test: test/strength-page-view.test.ts.
import type { Settings } from '../../../../shared/domain';
import { unitOf } from '../../../../shared/domain';
import type { strengthView, SvCat } from '../../../../shared/strengthView';

/** The result of `strengthView` for one day. */
export type StrengthDay = ReturnType<typeof strengthView>;

/** One card after the filters: the `strengthView` card plus how many rows are left (`shown`). */
export type ShownCat = ReturnType<typeof filterStrength>[number];

/**
 * Which cards start open (Michael, 26/10). «Παρόντες» (100+ people) is closed until opened: a closed card does not
 * build its rows.
 */
export const SV_OPEN: Record<SvCat, boolean> = { kol: true, away: true, present: false };

/** Order of the three cards under the four counters. */
export const SV_ORDER: SvCat[] = ['kol', 'away', 'present'];

/**
 * The rows that pass the search (`found` person ids, `null` = no search) and the platoon `unit` (short name, `''` =
 * all). Without a filter nothing is rebuilt: the groups of the day are returned as they are.
 * @param filtering `!!found || !!unit`
 */
export function filterStrength(
  day: StrengthDay,
  found: Set<number> | null,
  unit: string,
  filtering: boolean,
  settings: Settings,
) {
  return SV_ORDER.map((c) => {
    const cv = day.cats[c];
    const groups = filtering
      ? cv.groups
          .map((g) => ({
            ...g,
            rows: g.rows.filter((r) => (!found || found.has(r.p.id)) && (!unit || unitOf(r.p, settings) === unit)),
          }))
          .filter((g) => g.rows.length)
      : cv.groups;
    return { ...cv, groups, shown: filtering ? groups.reduce((n, g) => n + g.rows.length, 0) : cv.n };
  });
}

/** The cards on screen: all of them, or only the picked counter (`cat` `''` = all). */
export function visibleCats(shown: ShownCat[], cat: SvCat | ''): ShownCat[] {
  return shown.filter((g) => !cat || g.cat === cat);
}

/** Ids of the people on screen, in screen order, for the Up/Down walk of the person sheet. */
export function visibleIds(shown: ShownCat[], cat: SvCat | ''): number[] {
  return visibleCats(shown, cat).flatMap((g) => g.groups.flatMap((x) => x.rows.map((r) => r.p.id)));
}

/**
 * Whether card `c` is open: the user's own toggle wins, then the picked counter, an active search, the default.
 * @param open the cards the user toggled by hand (`undefined` = not toggled)
 */
export function isCatOpen(
  open: Partial<Record<SvCat, boolean>>,
  c: SvCat,
  cat: SvCat | '',
  found: Set<number> | null,
): boolean {
  return open[c] ?? (cat === c || !!found || SV_OPEN[c]);
}

/**
 * Whether the three counters add up to the total (Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη). `strengthView` counts
 * each person once so it always holds; the «Έλεγχος» cell shows «≠» only if a future change breaks that.
 */
export function isBalanced(day: Pick<StrengthDay, 'present' | 'kol' | 'absent' | 'total'>): boolean {
  return day.present + day.kol + day.absent === day.total;
}
