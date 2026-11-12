// State of the «Υπηρεσίες» card: the form shown, the three dialogs and the delete.
// Purpose: `useBlocks`, the hooks of `BlocksCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/BlocksCard.tsx) or hold the texts (model/blocksView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-blocks-view.test.ts, test/screens-settings-guide.test.ts.
import { useMemo, useState } from 'react';
import { phaseDelWhy } from '../../../../shared/commands';
import { codeErrors } from '../../../../shared/codes';
import { blocksOf, type Phase } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { currentPhase } from './blocksView';

/**
 * Everything `BlocksCard` reads and calls.
 * @returns `state`, `run`, the shown form `cur` and its id `phase`, the services `list`, the bad codes `bad`, the
 *   delete reason `delWhy`, `del`, and the dialog states `add`, `ed`, `ren` with their setters and `setPick`
 */
export function useBlocks() {
  const { state, run } = useStore();
  const toast = useToast();
  const [pick, setPick] = useState<Phase>(state.settings.phase || 'sven');
  const [add, setAdd] = useState(false);
  const [ed, setEd] = useState<string | null>(null);
  const [ren, setRen] = useState(false);
  const cur = currentPhase(state.settings, pick);
  const phase = cur.id;
  const list = blocksOf(state.settings, phase) || [];
  const bad = useMemo(() => codeErrors(state.settings), [state.settings]);
  const delWhy = cur.custom ? phaseDelWhy(state, phase) : '';
  const del = async () => {
    if (await run({ t: 'delPhase', id: phase }, false)) {
      setPick(state.settings.phase || 'sven');
      toast({ text: 'Διαγράφηκε η ΦΡΟΥΡΑ ' + cur.name });
    }
  };
  return { state, run, cur, phase, list, bad, delWhy, del, setPick, add, setAdd, ed, setEd, ren, setRen };
}
