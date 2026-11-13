// «Δυναμολόγιο»: two tabs, the soldiers list and the «Ημερολόγιο κωλυομένων».
// Purpose: `PeopleScreen`, route `people`; the tab is the route param `ptab` (`imer` or the list).
// Does NOT: hold the list state (model/usePeople.ts), the rules (model/view.ts) or the rows (ui/PersonRow.tsx).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6); htm became TSX with the same
//   markup, text nodes, keys and hook order.
// Covering test: test/screens-main.test.ts, test/layout-fit.test.ts, test/ux-names.test.ts, test/notes.test.ts,
//   test/people-page-view.test.ts.
import { useNav, useStore } from '../../../shared/model';
import { Tabs } from '../../../shared/ui';
import { ImerTab } from './ImerTab';
import { PeopleList } from './PeopleList';

/** The «Δυναμολόγιο» page. */
export function PeopleScreen() {
  const { state } = useStore();
  const nav = useNav();
  const tab = nav.params.ptab === 'imer' ? 'imer' : 'list';
  return (
    <div>
      <div style={{ marginBottom: '14px' }}>
        <Tabs
          value={tab}
          onChange={(v: string) => nav.set({ ptab: v === 'imer' ? 'imer' : undefined })}
          items={[
            { value: 'list', label: 'Λίστα (' + state.people.filter((p) => p.active).length + ')' },
            { value: 'imer', label: 'Ημερολόγιο κωλυομένων' },
          ]}
        />
      </div>
      {tab === 'imer' ? <ImerTab /> : <PeopleList />}
    </div>
  );
}
