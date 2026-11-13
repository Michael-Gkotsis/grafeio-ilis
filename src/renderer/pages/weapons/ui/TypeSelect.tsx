// The weapon type drop-down of one row.
// Purpose: `TypeSelect`: the list «Τύποι όπλων» (Ρυθμίσεις › Λίστες) plus whatever type the person already has.
// Does NOT: save the pick (`onPick` does).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { fullName, type Person } from '../../../../shared/domain';
import { Select } from '../../../shared/ui';

/** Props of `TypeSelect`. */
export interface TypeSelectProps {
  p: Person;
  /** The types of the list «Τύποι όπλων». */
  types: string[];
  onPick: (p: Person, type: string) => void;
}

/** Type of weapon: from the list, and an old type that is no longer in the list stays as the last option. */
export function TypeSelect({ p, types, onPick }: TypeSelectProps) {
  const opts = p.wtype && !types.includes(p.wtype) ? [...types, p.wtype] : types;
  return (
    <Select
      className="ui-select weapon-type"
      aria-label={'Τύπος όπλου ' + fullName(p)}
      value={p.wtype || ''}
      onChange={(e) => onPick(p, e.target.value)}
    >
      <option value="">—</option>
      {opts.map((t: string) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}
