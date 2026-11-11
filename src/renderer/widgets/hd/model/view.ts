// Pure helpers of the Ημερήσια Διαταγή tab.
// Purpose: the days offered by the day bar and the lines of one section after a change.
// Does NOT: read the store or draw anything (model/useHd.tsx and ui/HdTab.tsx do).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/hd.test.ts.
import { addDays, type ISODate } from '../../../../shared/dates';

/** The day bar: today and the next four days, plus the chosen day when it is outside them. */
export function hdDays(today: ISODate, date: ISODate): ISODate[] {
  const days = [0, 1, 2, 3, 4].map((i) => addDays(today, i));
  if (!days.includes(date)) days.push(date);
  return days;
}

/** The text of a line is always written in capitals, as it comes out in the Word document. */
export const hdUpper = (v: string) => v.toUpperCase();

/**
 * The label of «keep the signatures for next time» in the signatures dialog.
 * It lives here, not in the markup, because test/ux-names.test.ts scans screen markup for plain «Ρυθμίσεις › …» text.
 */
export const KEEP_SIGS_TEXT = 'Να μείνουν έτσι και για τις επόμενες φορές (Ρυθμίσεις › Υπογραφές)';
