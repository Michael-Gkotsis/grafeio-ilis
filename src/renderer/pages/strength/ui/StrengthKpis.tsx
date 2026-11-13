// The KPI strip of «Δύναμη»: four counters you can press and the «Έλεγχος» cell with the sum.
// Purpose: `StrengthKpis`, one bordered row: Δύναμη, Παρόντες, Κωλυόμενοι, Απόντες, then «Έλεγχος».
// Does NOT: hold state (the screen passes `cat` and `onPick`) or decide the filter (model/useStrength.ts `pick`).
// Owner layer: renderer/pages/strength. Why: U12 gathered the four old `.kpi` buttons and the `.svline` sum into one
//   strip with its own `strength__*` classes, so the legacy `.kpi*` rules (also used by «Σήμερα») stay untouched.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts.
import { HK } from '../../../../shared/unit';
import type { SvCat } from '../../../../shared/strengthView';
import type { StrengthDay } from '../model/view';
import { isBalanced } from '../model/view';

/** Props of `StrengthKpis`. */
export interface StrengthKpisProps {
  v: StrengthDay;
  /** The pressed counter, `''` = none (all). */
  cat: SvCat | '';
  onPick: (c: SvCat | '') => void;
}

/** The four counters (buttons with `aria-pressed`, same tooltips as always) and the sum check. */
export function StrengthKpis({ v, cat, onPick }: StrengthKpisProps) {
  const cell = (c: SvCat | '', label: string, n: number, tip: string, mod?: string) => (
    <button
      type="button"
      className={mod ? 'strength__kpi ' + mod : 'strength__kpi'}
      aria-pressed={cat === c}
      data-tip={tip}
      onClick={() => onPick(c)}
    >
      <span className="strength__kpi-l">{label}</span>
      <span className="strength__kpi-n">{n}</span>
    </button>
  );
  return (
    <div className="strength__kpis">
      {cell('', 'Δύναμη', v.total, 'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη. Πάτα για να δεις όλους')}
      {cell(
        'present',
        'Παρόντες',
        v.present,
        'Παρόντες που δεν είναι κωλυόμενοι. Μέσα και όσοι έχουν δική μας υπηρεσία, ΕΥ, ποινή ή ιατρικό',
        'strength__kpi--ok',
      )}
      {cell(
        'kol',
        'Κωλυόμενοι',
        v.kol,
        'Δηλωμένοι κωλυόμενοι (π.χ. υπηρεσία ΣΤΕΠ) και εισαγωγές ΣΤΕΠ, που αφαιρούνται από τους παρόντες',
      )}
      {cell('away', 'Απόντες', v.absent, 'Άδειες, νοσοκομείο, έξοδος και ΔΝ· κάθε άτομο μία φορά')}
      <div className="strength__check">
        <span className="strength__kpi-l">Έλεγχος</span>
        <span className="strength__sum num">
          <b>{v.present}</b> + <b>{v.kol}</b> + <b>{v.absent}</b> = <b>{v.total}</b>{' '}
          {isBalanced(v) ? (
            <span className="strength__ok" role="img" aria-label="βγαίνει">
              ✓
            </span>
          ) : (
            <span className="strength__bad" role="img" aria-label="δεν βγαίνει">
              ≠
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
