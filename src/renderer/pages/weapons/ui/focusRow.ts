// Moves the cursor to the input of another row of the weapons table.
// Purpose: `focusRow(field, i)`, used by Enter / ↑ / ↓ inside a row input.
// Does NOT: write anything; blurring when there is no such row is the caller's job.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the table draws only the
//   visible rows, so the helper scrolls to the row first.
// Covering test: test/screens-main.test.ts (weapons).
import { ROW_H, WHEAD } from '../model/layout';

/**
 * Goes to the input of row `i`. If the row is not in the page, scrolls there first and focuses on the next frames.
 * @param f - the `data-wf` field: `weapon`, `rack` or `wpos`
 * @returns `false` when there is no such row (the caller blurs), else `true`
 */
export const focusRow = (f: string, i: number): boolean => {
  const find = () =>
    document.querySelector('input[data-wf="' + f + '"][data-wrow="' + i + '"]') as HTMLInputElement | null;
  const go = (el: HTMLInputElement) => {
    el.focus();
    el.select();
    el.scrollIntoView({ block: 'nearest' });
  };
  const el = find();
  if (el) {
    go(el);
    return true;
  }
  const box = document.querySelector('.weapons__body') as HTMLElement | null;
  if (!box || i < 0 || i >= Number(box.dataset.rows || 0)) return false;
  box.scrollTop = Math.max(0, WHEAD + i * ROW_H - box.clientHeight / 2);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const x = find();
      if (x) go(x);
    }),
  );
  return true;
};
