// The time and day row of the exit and entry pop-ups.
// Purpose: `WhenRow` draws the time combo (with the day's time options, «τώρα» first) and the day field.
// Does NOT: hold the values; the pop-up owns them.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { Combo, DateField, useTimeOptions, type ValueEvent } from '../../../shared/ui';
import { normTime } from '../../../../shared/hours';

/** Props of `WhenRow`. */
export interface WhenRowProps {
  /** ISODate, local time. */
  day: string;
  /** `ΩΩ:ΛΛ` or what is being typed. */
  time: string;
  setDay: (day: string) => void;
  setTime: (time: string) => void;
  /** «Ώρα εξόδου» / «Ώρα εισόδου». */
  label: string;
  focus?: boolean;
}

/** Ώρα και μέρα στο μικρό παράθυρο: η τωρινή, αλλάζουν. */
export function WhenRow({ day, time, setDay, setTime, label, focus }: WhenRowProps) {
  const bad = !normTime(time);
  const opts = useTimeOptions(undefined, true);
  return (
    <div className="wpop__when">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Combo draws the input inside the label */}
      <label>
        <span>{label}</span>
        <Combo
          className="ui-input wpop__time"
          inputMode="numeric"
          options={opts}
          value={time}
          aria-invalid={bad || undefined}
          aria-label={label}
          data-autofocus={focus ? '' : undefined}
          onChange={(e: ChangeEvent<HTMLInputElement> | ValueEvent) => setTime(e.target.value)}
          onBlur={() => {
            const t = normTime(time);
            if (t && t !== time) setTime(t);
          }}
        />
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the DateField draws the input inside the label */}
      <label>
        <span>Μέρα</span>
        <DateField
          className="ui-input wpop__day"
          value={day}
          aria-label="Μέρα"
          onChange={(e: ValueEvent) => e.target.value && setDay(e.target.value)}
        />
      </label>
    </div>
  );
}
