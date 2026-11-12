// «Ρυθμίσεις › Υπηρεσίες και αργίες › Αργίες» card: the official holidays, the ones removed, and the unit's own.
// Purpose: `HolidaysCard` (10 §4β): remove the holiday that does not apply to the unit and add a local one.
// Does NOT: hold state (model/useHolidays.ts) or the rules (model/holidaysView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The two lists are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-holidays-view.test.ts.
import type { ChangeEvent } from 'react';
import { dmy, dow } from '../../../../../shared/dates';
import { missingOf } from '../../../../shared/lib/missingOf';
import { Badge, Button, Card, DateField, type ValueEvent } from '../../../../shared/ui';
import type { HolidayRow } from '../../model/holidaysView';
import { useHolidays } from '../../model/useHolidays';

type HolidaysModel = ReturnType<typeof useHolidays>;

/** One holiday: day, name, official or own, and its button. */
function holidayItem(m: HolidaysModel, x: HolidayRow) {
  const { today, drop } = m;
  return (
    <li key={x.k} className={x.k < today ? 'muted' : ''}>
      <span className="nw">
        {dow(x.k)} {dmy(x.k)}
      </span>{' '}
      <b>{x.v}</b> {x.gen ? <Badge>επίσημη</Badge> : <Badge tone="info">δική σου</Badge>}{' '}
      {x.gen ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => drop(x)}
          data-tip="Δεν μετρά ως αργία για τη μονάδα (επαναφέρεται από κάτω)"
        >
          Δεν ισχύει για εμάς
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          aria-label={'Διαγραφή ' + x.v}
          data-tip="Διαγραφή (με αναίρεση)"
          onClick={() => drop(x)}
        >
          ✕
        </Button>
      )}
    </li>
  );
}

/** The official holidays the unit removed, with «Επαναφορά». */
function removedList(m: HolidaysModel) {
  const { removed, restore } = m;
  return (
    <details className="note">
      <summary>Επίσημες που δεν ισχύουν για εμάς ({removed.length})</summary>
      <ul className="hist">
        {removed.map(([k, v]) => (
          <li key={k}>
            <span className="nw">
              {dow(k)} {dmy(k)}
            </span>{' '}
            {v}{' '}
            <Button size="sm" variant="ghost" onClick={() => restore(k, v)}>
              Επαναφορά
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The form for an own holiday. */
function addForm(m: HolidaysModel) {
  const { d, setD, n, setN, add } = m;
  return (
    <div className="field-row" style={{ alignItems: 'flex-end' }}>
      <div className="field">
        <label className="field__label" htmlFor="hol-d">
          Ημερομηνία
        </label>
        <DateField id="hol-d" className="ui-input" value={d} onChange={(e: ValueEvent) => setD(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="hol-n">
          Όνομα
        </label>
        <input
          id="hol-n"
          className="ui-input"
          placeholder="π.χ. Τοπική εορτή"
          value={n}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setN(e.target.value)}
        />
      </div>
      <div className="field" style={{ flex: 0 }}>
        <Button
          disabled={!d || !n.trim()}
          why={missingOf([
            ['Ημερομηνία', d],
            ['Όνομα', n.trim()],
          ])}
          onClick={add}
        >
          Πρόσθεσε
        </Button>
      </div>
    </div>
  );
}

/** «Αργίες». */
export function HolidaysCard() {
  const m = useHolidays();
  const { list, past, old, setOld, removed } = m;
  return (
    <Card title="Αργίες">
      <p className="note" style={{ marginTop: 0 }}>
        Σάββατο και Κυριακή μετρούν πάντα ως αργία. Οι επίσημες αργίες (και οι κινητές από το Πάσχα) μπαίνουν μόνες τους
        κάθε χρονιά· αφαίρεσε όποια δεν ισχύει για τη μονάδα και πρόσθεσε δικές σου. Μετρούν στον έλεγχο υπηρεσιών και
        στον κανόνα «όχι αργία δύο φορές στη σειρά».
      </p>
      <ul className="hist">{list.map((x) => holidayItem(m, x))}</ul>
      {past > 0 && (
        <Button variant="link" onClick={() => setOld(!old)}>
          {old ? 'Κρύψε τις παλιές' : 'Δείξε και τις παλιές (' + past + ')'}
        </Button>
      )}
      {removed.length > 0 && removedList(m)}
      {addForm(m)}
    </Card>
  );
}
