// State of the «Δύναμη» screen: the day, the picked counter, the search, the platoon filter and the open cards.
// Purpose: `useStrength`, the hooks of `StrengthScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the filter rules (model/view.ts).
// Owner layer: renderer/pages/strength. Why: moved verbatim from screens/other.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { searchPeople } from '../../../entities/person';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useStore } from '../../../shared/model';
import { platoonShort, platoonsOf } from '../../../../shared/domain';
import { strengthAt } from '../../../../shared/rules';
import { strengthView, type SvCat } from '../../../../shared/strengthView';
import { filterStrength, isCatOpen, visibleCats, visibleIds } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the day (`v`, `date`, `today`, `tomorrow`), the picked counter `cat`, the search text `q` (and its deferred
 *   `dq`), the platoon `unit`, the filtered cards `vis`, and the handlers `pick`, `toggle`, `clear`, `ids`
 */
export function useStrength() {
  const { state, today, tomorrow } = useStore();
  const nav = useNav();
  const date = nav.params.strengthDate || today;
  const now = useNowMin();
  // Today uses the same moment as «Σήμερα» (whoever came back by now is present): both show the same numbers.
  const at = strengthAt(state.rules, date, today, now);
  const v = useMemo(() => strengthView(state, date, at), [state, date, at]);
  const [cat, setCat] = useState<SvCat | ''>((nav.params.svCat || '') as SvCat | '');
  // The counter link from another screen is read once; the param is cleared so the filter does not stick.
  useEffect(() => {
    if (nav.params.svCat) nav.set({ svCat: undefined });
  }, []);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [unit, setUnit] = useState('');
  const [open, setOpen] = useState<Partial<Record<SvCat, boolean>>>({});
  const units = useMemo(() => platoonsOf(state.settings).map((u) => platoonShort(u.name)), [state.settings]);
  const found = useMemo(
    () => (dq.trim() ? new Set(searchPeople(state.people, dq).map((p) => p.id)) : null),
    [state.people, dq],
  );
  const filtering = !!found || !!unit;
  // Rows that pass the search and the platoon; without a filter nothing is rebuilt.
  const shown = useMemo(
    () => filterStrength(v, found, unit, filtering, state.settings),
    [v, found, unit, filtering, state.settings],
  );
  const pick = (c: SvCat | '') => {
    setCat(cat === c ? '' : c);
    if (c) setOpen((o) => ({ ...o, [c]: undefined }));
  };
  const isOpen = (c: SvCat) => isCatOpen(open, c, cat, found);
  const ids = () => visibleIds(shown, cat);
  const vis = visibleCats(shown, cat);
  const toggle = (c: SvCat) => setOpen((o) => ({ ...o, [c]: !isOpen(c) }));
  const clear = () => {
    setCat('');
    setQ('');
    setUnit('');
  };
  return {
    v,
    date,
    today,
    tomorrow,
    cat,
    q,
    setQ,
    dq,
    unit,
    setUnit,
    units,
    filtering,
    vis,
    pick,
    isOpen,
    toggle,
    clear,
    ids,
    nav,
  };
}
