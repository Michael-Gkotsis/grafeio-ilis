// The IPC handlers of the report templates and the files around them.
//
// Purpose: `registerReportTemplatesIpc` (`repUpload`, `repInspect`, `repBuild`) and `registerReportFilesIpc`
//   (`repPickFile`, `repOpenTpl`, `repFiles`, `repLast`), each on its contract channel.
// Does NOT: fill or write a report (runIpc.ts), preview one (previewIpc.ts), or know the template format (reports.ts).
// Owner layer: main (architecture), `features/reports`. Imports app/*, `ipc/handle`, `features/commands`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.4), same channels in the same order (main.ts calls the five report
//   registrations in the same places of the boot closure). `Πρότυπα εντύπων` is a frozen data folder (CLAUDE.md
//   rule 3).
// Covering test: test/ipc-contract.test.ts (channels); the Electron comparison in the PR description.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dialog, shell } from 'electron';
import type { BuildOpts, RepKind } from '../../../shared/reports';
import { xlLook } from '../../../shared/xlLook';
import { msgOf } from '../../app/errors';
import { readMeta } from '../../app/meta';
import { TPL_DIR, TPL_MAX, TPL_NAME, tplBuf } from '../../app/paths';
import { store, win } from '../../app/state';
import { isLocked } from '../../files';
import { handle } from '../../ipc/handle';
import { buildTemplate, inspectTemplate } from '../../reports';
import { fail } from '../commands';

/** Registers `repUpload`, `repInspect` and `repBuild`: the report templates in the «Πρότυπα εντύπων» folder. */
export function registerReportTemplatesIpc() {
  // Έντυπα: templates in the «Πρότυπα εντύπων» folder, reports that are produced go to the Excel folder
  handle('repUpload', async (_e, kind: RepKind) => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε το Excel που θα γίνει πρότυπο',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    const src = res.canceled ? null : res.filePaths[0];
    if (!src) return null;
    try {
      if (/\.xls$/i.test(src))
        return fail('Το ' + path.basename(src) + ' είναι παλιό .xls. Άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx.');
      const st = fs.statSync(src);
      if (st.size > TPL_MAX)
        return fail('Το αρχείο είναι πάνω από 5 MB. Κράτα σε ένα αρχείο μόνο το φύλλο του εντύπου και ξαναδοκίμασε.');
      const buf = await fs.promises.readFile(src);
      const insp = await inspectTemplate(buf, kind);
      const file = crypto.randomUUID() + (/\.xlsm$/i.test(src) ? '.xlsm' : '.xlsx');
      await fs.promises.mkdir(TPL_DIR, { recursive: true });
      await fs.promises.writeFile(path.join(TPL_DIR, file), buf);
      return {
        ok: true,
        tpl: {
          id: crypto.randomUUID(),
          name: path.basename(src).replace(/\.xls[xm]$/i, ''),
          file,
          mtime: Math.round(fs.statSync(path.join(TPL_DIR, file)).mtimeMs),
        },
        insp,
      };
    } catch (e) {
      return fail('Δεν διαβάστηκε το ' + path.basename(src) + ': ' + msgOf(e));
    }
  });
  handle('repInspect', async (_e, file: string, kind: RepKind, sheet?: string, head?: number) => {
    try {
      return await inspectTemplate(await tplBuf(file), kind, sheet, head);
    } catch (e) {
      return fail(e);
    }
  });
  handle('repBuild', async (_e, o: BuildOpts, kind: RepKind, file?: string) => {
    try {
      const b = await buildTemplate(o, kind, xlLook(store.state.settings));
      const name = file && TPL_NAME.test(file) ? file : crypto.randomUUID() + '.xlsx';
      await fs.promises.mkdir(TPL_DIR, { recursive: true });
      const f = path.join(TPL_DIR, name);
      if (isLocked(f)) return fail('Το πρότυπο είναι ανοιχτό στο Excel. Κλείσε το Excel και ξαναπάτα.');
      await fs.promises.writeFile(f, b.data);
      return {
        ok: true,
        file: name,
        mtime: Math.round(fs.statSync(f).mtimeMs),
        sheet: b.sheet,
        head: b.head,
        cols: b.cols,
        cells: b.cells,
        ...(b.more ? { more: b.more } : {}),
        ...(b.vals ? { vals: b.vals } : {}),
        ...(b.fixed ? { fixed: true } : {}),
      };
    } catch (e) {
      return fail(e);
    }
  });
}
/** Registers `repPickFile`, `repOpenTpl`, `repFiles` and `repLast`: the files around the reports. */
export function registerReportFilesIpc() {
  // «Φύλλο σε άλλο Excel…»: the file that will get the sheet
  handle('repPickFile', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Σε ποιο Excel θα γράφεται το φύλλο',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  });
  handle('repOpenTpl', async (_e, file: string) => {
    if (TPL_NAME.test(file) && fs.existsSync(path.join(TPL_DIR, file))) await shell.openPath(path.join(TPL_DIR, file));
  });
  handle('repFiles', (_e, files: string[]) =>
    Object.fromEntries(
      (Array.isArray(files) ? files : [])
        .filter((f) => TPL_NAME.test(f))
        .map((f) => {
          try {
            return [f, { exists: true, mtime: Math.round(fs.statSync(path.join(TPL_DIR, f)).mtimeMs) }];
          } catch {
            return [f, { exists: false, mtime: 0 }];
          }
        }),
    ),
  );
  handle('repLast', () => readMeta().repLast || {});
}
