// The tab «Ποιος κάνει τι»: one row per soldier, one column per duty, and the weekdays he does duties on.
// Purpose: `WhoDoes`, the table with search, filters and the «Να κάνει παρ’ όλα αυτά» question.
// Does NOT: hold state (model/useWhoDoes.ts), the rules (model/whoView.ts) or one row's markup (ui/WhoRow.tsx).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/whodoes.ts (Phase 6); only the Υπηρεσίες screen
//   shows it. Nothing is forbidden: by hand a person is always placed, with a confirmation.
// Covering test: test/screens-main.test.ts, test/perf.test.ts, test/guard-page-view.test.ts.
import type { ChangeEvent, CSSProperties } from 'react';
import { dutyStartOf, shortName, unitOf, WEEK, type Person } from '../../../../shared/domain';
import type { ISODate } from '../../../../shared/dates';
import { cx } from '../../../shared/lib/cx';
import {
  ActiveFilter,
  Button,
  Dialog,
  GoLink,
  Segmented,
  Select,
  Strip,
  VirtualList,
  type ValueEvent,
} from '../../../shared/ui';
import { rkShort } from '../../../entities/person';
import { colTip, DAY2, FILTERS } from '../model/whoView';
import { useWhoDoes, type WhoModel } from '../model/useWhoDoes';
import { WhoRow } from './WhoRow';

/** Props of {@link WhoDoes}. */
export interface WhoDoesProps {
  /** ISODate, the day on screen (for the status hint). */
  date: ISODate;
  /** Open with only this soldier (a name clicked in «Δεν μπαίνουν»). */
  pid?: number | null;
}

const LEGEND_TAIL =
  ' κάνει παρά τη Σ.Ι./το πόστο · μέρα με γραμμή: καμία υπηρεσία εκείνη τη μέρα.\n' +
  '      Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση· με το χέρι μπαίνει πάντα, με επιβεβαίωση. ' +
  'Οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν πάντα στην κενή θέση, με προειδοποίηση. ' +
  'Κάθε νέα υπηρεσία («+ Νέα υπηρεσία») γίνεται μόνη της στήλη εδώ.';

function toolbar(w: WhoModel) {
  const { state, q, setQ, setOnly, unit, setUnit, room, setRoom, UNITS, rooms } = w;
  return (
    <div className="toolbar">
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση στρατιώτη"
        placeholder="Όνομα, ΑΣΜ, θάλαμος, Σ.Ι., πόστο (χωρίς τόνους) · Ctrl+F"
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setQ(e.target.value);
          setOnly(null);
        }}
      />
      <Segmented
        small={true}
        value={unit}
        onChange={(u: string) => {
          setUnit(u);
          if (room != null && u !== 'all' && unitOf({ room }, state.settings) !== u) setRoom(null);
        }}
        items={UNITS}
      />
      <Select
        className="ui-select"
        aria-label="Θάλαμος"
        value={room == null ? '' : String(room)}
        onChange={(e: ValueEvent) => {
          const r = e.target.value ? +e.target.value : null;
          setRoom(r);
          if (r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit) setUnit('all');
        }}
      >
        <option value="">Όλοι οι θάλαμοι</option>
        {rooms.map(([r, n]) => (
          <option key={r} value={String(r)}>
            Θάλαμος {r} · {n}
          </option>
        ))}
      </Select>
    </div>
  );
}

function filters(w: WhoModel) {
  const { filter, setFilter, counts, onlyP, unit, room, colLbl, dq, clear, rows } = w;
  return (
    <div className="filters">
      <Strip role="group" aria-label="Φίλτρα">
        {FILTERS.map(([k, l, tip]) => (
          <button
            key={k}
            type="button"
            className="ui-chip"
            aria-pressed={filter === k}
            data-tip={tip}
            onClick={() => setFilter(filter === k ? 'all' : k)}
          >
            {l}
            <span className="cnt">{counts[k]}</span>
          </button>
        ))}
      </Strip>
      <ActiveFilter
        parts={[
          onlyP && shortName(onlyP),
          unit !== 'all' && unit,
          room != null && 'Θάλαμος ' + room,
          filter !== 'all' && FILTERS.find((f) => f[0] === filter)![1],
          colLbl,
          dq.trim() && '«' + dq.trim() + '»',
        ]}
        onClear={clear}
      />
      <span className="toolbar__count">
        {rows.length} {rows.length === 1 ? 'άτομο' : 'άτομα'}
      </span>
    </div>
  );
}

