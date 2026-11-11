// The «Βγάλε το Excel» button of a form, with «Εκτύπωση» and «Υπογραφές…» beside it.
// Purpose: `ExportButton` is the three buttons every exportable form has; the first calls the export context.
// Does NOT: make the file (the export context does).
// Owner layer: renderer/widgets/export. Why: moved verbatim from renderer/common.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts, test/sigs-all-forms.test.ts.
import { useExport, useExportBusy } from '../../../shared/model';
import { Button } from '../../../shared/ui';
import { PrintButton, type ExportButtonProps } from './PrintButton';
import { SigsButton } from './SigsButton';

/** The Excel button (shows «Δημιουργία…» while this form is made), then print and signatures. */
export function ExportButton({ kind, date, label, variant, size, disabled }: ExportButtonProps) {
  const ex = useExport();
  const busy = useExportBusy();
  return (
    <>
      <Button variant={variant} size={size} disabled={!!busy || disabled} onClick={() => ex(kind, date, label)}>
        {busy === kind ? 'Δημιουργία…' : 'Βγάλε το Excel'}
      </Button>
      <PrintButton kind={kind} date={date} label={label} size={size} disabled={disabled} />
      <SigsButton kind={kind} date={date} label={label} size={size} disabled={disabled} />
    </>
  );
}
