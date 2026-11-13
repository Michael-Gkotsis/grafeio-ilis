// The «Κινήσεις» tab: the log of weapons going out of and back into the rack.
// Purpose: `MovesView`: «Εκτός τώρα» (with a chip per reason), the moves of the day (and those that were out that day), or
//   all of them, newest first. Armed duties show as automatic rows with their hours; they are fixed only with
//   «Διόρθωση…» and are not in the bulk entry or fix. A tick per row, «Είσοδος όλων <λόγος>» and a bulk fix of reason / time.
// Does NOT: hold state (model/useMoves.ts) or write a move (the dialogs of features/weapon-move do).
// Owner layer: renderer/pages/weapons. Why: moved from screens/weaponMoves.ts (Phase 6); htm became TSX with the same
//   markup, text nodes, keys and hook order. Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες».
// Covering test: test/screens-main.test.ts (weapons--moves), test/weapons.test.ts.
import type { ChangeEvent, CSSProperties } from 'react';
import { BulkFixDialog, DutyFixDialog, EditMoveDialog, WeaponInDialog, reasonLbl } from '../../../features/weapon-move';
import { cx } from '../../../shared/lib/cx';
import { ActiveFilter, Button, Segmented, VirtualList } from '../../../shared/ui';
import type { WeaponMove } from '../../../../shared/domain';
import { AUTO_KEY } from '../../../../shared/weapons';
import { MV_GRID, MV_HEAD, MV_MIN, MV_ROW } from '../model/layout';
import { useMoves, type MovesApi, type MovesProps } from '../model/useMoves';
import { MRow } from './MRow';

/** The header row of the table. */
function movesHead(s: MovesApi) {
  const { ticks, allSel, setSel } = s;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, a div with role="row" as before
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    <div className="ptable__head" role="row" style={{ gridTemplateColumns: MV_GRID }}>
      <span>
        <input
          type="checkbox"
          className="ui-check"
          aria-label="Επιλογή όλων"
          data-tip="Όλες οι κινήσεις που φαίνονται (όχι οι αυτόματες των ένοπλων υπηρεσιών). Shift-κλικ σε δύο γραμμές τσεκάρει ό,τι είναι ανάμεσα."
          disabled={!ticks.length}
          checked={allSel}
          onChange={() => setSel(allSel ? new Set() : new Set(ticks))}
        />
      </span>
      <span>Στρατιώτης</span>
      <span>Όπλο</span>
      <span>Λόγος εξόδου</span>
      <span>Έξοδος</span>
      <span>Λόγος εισόδου</span>
      <span>Είσοδος</span>
      <span>Παρατήρηση</span>
      <span></span>
    </div>
  );
}

/** The toolbar: the three views, the search and «Είσοδος όλων». */
function movesToolbar(s: MovesApi) {
  const { nav, view, outN, dayLbl, log, q, setQ, inAll, reasonF, setInFor, rows } = s;
  return (
    <div className="toolbar">
      <Segmented
        small={true}
        value={view}
        onChange={(v: string) => nav.set({ wmoves: v })}
        items={[
          {
            value: 'open',
            label: 'Εκτός τώρα (' + outN + ')',
            tip: 'Κινήσεις που δεν έχουν είσοδο και ένοπλες υπηρεσίες που τρέχουν: όσους μετράει και ο τίτλος της σελίδας',
          },
          {
            value: 'day',
            label: dayLbl,
            tip: 'Όσα βγήκαν ή μπήκαν τη μέρα, όσα ήταν εκτός, και τα νούμερα των ένοπλων υπηρεσιών',
          },
          { value: 'all', label: 'Όλες (' + log.length + ')' },
        ]}
      />
      <input
        type="search"
        className="ui-input wmv__search"
        aria-label="Αναζήτηση στις κινήσεις"
        placeholder="Όνομα, ΑΣΜ, αριθμός όπλου ή θέση (Ε 23)"
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
      />
      {view === 'open' && (inAll.length > 0 || reasonF === AUTO_KEY) && (
        <Button
          data-moves-in=""
          size="sm"
          variant={reasonF ? 'default' : 'outline'}
          disabled={!inAll.length}
          why={
            !inAll.length
              ? 'Οι ένοπλες υπηρεσίες μπαίνουν μόνες τους στις ώρες τους (διόρθωσε μία ώρα με «Διόρθωση…»)'
              : undefined
          }
          onClick={() => setInFor(inAll)}
          data-tip="Μπαίνουν στον οπλοβαστό όλα όσα φαίνονται (με το φίλτρο λόγου και την αναζήτηση), με μία ώρα· ο διάλογος ρωτά πριν γραφτεί"
        >
          {'Είσοδος όλων '}
          {reasonF && reasonF !== AUTO_KEY ? reasonF + ' ' : ''}({inAll.length})…
        </Button>
      )}
      <span className="toolbar__count">
        {rows.length} {rows.length === 1 ? 'κίνηση' : 'κινήσεις'}
      </span>
    </div>
  );
}

