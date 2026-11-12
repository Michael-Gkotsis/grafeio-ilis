// State of the «ΗΚΑΙ» screen: the day, the front/back/summary side and the numbers behind the three views.
// Purpose: `useHkai`, the hooks of `HkaiScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the rules (model/view.ts). It reads no layout: an effect that measures the page
//   in render once cost 1.1 s on this screen, so every hook here is a memo or a state, none reads the DOM.
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useMemo, useState } from 'react';
import { hkaiBack, hkaiFront } from '../../../shared/lib/sheets/hkai';
import { useNav, useStore } from '../../../shared/model';
import { useMedia } from '../../../shared/ui';
import { orderedCadre } from '../../../../shared/cadre';
import { hkaiCounts } from '../../../../shared/rules';
import { cadreInColumn, cadreTotal, hkaiFileName, hkaiSources } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the store `state` and `today`, `nav`, `mobile`, the shown `date`, the `side` (`sum` only on a phone), the
 *   counts `h`, the previews `front` and `back`, the columns `src`, `cadreOf`, `cadreSeen`, the file name `fn`, and
 *   the cadre total `cadre`
 */
export function useHkai() {
  const { state, today } = useStore();
  const nav = useNav();
  const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.hkaiDate || today;
  const [side, setSide] = useState(mobile ? 'sum' : 'front');
  const h = useMemo(() => hkaiCounts(state, date), [state, date]);
  const front = useMemo(() => hkaiFront(state, date, h), [state, date, h]);
  const back = useMemo(() => hkaiBack(state, date), [state, date]);
  // Soldiers and cadre (the «Στελέχη» tab, in its order) in every column.
  const src = hkaiSources(h);
  const cOrd = useMemo(() => new Map(orderedCadre(state.cadreList).map((c, i) => [c.id, i])), [state.cadreList]);
  const cadreOf = (k: string) => cadreInColumn(h, k, cOrd);
  // ▲▼ in the cadre card: the cadre as seen here, in the order of the columns.
  const cadreSeen = [...new Set(src.flatMap(([k]) => cadreOf(k).map((c) => c.id)))];
  const fn = hkaiFileName(date);
  const cadre = cadreTotal(state);
  return { state, today, nav, mobile, date, side, setSide, h, front, back, src, cadreOf, cadreSeen, fn, cadre };
}
