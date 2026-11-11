// State, save and 1-9 reason keys of the exit pop-up under the ΕΝΤΟΣ | ΕΚΤΟΣ switch.
// Purpose: `useOutPop` holds the time, day, note and the «Άλλος λόγος» text of one weapon; `go(reason)` runs `weaponOut`
//   for it; the effect listens to keys 1-9 (no Shift) while no text field has the focus.
// Does NOT: draw anything (ui/OutPop.tsx). The keys are a frozen contract (CLAUDE.md, rule 3): do not change them.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { rkShort } from '../../../entities/person';
import { typingText } from '../../../shared/lib/typing';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { listOf } from '../../../../shared/ranks';
import { when } from './text';

/** Props of the exit pop-up. */
export interface OutPopProps {
  /** The person whose weapon goes out. */
  p: Person;
  /** The switch the pop-up opens under. */
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
}

/** State of the exit pop-up. */
export function useOutPop({ p, onClose }: OutPopProps) {
  const { state, run, undoMark, today } = useStore();
  const toast = useToast();
  const lists = state.settings.lists;
  const reasons: string[] = useMemo(() => listOf(lists, 'weaponOut'), [lists]);
  const [day, setDay] = useState(todayFn());
  const [time, setTime] = useState(nowHM());
  const [note, setNote] = useState('');
  const [other, setOther] = useState('');
  const [hover, setHover] = useState('');
  const go = async (reason: string) => {
    const t = normTime(time);
    if (!reason.trim() || !t) return;
    if (!(await run({ t: 'weaponOut', pids: [p.id], reason, day, time: t, note }, false))) return;
    toast({
      text: rkShort(p) + ': όπλο ' + p.weapon + ' ΕΚΤΟΣ (' + reason.trim().toUpperCase() + ') ' + when(day, t, today),
      actions: [undoMark()],
    });
    onClose();
  };
  const tip = hover || other.trim();
  // 1-9 διαλέγουν τον λόγο όταν δεν γράφεις σε πεδίο (η εστίαση ξεκινά στο παράθυρο, όχι στην ώρα)
  const keys = useRef(go);
  keys.current = go;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        typingText(document.activeElement) ||
        !/^[1-9]$/.test(e.key) ||
        !reasons[+e.key - 1]
      )
        return;
      e.preventDefault();
      keys.current(reasons[+e.key - 1]);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [reasons]);
  return { lists, reasons, day, setDay, time, setTime, note, setNote, other, setOther, setHover, go, tip };
}

/** What `useOutPop` returns. */
export type OutPopState = ReturnType<typeof useOutPop>;
