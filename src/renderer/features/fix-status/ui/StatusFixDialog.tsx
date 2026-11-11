// The «Διόρθωση» dialog of a medical record or penalty that was entered by mistake.
// Purpose: `StatusFixDialog`: «Άλλαξε στοιχεία…» reopens the declaration with the record's data, «Διαγραφή» removes it.
// Does NOT: write the corrected record (the declaration dialog does, through `replaceStatus`), or choose where it is
//   opened from (the people card, the medical list and the leaves list each mount it).
// Owner layer: renderer/features/fix-status. Why: three screens opened the same dialog from people.ts.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import { dm } from '../../../../shared/dates';
import { TYPES, type Status, type TypeKey } from '../../../../shared/domain';
import { punLbl } from '../../../../shared/punish';
import { statusLbl } from '../../../../shared/ranks';
import { personMap } from '../../../../shared/rules';
import { HK } from '../../../../shared/unit';
import { rkFull, rkShort } from '../../../entities/person';
import { useNav, useStore } from '../../../shared/model';
import { Button, Dialog, useToast } from '../../../shared/ui';
import { declareParamsOf } from '../model/declareParams';

/** Props of `StatusFixDialog`. */
export interface StatusFixDialogProps {
  /** The medical record or penalty to correct or delete. */
  st: Status;
  onClose: () => void;
}

interface AskProps {
  st: Status;
  desc: string;
  onClose: () => void;
}

/** The second step: «Διαγραφή: μπήκε λάθος;». */
function deleteAsk({ st, desc, onClose, onBack, onRemove }: AskProps & { onBack: () => void; onRemove: () => void }) {
  return (
    <Dialog
      role="alertdialog"
      title="Διαγραφή: μπήκε λάθος;"
      description={desc}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={onBack}>
            Πίσω
          </Button>
          <Button variant="destructive" onClick={onRemove}>
            Ναι, διάγραψέ {st.type === 'PUN' ? 'την' : 'το'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        Φεύγει ολόκληρ{st.type === 'PUN' ? 'η' : 'ο'}, και οι μέρες που έχουν περάσει, από παντού (
        {st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά'}, {HK()}, Δύναμη, Excel), σαν να μην μπήκε ποτέ. Αν απλώς σταμάτησε
        νωρίτερα, πάτα «Πίσω» και κλείσε· το «Λήξη νωρίτερα…» κρατά τις μέρες που ίσχυσε.
      </p>
    </Dialog>
  );
}

/** The first step: «Διόρθωση» with «Άλλαξε στοιχεία…» and, for medical records and penalties, «Διαγραφή…». */
function fixAsk({ st, desc, onClose, onDelete, onEdit }: AskProps & { onDelete: () => void; onEdit: () => void }) {
  const abs = TYPES[st.type as TypeKey].cat === 'abs';
  return (
    <Dialog
      title="Διόρθωση"
      description={desc}
      onClose={onClose}
      footer={
        <>
          {!abs && (
            <Button variant="ghost" onClick={onDelete}>
              Διαγραφή (μπήκε λάθος)…
            </Button>
          )}
          <span style={{ flex: 1 }}></span>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button data-autofocus="" onClick={onEdit}>
            Άλλαξε στοιχεία…
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        <b>Άλλαξε στοιχεία</b>: ανοίγει η δήλωση με ό,τι έχει τώρα (ημερομηνίες, είδος, παρατήρηση
        {st.type === 'PUN' ? ', ποιος τιμώρησε, λόγος' : ''}) για να διορθώσεις ό,τι μπήκε λάθος. Στην αποθήκευση η
        παλιά καταχώρηση αντικαθίσταται.
      </p>
      {abs ? (
        <p style={{ margin: '10px 0 0' }}>
          {st.req ? 'Η σύνδεση με την αίτηση μένει. ' : ''}Αν δεν έφυγε καθόλου, κλείσε και πάτα «Ακύρωση…»· αν γύρισε
          νωρίτερα, «Λήξη νωρίτερα…».
        </p>
      ) : (
        <p style={{ margin: '10px 0 0' }}>
          <b>Διαγραφή</b>: μόνο αν μπήκε εντελώς λάθος (λάθος άνθρωπος ή δεν έγινε ποτέ).
        </p>
      )}
    </Dialog>
  );
}

/**
 * Medical record or penalty that was entered wrongly: «Διόρθωση» opens the declaration with its data (the old one goes
 * when the new one is saved), «Διαγραφή» deletes it whole. Both can be undone.
 * @decision Michael, 22/10: before, only «Σταμάτησε» was left, and it keeps the days that have passed.
 * @see test/status-fix.test.ts
 */
export function StatusFixDialog({ st, onClose }: StatusFixDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const p = personMap(state.people).get(st.pid);
  const [del, setDel] = useState(false);
  const what = st.type === 'PUN' ? 'ποινή (' + punLbl(st.kind) + ')' : statusLbl(st, state.settings.lists);
  const dates = dm(st.from) + ' – ' + (st.open ? 'χωρίς λήξη' : dm(st.to));
  const desc = (p ? rkFull(p) + ' · ' : '') + what.replace(/^π/, 'Π') + ' ' + dates;
  const edit = () => {
    onClose();
    nav.declare(declareParamsOf(st));
  };
  const remove = async () => {
    if (!(await run({ t: 'deleteStatus', id: st.id }, false))) return;
    onClose();
    toast({ text: 'Διαγράφηκε: ' + what + (p ? ' του ' + rkShort(p) : ''), actions: [undoMark()] });
  };
  if (del) return deleteAsk({ st, desc, onClose, onBack: () => setDel(false), onRemove: remove });
  return fixAsk({ st, desc, onClose, onDelete: () => setDel(true), onEdit: edit });
}
