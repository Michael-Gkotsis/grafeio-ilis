// The small messages at the bottom of the screen («Αποθηκεύτηκε», with an «Αναίρεση» button when it can be undone).
// Purpose: `ToastProvider` shows at most two toasts; `useToast()` returns the function that adds one;
//   `useToastPrune()` removes the undo buttons that are no longer valid.
// Does NOT: decide what can be undone (the caller passes `undoId`) or keep toasts across a reload.
// Owner layer: renderer/shared/ui. Why: every screen reports what it did the same way.
// Covering test: test/support/screens-harness.ts wraps every screen test in it (the markup of the stack).
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * A button on a toast.
 * `undoId` is the action (Ιστορικό) the button undoes: when another action happens after it, the button leaves the old
 * message (before, it stayed and said «Έγινε άλλη ενέργεια μετά…»). Actions without `undoId` always stay.
 */
export interface ToastAction {
  label: string;
  fn: () => void;
  undoId?: number;
}

/** What `useToast()` returns: `toast({ text, actions })`. `text` is any renderable content (string or elements). */
export type Toast = (t: { text: ReactNode; actions?: ToastAction[] }) => void;

interface ToastItem {
  id: string;
  text: ReactNode;
  actions?: ToastAction[];
}

const ToastCtx = createContext<Toast>(() => {});
const PruneCtx = createContext<(live: number) => void>(() => {});
/** Adds a toast; a no-op outside a `ToastProvider`. */
export const useToast = (): Toast => useContext(ToastCtx);
/** `prune(liveUndoId)`: keeps only the undo buttons of that action (and the buttons without an `undoId`). */
export const useToastPrune = (): ((live: number) => void) => useContext(PruneCtx);

/**
 * Provider and the toast stack (`aria-live="polite"`). A new toast pushes out all but the last of the older ones.
 * A toast with buttons stays 8 s, a plain one 5 s; pressing a button runs it and removes the toast.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: string) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback<Toast>(
    (t) => {
      const id = Math.random().toString(36).slice(2);
      setItems((list) => [...list.slice(-1), { id, ...t }]);
      setTimeout(() => remove(id), t.actions ? 8000 : 5000);
    },
    [remove],
  );
  // why: returns the same array when nothing changed, so React skips the render
  const prune = useCallback(
    (live: number) =>
      setItems((list) => {
        let changed = false;
        const next = list.map((t) => {
          const kept = (t.actions || []).filter((a) => a.undoId == null || a.undoId === live);
          if (kept.length === (t.actions || []).length) return t;
          changed = true;
          return { ...t, actions: kept };
        });
        return changed ? next : list;
      }),
    [],
  );
  return (
    <ToastCtx.Provider value={push}>
      <PruneCtx.Provider value={prune}>{children}</PruneCtx.Provider>
      <div className="ui-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="ui-toast" role="status">
            <div>{t.text}</div>
            {(t.actions || []).map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.fn();
                  remove(t.id);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
