// First part of the state of the «Οπλισμός» screen: the route params, the search, the clock and the weapon info.
// Purpose: `useWeaponBase`: the store, the day, the search text, the filters in the route, `reset`, the open «already
//   in use» question, the Excel busy flag, and `info` / `pm` (who has which weapon, who is out and why).
// Does NOT: select people, build the rows or save (the other hooks of useWeapons.ts do).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the hooks are called in
//   the order the screen always called them.
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNav, useStore } from '../../../shared/model';
import { useToast, useViewportHeight } from '../../../shared/ui';
import { nowHM } from '../../../../shared/dates';
import { platoonShort, platoonsOf, type Person } from '../../../../shared/domain';
import { seatMap } from '../../../../shared/rules';
import { weaponInfo, type WeaponFilter } from '../../../../shared/weapons';
import type { WeaponSort } from './view';

/** The question «this number is already in use»: the person, the number and who has it now. */
export interface WeaponAsk {
  p: Person;
  w: string;
  others: Person[];
}

/**
 * The route params and the state every other part reads.
 * @returns `state`, `today`, `tomorrow`, `run`, `undoMark`, `nav`, `toast`, `date` (ISODate shown), the search `q`
 *   (and deferred `dq`), `filter`, `unit`, `room`, `sort`, `reasonF`, `reset` (counter), `height`, `ask`, `xl`, `lists`,
 *   `info` (weapon info of the day) and `pm` (people by id, with cadre in an armed duty)
 */
export function useWeaponBase() {
  const { state, today, tomorrow, run, undoMark } = useStore();
  const nav = useNav();
  const toast = useToast();
  const date: string = nav.params.wdate || today;
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const filter: WeaponFilter = nav.params.wfilter || 'all';
  const unitP: string = nav.params.unit || 'all';
  const unit =
    unitP === 'all' || platoonsOf(state.settings).some((u) => platoonShort(u.name) === unitP) ? unitP : 'all';
  const room: number | null = nav.params.room ?? null;
  const sort: WeaponSort = nav.params.wsort || { k: 'room', dir: 1 };
  const reasonF: string = nav.params.wreason || ''; // exit reason picked in the «Εκτός τώρα» strip
  const [reset, setReset] = useState(0);
  const height = useViewportHeight(360);
  const [ask, setAsk] = useState<WeaponAsk | null>(null);
  const [xl, setXl] = useState(false);
  const lists = state.settings.lists;
  // Today the armed duties are judged by the hour (the number running, before, after); the hour renews itself.
  const [hm, setHm] = useState(nowHM());
  useEffect(() => {
    const t = setInterval(() => setHm(nowHM()), 15000);
    return () => clearInterval(t);
  }, []);
  const live = date === today ? hm : undefined;
  const info = useMemo(
    () => weaponInfo(state, date, live),
    [
      state.people,
      state.settings,
      state.rules,
      state.guards,
      state.dutyLog,
      state.weaponLog,
      state.dutyFix,
      date,
      live,
    ],
  );
  const pm = useMemo(() => seatMap(state), [state.people, state.cadreList]); // also cadre in an armed duty
  return {
    state,
    today,
    tomorrow,
    run,
    undoMark,
    nav,
    toast,
    date,
    q,
    setQ,
    dq,
    filter,
    unit,
    room,
    sort,
    reasonF,
    reset,
    setReset,
    height,
    ask,
    setAsk,
    xl,
    setXl,
    lists,
    info,
    pm,
  };
}

/** Everything `useWeaponBase` returns. */
export type WeaponBase = ReturnType<typeof useWeaponBase>;
