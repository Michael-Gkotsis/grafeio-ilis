// Where a floating list goes: under its field, or above it when there is no room below.
// Purpose: `useFloat(ref, open, minWidth)` returns the CSS position of the list, updated on scroll and resize.
// Does NOT: render the list or close it (Select, Combo and PersonPicker do).
// Owner layer: renderer/shared/ui. Why: three kinds of lists float the same way, so they cannot be cut by dialogs,
//   cards or the bottom of the screen.
// Covering test: test/dropdowns.test.ts (the lists), test/layout-fit.test.ts.
import { useLayoutEffect, useState, type CSSProperties } from 'react';

/** Position of a floating list, in px, as inline style: `top` (opens down) or `bottom` (opens up). */
export type FloatPos = Pick<CSSProperties, 'top' | 'bottom' | 'left' | 'width' | 'minWidth' | 'maxWidth' | 'maxHeight'>;

/**
 * @param ref - the field the list belongs to (a button or an input)
 * @param open - nothing is measured, and `null` is returned, while the list is closed
 * @param minWidth - the list is at least this wide, in px (person pickers); without it the list is as wide as the
 *   field or wider as the options need (160-520 px)
 * @returns the position, or `null` while closed or not measured yet. Opens upwards when there are less than 220 px
 *   below the field and more room above. Scrolling inside the list itself (`.ui-dd__pop`, `.picker__list`) does not
 *   move it.
 */
export function useFloat(ref: { current: HTMLElement | null }, open: boolean, minWidth?: number): FloatPos | null {
  const [pos, setPos] = useState<FloatPos | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = (e?: Event) => {
      const el = ref.current;
      if (!el) return;
      if (e && e.target instanceof Element && e.target.closest('.ui-dd__pop,.picker__list')) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      const maxHeight = Math.max(120, Math.min(320, up ? above : below));
      const vw = document.documentElement.clientWidth;
      const at: FloatPos = up ? { bottom: vh - r.top + 4, maxHeight } : { top: r.bottom + 4, maxHeight };
      if (minWidth) {
        const width = Math.min(Math.max(r.width, minWidth), vw - 16);
        const left = Math.max(8, Math.min(r.left, vw - width - 8));
        setPos({ left, width, ...at });
        return;
      }
      // why: near the right edge the list moves a little to the left, so the options fit on one line
      const min = Math.min(Math.max(r.width, 160), vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - Math.max(min, 280) - 8));
      setPos({ left, minWidth: min, maxWidth: Math.max(min, Math.min(520, vw - left - 8)), ...at });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);
  return pos;
}
