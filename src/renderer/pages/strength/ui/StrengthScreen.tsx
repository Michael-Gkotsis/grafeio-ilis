// Screen «Δύναμη»: four counters that add up (Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη) and the groups below them.
// Purpose: `StrengthScreen`, route `strength`.
// Does NOT: hold state (model/useStrength.ts) or the filter rules (model/view.ts).
// Owner layer: renderer/pages/strength. Why: moved from screens/other.ts (Phase 6); htm became TSX with the same
//   markup, text nodes, keys and hook order.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts.
import { cx } from '../../../shared/lib/cx';
import { ActiveFilter, Button, Card, DateBar, PageHeader, Strip } from '../../../shared/ui';
import { DOW_GEN, dmy, parseD } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import type { SvCat } from '../../../../shared/strengthView';
import { useStrength } from '../model/useStrength';
import { SvRows } from './SvRows';

/** The «Δύναμη» page: counters, the sum line, search and platoon filter, and the cards with their groups. */
export function StrengthScreen() {
  const s = useStrength();
  const { v, date, today, tomorrow, cat, q, setQ, dq, unit, setUnit, units, filtering, nav } = s;
  const card = (c: SvCat | '', l: string, n: number, tip: string) => (
    <button
      type="button"
      className={cx('kpi', 'kpi--sv')}
      aria-pressed={cat === c}
      data-tip={tip}
      onClick={() => s.pick(c)}
    >
      <span className="kpi__l">{l}</span>
      <span className="kpi__n">{n}</span>
    </button>
  );
  return (
    <div>
      <PageHeader
        title={'Δύναμη ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)}
        sub="Βγαίνει μόνη της από ιατρικά, άδειες, εξόδους και ποινές."
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
          <Button size="sm" variant="outline" onClick={() => nav.go('hkai', { hkaiDate: date })}>
            {HK()}
          </Button>
        </div>
      </PageHeader>
      <div className="kpis kpis--sv">
        {card(
          '',
          'Δύναμη',
          v.total,
          'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη. Πάτα για να δεις όλους',
        )}
        {card(
          'present',
          'Παρόντες',
          v.present,
          'Παρόντες που δεν είναι κωλυόμενοι. Μέσα και όσοι έχουν δική μας υπηρεσία, ΕΥ, ποινή ή ιατρικό',
        )}
        {card(
          'kol',
          'Κωλυόμενοι',
          v.kol,
          'Δηλωμένοι κωλυόμενοι (π.χ. υπηρεσία ΣΤΕΠ) και εισαγωγές ΣΤΕΠ, που αφαιρούνται από τους παρόντες',
        )}
        {card('away', 'Απόντες', v.absent, 'Άδειες, νοσοκομείο, έξοδος και ΔΝ· κάθε άτομο μία φορά')}
      </div>
      <p className="svline">
        <span className="num">
          <b>{v.present}</b> + <b>{v.kol}</b> + <b>{v.absent}</b> = <b>{v.total}</b>
        </span>{' '}
        <span className="muted">
          · στις {v.time}
          {date === today ? ' (όποιος γύρισε ως τώρα είναι παρών)' : ''}
        </span>
      </p>
      <p className="note svnote">
        Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, κάθε άτομο μία φορά. Κωλυόμενοι είναι όσοι δηλώθηκαν και αφαιρούνται
        από τους παρόντες, και όσοι έχουν εισαγωγή ΣΤΕΠ (αυτόματα)· όσοι έχουν δική μας υπηρεσία, ΕΥ ή ποινή μένουν
        στους Παρόντες. Η {HK()} μετρά τους κωλυόμενους με δικό της ορισμό.
      </p>
      <div className="toolbar">
        <input
          type="search"
          className="ui-input"
          aria-label="Αναζήτηση"
          placeholder="Επώνυμο ή όνομα (χωρίς τόνους)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {units.length > 1 && (
          <Strip className="chips" role="group" aria-label="Ουλαμός">
            <button type="button" className="ui-chip" aria-pressed={!unit} onClick={() => setUnit('')}>
              Όλοι
            </button>
            {units.map((u) => (
              <button
                key={u}
                type="button"
                className="ui-chip"
                aria-pressed={unit === u}
                onClick={() => setUnit(unit === u ? '' : u)}
              >
                {u}
              </button>
            ))}
          </Strip>
        )}
        <ActiveFilter parts={[cat && v.cats[cat].label, unit, dq.trim() && '«' + dq.trim() + '»']} onClear={s.clear} />
      </div>
      <div className="stack">
        {s.vis.map((g) => (
          <Card
            key={g.cat}
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
        ))}
      </div>
    </div>
  );
}
