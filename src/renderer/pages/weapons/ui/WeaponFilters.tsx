// The «Εκτός τώρα» reason strip, the filter chips and the bulk bar of the «Όπλα» tab.
// Purpose: `reasonStrip(s)`, `filtersBar(s)`, `bulkBar(s)`.
// Does NOT: hold state (`s` comes from model/useWeapons.ts). Plain functions called as `{filtersBar(s)}`, not
//   components, so React renders the same elements as before.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6). The ΕΚΤΟΣ reason buttons
//   show the frozen key 1-9 (`Key`); the key itself is handled in model/useWeaponBulk.ts.
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import { Fragment, type MouseEvent } from 'react';
import { Key, reasonLbl } from '../../../features/weapon-move';
import { cx } from '../../../shared/lib/cx';
import { ActiveFilter, Button, Strip } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { AUTO_KEY, WEAPON_FILTERS, skipTxt } from '../../../../shared/weapons';
import type { WeaponsApi } from '../model/useWeapons';

/** «Εκτός τώρα»: one chip per exit reason; a click shows only those who left for it. */
export function reasonStrip(s: WeaponsApi) {
  const { reasons, date, today, reasonF, nav } = s;
  return (
    reasons.length > 0 && (
      // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
      <div className="wreasons" role="group" aria-label="Εκτός οπλοβαστού ανά λόγο">
        <b>Εκτός {date === today ? 'τώρα' : dm(date)}:</b>
        {reasons.map(([r, n]) => (
          <button
            key={r}
            type="button"
            className={cx('ui-chip ui-chip--sm', r === AUTO_KEY && 'ui-chip--auto')}
            aria-pressed={reasonF === r}
            data-tip={
              r === AUTO_KEY
                ? 'Ένοπλη υπηρεσία: το όπλο βγαίνει και μπαίνει αυτόματα στις ώρες του νούμερου. Κλικ: δείξε τους'
                : 'Κλικ: δείξε μόνο όσους βγήκαν για ' + r
            }
            onClick={() => nav.set({ wreason: reasonF === r ? null : r })}
          >
            {reasonLbl(r)}
            <span className="cnt">{n}</span>
          </button>
        ))}
      </div>
    )
  );
}

/** The filter chips with their counts, the active-filter line and the number of people shown. */
export function filtersBar(s: WeaponsApi) {
  const { filter, counts, nav, onlyS, unit, room, fLabel, reasonF, dq, clear, rows } = s;
  return (
    <div className="filters">
      <Strip role="group" aria-label="Φίλτρα οπλισμού">
        {WEAPON_FILTERS.map(([k, l, , tip]) => (
          <button
            key={k}
            type="button"
            className={cx(
              'ui-chip',
              (k === 'unarmed' || k === 'dup' || k === 'return') && (counts[k] || 0) > 0 && 'ui-chip--warn',
            )}
            aria-pressed={filter === k}
            data-tip={tip}
            onClick={() => nav.set({ wfilter: filter === k && k !== 'all' ? 'all' : k })}
          >
            {l}
            <span className="cnt">{counts[k] || 0}</span>
          </button>
        ))}
      </Strip>
      <ActiveFilter
        parts={[
          onlyS && 'Επιλεγμένοι',
          unit !== 'all' && unit,
          room != null && 'Θάλαμος ' + room,
          filter !== 'all' && fLabel,
          reasonF && 'Λόγος ' + reasonLbl(reasonF),
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

/** The reason buttons (keys 1-9) and «Ώρα…», or why nobody can go out. */
function bulkReasons(s: WeaponsApi) {
  const { sel, selIn, outReasons, setOutReason, setOutFor, outNow, lastReason, selOut, sp } = s;
  return selIn.length > 0 ? (
    <div className="bulkbar__reasons">
      <small>
        ΕΚΤΟΣ {selIn.length}
        {selIn.length < sel.size ? ' από ' + sel.size : ''}
        {' για:'}
      </small>
      {outReasons.map((r, i) => (
        <Button
          key={r}
          size="sm"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            if (e.shiftKey) {
              setOutReason(r);
              setOutFor(selIn.map((p) => p.id));
            } else return outNow(r);
          }}
          data-tip={
            'Έξοδος για ' +
            r +
            ' τώρα, με «Αναίρεση» (Shift+κλικ: διάλεξε ώρα)' +
            (i < 9 ? ' · πλήκτρο ' + (i + 1) : '')
          }
        >
          <Key n={i} />
          {r}
        </Button>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOutReason(lastReason);
          setOutFor(selIn.map((p) => p.id));
        }}
        data-tip="Άλλη ώρα ή μέρα, παρατήρηση, ή άλλος λόγος"
      >
        Ώρα…
      </Button>
    </div>
  ) : (
    selOut.length === 0 && <small>Κανένας δεν μπορεί να βγει{skipTxt(sp) ? ': ' + skipTxt(sp) : ''}</small>
  );
}

/** The bar of the ticked people: how many, ΕΚΤΟΣ for a reason (keys 1-9), «Ώρα…», ΕΝΤΟΣ and «Καθάρισε». */
export function bulkBar(s: WeaponsApi) {
  const { sel, setSel, hidN, setOnlySel, onlyS, selOut, setInFor } = s;
  return (
    sel.size > 0 && (
      <div className="bulkbar">
        <div className="bulkbar__sel">
          {sel.size} επιλεγμένοι
          {hidN > 0 && (
            <Fragment>
              {' '}
              <span className="bulkbar__hid">({hidN} δεν φαίνονται)</span>
              {' · '}
              <Button
                size="sm"
                variant="link"
                onClick={() => setOnlySel(true)}
                data-tip="Δείχνει μόνο όσους τσέκαρες, όποια φίλτρα κι αν υπάρχουν"
              >
                Δείξε τους
              </Button>
            </Fragment>
          )}
          {onlyS && (
            <Fragment>
              {' · '}
              <Button size="sm" variant="link" onClick={() => setOnlySel(false)}>
                Πίσω στη λίστα
              </Button>
            </Fragment>
          )}
        </div>
        {bulkReasons(s)}
        {selOut.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setInFor(selOut.map((m) => m.id))}>
            ΕΝΤΟΣ {selOut.length} {selOut.length === 1 ? 'όπλο' : 'όπλα'}…
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
          Καθάρισε
        </Button>
      </div>
    )
  );
}
