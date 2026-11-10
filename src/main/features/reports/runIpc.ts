// The IPC handlers that run a report and read its history.
//
// Purpose: `registerReportRunIpc` registers `repRun` (write the sheet, or make the file and open or print it, then
//   count the random picks and write the history), `repTimes` and `repHist`.
// Does NOT: fill a report (reports.ts), write a sheet (sheet.ts) or own the print window (`features/print`).
// Owner layer: main (architecture), `features/reports`. Imports app/*, `ipc/handle`, `features/*`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.4), same channels in the same order. Since Phase 4.5 `printPreview` is a
//   direct import of `features/print` (it was a parameter while the print window lived in main.ts).
// Covering test: test/ipc-contract.test.ts (channels); the Electron comparison in the PR description.
import fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import { nowHM, today, type ISODate } from '../../../shared/dates';
import type { Report } from '../../../shared/reports';
import { HIST_MAX, readMeta, writeMeta, type RepHist } from '../../app/meta';
import { outputDir } from '../../app/dirs';
import { tplBuf } from '../../app/paths';
import { serial } from '../../app/serial';
import { store } from '../../app/state';
import type { RepOut } from '../../app/types';
import { TemplateError } from '../../exports';
import { ChangedError, LockedError, writeAll } from '../../files';
import { handle } from '../../ipc/handle';
import { off } from '../../offload';
import { fillReport } from '../../reports';
import { fail } from '../commands';
import { logWrite } from '../autowrite';
import { printPreview } from '../print';
import { notify } from '../sources';
import { countTimes, repTimes } from './times';
import { savedSigs, writeRepSheet } from './sheet';

/**
 * Registers `repRun`, `repTimes` and `repHist`: produce a report (a sheet in an Excel, or a new file that is opened or
 * printed), then remember it in `meta.json` (`repLast`, `repHist`, `repTimes`).
 */
export function registerReportRunIpc() {
  handle(
    'repRun',
    async (
      _e,
      r: Report,
      file: string,
      ids: (number | string)[],
      date: ISODate,
      print: boolean,
      force?: boolean,
      opts?: { quiet?: boolean; again?: boolean },
    ): Promise<RepOut> => {
      try {
        const s = store.state;
        const t0 = Date.now();
        let res: RepOut;
        if (r.out === 'sheet' && !print) {
          res = await serial(() => writeRepSheet(r, file, ids, date, !!force));
          if (res.ok) {
            logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0);
            notify();
          }
        } else {
          const buf = await tplBuf(file);
          const rs = savedSigs(r, file);
          const out = await off('fillReport', [buf, rs, ids, date], () => fillReport(buf, s, rs, ids, date), s);
          const ext = /\.xlsm$/i.test(file) ? '.xlsm' : '.xlsx';
          const [f] = await serial(() =>
            writeAll([{ dir: outputDir(), name: out.name.replace(/\.xlsx$/, ext), data: out.data }]),
          );
          logWrite('Έντυπο ' + r.name, t0);
          const warnings = [...(out.warnings || [])];
          if (print) {
            const p = await printPreview(f, out.sheets, !!r.fixsz);
            if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
          } else if (!opts?.quiet) shell.openPath(f);
          res = { ok: true, file: f, warnings, sheets: out.sheets };
        }
        if (!res.ok) return res;
        if (r.pick.mode === 'random' && !opts?.again) countTimes(r.id, ids);
        const at = today() + ' ' + nowHM();
        const m = readMeta();
        const h: RepHist = {
          at,
          date,
          ids: ids.slice(0, 2000),
          n: ids.length,
          file: res.file,
          ...(res.sheets && r.out === 'sheet' && !print ? { sheets: res.sheets } : {}),
        };
        writeMeta({
          repLast: { ...(m.repLast || {}), [r.id]: at },
          repHist: { ...(m.repHist || {}), [r.id]: [h, ...(m.repHist?.[r.id] || [])].slice(0, HIST_MAX) },
        });
        return res;
      } catch (e) {
        if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
        if (e instanceof ChangedError)
          return {
            ok: false,
            error: 'Το ' + path.basename(e.file || '') + ' άλλαξε την ώρα που γραφόταν. Πάτα ξανά.',
          };
        if (e instanceof TemplateError) return { ok: false, error: e.message };
        return fail(e);
      }
    },
  );
  handle('repTimes', (_e, id: string) => repTimes(id));
  handle('repHist', (_e, id: string) =>
    (readMeta().repHist?.[id] || []).map((h) => ({ ...h, exists: fs.existsSync(h.file) })),
  );
}
