// State of the «Θάλαμοι και ουλαμοί» card: the form, the counts, the save and the unsaved-changes registration.
// Purpose: `useRooms`, the hooks of `RoomsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/RoomsCard.tsx) or hold the rules (model/roomsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-rooms-view.test.ts, test/screens-settings-guide.test.ts.
import { useMemo, useState } from 'react';
import type { Platoon } from '../../../../shared/domain';
import { makePlatoons, platoonsOf, roomCfg } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { usePending } from '../../../shared/lib/pending';
import { useToast } from '../../../shared/ui';
import {
  addPlatoon,
  freeRooms,
  outRoomsOf,
  peoplePerRoom,
  platoonProblem,
  removePlatoon,
  renamePlatoon,
  roomsBeyond,
  roomsDirty,
  roomsSave,
  roomsTxt,
  storedRooms,
  toggleOutRoom,
  toggleRoom,
  trimOutRooms,
  type OutDay,
  type OutRooms,
} from './roomsView';

/** The four editable values and the handlers that change them. */
function useRoomsForm() {
  const { state } = useStore();
  const cfg = roomCfg(state.settings);
  const [n, setN] = useState(cfg.n);
  const [per, setPer] = useState(cfg.per);
  const [pl, setPl] = useState<Platoon[]>(() => platoonsOf(state.settings));
  const [out, setOut] = useState<OutRooms>(() => outRoomsOf(state.rules));
  // A new room count or rooms per platoon: the platoons are built again from the start.
  const renum = (nn: number, pp: number) => {
    setN(nn);
    setPer(pp);
    setPl(makePlatoons(nn, pp));
    setOut((o) => trimOutRooms(o, nn));
  };
  return {
    n,
    per,
    pl,
    out,
    setPl,
    renum,
    toggle: (i: number, r: number) => setPl(toggleRoom(pl, i, r)),
    rename: (i: number, name: string) => setPl(renamePlatoon(pl, i, name)),
    addPl: () => setPl(addPlatoon(pl)),
    delPl: (i: number) => setPl(removePlatoon(pl, i)),
    togOut: (d: OutDay, r: number) => setOut(toggleOutRoom(out, d, r)),
    restore: () => {
      const x = storedRooms(state.settings, state.rules);
      setN(x.n);
      setPer(x.per);
      setPl(x.pl);
      setOut(x.out);
    },
  };
}

/**
 * Everything `RoomsCard` reads and calls.
 * @returns the form values and handlers, `beyond` (soldiers in a room that no longer exists), `perRoom`, `free`
 *   (rooms without a platoon), `bad` (why it cannot be saved) and `save`
 */
export function useRooms() {
  const { state, run } = useStore();
  const toast = useToast();
  const f = useRoomsForm();
  const { n, per, pl, out } = f;
  const free = freeRooms(n, pl);
  const bad = platoonProblem(pl);
  const beyond = useMemo(() => roomsBeyond(state.people, n), [state.people, n]);
  const perRoom = useMemo(() => peoplePerRoom(state.people), [state.people]);
  const dirty = roomsDirty({ n, per, pl, out }, storedRooms(state.settings, state.rules));
  const save = async () => {
    if (bad) return false;
    const { rooms, text } = roomsSave({ n, per, pl, out });
    const ok = await run({ t: 'setSettings', settings: { rooms }, text }, false);
    const nr = { ...state.rules, outRooms: { ...state.rules.outRooms, 6: out[6], 0: out[0] } };
    if (ok && JSON.stringify(nr.outRooms) !== JSON.stringify(state.rules.outRooms))
      await run(
        { t: 'setRules', rules: nr, text: 'θάλαμοι εξόδου ΣΑΒ ' + roomsTxt(out[6]) + ', ΚΥΡ ' + roomsTxt(out[0]) },
        false,
      );
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι θάλαμοι και οι ουλαμοί' });
    return ok;
  };
  usePending(dirty, { label: 'Θάλαμοι και ουλαμοί', save, discard: f.restore });
  return { ...f, free, bad, beyond, perRoom, save };
}
