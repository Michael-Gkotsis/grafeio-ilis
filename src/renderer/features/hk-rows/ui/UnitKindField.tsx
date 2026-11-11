// The «Τύπος μονάδας» field: Ίλη (ΗΚΑΙ) or Λόχος (ΗΚΑΛ).
// Purpose: `UnitKindField` picks the unit kind; the names in the app and on the forms follow it by themselves.
// Does NOT: save anything (the caller owns the value).
// Owner layer: renderer/features/hk-rows. Why: moved verbatim from screens/hkrows.ts (Phase 5.3b); used in Ρυθμίσεις and Νέα ΕΣΣΟ.
// Covering test: test/unit.test.ts, test/ux-names.test.ts.
import { UNIT_KINDS, type UnitKind } from '../../../../shared/unit';
import { Segmented } from '../../../shared/ui';

/** Props of `UnitKindField`. */
export interface UnitKindFieldProps {
  value: UnitKind;
  onChange: (k: UnitKind) => void;
}

/** Ίλη/Επιλαρχία ή Λόχος/Τάγμα (στις Ρυθμίσεις και στη Νέα ΕΣΣΟ). */
export function UnitKindField({ value, onChange }: UnitKindFieldProps) {
  return (
    <div className="field">
      <span className="field__label">Τύπος μονάδας</span>
      <Segmented
        value={value}
        onChange={onChange}
        items={UNIT_KINDS.map((k) => ({ value: k.id, label: k.label + ' (' + k.report + ')' }))}
      />
      <span className="field__help">
        Η αναφορά λέγεται ΗΚΑΙ σε ίλη και ΗΚΑΛ σε λόχο. Αλλάζουν μόνα τους τα ονόματα στην εφαρμογή και στα έντυπα
        (τίτλος, γραμμές αξιωματικών, «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ»). Δες και την κεφαλίδα από κάτω.
      </span>
    </div>
  );
}
