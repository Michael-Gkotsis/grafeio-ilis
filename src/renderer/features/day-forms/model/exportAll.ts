// «Βγάλε όλα» / «Τύπωσε όλα»: makes the picked forms one after the other, then opens the print previews one at a time.
// Purpose: `exportAll` is the body of the dialog's `go`; it reports each line through `setDone` and the whole through `setBusy`.
// Does NOT: choose the forms (the caller passes `pick`) or draw anything.
// Owner layer: renderer/features/day-forms. Why: moved verbatim from screens/dayForms.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts.
import type { Dispatch, SetStateAction } from 'react';
import type { ExportKind, ExportResult } from '../../../../shared/api';
import type { AppState } from '../../../../shared/domain';
import { rowsOf } from '../../../../shared/reports';
import type { Done, Item } from './items';

/** What `exportAll` needs from the dialog. `sync` re-reads the state after the files are made. */
export interface ExportAllCtx {
  state: AppState;
  items: Item[];
  pick: number[];
  sync: () => Promise<unknown>;
  setBusy: (b: '' | 'xl' | 'print') => void;
  setDone: Dispatch<SetStateAction<Record<number, Done | 'run'>>>;
}

/** Makes one line's file. A failure becomes `{ ok: false, error }`, never a throw. */
async function makeOne(c: ExportAllCtx, it: Item, print: boolean) {
  const { state } = c;
  let r: ExportResult & { sheets?: string[] };
  // οι προειδοποιήσεις φάνηκαν εδώ: «Βγάλε όλα» είναι το «Το ξέρω, συνέχισε» και γράφονται στο Ιστορικό
  try {
    if (it.rep) {
      const tpl = (state.settings.reportTpls || []).find((t) => t.id === it.rep!.tpl)!;
      r = await window.api.repRun(
        it.rep,
        tpl.file,
        rowsOf(state, it.rep, it.date).map((x) => x.id),
        it.date,
        false,
        false,
        { quiet: print },
      );
    } else r = await window.api.exportFile(it.kind as ExportKind, it.date, { open: !print, ack: true });
  } catch (e) {
    r = { ok: false, error: String(e) };
  }
  return r;
}

/** Βγάλε όλα (`print` false: the files open in Excel) or Τύπωσε όλα (`print` true: print previews, one after the other). */
export async function exportAll(c: ExportAllCtx, print: boolean) {
  const { items, pick, sync, setBusy, setDone } = c;
  setBusy(print ? 'print' : 'xl');
  setDone({});
  const files: [number, string, string[] | undefined][] = [];
  for (const i of pick) {
    const it = items[i];
    setDone((d) => ({ ...d, [i]: 'run' }));
    const r = await makeOne(c, it, print);
    if (r.ok) {
      files.push([i, r.file, r.sheets]);
      setDone((d) => ({
        ...d,
        [i]: {
          ok: true,
          text:
            'Βγήκε: ' +
            r.file.split(/[\\/]/).pop() +
            (r.ok && r.warnings.length ? ' · ⚠ ' + r.warnings.join(' · ') : ''),
          file: r.file,
        },
      }));
    } else setDone((d) => ({ ...d, [i]: { ok: false, text: 'Δεν βγήκε: ' + r.error } }));
  }
  await sync();
  // μία προεπισκόπηση τη φορά: η επόμενη ανοίγει όταν κλείσει η προηγούμενη
  if (print)
    for (const [i, f, sh] of files) {
      setDone((d) => ({ ...d, [i]: { ok: true, text: 'Στην εκτύπωση: ' + f.split(/[\\/]/).pop(), file: f } }));
      const p = await window.api.printFile(f, sh).catch((e) => ({ ok: false as const, error: String(e) }));
      if (!p.ok) setDone((d) => ({ ...d, [i]: { ok: false, text: 'Δεν άνοιξε η εκτύπωση: ' + p.error } }));
    }
  setBusy('');
}
