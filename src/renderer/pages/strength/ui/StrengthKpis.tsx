// The KPI strip of «Δύναμη»: four counters you can press and the «Έλεγχος» cell with the sum.
// Purpose: `StrengthKpis`, Δύναμη, Παρόντες, Κωλυόμενοι, Απόντες, then «Έλεγχος», drawn by shared/ui `KpiStrip`.
// Does NOT: hold state (the screen passes `cat` and `onPick`) or decide the filter (model/useStrength.ts `pick`).
// Owner layer: renderer/pages/strength. Why: U12 gathered the four old `.kpi` buttons and the `.svline` sum into one
//   strip; U13 moved its markup and look to the shared primitive, so this file only holds the words and numbers.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts.
import { KpiStrip } from '../../../shared/ui';
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
  const cell = (c: SvCat | '', label: string, value: number, tip: string, tone?: 'ok') => ({
    key: c || 'all',
    label,
    value,
    tip,
    tone,
    pressed: cat === c,
    onPick: () => onPick(c),
  });
  return (
    <KpiStrip
      cells={[
        cell('', 'Δύναμη', v.total, 'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη. Πάτα για να δεις όλους'),
        cell(
          'present',
          'Παρόντες',
          v.present,
          'Παρόντες που δεν είναι κωλυόμενοι. Μέσα και όσοι έχουν δική μας υπηρεσία, ΕΥ, ποινή ή ιατρικό',
          'ok',
        ),
        cell(
          'kol',
          'Κωλυόμενοι',
          v.kol,
          'Δηλωμένοι κωλυόμενοι (π.χ. υπηρεσία ΣΤΕΠ) και εισαγωγές ΣΤΕΠ, που αφαιρούνται από τους παρόντες',
        ),
        cell('away', 'Απόντες', v.absent, 'Άδειες, νοσοκομείο, έξοδος και ΔΝ· κάθε άτομο μία φορά'),
      ]}
      check={{
        label: 'Έλεγχος',
        children: (
          <>
            <b>{v.present}</b> + <b>{v.kol}</b> + <b>{v.absent}</b> = <b>{v.total}</b>{' '}
            {isBalanced(v) ? (
              <span className="ui-kpis__ok" role="img" aria-label="βγαίνει">
                ✓
              </span>
            ) : (
              <span className="ui-kpis__bad" role="img" aria-label="δεν βγαίνει">
                ≠
              </span>
            )}
          </>
        ),
      }}
    />
  );
}
