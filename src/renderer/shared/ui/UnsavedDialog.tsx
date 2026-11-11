// «Close with work not added?» question.
// Purpose: `UnsavedDialog` offers «add now», «close without adding» or «back» when a dialog is closed with work
//   that was not added. Esc and a click outside mean «Πίσω». With «Πίσω» the cursor returns to where you were typing.
// Does NOT: know what the work is (the caller passes the labels and the actions).
// Owner layer: renderer/shared/ui.
// Covering test: test/screens-dialogs-forms.test.ts.
// @decision Michael 19/10: «δεν θα θέλαμε να χάσουμε τη δουλειά».
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Props of `UnsavedDialog`. */
export interface UnsavedDialogProps {
  title: ReactNode;
  children?: ReactNode;
  saveLabel: ReactNode;
  /** The «add» button works only when true (and then it is the one with the focus). */
  canSave: boolean;
  onSave: () => void;
  discardLabel: ReactNode;
  onDiscard: () => void;
  onBack: () => void;
}

/** The question dialog (role `alertdialog`). */
export function UnsavedDialog({
  title,
  children,
  saveLabel,
  canSave,
  onSave,
  discardLabel,
  onDiscard,
  onBack,
}: UnsavedDialogProps) {
  // before the dialog's button takes the cursor
  const [prev] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      if (prev?.isConnected) prev.focus();
    },
    [],
  );
  return (
    <Dialog
      role="alertdialog"
      title={title}
      onClose={onBack}
      footer={
        <>
          <Button variant="ghost" onClick={onDiscard}>
            {discardLabel}
          </Button>
          <Button variant="outline" data-autofocus={canSave ? undefined : ''} onClick={onBack}>
            Πίσω
          </Button>
          <Button disabled={!canSave} data-autofocus={canSave ? '' : undefined} onClick={onSave}>
            {saveLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
