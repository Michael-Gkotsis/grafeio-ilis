// «Δυναμολόγιο › Ημερολόγιο κωλυομένων» (Michael, 3/11): a grid of soldiers × training days with the code of each day.
// Purpose: `ImerTab`, the second tab of the «Δυναμολόγιο»: fills itself from leaves, medical, duties and posts; click
//   a cell to change it by hand (orange); Excel, print and the «Κωδικοί…» dialog.
// Does NOT: compute the grid (src/shared/imer.ts `imerGrid`) or draw the dialogs (ui/ImerDialogs.tsx).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/imerologio.ts (Phase 6), because a page may not
//   import screens/*; only this page shows it (screens/imerologio.ts re-exports the dialogs for the dialog test cases).
// Covering test: test/imer.test.ts, test/screens-main.test.ts, test/people-page-view.test.ts.
import type { KeyboardEvent } from 'react';
import { dm, dow, type ISODate } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import type { ImerPart } from '../../../../shared/imer';
import { rankTxt } from '../../../../shared/ranks';
import { cx } from '../../../shared/lib/cx';
import { Button, Icon, PageHeader, Segmented } from '../../../shared/ui';
import { SigsMenu } from '../../../widgets/export';
import { useImer } from '../model/useImer';
import { imerTone } from '../model/view';
import { CellDialog, CodesDialog } from './ImerDialogs';

const dayHead = (d: ISODate) => (
  <th key={d} className="imer__d" scope="col">
    <span>{dow(d)}</span>
    {d.slice(8, 10)}
  </th>
);

// The two «Π» / «Α» rows under a block: present and absent per day.
const totRows = (tot: ImerPart['tot'], label: string) =>
  ['Π', 'Α'].map((k, i) => (
    <tr key={label + k} className="imer__tot">
      <th colSpan={4} scope="row">
        {i === 0 ? label : ''}
      </th>
      <th>{i === 0 ? 'Παρόντες (Π)' : 'Απόντες (Α)'}</th>
      {tot.map((t, j) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the totals have no id, one per day column, as before
        <td key={j}>{t.show ? (i === 0 ? t.p : t.a) : ''}</td>
      ))}
    </tr>
  ));

type ImerModel = ReturnType<typeof useImer>;

// Title, the buttons that make the Excel or the print, the codes dialog and the signatures.
function header(m: ImerModel) {
  const { xl, go, setCodes, today } = m;
  return (
    <PageHeader
      title="Ημερολόγιο κωλυομένων και απόντων"
      sub="Γεμίζει μόνο του από άδειες, ιατρικά, υπηρεσίες και πόστα. Πάτα ένα κελί για να το αλλάξεις με το χέρι."
    >
      <Button disabled={xl} onClick={() => go(false)} data-tip="Ένα Excel με φύλλο ανά ουλαμό, όπως το έχεις στο χαρτί">
        {xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}
      </Button>
      <Button
        variant="outline"
        disabled={xl}
        onClick={() => go(true)}
        aria-label="Εκτύπωση"
        data-tip="Εκτύπωση χωρίς να ανοίξεις Excel"
      >
        {Icon.print}
        Εκτύπωση
      </Button>
      <Button variant="outline" onClick={() => setCodes(true)} data-tip="Τίτλος, φύλλα, κωδικοί και τι μετρά ως Π ή Α">
        Κωδικοί…
      </Button>
      <SigsMenu form="imer" date={today} label="το Ημερολόγιο" disabled={xl} variant="outline" go={go} />
    </PageHeader>
  );
}

// The week arrows, the range, the «Άλλες μέρες…» switch and the platoon switch.
function toolbar(m: ImerModel) {
  const { move, from, to, all, isDefault, nav, unit, units, n } = m;
  return (
    <div className="toolbar">
      <Button
        variant="outline"
        size="icon"
        aria-label="Πίσω μία εβδομάδα"
        data-tip="Μία εβδομάδα πίσω"
        onClick={() => move(-1)}
      >
        ‹
      </Button>
      <b className="imer__range">
        {dm(from)} – {dm(to)}/{to.slice(0, 4)}
      </b>
      <span className="muted">· {all ? 'όλες οι μέρες' : 'μέρες εκπαίδευσης'}</span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Μία εβδομάδα μπροστά"
        data-tip="Μία εβδομάδα μπροστά"
        onClick={() => move(1)}
      >
        ›
      </Button>
      {!isDefault && (
        <Button variant="ghost" onClick={() => nav.set({ imFrom: undefined })}>
          Πίσω στο σήμερα
        </Button>
      )}
      <Button
        variant="outline"
        aria-pressed={all}
        onClick={() => nav.set({ imAll: !all })}
        data-tip="Μέρες εκπαίδευσης (από τους Κανόνες, χωρίς αργίες) ή όλες οι μέρες"
      >
        {all ? 'Μόνο εκπαίδευση' : 'Άλλες μέρες…'}
      </Button>
      <Segmented
        small={true}
        value={unit}
        onChange={(u: string) => nav.set({ imUnit: u })}
        items={[{ value: 'all', label: 'Όλη η Ίλη' }, ...units.map((u) => ({ value: u, label: u }))]}
      />
      <span className="toolbar__count">{n} άτομα</span>
    </div>
  );
}

