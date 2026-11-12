// State of the «ενημέρωση Excel» dialog: the preview of what would be written, and the write.
// Purpose: `useWrite`, the hooks of `WriteDialog`, in the order the dialog always called them.
// Does NOT: draw anything (ui/sections/WriteDialog.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-dialogs-forms.test.ts (snapshot sources-WriteDialog).
import { useEffect, useState } from 'react';
import type { Fail, WritePreview } from '../../../../shared/api';
import type { ListKind } from '../../../../shared/sources';
import { useToast } from '../../../shared/ui';

/**
 * Everything `WriteDialog` reads and calls.
 * @param list - the kind to write
 * @param onClose - closes the dialog (also after a successful write)
 * @returns the preview `pv` (null while it is read), `busy` and `go`
 */
export function useWrite(list: ListKind, onClose: () => void) {
  const toast = useToast();
  const [pv, setPv] = useState<WritePreview | Fail | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = async () => {
      setPv(await window.api.srcPlan(list));
    };
    load();
  }, [list]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await window.api.srcWrite(list);
      if (!r.ok) {
        toast({ text: r.error });
        return;
      }
      onClose();
      toast({ text: r.text, actions: [{ label: 'Άνοιξε', fn: () => window.api.openPath(r.file) }] });
    } finally {
      setBusy(false);
    }
  };
  return { pv, busy, go };
}
