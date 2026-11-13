// State of the «Εξαιρέσεις» tab: the form (who, from, to, reason), the edit in progress and the actions.
// Purpose: `useSkips`, the hooks of `SkipsView` in the order the tab always called them.
// Does NOT: draw anything (ui/SkipsView.tsx) or hold the pure rules (model/skipsView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/skips.ts (Phase 6); hook order is unchanged:
//   store, toast, who, from, to, touched, reason, edit, people map, items.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useMemo, useState } from 'react';
import { weekendFrom, type ISODate } from '../../../../shared/dates';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { savedText, skipItems, splitSkips, type SkipItem } from './skipsView';

/**
 * Everything the tab reads and calls.
 * @returns the form (`pid`, `from`, `to`, `touched`, `why`, `edit` with setters), `p` (the chosen person), `missing`
 *   (why «Πρόσθεσε» is grey), the lists (`items`, `now`, `next`, `past`) and `quick`, `save`, `change`, `del`, `reset`
 */
export function useSkips() {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const [pid, setPid] = useState<number | null>(null);
  const [from, setFrom] = useState<ISODate>(today);
  const [to, setTo] = useState<ISODate>(today);
  const [touched, setTouched] = useState(false);
  const [why, setWhy] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const pm = useMemo(() => new Map(state.people.map((p) => [p.id, p])), [state.people]);
  const items = useMemo(() => skipItems(state.people), [state.people]);
  const { now, next, past } = splitSkips(items, today);
  const reset = () => {
    setPid(null);
    setFrom(today);
    setTo(today);
    setTouched(false);
    setWhy('');
    setEdit(null);
  };
  const p = pid != null ? pm.get(pid) : undefined;
  const missing = !p ? 'Διάλεξε ποιος' : null;
  const quick = (nextWeekend: boolean) => {
    const [f, t] = weekendFrom(today, nextWeekend);
    setFrom(f);
    setTo(t);
    setTouched(true);
  };
  const save = async () => {
    if (!p) return;
    const r = await run({ t: 'setSkip', pid: p.id, id: edit || undefined, from, to, why }, false);
    if (r) {
      toast({
        text: savedText(!!edit, rkShort(p), from, to),
        actions: [undoMark()],
      });
      reset();
    }
  };
  const change = (x: SkipItem) => {
    setPid(x.p.id);
    setFrom(x.k.from);
    setTo(x.k.to);
    setTouched(true);
    setWhy(x.k.why || '');
    setEdit(x.k.id);
  };
  const del = async (x: SkipItem) => {
    if (await run({ t: 'delSkip', pid: x.p.id, id: x.k.id }, false)) {
      if (edit === x.k.id) reset();
      toast({ text: 'Σβήστηκε η εξαίρεση: ' + rkShort(x.p), actions: [undoMark()] });
    }
  };
  return {
    state,
    today,
    pid,
    setPid,
    from,
    setFrom,
    to,
    setTo,
    touched,
    setTouched,
    why,
    setWhy,
    edit,
    items,
    now,
    next,
    past,
    p,
    missing,
    quick,
    save,
    change,
    del,
    reset,
  };
}

/** What {@link useSkips} returns. */
export type SkipsModel = ReturnType<typeof useSkips>;
