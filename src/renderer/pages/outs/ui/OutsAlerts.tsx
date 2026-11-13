// The notices above the «Εξοδούχοι» list: ΔΝ with an undeclared return day, the room proposal, and who comes back.
// Purpose: `pendAlerts`, `roomsAlert`, `backsBox`: plain functions that return the markup, called as `{pendAlerts(o)}`
//   so the screen's render count does not change (they are not components).
// Does NOT: hold state (model/useOuts.ts) or decide anything (model/view.ts).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { Alert, Badge, Button } from '../../../shared/ui';
import { ReturnsList } from '../../../widgets/returns-list';
import { dayName, parseD } from '../../../../shared/dates';
import { theDay } from '../../../../shared/returns';
import type { Outs } from '../model/useOuts';
import { roomsTxt } from '../model/view';

/** One warning per day whose ΔΝ return is not known because the next day is not declared. */
export const pendAlerts = (o: Outs) =>
  o.pendDays.map(([d, who]) => (
    <Alert key={d} tone="warn">
      <span>
        <b>Δεν έχει δηλωθεί {theDay(d)}</b>
        {' και δεν έχει εκπαίδευση το πρωί, οπότε δεν ξέρουμε πότε γυρνούν ('}
        {who.join(', ')}
        {'). Δήλωσε τους εξοδούχους εκείνης της μέρας ή άλλαξε το «Αύριο εκπαίδευση». '}
        <Button size="sm" variant="secondary" onClick={() => o.nav.set({ outDate: d })}>
          Άνοιγμα {dayName(d, o.today).toLowerCase()}
        </Button>
      </span>
    </Alert>
  ));

/** Saturday and Sunday: the rooms that go out (Κ-16) and the button that proposes them. */
export const roomsAlert = (o: Outs) =>
  o.rooms ? (
    <Alert tone="info">
      <span>
        {parseD(o.date).getDay() === 6 ? 'Σάββατο' : 'Κυριακή'}
        {': βγαίνουν οι '}
        <b>θάλαμοι {roomsTxt(o.rooms)}</b>
        {', μένουν οι υπόλοιποι (Κ-16). '}
        <Button size="sm" variant="secondary" onClick={o.byRooms}>
          Πρότεινε θαλάμους {roomsTxt(o.rooms)}
        </Button>
      </span>
    </Alert>
  ) : null;

/** «Ποιοι γυρίζουν και πότε»: the folded list of who is away and when they come back. */
export const backsBox = (o: Outs) => (
  <details className="note backs-box">
    <summary>
      Ποιοι γυρίζουν και πότε <span className="cnt">{o.backN}</span>
      {o.backEarly ? (
        <>
          {' '}
          <Badge tone="bad">κάποιοι για υπηρεσία</Badge>
        </>
      ) : null}
      {o.pendDays.length ? (
        <>
          {' '}
          <Badge tone="warn">να δηλωθεί η επόμενη μέρα</Badge>
        </>
      ) : null}
      <button
        type="button"
        className="linkish backs-box__all"
        onClick={(e) => {
          e.preventDefault();
          o.nav.go('strength', { strengthDate: o.date });
        }}
        data-tip="Όλοι με το πότε γυρνούν: παρόντες, κωλυόμενοι, απόντες"
      >
        Όλοι στη Δύναμη →
      </button>
    </summary>
    <ReturnsList date={o.date} fixable={true} />
  </details>
);
