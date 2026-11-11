// A text field with suggestions below (hours, dates, «Ποιος τιμώρησε»).
// Purpose: `Combo` lets the user write anything; its list shows the options that match what is written.
// Does NOT: limit the value to the options (unlike Select), or validate it. The list is built only while open.
// Owner layer: renderer/shared/ui. Why: the date, time and hour-range fields are built on it, and so are many screens.
// Covering test: test/dropdowns.test.ts, test/date-time-fields.test.ts; the Electron drive of Phase 5.2.
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { normGreek } from '../../../shared/text';
import { cx } from '../lib/cx';
import { matches, nextId, valueEvent, type ValueEvent } from './dropdown';
import { useFloat, type FloatPos } from './useFloat';

/**
 * One suggestion. `value` goes into the field; `label` (when given) is what the list shows instead, e.g.
 * «Τρί 21/10/2026 · σήμερα»; `group` puts it under a heading.
 */
export interface ComboOpt {
  value: string;
  label?: string;
  group?: string;
}

/** Props of `Combo`; other `<input>` attributes (id, placeholder, inputMode, aria-invalid…) go to the input. */
export interface ComboProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Suggestions: plain texts, or `ComboOpt` objects when the list shows more than the value or has groups. */
  options?: (string | ComboOpt)[];
  value?: string | number | null;
  /**
   * Gets the real input event while the user types, and `{ target: { value } }` (see `ValueEvent`) when an option
   * is chosen. A handler can rely on `target.value` only.
   */
  onChange?: (e: ChangeEvent<HTMLInputElement> | ValueEvent) => void;
}

const optOf = (o: string | ComboOpt): ComboOpt => (typeof o === 'string' ? { value: o } : o);

interface PopupInput {
  vis: ComboOpt[];
  lid: string;
  /** The text in the field. */
  v: string;
  /** Highlighted option, -1 for none. */
  act: number;
  pos: FloatPos;
  setAct: (i: number) => void;
  set: (s: string) => void;
}

// The floating list of suggestions, drawn in a portal by Combo.
function popup({ vis, lid, v, act, pos, setAct, set }: PopupInput) {
  return (
    <div className="ui-dd__pop" style={pos}>
      <ul
        id={lid}
        className="ui-dd__list"
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
        role="listbox"
        onMouseDown={(e) => e.preventDefault()}
      >
        {vis.map((o, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list rebuilt on every keystroke; index = identity
          <Fragment key={i}>
            {o.group && o.group !== vis[i - 1]?.group && (
              <li className="ui-dd__grp" role="presentation">
                {o.group}
              </li>
            )}
            {/* biome-ignore lint/a11y/useFocusableInteractive: options use aria-activedescendant (frozen DOM) */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: the keys are handled on the input */}
            <li
              id={lid + '-' + i}
              // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
              role="option"
              aria-selected={o.value === v}
              className={cx('ui-opt', i === act && 'is-act')}
              onMouseMove={() => i !== act && setAct(i)}
              onClick={() => set(o.value)}
            >
              {o.label ?? o.value}
            </li>
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

// What the list shows: nothing while closed. Text that already equals an option shows all options, to pick another;
// otherwise the options that match (by value or label), each value once.
function visibleOptions(open: boolean, opts: ComboOpt[], v: string): ComboOpt[] {
  const nv = normGreek(v);
  if (!open) return [];
  if (!nv || opts.some((o) => normGreek(o.value) === nv)) return opts;
  return opts.filter(
    (o, i) =>
      (matches(o.value, v) || (o.label != null && matches(o.label, v))) &&
      opts.findIndex((x) => x.value === o.value) === i,
  );
}

interface KeyInput {
  open: boolean;
  vis: ComboOpt[];
  act: number;
  opts: ComboOpt[];
  v: string;
  setOpen: (open: boolean) => void;
  setAct: (at: number | ((at: number) => number)) => void;
  set: (s: string) => void;
  onKeyDown: ComboProps['onKeyDown'];
}

// Down (or Alt+Up) opens and moves down, Up moves up, Enter chooses the highlighted option, Esc closes and stops
// there; Tab and Enter close; every key not used here goes on to the caller's `onKeyDown`.
function comboKeyHandler({ open, vis, act, opts, v, setOpen, setAct, set, onKeyDown }: KeyInput) {
  return (e: KeyboardEvent<HTMLInputElement>): void => {
    const k = e.key;
    if (k === 'ArrowDown' || (e.altKey && k === 'ArrowUp')) {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setAct(
          Math.max(
            0,
            opts.findIndex((o) => o.value === v),
          ),
        );
      } else setAct((a) => Math.min(vis.length - 1, a + 1));
      return;
    }
    if (open && k === 'ArrowUp') {
      e.preventDefault();
      setAct((a) => Math.max(0, a - 1));
      return;
    }
    if (open && k === 'Enter' && vis[act] != null) {
      e.preventDefault();
      set(vis[act].value);
      return;
    }
    if (open && k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (k === 'Tab' || k === 'Enter') setOpen(false);
    onKeyDown?.(e);
  };
}

/**
 * Text field with suggestions.
 * - Opens on a click, on Down, or when the user types. Up/Down and Enter choose; Esc closes (and stops there).
 * - Everything else goes to the caller's `onKeyDown`; Tab and Enter also close the list.
 * - Text that already equals an option shows all options, to pick another; otherwise only the options that match
 *   (by value or label), each value once.
 * @decision Michael 20/10: one list for the whole app, in place of the Windows `<datalist>`.
 * @see test/dropdowns.test.ts
 */
export function Combo({ options, value, onChange, onKeyDown, onBlur, onClick, ...rest }: ComboProps) {
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const box = useRef<HTMLInputElement>(null);
  const lid = useRef(nextId('cb')).current;
  const pos = useFloat(box, open);
  const v = value == null ? '' : String(value);
  const opts: ComboOpt[] = (options || []).map(optOf);
  const vis = visibleOptions(open, opts, v);
  const sel = vis.findIndex((o) => o.value === v);
  // why: it opens on the value that is written; after that it follows the arrows
  useEffect(() => {
    const at = document.getElementById(lid + '-' + (act < 0 ? sel : act)) as HTMLElement | null;
    at?.scrollIntoView?.({ block: act < 0 ? 'center' : 'nearest' });
  }, [act, pos != null]);
  const set = (s: string) => {
    onChange?.(valueEvent(s));
    setOpen(false);
    setAct(-1);
  };
  const key = comboKeyHandler({ open, vis, act, opts, v, setOpen, setAct, set, onKeyDown });
  return (
    <>
      <input
        {...rest}
        ref={box}
        value={v}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && vis.length > 0}
        aria-controls={open ? lid : undefined}
        aria-activedescendant={open && vis[act] != null ? lid + '-' + act : undefined}
        onChange={(e) => {
          onChange?.(e);
          setOpen(true);
          setAct(-1);
        }}
        onKeyDown={key}
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          setAct(-1);
          onBlur?.(e);
        }}
      />
      {open && pos && vis.length > 0 && createPortal(popup({ vis, lid, v, act, pos, setAct, set }), document.body)}
    </>
  );
}
