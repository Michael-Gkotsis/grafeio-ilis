// Month list «Μήνας εεεε».
// Purpose: `MonthField` is a Select with the 12 months before and the 3 after the current one, newest first.
// Does NOT: accept a free text; a `value` outside the list is added at the end so it stays visible.
// Owner layer: renderer/shared/ui (reads today from the store through shared/model).
// Covering test: test/date-time-fields.test.ts.
import { MONTHS } from '../../../shared/dates';
import { useStore } from '../model/store';
import { Select, type SelectProps } from './Select';

/** Props of `MonthField`: those of `Select`, with `value` as `'εεεε-μμ'`. */
export type MonthFieldProps = Omit<SelectProps, 'children'>;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The month field. */
export function MonthField({ value, onChange, ...rest }: MonthFieldProps) {
  const { today } = useStore();
  const ms = Array.from({ length: 16 }, (_, i) => {
    const d = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1 + 3 - i, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  });
  if (value && !ms.includes(String(value))) ms.push(String(value));
  return (
    <Select className="ui-input" value={value} onChange={onChange} {...rest}>
      {ms.map((m) => (
        <option key={m} value={m}>
          {MONTHS[+m.slice(5) - 1]} {m.slice(0, 4)}
        </option>
      ))}
    </Select>
  );
}
