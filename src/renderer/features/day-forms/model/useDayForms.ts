// State of the «Έντυπα ημέρας» dialog.
// Purpose: `useDayForms` lists the forms, runs their checks, keeps which are ticked, what is busy and what is done.
// Does NOT: draw anything (ui/DayFormsDialog.tsx) or make the files (model/exportAll.ts).
// Owner layer: renderer/features/day-forms. Why: moved verbatim from screens/dayForms.ts (Phase 5.3b); the hooks run in
// the order they did in the single component.
// Covering test: test/reports-flow.test.ts.
import { useMemo, useState } from 'react';
import type { ExportKind } from '../../../../shared/api';
import { preflight, type Check } from '../../../../shared/preflight';
import { GO } from '../../../shared/lib/exportGo';
import { useNav, useStore } from '../../../shared/model';
import { exportAll } from './exportAll';
import { dayItems, repCheck, type Done, type Item } from './items';

/** Everything the dialog draws and calls. */
export function useDayForms(onClose: () => void) {
  const { state, today, tomorrow, sync } = useStore();
  const nav = useNav();
  const items = dayItems(state, today, tomorrow);
  const checks = useMemo(
    () =>
      items.map((it) => (it.rep ? repCheck(state, it.rep, it.date) : preflight(it.kind as ExportKind, state, it.date))),
    [state, today, tomorrow],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = checks.map((cs) => cs.some((c) => c.level === 'err'));
  // με ✕ δεν βγαίνει (όπως και από το κουμπί του κάθε εντύπου), τα άλλα βγαίνουν κανονικά
  const [on, setOn] = useState(() => items.map((_, i) => !bad[i]));
  const [busy, setBusy] = useState<'' | 'xl' | 'print'>('');
  const [done, setDone] = useState<Record<number, Done | 'run'>>({});
  const pick = items.map((_, i) => i).filter((i) => on[i] && !bad[i]);
  const nWarn = pick.reduce((a, i) => a + checks[i].length, 0);
  const show = (it: Item, c: Check) => {
    if (!c.go) return;
    onClose();
    const [v, p] = GO[c.go](it.date);
    nav.go(v, p);
  };
  const go = (print: boolean) => exportAll({ state, items, pick, sync, setBusy, setDone }, print);
  const finished = Object.keys(done).length > 0 && !busy;
  return { today, items, checks, bad, on, setOn, busy, done, pick, nWarn, show, go, finished };
}
