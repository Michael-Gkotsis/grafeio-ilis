// A labelled list that also accepts a value typed by hand («Άλλο…»): rank, weapon, Ο/Σ.
// Purpose: `ChoiceField` shows a Select with the known options and a last entry that reveals a text field.
// Does NOT: remember new values for next time (the caller saves them; `otherHelp` tells the user so).
// Owner layer: renderer/shared/ui. Why: it is built from Select only and knows no domain, so it is not in common.ts.
// Covering test: test/dropdowns.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import { Select } from './Select';

// why: a control character cannot clash with any text a user would type as an option
const OTHER = '\u0001other';

/** Props of `ChoiceField`. */
export interface ChoiceFieldProps {
  /** Id of the list; the label points at it. */
  id?: string;
  label: string;
  /** Current value. A value that is not in `options` opens the hand-typing field at once. */
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  /** Placeholder of the text field. */
  placeholder?: string;
  autoFocus?: boolean;
  /** Text of the last entry, e.g. «Νέος βαθμός…». Default «Άλλο (γράψε το)…». */
  otherLabel?: string;
  /** Help line under the text field, e.g. that the new value stays in the list for next time. */
  otherHelp?: string;
}

/**
 * Choosing «Άλλο…» empties the value (or keeps a value that was not in the list) and shows the text field;
 * choosing a known option hides it.
 */
export function ChoiceField({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  autoFocus,
  otherLabel,
  otherHelp,
}: ChoiceFieldProps) {
  const known = !value || options.includes(value);
  const [typing, setTyping] = useState(!known);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <Select
        id={id}
        className="ui-input"
        value={typing ? OTHER : value || ''}
        data-autofocus={autoFocus ? '' : undefined}
        onChange={(e) => {
          const picked = e.target.value;
          setTyping(picked === OTHER);
          onChange(picked === OTHER ? (known ? '' : (value ?? '')) : picked);
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER} data-keep>
          {otherLabel || 'Άλλο (γράψε το)…'}
        </option>
      </Select>
      {typing && (
        <input
          className="ui-input"
          style={{ marginTop: '6px' }}
          aria-label={label + ' με το χέρι'}
          placeholder={placeholder || ''}
          value={value || ''}
          // biome-ignore lint/a11y/noAutofocus: the hand-typing field opens with the cursor in it (unchanged behaviour)
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {typing && otherHelp && <span className="field__help">{otherHelp}</span>}
    </div>
  );
}
