// State of the «Λίστες» card: the chosen list, the «Νέο» form, who has what, and the buttons of the rows.
// Purpose: `useLists`, the hooks of `ListsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/) or hold the rules (model/listsView.ts and model/listsPlans.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-lists-view.test.ts, test/screens-settings-guide.test.ts, test/lists.test.ts.
import { useMemo, useState } from 'react';
import {
  LIST_NAME,
  itemName,
  listRows,
  type LeaveText,
  type ListId,
  type ListRow,
  type UserLists,
} from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import { useNav, useStore } from '../../../shared/model';
import { requestLeave } from '../../../shared/lib/pending';
import { useToast } from '../../../shared/ui';
import {
  backChange,
  codeChange,
  flagChange,
  leaveTextChange,
  noteChange,
  noteFlagChange,
  pickChange,
  planAdd,
  removeChange,
  toggleChange,
  warnChange,
  type ListChange,
} from './listsPlans';
import { IDS, current, keyOf, pickOf, usedBy } from './listsView';

/** The boxes of the «Νέο» form and the error line. */
function useAddForm() {
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [acc, setAcc] = useState('');
  const [max, setMax] = useState('');
  const [code, setCode] = useState('');
  const [warn, setWarn] = useState(false);
  const [note, setNote] = useState(false);
  const [nBadge, setNBadge] = useState(false);
  const [nXl, setNXl] = useState(false);
  const [back, setBack] = useState('');
  const [ltext, setLtext] = useState('');
  const [lduty, setLduty] = useState(false);
  const [lout, setLout] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = () => {
    setName('');
    setChoice(null);
    setAcc('');
    setMax('');
    setCode('');
    setWarn(false);
    setNote(false);
    setNBadge(false);
    setNXl(false);
    setBack('');
    setLtext('');
    setLduty(false);
    setLout(false);
    setErr(null);
  };
  const values = { name, choice, acc, max, code, warn, note, nBadge, nXl, back, ltext, lduty, lout };
  const setters = {
    setName,
    setChoice,
    setAcc,
    setMax,
    setCode,
    setWarn,
    setNote,
    setNBadge,
    setNXl,
    setBack,
    setLtext,
    setLduty,
    setLout,
  };
  return { values, ...setters, err, setErr, reset };
}
type AddFormState = ReturnType<typeof useAddForm>;

interface Env {
  id: ListId;
  lists: UserLists;
  save: (c: ListChange) => Promise<unknown>;
  form: AddFormState;
}

// The buttons of the rows: each builds a change and saves it.
function rowActions({ id, lists, save, form }: Env, pick: ReturnType<typeof pickOf>) {
  const { setErr } = form;
  return {
    toggle: (r: ListRow) => save(toggleChange(lists, id, r)),
    remove: (r: ListRow) => save(removeChange(lists, id, r)),
    setPick: (r: ListRow, v: string) => save(pickChange(lists, id, pick!, r, v)),
    setFlag: (r: ListRow, f: 'duty' | 'out', on: boolean) => save(flagChange(lists, id, r, f, on)),
    setWarnOf: (r: ListRow, on: boolean) => save(warnChange(lists, id, r, on)),
    setNoteOf: (r: ListRow, on: boolean) => save(noteChange(lists, id, r, on)),
    setNoteFlag: (r: ListRow, f: 'noteBadge' | 'noteXl', on: boolean) => save(noteFlagChange(lists, id, r, f, on)),
    saveLeaveText: (lk: string, patch: Partial<LeaveText>, text: string) =>
      save(leaveTextChange(lists, lk, patch, text)),
    setCodeOf: (r: ListRow, v: string) => {
      const res = codeChange(lists, id, r, v);
      if (!res) return;
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      save(res.change);
    },
    setBackOf: (r: ListRow, v: string) => {
      const c = backChange(lists, id, r, v);
      if (c) save(c);
    },
  };
}

/**
 * Everything `ListsCard` and its rows read and call.
 * @returns the chosen list `id` and the drop-down `ids`, `rows`, `pick`, `lists`, `used` (who has what), `who` (the
 *   open «ποιοι το έχουν»), the form (`form.values`, setters, `err`), `n`, `curChoice`, the helpers `key`, `usedN`,
 *   `isUsed`, and the handlers `select`, `add`, `toDuty` and those of the rows
 */
export function useLists() {
  const { state, run } = useStore();
  const toast = useToast();
  const nav = useNav();
  const [id, setId] = useState<ListId>('soldierRanks');
  // The list «Σ.Ι. άοπλων» became the Σ.Ι. table: it shows only for whoever already changed something there.
  const ids = IDS.filter(
    (v) =>
      v !== 'siUnarmed' ||
      !!(state.settings.lists?.siUnarmed?.add?.length || state.settings.lists?.siUnarmed?.hide?.length),
  );
  const form = useAddForm();
  const lists: UserLists = state.settings.lists || {};
  const rows = listRows(lists, id);
  const pick = pickOf(id, lists);
  const used = useMemo(
    () => usedBy(id, state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, state.people, state.cadreList, state.cadreAbs, state.statuses, state.weaponLog],
  );
  const [who, setWho] = useState<string | null>(null);
  const save = (c: ListChange) =>
    run({ t: 'setSettings', settings: { lists: c.next }, text: 'λίστα ' + LIST_NAME[id] + ': ' + c.text }, false);
  const toDuty = () => requestLeave(() => nav.set({ tab: 'duty', dsub: 'stat' }));
  const n = itemName(form.values.name, id);
  const curChoice = pick
    ? (form.values.choice ?? (pick.f === 'hk' ? current(id, { name: n }, lists) : pick.opts[0][0]))
    : '';
  const add = async () => {
    const plan = planAdd({ id, lists, rows, pick, curChoice, n, form: form.values });
    if (!plan) return;
    if (!plan.ok) {
      form.setErr(plan.error);
      return;
    }
    if (!(await save(plan.change))) return;
    if (id === 'medKinds' || id === 'punKinds')
      toast({
        text:
          'Μπήκε στη λίστα: ' +
          n +
          '. ' +
          (id === 'medKinds'
            ? 'Όρισε τι κάνει (υπηρεσίες, έξοδος, ' + HK() + ')'
            : 'Σε ποιες υπηρεσίες μπαίνει, το ορίζεις') +
          ' στις Υπηρεσίες και αργίες.',
        actions: [{ label: 'Τι κάνει', fn: toDuty }],
      });
    else toast({ text: 'Μπήκε στη λίστα: ' + n });
    form.reset();
  };
  const select = (v: ListId) => {
    setId(v);
    form.reset();
    setWho(null);
  };
  const key = keyOf(id);
  return {
    id,
    ids,
    select,
    people: state.people,
    rows,
    pick,
    lists,
    used,
    who,
    setWho,
    form,
    n,
    curChoice,
    key,
    add,
    toDuty,
    ...rowActions({ id, lists, save, form }, pick),
  };
}
