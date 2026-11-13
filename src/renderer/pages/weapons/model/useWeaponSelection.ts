// Second part of the state of the «Οπλισμός» screen: the ticked people and the dialogs of the bulk bar.
// Purpose: `useWeaponSelection`: `sel`, the exit / entry dialogs, `onlySel`, the scan box, the pick message, the last
//   reason, and `toggle` (Shift-click ticks everything in between, as shown).
// Does NOT: build the rows (`rowsRef` is filled by useWeaponList) or write a command.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import { useCallback, useMemo, useRef, useState } from 'react';
import { listOf } from '../../../../shared/ranks';
import type { Person } from '../../../../shared/domain';
import { idRange } from '../../../../shared/weapons';
import type { WeaponBase } from './useWeaponBase';

/** The message under the pick bar: green when it worked, yellow or red when somebody was left out. */
export interface PickMsg {
  tone: string;
  text: string;
}

/** The ticked people, the bulk dialogs and the scan box. */
export function useWeaponSelection({ lists, nav }: WeaponBase) {
  // Ticked for exit / entry together; the dialogs: exit (pids) and entry (ids of moves).
  const [sel, setSel] = useState(() => new Set<number>());
  const [outFor, setOutFor] = useState<number[] | null>(null);
  const [outReason, setOutReason] = useState('');
  const outReasons = useMemo(() => listOf(lists, 'weaponOut'), [lists]);
  const [inFor, setInFor] = useState<string[] | null>(null);
  const tab: string = nav.params.wtab || 'weapons';
  const [onlySel, setOnlySel] = useState(false); // «Επιλεγμένοι»: only the ticked, whatever the filters say
  const [scan, setScan] = useState('');
  const [pickMsg, setPickMsg] = useState<PickMsg | null>(null);
  // The last exit reason: «Ώρα…» opens with it, so Enter confirms.
  const [lastReason, setLastReason] = useState('');
  const rowsRef = useRef<Person[]>([]);
  const anchorRef = useRef<number | null>(null);
  // Shift-click: everything in between (as shown) takes the value of the last click.
  const toggle = useCallback((id: number, shift?: boolean) => {
    const a = anchorRef.current;
    anchorRef.current = id;
    setSel((s) => {
      const on = !s.has(id);
      const r =
        shift && a != null
          ? idRange(
              rowsRef.current.map((p) => p.id),
              a,
              id,
            )
          : [];
      const ids = r.length ? r : [id];
      return on ? new Set([...s, ...ids]) : new Set([...s].filter((x) => !ids.includes(x)));
    });
  }, []);
  return {
    sel,
    setSel,
    outFor,
    setOutFor,
    outReason,
    setOutReason,
    outReasons,
    inFor,
    setInFor,
    tab,
    onlySel,
    setOnlySel,
    scan,
    setScan,
    pickMsg,
    setPickMsg,
    lastReason,
    setLastReason,
    rowsRef,
    toggle,
  };
}

/** Everything `useWeaponSelection` returns. */
export type WeaponSelection = ReturnType<typeof useWeaponSelection>;
