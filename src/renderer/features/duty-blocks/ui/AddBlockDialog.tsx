// The «Νέα υπηρεσία» dialog.
// Purpose: `AddBlockDialog` adds a service block to a ΦΡΟΥΡΑ form with the shared `BlockForm`.
// Does NOT: edit an existing block (`EditBlockDialog` does) or pick the form (the caller passes `phase`).
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from screens/guard.ts (Phase 6, Ρυθμίσεις S3);
//   the «Υπηρεσίες» screen and Ρυθμίσεις › Υπηρεσίες both open it.
// Covering test: test/status-fix.test.ts, test/ux-names.test.ts, test/screens-dialogs-forms.test.ts.
import { phaseName, type Phase } from '../../../../shared/domain';
import { useNav, useStore } from '../../../shared/model';
import { Button, Dialog, Why, useDirty, useToast } from '../../../shared/ui';
import { useBlockForm } from '../model/useBlockForm';
import { addedToastText } from '../model/view';
import { BlockForm } from './BlockForm';

/** Props of `AddBlockDialog`. */
export interface AddBlockDialogProps {
  onClose: () => void;
  /** The form to add to; default: the ΦΡΟΥΡΑ in force. */
  phase?: Phase;
}

/** «Νέα υπηρεσία»: the toast says where the service shows, and offers «Άνοιξε» when it was added inactive. */
export function AddBlockDialog({ onClose, phase: ph }: AddBlockDialogProps) {
  const { state, run } = useStore();
  const toast = useToast();
  const nav = useNav();
  const phase: Phase = ph || state.settings.phase || 'sven';
  const now = phase === (state.settings.phase || 'sven');
  const form = useBlockForm(undefined, phase);
  const { f } = form;
  const dirty = useDirty([f]);
  const save = async () => {
    if (await run(form.cmd(), false)) {
      onClose();
      toast({
        text: addedToastText(f, now, phaseName(state.settings, phase)),
        ...(!f.active
          ? { actions: [{ label: 'Άνοιξε', fn: () => nav.go('templates', { tab: 'duty', dsub: 'blocks' }) }] }
          : {}),
      });
    }
  };
  return (
    <Dialog
      title="Νέα υπηρεσία"
      description={
        'Στη ΦΡΟΥΡΑ ' +
        phaseName(state.settings, phase) +
        '. Βγαίνει στο Excel σε δικό της πίνακα κάτω από τα μαγειρεία.'
      }
      onClose={onClose}
      dirty={dirty && 'Η υπηρεσία δεν προστέθηκε. Αν κλείσεις, χάνεται.'}
      footer={
        <>
          <Why text={form.why} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!!form.why} why={form.why} onClick={save}>
            Προσθήκη
          </Button>
        </>
      }
    >
      <p className="field__help" style={{ marginTop: 0 }}>
        {f.name.trim() ? <>Η «{f.name.trim()}»</> : 'Η νέα υπηρεσία'} μετρά ως δική της: δική της στήλη στον Έλεγχο
        υπηρεσιών, στη σειρά δικαιοσύνης, στο «Ποιος κάνει τι» και στο Excel δυνατοτήτων, όπου την ενεργοποιείς ή
        απενεργοποιείς για τον καθένα χωριστά.
      </p>
      <BlockForm form={form} id="nb" />
    </Dialog>
  );
}
