// State of the «Εισαγωγή Δυναμολογίου» card: the picked file's preview, the error and the busy flag.
// Purpose: `useImportCard`, the hooks of `ImportCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/ImportCard.tsx) or read the file (main process, `window.api.pickRoster`).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/screens-settings-guide.test.ts.
import { useState } from 'react';
import type { ImportPreview } from '../../../../shared/api';
import { useNav } from '../../../shared/model';

/**
 * Everything `ImportCard` reads and calls.
 * @returns `nav`, the preview `pv` with `setPv`, the error text `err`, the `busy` flag and `pick` (asks for the file;
 *   a cancelled picker changes nothing)
 */
export function useImportCard() {
  const nav = useNav();
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await window.api.pickRoster();
      if (!r) return;
      if (!r.ok) setErr(r.error);
      else setPv(r);
    } finally {
      setBusy(false);
    }
  };
  return { nav, pv, setPv, err, busy, pick };
}
