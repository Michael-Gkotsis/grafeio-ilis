// The «Λίστα» tab of the «Δυναμολόγιο»: header with the exports, search and filters, and the soldiers table.
// Purpose: `PeopleList`, the daily list of ~240 soldiers (a table on desktop, cards on a phone) with its dialogs.
// Does NOT: hold state (model/usePeople.ts), hold the rules (model/view.ts) or draw one soldier (ui/PersonRow.tsx).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6); htm became TSX with the
//   same markup, text nodes, keys and hook order. The parts are plain functions called as `{part(m)}`, not components,
//   so the React render counts stay as they were.
// Covering test: test/screens-main.test.ts (HTML snapshot), test/perf.test.ts, test/layout-fit.test.ts,
//   test/people-page-view.test.ts.
import type { ChangeEvent } from 'react';
import type { Person, SavedView } from '../../../../shared/domain';
import type { Sig } from '../../../../shared/sigs';
import { HK } from '../../../../shared/unit';
import { NewPersonDialog } from '../../../features/person-edit';
import { QuickAddDialog } from '../../../features/quick-add';
import { cx } from '../../../shared/lib/cx';
import {
  ActiveFilter,
  Button,
  Icon,
  PageHeader,
  Segmented,
  Select,
  Strip,
  VirtualList,
  type ValueEvent,
} from '../../../shared/ui';
import { SigsMenu } from '../../../widgets/export';
import { ROSTER_FILTERS } from '../../../../shared/rosterLists';
import { dayName } from '../../../../shared/dates';
import { usePeople } from '../model/usePeople';
import { HEAD_KEYS, ariaSort, chipTip, colsOf, gridOf, nextSort, peopleSub, sortArrow } from '../model/view';
import { PersonCard, PersonRow } from './PersonRow';
import { SaveViewDialog } from './SaveViewDialog';

type PeopleModel = ReturnType<typeof usePeople>;

// The page header: title, the counts line and the buttons that add, import, export and declare.
function header(m: PeopleModel) {
  const { nav, narrow, xl, total, today, setAdding, exportXl, printRoster } = m;
  return (
    <PageHeader title="Δυναμολόγιο" sub={peopleSub(total)}>
      <Button
        variant="outline"
        onClick={() => setAdding('one')}
        data-tip="Γράφεται και στο Δυναμολόγιο, αν έχει οριστεί στα Αρχεία Excel"
      >
        {narrow ? '+ Στρατιώτης' : '+ Νέος στρατιώτης'}
      </Button>
      <Button
        variant="outline"
        onClick={() => nav.go('templates', { tab: 'import' })}
        data-tip="Από το Excel του Δυναμολογίου (Ρυθμίσεις › Εισαγωγή Δυναμολογίου)"
      >
        {narrow ? 'Εισαγωγή' : 'Εισαγωγή Δυναμολογίου'}
      </Button>
      <Button
        variant="outline"
        disabled={xl}
        onClick={() => exportXl()}
        data-tip="Ένα Excel με ένα φύλλο για κάθε φίλτρο: Δυναμολόγιο, Άδειες, Τιμωρημένοι, Πόστα, Εκτός δύναμης, Δικαίωμα ΔΝ"
      >
        {xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}
      </Button>
      <Button
        variant="outline"
        disabled={xl}
        onClick={() => printRoster()}
        aria-label="Εκτύπωση"
        data-tip={'Συνολικό Δυναμολόγιο (όλοι σε δύναμη) με την κεφαλίδα της ' + HK() + '· βγαίνει και Excel'}
      >
        {Icon.print}
        {!narrow && 'Εκτύπωση'}
      </Button>
      <SigsMenu
        form="roster"
        date={today}
        label="το Δυναμολόγιο"
        disabled={xl}
        go={(pr: boolean, sigs?: Sig[]) => (pr ? printRoster(sigs) : exportXl(sigs))}
      />
      <Button
        onClick={() => nav.declare({})}
        data-tip="Ιατρικά, άδεια, έξοδος, ΔΝ, ποινή… (Ctrl+N)"
        data-tip-side="left"
      >
        {narrow ? '+ Κατάσταση' : '+ Δήλωσε κατάσταση'}
      </Button>
    </PageHeader>
  );
}

