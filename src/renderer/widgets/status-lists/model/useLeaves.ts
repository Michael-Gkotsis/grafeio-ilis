// State of the «ΗΚΑΙ › Άδειες» list.
// Purpose: `useLeaves`, all hooks of `LeavesTab` in the order the screen always called them, and the derived data.
// Does NOT: draw anything (ui/LeavesTab.tsx does).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/leaves.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/leaves.test.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import type { Status } from '../../../../shared/domain';
import { awayNow, personMap } from '../../../../shared/rules';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useStore } from '../../../shared/model';
import { leaveCounts, leaveRows } from './leaveView';

/** All the state and derived data `LeavesTab` draws from. */
export type LeavesModel = ReturnType<typeof useLeaves>;

export function useLeaves() {
  const { state, today } = useStore();
  const nav = useNav();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const view: string = nav.params.leaveTab === 'back' ? 'back' : 'now';
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [times, setTimes] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const [fix, setFix] = useState<Status | null>(null);
  // came back today and the return time has passed: moves to «Γύρισαν» (Michael 20/10)
  const now = useNowMin();
  const away = (s: Status) => awayNow(s, today, now);
  // who is away now and, apart, who leaves in the next days (the «6» is not 6 people away today, Michael 22/10)
  const [nNow, nSoon] = useMemo(() => leaveCounts(state.statuses, pm, today, away), [state.statuses, today, pm, now]);
  const list = useMemo(
    () => leaveRows({ state, pm, view, today, query: dq, away }),
    [state.statuses, view, today, dq, pm, state.settings.lists, now],
  );
  return {
    state,
    today,
    nav,
    pm,
    view,
    q,
    setQ,
    dq,
    times,
    setTimes,
    end,
    setEnd,
    fix,
    setFix,
    away,
    nNow,
    nSoon,
    list,
  };
}
