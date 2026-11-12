// State of the «Σελίδα 2 (ΔΥΝΑΜΗ)» part of the Εξοδούχοι signatures: the mode, the own list and the saves.
// Purpose: `useOutsSig2`, the hooks of `OutsSig2`, in the order the part always called them.
// Does NOT: draw anything (ui/sections/OutsSig2.tsx) or hold the texts (model/sigsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-sigs-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import { outsSig2Of, sameSigs, sigsClean, sigsPage2, sigsText, type OutsSig2, type Sig } from '../../../../shared/sigs';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { page2PickText } from './sigsView';

/**
 * Everything `OutsSig2` reads and calls.
 * @returns the `mode`, the shown `list`, `changed`, `setEdit`, `pick` (saves a mode) and `save` (saves the own list;
 *   resolves to `true` when it was written)
 */
export function useOutsSig2() {
  const { state, run } = useStore();
  const toast = useToast();
  const mode = outsSig2Of(state.settings);
  const saved = sigsPage2(state.settings);
  const [edit, setEdit] = useState<Sig[] | undefined>(undefined);
  const list = edit ?? saved;
  const changed = !!edit && !sameSigs(edit, saved);
  const pick = (v: OutsSig2) =>
    run({ t: 'setSettings', settings: { outsSig2: v === 'same' ? undefined : v }, text: page2PickText(v) }, false);
  const save = async () => {
    const v = sigsClean(list);
    if (
      await run(
        { t: 'setSettings', settings: { outsSigs2: v }, text: 'υπογραφές εξοδούχων, σελίδα 2: ' + sigsText(v) },
        false,
      )
    ) {
      setEdit(undefined);
      toast({ text: 'Αποθηκεύτηκαν οι υπογραφές της σελίδας 2' });
      return true;
    }
    return false;
  };
  usePending(changed, { label: 'Υπογραφές σελίδας 2', save, discard: () => setEdit(undefined) });
  return { mode, list, changed, setEdit, pick, save };
}
