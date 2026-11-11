// Two hooks that follow the window: a CSS media query, and the height left for a list.
// Purpose: `useMedia('(max-width: 900px)')` -> true/false live; `useViewportHeight(offset)` -> px for a VirtualList.
// Does NOT: debounce (a resize event per frame is fine for these two states) or read the DOM size of an element.
// Owner layer: renderer/shared/ui. Why: screens switch between phone and desktop layouts and size their lists.
// Covering test: test/screens-*.test.ts (the SSR render uses the initial values), test/perf.test.ts.
import { useEffect, useState } from 'react';

/**
 * @param query - a CSS media query, e.g. `(max-width: 900px)`
 * @returns whether it matches now; updates on the `change` event (the query may change between renders too)
 */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * @param offset - px that the rest of the page takes (header, toolbar…)
 * @returns `window.innerHeight - offset`, never below 320 (a list stays usable on a short window)
 */
export function useViewportHeight(offset: number): number {
  const [height, setHeight] = useState(() => Math.max(320, window.innerHeight - offset));
  useEffect(() => {
    const update = () => setHeight(Math.max(320, window.innerHeight - offset));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [offset]);
  return height;
}
