// The «Καταστάσεις» screen: everything that is a person's status, in four tabs.
// Purpose: `StatusesPage` draws the header, the tabs «Ιατρικά · Ποινές · Άδειες · Αιτήσεις» with their counts, and the
//   widget of the open tab.
// Does NOT: list or edit anything itself (widgets/status-lists and widgets/requests do), or know ΗΚΑΙ or the
//   Ημερήσια Διαταγή (they have their own menu items).
// Owner layer: renderer/pages/statuses. Why: the ΗΚΑΙ screen carried these tabs; the ΗΚΑΙ is now only the report
//   (Michael 9/11, direction B). The route id stays `records`, so Alt+6 still opens it.
// Covering test: test/statuses-page.test.ts.
import { useMemo } from 'react';
import { personMap } from '../../../../shared/rules';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useStore } from '../../../shared/model';
import { PageHeader, Tabs } from '../../../shared/ui';
import { LeavesTab, RecordList } from '../../../widgets/status-lists';
import { RequestsTab } from '../../../widgets/requests';
import { statusCounts, statusTab, statusTabItems, type StatusTab } from '../model/view';

/** The widget of the open tab. Each keeps its own sub-tabs in its own route param (`recTab`, `punTab`, `leaveTab`). */
function tabBody(tab: StatusTab) {
  if (tab === 'pun') return <RecordList mode="pun" />;
  if (tab === 'leave') return <LeavesTab />;
  if (tab === 'req') return <RequestsTab />;
  return <RecordList mode="med" />;
}

/** The hub. The open tab is the route param `stTab`; the menu entry opens the first tab. */
export function StatusesPage() {
  const { state, today } = useStore();
  const nav = useNav();
  const now = useNowMin();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const counts = useMemo(
    () => statusCounts(state, pm, today, now),
    [state.statuses, state.requests, state.settings.lists, pm, today, now],
  );
  const tab = statusTab(nav.params.stTab);
  return (
    <div>
      <PageHeader title="Καταστάσεις" sub="Ιατρικά, ποινές, άδειες και αιτήσεις όλων, σε ένα μέρος" />
      <div style={{ marginBottom: '14px' }}>
        <Tabs value={tab} onChange={(v) => nav.set({ stTab: v })} items={statusTabItems(counts)} />
      </div>
      {tabBody(tab)}
    </div>
  );
}
