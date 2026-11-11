// State and facts behind the ΕΝΤΟΣ | ΕΚΤΟΣ switch of one weapon row.
// Purpose: `useWeaponState` holds the open pop-up, the move being edited and the armed number being fixed;
//   `weaponStateFacts` works out, from the weapon info of the day, whether the weapon is out, why, and the times to show
//   (Michael, 24/10: an armed duty is out automatically, with the times of the number).
// Does NOT: draw anything (ui/WeaponState.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import { useRef, useState } from 'react';
import { useStore } from '../../../shared/model';
import { armWhen, type ArmRow } from '../../../../shared/armed';
import type { Person, WeaponMove } from '../../../../shared/domain';
import type { ArmInfo, WeaponInfo } from '../../../../shared/weapons';

/** Props of `WeaponState`. */
export interface WeaponStateProps {
  p: Person;
  /** The weapon info of the day (`weaponInfo(state, date, live)`). */
  info: WeaponInfo;
  /** People by id. */
  pm: Map<number, Person>;
}

/** The pop-up and dialog state of one row. */
export function useWeaponState() {
  const { state, today } = useStore();
  const lists = state.settings.lists;
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<WeaponMove | null>(null);
  const [fix, setFix] = useState<ArmRow | null>(null);
  return { lists, today, ref, open, setOpen, edit, setEdit, fix, setFix };
}

/** What the row shows; `null` when the person has no weapon and nothing is going on («χωρίς όπλο» / «—»). */
export function weaponStateFacts({ p, info }: WeaponStateProps) {
  const m: WeaponMove | undefined = info.moves.get(p.id);
  const duty: string | undefined = info.out.get(p.id);
  const arm: ArmInfo = info.arm;
  const has = !!p.weapon;
  const cur = arm.cur.get(p.id);
  const day = !arm.live && duty ? arm.rows.filter((r: ArmRow) => r.owner === p.id) : []; // τρέχον νούμερο, ή όλα της μέρας
  const nxt = arm.next.get(p.id);
  const prv = arm.prev.get(p.id);
  const hold = arm.holding.get(p.id);
  if (!m && !duty && !(p.active && has) && !nxt) return { none: true as const, has };
  const out = !!m || !!duty;
  const auto = !m && !!duty;
  const first = cur || day[0];
  const times = first
    ? arm.live
      ? armWhen(first)
      : day.length > 1 && first.mode === 'own'
        ? day.map(armWhen).join(' ')
        : armWhen({ out: first.out, in: day[day.length - 1].in })
    : '';
  return { none: false as const, has, m, duty, arm, cur, day, nxt, prv, hold, out, auto, first, times };
}

/** What `weaponStateFacts` returns for a row that shows something. */
export type WeaponStateFacts = Extract<ReturnType<typeof weaponStateFacts>, { none: false }>;
