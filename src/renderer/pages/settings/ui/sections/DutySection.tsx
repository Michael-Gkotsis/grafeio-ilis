// «Ρυθμίσεις › Υπηρεσίες και αργίες»: the four sub-tabs (Υπηρεσίες, Σ.Ι., Καταστάσεις, Αργίες) and the card of the open
//   one.
// Purpose: `DutySection`, a `Segmented` that sets the `dsub` route parameter, above one card.
// Does NOT: hold state; the open part is the route parameter. Leaving with unsaved changes asks first (`requestLeave`).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup is
//   exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/settings-screen-view.test.ts.
import { requestLeave } from '../../../../shared/lib/pending';
import { useNav } from '../../../../shared/model';
import { Segmented } from '../../../../shared/ui';
import { DUTY_SUBS, dutySubOf } from '../../model/screenView';
import { BlocksCard } from './BlocksCard';
import { HolidaysCard } from './HolidaysCard';
import { SiCard } from './SiCard';
import { StatCard } from './StatCard';

/** «Υπηρεσίες και αργίες». */
export function DutySection() {
  const nav = useNav();
  const sub: string = dutySubOf(nav.params.dsub);
  return (
    <div className="stack">
      <Segmented
        value={sub}
        onChange={(v: string) => requestLeave(() => nav.set({ dsub: v === 'blocks' ? undefined : v }))}
        items={DUTY_SUBS.map(([value, label]) => ({ value, label }))}
      />
      {sub === 'si' ? <SiCard /> : sub === 'stat' ? <StatCard /> : sub === 'hol' ? <HolidaysCard /> : <BlocksCard />}
    </div>
  );
}