/** The reason chips (only in «Εκτός τώρα»), with the active-filter line inside. */
function movesReasons(s: MovesApi) {
  const { reasons, reasonF, nav, dq, clear } = s;
  return (
    reasons.length > 0 && (
      // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
      <div className="wreasons" role="group" aria-label="Εκτός τώρα ανά λόγο">
        <b>Εκτός τώρα:</b>
        {reasons.map(([r, n]) => (
          <button
            key={r}
            type="button"
            className={cx('ui-chip ui-chip--sm', r === AUTO_KEY && 'ui-chip--auto')}
            aria-pressed={reasonF === r}
            data-tip={
              r === AUTO_KEY
                ? 'Ένοπλη υπηρεσία: το όπλο βγαίνει και μπαίνει αυτόματα στις ώρες του νούμερου. Κλικ: δείξε τις'
                : 'Κλικ: δείξε μόνο όσα βγήκαν για ' + r
            }
            onClick={() => nav.set({ wmreason: reasonF === r ? null : r })}
          >
            {reasonLbl(r)}
            <span className="cnt">{n}</span>
          </button>
        ))}
        <ActiveFilter
          parts={[reasonF && 'Λόγος ' + reasonLbl(reasonF), dq.trim() && '«' + dq.trim() + '»']}
          onClear={clear}
        />
      </div>
    )
  );
}

/** The active-filter line when there is no reason strip (other views, or nothing is out). */
function movesActive(s: MovesApi) {
  const { reasons, dq, clear, view } = s;
  return (
    (view !== 'open' || !reasons.length) && (
      <ActiveFilter parts={[dq.trim() && '«' + dq.trim() + '»']} onClear={clear} />
    )
  );
}

/** The bar of the ticked moves. */
function movesBulk(s: MovesApi) {
  const { selRows, selIn, selFix, setInFor, setBulkFix, setSel } = s;
  return (
    selRows.length > 0 && (
      <div className="bulkbar">
        <div className="bulkbar__sel">{selRows.length} επιλεγμένες</div>
        <div className="bulkbar__reasons">
          {selIn.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setInFor(selIn)}>
              ΕΝΤΟΣ {selIn.length} {selIn.length === 1 ? 'όπλο' : 'όπλα'}…
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkFix(selFix)}
            data-tip="Άλλαξε μαζί τον λόγο ή την ώρα εξόδου: μία εγγραφή στο Ιστορικό, μία αναίρεση"
          >
            Διόρθωση λόγου/ώρας ({selFix.length})…
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
          Καθάρισε
        </Button>
      </div>
    )
  );
}

/** The rows, or a card saying why there are none. */
function movesTable(s: MovesApi) {
  const { rows, dq, reasonF, clear, view, height, sel, pm, lists, today, toggle, setInFor, setEdit, setFix, openP } = s;
  if (rows.length === 0)
    return (
      <div className="ui-card empty">
        {dq.trim() || reasonF ? (
          <>
            {'Καμία κίνηση δεν ταιριάζει. '}
            <Button variant="link" onClick={clear}>
              Καθάρισε αναζήτηση και φίλτρο
            </Button>
          </>
        ) : view === 'open' ? (
          'Όλα τα όπλα είναι μέσα στον οπλοβαστό. Για έξοδο: τσέκαρε άτομα στα «Όπλα» ή πάτα «Έξοδος» στη γραμμή του.'
        ) : (
          'Καμία κίνηση.'
        )}
      </div>
    );
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    <div className="ptable ptable--moves" role="table" aria-rowcount={rows.length}>
      <VirtualList
        className="weapons__body"
        items={rows}
        rowHeight={MV_ROW}
        height={height + MV_HEAD}
        headHeight={MV_HEAD}
        minWidth={MV_MIN}
        head={movesHead(s)}
        resetKey={view + '|' + reasonF + '|' + dq}
        renderRow={(m: WeaponMove, i: number, style: CSSProperties) => (
          <MRow
            key={m.id}
            m={m}
            i={i}
            style={style}
            selected={sel.has(m.id)}
            pm={pm}
            lists={lists}
            today={today}
            onToggle={toggle}
            onIn={setInFor}
            onEdit={setEdit}
            onFix={setFix}
            onOpen={openP}
          />
        )}
      />
    </div>
  );
}

/** The «Κινήσεις» tab. */
export function MovesView(props: MovesProps) {
  const s = useMoves(props);
  const { edit, setEdit, fix, setFix, inFor, setInFor, bulkFix, setBulkFix, setSel } = s;
  return (
    <div>
      {movesToolbar(s)}
      {movesReasons(s)}
      {movesActive(s)}
      {movesBulk(s)}
      {movesTable(s)}
      {edit && <EditMoveDialog m={edit} onClose={() => setEdit(null)} />}
      {fix && <DutyFixDialog row={fix} onClose={() => setFix(null)} />}
      {inFor && <WeaponInDialog ids={inFor} onClose={() => setInFor(null)} onDone={() => setSel(new Set())} />}
      {bulkFix && <BulkFixDialog ids={bulkFix} onClose={() => setBulkFix(null)} onDone={() => setSel(new Set())} />}
    </div>
  );
}
