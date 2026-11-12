// State of the leaves switch of the «ΗΚΑΙ» preview: is «3. Άδειες» written for the shown day, and the save.
// Purpose: `useLeavesToggle`, the hooks of `HkLeavesToggle`.
// Does NOT: draw anything (ui/HkLeavesToggle.tsx).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { hkLvOn, hkOn } from '../../../../shared/domain';

/**
 * @param date ISODate of the shown day
 * @param onToggle called after a successful save (the screen flips to the back page)
 * @returns `on` (written for this day), `def` (the default for the other days), `own` (this day has its own choice),
 *   and `set`
 */
export function useLeavesToggle(date: string, onToggle: () => void) {
  const { state, run } = useStore();
  const toast = useToast();
  const on = hkLvOn(state, date);
  const def = hkOn(state.settings, 'lv');
  const own = state.hkaiManual[date]?.lv !== undefined;
  const set = async (v: boolean) => {
    if (await run({ t: 'setHkaiLv', date, on: v }, false)) {
      onToggle();
      toast({
        text:
          (v ? 'Οι άδειες γράφονται στο «3. Άδειες» της ' : 'Οι άδειες δεν γράφονται στο «3. Άδειες» της ') + dm(date),
      });
    }
  };
  return { on, def, own, set };
}
