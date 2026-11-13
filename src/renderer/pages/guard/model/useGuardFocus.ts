// Focus and scroll of the «Υπηρεσίες» posts: «Επόμενη κενή» (button or key Ν) and the sticky bar of the posts.
// Purpose: `useGuardFocus`, the preview flag, the next-empty-seat walk with its keyboard shortcut and the observer
//   that sticks the bar while you scroll.
// Does NOT: place anybody (model/useGuardActions.ts) or hold the pure choice of the seat (model/guardView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged
//   (preview, goK, lastK, reset effect, nextEmpty, goK effect, key effect, sentinel, stuck, observer).
//   @decision frozen shortcut: key Ν / N goes to the next empty seat and opens its person picker.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextEmptyKey } from './guardView';
import type { GuardBase } from './useGuardBase';
import type { GuardState } from './useGuardState';

/**
 * @param b the base hooks of the screen
 * @param s the small state of the screen
 * @returns `preview`, `setPreview`, `nextEmpty`, `sentinel` (ref of the marker above the bar) and `stuck`
 */
export function useGuardFocus(b: GuardBase, s: GuardState) {
  const { date, g, posts, blocks, toast, tab, mobile } = b;
  const { locked, setFold } = s;
  const [preview, setPreview] = useState(false);
  // «Επόμενη κενή»: goes to the next empty seat, opens its group and the person picker. It continues after the last
  // seat you went to (or are typing in), else from those on screen.
  const [goK, setGoK] = useState<string | null>(null);
  const lastK = useRef<string | null>(null);
  useEffect(() => {
    lastK.current = null;
  }, [date]);
  const nextEmpty = useCallback(() => {
    const id = (document.activeElement as HTMLElement | null)?.id || '';
    const from = id.startsWith('gp-') ? id.slice(3) : lastK.current;
    const k = nextEmptyKey(blocks, posts, g, from, (q) => {
      const top = (document.querySelector('.topbar') as HTMLElement | null)?.offsetHeight || 60;
      const el = document.getElementById('gp-' + q);
      return !el || el.getBoundingClientRect().top > top + 60;
    });
    if (!k) {
      toast({ text: 'Δεν έμεινε κενή θέση' });
      return;
    }
    const block = posts.find((x) => x.k === k)!.block;
    lastK.current = k;
    setFold((f) => ({ ...f, [block]: true }));
    setGoK(k);
  }, [posts, blocks, g]);
  useEffect(() => {
    if (!goK) return;
    setGoK(null);
    const el = document.getElementById('gp-' + goK) as HTMLInputElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus();
    }
  }, [goK]);
  useEffect(() => {
    if (locked || tab !== 'posts') return;
    const h = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || '') ||
        document.querySelector('.ui-overlay,.ui-sheet')
      )
        return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'ν' || e.key === 'Ν') {
        e.preventDefault();
        nextEmpty();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [locked, tab, nextEmpty]);
  // The bar of the posts stays on top while you scroll, with the main buttons of the page.
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const top = (document.querySelector('.topbar') as HTMLElement | null)?.offsetHeight || 60;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1), {
      rootMargin: '-' + (top + 1) + 'px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, mobile]);
  return { preview, setPreview, nextEmpty, sentinel, stuck };
}

/** What {@link useGuardFocus} returns. */
export type GuardFocus = ReturnType<typeof useGuardFocus>;
