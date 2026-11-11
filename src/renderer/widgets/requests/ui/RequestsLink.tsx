// «5. Αιτήσεις» on the ΗΚΑΙ summary: only how many there are; the requests have their own tab.
// Purpose: `RequestsLink`, the card with the count for the day and the number waiting for an answer.
// Does NOT: list the requests (ui/RequestsCard.tsx does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/requests.test.ts.
import { useMemo } from 'react';
import { dm } from '../../../../shared/dates';
import { personMap } from '../../../../shared/rules';
import { reqWaiting } from '../../../shared/lib/reqWaiting';
import { useNav, useStore } from '../../../shared/model';
import { Button, Card } from '../../../shared/ui';

/** Props of `RequestsLink`. */
export interface RequestsLinkProps {
  /** ISODate of the ΗΚΑΙ shown. */
  date: string;
}

export function RequestsLink({ date }: RequestsLinkProps) {
  const { state, today } = useStore();
  const nav = useNav();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const nDay = state.requests.filter((r) => r.date === date && pm.has(r.pid)).length;
  const nWait = reqWaiting(state.requests).filter((r) => pm.get(r.pid)?.active).length;
  return (
    <Card
      title="5. Αιτήσεις"
      actions={
        <Button size="sm" variant="outline" onClick={() => nav.set({ hkTab: 'req' })}>
          Αιτήσεις
        </Button>
      }
    >
      <p className="note" style={{ margin: 0 }}>
        {nDay ? nDay + (nDay === 1 ? ' αίτηση' : ' αιτήσεις') : 'Καμία αίτηση'} για{' '}
        {date === today ? 'σήμερα' : dm(date)}
        {nWait ? ' · ' + nWait + (nWait === 1 ? ' αίτηση περιμένει' : ' αιτήσεις περιμένουν') + ' απάντηση' : ''}.
      </p>
    </Card>
  );
}
