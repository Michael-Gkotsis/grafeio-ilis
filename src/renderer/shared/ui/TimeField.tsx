// Time field «ΩΩ:ΛΛ» with a list.
// Purpose: `TimeField` is a Combo whose list starts with the hours that count in the app (duty change, out time, ΗΚΑΙ
//   time, the caller's `quick` hours, «τώρα») and then every half hour. It can be typed: «14», «1400», «14.00» become
//   «14:00» when you leave the field. Typing «14» shows 14:00 and 14:30.
// Does NOT: validate more than the format (`normTime`).
// Owner layer: renderer/shared/ui (reads the rules from the store through shared/model).
// Covering test: test/date-time-fields.test.ts.
// @decision Michael 21/10: «να έχουν values στη λίστα».
import { nowHM } from '../../../shared/dates';
import { DEFAULT_HK_TIME } from '../../../shared/rules';
import { weekRow } from '../../../shared/returns';
import { dutyStartOf } from '../../../shared/domain';
import { normTime } from '../../../shared/hours';
import { HK } from '../../../shared/unit';
import { useStore } from '../model/store';
import { Combo, type ComboOpt } from './Combo';

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => String(i >> 1).padStart(2, '0') + (i % 2 ? ':30' : ':00'));

/** Extra hours at the top of the list: `[time, what it is]`. */
export type TimeQuick = [string, string][];

/**
 * The options of a time list: the caller's `quick` hours (and «τώρα» with `now`) first, then the usual ones, then
 * every half hour.
 * @param quick - extra `[time, label]` pairs
 * @param now - add the current time as «τώρα»
 */
export function useTimeOptions(quick?: TimeQuick, now?: boolean): ComboOpt[] {
  const { state } = useStore();
  const r = state.rules;
  const base: TimeQuick = [
    [dutyStartOf(state.settings), 'αλλαγή υπηρεσίας'],
    ...[1, 2, 3, 4, 5, 6, 0].map((w) => [weekRow(r, w).out, 'ώρα εξόδου'] as [string, string]),
    [r.hkTime || DEFAULT_HK_TIME, 'ώρα ' + HK()],
  ];
  const top = [...(now ? [[nowHM(), 'τώρα'] as [string, string]] : []), ...(quick || []), ...base].filter(
    ([t], i, a) => a.findIndex((x) => x[0] === t) === i,
  );
  return [
    ...top.map(([t, l]) => ({ value: t, label: t + ' · ' + l, group: 'Συνηθισμένες' })),
    ...HALF_HOURS.map((t) => ({ value: t, group: 'Όλες οι ώρες' })),
  ];
}

/** Props of `TimeField`. */
export interface TimeFieldProps {
  id?: string;
  label?: string;
  /** `ΩΩ:ΛΛ` or what is being typed. */
  value: string;
  /** Gets the text itself (not an event). */
  onChange: (value: string) => void;
  help?: string;
  quick?: TimeQuick;
  now?: boolean;
}

/** The time field with its label and help line. */
export function TimeField({ id, label, value, onChange, help, quick, now }: TimeFieldProps) {
  const bad = normTime(value) == null;
  const opts = useTimeOptions(quick, now);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <Combo
        id={id}
        className="ui-input"
        inputMode="numeric"
        options={opts}
        placeholder="π.χ. 14:00"
        value={value}
        aria-invalid={bad || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const t = normTime(value);
          if (t != null && t !== value) onChange(t);
        }}
      />
      <span className="field__help">{bad ? 'Γράψε την ώρα, π.χ. 14:00' : help}</span>
    </div>
  );
}