// Search box, platoon switch, room and day selects.
function toolbar(m: PeopleModel) {
  const { nav, today, days, date, q, setQ, unit, room, rooms, UNITS, setUnit, setRoom } = m;
  return (
    <div className="toolbar">
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση στη λίστα"
        placeholder="Όνομα, ΑΣΜ, βαθμός, ρόλος, πόστο, ΕΣΣΟ (χωρίς τόνους) · Ctrl+F"
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
      />
      <Segmented small={true} value={unit} onChange={setUnit} items={UNITS} />
      <Select
        className="ui-select"
        aria-label="Θάλαμος"
        value={room == null ? '' : String(room)}
        onChange={(e: ValueEvent) => setRoom(e.target.value ? +e.target.value : null)}
      >
        <option value="">Όλοι οι θάλαμοι</option>
        {rooms.map(([r, n]) => (
          <option key={r} value={String(r)}>
            Θάλαμος {r} · {n}
          </option>
        ))}
      </Select>
      <Select
        className="ui-select"
        aria-label="Άδειες και ποινές στην ημερομηνία"
        data-tip="Οι άδειες και οι ποινές αυτής της μέρας, και στο Excel"
        value={date}
        onChange={(e: ValueEvent) => nav.set({ pdate: e.target.value === today ? undefined : e.target.value })}
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {dayName(d, today)}
          </option>
        ))}
      </Select>
    </div>
  );
}

// The «Αποθήκευση» / «Διαγραφή λίστας» button after the active-filter text.
function viewAction(m: PeopleModel) {
  const { curView, filtered, setSaving, delView } = m;
  if (curView) {
    return (
      <button
        type="button"
        className="actfilter__act"
        onClick={() => delView(curView)}
        data-tip="Σβήνει τη λίστα (όχι τους ανθρώπους)"
      >
        Διαγραφή λίστας
      </button>
    );
  }
  return (
    filtered && (
      <button
        type="button"
        className="actfilter__act"
        onClick={() => setSaving(true)}
        data-tip="Κράτα αυτό το φίλτρο ως λίστα με όνομα, π.χ. «Θαλαμάρχες»"
      >
        ☆ Αποθήκευση
      </button>
    )
  );
}

// Quick filter chips with their counts, the saved lists, the active-filter text and «n από m».
function filters(m: PeopleModel) {
  const { filter, unit, room, dq, curView, views, viewN, counts, dateLbl, withSt, fLabel, rows, total } = m;
  const { setFilter, applyView, clear } = m;
  return (
    <div className="filters">
      <Strip role="group" aria-label="Γρήγορα φίλτρα">
        {ROSTER_FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className="ui-chip"
            aria-pressed={!curView && filter === k}
            data-tip={chipTip(k, dateLbl)}
            onClick={() => setFilter(filter === k && k !== 'all' ? 'all' : k)}
          >
            {l}
            <span className="cnt">{counts[k] || 0}</span>
          </button>
        ))}
        {views.map((v: SavedView, i: number) => (
          <button
            key={v.id}
            type="button"
            className={cx('ui-chip', 'ui-chip--view', i === 0 && 'ui-chip--gap')}
            aria-pressed={curView === v}
            data-tip="Αποθηκευμένη λίστα"
            onClick={() => applyView(v)}
          >
            {Icon.star}
            {v.name}
            <span className="cnt">{viewN[i]}</span>
          </button>
        ))}
      </Strip>
      <ActiveFilter
        parts={
          curView
            ? ['★ ' + curView.name]
            : [
                unit !== 'all' && unit,
                room != null && 'Θάλαμος ' + room,
                filter !== 'all' && fLabel,
                withSt && dateLbl,
                dq.trim() && '«' + dq.trim() + '»',
              ]
        }
        onClear={clear}
        extra={viewAction(m)}
      />
      <span className="toolbar__count">
        {rows.length} από {filter === 'inactive' ? counts.inactive || 0 : total}
      </span>
    </div>
  );
}

