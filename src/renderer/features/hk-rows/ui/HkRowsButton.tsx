// The «Γραμμές και ονόματα…» button: the rows card in a dialog.
// Purpose: `HkRowsButton` opens `HkRowsCard` in a dialog, from the ΗΚΑΙ and from «Στελέχη ανά βαθμό».
// Does NOT: hold the rows (the card does).
// Owner layer: renderer/features/hk-rows. Why: moved verbatim from screens/hkrows.ts (Phase 5.3b).
// Covering test: test/unit.test.ts, test/ux-names.test.ts.
import { useState } from 'react';
import { HK } from '../../../../shared/unit';
import { Button, Dialog } from '../../../shared/ui';
import { HkRowsCard } from './HkRowsCard';

/** Props of `HkRowsButton`. */
export interface HkRowsButtonProps {
  label?: string;
}

/** «Γραμμές και ονόματα…»: η ίδια κάρτα σε παράθυρο, από την ΗΚΑΙ και από τα «Στελέχη ανά βαθμό». */
export function HkRowsButton({ label = 'Γραμμές και ονόματα…' }: HkRowsButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-tip={'Νέα γραμμή (π.χ. Λοχαγοί) ή άλλο όνομα σε γραμμή της ' + HK()}
      >
        {label}
      </Button>
      {open && (
        <Dialog size="lg" title={'Γραμμές (βαθμοί) της ' + HK()} onClose={() => setOpen(false)}>
          <HkRowsCard bare />
        </Dialog>
      )}
    </>
  );
}
