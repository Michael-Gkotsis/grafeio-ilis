// State of the «Σ.Ι.: σε ποιες υπηρεσίες μπαίνει» card: the boxes, the rows and the buttons.
// Purpose: `useSi`, the hooks of `SiCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/SiCard.tsx) or hold the rules (model/siView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/si.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-si-view.test.ts, test/screens-settings-guide.test.ts.
import { useMemo, useState } from 'react';
import type { BlockDef } from '../../../../shared/domain';
import type { UserLists } from '../../../../shared/ranks';
import type { SiConfig } from '../../../../shared/si';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { useDutyCols } from './dutyCols';
import {
  addBase,
  addCatRow,
  addCategory,
  removeBase,
  removeCatRow,
  removeCategory,
  resetRow,
  siCounts,
  siRows,
  toggleCell,
  type SiChange,
  type SiPlan,
} from './siView';

/** The boxes of the card and the error line. */
function useSiForm() {
  const [nb, setNb] = useState('');
  const [nc, setNc] = useState('');
  const [catRow, setCatRow] = useState('Ι3 ΧΩΡΙΣ ΟΠΛΟ');
  const [catPick, setCatPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return { nb, setNb, nc, setNc, catRow, setCatRow, catPick, setCatPick, err, setErr };
}

interface Env {
  cfg: SiConfig;
  lists: UserLists;
  save: (change: SiChange) => Promise<unknown>;
  toast: ReturnType<typeof useToast>;
  form: ReturnType<typeof useSiForm>;
}

/** The buttons of the table rows. */
function rowActions({ cfg, lists, save, toast }: Env) {
  return {
    toggle: async (label: string, cat: string, b: BlockDef) => {
      const change = toggleCell(lists, cfg, label, cat, b);
      if (await save(change)) toast({ text: change.toast });
    },
    resetRow: (label: string, cat: string) => save(resetRow(cfg, label, cat)),
    removeCatRow: (label: string, cat: string) => save(removeCatRow(cfg, label, cat)),
    removeCat: (c: string) => save(removeCategory(cfg, c)),
    removeBase: (b: string) => save(removeBase(cfg, b)),
  };
}

/** The «Νέα …» and «Πρόσθεσε γραμμή» buttons: a refused plan shows its error, a saved one a toast. */
function addActions({ cfg, save, toast, form }: Env) {
  const { nb, nc, catRow, catPick, setErr } = form;
  // `null`: nothing typed. A refused plan shows its error; a saved one runs `onSaved` with its toast text.
  const apply = async (plan: SiPlan | null, onSaved: (toastText: string) => void) => {
    if (!plan) return;
    if (!plan.ok) {
      setErr(plan.error);
      return;
    }
    if (await save(plan)) onSaved(plan.toast as string);
  };
  return {
    addCatRow: () =>
      catPick
        ? apply(addCatRow(cfg, catRow, catPick), (text) => {
            form.setCatPick('');
            setErr(null);
            toast({ text });
          })
        : undefined,
    addBase: () =>
      apply(addBase(cfg, nb), (text) => {
        toast({ text });
        form.setNb('');
        setErr(null);
      }),
    addCat: () =>
      apply(addCategory(cfg, nc), (text) => {
        toast({ text });
        form.setNc('');
        setErr(null);
      }),
  };
}

/**
 * Everything `SiCard` reads and calls.
 * @returns `lists`, `cfg`, `cells`, the boxes (`form`), the duty columns `cols`, the `count` per row, the unknown
 *   values `odd`, the table `rows`, and the button handlers
 */
export function useSi() {
  const { state, run } = useStore();
  const toast = useToast();
  const lists: UserLists = state.settings.lists || {};
  const cfg: SiConfig = lists.si || {};
  const cells = cfg.cells || {};
  const form = useSiForm();
  const cols = useDutyCols();
  const { count, odd, seenBases } = useMemo(
    () => siCounts(state.people, lists, cfg),
    [state.people, lists], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rows = useMemo(() => siRows(cfg, cells, seenBases), [cfg, cells, seenBases]);
  const save = (c: SiChange) =>
    run({ t: 'setSettings', settings: { lists: { ...lists, si: c.si } }, text: 'Σ.Ι. ' + c.text }, false);
  const env: Env = { cfg, lists, save, toast, form };
  return {
    lists,
    cfg,
    cells,
    form,
    cols,
    count,
    odd,
    rows,
    people: state.people,
    ...rowActions(env),
    ...addActions(env),
  };
}
