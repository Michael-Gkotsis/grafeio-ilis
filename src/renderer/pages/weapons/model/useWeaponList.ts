// Third part of the state of the «Οπλισμός» screen: the rows of the table and the numbers around them.
// Purpose: `useWeaponList`: the weapon types, the platoon chips, the filter counts, the rooms, the sorted `rows`, who is
//   out now and why, who can go out of the ticked, and what the header tick selects.
// Does NOT: save or select anything (useWeaponSave / useWeaponActions do).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); every `useMemo` keeps the
//   dependency list it always had (a new list would redraw all rows).
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { useEffect, useMemo } from 'react';
import { useOpenFrom } from '../../../shared/model';
import { UNIT } from '../../../../shared/unit';
import { cadreSeats } from '../../../../shared/rules';
import { listOf } from '../../../../shared/ranks';
import { platoonShort, platoonsOf, type Person } from '../../../../shared/domain';
import { canOut, outPeople, outReasons as byReason, outSplit, weaponKey } from '../../../../shared/weapons';
import { filterCounts, roomCounts, weaponPlace, weaponRows } from './view';
import type { WeaponBase } from './useWeaponBase';
import type { WeaponSelection } from './useWeaponSelection';

/** The rows and the numbers around them. */
export function useWeaponList(base: WeaponBase, selection: WeaponSelection) {
  const { state, info, lists, filter, unit, room, sort, reasonF, dq } = base;
  const { sel, onlySel, setOnlySel, rowsRef } = selection;
  const types = useMemo(() => listOf(lists, 'weaponTypes'), [lists]);
  const UNITS = useMemo(
    () => [
      { value: 'all', label: UNIT().all },
      ...platoonsOf(state.settings).map((u) => ({
        value: platoonShort(u.name),
        label: platoonShort(u.name),
        tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους',
      })),
    ],
    [state.settings.rooms],
  );
  const place = (p: Person) => weaponPlace(p, unit, room, state.settings);
  const counts = useMemo(
    () => filterCounts(state.people, place, info),
    [state.people, info, unit, room, state.settings.rooms],
  );
  const rooms = useMemo(() => roomCounts(state.people), [state.people]);
  const onlyS = onlySel && sel.size > 0;
  const rows = useMemo(
    () => weaponRows({ people: state.people, place, filter, info, dq, reasonF, onlySel: onlyS, sel, sort }),
    [state.people, info, filter, dq, unit, room, sort, state.settings.rooms, onlyS, onlyS && sel, reasonF],
  );
  rowsRef.current = rows;
  const openP = useOpenFrom(rows);
  const total = state.people.filter((p) => p.active).length;
  // The header, the «Εκτός οπλοβαστού» chip and the «Κινήσεις» tab count the same people: moves and armed duties, once each.
  const armPpl = useMemo(() => [...state.people, ...cadreSeats(state)], [state.people, state.cadreList]); // out now: also cadre in an armed duty
  const outN = useMemo(() => outPeople(armPpl, info).length, [armPpl, info]);
  const reasons = useMemo(() => byReason(armPpl, info), [armPpl, info]);
  const selP = state.people.filter((p) => sel.has(p.id));
  const sp = outSplit(selP, info);
  const selIn = sp.go; // the ticked who can go out
  const shown = useMemo(() => new Set(rows.map((p) => p.id)), [rows]);
  const hidN = selP.filter((p) => !shown.has(p.id)).length;
  const selOut = selP.map((p) => info.moves.get(p.id)).filter(Boolean) as { id: string }[];
  // Header tick: those shown AND able to go out; if nobody (e.g. filter «Εκτός οπλοβαστού»), those out, for ΕΝΤΟΣ.
  const tickable = useMemo(() => {
    const g = rows.filter((p) => canOut(p, info));
    return g.length ? g : rows.filter((p) => info.moves.has(p.id));
  }, [rows, info]);
  const allSel = tickable.length > 0 && tickable.every((p) => sel.has(p.id));
  useEffect(() => {
    if (!sel.size) setOnlySel(false);
  }, [sel]);
  const armedN = state.people.filter((p) => p.active && weaponKey(p.weapon)).length;
  return {
    types,
    UNITS,
    counts,
    rooms,
    onlyS,
    rows,
    openP,
    total,
    outN,
    reasons,
    selP,
    sp,
    selIn,
    hidN,
    selOut,
    tickable,
    allSel,
    armedN,
  };
}

/** Everything `useWeaponList` returns. */
export type WeaponList = ReturnType<typeof useWeaponList>;
