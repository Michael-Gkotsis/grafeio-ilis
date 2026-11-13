// Screen «Δύναμη»: one KPI strip that adds up (Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη) and the groups below it.
// Purpose: `StrengthScreen`, route `strength`.
// Does NOT: hold state (model/useStrength.ts) or the filter rules (model/view.ts).
// Owner layer: renderer/pages/strength. Why: moved from screens/other.ts (Phase 6); htm became TSX with the same
//   text nodes, keys and hook order; U12 gave it its own `strength__*` look.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts.
import { useState } from 'react';
import { ActiveFilter, Button, Card, DateBar, PageHeader, Strip } from '../../../shared/ui';
import { DOW_FULL, dmy, parseD } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import { useStrength } from '../model/useStrength';
import { StrengthKpis } from './StrengthKpis';
import { SvRows } from './SvRows';

/** The «Δύναμη» page: counters, the sum line, search and platoon filter, and the cards with their groups. */
export function StrengthScreen() {
  const s = useStrength();
  const { v, date, today, tomorrow, cat, q, setQ, dq, unit, setUnit, units, filtering, nav } = s;
  const [how, setHow] = useState(false);
  return (
    <div className="strength-page">
      <PageHeader
        title="Δύναμη"
        sub={
          DOW_FULL[parseD(date).getDay()] +
          ' ' +
          dmy(date) +
          ' στις ' +
          v.time +
          (date === today ? ' · όποιος γύρισε ως τώρα είναι παρών' : '')
        }
      >
        <div className="page-head__acts">
          <DateBar value={date} onChange={(d: string) => nav.set({ strengthDate: d })} days={[today, tomorrow]} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => nav.declare({ cat: 'kol', from: date, to: date })}
            data-tip="Υπηρεσία εκτός δικών μας, π.χ. ΣΤΕΠ"
          >
            + Κωλυόμενος
          </Button>
          <Button size="sm" variant="link" onClick={() => nav.go('hkai', { hkaiDate: date })}>
            {HK()}
          </Button>
        </div>
      </PageHeader>
      <StrengthKpis v={v} cat={cat} onPick={s.pick} />
      <div className="strength__bar">
        <input
          type="search"
          className="ui-input strength__search"
          aria-label="Αναζήτηση"
          placeholder="Επώνυμο ή όνομα (χωρίς τόνους)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {units.length > 1 && (
          <Strip className="strength__seg" role="group" aria-label="Ουλαμός">
            <button type="button" className="strength__segbtn" aria-pressed={!unit} onClick={() => setUnit('')}>
              Όλοι
            </button>
            {units.map((u) => (
              <button
                key={u}
                type="button"
                className="strength__segbtn"
                aria-pressed={unit === u}
                onClick={() => setUnit(unit === u ? '' : u)}
              >
                {u}
              </button>
            ))}
          </Strip>
        )}
        <ActiveFilter parts={[cat && v.cats[cat].label, unit, dq.trim() && '«' + dq.trim() + '»']} onClear={s.clear} />
        <button
          type="button"
          className="strength__how-btn"
          aria-expanded={how}
          aria-controls="strength-how"
          onClick={() => setHow(!how)}
        >
          Πώς μετράει;
        </button>
      </div>
      {how && (
        <div className="strength__how" id="strength-how">
          <p>Βγαίνει μόνη της από ιατρικά, άδειες, εξόδους και ποινές.</p>
          <p>
            Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, κάθε άτομο μία φορά. Κωλυόμενοι είναι όσοι δηλώθηκαν και
            αφαιρούνται από τους παρόντες, και όσοι έχουν εισαγωγή ΣΤΕΠ (αυτόματα)· όσοι έχουν δική μας υπηρεσία, ΕΥ ή
            ποινή μένουν στους Παρόντες. Η {HK()} μετρά τους κωλυόμενους με δικό της ορισμό.
          </p>
        </div>
      )}
      <div className="strength__groups">
        {s.vis.map((g) => (
          <div key={g.cat} className={'strength__cell strength__cell--' + g.cat}>
            <Card
              title={g.label + ' · ' + g.shown + (filtering ? ' από ' + g.n : '')}
              open={s.isOpen(g.cat)}
              onToggle={() => s.toggle(g.cat)}
              summary={g.groups.length ? g.groups.map((x) => x.label + ' ' + x.rows.length).join(' · ') : 'Κανείς'}
            >
              {g.groups.length ? (
                g.groups.map((x) => <SvRows key={x.key} g={x} onOpen={(id: number) => nav.openPerson(id, s.ids())} />)
              ) : (
                <div className="empty">{filtering ? 'Κανείς με αυτά τα φίλτρα.' : 'Κανείς.'}</div>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
