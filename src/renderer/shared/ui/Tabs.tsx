// Two kinds of one-of-many switches: `Tabs` (page tabs) and `Segmented` (small toggle group).
// Purpose: show the items as buttons, mark the one equal to `value`, and call `onChange(item.value)` on a click.
// Does NOT: keep the selection (controlled by `value`), or switch the content under the tabs.
// Owner layer: renderer/shared/ui. Why: ~60 screens and dialogs pick one of a few options this way.
// Covering test: test/screens-*.test.ts (tabs and segmented groups are in the screen snapshots).
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/** One tab or segment. */
export interface TabItem<V extends string | number> {
  /** Compared with `===` to the current value; also the React key, so values must be unique. */
  value: V;
  label: ReactNode;
  /** `Segmented` only: tooltip (`data-tip`). */
  tip?: string;
}

/** Props shared by `Tabs` and `Segmented`. `V` is the value type (all call sites use strings). */
export interface SwitchProps<V extends string | number> {
  value: V;
  onChange: (value: V) => void;
  items: TabItem<V>[];
}

/** Page tabs: `role="tablist"` with `aria-selected` on the current tab. Items need no `tip`. */
export function Tabs<V extends string | number>({ value, onChange, items }: SwitchProps<V>) {
  return (
    <div className="ui-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Props of `Segmented`. */
export interface SegmentedProps<V extends string | number> extends SwitchProps<V> {
  /** Compact look (class `ui-seg--sm`). */
  small?: boolean;
  /** Accessible name of the group (`aria-label`), e.g. «Καρτέλες των κανόνων». */
  label?: string;
}

/** Toggle group: `role="group"` with `aria-pressed` on the current button (Strip scrolls to that one). */
export function Segmented<V extends string | number>({ value, onChange, items, small, label }: SegmentedProps<V>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset adds border and legend styling; frozen DOM
    <div className={cx('ui-seg', small && 'ui-seg--sm')} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          data-tip={item.tip}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
