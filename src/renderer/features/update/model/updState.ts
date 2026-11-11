// The client side of the auto-update: the shared state the main process pushes, and the hooks that read it.
// Purpose: `useUpd` returns the last `UpdInfo` the main process sent (or null when updates are not available);
// `useUpdDialog` opens the update dialog when the main process offers one or an update starts.
// Does NOT: decide anything about updates (updater.ts in main does) or change an IPC name, payload or text: this is the
// client half of the frozen auto-update contract (src/main/update.ts, src/shared/api.ts: updInfo, onUpdate, updSeen).
// Owner layer: renderer/features/update. Why: moved verbatim from renderer/update.ts (Phase 5.3b).
// Covering test: test/auto-update.test.ts.
import { useEffect, useState } from 'react';
import type { UpdInfo } from '../../../../shared/api';

let cur: UpdInfo | null = null,
  started = false;
const subs = new Set<() => void>();
const set = (i: UpdInfo | null) => {
  if (!i) return;
  cur = i;
  for (const f of subs) f();
};
function init() {
  if (started) return;
  started = true;
  try {
    window.api.updInfo?.().then(set, () => {});
    window.api.onUpdate?.(set);
  } catch {
    /* χωρίς ενημερώσεις */
  }
}

/** The last update state from the main process, or null while there is none. Starts listening on first use. */
export function useUpd(): UpdInfo | null {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return cur;
}

/** Το παράθυρο ανοίγει μόνο του όταν ο main το ζητά (offer) ή όταν ξεκινά ενημέρωση από τις Ρυθμίσεις. */
export function useUpdDialog(u: UpdInfo | null): [boolean, (b: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (u?.offer) {
      setOpen(true);
      window.api.updSeen(true).catch(() => {});
    }
  }, [u?.offer]);
  useEffect(() => {
    if (u?.phase === 'working') setOpen(true);
  }, [u?.phase]);
  return [open, setOpen];
}
