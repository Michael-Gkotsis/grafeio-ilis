// The `Nav` object screens receive from `useNav()`.
// Purpose: `useNavValue(router, overlays, state)` joins the route and the overlay actions into one memoised `Nav`
//   and adds `openPerson` (which needs `go` and the cadre list).
// Does NOT: own any state; the route lives in useRouter.ts, the cards in useOverlays.ts.
// Owner layer: renderer/app. Why: the identity of this object decides which screens re-render, so it is built in one
//   place with the same dependency list as before the move.
// Covering test: test/notes.test.ts (cards opened through nav), test/status-fix.test.ts.
import { useCallback, useMemo } from 'react';
import type { AppState } from '../../shared/domain';
import { pushRecent } from '../prefs';
import type { Nav } from './nav';
import type { OverlayState } from './useOverlays';
import type { RouterState } from './useRouter';

/**
 * @param router - from {@link useRouter}
 * @param overlays - from {@link useOverlays}
 * @param state - the app state; only `cadreList` is read
 * @returns the value for `NavCtx.Provider`
 */
export function useNavValue(router: RouterState, overlays: OverlayState, state: Pick<AppState, 'cadreList'>): Nav {
  const { route, go, setParams } = router;
  const { personId, cadreId, guard, setDirty, declare, note, openCadre } = overlays;
  const { setPersonId, setPersonList, setCadreId, setLayer } = overlays;
  // A cadre member in a post (ΕΠΟΠ/ΟΒΑ, negative id): the cadre card, not a soldier's.
  const openPerson = useCallback(
    (id: number, list?: number[]) => {
      if (id < 0) {
        const c = state.cadreList.find((x) => x.pid === id);
        if (c) openCadre(c.id);
        else go('cadre');
        return;
      }
      guard(() => {
        setPersonId(id);
        setPersonList(list?.includes(id) ? list : null);
        setCadreId(null);
        setLayer(null);
        pushRecent(id);
      });
    },
    [go, guard, openCadre, state.cadreList],
  );
  return useMemo(
    () => ({
      view: route.view,
      params: { ...route.params, person: personId, cadre: cadreId },
      go,
      set: setParams,
      declare,
      note,
      openPerson,
      openCadre,
      guard,
      setDirty,
    }),
    [route, personId, cadreId, go, setParams, declare, note, openPerson, openCadre, guard, setDirty],
  );
}
