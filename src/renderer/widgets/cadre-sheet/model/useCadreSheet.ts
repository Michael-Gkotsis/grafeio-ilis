// State of the cadre sheet.
// Purpose: `useCadreSheet` holds the store, the tab, the three dialogs' flags and the Up/Down/PageUp/PageDown walk over
//   the list the sheet was opened from, for `CadreSheet`.
// Does NOT: draw anything or derive the texts (model/view.ts). Every hook of the sheet is called here, in the order the
//   sheet had them.
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts, test/sheet-nav.test.ts.
import { useEffect, useMemo, useState } from 'react';
import { orderedCadre } from '../../../../shared/cadre';
import type { Cadre, CadreAbs } from '../../../../shared/domain';
import { useNav, useStore } from '../../../shared/model';
import { useSheetNav, useToast } from '../../../shared/ui';

/** Props of `CadreSheet`. */
export interface CadreSheetProps {
  /** Id of the cadre member shown. */
  cid: string;
  /** Ids of the list the sheet was opened from (order of the Up/Down walk); all cadre members when absent. */
  list?: string[] | null;
  /** Called with the id to show next when Up/Down/PageUp/PageDown move through the list. */
  onMove: (id: string) => void;
  onClose: () => void;
}

/** The state of the sheet and the store pieces its parts use. */
export function useCadreSheet({ cid, list, onMove }: CadreSheetProps) {
  const { state, today, run, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const c: Cadre | undefined = state.cadreList.find((x) => x.id === cid);
  const [tab, setTab] = useState('abs');
  const [edit, setEdit] = useState(false);
  const [stFor, setStFor] = useState<{ abs?: CadreAbs } | null>(null);
  const [del, setDel] = useState(false);
  const order: string[] = useMemo(
    () => list || orderedCadre(state.cadreList).map((x) => x.id),
    [list, state.cadreList],
  );
  const { at, n: total, move } = useSheetNav(order, cid, onMove, edit || !!stFor || del);
  useEffect(() => {
    setEdit(false);
    setStFor(null);
    setDel(false);
    const b = document.querySelector('.ui-sheet__body');
    if (b) b.scrollTop = 0;
  }, [cid]);
  return {
    state,
    today,
    run,
    undoMark,
    toast,
    nav,
    c,
    tab,
    setTab,
    edit,
    setEdit,
    stFor,
    setStFor,
    del,
    setDel,
    at,
    total,
    move,
  };
}

/** What `useCadreSheet` returns. */
export type CadreSheetModel = ReturnType<typeof useCadreSheet>;