// What shows when no one matches: the empty roster or an empty search.
function empty(m: PeopleModel) {
  const { total, nav, setAdding, clear } = m;
  return (
    <div className="ui-card empty">
      {total === 0 ? (
        <>
          {'Δεν υπάρχει ακόμα προσωπικό. '}
          <Button variant="link" onClick={() => setAdding('many')}>
            Γράψε τους στρατιώτες τον έναν μετά τον άλλον
          </Button>
          {' ή '}
          <Button variant="link" onClick={() => nav.go('templates', { tab: 'import' })}>
            κάνε εισαγωγή από το Δυναμολόγιο
          </Button>
        </>
      ) : (
        <>
          {'Κανείς δεν ταιριάζει. '}
          <Button variant="link" onClick={clear}>
            Καθάρισε αναζήτηση και φίλτρα
          </Button>
        </>
      )}
    </div>
  );
}

// A sortable heading button.
function heading(m: PeopleModel, k: string, l: string) {
  const { sort, nav } = m;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM, aria-sort on the heading button as before
    <button key={k} type="button" aria-sort={ariaSort(sort, k)} onClick={() => nav.set({ sort: nextSort(sort, k) })}>
      {l}
      {sortArrow(sort, k)}
    </button>
  );
}

// Phone: one card per soldier.
function cards(m: PeopleModel) {
  const { rows, height, stOf, lists, open } = m;
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      <VirtualList
        items={rows}
        rowHeight={68}
        height={height}
        renderRow={(p: Person, _i, style) => (
          <PersonCard key={p.id} p={p} style={style} st={stOf(p)} lists={lists} onOpen={open} />
        )}
      />
    </div>
  );
}

// Desktop: the table with its sortable headings and the virtual rows.
function table(m: PeopleModel) {
  const { rows, height, rowH, stOf, lists, open, narrow, withSt, filter, unit, room, dq, sort, nav, marks } = m;
  const [grid, gridMin] = gridOf(narrow, withSt);
  const cols = colsOf(narrow);
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="table" as before
    <div className="ptable ptable--roster" role="table" aria-rowcount={rows.length}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: gridMin + 'px' }}>
          {/* biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, the header row is not focusable */}
          {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before */}
          <div className="ptable__head" role="row" style={{ gridTemplateColumns: grid }}>
            <span>Α/Α</span>
            {cols.filter(([k]) => HEAD_KEYS.includes(k)).map(([k, l]) => heading(m, k, l))}
            {withSt && <span>{filter === 'leave' ? 'Άδεια' : 'Ποινή'}</span>}
            {cols.filter(([k]) => !HEAD_KEYS.includes(k)).map(([k, l]) => heading(m, k, l))}
          </div>
          <VirtualList
            items={rows}
            rowHeight={rowH}
            height={height}
            resetKey={filter + '|' + unit + '|' + room + '|' + dq + '|' + sort.k + sort.dir}
            renderRow={(p: Person, i, style) => (
              <PersonRow
                key={p.id}
                p={p}
                n={i + 1}
                odd={i % 2 === 1}
                style={style}
                grid={grid}
                narrow={narrow}
                st={stOf(p)}
                lists={lists}
                selected={nav.params.person === p.id}
                nm={marks.get('p' + p.id)}
                onOpen={open}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

// The dialogs the list opens: new soldier, quick add of many, and the name of a saved list.
function dialogs(m: PeopleModel) {
  const { adding, setAdding, saving, setSaving, saveView } = m;
  return (
    <>
      {adding === 'one' && <NewPersonDialog onClose={() => setAdding(false)} onMany={() => setAdding('many')} />}
      {adding === 'many' && <QuickAddDialog onClose={() => setAdding(false)} />}
      {saving && <SaveViewDialog onClose={() => setSaving(false)} onSave={saveView} />}
    </>
  );
}

/** The «Λίστα» tab. */
export function PeopleList() {
  const m = usePeople();
  const { rows, mobile } = m;
  return (
    <div>
      {header(m)}
      {toolbar(m)}
      {filters(m)}
      {rows.length === 0 ? empty(m) : mobile ? cards(m) : table(m)}
      {dialogs(m)}
    </div>
  );
}
