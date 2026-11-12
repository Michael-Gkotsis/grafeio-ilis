// The «Επεξεργασία» dialog of one service block.
// Purpose: `EditBlockDialog` edits a block of a ΦΡΟΥΡΑ form with the shared `BlockForm` (Λ/Υ and Δ/Υ: codes only).
// Does NOT: add a block (`AddBlockDialog` does) or move it up or down (the Ρυθμίσεις card does).
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from screens/settings.ts (Phase 6, Ρυθμίσεις S3).
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import type { BlockDef, Phase } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { Button, Dialog, Why, useDirty, useToast } from '../../../shared/ui';
import { useBlockForm } from '../model/useBlockForm';
import { BlockForm } from './BlockForm';

/** Props of `EditBlockDialog`. */
export interface EditBlockDialogProps {
  phase: Phase;
  /** The block to edit. */
  b: BlockDef;
  onClose: () => void;
}

/** «Επεξεργασία: …» with the same fields as «Νέα υπηρεσία». */
export function EditBlockDialog({ phase, b, onClose }: EditBlockDialogProps) {
  const { run } = useStore();
  const toast = useToast();
  const form = useBlockForm(b, phase);
  const { f } = form;
  const dirty = useDirty([f]);
  const save = async () => {
    if (await run(form.cmd(), false)) {
      onClose();
      toast({ text: 'Αποθηκεύτηκε: ' + (b.kind === 'ly' ? b.name : f.name.trim() || b.name) });
    }
  };
  return (
    <Dialog
      title={'Επεξεργασία: ' + b.name}
      description={
        b.kind === 'ly'
          ? 'Ο Λ/Υ και ο Δ/Υ αλλάζουν μόνο κωδικό.'
          : 'Όλα αλλάζουν όπως στη «Νέα υπηρεσία». Όσες θέσεις φύγουν κρατούν το ιστορικό τους.'
      }
      onClose={onClose}
      dirty={dirty && 'Οι αλλαγές δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
      footer={
        <>
          <Why text={form.why} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!!form.why} why={form.why} onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      <BlockForm form={form} id="eb" />
    </Dialog>
  );
}
