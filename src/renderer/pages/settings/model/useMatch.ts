// State of the «Τι έχει το <αρχείο>» dialog: the kind chosen for each table found, and the save.
// Purpose: `useMatch`, the hooks of `MatchDialog`, in the order the dialog always called them.
// Does NOT: draw anything (ui/sections/MatchDialog.tsx) or hold the rules (model/sourcesView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-sources-view.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import type { SourceBook } from '../../../../shared/api';
import type { ListKind } from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { hitBinding, matchChoice } from './sourcesView';

/**
 * Everything `MatchDialog` reads and calls.
 * @param book - the new Excel file with the tables the recognition found
 * @param onClose - closes the dialog (also after the save)
 * @returns the store `state`, the choice per table (`pick`, `setPick`), `chosen`, `dupe` and `bindingOf` and `save`
 */
export function useMatch(book: SourceBook, onClose: () => void) {
  const { state, refresh } = useStore();
  const toast = useToast();
  const [pick, setPick] = useState<Record<number, ListKind | ''>>(() =>
    Object.fromEntries(book.hits.map((h, i) => [i, h.best || ''])),
  );
  const { chosen, dupe } = matchChoice(pick);
  const bindingOf = (i: number, k: ListKind) => hitBinding(book, i, k);
  const save = async () => {
    for (const [i, k] of chosen) await window.api.srcSave(k, bindingOf(+i, k));
    await refresh();
    onClose();
    toast({
      text:
        'Ορίστηκαν ' +
        chosen.length +
        ' είδη από το ' +
        book.name +
        '. Πάτα «Ανανέωση από Excel» σε όποιο θέλεις να διαβαστεί τώρα.',
    });
  };
  return { state, pick, setPick, chosen, dupe, bindingOf, save };
}
