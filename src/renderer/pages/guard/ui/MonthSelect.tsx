// The «Μήνας» list of the duty counts: one month, or «Όλοι οι μήνες» (counts the earlier duties too).
// Purpose: `MonthSelect`, used by the check list and by the bar of the posts.
// Does NOT: hold the month (`useDutyMonth` does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same props and markup.
// Covering test: test/screens-main.test.ts.
import { Select, type ValueEvent } from '../../../shared/ui';
import { monLbl } from '../model/checkView';
import type { DutyMonth } from '../model/useDutyMonth';

/** Props of {@link MonthSelect}. */
export interface MonthSelectProps {
  m: DutyMonth;
  /** CSS width, default `190px`. */
  width?: string;
  /** The smaller list of the bar of the posts. */
  small?: boolean;
}

/** The list. */
export const MonthSelect = ({ m, width = '190px', small }: MonthSelectProps) => (
  <Select
    className="ui-input"
    style={{ flex: '0 0 ' + width, width, ...(small ? { height: '32px', fontSize: '13px' } : {}) }}
    aria-label="Μήνας"
    data-tip="Υπηρεσίες μόνο αυτού του μήνα· «Όλοι οι μήνες» μετρά και τις προηγούμενες υπηρεσίες"
    value={m.allM ? '' : m.ym}
    onChange={(e: ValueEvent) => {
      const v = e.target.value;
      m.setAllM(!v);
      if (v) m.setYm(v);
    }}
  >
    <option value="">Όλοι οι μήνες</option>
    {m.months.map((x) => (
      <option key={x} value={x}>
        {monLbl(x)}
      </option>
    ))}
  </Select>
);
