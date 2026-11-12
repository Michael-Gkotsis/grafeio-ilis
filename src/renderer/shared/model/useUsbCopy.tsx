// The «Αντίγραφο σε USB» button logic: take the copy, refresh the state, say what happened.
// Purpose: `useUsbCopy` returns `() => Promise<boolean>`; Σήμερα, the command palette and «Ρυθμίσεις › Αντίγραφα» use
//   it.
// Does NOT: list backups or restore one (pages/settings/model/useBackups.ts) or decide when the reminder shows
//   (`usbDue` in src/shared/reminders.ts).
// Owner layer: renderer/shared/model. Why: moved down from renderer/common.ts (Phase 6, Ρυθμίσεις S4) so a page can use
//   it without importing a legacy file; common.ts re-exports it until Phase 7 (Σήμερα and the palette still import it
//   from there).
// Covering test: test/screens-settings-guide.test.ts (the «Ρυθμίσεις › Αντίγραφα» card), test/ux-names.test.ts.
import { useCallback } from 'react';
import { leadText } from '../lib/leadText';
import { useToast } from '../ui';
import { useStore } from './store';

/**
 * Έρευνα §4.2: one button for the USB copy, and a reminder on «Σήμερα» after more than 7 days.
 * @returns a stable callback that resolves to `true` when the copy was taken (a warning still counts), `false` when
 *   the user cancelled the folder picker or the copy failed (an error toast is shown)
 */
export function useUsbCopy() {
  const { refresh } = useStore();
  const toast = useToast();
  return useCallback(async () => {
    const r = await window.api.usbCopy();
    if (!r) return false;
    if (r.ok) await refresh();
    toast({
      text:
        r.ok && !r.warning
          ? 'Πάρθηκε αντίγραφο στο ' + r.file + '. Κράτα το USB έξω από το PC.'
          : leadText(r.ok ? 'Πάρθηκε αντίγραφο, αλλά:' : 'Δεν έγινε.', r.ok ? r.warning : r.error),
    });
    return r.ok;
  }, [refresh, toast]);
}
