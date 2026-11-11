// Step 1 of the declaration: who it is about (one or more soldiers).
// Purpose: `personStep` returns the Dialog of step 1 for the current render; a plain function, not a component.
// Does NOT: hold state or logic; it reads the `Declare` bag from `useDeclare` and the shared pieces from `stepChrome`.
// Owner layer: renderer/features/declare-status. Why: each step of the 155-line dialog is its own function
// Covering test: test/screens-dialogs-forms.test.ts, test/status-fix.test.ts.
import { PersonPicker, rkShort } from '../../../entities/person';
import { Alert, Button, Dialog } from '../../../shared/ui';
import type { Person } from '../../../../shared/domain';
import type { Declare } from '../model/useDeclare';
import type { StepChrome } from './chrome';

/** Step 1: who the declaration is about. */
export function personStep(d: Declare, c: StepChrome) {
  const { toast, statusFirst, setStep, cmd, err, setErr, set, picked, t, outPick, onClose, toStatus } = d;
  const { ttl, desc, dirty, stBadges, errNode } = c;
  return (
    <Dialog
      title={ttl}
      description={desc}
      dirty={dirty}
      onClose={onClose}
      closeOnOverlay={!cmd.pids.length}
      footer={
        <>
          {statusFirst ? (
            <Button
              variant="outline"
              onClick={() => {
                setErr(null);
                setStep(2);
              }}
            >
              Πίσω
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Άκυρο
            </Button>
          )}
          <Button onClick={toStatus}>{picked ? 'Συνέχεια: Από πότε έως πότε' : 'Συνέχεια: Κατάσταση'}</Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="dsp">
          {statusFirst ? 'Ποιοι στρατιώτες *' : 'Ποιος στρατιώτης *'}{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            {statusFirst ? '(γράψε επώνυμο και Enter, μετά τον επόμενο)' : '(ένας ή περισσότεροι)'}
          </span>
        </label>
        <PersonPicker
          id="dsp"
          multiple={true}
          value={cmd.pids}
          onChange={(pids: number[]) => set({ pids })}
          date={cmd.from}
          unavailable={picked && t.cat === 'out' ? outPick : undefined}
          onBlocked={(blocked: Person, why: string) => {
            set({ pids: [...cmd.pids, blocked.id] });
            toast({ text: rkShort(blocked) + ': ' + why + '. Μπήκε· θα ζητηθεί επιβεβαίωση.' });
          }}
          autoFocus={true}
        />
      </div>
      {picked && (
        <div className="declsum">
          <span>{stBadges}</span>
          <Button
            variant="link"
            onClick={() => {
              setErr(null);
              setStep(2);
            }}
          >
            Αλλαγή
          </Button>
        </div>
      )}
      {err && (
        <Alert tone="bad">
          <span>{errNode}</span>
        </Alert>
      )}
    </Dialog>
  );
}
