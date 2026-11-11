// Locks the page scroll while a dialog is open.
// Purpose: `lockScroll()` sets `overflow: hidden` on the body and returns the function that gives it back.
// Does NOT: know which dialog asked, or restore a scroll position.
// Owner layer: renderer/shared/lib. Why: Dialog (shared/ui) needs it, so it cannot stay above shared.
// Covering test: test/scroll-lock.test.ts.
type Target = { style: { overflow: string } };
// why: a counter, not a flag. Two dialogs closing together (e.g. «Κλείσε χωρίς αποθήκευση») left the page without
// scroll (review 29/10): only the last release may unlock.
const counts = new WeakMap<object, number>();

/**
 * @param target - the element to lock; the body by default
 * @returns release function; calling it twice is harmless (only the first call counts)
 * @decision review 29/10: nested locks are counted per target
 * @see test/scroll-lock.test.ts
 */
export function lockScroll(target: Target = document.body): () => void {
  const n = counts.get(target) || 0;
  counts.set(target, n + 1);
  if (n === 0) target.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const m = (counts.get(target) || 1) - 1;
    counts.set(target, Math.max(0, m));
    if (m <= 0) target.style.overflow = '';
  };
}
