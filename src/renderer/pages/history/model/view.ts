// Pure rules of the «Ιστορικό» screen: the page size and the search / source filter of the audit log.
// Purpose: `HISTORY_PAGE`, `filterAudit`, for the history screen and its test.
// Does NOT: render anything, touch React or read the store.
// Owner layer: renderer/pages/history. Why: moved verbatim from screens/other.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/history-view.test.ts.
import { normGreek } from '../../../../shared/text';
import type { AuditEntry } from '../../../../shared/domain';

/** How many log lines show before the «Δείξε παλιότερες» button: 300 lines would be over 2,000 elements on the page. */
export const HISTORY_PAGE = 60;

/**
 * Keeps the audit entries that match the source and the search text.
 * @param audit - the log, newest first
 * @param query - typed text, matched without accents or case against the action text and its file names
 * @param source - an audit source key (`app`, `excel`...) or `'all'`
 */
export function filterAudit(audit: AuditEntry[], query: string, source: string): AuditEntry[] {
  const needle = normGreek(query.trim());
  return audit.filter(
    (e) =>
      (source === 'all' || e.source === source) &&
      (!needle || normGreek(`${e.text} ${e.files.join(' ')}`).includes(needle)),
  );
}
