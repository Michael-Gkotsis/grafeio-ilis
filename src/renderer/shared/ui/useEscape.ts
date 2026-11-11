// Esc handling for stacked dialogs and sheets.
// Purpose: `useEscape(fn)` calls `fn` when Esc is pressed and this is the top-most user of the hook.
// Does NOT: close anything itself (the caller's `fn` decides), or listen while nothing uses the hook.
// Owner layer: renderer/shared/ui. Why: Dialog, Sheet and the command palette must agree on who gets the Esc.
// Covering test: test/screens-dialogs-shell.test.ts (Esc closes only the top dialog).
import { useEffect, useRef } from 'react';

// why: Esc closes only the top-most window (e.g. the legend above a declaration), not all of them together.
const escStack: { current: () => void }[] = [];
const onEsc = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape' || !escStack.length) return;
  e.stopPropagation();
  escStack[escStack.length - 1].current();
};

/**
 * @param fn - called on Esc while this component is the last one mounted that uses the hook; the latest `fn` of every
 *   render is used (no stale closure). Another handler on the document does not see the Esc (propagation stops).
 */
export function useEscape(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!escStack.length) document.addEventListener('keydown', onEsc);
    escStack.push(ref);
    return () => {
      const at = escStack.lastIndexOf(ref);
      if (at >= 0) escStack.splice(at, 1);
      if (!escStack.length) document.removeEventListener('keydown', onEsc);
    };
  }, []);
}
