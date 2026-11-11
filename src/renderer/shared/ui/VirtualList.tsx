// A long list that draws only the rows you can see.
// Purpose: `VirtualList` keeps ~20 absolute-positioned rows in the page however many items there are (Δυναμολόγιο,
//   Ιστορικό…), which is what keeps the old Atom PCs fast.
// Does NOT: know what a row looks like (the caller's `renderRow` draws it), sort, filter or select.
// Owner layer: renderer/shared/ui. Why: three screens need the same windowing and the same scroll reset.
// Covering test: test/perf.test.ts (how many rows are in the page), test/screens-*.test.ts (markup).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject, type UIEvent } from 'react';
import { cx } from '../lib/cx';

/** Props of `VirtualList`. */
export interface VirtualListProps<T> {
  items: readonly T[];
  /** Height of every row in px (rows are all the same height). */
  rowHeight: number;
  /** Visible height of the box in px, at most; a short list makes the box shorter. */
  height: number;
  /**
   * Draws one row. It must put the given `style` on its root (rows are `position: absolute`). The style object of a
   * row is the same object on every render, so `memo` rows do not redraw for nothing.
   */
  renderRow: (item: T, index: number, style: CSSProperties) => ReactNode;
  /**
   * When to go back to the top: a change of filter or search, not every change of data. Default (undefined): when
   * the number of items changes.
   */
  resetKey?: string | number;
  className?: string;
  /** The caller's own ref to the scrolling box (to scroll it from outside). */
  scrollRef?: RefObject<HTMLDivElement>;
  /** Header that stays on top (sticky) inside the same box, so it scrolls sideways with the rows. */
  head?: ReactNode;
  /** Height of `head` in px. */
  headHeight?: number;
  /** Minimum width of the content in px: a narrower box scrolls sideways INSIDE the box (rows are absolute). */
  minWidth?: number;
}

/**
 * Windowed list: 6 rows above and 7 below the visible ones are drawn too.
 * Only the first visible row is kept in state, so scrolling inside the same row repaints nothing.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height,
  renderRow,
  resetKey,
  className,
  scrollRef,
  head,
  headHeight = 0,
  minWidth,
}: VirtualListProps<T>) {
  const own = useRef<HTMLDivElement>(null);
  const ref = scrollRef || own;
  const [first, setFirst] = useState(0);
  const styles = useRef<{ h: number; m: Map<number, CSSProperties> }>({ h: rowHeight, m: new Map() });
  if (styles.current.h !== rowHeight) styles.current = { h: rowHeight, m: new Map() };
  const styleOf = (i: number): CSSProperties => {
    let st = styles.current.m.get(i);
    if (!st) {
      st = { position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight };
      styles.current.m.set(i, st);
    }
    return st;
  };
  const start = Math.max(0, first - 6);
  const end = Math.min(items.length, first + Math.ceil(height / rowHeight) + 7);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = 0;
      setFirst(0);
    }
  }, [resetKey === undefined ? items.length : resetKey]);
  return (
    <div
      ref={ref}
      className={cx('vlist', className)}
      data-rows={items.length}
      style={{ height: Math.min(height, items.length * rowHeight + headHeight + 2) }}
      onScroll={(e: UIEvent<HTMLDivElement>) => setFirst(Math.floor(e.currentTarget.scrollTop / rowHeight))}
    >
      {head && (
        <div className="vlist__head" style={{ minWidth, height: headHeight }}>
          {head}
        </div>
      )}
      <div className="vlist__inner" style={{ height: items.length * rowHeight, minWidth }}>
        {items.slice(start, end).map((item, i) => renderRow(item, start + i, styleOf(start + i)))}
      </div>
    </div>
  );
}
