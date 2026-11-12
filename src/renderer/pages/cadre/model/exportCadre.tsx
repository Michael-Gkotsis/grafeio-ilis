// The «Βγάλε το Excel» action of the «Στελέχη» screen: ask main for the file, then toast the result.
// Purpose: `exportCadreXl`, the body of the screen's `exportXl`, kept as a plain function so `useCadre` stays short.
// Does NOT: hold state (the caller passes the setter) or word the success text (model/view.ts `exportToastText`).
// Owner layer: renderer/pages/cadre. Why: moved verbatim from screens/cadre.ts (Phase 6).
// Covering test: test/cadre-page-view.test.ts (the wording); the call itself is part of the Electron drive.
import type { Cadre } from '../../../../shared/domain';
import type { Sig } from '../../../../shared/sigs';
import type { Toast } from '../../../shared/ui';
import { exportToastText } from './view';

/** What the export needs from the screen. `date` and `today` are ISODate, local time. */
export interface CadreExportCtx {
  date: string;
  today: string;
  all: Cadre[];
  toast: Toast;
  setXl: (busy: boolean) => void;
}

/** Makes the Excel of the shown day (`sigs` only for this time) and toasts its name, or why it failed. */
export async function exportCadreXl({ date, today, all, toast, setXl }: CadreExportCtx, sigs?: Sig[]) {
  setXl(true);
  try {
    const r = await window.api.exportCadre(date, sigs);
    toast({
      text: r.ok ? (
        exportToastText(
          r.file,
          all.some((c) => !c.active),
          date,
          today,
        )
      ) : (
        <span>
          <b>Δεν βγήκε.</b> {r.error}
        </span>
      ),
    });
  } finally {
    setXl(false);
  }
}
