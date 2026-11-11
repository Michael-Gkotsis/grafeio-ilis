// The keyboard of a Select: what each key does while the list is closed and while it is open.
// Purpose: `selectKeyHandler(ctx)` returns the `onKeyDown` of the button and of the search field.
// Does NOT: hold state (the context carries the state and the setters in) or render.
// Owner layer: renderer/shared/ui. Why: the key table is long, so it is separate from the hook that owns the state.
// Covering test: test/dropdowns.test.ts; the Electron drive of Phase 5.2 (arrows, Enter, typing, Esc, Tab).
import type { KeyboardEvent, MutableRefObject, RefObject } from 'react';
import { printable, step } from './dropdown';
import { firstEnabled, seekItem, type Item } from './selectItems';

/** State and actions of one Select that its keys need. */
export interface SelectKeyCtx {
  open: boolean;
  items: Item[];
  /** The options shown now: all of them while closed, the filtered ones while open. */
  vis: Item[];
  /** Index of the current value in `items`, -1 when none. */
  cur: number;
  /** Index of the highlighted option in `vis`. */
  act: number;
  q: string;
  searchable: boolean;
  btn: RefObject<HTMLButtonElement>;
  typed: MutableRefObject<{ s: string; t: number }>;
  setAct: (at: number) => void;
  setQ: (q: string) => void;
  setOpen: (open: boolean) => void;
  show: (text?: string) => void;
  pick: (item?: Item) => void;
  close: () => void;
  filter: (q: string) => Item[];
}

type Key = KeyboardEvent<HTMLElement>;
const MOVE_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'];
const dirOf = (k: string): number => (k === 'ArrowDown' || k === 'PageDown' ? 1 : -1);
const stepOf = (k: string): number => (k.startsWith('Page') ? 8 : 1);

// Closed: arrows change the value as on Windows, a letter goes to the first option that starts with it (a big list
// opens the search instead), Enter, Space, F4 or Alt+Down/Up open the list.
function closedKey(e: Key, c: SelectKeyCtx): void {
  const k = e.key;
  if (k === 'Enter' || k === ' ' || k === 'F4' || (e.altKey && (k === 'ArrowDown' || k === 'ArrowUp'))) {
    e.preventDefault();
    c.show();
  } else if (MOVE_KEYS.includes(k) || k === 'Home' || k === 'End') {
    e.preventDefault();
    const at =
      k === 'Home'
        ? step(c.items, -1, 1)
        : k === 'End'
          ? step(c.items, c.items.length, -1)
          : step(c.items, c.cur, dirOf(k), stepOf(k));
    if (at >= 0) c.pick(c.items[at]);
  } else if (printable(e)) {
    e.preventDefault();
    if (c.searchable) c.show(k);
    else {
      const at = seekItem(c.typed, k, c.items, c.cur);
      if (at >= 0) c.pick(c.items[at]);
    }
  }
}

// Open: arrows and Page keys move, Enter or Tab choose, Esc closes without a change. `inQ`: the key came from the
// search field, which keeps Home/End and the letters for itself.
function openKey(e: Key, c: SelectKeyCtx, inQ: boolean): void {
  const k = e.key;
  if (k === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    c.close();
  } else if (k === 'Enter') {
    e.preventDefault();
    c.pick(c.vis[c.act]);
    c.close();
  } else if (k === 'Tab') {
    c.pick(c.vis[c.act]);
    c.setOpen(false);
    c.setQ('');
    c.btn.current?.focus();
  } else if (MOVE_KEYS.includes(k)) {
    e.preventDefault();
    c.setAct(step(c.vis, c.act, dirOf(k), stepOf(k)));
  } else if (!inQ && (k === 'Home' || k === 'End')) {
    e.preventDefault();
    c.setAct(k === 'Home' ? step(c.vis, -1, 1) : step(c.vis, c.vis.length, -1));
  } else if (!inQ && printable(e)) {
    // why: in a big list the letters go to the search (also those pressed before it appeared)
    e.preventDefault();
    if (c.searchable) {
      const s = c.q + k;
      c.setQ(s);
      c.setAct(firstEnabled(c.filter(s)));
    } else {
      const at = seekItem(c.typed, k, c.vis, c.act);
      if (at >= 0) c.setAct(at);
    }
  }
}

/** `onKeyDown` for the button (list closed or open) and for the search field (list open). */
export const selectKeyHandler =
  (c: SelectKeyCtx) =>
  (e: Key): void => {
    if (c.open) openKey(e, c, e.target !== c.btn.current);
    else closedKey(e, c);
  };
