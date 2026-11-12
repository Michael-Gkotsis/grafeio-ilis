// The duty columns of the «ποιος κάνει τι» tables of «Ρυθμίσεις» (Σ.Ι. and Καταστάσεις).
// Purpose: `useDutyCols` and its pure part `dutyColsOf`.
// Does NOT: draw the column heads (ui/sections/colHead.tsx) or read the duty rules.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/si.ts (Phase 6); both cards use it.
// Covering test: test/settings-si-view.test.ts.
import { useMemo } from 'react';
import type { BlockDef, Settings } from '../../../../shared/domain';
import { blocksOf, phaseList } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';

/** A duty column; `only` names the form (phase) that has it when it is not the one in force. */
export type DutyCol = BlockDef & { only?: string };

/**
 * The duties of the form in force, then the ones that only the other forms have (marked with `only`). Without Λ/Υ-Δ/Υ
 * (set by hand) and without the removed ones.
 * @param st - the settings
 */
export function dutyColsOf(st: Settings): DutyCol[] {
  const cur = st.phase || 'sven';
  const usable = (b: BlockDef) => b.kind !== 'ly' && !b.hidden;
  const seen = new Set<string>();
  // Same order as before: the form in force first, then each other form; the first duty with an id wins.
  const others = phaseList(st)
    .filter((ph) => ph.id !== cur)
    .flatMap((ph) => (blocksOf(st, ph.id) || []).map((b): DutyCol => ({ ...b, only: ph.name })));
  return [...(blocksOf(st) || []), ...others].filter((b) => {
    if (!usable(b) || seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

/** The duty columns for the settings of the store; the list keeps its reference until the settings change. */
export function useDutyCols(): DutyCol[] {
  const { state } = useStore();
  return useMemo(() => dutyColsOf(state.settings), [state.settings]);
}
