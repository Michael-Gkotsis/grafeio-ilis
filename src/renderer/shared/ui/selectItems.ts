// The options of a Select, read from its `<option>` children, and the search through them.
// Purpose: `itemsOf(children)` turns `<option>`, `<optgroup>`, arrays and Fragments into a flat list of items;
//   `seekItem` finds the next option that starts with the typed letters.
// Does NOT: render anything, or hold the open/closed state (see Select.tsx).
// Owner layer: renderer/shared/ui. Why: the parsing and the type-ahead are pure, so they are tested without a DOM.
// Covering test: test/dropdowns.test.ts.
import { Fragment, isValidElement, type MutableRefObject, type ReactNode } from 'react';
import { normGreek } from '../../../shared/text';

/** A Select option after parsing. */
export interface Item {
  value: string;
  text: string;
  disabled: boolean;
  /** `<option data-keep>`: shown even when the search does not find it (e.g. «Άλλο (γράψε το)…»). */
  keep: boolean;
  /** The `label` of the `<optgroup>` it sits in. */
  group?: string;
}

/** Index of the first enabled option of `xs`; 0 when there is none (the list then shows nothing selectable). */
export const firstEnabled = (xs: Item[]): number =>
  Math.max(
    0,
    xs.findIndex((x) => !x.disabled),
  );

/** From this many options on, the list has a search field. */
export const SEARCH_FROM = 10;

interface OptionProps {
  children?: ReactNode;
  value?: string | number;
  disabled?: boolean;
  label?: string;
  'data-keep'?: unknown;
}

/** The text of a React node: strings and numbers as they are, elements by their children, `null`/booleans as ''. */
export const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as OptionProps).children);
  return String(node);
};

// why: not `Children.toArray`: it clones every element (new key each), which costs on screens with ~20 lists
// (Οπλισμός). Arrays are flattened as `Children.forEach` did; null, booleans and text are skipped by the caller.
const flatten = (node: ReactNode): ReactNode[] => (Array.isArray(node) ? node.flatMap(flatten) : [node]);

/**
 * Options are written as in a native select list: `<option>`, `<optgroup label>`, and arrays or Fragments of those.
 * Anything else (text, other elements) is ignored. A missing `value` means the option text.
 */
export function itemsOf(children: ReactNode, group?: string): Item[] {
  return flatten(children).flatMap((child): Item[] => {
    if (!isValidElement(child)) return [];
    const props = child.props as OptionProps;
    if (child.type === 'optgroup') return itemsOf(props.children, props.label);
    if (child.type === Fragment) return itemsOf(props.children, group);
    if (child.type !== 'option') return [];
    const text = textOf(props.children);
    const value = props.value == null ? text : String(props.value);
    return [{ value, text, disabled: !!props.disabled, keep: props['data-keep'] != null, group }];
  });
}

/**
 * Letters typed in a row (within 0.8 s) look for the first enabled option that starts with them, after the current one.
 * @param typed - the letters so far and the time of the last one (updated here)
 * @returns the index found, or -1
 */
export function seekItem(
  typed: MutableRefObject<{ s: string; t: number }>,
  key: string,
  options: Item[],
  from: number,
): number {
  const now = Date.now();
  const t = typed.current;
  t.s = (now - t.t < 800 ? t.s : '') + key;
  t.t = now;
  const s = normGreek(t.s);
  const n = options.length;
  // why: a single letter starts after the current option (so pressing «Α» again moves on); more letters may stay on it
  const first = t.s.length > 1 ? 0 : 1;
  const order = Array.from({ length: n + 1 - first }, (_, j) => (from + first + j + n) % n);
  return order.find((i) => !options[i].disabled && normGreek(options[i].text).startsWith(s)) ?? -1;
}
