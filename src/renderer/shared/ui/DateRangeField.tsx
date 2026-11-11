// «Από – Έως» pair of date fields.
// Purpose: `DateRangeField` edits a closed range (with the duration line) or an open one (only «Από»).
// Does NOT: hold state; the caller keeps `from` and `to`. Keeps `to >= from` when either changes.
// Owner layer: renderer/shared/ui.
// Covering test: test/date-time-fields.test.ts, test/screens-dialogs-forms.test.ts.
import { daysBetween, dayName, type ISODate } from '../../../shared/dates';
import { useStore } from '../model/store';
import { DateField } from './DateField';

/** Props of `DateRangeField`. */
export interface DateRangeFieldProps {
  /** ISODate. */
  from: ISODate;
  /** ISODate. */
  to: ISODate;
  /** Gets both ends after a change. */
  onChange: (from: ISODate, to: ISODate) => void;
  /** Without an end date (only «Από»): «Χωρίς λήξη». */
  open?: boolean;
}

/** The pair of date fields. */
export function DateRangeField({ from, to, onChange, open }: DateRangeFieldProps) {
  const { today } = useStore();
  const n = daysBetween(from, to);
  const fromField = (
    <div className="field">
      <label className="field__label" htmlFor="dr-from">
        Από *
      </label>
      <DateField
        id="dr-from"
        className="ui-input"
        value={from}
        onChange={(e) => {
          const f = e.target.value;
          if (f) onChange(f, to < f ? f : to);
        }}
      />
      <span className="field__help">{dayName(from, today)}</span>
    </div>
  );
  if (open) {
    return (
      <div className="field">
        <div className="field-row">
          {fromField}
          <div className="field">
            <span className="field__label">Έως</span>
            <span className="ui-input ui-input--static">Χωρίς λήξη</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <div className="field-row">
        {fromField}
        <div className="field">
          <label className="field__label" htmlFor="dr-to">
            Έως *
          </label>
          <DateField
            id="dr-to"
            className="ui-input"
            min={from}
            value={to}
            onChange={(e) => {
              const t = e.target.value;
              if (t) onChange(from, t < from ? from : t);
            }}
          />
          <span className="field__help">{dayName(to, today)}</span>
        </div>
      </div>
      <span className="field__help">
        Διάρκεια: {n} {n === 1 ? 'ημέρα' : 'ημέρες'} (μετρούν και οι δύο ημερομηνίες)
      </span>
    </div>
  );
}
