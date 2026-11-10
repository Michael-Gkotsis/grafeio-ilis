// Navigation as the screens see it: the current view and params, and the ways to move or open a card.
// Purpose: the `Nav` interface, its React context, `useNav`, and `useOpenFrom` (open a person from a list).
// Does NOT: own the route (useRouter.ts), the cards (useOverlays.ts) or the menu (routes.ts).
// Owner layer: renderer/app. Why: every screen calls `nav.go(...)`; the contract must not depend on the shell.
// Covering test: test/support/screens-harness.ts (a no-op Nav for every screen), test/notes.test.ts.
import { createContext, useCallback, useContext, useRef } from 'react';
import type { RouteParams } from './screenId';

/**
 * The navigation API of the shell.
 * `params` also carries the open cards as `person` and `cadre`.
 */
export interface Nav {
  /** A `ScreenId` at run time. Typed `string` for now: several callers (the GO tables of common.ts and dayForms.ts, the
   *  guide topics) still hold plain strings; Phase 5.1b types them, then this becomes `ScreenId`. */
  view: string;
  params: RouteParams;
  /** From the menu (no params) it restores what the screen remembered; with params it uses only those. */
  go(view: string, params?: RouteParams): void;
  /** Merges params into the current route (a tab or a date change; no history entry). */
  set(params: RouteParams): void;
  /** Opens the «Δήλωση» dialog with an optional start state. */
  declare(data: RouteParams): void;
  /** New note (Ctrl+Shift+N), bound to a person or cadre member when given. */
  note(data?: { pid?: number; cid?: string }): void;
  /** `list` is the list you were looking at, so ↑/↓ inside the card walk through it. */
  openPerson(id: number, list?: number[]): void;
  /** The cadre card opens above every screen, like the soldier's card. */
  openCadre(id: string, list?: string[]): void;
  /** Before leaving a card with an unsaved note: asks, otherwise runs `go` at once. */
  guard(go: () => void): void;
  /** A card says it has an unsaved note. */
  setDirty(on: boolean): void;
}

/** Provided by Shell. */
export const NavCtx = createContext<Nav>(null as unknown as Nav);

/** The navigation of the nearest Shell. */
export const useNav = () => useContext(NavCtx);

/**
 * Opens a soldier's card from a list: the card learns the list (with its filters and order) for ↑/↓.
 * The returned function is stable, so memoised rows do not re-render; the list is read at the moment of the click.
 * @param rows - the rows on screen, in order
 */
export function useOpenFrom(rows: { id: number }[]) {
  const nav = useNav();
  const ref = useRef(rows);
  ref.current = rows;
  const open = nav.openPerson;
  return useCallback(
    (id: number) =>
      open(
        id,
        ref.current.map((p) => p.id),
      ),
    [open],
  );
}
