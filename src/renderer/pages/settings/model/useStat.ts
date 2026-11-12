// State of the «Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν» card: the sections, the counts and the buttons.
// Purpose: `useStat`, the hooks of `StatCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/StatCard.tsx) or hold the rules (model/statView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/stat.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-stat-view.test.ts, test/screens-settings-guide.test.ts.
import { useMemo } from 'react';
import type { BlockDef, TypeKey } from '../../../../shared/domain';
import type { UserLists } from '../../../../shared/ranks';
import type { StatCell, StatConfig } from '../../../../shared/stat';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { useDutyCols } from './dutyCols';
import {
  cellChange,
  hkChange,
  outChange,
  resetChange,
  statCounts,
  statSections,
  usedMedicals,
  type StatChange,
  type StatRow,
} from './statView';

/**
 * Everything `StatCard` reads and calls.
 * @returns `lists`, `cells`, `out`, the duty columns `cols`, the `sections`, the people `count` per row, `usedMed`,
 *   `nav` and the handlers `setCell`, `setOut`, `setHk`, `resetRow`
 */
export function useStat() {
  const { state, run, today } = useStore();
  const toast = useToast();
  const nav = useNav();
  const lists: UserLists = state.settings.lists || {};
  const cfg: StatConfig = lists.stat || {};
  const cells = cfg.cells || {};
  const out = cfg.out || {};
  const cols = useDutyCols();
  const sections = useMemo(
    () => statSections(lists, cells),
    [lists], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const count = useMemo(() => statCounts(state, today, lists), [state.people, state.statuses, today, lists]);
  // Medicals somebody has: their base type (so their ΗΚΑΙ column) does not change.
  const usedMed = useMemo(() => usedMedicals(state.statuses), [state.statuses]);
  const save = (c: StatChange) =>
    run(
      { t: 'setSettings', settings: { lists: c.next ?? { ...lists, stat: c.stat } }, text: 'Καταστάσεις: ' + c.text },
      false,
    );
  const saved = async (c: StatChange | null) => {
    if (c && (await save(c))) toast({ text: c.toast as string });
  };
  return {
    lists,
    cells,
    out,
    cols,
    sections,
    count,
    usedMed,
    nav,
    setCell: (type: TypeKey, own: string, b: BlockDef, v: StatCell) => saved(cellChange(lists, type, own, b, v)),
    setOut: (type: TypeKey, own: string, ok: boolean) => saved(outChange(lists, type, own, ok)),
    setHk: (r: StatRow, col: string) => saved(hkChange(lists, r, col, cols)),
    resetRow: (type: TypeKey, own: string) => save(resetChange(lists, type, own)),
  };
}
