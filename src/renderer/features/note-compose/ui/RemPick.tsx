// The reminder chips of a note: «Καμία», the quick days and a date field.
// Purpose: `RemPick` picks the reminder date (ISODate, local time) of the note being written or edited.
// Does NOT: save anything; the caller owns the value.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts.
import { useMemo } from 'react';
import { quickRems } from '../../../../shared/notes';
import { useStore } from '../../../shared/model';
import { DateField } from '../../../shared/ui';

/** Props of `RemPick`. `id` is the id of the date field. */
export interface RemPickProps {
  value: string;
  onChange: (rem: string) => void;
  id: string;
}

/** Υπενθύμιση με ένα κλικ (αύριο, Δευτέρα, σε εβδομάδα) ή με ημερομηνία· «Καμία» την αφαιρεί. */
export function RemPick({ value, onChange, id }: RemPickProps) {
  const { today } = useStore();
  const quick = useMemo(() => quickRems(today), [today]);
  return (
    <div className="note-rem">
      <span className="note-lbl">Υπενθύμιση</span>
      <button type="button" className="ui-chip" aria-pressed={!value} onClick={() => onChange('')}>
        Καμία
      </button>
      {quick.map((q) => (
        <button
          key={q.id}
          type="button"
          className="ui-chip"
          aria-pressed={value === q.date}
          onClick={() => onChange(q.date)}
        >
          {q.label}
        </button>
      ))}
      <div className="note-rem__date">
        <DateField
          id={id}
          aria-label="Άλλη μέρα υπενθύμισης"
          value={value}
          min={today}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
