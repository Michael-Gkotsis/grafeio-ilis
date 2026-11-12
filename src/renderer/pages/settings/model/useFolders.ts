// State of the «Φάκελοι αρχείων» card: the general folder, the folders of each form and of each new Excel kind.
// Purpose: `useFolders`, the hooks of `FoldersCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/FoldersCard.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-settings-guide.test.ts.
import type { DirTarget } from '../../../../shared/api';
import type { FormKind } from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/** What a folder or form call answers. */
type Done = { ok: true } | { ok: false; error: string } | null;

/**
 * Everything `FoldersCard` reads and calls.
 * @returns the store `state`, the settings `st`, the `general` folder, the per-form bindings `forms`, and the actions
 *   `choose`, `reset` and `monthly` (each refreshes the settings and says what happened in a toast)
 */
export function useFolders() {
  const { state, boot, refresh } = useStore();
  const toast = useToast();
  const st = state.settings;
  const general = st.outputDir || boot.outputDir;
  const forms = st.forms || {};
  const done = async (r: Done, text: string) => {
    if (!r) return;
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    await refresh();
    toast({ text });
  };
  const choose = async (t: DirTarget, label: string) => {
    const r = await window.api.dirChoose(t);
    await done(r, label + ': στον φάκελο που διάλεξες');
  };
  const reset = async (t: DirTarget, label: string) =>
    done(
      await window.api.dirReset(t),
      label + (t === 'output' ? ': ξανά ο φάκελος της εφαρμογής' : ': ξανά στον γενικό φάκελο'),
    );
  const monthly = async (f: FormKind, on: boolean) => {
    const r = await window.api.formSave(f, { ...(forms[f] || {}), monthly: on });
    await done(r, on ? 'Υποφάκελος ανά μήνα' : 'Χωρίς υποφάκελο ανά μήνα');
  };
  return { state, st, general, forms, choose, reset, monthly };
}
