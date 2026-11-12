// State of the roster import preview: the two boxes, the busy flag, the error line and the import.
// Purpose: `useRoster`, the hooks of `RosterPreview`, in the order the preview always called them.
// Does NOT: draw anything (ui/sections/RosterPreview.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-settings-guide.test.ts.
import { useState } from 'react';
import type { ImportPreview } from '../../../../shared/api';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/**
 * Everything `RosterPreview` reads and calls.
 * @param pv - the preview the main process made of the roster file
 * @param onDone - called after the import
 * @returns the boxes (`deact`, `okd`), `busy`, `err`, `doubt` (something does not add up) and `go`
 */
export function useRoster(pv: ImportPreview, onDone: () => void) {
  const { refresh } = useStore();
  const toast = useToast();
  const [deact, setDeact] = useState(true);
  const [okd, setOkd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const doubt = (pv.declared != null && pv.declared !== pv.found) || pv.suspicious.length > 0;
  const go = async () => {
    setBusy(true);
    try {
      const r = await window.api.applyRoster(pv.token, deact);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      await refresh();
      toast({ text: r.text });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return { deact, setDeact, okd, setOkd, busy, err, doubt, go };
}
