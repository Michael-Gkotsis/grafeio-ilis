// The «Υπογραφές…» button of an exportable form.
// Purpose: `SigsButton` is a `SigsMenu` wired to the export context: it exports with other signatures this time (or for good).
// Does NOT: edit signatures itself (SigsMenu opens the dialog).
// Owner layer: renderer/widgets/export. Why: moved verbatim from renderer/common.ts (Phase 5.3b).
// Covering test: test/sigs-all-forms.test.ts.
import { sigFormOf, type Sig } from '../../../../shared/sigs';
import { useExport, useExportBusy } from '../../../shared/model';
import type { ExportButtonProps } from './PrintButton';
import { SigsMenu } from './SigsMenu';

/** «Υπογραφές…»: βγαίνει με άλλες υπογραφές αυτή τη φορά (ή και τις επόμενες, στις Ρυθμίσεις). */
export function SigsButton({ kind, date, label, variant = 'ghost', size, disabled }: ExportButtonProps) {
  const ex = useExport();
  const busy = useExportBusy();
  return (
    <SigsMenu
      form={sigFormOf(kind)}
      date={date}
      label={label}
      variant={variant}
      size={size}
      disabled={!!busy || disabled}
      go={(pr: boolean, sigs?: Sig[]) => ex(kind, date, label, pr, sigs)}
    />
  );
}
