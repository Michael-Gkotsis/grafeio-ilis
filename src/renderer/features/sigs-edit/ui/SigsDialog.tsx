// The «Υπογραφές: …» dialog shown when a form is made: changes for this time only, or for the next times too.
// Purpose: `SigsDialog` edits a copy of the list and calls `onGo(list, keep, print)`; «Θέσεις στο χαρτί…» is a callback.
// Does NOT: open the layout dialog itself (the caller passes `onLayout`), or save the signatures.
// Owner layer: renderer/features/sigs-edit. Why: moved verbatim from renderer/sigs.ts (Phase 5.3b).
// Covering test: test/sigs.test.ts, test/report-sigs-fix.test.ts.
import { useState } from 'react';
import { sigsClean, type Sig } from '../../../../shared/sigs';
import { Button, Dialog, Icon } from '../../../shared/ui';
import { SigEditor } from './SigEditor';

/** Props of `SigsDialog`. `onGo(list, keep, print)`: keep = also for the next times; print = print instead of Excel. */
export interface SigsDialogProps {
  title: string;
  initial: Sig[];
  keepText: string;
  onGo: (sigs: Sig[], keep: boolean, print: boolean) => unknown;
  onClose: () => void;
  print?: boolean;
  reset?: { text: string; onClick: () => unknown };
  onLayout?: (list: Sig[]) => unknown;
  onceText?: string;
}

/** The footer buttons, in the order they were: layout, reset, cancel, print, Excel. */
function sigsFoot(p: SigsDialogProps, list: Sig[], go: (pr: boolean) => void) {
  const { onClose, print = true, reset, onLayout } = p;
  return (
    <>
      {onLayout && (
        <Button
          variant="outline"
          onClick={() => onLayout(sigsClean(list))}
          style={reset ? undefined : { marginRight: 'auto' }}
          data-tip="Σύρε κεφαλίδα, ημερομηνία και υπογραφές όπου θέλεις πάνω στο χαρτί"
        >
          Θέσεις στο χαρτί…
        </Button>
      )}
      {reset && (
        <Button
          variant="ghost"
          onClick={() => {
            onClose();
            reset.onClick();
          }}
          style={{ marginRight: 'auto' }}
        >
          {reset.text}
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      {print && (
        <Button variant="outline" onClick={() => go(true)}>
          {Icon.print}Εκτύπωση
        </Button>
      )}
      <Button onClick={() => go(false)}>Βγάλε το Excel</Button>
    </>
  );
}

/** Τη στιγμή που βγαίνει: αλλαγές μόνο για αυτή τη φορά, ή και για τις επόμενες (keepText). */
export function SigsDialog(props: SigsDialogProps) {
  const {
    title,
    initial,
    keepText,
    onGo,
    onClose,
    onceText = 'Αλλιώς ισχύουν μόνο για αυτό το αρχείο (και όταν ενημερώνεται μόνο του).',
  } = props;
  const [list, setList] = useState<Sig[]>(() => initial.map((x) => ({ ...x })));
  const [keep, setKeep] = useState(false);
  const go = (pr: boolean) => {
    onClose();
    onGo(sigsClean(list), keep, pr);
  };
  return (
    <Dialog
      title={'Υπογραφές: ' + title}
      description="Με τη σειρά που θα φαίνονται στο χαρτί, από αριστερά προς τα δεξιά."
      onClose={onClose}
      size="lg"
      footer={sigsFoot(props, list, go)}
    >
      <SigEditor value={list} onChange={setList} id="sgd" />
      <label className="rule" style={{ marginTop: '12px' }}>
        <input type="checkbox" className="ui-check" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>
          <b>{keepText}</b>
          <small>{onceText}</small>
        </span>
      </label>
    </Dialog>
  );
}
