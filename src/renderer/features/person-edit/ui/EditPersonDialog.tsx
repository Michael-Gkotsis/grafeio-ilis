// The «Διόρθωση στοιχείων» dialog of a soldier.
// Purpose: `EditPersonDialog` edits the data of one soldier (and puts him out of strength / back).
// Does NOT: hold the fields (PersonFields) or the Excel write (the `updatePerson` command does).
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/ux-names.test.ts (texts), test/dialog-cases.test.ts.
import { useState } from 'react';
import { rkShort } from '../../../entities/person';
import { useNav, useStore } from '../../../shared/model';
import { Button, Dialog, useDirty, useToast } from '../../../shared/ui';
import type { Person } from '../../../../shared/domain';
import { rosterNote } from '../model/rosterNote';
import { PersonFields } from './PersonFields';

/** Props of `EditPersonDialog`. */
export interface EditPersonDialogProps {
  p: Person;
  onClose: () => void;
}

export function EditPersonDialog({ p, onClose }: EditPersonDialogProps) {
  const { run, state, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const [x, setX] = useState<Person>({ ...p });
  const dirty = useDirty(x);
  // εκτός δύναμης (Michael, 17/10): περνά στους «Εκτός δύναμης» του Δυναμολογίου και βγαίνει από τις υπηρεσίες που έχει από σήμερα
  const save = async () => {
    if (!(await run({ t: 'updatePerson', person: x }, false))) return;
    onClose();
    if (p.active && !x.active)
      toast({
        text: rkShort(x) + ' πέρασε στους Εκτός δύναμης.',
        actions: [{ label: 'Δες τους', fn: () => nav.go('people', { filter: 'inactive' }) }, undoMark()],
      });
    else if (!p.active && x.active) toast({ text: rkShort(x) + ' είναι ξανά σε δύναμη.', actions: [undoMark()] });
    else toast({ text: 'Αποθηκεύτηκαν τα στοιχεία του ' + rkShort(x) });
  };
  return (
    <Dialog
      title="Διόρθωση στοιχείων"
      description={rosterNote(state, false)}
      onClose={onClose}
      dirty={dirty && 'Οι διορθώσεις δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={save}>Αποθήκευση</Button>
        </>
      }
    >
      <PersonFields x={x} setX={setX} id="ep" />
    </Dialog>
  );
}
