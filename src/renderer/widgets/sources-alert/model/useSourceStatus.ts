// The state of the Excel files, kept fresh.
// Purpose: `useSourceStatus` asks the main process for the status of the sources and forms, and asks again when the main
//   process pushes a change, when the window gets focus again and when the sources or forms settings change.
// Does NOT: judge the status (model/view.ts does) or draw anything.
// Owner layer: renderer/widgets/sources-alert. Why: moved verbatim from screens/srcStatus.ts (Phase 5.3c part 2); «Σήμερα»
//   and the Αρχεία Excel screen both use it.
// Covering test: test/screens-main.test.ts (Σήμερα), test/sources.test.ts.
import { useEffect, useState } from 'react';
import type { FormOut, SourceStatus } from '../../../../shared/api';
import { useStore } from '../../../shared/model';

/** The status of the Excel files: sources (Δυναμολόγιο, Υπηρεσίες…) and the forms. */
export interface SourcesState {
  sources: SourceStatus[];
  forms: FormOut[];
}

// Κατάσταση των αρχείων: φρεσκάρεται όταν γράφει ο main, όταν γυρνάς στο παράθυρο και κάθε φορά που ανοίγει η οθόνη
export function useSourceStatus(): SourcesState {
  const { state, sync } = useStore();
  const key = JSON.stringify([state.settings.sources || {}, state.settings.forms || {}]);
  const [st, setSt] = useState<SourcesState>({ sources: [], forms: [] });
  useEffect(() => {
    let on = true;
    // ο main μπορεί να άλλαξε και την κατάσταση (π.χ. πίνακας που μετακινήθηκε μέσα στο φύλλο): φέρνουμε ό,τι άλλαξε
    const load = () =>
      window.api.srcStatus().then((x) => {
        if (on) {
          setSt(x);
          sync();
        }
      });
    load();
    const off = window.api.onSources((x) => {
      setSt(x);
      sync();
    });
    window.addEventListener('focus', load);
    return () => {
      on = false;
      off();
      window.removeEventListener('focus', load);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}
