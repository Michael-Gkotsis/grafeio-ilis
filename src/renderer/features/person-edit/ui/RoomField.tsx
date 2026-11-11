// The «Θάλαμος» field of the soldier form.
// Purpose: `RoomField` lists the rooms of the settings with their platoon; a room outside the list stays selectable.
// Does NOT: save anything; the form that holds it does.
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/units.ts (Phase 5.3c); only the person form uses it.
// Covering test: test/units.test.ts.
import { platoonsOf, roomCfg } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { Select, type ValueEvent } from '../../../shared/ui';

// Το πεδίο «Θάλαμος» στη φόρμα στρατιώτη: λίστα με τους θαλάμους των ρυθμίσεων και τον ουλαμό τους.
// Αν ο στρατιώτης είναι ήδη σε θάλαμο εκτός λίστας (π.χ. από παλιό Δυναμολόγιο), μένει κι αυτός στη λίστα.
/** Props of `RoomField`. */
export interface RoomFieldProps {
  id: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function RoomField({ id, value, onChange }: RoomFieldProps) {
  const { state } = useStore();
  const pl = platoonsOf(state.settings);
  const rooms = range(roomCfg(state.settings).n);
  if (value != null && !rooms.includes(value)) rooms.push(value);
  const unit = (r: number) => pl.find((u) => u.rooms.includes(r))?.name;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Θάλαμος
      </label>
      <Select
        id={id}
        className="ui-input"
        value={value == null ? '' : String(value)}
        onChange={(e: ValueEvent) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">—</option>
        {rooms.map((r) => (
          <option key={r} value={String(r)}>
            Θάλαμος {r}
            {unit(r) ? ' · ' + unit(r) : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}
