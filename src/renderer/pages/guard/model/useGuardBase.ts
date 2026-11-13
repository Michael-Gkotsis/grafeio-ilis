// The first hooks of the «Υπηρεσίες» screen: store, navigation, the day, the tab and the dialog flags.
// Purpose: `useGuardBase`, the context hooks, the day on screen, the tab, the «Κανόνες» flag, the Ctrl+K opening and the
//   «Ποιος κάνει τι» person; plus what is read from the state for that day (seats, blocks, empty seats).
// Does NOT: place anybody (model/useGuardActions.ts) or draw (ui/).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged
//   (store, toast, nav, media, export, busy, tab, rules, Ctrl+K effect, who).
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useEffect, useState } from 'react';
import { blocksOf } from '../../../../shared/domain';
import { postsOf, seatMap } from '../../../../shared/rules';
import { useExport, useExportBusy, useNav, useStore } from '../../../shared/model';
import { useMedia, useToast } from '../../../shared/ui';

/**
 * Store, navigation, the day and the small state of the screen.
 * @returns the context (`state`, `run`, `today`, `undoMark`, `toast`, `nav`, `mobile`, `ex`, `xb`), the day (`date`,
 *   `setDate`), the tab (`tab`, `setTab`, `rules`, `setRules`, `who`, `setProf`) and the day's data (`g`, `seatless`,
 *   `posts`, `pm`, `blocks`, `phase`, `empty`, `printed`)
 */
export function useGuardBase() {
  const { state, run, today, tomorrow, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const mobile = useMedia('(max-width: 767px)');
  const ex = useExport();
  const xb = useExportBusy();
  const date = nav.params.guardDate || tomorrow;
  const setDate = (d: string) => nav.set({ guardDate: d });
  const [tab, setTab] = useState('posts');
  const [rules, setRules] = useState(false);
  // From Ctrl+K: opens a tab straight away, or the rules.
  useEffect(() => {
    const o = nav.params.gopen;
    if (!o) return;
    nav.set({ gopen: undefined });
    if (o === 'rules') setRules(true);
    else setTab(o);
  }, [nav.params.gopen]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Ποιος κάνει τι»: the tab, with only the soldier when you come from a name (the key starts it again).
  const [who, setWho] = useState<{ pid: number | null; n: number }>({ pid: null, n: 0 });
  const setProf = (pid: number) => {
    setWho((w) => ({ pid: pid >= 0 ? pid : null, n: w.n + 1 }));
    setTab('who');
  };
  const g = state.guards[date] || {};
  const seatless = state.dutyLog?.[date] || [];
  const posts = postsOf(state.settings);
  const pm = seatMap(state);
  const blocks = blocksOf(state.settings) || state.settings.blocks;
  const phase = state.settings.phase || 'sven';
  const empty = posts.filter((x) => !g[x.k]);
  const printed = state.printed[date];
  return {
    state,
    run,
    today,
    undoMark,
    toast,
    nav,
    mobile,
    ex,
    xb,
    date,
    setDate,
    tab,
    setTab,
    rules,
    setRules,
    who,
    setProf,
    g,
    seatless,
    posts,
    pm,
    blocks,
    phase,
    empty,
    printed,
  };
}

/** What {@link useGuardBase} returns. */
export type GuardBase = ReturnType<typeof useGuardBase>;
