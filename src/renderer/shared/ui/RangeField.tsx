// The hours of a duty seat as «ΑΠΟ-ΕΩΣ» (e.g. 08:00-20:00).
// Purpose: `RangeField` is a Combo that suggests the usual ranges; any other text can be written.
// Does NOT: check the format (the callers normalise it with src/shared/hours).
// Owner layer: renderer/shared/ui. Why: it is a Combo with a fixed list and no domain code, so it is not in common.ts.
// Covering test: test/date-time-fields.test.ts, test/screens-dialogs-forms.test.ts.
import { Combo, type ComboProps } from './Combo';

const HOUR_RANGES = [
  '06:00-08:00',
  '06:00-14:00',
  '07:30-08:00',
  '08:00-14:00',
  '08:00-16:00',
  '08:00-20:00',
  '14:00-20:00',
  '14:00-22:00',
  '16:00-24:00',
  '20:00-08:00',
  '22:00-06:00',
];

/** The usual hour ranges in a list; every Combo prop (and `options` itself) may be given and wins. */
export const RangeField = (props: ComboProps) => <Combo className="ui-input" options={HOUR_RANGES} {...props} />;
