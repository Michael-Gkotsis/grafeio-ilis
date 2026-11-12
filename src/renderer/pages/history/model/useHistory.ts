// State of the «Ιστορικό» screen: the search box, the source filter and the paging.
// Purpose: `useHistory`, the hooks of `HistoryScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the filter rules (model/view.ts).
// Owner layer: renderer/pages/history. Why: moved verbatim from screens/other.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../shared/model';
import { HISTORY_PAGE, filterAudit } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the log (`audit`), today's date, `undo`, the `last` undoable entry, the typed text `q` (and its deferred
 *   `dq`), the source `src`, the filtered `list`, the page counter `setMore` and the `shown` slice of `list`
 */
export function useHistory() {
  const { audit, today, undo } = useStore();
  const last = audit.find((x) => x.undoable && !x.undone);
  // Search in actions and file names (e.g. a surname), and filter by source.
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [src, setSrc] = useState('all');
  const list = useMemo(() => filterAudit(audit, dq, src), [audit, dq, src]);
  const [more, setMore] = useState(0);
  useEffect(() => setMore(0), [dq, src]);
  const shown = list.slice(0, HISTORY_PAGE * (more + 1));
  return { audit, today, undo, last, q, setQ, dq, src, setSrc, list, setMore, shown };
}
