// A number of days for a rule: the usual choices in a list and «Άλλο…» for any number.
// Purpose: `DaysSelect`, used twice by the tab «Κανόνες» of the rules dialog (rest, same number again).
// Does NOT: hold the value (the dialog does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); Michael, 20/10: the usual
//   days in the list and «Άλλο…» for as many as you want.
// Covering test: test/ux-names.test.ts.
import { useState, type ChangeEvent } from 'react';
import { Select, type ValueEvent } from '../../../shared/ui';
import { MAX_DAYS } from '../model/rulesView';

/** Props of {@link DaysSelect}. */
export interface DaysSelectProps {
  id: string;
  value: number;
  onChange: (v: number) => void;
  /** The usual choices: the number of days and its text. */
  opts: [number, string][];
  /** The text of a number that is not in `opts`. */
  txt: (n: number) => string;
}

/** The list, with the days field next to it while «Άλλο…» is chosen. */
export function DaysSelect({ id, value, onChange, opts, txt }: DaysSelectProps) {
  const known = opts.some(([v]) => v === value);
  const [own, setOwn] = useState(!known);
  return (
    <div className="field-row" style={{ alignItems: 'center' }}>
      <Select
        id={id}
        className="ui-input"
        value={own ? 'own' : value}
        onChange={(e: ValueEvent) => {
          if (e.target.value === 'own') {
            setOwn(true);
            if (known) onChange(Math.max(1, value + 1));
          } else {
            setOwn(false);
            onChange(+e.target.value);
          }
        }}
      >
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        <option value="own" data-keep>
          {own ? txt(value) : 'Άλλο…'}
        </option>
      </Select>
      {own && (
        <>
          <input
            type="number"
            min="1"
            max={MAX_DAYS}
            className="ui-input"
            style={{ maxWidth: '90px' }}
            aria-label="Ημέρες"
            value={value}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange(Math.max(1, Math.min(MAX_DAYS, Math.floor(+e.target.value) || 1)))
            }
          />
          <span className="note">ημέρες</span>
        </>
      )}
    </div>
  );
}
