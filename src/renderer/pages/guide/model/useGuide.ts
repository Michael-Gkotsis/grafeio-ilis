// State of the «Οδηγός χρήσης» screen: the open topic, the search box and the search hits.
// Purpose: `useGuide`, the hooks of `GuideScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or parse the texts (model/view.ts).
// Owner layer: renderer/pages/guide. Why: moved verbatim from screens/guide.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-settings-guide.test.ts.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { normGreek } from '../../../../shared/text';
import { GUIDE } from '../../../guideText';
import { useNav, useStore } from '../../../shared/model';
import { byId, searchGuide } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the navigation, the store, the typed text `q` (and its deferred `dq`), the open `topic`, `open`
 *   (clears the search and goes to a topic), the `hits`, the `first` search word and `group` (topics of a group)
 */
export function useGuide() {
  const nav = useNav();
  const { boot, state } = useStore();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const topic = byId.get(nav.params.topic) || byId.get('about') || GUIDE[0];
  const open = (id: string) => {
    setQ('');
    nav.set({ topic: id });
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [topic.id]);
  const hits = useMemo(() => searchGuide(dq), [dq]);
  const first = normGreek(dq).split(/\s+/).filter(Boolean)[0] || '';
  const group = (g: string) => GUIDE.filter((t) => t.group === g);
  return { nav, boot, state, q, setQ, dq, topic, open, hits, first, group };
}

/** The shape `useGuide` returns. */
export type GuideModel = ReturnType<typeof useGuide>;
