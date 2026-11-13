// The table of the «Όπλα» tab: the empty card, or the virtual list of rows with its sticky header.
// Purpose: `weaponTable(s)`: one `WRow` per person, drawn only for the rows in view (`VirtualList`), and the header with
//   the select-all tick and the sort buttons.
// Does NOT: hold state (`s` comes from model/useWeapons.ts). A plain function called as `{weaponTable(s)}`.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the `VirtualList` props, the
//   `resetKey` and the arguments of `WRow` are unchanged, so the `memo` rows hold on a keystroke in the search.
// Covering test: test/perf.test.ts (rows in the page), test/screens-main.test.ts.
import type { CSSProperties } from 'react';
import { Button, VirtualList } from '../../../shared/ui';
import { live as liveSts } from '../../../../shared/ranks';
import { dm } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import { GRID, GRID_MIN, ROW_H, WHEAD } from '../model/layout';
import type { WeaponsApi } from '../model/useWeapons';
import { WRow } from './WRow';

/** A sortable column header. */
function sortHead(s: WeaponsApi, k: string, l: string) {
  const { sort, nav } = s;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM, aria-sort on a header button as before
    <button
      key={k}
      type="button"
      data-tip={l}
      aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
      onClick={() => nav.set({ wsort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}
    >
      {l}
      {sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </button>
  );
}

/** The header row: select-all, the sort buttons and the column names. */
function tableHead(s: WeaponsApi) {
  const { allSel, setSel, tickable, date, today } = s;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, a div with role="row" as before
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    <div className="ptable__head" role="row" style={{ gridTemplateColumns: GRID }}>
      <span>
        <input
          type="checkbox"
          className="ui-check"
          aria-label="Επιλογή όλων"
          data-tip="Όλοι όσοι φαίνονται ΚΑΙ μπορούν να βγουν: έχουν αριθμό και δεν είναι ήδη εκτός (π.χ. ένας ουλαμός για ΕΚΠ). Αν δεν υπάρχει κανείς, όσοι είναι εκτός, για ΕΝΤΟΣ. Shift-κλικ σε δύο γραμμές τσεκάρει ό,τι είναι ανάμεσα."
          checked={allSel}
          onChange={() =>
            setSel((sel) =>
              allSel
                ? new Set([...sel].filter((id) => !tickable.some((p) => p.id === id)))
                : new Set([...sel, ...tickable.map((p) => p.id)]),
            )
          }
        />
      </span>
      <span>Α/Α</span>
      <span>Βαθμός</span>
      {sortHead(s, 'last', 'Επίθετο')}
      <span>Όνομα</span>
      <span>ΑΣΜ</span>
      {sortHead(s, 'room', 'Θάλ.')}
      <span>Σ.Ι.</span>
      <span data-tip="Από τη λίστα «Τύποι όπλων» (Ρυθμίσεις › Λίστες)">Τύπος</span>
      {sortHead(s, 'weapon', 'Αριθμός όπλου')}
      <span data-tip="ΕΝΤΟΣ ή ΕΚΤΟΣ οπλοβαστού τώρα, και γιατί. Πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή· η ώρα μπαίνει μόνη της και αλλάζει. Ένοπλη υπηρεσία: εκτός αυτόματα.">
        Κατάσταση όπλου{date !== today ? ' · υπηρεσίες ' + dm(date) : ''}
      </span>
      {sortHead(s, 'rack', 'Οπλοβ.')}
      <span data-tip="Η θέση του όπλου, ό,τι θέλεις να γράψεις (γράφεται με κεφαλαία και στο Excel)">Θέση</span>
      <span>Παρατήρηση</span>
    </div>
  );
}

/** The rows, or a card saying why there are none. */
export function weaponTable(s: WeaponsApi) {
  const { rows, dq, unit, room, clear, empty, height, filter, sort, state } = s;
  if (rows.length === 0)
    return (
      <div className="ui-card empty">
        {dq.trim() || unit !== 'all' || room != null ? (
          <>
            {'Κανείς δεν ταιριάζει. '}
            <Button variant="link" onClick={clear}>
              Καθάρισε αναζήτηση και φίλτρα
            </Button>
          </>
        ) : (
          empty
        )}
      </div>
    );
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    <div className="ptable ptable--weapons" role="table" aria-rowcount={rows.length}>
      <VirtualList
        className="weapons__body"
        items={rows}
        rowHeight={ROW_H}
        height={height + WHEAD}
        headHeight={WHEAD}
        minWidth={GRID_MIN}
        head={tableHead(s)}
        resetKey={filter + '|' + dq + '|' + unit + '|' + room + '|' + JSON.stringify(sort)}
        renderRow={(p: Person, i: number, style: CSSProperties) => (
          <WRow
            key={p.id}
            p={p}
            i={i}
            style={style}
            selected={s.sel.has(p.id)}
            info={s.info}
            pm={s.pm}
            types={s.types}
            lists={s.lists}
            statuses={liveSts(state)}
            date={s.date}
            reset={s.reset}
            onToggle={s.toggle}
            onOpen={s.openP}
            save={s.save}
            commit={s.commit}
            paste={s.paste}
          />
        )}
      />
    </div>
  );
}