// The header row of the table: one button per duty (click: only those who do not do it) and the weekdays.
function head(w: WhoModel) {
  const { state, cols, grid, colF, setColF, colN } = w;
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, the header row is not focusable
    <div className="ptable__head whod__head" role="row" style={{ gridTemplateColumns: grid }}>
      <span>Στρατιώτης</span>
      {cols.map((c, i) => (
        <button
          key={c.key}
          type="button"
          className="whod__colhd"
          aria-pressed={colF === c.key}
          data-tip={colTip(c, state.settings) + '. Πάτα: μόνο όσοι δεν κάνουν ' + c.label.toLowerCase()}
          onClick={() => setColF(colF === c.key ? null : c.key)}
        >
          <span className="whod__lbl">{c.short}</span>
          <small className={cx(colN[i] > 0 && 'has-n')}>{colN[i] ? 'όχι ' + colN[i] : 'όλοι'}</small>
        </button>
      ))}
      <span
        className="whod__dayhd"
        data-tip={
          'Μέρες που κάνει υπηρεσία (καμία υπηρεσία τις άλλες). Μετρά η μέρα που ξεκινά η υπηρεσία, ' +
          dutyStartOf(state.settings) +
          '.'
        }
      >
        <span>Μέρες υπηρεσίας</span>
        <small>
          {WEEK.map((d) => (
            <i key={d}>{DAY2(d)}</i>
          ))}
        </small>
      </span>
      <span />
    </div>
  );
}

function table(w: WhoModel) {
  const { cols, rows, height, whodHead, filter, dq, unit, room, colF, only, hintOf, ownOf, cells, grid, lists } = w;
  const { act, openP } = w;
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="table" as before
    <div className="ptable ptable--whod" role="table" aria-rowcount={rows.length}>
      <VirtualList
        className="whod__body"
        items={rows}
        rowHeight={46}
        height={height + whodHead}
        headHeight={whodHead}
        minWidth={190 + cols.length * 80 + 246}
        head={head(w)}
        resetKey={filter + '|' + dq + '|' + unit + '|' + room + '|' + colF + '|' + only}
        renderRow={(p: Person, i: number, style: CSSProperties) => {
          const h = hintOf(p);
          return (
            <WhoRow
              key={p.id}
              p={p}
              style={style}
              own={ownOf(p)}
              cols={cols}
              cells={cells.get(p.id)!}
              odd={i % 2 === 1}
              grid={grid}
              hintTxt={h?.txt}
              hintTip={h?.tip}
              hintBad={h?.bad}
              lists={lists}
              onCell={act.cell}
              onDay={act.day}
              onReset={act.reset}
              onOpen={openP}
            />
          );
        }}
      />
    </div>
  );
}

function body(w: WhoModel) {
  const { cols, rows, people, clear } = w;
  if (!cols.length)
    return <div className="ui-card empty">Δεν υπάρχουν υπηρεσίες στα έντυπα (εκτός από Λ/Υ και Δ/Υ).</div>;
  if (rows.length === 0)
    return (
      <div className="ui-card empty">
        {people.length ? (
          <>
            {'Κανείς δεν ταιριάζει. '}
            <Button variant="link" onClick={clear}>
              Καθάρισε αναζήτηση και φίλτρα
            </Button>
          </>
        ) : (
          'Δεν υπάρχει κανείς σε δύναμη.'
        )}
      </div>
    );
  return table(w);
}

function legend() {
  return (
    <p className="note whod__legend">
      <b>✓</b>
      {' κάνει · '}
      <b className="whod__lg is-off">✕</b>
      {' δεν κάνει (το όρισες εσύ) · '}
      <b className="whod__lg is-auto">—</b>
      {' δεν κάνει λόγω Σ.Ι. ή πόστου ('}
      <GoLink view="templates" params={{ tab: 'duty', dsub: 'si' }}>
        Ρυθμίσεις › Σ.Ι.
      </GoLink>
      {') · '}
      <b className="whod__lg is-force">✓!</b>
      {LEGEND_TAIL}
    </p>
  );
}

function askDialog(w: WhoModel) {
  const { ask, setAsk, setCap } = w;
  if (!ask) return null;
  return (
    <Dialog
      title={'Να κάνει ' + ask.col.label.toLowerCase() + ' ο ' + rkShort(ask.p) + ';'}
      description={'Κανονικά δεν μπαίνει: ' + ask.why + '.'}
      onClose={() => setAsk(null)}
      footer={
        <>
          <Button variant="outline" onClick={() => setAsk(null)}>
            Άκυρο
          </Button>
          <Button
            data-autofocus=""
            onClick={() => {
              const a = ask;
              setAsk(null);
              setCap(a.p, a.col, 'on', 'κάνει ' + a.col.label.toLowerCase() + ' παρά το «' + a.why + '»');
            }}
          >
            Να κάνει παρ’ όλα αυτά
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Ισχύει μόνο για αυτόν και μόνο για {ask.col.label.toLowerCase()}. Φαίνεται με <b>✓!</b> και αναιρείται με ένα
        κλικ ή Ctrl+Z.
      </p>
    </Dialog>
  );
}

/** The tab. */
export function WhoDoes({ date, pid }: WhoDoesProps) {
  const w = useWhoDoes(date, pid);
  return (
    <div className="whod">
      {toolbar(w)}
      {filters(w)}
      {body(w)}
      {legend()}
      {askDialog(w)}
    </div>
  );
}
