// The «Έλεγχος υπηρεσιών» tab: who did how many duties, as a sortable list or as the monthly grid of the Excel.
// Purpose: `DutyCheck`, a card with the list (per kind, total, holidays, last duty, idle days) or the grid preview.
// Does NOT: hold state (model/useDutyCheck.ts), the rules (model/checkView.ts) or write the Excel (the export button
//   of the widget does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); parts are plain functions
//   called as `{part(c)}` so the render count is the one the tab always had.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { dm, MONTHS } from '../../../../shared/dates';
import { isHol, type DutyStat } from '../../../../shared/rules';
import { norm } from '../../../../shared/text';
import { RkName, rkFull } from '../../../entities/person';
import { ExcelSheet } from '../../../widgets/excel-preview';
import { ExportButton } from '../../../widgets/export';
import { ActiveFilter, Badge, Card, MonthField, Segmented, VirtualList, type ValueEvent } from '../../../shared/ui';
import { checkLayout, kindLabel, monLbl, type CheckRow } from '../model/checkView';
import { useDutyCheck, type DutyCheckModel } from '../model/useDutyCheck';
import type { DutyMonth } from '../model/useDutyMonth';
import { MonthSelect } from './MonthSelect';

/** Props of {@link DutyCheck}. */
export interface DutyCheckProps {
  onOpen: (pid: number) => void;
  /** The month state of the screen. */
  m: DutyMonth;
}

type Check = DutyCheckModel & { m: DutyMonth; mon: string };

const GRID_NOTE =
  'Γκρι στήλες: ΣΚ και αργίες, από το ημερολόγιο. Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ. ' +
  'Στο Excel γράφεται και ο λόγος απουσίας.';

// Header button that sorts by its column (click again: reversed).
function sortHead(c: Check, k: string, l: string, tip?: string) {
  const { sk, setSk } = c;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM: aria-sort on the sort button as before
    <button
      type="button"
      className="chk__sort"
      data-tip={tip}
      aria-sort={sk?.k === k ? (sk.dir > 0 ? 'ascending' : 'descending') : 'none'}
      onClick={() => setSk(sk?.k === k ? { k, dir: -sk.dir } : { k, dir: k === 'name' ? 1 : -1 })}
    >
      {l}
      {sk?.k === k ? (sk.dir > 0 ? ' ▲' : ' ▼') : ''}
    </button>
  );
}

function gridTools(c: Check) {
  const { q, setQ, ym, setYm, setAllM, mon } = c;
  return (
    <>
      <input
        type="search"
        className="ui-input"
        style={{ width: '240px' }}
        aria-label="Αναζήτηση στο πλέγμα"
        placeholder="Όνομα (χωρίς τόνους) · Ctrl+F"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <MonthField
        aria-label="Μήνας"
        style={{ width: '170px' }}
        value={ym}
        onChange={(e: ValueEvent) => {
          if (e.target.value) {
            setYm(e.target.value);
            setAllM(false);
          }
        }}
      />
      <ExportButton kind="check" date={ym + '-01'} label={'Έλεγχος υπηρεσιών ' + mon} size="sm" />
    </>
  );
}

function listToolbar(c: Check) {
  const { q, setQ, dq, hol, setHol, setSk, rows, m } = c;
  return (
    <div className="toolbar" style={{ marginBottom: 0 }}>
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση στον έλεγχο"
        placeholder="Όνομα (χωρίς τόνους) · Ctrl+F"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <MonthSelect m={m} />
      <Segmented
        value={hol ? 'hol' : 'all'}
        onChange={(v: string) => {
          setSk(null);
          setHol(v === 'hol');
        }}
        items={[
          {
            value: 'all',
            label: 'Σειρά δικαιοσύνης',
            tip: 'Περισσότερες μέρες χωρίς υπηρεσία, μετά λιγότερες συνολικά, μετά λιγότερες αργίες',
          },
          { value: 'hol', label: 'Λιγότερες αργίες' },
        ]}
      />
      <ActiveFilter parts={[dq && '«' + dq + '»']} onClear={() => setQ('')} />
      <span className="toolbar__count">{rows.length} άτομα</span>
    </div>
  );
}

