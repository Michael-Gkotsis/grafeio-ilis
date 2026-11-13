// The counters bar of the «Εξοδούχοι» screen, with save / cancel / «all who can» and the Excel buttons.
// Purpose: `outsBar`, a plain function returning the bar, called as `{outsBar(o)}` (not a component).
// Does NOT: hold state (model/useOuts.ts).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { Button } from '../../../shared/ui';
import { ExportButton } from '../../../widgets/export';
import { isOutsAll } from '../../../../shared/domain';
import type { Outs } from '../model/useOuts';
import { OutsFmtSelect } from './OutsFmtSelect';

/** Counts (Έξοδος, ΔΝ, ΔΝ ΣΚ, Παραμένοντες, Σε άδεια), the save row, and the format and Excel buttons. */
export const outsBar = (o: Outs) => (
  <div className="bulkbar outbar">
    <span>
      Έξοδος <b>{o.cnt('OUT')}</b> · ΔΝ <b>{o.cnt('DN')}</b>
      {o.sat ? (
        <>
          {' · ΔΝ ΣΚ '}
          <b>{o.cnt('DNSK')}</b>
        </>
      ) : null}
      {' · Παραμένοντες '}
      <b>{o.stayN}</b> <span className="muted">({o.blockedN} λόγω κανόνων)</span>
      {o.awayN ? (
        <>
          {' · Σε άδεια '}
          <b>{o.awayN}</b>
        </>
      ) : null}
    </span>
    {o.nChanges ? (
      <>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            o.setDraft(o.saved);
            o.setNotes(o.savedNotes);
          }}
        >
          Ακύρωση
        </Button>
        <Button size="sm" onClick={() => o.setConfirm(true)}>
          Αποθήκευση ({o.nChanges})
        </Button>
      </>
    ) : (
      <Button
        size="sm"
        variant="secondary"
        onClick={o.allCan}
        data-tip="Βάζει «Έξοδος» σε όλους όσοι επιτρέπεται και δεν έχουν ήδη επιλογή"
      >
        {o.room == null ? 'Όλοι όσοι μπορούν: έξοδος' : 'Θάλαμος ' + o.room + ': όσοι μπορούν έξοδος'}
      </Button>
    )}
    <span className="outbar__xl">
      <OutsFmtSelect />
      {o.nChanges > 0 ? (
        <span className="note">Αποθήκευσε πρώτα για Excel.</span>
      ) : (
        <ExportButton
          kind="outs"
          date={o.date}
          label={isOutsAll(o.state.settings) ? 'η δύναμη (όλη)' : 'οι εξοδούχοι και παραμένοντες'}
          variant="outline"
          size="sm"
        />
      )}
    </span>
  </div>
);
