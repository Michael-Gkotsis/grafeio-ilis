// State of the «Στελέχη ανά βαθμό» card: the counts per rank being typed and the save.
// Purpose: `useCadreCard`, the hooks of `CadreCard`, in the order the card always called them.
// Does NOT: draw anything (ui/CadreCard.tsx).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useState } from 'react';
import { usePending } from '../../../shared/lib/pending';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { cadreCountRows } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';

/**
 * @param warn nothing is entered yet: the card starts open with a warning
 * @returns the store `state`, `nav`, the typed counts `c` (`setC`), `open` (`setOpen`), the `ranks` rows, `dirty`,
 *   `saveC` and the active cadre `list`
 */
export function useCadreCard(warn: boolean) {
  const { state, run } = useStore();
  const toast = useToast();
  const nav = useNav();
  const [c, setC] = useState(() => ({ ...state.settings.cadre }));
  const [open, setOpen] = useState(warn);
  const ranks = cadreCountRows(state.settings.lists);
  const dirty = ranks.some((r) => (c[r] || 0) !== (state.settings.cadre[r] || 0));
  const saveC = async () => {
    const ok = await run({ t: 'setSettings', settings: { cadre: c }, text: 'στελέχη ' + HK() }, false);
    if (ok) {
      toast({ text: 'Αποθηκεύτηκαν τα στελέχη. Ισχύουν για κάθε μέρα.' });
      setOpen(false);
    }
    return ok;
  };
  usePending(dirty, { label: 'Στελέχη ανά βαθμό', save: saveC, discard: () => setC({ ...state.settings.cadre }) });
  const list = state.cadreList.filter((x) => x.active);
  return { state, nav, c, setC, open, setOpen, ranks, dirty, saveC, list };
}
