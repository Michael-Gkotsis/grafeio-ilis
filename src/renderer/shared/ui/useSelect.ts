// The state and actions of one Select: open/closed, search text, highlighted option, and the handlers.
// Purpose: `useSelect` parses the options, owns the state, and returns what Select.tsx needs to draw.
// Does NOT: draw anything, or know the keys (selectKeys.ts).
// Owner layer: renderer/shared/ui. Why: keeps the Select component under the function-size limit.
// Covering test: test/dropdowns.test.ts; the Electron drive of Phase 5.2.
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { matches, nextId, step, valueEvent, type ValueEvent } from './dropdown';
import { selectKeyHandler } from './selectKeys';
import { firstEnabled, itemsOf, SEARCH_FROM, type Item } from './selectItems';
import { useFloat, type FloatPos } from './useFloat';

/** What Select.tsx gets from `useSelect`. */
export interface SelectModel {
  open: boolean;
  q: string;
  act: number;
  pos: FloatPos | null;
  btn: RefObject<HTMLButtonElement>;
  list: RefObject<HTMLUListElement>;
  /** Id of the list element; options are `<lid>-<index>`. */
  lid: string;
  /** The current value, as a string. */
  v: string;
  /** The option that shows in the button (the first one when the value matches none). */
  shown: Item | undefined;
  searchable: boolean;
  /** The options in the list now: all while closed, the filtered ones while open. */
  vis: Item[];
  setQ: (q: string) => void;
  setAct: (at: number) => void;
  show: (text?: string) => void;
  close: () => void;
  pick: (item?: Item) => void;
  filter: (q: string) => Item[];
  onKey: (e: KeyboardEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
}

/** Input of `useSelect`: the Select props that drive its behavior. */
export interface SelectInput {
  children?: ReactNode;
  value?: string | number | null;
  onChange?: (e: ValueEvent) => void;
  disabled?: boolean;
  search?: boolean;
}

interface ListEffectsInput {
  open: boolean;
  act: number;
  /** The list has a position, so it is in the page. */
  ready: boolean;
  btn: RefObject<HTMLButtonElement>;
  list: RefObject<HTMLUListElement>;
  setOpen: (open: boolean) => void;
}

// Keeps the highlighted option in view, and closes the list (no change) on a mouse press outside button and list.
function useListEffects({ open, act, ready, btn, list, setOpen }: ListEffectsInput): void {
  useEffect(() => {
    (list.current?.querySelector('.is-act') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [act, open, ready]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.parentElement?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', out, true);
    return () => document.removeEventListener('mousedown', out, true);
  }, [open]);
}

/** State, effects and handlers of a Select. */
export function useSelect({ children, value, onChange, disabled, search }: SelectInput): SelectModel {
  const items = itemsOf(children);
  const v = value == null ? '' : String(value);
  const cur = items.findIndex((x) => x.value === v);
  const shown = items[Math.max(0, cur)];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const lid = useRef(nextId('dd')).current;
  const pos = useFloat(btn, open);
  const searchable = search ?? items.length >= SEARCH_FROM;
  const filter = (s: string) => (s ? items.filter((x) => x.keep || matches(x.text, s)) : items);
  const vis = open ? filter(q) : items;
  useListEffects({ open, act, ready: pos != null, btn, list, setOpen });
  const pick = (x?: Item) => {
    if (x && !x.disabled && x.value !== v) onChange?.(valueEvent(x.value));
  };
  const close = () => {
    setOpen(false);
    setQ('');
    btn.current?.focus();
  };
  const show = (text = '') => {
    if (disabled || !items.length) return;
    setQ(text);
    setAct(text ? firstEnabled(filter(text)) : cur < 0 ? step(items, -1, 1) : cur);
    setOpen(true);
  };
  const onKey = selectKeyHandler({
    open,
    items,
    vis,
    cur,
    act,
    q,
    searchable,
    btn,
    typed,
    setAct,
    setQ,
    setOpen,
    show,
    pick,
    close,
    filter,
  });
  // the focus went elsewhere (another window, say): close without a change
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Element | null;
    if (open && !(to && (to === btn.current || to.closest('.ui-dd__pop')))) {
      setOpen(false);
      setQ('');
    }
  };
  return {
    open,
    q,
    act,
    pos,
    btn,
    list,
    lid,
    v,
    shown,
    searchable,
    vis,
    setQ,
    setAct,
    show,
    close,
    pick,
    filter,
    onKey,
    onBlur,
  };
}
