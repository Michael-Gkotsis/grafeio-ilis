// The two toolbars of the «Εξοδούχοι» screen: room chips with the sort, and the search with the filter chips.
// Purpose: `roomBar` and `findBar`, plain functions returning the markup, called as `{roomBar(o)}`.
// Does NOT: hold state (model/useOuts.ts) or filter the rows (model/view.ts `filterOutRows`).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { ActiveFilter, Segmented, Strip } from '../../../shared/ui';
import type { Outs } from '../model/useOuts';

const FILTER_NAMES: Record<string, string> = { can: 'Μπορούν να βγουν', cant: 'Δεν μπορούν', sel: 'Επιλεγμένοι' };

/** «Θάλαμος» chips (how many of each room go out) and the sort switch. */
export const roomBar = (o: Outs) => (
  <div className="toolbar">
    <Strip className="chips chips--wrap" role="group" aria-label="Θάλαμος">
      <button type="button" className="ui-chip" aria-pressed={o.room == null} onClick={() => o.setRoom(null)}>
        Όλοι οι θάλαμοι
      </button>
      {o.roomList.map((r) => {
        const n = o.people.filter((p) => p.room === r);
        const out = n.filter((p) => o.draft[p.id]).length;
        return (
          <button
            key={r}
            type="button"
            className="ui-chip"
            aria-pressed={o.room === r}
            onClick={() => o.setRoom(o.room === r ? null : r)}
            data-tip={out + ' από ' + n.length + ' βγαίνουν'}
          >
            Θ{r}
            <span className="cnt">
              {out}/{n.length}
            </span>
          </button>
        );
      })}
    </Strip>
    <Segmented
      small={true}
      value={o.sort}
      onChange={o.setSort}
      items={[
        { value: 'room', label: 'Ανά θάλαμο' },
        { value: 'name', label: 'Αλφαβητικά' },
      ]}
    />
  </div>
);

/** The search box, the four filter chips, the active-filter line and the count of people shown. */
export const findBar = (o: Outs) => {
  const chips: [string, string, number][] = [
    ['all', 'Όλοι', o.people.length],
    ['can', 'Μπορούν να βγουν', o.people.length - o.cantN],
    ['cant', 'Δεν μπορούν', o.cantN],
    ['sel', 'Επιλεγμένοι', o.cnt('OUT') + o.cnt('DN') + o.cnt('DNSK')],
  ];
  return (
    <div className="toolbar outs__find">
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση"
        placeholder="Επώνυμο ή όνομα (χωρίς τόνους) · Ctrl+F"
        value={o.q}
        onChange={(e) => o.setQ(e.target.value)}
      />
      <Strip className="chips chips--wrap" role="group" aria-label="Φίλτρα">
        {chips.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            className="ui-chip"
            aria-pressed={o.filter === k}
            onClick={() => o.setFilter(k)}
          >
            {l}
            <span className="cnt">{n}</span>
          </button>
        ))}
      </Strip>
      <ActiveFilter
        parts={[
          o.room != null && 'Θάλαμος ' + o.room,
          o.filter !== 'all' && FILTER_NAMES[o.filter],
          o.dq && '«' + o.dq + '»',
        ]}
        onClear={() => {
          o.setFilter('all');
          o.setQ('');
          o.setRoom(null);
        }}
      />
      <span className="toolbar__count">{o.rows.length} άτομα</span>
    </div>
  );
};
