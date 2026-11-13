// «Αποθήκευση λίστας»: names the filter you are looking at so it becomes a button in the filter row.
// Purpose: `SaveViewDialog`, a name field with Save / Cancel. The list does the saving (`onSave`).
// Does NOT: write the setting (the list's `onSave` runs the command) or check for a duplicate name.
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6). Only the «Δυναμολόγιο»
//   list opens it, so it stays in the page (screens/people.ts re-exports it for the dialog test cases).
// Covering test: test/dialog-*.test.ts (people-SaveViewDialog case), test/screens-main.test.ts.
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button, Dialog, Why } from '../../../shared/ui';

/** Props of {@link SaveViewDialog}. */
export interface SaveViewDialogProps {
  onClose: () => void;
  /** Called with the trimmed, non-empty name. */
  onSave: (name: string) => void;
}

/** The dialog that names a saved list. */
export function SaveViewDialog({ onClose, onSave }: SaveViewDialogProps) {
  const [name, setName] = useState('');
  const ok = name.trim().length > 0;
  return (
    <Dialog
      title="Αποθήκευση λίστας"
      description="Το φίλτρο που βλέπεις γίνεται κουμπί στη γραμμή φίλτρων, με τον αριθμό ατόμων πάντα ενημερωμένο."
      onClose={onClose}
      footer={
        <>
          <Why text={!ok && 'Λείπει: Όνομα'} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!ok} why="Λείπει: Όνομα" onClick={() => ok && onSave(name.trim())}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="sv-n">
          Όνομα *
        </label>
        <input
          id="sv-n"
          className="ui-input"
          data-autofocus=""
          maxLength={30}
          placeholder="π.χ. Θαλαμάρχες, Οδηγοί, ΕΣΣΟ Γ΄"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && ok) onSave(name.trim());
          }}
        />
      </div>
    </Dialog>
  );
}
