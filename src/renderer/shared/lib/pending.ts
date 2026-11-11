// Unsaved changes of cards (Settings, ΗΚΑΙ) and the «leave anyway?» question.
// Purpose: a card declares its unsaved changes with `usePending`; the app shows a bar at the bottom
//   («Δεν αποθηκεύτηκαν: …») and asks before the screen or section changes, so nothing is lost silently.
// Does NOT: render the bar or the question (app/PendingBar.tsx) or save anything itself (each card gives `save`).
// Owner layer: renderer/shared/lib. Why: every card and the shell share one registry.
// Covering test: test/status-fix.test.ts and test/rep-page.test.ts (the pending list).
// @decision Michael 22/10: «να μην έχουμε regression»; before this, a change was lost silently.
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * One card's unsaved work.
 * `bar: false`: the page has its own «Αποθήκευση»/«Άκυρο» (Έντυπα › creation page): no bar at the bottom, only the
 * question when you leave.
 */
export interface Pending {
  label: string;
  save: () => Promise<unknown> | unknown;
  discard: () => void;
  bar?: false;
}
const reg = new Map<number, { current: Pending }>();
let seq = 0;
let snap: Pending[] = [];
let asking: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => {
  snap = [...reg.values()].map((r) => r.current);
  for (const f of subs) f();
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/**
 * Registers the card's unsaved work while `dirty` is true.
 * @param dirty - the card has something that was not saved
 * @param p - `save` returns something truthy when it saved (run → new state)
 */
export function usePending(dirty: boolean, p: Pending) {
  const ref = useRef(p);
  ref.current = p;
  useEffect(() => {
    if (!dirty) return;
    const id = ++seq;
    reg.set(id, ref);
    emit();
    return () => {
      reg.delete(id);
      emit();
    };
  }, [dirty]);
}
/** The current list of unsaved work (no subscription; for event handlers). */
export const pendingNow = () => snap;
/** The current list of unsaved work; re-renders when it changes. */
export const usePendingList = () => useSyncExternalStore(subscribe, () => snap);
/** The «leave anyway?» callback while the question is open, otherwise `null`. */
export const useLeaveAsk = () => useSyncExternalStore(subscribe, () => asking);

/** Before leaving the page: with nothing pending `go` runs at once, otherwise the question opens (PendingBar). */
export function requestLeave(go: () => void) {
  if (!reg.size) {
    go();
    return;
  }
  asking = go;
  emit();
}
/** Closes the leave question without leaving. */
export function closeLeaveAsk() {
  asking = null;
  emit();
}
/** Saves every pending card in order; `false` when any of them failed or returned something falsy. */
export async function saveAll(): Promise<boolean> {
  let ok = true;
  for (const p of [...snap]) {
    try {
      if (!(await p.save())) ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
}
/** Discards every pending card. */
export function discardAll() {
  for (const p of [...snap]) p.discard();
}
