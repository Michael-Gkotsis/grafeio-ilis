// State of the «Υπογραφές» card: the chosen form, the unsaved lists of every form and the saves.
// Purpose: `useSigs`, the hooks of `SigsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/SigsCard.tsx) or hold the rules (model/sigsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-sigs-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import type { Layout } from '../../../../shared/layout';
import { sameSigs, sigDefaults, sigsClean, sigsSaved, sigsText, type Sig, type SigForm } from '../../../../shared/sigs';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import {
  dirtyFormsOf,
  layoutFor,
  layoutFormOf,
  layoutWith,
  saveFormsPlan,
  sigLabelOf,
  type SigEdits,
} from './sigsView';

/**
 * Everything `SigsCard` reads and calls.
 * @returns `state`, `run`, `today`, the chosen `form` with `setForm`, the layout dialog flag `lay` with `setLay`, the
 *   layout form `lf`, the unsaved lists `edit` with `setEdit`, the shown `list`, `changed`, `setList`, and the handlers
 *   `save`, `reset` and `saveLayout`
 */
export function useSigs() {
  const { state, run, today } = useStore();
  const toast = useToast();
  const [form, setForm] = useState<SigForm>('hkai');
  const [lay, setLay] = useState(false);
  const lf = layoutFormOf(form);
  const [edit, setEdit] = useState<SigEdits>({});
  const saved = sigsSaved(state.settings, form);
  const list = edit[form] ?? saved;
  const changed = !sameSigs(list, saved);
  const setList = (v: Sig[]) => setEdit({ ...edit, [form]: v });
  const saveLayout = async (l: Layout | undefined) => {
    if (!lf) return;
    const layout = layoutWith(state.settings, lf, l);
    if (await run({ t: 'setSettings', settings: { layout }, text: 'θέσεις στο χαρτί: ' + sigLabelOf(form) }, false))
      toast({ text: 'Αποθηκεύτηκαν οι θέσεις: ' + sigLabelOf(form) });
  };
  const dirtyForms = dirtyFormsOf(edit, state.settings);
  const saveForms = async () => {
    const { patch, text } = saveFormsPlan(edit, dirtyForms, state.settings);
    const ok = await run({ t: 'setSettings', settings: patch, text }, false);
    if (ok) setEdit({});
    return ok;
  };
  usePending(dirtyForms.length > 0, { label: 'Υπογραφές', save: saveForms, discard: () => setEdit({}) });
  const save = async () => {
    const v = sigsClean(list);
    const patch = {
      sigs: { ...(state.settings.sigs || {}), [form]: v },
      ...layoutFor(state.settings, lf, v.length, saved.length),
    };
    if (
      await run(
        { t: 'setSettings', settings: patch, text: 'υπογραφές ' + sigLabelOf(form) + ': ' + sigsText(v) },
        false,
      )
    ) {
      setEdit({ ...edit, [form]: undefined });
      toast({ text: 'Αποθηκεύτηκαν οι υπογραφές: ' + sigLabelOf(form) });
    }
  };
  const reset = async () => {
    const all = { ...(state.settings.sigs || {}) };
    delete all[form];
    const defaults = sigDefaults(state.settings, form).length;
    const patch = { sigs: all, ...layoutFor(state.settings, lf, defaults, saved.length) };
    if (
      await run(
        { t: 'setSettings', settings: patch, text: 'υπογραφές ' + sigLabelOf(form) + ': όπως το έντυπο' },
        false,
      )
    ) {
      setEdit({ ...edit, [form]: undefined });
      toast({ text: 'Οι υπογραφές ' + sigLabelOf(form) + ' είναι πάλι όπως το έντυπο' });
    }
  };
  return {
    state,
    run,
    today,
    form,
    setForm,
    lay,
    setLay,
    lf,
    edit,
    list,
    changed,
    setList,
    setEdit,
    save,
    reset,
    saveLayout,
  };
}
