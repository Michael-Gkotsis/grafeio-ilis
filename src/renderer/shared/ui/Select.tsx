// The dropdown list of the app, in place of the Windows `<select>`.
// Purpose: `Select` is a button with the value and an arrow; its list opens below (or above) in a portal.
// Does NOT: send a real change event: `onChange` gets `{ target: { value }, currentTarget: { value } }` like the
//   `<select>`, so the screens did not change. The list is built only while open (tables with many lists stay light).
// Owner layer: renderer/shared/ui. Why: one box, one list, one set of keys, search on long lists.
// Covering test: test/dropdowns.test.ts; keys and search are exercised by the Electron drive of Phase 5.2.
import { Fragment, type ButtonHTMLAttributes, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import type { ValueEvent } from './dropdown';
import { Icon } from './Icon';
import { firstEnabled } from './selectItems';
import type { FloatPos } from './useFloat';
import { useSelect, type SelectModel } from './useSelect';

/** Props of `Select`; other `<button>` attributes (id, aria-label, data-autofocus…) go to the button. */
export interface SelectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children' | 'disabled'> {
  /** Current value; `null`/`undefined` mean '' and numbers are compared as text. No match shows the first option. */
  value?: string | number | null;
  /** Gets `{ target: { value } }` (see `ValueEvent`). Not called when the same option is picked again. */
  onChange?: (e: ValueEvent) => void;
  /** `<option>`, `<optgroup label>`, and arrays or Fragments of them. `data-keep` keeps an option under a search. */
  children?: ReactNode;
  /** Replaces the default class `ui-select` of the button (the `ui-dd` class always stays). */
  className?: string;
  disabled?: boolean;
  /** Search field in the list. Default: from 10 options on. */
  search?: boolean;
}

// The floating list: optional search field, then the options with their group headings.
function popup(m: SelectModel, pos: FloatPos) {
  const { vis, act, lid, q, searchable, v } = m;
  return (
    <div className="ui-dd__pop" style={pos}>
      {searchable && (
        <input
          className="ui-dd__q"
          // biome-ignore lint/a11y/noAutofocus: the search opens with the cursor in it (unchanged behaviour)
          autoFocus
          autoComplete="off"
          placeholder="Αναζήτηση…"
          aria-label="Αναζήτηση στη λίστα"
          aria-controls={lid}
          aria-activedescendant={vis[act] ? lid + '-' + act : undefined}
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const s = e.target.value;
            m.setQ(s);
            m.setAct(firstEnabled(m.filter(s)));
          }}
          onKeyDown={m.onKey}
          onBlur={m.onBlur}
        />
      )}
      <ul
        ref={m.list}
        id={lid}
        className="ui-dd__list"
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
        role="listbox"
        onMouseDown={(e) => e.preventDefault()}
      >
        {vis.length === 0 ? (
          <li className="ui-dd__none">Τίποτα δεν ταιριάζει</li>
        ) : (
          vis.map((x, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list rebuilt on every search; index = identity
            <Fragment key={i}>
              {x.group && x.group !== vis[i - 1]?.group && (
                <li className="ui-dd__grp" role="presentation">
                  {x.group}
                </li>
              )}
              {/* biome-ignore lint/a11y/useFocusableInteractive: options use aria-activedescendant (frozen DOM) */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the button and search */}
              <li
                id={lid + '-' + i}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
                role="option"
                aria-selected={x.value === v}
                aria-disabled={x.disabled || undefined}
                className={cx('ui-opt', i === act && 'is-act', x.disabled && 'is-off')}
                onMouseMove={() => i !== act && !x.disabled && m.setAct(i)}
                onClick={() => {
                  if (!x.disabled) {
                    m.pick(x);
                    m.close();
                  }
                }}
              >
                {x.text}
              </li>
            </Fragment>
          ))
        )}
      </ul>
    </div>
  );
}

/**
 * Select: a button with the value; the list opens below, or above when there is no room.
 * - Closed: Up/Down change the value as on Windows; a letter jumps to the first option that starts with it (on long
 *   lists it opens the search); Enter, Space, F4 or Alt+Down open the list.
 * - Open: Up/Down, PageUp/PageDown move; Enter or Tab choose; Esc closes without a change; a click outside closes.
 * @decision Michael 20/10: «σε πολλά δεν έχουμε καθόλου styling και consistency» - one list for the whole app.
 * @see test/dropdowns.test.ts
 */
export function Select({ value, onChange, children, className, disabled, search, ...rest }: SelectProps) {
  const m = useSelect({ children, value, onChange, disabled, search });
  const { open, vis, act, lid, searchable, shown } = m;
  return (
    <>
      <button
        {...rest}
        ref={m.btn}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? lid : undefined}
        aria-activedescendant={open && !searchable && vis[act] ? lid + '-' + act : undefined}
        disabled={disabled}
        className={cx('ui-dd', className || 'ui-select', open && 'is-open')}
        onClick={() => (open ? m.close() : m.show())}
        onKeyDown={m.onKey}
        onBlur={m.onBlur}
      >
        <span className="ui-dd__v">{shown ? shown.text : ''}</span>
        {Icon.down}
      </button>
      {open && m.pos && createPortal(popup(m, m.pos), document.body)}
    </>
  );
}
