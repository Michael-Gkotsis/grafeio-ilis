// The «Νέα σημείωση» dialog (Ctrl+Shift+N, Ctrl+K).
// Purpose: `NoteDialog` wraps a `NoteComposer` in a dialog; it closes after the save.
// Does NOT: edit stored notes (see EditDialog).
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts, test/screens-dialogs-forms.test.ts.
import { Dialog } from '../../../shared/ui';
import { useNoteDraft, type Start } from '../model/useNoteDraft';
import { NoteComposer } from './NoteComposer';

/** Props of `NoteDialog`. `start`: who the note starts bound to. */
export interface NoteDialogProps {
  start?: Start;
  onClose: () => void;
}

/** Νέα σημείωση από οπουδήποτε (Ctrl+Shift+N, Ctrl+K): όταν είναι ανοιχτή η καρτέλα ενός ατόμου, δένεται σε αυτό. */
export function NoteDialog({ start, onClose }: NoteDialogProps) {
  const draft = useNoteDraft(start || {});
  return (
    <Dialog
      size="lg"
      title="Νέα σημείωση"
      onClose={onClose}
      dirty={draft.dirty && 'Η σημείωση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    >
      <NoteComposer draft={draft} autoFocus={true} onSaved={onClose} />
    </Dialog>
  );
}
