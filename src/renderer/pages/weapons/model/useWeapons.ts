// State of the «Οπλισμός» screen: everything the «Όπλα» tab reads and calls.
// Purpose: `useWeapons`, the hooks of `WeaponsScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the rules (model/view.ts); the «Κινήσεις» tab has its own hook (useMoves.ts).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); split into six hooks
//   called one after the other, which keeps the hook order and every `useMemo` / `useCallback` dependency list.
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { useWeaponBase } from './useWeaponBase';
import { useWeaponBulk } from './useWeaponBulk';
import { useWeaponList } from './useWeaponList';
import { useWeaponPick } from './useWeaponPick';
import { useWeaponSave } from './useWeaponSave';
import { useWeaponSelection } from './useWeaponSelection';
import { weaponTools } from './weaponTools';

/**
 * Everything the screen reads and calls.
 * @returns the parts of the six hooks in one object: the route (`date`, `filter`, `unit`, `room`, `sort`, `tab`), the
 *   rows and numbers (`rows`, `counts`, `armedN`, `outN`...), the selection (`sel`, `selIn`...), the writers (`save`,
 *   `commit`, `paste`) and the handlers (`outNow`, `tick`, `doScan`, `exportXl`, `clear`, `typeAll`)
 */
export function useWeapons() {
  const base = useWeaponBase();
  const selection = useWeaponSelection(base);
  const list = useWeaponList(base, selection);
  const writers = useWeaponSave(base, list);
  const bulk = useWeaponBulk(base, selection, list);
  const pick = useWeaponPick(base, selection);
  const tools = weaponTools(base, selection, list, writers.save);
  return { ...base, ...selection, ...list, ...writers, ...bulk, ...pick, ...tools };
}

/** Everything `useWeapons` returns. */
export type WeaponsApi = ReturnType<typeof useWeapons>;
