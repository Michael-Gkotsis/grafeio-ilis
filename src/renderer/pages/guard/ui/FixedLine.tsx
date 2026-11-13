// The line under the «Λ/Υ και Δ/Υ» block of the posts: who is the permanent Λ/Υ and Δ/Υ, and the button to change them.
// Purpose: `FixedLine`, shown inside the Λ/Υ block of the «Θέσεις» tab.
// Does NOT: change anything (`onEdit` opens the FixedDialog).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); μόνιμος Λ/Υ και Δ/Υ
//   (λοχίας, 10/10): they are placed every day, outside the fair order.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { shortName } from '../../../../shared/domain';
import { personMap } from '../../../../shared/rules';
import { useStore } from '../../../shared/model';
import { Button } from '../../../shared/ui';

/** Props of {@link FixedLine}. */
export interface FixedLineProps {
  onEdit: () => void;
}

/** «Μόνιμοι: Λ/Υ … · Δ/Υ …» with «Άλλαξε» (or «Όρισε μόνιμους» when none is set). */
export function FixedLine({ onEdit }: FixedLineProps) {
  const { state } = useStore();
  const pm = personMap(state.people);
  const f = state.settings.fixed || {};
  const nm = (id?: number) => (id && pm.get(id) ? shortName(pm.get(id)!) : '—');
  return (
    <div className="fixedline">
      <span>
        Μόνιμοι: Λ/Υ <b>{nm(f.ly)}</b> · Δ/Υ <b>{nm(f.dy)}</b>
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        data-tip="Μπαίνουν μόνοι τους κάθε μέρα, εκτός σειράς δικαιοσύνης. Για μία μέρα άλλαξέ τους με «Αλλαγή» στη θέση· ο αντικαταστάτης μετρά υπηρεσία κανονικά."
      >
        {f.ly || f.dy ? 'Άλλαξε' : 'Όρισε μόνιμους'}
      </Button>
    </div>
  );
}
