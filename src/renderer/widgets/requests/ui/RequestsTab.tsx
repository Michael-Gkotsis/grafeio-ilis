// «ΗΚΑΙ › Αιτήσεις»: the requests of a day, written once in the ΗΚΑΙ of that day (5. Αιτήσεις).
// Purpose: `RequestsTab`, the page header with the day bar and the requests card.
// Does NOT: list or answer the requests (ui/RequestsCard.tsx does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0); the «Καταστάσεις» hub
//   drops it in as one piece.
// Covering test: test/screens-main.test.ts, test/screens-tabs.test.ts.
import { addDays } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import { requestLeave } from '../../../shared/lib/pending';
import { useNav, useStore } from '../../../shared/model';
import { DateBar, PageHeader } from '../../../shared/ui';
import { RequestsCard } from './RequestsCard';

export function RequestsTab() {
  const { today } = useStore();
  const nav = useNav();
  const date = nav.params.hkaiDate || today;
  return (
    <div>
      <PageHeader level={2} title="Αιτήσεις" sub={'Γράφονται μία φορά, στην ' + HK() + ' της μέρας τους (5. Αιτήσεις).'}>
        <DateBar
          value={date}
          onChange={(d: string) => requestLeave(() => nav.set({ hkaiDate: d }))}
          days={[addDays(today, -1), today, addDays(today, 1)]}
        />
      </PageHeader>
      <div style={{ maxWidth: '960px' }}>
        <RequestsCard date={date} />
      </div>
    </div>
  );
}
