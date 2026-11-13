// State of the «Ημερολόγιο κωλυομένων» tab: the shown week, the grid, the dialogs and the Excel / print.
// Purpose: `useImer`, the hooks of `ImerTab`, in the order the tab always called them.
// Does NOT: draw anything (ui/ImerTab.tsx) or compute the grid (src/shared/imer.ts).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/imerologio.ts (Phase 6); hook order and the
//   memo dependency list of the grid are unchanged.
// Covering test: test/imer.test.ts, test/screens-main.test.ts.
import { useMemo, useState } from 'react';
import { addDays, type ISODate } from '../../../../shared/dates';
import { platoonShort, platoonsOf, type Person } from '../../../../shared/domain';
import { imerGrid, imerRange, sumTotals } from '../../../../shared/imer';
import type { Sig } from '../../../../shared/sigs';
import { useNav, useStore } from '../../../shared/model';
import { useToast, type Toast } from '../../../shared/ui';

/** Asks main for the Excel (or the print) of the shown week and toasts the result. `req.from/to` are ISODate. */
async function exportImer(
  toast: Toast,
  setXl: (busy: boolean) => void,
  req: { from: ISODate; to: ISODate; all: boolean },
  print: boolean,
  sigs?: Sig[],
) {
  setXl(true);
  try {
    const r = await window.api.exportImer(req, print, sigs);
    if (!r.ok) {
      toast({
        text: (
          <span>
            <b>Δεν βγήκε.</b> {r.error}
          </span>
        ),
      });
    } else if (print && r.warnings.length) toast({ text: r.warnings.join(' · ') });
    else if (!print) {
      toast({
        text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + (r.warnings.length ? ' · ' + r.warnings.join(' · ') : ''),
      });
    }
  } finally {
    setXl(false);
  }
}

/** The hooks of the tab: store, nav, toast, dialog switches and the grid of the shown week. */
export function useImer() {
  const { state, today, run, undoMark } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [xl, setXl] = useState(false);
  const [codes, setCodes] = useState(false);
  const [pick, setPick] = useState<{ p: Person; d: ISODate } | null>(null);
  const all: boolean = !!nav.params.imAll;
  const { from, to } = imerRange(today, nav.params.imFrom);
  const units = platoonsOf(state.settings).map((u) => platoonShort(u.name));
  const unit: string = units.includes(nav.params.imUnit) ? nav.params.imUnit : 'all';
  const st = state;
  const grid = useMemo(
    () => imerGrid(st, from, to, all, today, unit),
    [
      st.people,
      st.statuses,
      st.guards,
      st.dutyLog,
      st.imer,
      st.settings,
      st.rules,
      st.dayPlan,
      from,
      to,
      all,
      today,
      unit,
    ],
  );
  const n = grid.groups.reduce((a, g) => a + g.g.rows.length, 0);
  const move = (k: number) => nav.set({ imFrom: addDays(from, 7 * k) });
  const isDefault = !nav.params.imFrom;
  const req = { from, to, all };
  const go = (print: boolean, sigs?: Sig[]) => exportImer(toast, setXl, req, print, sigs);
  const sections = grid.groups;
  const total = sections.length > 1 ? sumTotals(sections.map((g) => g.tot)) : null;
  const cols = 5 + grid.days.length;
  return {
    state,
    today,
    run,
    undoMark,
    nav,
    toast,
    xl,
    codes,
    setCodes,
    pick,
    setPick,
    all,
    from,
    to,
    units,
    unit,
    grid,
    n,
    move,
    isDefault,
    go,
    sections,
    total,
    cols,
  };
}
