// Date field «ηη/μμ/εεεε» with a list of days.
// Purpose: `DateField` is a Combo that lists today, tomorrow, the day after, the days around the chosen one (with their
//   weekday name and holidays) and «Ημερολόγιο…» for a far day. It can also be typed: «21/10», «21.10.26», «21-10-2026».
// Does NOT: accept a day outside `min`/`max`, or an invalid one (the text goes back to the last good date on blur).
// Owner layer: renderer/shared/ui (reads today and the holidays from the store through shared/model).
// Covering test: test/date-time-fields.test.ts.
// @decision 12/10: dates are written dd/mm/yyyy.
// `onChange` gets `{ target: { value: 'εεεε-μμ-ηη' } }` like the browser's date input, only for a valid day inside
// min/max.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dmy, dow, parseDmy, type ISODate } from '../../../shared/dates';
import { holName } from '../../../shared/rules';
import type { Settings } from '../../../shared/domain';
import { useStore } from '../model/store';
import { Combo, type ComboOpt, type ComboProps } from './Combo';
import { valueEvent, type ValueEvent } from './dropdown';

/** Props of `DateField`; other `<input>` attributes (id, aria-label, disabled…) go to the Combo. */
export interface DateFieldProps extends Omit<ComboProps, 'value' | 'onChange' | 'options'> {
  /** ISODate, or empty. */
  value?: ISODate | '' | null;
  onChange?: (e: ValueEvent) => void;
  /** ISODate: earliest day (for «Έως»: also adds «5/7/10/14 μέρες» quick choices). */
  min?: ISODate;
  /** ISODate: latest day. */
  max?: ISODate;
}

// The Combo value of the last option: opens the browser's date picker.
const CAL = '\u0001cal';

interface OptionsInput {
  settings: Settings;
  today: ISODate;
  anchor: ISODate;
  min?: ISODate;
  ok: (d: ISODate | null) => d is ISODate;
}
// Quick choices, then the days from 7 before to 30 after the anchor, then the calendar entry.
function dateOptions({ settings, today, anchor, min, ok }: OptionsInput): ComboOpt[] {
  const lbl = (d: ISODate, rel?: string) => {
    const h = holName(settings, d);
    return (
      dow(d) + ' ' + dmy(d) + (rel ? ' · ' + rel : d === today ? ' · σήμερα' : '') + (h && h !== 'ΣΚ' ? ' · ' + h : '')
    );
  };
  // «Έως» (with min): and how many days it lasts, counting both
  const quick: [ISODate, string][] = [
    [today, 'σήμερα'],
    [addDays(today, 1), 'αύριο'],
    [addDays(today, 2), 'μεθαύριο'],
    [addDays(today, -1), 'χθες'],
    ...(min ? [5, 7, 10, 14].map((n) => [addDays(min, n - 1), n + ' μέρες'] as [ISODate, string]) : []),
  ];
  const days = Array.from({ length: 38 }, (_, i) => addDays(anchor, i - 7));
  return [
    ...quick.filter(([d]) => ok(d)).map(([d, rel]) => ({ value: dmy(d), label: lbl(d, rel), group: 'Γρήγορα' })),
    ...days.filter(ok).map((d) => ({ value: dmy(d), label: lbl(d), group: 'Μέρες' })),
    { value: CAL, label: 'Άλλη μέρα από το ημερολόγιο…', group: ' ' },
  ];
}

/** The date field. */
export function DateField({ value, onChange, min, max, className, ...rest }: DateFieldProps) {
  const { state, today } = useStore();
  const shown = value ? dmy(value) : '';
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const cal = useRef<HTMLInputElement>(null);
  const ok = (d: ISODate | null): d is ISODate => !!d && (!min || d >= min) && (!max || d <= max);
  const anchor = value || today;
  const opts = useMemo(
    () => dateOptions({ settings: state.settings, today, anchor, min, ok }),
    [anchor, today, min, max, state.settings],
  );
  const commit = (t: string) => {
    const d = parseDmy(t, anchor);
    if (ok(d)) {
      setText(dmy(d));
      if (d !== value) onChange?.(valueEvent(d));
    } else setText(shown);
  };
  const change = (e: { target: { value: string } }) => {
    const t: string = e.target.value;
    if (t === CAL) {
      try {
        cal.current?.showPicker();
      } catch {
        cal.current?.focus();
      }
      return;
    }
    setText(t);
    // with the year, or from the list: at once; otherwise when you leave the field or press Enter
    const d = parseDmy(t, anchor);
    if (ok(d) && /\d{4}\s*$/.test(t) && d !== value) onChange?.(valueEvent(d));
  };
  return (
    <Fragment>
      <Combo
        {...rest}
        className={className || 'ui-input'}
        inputMode="numeric"
        placeholder="ηη/μμ/εεεε"
        options={opts}
        value={text}
        aria-invalid={(text && !ok(parseDmy(text, anchor))) || undefined}
        onChange={change}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text);
        }}
      />
      <input
        ref={cal}
        type="date"
        className="datefld__cal"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => e.target.value && ok(e.target.value) && onChange?.(valueEvent(e.target.value))}
      />
    </Fragment>
  );
}
