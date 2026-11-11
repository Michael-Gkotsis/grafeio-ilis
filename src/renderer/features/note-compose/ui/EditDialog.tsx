// The «Σημείωση» dialog: edit the text, who, reminder and «Σημαντική» of a stored note.
// Purpose: `EditDialog` keeps its own copy of the fields and saves them with one `editNote` command.
// Does NOT: create notes (see NoteDialog).
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import type { Note } from '../../../../shared/domain';
import { NOTE_MAX, noteLinks } from '../../../../shared/notes';
import { useStore } from '../../../shared/model';
import { Button, Dialog, Why, useDirty, useToast } from '../../../shared/ui';
import type { Draft } from '../model/useNoteDraft';
import { RemPick } from './RemPick';
import { WhoField } from './WhoField';

/** Props of `EditDialog`. */
export interface EditDialogProps {
  note: Note;
  onClose: () => void;
}

/** The edit dialog of one stored note. */
export function EditDialog({ note, onClose }: EditDialogProps) {
  const { run } = useStore();
  const toast = useToast();
  const [f, setF] = useState<Draft>(() => ({
    text: note.text,
    ...noteLinks(note),
    rem: note.rem || '',
    star: !!note.star,
  }));
  const set = (x: Partial<Draft>) => setF((o) => ({ ...o, ...x }));
  const dirty = useDirty(f);
  const why = f.text.trim() ? '' : 'Λείπει: Κείμενο σημείωσης';
  const save = async () => {
    if (
      await run(
        {
          t: 'editNote',
          id: note.id,
          patch: { text: f.text, who: { pids: f.pids, cids: f.cids }, rem: f.rem, star: f.star },
        },
        false,
      )
    ) {
      onClose();
      toast({ text: 'Αποθηκεύτηκε η σημείωση.' });
    }
  };
  return (
    <Dialog
      size="lg"
      title="Σημείωση"
      onClose={onClose}
      dirty={dirty && 'Οι αλλαγές δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
      footer={
        <>
          <Why text={why} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!!why} why={why} onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      <div className="note-comp">
        <textarea
          id="ne-text"
          className="ui-input note-text"
          rows={4}
          maxLength={NOTE_MAX}
          data-autofocus=""
          aria-label="Κείμενο σημείωσης"
          value={f.text}
          onChange={(e) => set({ text: e.target.value })}
        />
        <WhoField d={f} set={set} />
        <RemPick id="ne-rem" value={f.rem} onChange={(rem) => set({ rem })} />
        <label className="ui-checkrow">
          <input type="checkbox" className="ui-check" checked={f.star} onChange={() => set({ star: !f.star })} />
          Σημαντική
        </label>
      </div>
    </Dialog>
  );
}
