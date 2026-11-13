// State and actions of the search box of «Ρυθμίσεις».
// Purpose: `useSettingsSearch`: the typed query, the results, the selected result, and opening a result.
// Does NOT: draw anything (ui/SettingsSearch.tsx) or save the query (it is local state, no localStorage key).
// Owner layer: renderer/pages/settings. Why: U11b; keeps the screen component short and the keys testable.
// Covering test: test/screens-settings-guide.test.ts (render), test/settings-index.test.ts (the search itself).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { requestLeave } from '../../../shared/lib/pending';
import { useNav } from '../../../shared/model';
import { isTabWhere, searchSettings, wordsOf, type SettingEntry } from './settingsIndex';

/** What the search box needs: values and handlers. */
export interface SettingsSearch {
  q: string;
  /** True while there is something typed (the body shows results instead of the section). */
  on: boolean;
  setQ: (q: string) => void;
  results: SettingEntry[];
  words: string[];
  /** Index of the selected result. */
  pick: number;
  setPick: (i: number) => void;
  open: (entry: SettingEntry) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Put on the element that holds the section: it is scrolled into view after a result opened it. */
  bodyRef: RefObject<HTMLDivElement>;
}

/**
 * @param section - the open section key, so the page scrolls to the card once the result has opened it
 * @param dsub - the open «Υπηρεσίες και αργίες» part, for the same reason
 */
export function useSettingsSearch(section: string, dsub: string | undefined): SettingsSearch {
  const nav = useNav();
  const [q, setQuery] = useState('');
  const [pick, setPick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scroll = useRef(false);
  const results = useMemo(() => searchSettings(q), [q]);
  const setQ = (next: string) => {
    setQuery(next);
    setPick(0);
  };
  // Scroll after the render that shows the opened card; `scrollIntoView` is missing in the test DOM.
  useEffect(() => {
    if (!scroll.current) return;
    scroll.current = false;
    bodyRef.current?.scrollIntoView?.({ block: 'start' });
  }, [section, dsub, q]);
  const open = (entry: SettingEntry) =>
    requestLeave(() => {
      scroll.current = true;
      setQ('');
      const where = entry.where;
      if (isTabWhere(where)) nav.set({ tab: where.tab, dsub: where.dsub });
      else nav.go(where.view, where.params);
    });
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && q) {
      e.preventDefault();
      e.stopPropagation();
      setQ('');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setPick((pick + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    } else if (e.key === 'Enter' && results[pick]) {
      e.preventDefault();
      open(results[pick] as SettingEntry);
    }
  };
  return { q, on: q.trim() !== '', setQ, results, words: wordsOf(q), pick, setPick, open, onKeyDown, bodyRef };
}
