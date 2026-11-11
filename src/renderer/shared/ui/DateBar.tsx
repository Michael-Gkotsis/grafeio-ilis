// Day buttons: weekday above, date below.
// Purpose: `DateBar` is a strip of buttons for the given days (today and tomorrow named), highlights holidays, shows
//   an optional count (e.g. empty seats) next to the date, and ends with a date field for any other day.
// Does NOT: choose the days (the caller passes `days`) or keep the selection (`value` and `onChange` do).
// Owner layer: renderer/shared/ui (reads today and the holidays from the store through shared/model).
// Covering test: test/screens-main.test.ts (the duty and outs screens).
import type { ISODate } from '../../../shared/dates';
import { dm, dow } from '../../../shared/dates';
import { holName, isHol } from '../../../shared/rules';
import { cx } from '../lib/cx';
import { useStore } from '../model/store';
import { DateField } from './DateField';
import { Strip } from './Strip';

/** Props of `DateBar`. */
export interface DateBarProps {
  /** ISODate: the selected day. */
  value: ISODate;
  onChange: (d: ISODate) => void;
  /** ISODates, in order. */
  days: ISODate[];
  /** A number shown next to a day's date (0 shows «✓»); `null` for none. */
  count?: (d: ISODate) => number | null;
}

/** The day buttons. */
export function DateBar({ value, onChange, days, count }: DateBarProps) {
  const { state, today, tomorrow } = useStore();
  return (
    <Strip className="datebar" role="group" aria-label="Ημερομηνία">
      {days.map((d) => {
        const hol = isHol(state.settings, d);
        const n: number | null = count ? count(d) : null;
        const tip = [
          hol && 'Αργία: ' + holName(state.settings, d),
          n != null && (n ? n + (n === 1 ? ' κενή θέση' : ' κενές θέσεις') : 'Πλήρης'),
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <button
            key={d}
            type="button"
            className={cx('daybtn', hol && 'is-hol')}
            aria-pressed={value === d}
            data-tip={tip || undefined}
            onClick={() => onChange(d)}
          >
            <span className="daybtn__d">
              {dow(d)}
              {d === today ? ' σήμερα' : d === tomorrow ? ' αύριο' : ''}
            </span>
            <span className="daybtn__n">
              {dm(d)}
              {n == null ? (
                ''
              ) : n ? (
                <>
                  {' · '}
                  <b>{n}</b>
                </>
              ) : (
                ' ✓'
              )}
            </span>
          </button>
        );
      })}
      <DateField
        className="ui-input datebar__pick"
        aria-label="Άλλη ημερομηνία"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </Strip>
  );
}
