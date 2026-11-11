// The «Νέος στρατιώτης» dialog.
// Purpose: `NewPersonDialog` adds a soldier (and, with «Προσθήκη και επόμενος», the next one with the same rank, Ο/Σ, room, ΕΣΣΟ).
// Does NOT: hold the state (model/useNewPerson.ts), the fields (PersonFields) or the Excel write (the `addPerson` command does).
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/ux-names.test.ts (texts), test/dialog-cases.test.ts.
import { Alert, Button, Dialog, UnsavedDialog, Why } from '../../../shared/ui';
import { rosterNote } from '../model/rosterNote';
import { type NewPersonModel, useNewPerson } from '../model/useNewPerson';
import { PersonFields } from './PersonFields';

// Νέος στρατιώτης (π.χ. ήρθε μετάθεση): μπαίνει στην εφαρμογή και σε νέα γραμμή στο Δυναμολόγιο.
// «Προσθήκη και επόμενος» (Michael, 19/10): το παράθυρο μένει ανοιχτό με τον ίδιο βαθμό, Ο/Σ, θάλαμο και ΕΣΣΟ
/** Props of `NewPersonDialog`. */
export interface NewPersonDialogProps {
  onClose: () => void;
  onMany?: () => void;
}

/** The buttons of the dialog: close, add and next, add. */
function newPersonFooter(m: NewPersonModel) {
  const { done, ok, miss, close, saveNext, save } = m;
  return (
    <>
      <Why text={miss} />
      <Button variant="outline" onClick={() => close()}>
        {done.length ? 'Τέλος' : 'Άκυρο'}
      </Button>
      <Button
        variant="outline"
        disabled={!ok}
        why={miss}
        onClick={saveNext}
        data-tip="Ctrl+Enter· μένει ανοιχτό για τον επόμενο, με τον ίδιο βαθμό, Ο/Σ και θάλαμο"
      >
        Προσθήκη και επόμενος
      </Button>
      <Button disabled={!ok} why={miss} onClick={save}>
        Προσθήκη
      </Button>
    </>
  );
}

/** The line above the fields: who was added so far, or the link to the quick table. */
function newPersonTop(m: NewPersonModel, onMany: (() => void) | undefined) {
  const { done, toExcel, close } = m;
  return done.length > 0 ? (
    <Alert tone="info">
      <span>
        Μπήκαν {done.length}: {done.slice(-4).join(', ')}
        {done.length > 4 ? '…' : ''}. {toExcel() ? 'Γράφονται και στο Δυναμολόγιο.' : ''}
      </span>
    </Alert>
  ) : (
    onMany && (
      <span className="note" style={{ margin: 0 }}>
        Πολλοί μαζί, π.χ. στη νέα ΕΣΣΟ;{' '}
        <Button variant="link" onClick={() => close(onMany)}>
          Γρήγορη εισαγωγή σε πίνακα
        </Button>
      </span>
    )
  );
}

/** The question when the dialog is closed with typed data that was not added. */
function newPersonAsk(m: NewPersonModel, asking: () => void) {
  const { ok, name, setAsking, save } = m;
  return (
    <UnsavedDialog
      title={ok ? 'Ο ' + name + ' δεν προστέθηκε' : 'Ο στρατιώτης δεν προστέθηκε'}
      saveLabel="Πρόσθεσέ τον"
      canSave={ok}
      onSave={() => {
        setAsking(null);
        save();
      }}
      discardLabel="Κλείσε χωρίς προσθήκη"
      onDiscard={() => {
        const go = asking;
        setAsking(null);
        go();
      }}
      onBack={() => setAsking(null)}
    >
      <p style={{ margin: 0 }}>
        {ok ? (
          'Έγραψες στοιχεία που δεν έχουν αποθηκευτεί. Αν κλείσεις χωρίς προσθήκη, χάνονται.'
        ) : (
          <>
            Έγραψες στοιχεία που δεν έχουν αποθηκευτεί. Για να προστεθεί γράψε <b>επώνυμο και όνομα</b>: πάτα «Πίσω».
          </>
        )}
      </p>
    </UnsavedDialog>
  );
}

export function NewPersonDialog({ onClose, onMany }: NewPersonDialogProps) {
  const m = useNewPerson(onClose);
  const { state, x, setX, done, gen, dirty, asking, close, keys } = m;
  return (
    <Dialog
      title="Νέος στρατιώτης"
      description={rosterNote(state, true)}
      onClose={() => close()}
      closeOnOverlay={!dirty && !done.length}
      footer={newPersonFooter(m)}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Ctrl+Enter catcher over the form, markup kept as it was */}
      <div onKeyDown={keys} className="stack" style={{ gap: '14px' }}>
        {newPersonTop(m, onMany)}
        <PersonFields key={gen} x={x} setX={setX} id="np" isNew={true} />
      </div>
      {asking && newPersonAsk(m, asking)}
    </Dialog>
  );
}
