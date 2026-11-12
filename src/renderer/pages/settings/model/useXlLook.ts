// State of the «Γράμματα Excel» card: the edited look, the save and the unsaved-changes registration.
// Purpose: `useXlLook`, the hooks of `XlLookCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/XlLookCard.tsx) or hold the rules (model/xlLookView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-xl-look-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import { sameLook, xlLook, type XlLook, type XlPart, type XlPartKey } from '../../../../shared/xlLook';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { lookText, withPart } from './xlLookView';

/**
 * Everything `XlLookCard` reads and calls.
 * @returns `state`, the edited look `x` with `setX`, the saved look `saved`, `changed`, `save` (resolves to the new
 *   state or `null`) and `setPart`
 */
export function useXlLook() {
  const { state, run } = useStore();
  const toast = useToast();
  const saved = xlLook(state.settings);
  const [x, setX] = useState<XlLook>(saved);
  const changed = !sameLook(x, saved);
  const save = async (v: XlLook) => {
    const ok = await run({ t: 'setSettings', settings: { xl: v }, text: 'γράμματα Excel: ' + lookText(v) }, false);
    if (ok) {
      setX(v);
      toast({ text: 'Αποθηκεύτηκαν τα γράμματα Excel: ' + lookText(v) });
    }
    return ok;
  };
  usePending(changed, { label: 'Γράμματα Excel', save: () => save(x), discard: () => setX(saved) });
  const setPart = (k: XlPartKey, ch: XlPart) => setX(withPart(x, k, ch));
  return { state, x, setX, saved, changed, save, setPart };
}
