// The week table of the «Κανόνες υπηρεσιών» dialog (tab «Ώρες»): hours of going out and returning, and training.
// Purpose: `WeekTable`, 7 days × (start of going out, outs' return, ΔΝ return, morning training).
// Does NOT: hold the draft (the dialog does) or decide which hour is valid (`normTime`, model/weekRules.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/outsPlan.ts (Phase 6); same markup and
//   handlers.
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import type { ChangeEvent } from 'react';
import { DOW_FULL } from '../../../../shared/dates';
import { normTime } from '../../../../shared/hours';
import { defaultRow, type WeekRow } from '../../../../shared/returns';
import { WEEK_ORDER, type WeekDraft } from '../model/weekRules';

/** Props of {@link WeekTable}. */
export interface WeekTableProps {
  draft: WeekDraft;
  /** Gets the weekday number (0 = Sunday), the field and the typed text or flag. */
  onChange: (w: number, k: keyof WeekRow, v: string | boolean) => void;
}

/** The table: one row per weekday, Monday first. */
export function WeekTable({ draft, onChange }: WeekTableProps) {
  const cell = (w: number, k: 'out' | 'backOut' | 'backDn', label: string) => {
    const bad = normTime(draft[w][k]) == null || normTime(draft[w][k]) === '';
    return (
      <td>
        <input
          className="ui-input weekt__in"
          inputMode="numeric"
          aria-label={label + ' ' + DOW_FULL[w]}
          aria-invalid={bad || undefined}
          placeholder={defaultRow(w)[k]}
          value={draft[w][k]}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(w, k, e.target.value)}
          onBlur={() => {
            const t = normTime(draft[w][k]);
            if (t && t !== draft[w][k]) onChange(w, k, t);
          }}
        />
      </td>
    );
  };
  return (
    <table className="weekt">
      <thead>
        <tr>
          <th>Ημέρα</th>
          <th>Αρχή εξόδου</th>
          <th>Επιστροφή εξοδούχων</th>
          <th>Επιστροφή ΔΝ</th>
          <th>Εκπαίδευση το πρωί</th>
        </tr>
      </thead>
      <tbody>
        {WEEK_ORDER.map((w) => (
          <tr key={w}>
            <th scope="row">{DOW_FULL[w]}</th>
            {cell(w, 'out', 'Αρχή εξόδου')}
            {cell(w, 'backOut', 'Επιστροφή εξοδούχων')}
            {cell(w, 'backDn', 'Επιστροφή ΔΝ')}
            <td>
              <input
                type="checkbox"
                className="ui-check"
                aria-label={'Εκπαίδευση το πρωί ' + DOW_FULL[w]}
                checked={draft[w].train}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(w, 'train', e.target.checked)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
