// Small helpers that Select and Combo share.
// Purpose: the change event they send to `onChange`, the text search, the ids of their lists, the step over disabled
//   options, and the "is this a printable key" test.
// Does NOT: render or hold state.
// Owner layer: renderer/shared/ui. Why: Select.tsx and Combo.tsx need the same pieces; neither may import the other.
// Covering test: test/dropdowns.test.ts, test/date-time-fields.test.ts.
import { normGreek, translit } from '../../../shared/text';

/**
 * What Select and Combo send to `onChange` (and what a field built on them sends): the same `{ target: { value } }`
 * as the native select list they replace, so the screens did not have to change. Combo also forwards the real
 * input event while the user types, so a handler may only rely on `target.value` (and `currentTarget.value`).
 */
export interface ValueEvent {
  target: { value: string };
  currentTarget: { value: string };
}

/** The event for a chosen `value`. */
export const valueEvent = (value: string): ValueEvent => ({ target: { value }, currentTarget: { value } });

/**
 * Does `text` contain `query`, ignoring accents and case, or when `query` is typed with Latin letters for the Greek
 * ones («papad» finds «Παπαδόπουλος»)?
 */
export const matches = (text: string, query: string): boolean =>
  normGreek(text).includes(normGreek(query)) || translit(text).includes(translit(query));

let seq = 0;
/**
 * A new element id for a list, `<prefix><n>`. The counter is shared by all lists on purpose (as before the move), and
 * it also counts re-renders: call it as `useRef(nextId('dd')).current`, which takes the first value only.
 */
export const nextId = (prefix: string): string => prefix + ++seq;

/** A key that types a character (one character, no Ctrl, Alt or Meta). */
export const printable = (e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean =>
  e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;

/**
 * The index of the `n`-th enabled option from `from` (exclusive) going down (`d` = 1) or up (`d` = -1); the last
 * enabled one that exists when there are fewer than `n`; `from` itself when there is none. `from` may be -1 or
 * `options.length` to start before the first or after the last option; a `from` further out finds nothing.
 */
export const step = (options: { disabled: boolean }[], from: number, d: number, n = 1): number => {
  const start = from + d;
  const inside = start >= 0 && start < options.length;
  const room = !inside ? 0 : d > 0 ? options.length - start : start + 1;
  const enabled = Array.from({ length: room }, (_, j) => start + d * j).filter((i) => !options[i].disabled);
  const taken = enabled.slice(0, n);
  return taken.length ? taken[taken.length - 1] : from;
};
