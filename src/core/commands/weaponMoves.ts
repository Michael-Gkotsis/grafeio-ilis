// Checks of a weapon movement: reason, time and a corrected move.
//
// Purpose: `wReason` (capitals), `wTime` (ΩΩ:ΛΛ, required) and `editedMove` (a move after a correction, with the same
//   checks).
// Does NOT: save the move.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: One or many moves are corrected with the same rules, in `editWeaponMove` and `editWeaponMoves`.
// Covering tests: test/weapons.test.ts.
import type { AppState } from '../model/state';
import type { WeaponMove } from '../model/records';
import { weaponBack } from '../people/ranks';
import { normTime } from '../lib/time';

/** Weapons: reason in capitals, time ΩΩ:ΛΛ (required). */
export const wReason = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
/**
 * Normalizes the hour of a weapon move to `ΩΩ:ΛΛ`. Throws «Γράψε την ώρα {what}, π.χ. 08:15» when it is missing or
 * invalid.
 */
export function wTime(v: unknown, what: string): string {
  const t = normTime(v);
  if (!t) throw new Error('Γράψε την ώρα ' + what + ', π.χ. 08:15');
  return t;
}
/**
 * The weapon move after a correction (one or many together): same checks; an error if the entry comes before the
 * exit or the soldier has another open one.
 */
export function editedMove(
  s: AppState,
  m: WeaponMove,
  pt: Partial<Pick<WeaponMove, 'reason' | 'outDay' | 'outTime' | 'inDay' | 'inTime' | 'inReason' | 'note'>>,
): WeaponMove {
  const x: WeaponMove = { ...m };
  if (pt.reason !== undefined) {
    const r = wReason(pt.reason);
    if (!r) throw new Error('Ο λόγος εξόδου δεν μένει κενός');
    x.reason = r;
  }
  if (pt.outDay) x.outDay = pt.outDay;
  if (pt.outTime !== undefined) x.outTime = wTime(pt.outTime, 'εξόδου');
  if (pt.note !== undefined) {
    if (pt.note.trim()) x.note = pt.note.trim();
    else delete x.note;
  }
  if (pt.inDay === '') {
    delete x.inDay;
    delete x.inTime;
    delete x.inReason;
  } else {
    if (pt.inDay) x.inDay = pt.inDay;
    if (pt.inTime !== undefined && x.inDay) x.inTime = wTime(pt.inTime, 'εισόδου');
    if (pt.inReason !== undefined && x.inDay)
      x.inReason = wReason(pt.inReason) || weaponBack(x.reason, s.settings.lists);
  }
  if (x.inDay && x.inDay + ' ' + (x.inTime || '') < x.outDay + ' ' + x.outTime)
    throw new Error('Η είσοδος είναι πριν την έξοδο');
  if (!x.inDay && (s.weaponLog || []).some((y) => y.id !== x.id && y.pid === x.pid && !y.inDay))
    throw new Error('Το όπλο του έχει ήδη άλλη έξοδο χωρίς είσοδο');
  return x;
}
