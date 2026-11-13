// The dialog «Μόνιμοι Λ/Υ και Δ/Υ»: pick the two people who are placed every day outside the fair order.
// Purpose: `FixedDialog`, saves with `setSettings` (`fixed`).
// Does NOT: place anybody (the autofill does, with these two first).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); the command and its text
//   are unchanged.
// Covering test: test/screens-main.test.ts, test/screens-dialogs-coverage.test.ts.
import { useState } from 'react';
import { shortName, type Person } from '../../../../shared/domain';
import { personMap } from '../../../../shared/rules';
import { PersonPicker, RkName } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { Button, Dialog, useToast } from '../../../shared/ui';

/** Props of {@link FixedDialog}. */
export interface FixedDialogProps {
  onClose: () => void;
}

type Fixed = { ly?: number; dy?: number };

/** The dialog. */
export function FixedDialog({ onClose }: FixedDialogProps) {
  const { state, run } = useStore();
  const toast = useToast();
  const pm = personMap(state.people);
  const [f, setF] = useState<Fixed>({ ...(state.settings.fixed || {}) });
  const row = (k: 'ly' | 'dy', label: string) => (
    <div className="field">
      <label className="field__label" htmlFor={'fx-' + k}>
        {label}
      </label>
      {f[k] && pm.get(f[k]!) ? (
        <div className="fixedline">
          <b>
            <RkName p={pm.get(f[k]!)!} />
          </b>
          <Button size="sm" variant="ghost" onClick={() => setF({ ...f, [k]: undefined })}>
            Κανένας
          </Button>
        </div>
      ) : (
        <PersonPicker
          id={'fx-' + k}
          value={null}
          onChange={(id: number) => setF({ ...f, [k]: id })}
          unavailable={(p: Person) =>
            !p.active ? 'Εκτός δύναμης' : p.id === f[k === 'ly' ? 'dy' : 'ly'] ? 'Ήδη μόνιμος' : null
          }
        />
      )}
    </div>
  );
  const save = async () => {
    const fixed: Fixed = {};
    if (f.ly) fixed.ly = f.ly;
    if (f.dy) fixed.dy = f.dy;
    const txt =
      'μόνιμος Λ/Υ ' +
      (fixed.ly ? shortName(pm.get(fixed.ly)!) : 'κανένας') +
      ', Δ/Υ ' +
      (fixed.dy ? shortName(pm.get(fixed.dy)!) : 'κανένας');
    if (await run({ t: 'setSettings', settings: { fixed }, text: txt }, false)) {
      onClose();
      toast({ text: 'Αποθηκεύτηκε: ' + txt + '. Μπαίνουν μόνοι τους με την αυτόματη συμπλήρωση.' });
    }
  };
  return (
    <Dialog
      title="Μόνιμοι Λ/Υ και Δ/Υ"
      description="Μπαίνουν μόνοι τους κάθε μέρα και δεν μπαίνουν στη σειρά για άλλες υπηρεσίες. Αν λείπει κάποιος, η θέση γεμίζει με τη σειρά. Για μία μέρα, άλλαξέ τον με «Αλλαγή» στη θέση."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={save}>Αποθήκευση</Button>
        </>
      }
    >
      {row('ly', 'Λ/Υ')}
      {row('dy', 'Δ/Υ')}
    </Dialog>
  );
}