// One day cell: its code, colour and the click or key that opens the cell dialog.
function dayCell(m: ImerModel, p: Person, c: ImerModel['sections'][number]['cells'][number][number], d: ISODate) {
  const { today, setPick } = m;
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a td with role="button" as before
    <td
      key={d}
      className={cx(
        'imer__c',
        imerTone(c) && 'is-' + imerTone(c),
        c.hand && 'is-hand',
        d > today && !c.code && 'is-future',
        d === today && 'is-today',
      )}
      tabIndex={0}
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM, as before
      role="button"
      aria-label={p.last + ' ' + p.first + ' ' + dm(d) + (c.code ? ': ' + c.code : ': κενό')}
      data-tip={c.hand ? 'Με το χέρι' + (c.auto ? ' (αυτόματα: ' + c.auto + ')' : '') : undefined}
      onClick={() => setPick({ p, d })}
      onKeyDown={(e: KeyboardEvent<HTMLTableCellElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setPick({ p, d });
        }
      }}
    >
      {c.code}
    </td>
  );
}

// One block of the table: the platoon heading, its soldiers and the Π / Α totals.
function section(m: ImerModel, g: ImerModel['sections'][number]) {
  const { sections, cols, grid } = m;
  return (
    <tbody key={g.g.name}>
      {sections.length > 1 && (
        <tr className="imer__grp">
          <th colSpan={cols} scope="colgroup">
            {g.g.unit}
            {g.g.rooms && ' · ' + g.g.rooms}
          </th>
        </tr>
      )}
      {g.g.rows.map((p, i) => (
        <tr key={p.id}>
          <td className="imer__n">{i + 1}</td>
          <td data-tip={rankTxt(p) !== p.rank ? rankTxt(p) : undefined}>{p.rank}</td>
          <td>{p.spec}</td>
          <th scope="row" className="imer__l">
            {p.last}
          </th>
          <td className="imer__l">{p.first}</td>
          {g.cells[i].map((c, k) => dayCell(m, p, c, grid.days[k]))}
        </tr>
      ))}
      {totRows(g.tot, sections.length > 1 ? g.g.unit : 'ΣΥΝΟΛΟ')}
    </tbody>
  );
}

// The grid itself and the colour key under it.
function gridTable(m: ImerModel) {
  const { grid, sections, total } = m;
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="region" as before */}
      <div className="imer" role="region" aria-label="Ημερολόγιο κωλυομένων">
        <table className="imer__t">
          <thead>
            <tr>
              <th scope="col" className="imer__n">
                Α/Α
              </th>
              <th scope="col">Βαθμ.</th>
              <th scope="col">Ο-Σ</th>
              <th scope="col" className="imer__l">
                Επώνυμο
              </th>
              <th scope="col" className="imer__l">
                Όνομα
              </th>
              {grid.days.map(dayHead)}
            </tr>
          </thead>
          {sections.map((g) => section(m, g))}
          {total && <tbody>{totRows(total, 'ΣΥΝΟΛΟ ΙΛΗΣ')}</tbody>}
        </table>
      </div>
      <div className="imer__key">
        <span>
          <i className="is-abs" />
          Απών
        </span>
        <span>
          <i className="is-duty" />
          Υπηρεσία / πόστο
        </span>
        <span>
          <i className="is-free" />
          Ελεύθερος υπ./ασκ.
        </span>
        <span>
          <i className="is-future" />
          Δεν ήρθε ακόμα
        </span>
        <span>
          <i className="is-hand" />
          Με το χέρι
        </span>
        <span className="muted">Κενό = στην εκπαίδευση</span>
      </div>
    </>
  );
}

/** The «Ημερολόγιο κωλυομένων» tab. */
export function ImerTab() {
  const m = useImer();
  const { n, grid, pick, setPick, codes, setCodes, run, undoMark, toast, go } = m;
  return (
    <div>
      {header(m)}
      {toolbar(m)}
      {n === 0 || !grid.days.length ? (
        <div className="ui-card empty">
          {n === 0
            ? 'Δεν υπάρχει προσωπικό.'
            : 'Καμία μέρα εκπαίδευσης σε αυτές τις ημερομηνίες. Δες «Άλλες μέρες…» ή άλλαξε τους Κανόνες.'}
        </div>
      ) : (
        gridTable(m)
      )}
      {pick && (
        <CellDialog p={pick.p} d={pick.d} onClose={() => setPick(null)} run={run} undoMark={undoMark} toast={toast} />
      )}
      {codes && (
        <CodesDialog
          onClose={() => setCodes(false)}
          onPrint={() => {
            setCodes(false);
            go(true);
          }}
        />
      )}
    </div>
  );
}
