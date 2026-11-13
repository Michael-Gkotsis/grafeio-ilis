// Sixth part of the state of the «Οπλισμός» screen: ticking people by group, by scan, by last exit and by duty.
// Purpose: `useWeaponPick`: `tick` (tick those who can go out of a group and say how many and why not), `byIds`, `doScan`
//   (the scan box: a seat, a weapon number or an ΑΣΜ), the focus the Ctrl+K «Έξοδος όπλων…» asks for, and the two
//   pick menus' lists `redo` («Ξανά οι ίδιοι») and `duties` («Από υπηρεσία»).
// Does NOT: draw the menus (ui/PickMenu.tsx) or write a command.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import { useEffect, useMemo, useRef } from 'react';
import { rkShort } from '../../../entities/person';
import { type Person, shortName } from '../../../../shared/domain';
import { dutyPicks, outSplit, redoGroups, scanFind, skipTxt } from '../../../../shared/weapons';
import type { WeaponBase } from './useWeaponBase';
import type { WeaponSelection } from './useWeaponSelection';

/** The pick bar. */
export function useWeaponPick(base: WeaponBase, selection: WeaponSelection) {
  const { state, nav, info, date } = base;
  const { sel, setSel, scan, setScan, setPickMsg, tab } = selection;
  // Ticks those of a group who can go out, and says how many and why not the rest.
  const tick = (ps: Person[], label: string) => {
    const x = outSplit(ps, info);
    const have = x.go.filter((p) => sel.has(p.id)).length;
    setSel((s) => new Set([...s, ...x.go.map((p) => p.id)]));
    setPickMsg({
      tone: x.go.length ? 'ok' : 'warn',
      text:
        label +
        ': τσεκαρίστηκαν ' +
        x.go.length +
        ' από ' +
        ps.length +
        (have ? ' (' + have + ' ήδη επιλεγμένοι)' : '') +
        (skipTxt(x) ? ' · ' + skipTxt(x) : ''),
    });
  };
  const byIds = (ids: number[]) => {
    const byId = new Map(state.people.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Person[];
  };
  // The scan box: a seat (Ε 23), a weapon number or an ΑΣΜ; from everybody in strength, not only those shown.
  const doScan = () => {
    const t = scan.trim();
    if (!t) return;
    const { hits } = scanFind(t, state.people);
    if (!hits.length) {
      setPickMsg({ tone: 'bad', text: 'Δεν βρέθηκε: ' + t });
      return;
    }
    const x = outSplit(hits, info);
    const add = x.go.filter((p) => !sel.has(p.id));
    const again = x.go.filter((p) => sel.has(p.id));
    const nm = (l: Person[]) => l.map(shortName).join(', ');
    setSel((s) => new Set([...s, ...x.go.map((p) => p.id)]));
    setPickMsg({
      tone: add.length ? 'ok' : 'warn',
      text: [
        add.length > 0 && '✓ ' + add.map((p) => rkShort(p) + ' · ' + p.weapon).join(', '),
        again.length > 0 && nm(again) + ': ήδη επιλεγμένος',
        x.already.length > 0 && nm(x.already) + ': ήδη εκτός',
        x.noW.length > 0 && nm(x.noW) + ': χωρίς αριθμό όπλου',
      ]
        .filter(Boolean)
        .join(' · '),
    });
    setScan('');
  };
  const scanRef = useRef<HTMLInputElement>(null);
  // Ctrl+K «Έξοδος όπλων…» brings you here with the cursor in the scan box.
  useEffect(() => {
    if (nav.params.wfocus === 'scan' && tab === 'weapons') {
      scanRef.current?.focus();
      nav.set({ wfocus: null });
    }
  }, [nav.params.wfocus, tab]);
  const redo = useMemo(() => redoGroups(state.weaponLog), [state.weaponLog]);
  const duties = useMemo(() => dutyPicks(state, date), [state.guards, state.dutyLog, state.settings, date]);
  return { tick, byIds, doScan, scanRef, redo, duties };
}