// One row: name, one number per kind, total, holidays, last duty (★ = weekend or holiday), idle days.
function checkRow(c: Check, cols: string, onOpen: DutyCheckProps['onOpen']) {
  const { state, kinds } = c;
  return (r: CheckRow, _i: number, style: object) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: frozen DOM: the row is clicked, no key handler, as before
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="button" as before
    <div
      key={r.p.id}
      className="chk__row"
      style={{ ...style, gridTemplateColumns: cols }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(r.p.id)}
    >
      <span data-tip={rkFull(r.p)}>
        <RkName p={r.p} />
      </span>
      {kinds.map((k) => (
        <span key={k} className="num">
          {(r.d as DutyStat).byKind[k] || '·'}
        </span>
      ))}
      <span className="num tot">{r.d.total}</span>
      <span className="num hol">{r.d.hol}</span>
      <span className="num last">
        {r.d.last ? dm(r.d.last) : '—'}
        {r.d.last && isHol(state.settings, r.d.last) ? ' ★' : ''}
      </span>
      <span className="num">{r.idle === 9999 ? '—' : r.idle}</span>
    </div>
  );
}

function checkList(c: Check, onOpen: DutyCheckProps['onOpen']) {
  const { state, kinds, rows } = c;
  // Columns: name (sticks left), one per service, Σύν., Αργ., Τελευταία, Μέρες; with many services it scrolls inside.
  const lay = checkLayout(kinds.map((k) => kindLabel(state, k)));
  return (
    <div>
      {listToolbar(c)}
      <div className="chk">
        <VirtualList
          items={rows}
          rowHeight={36}
          height={380 + lay.head}
          headHeight={lay.head}
          minWidth={lay.min}
          head={
            <div className="chk__head" style={{ gridTemplateColumns: lay.cols }}>
              {sortHead(c, 'name', 'Ονοματεπώνυμο')}
              {kinds.map((k) => (
                <span key={k}>{sortHead(c, k, kindLabel(state, k), kindLabel(state, k))}</span>
              ))}
              {sortHead(c, 'total', 'Σύν.')}
              {sortHead(c, 'hol', 'Αργ.', 'Υπηρεσίες σε ΣΚ ή επίσημη αργία')}
              {sortHead(c, 'last', 'Τελευταία')}
              {sortHead(c, 'idle', 'Μέρες', 'Μέρες χωρίς υπηρεσία')}
            </div>
          }
          renderRow={checkRow(c, lay.cols, onOpen)}
        />
      </div>
    </div>
  );
}

/** The tab: a card with the list/grid switch, the table or the sheet and the note. */
export function DutyCheck({ onOpen, m }: DutyCheckProps) {
  const model = useDutyCheck(m);
  const { view, setView, grid, ym, allM } = model;
  const mon = MONTHS[+ym.slice(5) - 1];
  const c: Check = { ...model, m, mon };
  return (
    <Card
      title="Έλεγχος υπηρεσιών"
      actions={
        <Badge
          tone="ok"
          data-tip="Βγαίνει από το ημερολόγιο υπηρεσιών (ποιος, ποια μέρα, ποια θέση) (Κ-03)"
          data-tip-side="left"
        >
          Ενημερώνεται αυτόματα
        </Badge>
      }
    >
      <div className="toolbar">
        <Segmented
          value={view}
          onChange={setView}
          items={[
            { value: 'list', label: 'Λίστα' },
            { value: 'grid', label: 'Μηνιαίο πλέγμα (Excel)' },
          ]}
        />
        {view === 'grid' && gridTools(c)}
      </div>
      {view === 'grid' ? (
        <ExcelSheet
          model={grid!}
          fileName={'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(mon) + '.xlsx'}
          sheetName="ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ"
          meta="A4 οριζόντιο"
          footer={GRID_NOTE}
        />
      ) : (
        checkList(c, onOpen)
      )}
      <p className="note" style={{ margin: '8px 0 0' }}>
        {view === 'list' && !allM ? monLbl(ym) + ': μετρούν μόνο οι υπηρεσίες του μήνα, χωρίς τις προηγούμενες. ' : ''}
        Κάθε υπηρεσία κρατιέται με την ημερομηνία της (★ = ΣΚ ή αργία). Πάτα σε άτομο για όλο το ημερολόγιο.
      </p>
    </Card>
  );
}
