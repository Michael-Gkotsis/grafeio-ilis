// State of the «Έντυπα: template και φάκελος» card: the template dialog and what each row's buttons do.
// Purpose: `useForms`, the hooks of `FormsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/FormsCard.tsx) or hold the rules (model/formsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-settings-guide.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import type { FormInfo } from '../../../../shared/api';
import type { FormBinding, FormKind } from '../../../../shared/sources';
import { usePrintFile, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { formSaveText } from './formsView';
import { formList } from './sourcesView';

/**
 * Everything `FormsCard` reads and calls.
 * @returns the store `state` and `boot`, the bindings `forms`, `printFile`, the open template dialog `dlg` with
 *   `setDlg`, and the actions `save`, `pickTpl`, `editTpl`, `pickDir` and `saveTemplate` (the dialog's save)
 */
export function useForms() {
  const { state, boot, refresh } = useStore();
  const toast = useToast();
  const printFile = usePrintFile();
  const [dlg, setDlg] = useState<{ form: FormKind; info: FormInfo } | null>(null);
  const forms = state.settings.forms || {};
  const save = async (f: FormKind, b: FormBinding | null, text: string) => {
    const r = await window.api.formSave(f, b);
    if (!r.ok) {
      toast({ text: r.error });
      return false;
    }
    await refresh();
    toast({ text });
    return true;
  };
  const pickTpl = async (f: FormKind) => {
    const r = await window.api.formPick(f);
    if (!r) return;
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    setDlg({ form: f, info: r });
  };
  const editTpl = async (f: FormKind) => {
    const r = await window.api.formInfo(f);
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    setDlg({ form: f, info: r });
  };
  const pickDir = async (f: FormKind) => {
    const d = await window.api.formDir(f);
    if (d) await save(f, { ...(forms[f] || {}), dir: d }, 'Το έντυπο θα βγαίνει στο ' + d);
  };
  const saveTemplate = async (form: FormKind, b: FormBinding) => {
    if (await save(form, b, formSaveText(formList(state.settings).find((x) => x[0] === form)![1], b))) setDlg(null);
  };
  return { state, boot, forms, printFile, dlg, setDlg, save, pickTpl, editTpl, pickDir, saveTemplate };
}
