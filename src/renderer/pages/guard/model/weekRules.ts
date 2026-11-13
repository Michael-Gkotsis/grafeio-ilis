// The week table of the «Κανόνες υπηρεσιών» dialog: 7 days × (start of going out, outs' return, ΔΝ return, training).
// Purpose: `WEEK_ORDER`, `weekDraft` (rules → form texts) and `weekIssue` (what is wrong with the typed hours).
// Does NOT: draw the table (ui/WeekTable.tsx), save it (the dialog sends `setWeekRules`) or know the hours of a day
//   (`src/shared/returns.ts`).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/outsPlan.ts (Phase 6); only the rules dialog
//   uses it (Michael, 24/10, 25/10).
// Covering test: test/guard-page-view.test.ts.
import { DOW_FULL } from '../../../../shared/dates';
import { mins, normTime } from '../../../../shared/hours';
import { weekRow } from '../../../../shared/returns';
import type { Rules } from '../../../../shared/domain';

/** Monday first, Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** One form line per weekday number (0 = Sunday): hours as typed text, training as a flag. */
export type WeekDraft = Record<number, { out: string; backOut: string; backDn: string; train: boolean }>;

/** The form texts of the saved week rules (defaults filled in), one line per weekday. */
export const weekDraft = (rules: Pick<Rules, 'week'>): WeekDraft =>
  Object.fromEntries(WEEK_ORDER.map((w) => [w, weekRow(rules, w)])) as WeekDraft;

/**
 * What is wrong with the typed hours of the week.
 * @returns the Greek sentence for the first wrong day, or `''` when every hour is valid (`normTime`) and the outs
 *   return after the going out starts
 */
export function weekIssue(d: WeekDraft): string {
  for (const w of WEEK_ORDER) {
    const x = d[w];
    const o = normTime(x.out);
    const b = normTime(x.backOut);
    if (!o || !b || !normTime(x.backDn)) return DOW_FULL[w] + ': μια ώρα δεν είναι σωστή (π.χ. 17:00)';
    if (mins(b) <= mins(o)) return DOW_FULL[w] + ': οι εξοδούχοι πρέπει να γυρνούν μετά την αρχή της εξόδου';
  }
  return '';
}
