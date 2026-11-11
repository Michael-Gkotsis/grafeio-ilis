// Search box that picks one person or several.
// Purpose: `PersonPicker`, a combobox that searches without accents and with Latin letters, shows each person's
//   status or the reason they are unavailable, and picks one (or many, as chips).
// Does NOT: decide who is available (the caller's `unavailable` does) or change anything by itself.
// Owner layer: renderer/entities/person. Why: dialogs of duties, statuses, weapons and reports all pick people.
// Covering test: test/screens-main.test.ts, test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import type { KeyboardEvent } from 'react';
import type { Person } from '../../../../shared/domain';
import type { ISODate } from '../../../../shared/dates';
import { usePersonPicker } from '../model/pickerView';
import { PickerChips, PickerList } from './PickerList';

export interface CommonProps {
  id?: string;
  /** ISODate: the day the status chips describe (default today). */
  date?: ISODate;
  /** Returns the reason a person cannot be chosen, or nothing. */
  unavailable?: (p: Person) => string | null | undefined;
  placeholder?: string;
  autoFocus?: boolean;
  /** A click on an unavailable person: gets the person and the reason. */
  onBlocked?: (p: Person, why: string) => void;
  /** A small note next to the rank (e.g. «2 από 4 τον μήνα» for ΕΠΟΠ/ΟΒΑ in the duties). */
  hint?: (p: Person) => string | null | undefined | false;
  /** Another list than the soldiers (guard duties, ΕΠΟΠ/ΟΒΑ cadre with duties). */
  people?: Person[];
}
/** Pick one person. */
export interface PersonPickerOneProps extends CommonProps {
  multiple?: false;
  value?: number | null;
  onChange: (id: number) => void;
}
/** Pick many people; `value` is the chosen ids. */
export interface PersonPickerManyProps extends CommonProps {
  multiple: true;
  value?: number[] | null;
  onChange: (ids: number[]) => void;
}
export type PersonPickerProps = PersonPickerOneProps | PersonPickerManyProps;

/** The picker: search by surname, first name or ΑΣΜ, accents and Latin spelling ignored. */
export function PersonPicker(props: PersonPickerProps) {
  const { id, date, unavailable, placeholder, autoFocus, onBlocked, hint, people } = props;
  const multiple = props.multiple === true;
  const chosen: number[] = props.multiple ? props.value || [] : [];
  const v = usePersonPicker({
    multiple,
    chosen,
    people,
    unavailable,
    onBlocked,
    onPickOne: (pid) => !props.multiple && props.onChange(pid),
    onPickMany: (ids) => props.multiple && props.onChange(ids),
  });
  const { state, today, q, setQ, open, setOpen, sel, setSel, pm, items, pos } = v;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      v.pick(sel);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Backspace' && !q && props.multiple && chosen.length) {
      props.onChange(chosen.slice(0, -1));
    }
  };
  return (
    <div className="picker">
      {props.multiple && chosen.length > 0 && (
        <PickerChips chosen={chosen} pm={pm} onRemove={(pid) => props.onChange(chosen.filter((x) => x !== pid))} />
      )}
      <input
        ref={v.box}
        id={id}
        className="ui-input"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        data-autofocus={autoFocus ? '' : undefined}
        placeholder={placeholder || (multiple && chosen.length ? 'Πρόσθεσε κι άλλον…' : 'Επώνυμο, όνομα ή ΑΣΜ…')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {open && pos && (
        <PickerList
          items={items}
          sel={sel}
          pos={pos}
          listRef={v.list}
          state={state}
          date={date || today}
          hint={hint}
          onPick={v.pick}
          onHover={setSel}
        />
      )}
    </div>
  );
}
