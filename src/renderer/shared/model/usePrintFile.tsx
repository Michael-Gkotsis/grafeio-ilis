// Printing an Excel file that already exists, without Excel.
// Purpose: `usePrintFile` returns `(file, sheet?) => Promise<boolean>` that opens the print preview, or a toast on failure.
// Does NOT: make the file (see ExportProvider.tsx).
// Owner layer: renderer/shared/model. Why: moved down from renderer/common.ts (Phase 5.3b); reports, sources and the export gate use it.
// Covering test: test/reports-flow.test.ts.
import { useCallback } from 'react';
import { leadText } from '../lib/leadText';
import { useToast } from '../ui';

/** Εκτύπωση ενός Excel που υπάρχει ήδη (έντυπο που βγήκε, αρχείο από τα «Αρχεία Excel»), χωρίς Excel. */
export function usePrintFile() {
  const toast = useToast();
  return useCallback(
    async (file: string, sheet?: string | string[]) => {
      let r: Awaited<ReturnType<typeof window.api.printFile>>;
      try {
        r = await window.api.printFile(file, sheet);
      } catch (e) {
        r = { ok: false, error: String(e) };
      }
      if (!r.ok)
        toast({ text: leadText('Δεν άνοιξε η εκτύπωση.', r.error) });
      return r.ok;
    },
    [toast],
  );
}
