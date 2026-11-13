// Screen «Εξοδούχοι»: who goes out and who has ΔΝ on a day, with the hours of the day, the returns and the Excel.
// Purpose: `OutsScreen`, route `outs`.
// Does NOT: hold state (model/useOuts.ts), the rules (model/view.ts) or the parts' markup (the other files of ui/,
//   plain functions called as `{part(o)}` so the render count is the one the screen always had).
// Owner layer: renderer/pages/outs. Why: moved from screens/guard.ts (Phase 6); htm became TSX with the same markup,
//   text nodes, keys and hook order.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { DateBar, PageHeader } from '../../../shared/ui';
import { TemplateNote } from '../../../widgets/export';
import { DOW_GEN, dmy, parseD } from '../../../../shared/dates';
import { useOuts } from '../model/useOuts';
import { backsBox, pendAlerts, roomsAlert } from './OutsAlerts';
import { outsBar } from './OutsBar';
import { confirmDialog } from './OutsConfirm';
import { OutsDayBar } from './OutsDayBar';
import { findBar, roomBar } from './OutsFilters';
import { outsList } from './OutsList';

// Βραδινή εκπαίδευση (Michael, 13/10): η μέρα δεν μετρά στη στέρηση εξόδου κανενός· η λήξη τους μετακινείται μόνη της
const NIGHT_TIP =
  'Όταν έχει βραδινή εκπαίδευση, η μέρα δεν μετρά στη στέρηση εξόδου (όπως και οι μέρες με υπηρεσία): η λήξη μετακινείται μία μέρα. Δεν αλλάζει τους εξοδούχους.';

/** The «Εξοδούχοι» page: header with day and night training, hours of the day, notices, bar, toolbars, list, dialog. */
export function OutsScreen() {
  const o = useOuts();
  const { date, nav } = o;
  return (
    <div>
      <PageHeader
        title={'Εξοδούχοι ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)}
        sub="Διάλεξε ποιοι βγαίνουν και ποιοι με ΔΝ· όσοι έχουν ⚠ βγαίνουν μόνο με επιβεβαίωση."
      >
        <div className="page-head__acts">
          <DateBar value={date} onChange={(d: string) => nav.set({ outDate: d })} days={o.outDays} />
          <label className="strict-sw" data-tip={NIGHT_TIP} data-tip-side="bottom">
            <input
              type="checkbox"
              className="ui-check"
              checked={o.night}
              onChange={(e) => o.setNight(e.target.checked)}
            />
            Βραδινή εκπαίδευση
          </label>
        </div>
      </PageHeader>
      <OutsDayBar date={date} />
      {pendAlerts(o)}
      {roomsAlert(o)}
      {backsBox(o)}
      {outsBar(o)}
      {roomBar(o)}
      {findBar(o)}
      {outsList(o)}
      <p className="note" style={{ margin: '8px 0 0' }}>
        <TemplateNote ids={['outs']} />
      </p>
      {o.confirm && confirmDialog(o)}
    </div>
  );
}
