// A row of buttons that scrolls sideways when it does not fit (the unit switcher, the month strip).
// Purpose: `Strip` wires the mouse wheel to sideways scrolling, fades the edges that hide buttons, and keeps the
//   pressed button in view.
// Does NOT: make the buttons (children do) or know which one is chosen (it looks for `[aria-pressed="true"]`).
// Owner layer: renderer/shared/ui. Why: Segmented groups with many items would break a 1366x768 layout.
// Covering test: test/screens-*.test.ts (markup only; the scrolling is checked by the Electron drive).
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/** Props of `Strip`; other `<div>` attributes are passed through. */
export interface StripProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/**
 * - The wheel scrolls it sideways without Shift (only when it can move; Ctrl+wheel is left to zoom).
 * - Classes `fade-l` / `fade-r` are toggled while buttons are hidden on that side (a ResizeObserver and the scroll).
 * - The pressed button (`aria-pressed="true"`) is scrolled into view, only when the selection changes, so the strip
 *   does not jump back while the user scrolls it.
 */
export function Strip({ className, children, ...rest }: StripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-l', el.scrollLeft > 2);
      el.classList.toggle('fade-r', max > 2 && el.scrollLeft < max - 2);
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const before = el.scrollLeft;
      el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    // why: not passive, because `preventDefault` stops the page scroll when the strip really moved
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    const on = el && (el.querySelector('[aria-pressed="true"]') as HTMLElement | null);
    if (!el || !on || shown.current === on.textContent) return;
    shown.current = on.textContent;
    // `.strip` is position:relative, so offsetLeft is measured from the strip itself
    const left = on.offsetLeft;
    const right = left + on.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = left - 24;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 24;
  });
  return (
    <div ref={ref} className={cx('strip', className)} {...rest}>
      {children}
    </div>
  );
}
