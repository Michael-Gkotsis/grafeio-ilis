// When the one-time review of «προηγούμενες υπηρεσίες» is due.
// Purpose: `needsBaselineReview`, asked by the shell on every render to decide whether the review dialog opens.
// Does NOT: draw the dialog (`BaselineReviewDialog` in people.ts) or change any data.
// Owner layer: renderer/screens. Why: split out of people.ts, because the shell asks this on every render while the
//   people chunk loads only on demand (Phase 5.1b).
// Covering test: test/codes-followups.test.ts.
import type { AppState } from '../../shared/domain';
import { baseTotal } from '../../shared/rules';

/**
 * True once after the upgrade to post codes: the old «προηγούμενες υπηρεσίες» may be counted twice, because every read
 * of the duty check used to add the people who did not fit a post there. The review dialog zeroes them.
 * @param state - the app state
 */
export const needsBaselineReview = (state: AppState): boolean =>
  !state.settings.baselineReviewed &&
  Object.values(state.baseline || {}).some((b) => baseTotal(b) > 0 || (b?.hol || 0) > 0);
