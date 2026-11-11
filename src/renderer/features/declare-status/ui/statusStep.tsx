// Step 2 of the declaration: which status (a search box and the list of statuses by group).
// Purpose: `statusStep` returns the Dialog of step 2 for the current render; a plain function, not a component.
// Does NOT: hold state or logic; it reads the `Declare` bag from `useDeclare` and the shared pieces from `stepChrome`.
// Owner layer: renderer/features/declare-status. Why: each step of the 155-line dialog is its own function.
// Covering test: test/screens-dialogs-forms.test.ts, test/status-fix.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { TYPES } from '../../../../shared/domain';
import { cx } from '../../../shared/lib/cx';
import { Alert, Badge, Button, Dialog } from '../../../shared/ui';
import { CATS, CAT_NAME } from '../model/statusPicks';
import type { Declare } from '../model/useDeclare';
import type { StepChrome } from './chrome';

/** «Πίσω» / «Άκυρο» and «Συνέχεια» of step 2. */
function statusFooter(d: Declare) {
  const { statusFirst, setStep, cmd, setErr, medPicks, onClose, toDates } = d;
  return (
    <>
      {statusFirst ? (
        <Button variant="outline" onClick={onClose}>
          Άκυρο
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setErr(null);
            setStep(1);
          }}
        >
          Πίσω
        </Button>
      )}
      {medPicks.length > 0 && (
        <Button onClick={toDates}>
          {cmd.pids.length ? 'Συνέχεια: Από πότε έως πότε' : 'Συνέχεια: Στρατιώτες'}
          {medPicks.length > 1 ? ' (' + medPicks.length + ' ιατρικά)' : ''}
        </Button>
      )}
    </>
  );
}

/** The search box: Enter picks the first match (or goes on when nothing is typed and medical ones are chosen). */
function statusSearch(d: Declare) {
  const { q, setQ, catF, setCatF, medPicks, shown, choose, toDates } = d;
  return (
    <div className="field">
      <label className="field__label" htmlFor="dsq">
        Ποια κατάσταση δηλώνεις;
      </label>
      <input
        id="dsq"
        className="ui-input"
        data-autofocus
        placeholder="Αναζήτηση, π.χ. ΕΥ, κανονική, κράτηση"
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!q.trim() && medPicks.length) toDates();
          else if (shown.length) {
            choose(shown[0]);
            setQ('');
          }
        }}
      />
      {catF && (
        <span className="field__help">
          Μόνο {catF === 'med' ? 'ιατρικά, ΣΤΕΠ και νοσοκομείο' : CAT_NAME[catF].toLowerCase()}.{' '}
          <Button variant="link" onClick={() => setCatF('')}>
            Δείξε όλες τις καταστάσεις
          </Button>
        </span>
      )}
    </div>
  );
}

/** The statuses by group; medical ones are check boxes (one or more), the others pick and go on. */
function statusGrid(d: Declare) {
  const { medSel, q, picked, t, curKey, shown, choose } = d;
  return (
    <div className="stpick">
      {CATS.filter(([c]) => shown.some((x) => x.cat === c)).map(([c, l]) => (
        <div key={c}>
          <div className="stpick__cat">
            {l}
            {c === 'med' && (
              <span className="stpick__hint"> · ένα ή περισσότερα, γράφεται το καθένα σε δική του γραμμή</span>
            )}
          </div>
          <div className="stpick__grid">
            {shown
              .filter((x) => x.cat === c)
              .map((x) => {
                const on = c === 'med' ? medSel.includes(x.key) && t.cat === 'med' : picked && x.key === curKey;
                return (
                  <button
                    key={x.key}
                    type="button"
                    className={cx('stpick__opt', on && 'is-on')}
                    aria-pressed={c === 'med' ? on : undefined}
                    onClick={() => choose(x)}
                  >
                    <span>
                      {c === 'med' && (
                        <span className={cx('stpick__box', on && 'is-on')} aria-hidden="true">
                          {on ? '✓' : ''}
                        </span>
                      )}
                      <Badge tone={x.long === 'Μόνο σημείωση' ? 'note' : TYPES[x.type].tone}>{x.short}</Badge>{' '}
                      <b>{x.long}</b>
                    </span>
                    {x.help && <small>{x.help}</small>}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {!shown.length && <span className="muted">Καμία κατάσταση με «{q}».</span>}
    </div>
  );
}

/** Step 2: which status. */
export function statusStep(d: Declare, chrome: StepChrome) {
  const { cmd, err, noteInfo, onClose } = d;
  const { ttl, desc, dirty, sum, errNode } = chrome;
  return (
    <Dialog
      title={ttl}
      description={desc}
      dirty={dirty}
      size="lg"
      onClose={onClose}
      closeOnOverlay={!cmd.pids.length}
      footer={statusFooter(d)}
    >
      {cmd.pids.length > 0 && sum}
      {statusSearch(d)}
      {statusGrid(d)}
      {noteInfo && (
        <Alert tone="info">
          <span>
            Μόνο σημείωση: δεν αλλάζει υπηρεσίες, έξοδο, ΗΚΑΙ και Δύναμη. Φαίνεται στην καρτέλα του και στα Ιατρικά ›
            Σημειώσεις.
          </span>
        </Alert>
      )}
      {err && (
        <Alert tone="bad">
          <span>{errNode}</span>
        </Alert>
      )}
    </Dialog>
  );
}
