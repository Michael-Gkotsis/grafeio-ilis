// The «Εκτύπωση» button of a form.
// Purpose: `PrintButton` makes the Excel as usual and opens the print preview with the Windows printer dialog (no Excel needed).
// Does NOT: make the file (the export context does).
// Owner layer: renderer/widgets/export. Why: moved verbatim from renderer/common.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts.
import type { ExportKind } from '../../../../shared/api';
import type { ISODate } from '../../../../shared/dates';
import { useExport, useExportBusy } from '../../../shared/model';
import { Button, Icon } from '../../../shared/ui';

/** Props of `PrintButton`. `date` is an ISODate (local time); `label` is the form's name as in «η ΗΚΑΙ». */
export interface ExportButtonProps {
  kind: ExportKind;
  date: ISODate;
  label: string;
  variant?: string;
  size?: string;
  disabled?: boolean;
}

/** Εκτύπωση: βγαίνει το Excel όπως πάντα και ανοίγει προεπισκόπηση με τον διάλογο εκτυπωτή των Windows (χωρίς Excel). */
export function PrintButton({ kind, date, label, variant = 'ghost', size, disabled }: ExportButtonProps) {
  const ex = useExport();
  const busy = useExportBusy();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={!!busy || disabled}
      onClick={() => ex(kind, date, label, true)}
      data-tip="Βγαίνει το Excel και ανοίγει προεπισκόπηση εκτύπωσης. Δεν χρειάζεται Excel."
    >
      {Icon.print}Εκτύπωση
    </Button>
  );
}
