// State of everything the shell opens on top of a screen: dialogs, cards, the legend, the search palette.
// Purpose: `useOverlays()` returns the open layer, the open soldier/cadre card, the unsaved-note guard and the setters.
// Does NOT: decide which keys open them (useShortcuts.ts) or draw them (Overlays.tsx).
// Owner layer: renderer/app. Why: this state was a block of 20 lines inside Shell; the router and the shortcuts both
//   need to close or open it.
// Covering test: test/notes.test.ts (note dialog, unsaved-note guard), test/status-fix.test.ts.
import { useCallback, useRef, useState } from 'react';
import type { RouteParams } from './screenId';

/** A dialog or sheet opened by the shell. `more` is the phone «Άλλα» sheet. */
export type Layer =
  | { kind: 'declare'; data: RouteParams }
  | { kind: 'note'; data: { pid?: number; cid?: string } }
  | { kind: 'more' }
  | null;

/** Legend (Shift+F1) and search (Ctrl+K) open above a dialog without closing the declaration being written. */
export type Over = 'legend' | 'palette' | null;

/**
 * Overlay state of the shell.
 * A note typed on a person's card and not saved is guarded: before the card changes person, changes tab or closes, the
 * user is asked ({@link Overlays} shows the question), otherwise `guard(go)` runs `go` at once.
 */
export function useOverlays() {
  const [layer, setLayer] = useState<Layer>(null);
  const [over, setOver] = useState<Over>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  // ↑/↓ in the card: the list it was opened from
  const [personList, setPersonList] = useState<number[] | null>(null);
  // The cadre card is a side sheet like the soldier's.
  const [cadreId, setCadreId] = useState<string | null>(null);
  const [cadreOrder, setCadreOrder] = useState<string[] | null>(null);
  const noteDirty = useRef(false);
  const [leaveNote, setLeaveNote] = useState<(() => void) | null>(null);
  const setDirty = useCallback((on: boolean) => {
    noteDirty.current = on;
  }, []);
  const guard = useCallback((go: () => void) => {
    if (noteDirty.current) setLeaveNote(() => go);
    else go();
  }, []);
  const [baseLater, setBaseLater] = useState(false);
  // The keyboard handler reads the open cards at the moment of the key press.
  const open = useRef({ person: personId, cadre: cadreId });
  open.current = { person: personId, cadre: cadreId };
  const declare = useCallback((data: RouteParams) => setLayer({ kind: 'declare', data }), []);
  const note = useCallback((data?: { pid?: number; cid?: string }) => setLayer({ kind: 'note', data: data || {} }), []);
  // The cadre card opens above every screen, and a soldier's card closes (one card at a time).
  const openCadre = useCallback(
    (id: string, list?: string[]) =>
      guard(() => {
        setCadreId(id);
        setCadreOrder(list?.includes(id) ? list : null);
        setPersonId(null);
        setLayer(null);
      }),
    [guard],
  );
  /** Leaving a screen closes every layer and card. */
  const closeAll = useCallback(() => {
    setLayer(null);
    setOver(null);
    setPersonId(null);
    setCadreId(null);
  }, []);
  return {
    layer,
    setLayer,
    over,
    setOver,
    personId,
    setPersonId,
    personList,
    setPersonList,
    cadreId,
    setCadreId,
    cadreOrder,
    leaveNote,
    setLeaveNote,
    baseLater,
    setBaseLater,
    open,
    guard,
    setDirty,
    declare,
    note,
    openCadre,
    closeAll,
  };
}

/** Everything {@link useOverlays} returns. */
export type OverlayState = ReturnType<typeof useOverlays>;
