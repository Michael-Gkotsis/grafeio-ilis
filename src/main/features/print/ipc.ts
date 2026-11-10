// The IPC handlers of the print preview window and of the print file guard.
//
// Purpose: `registerPrintIpc` (`printFile`, and the window's `layout`, `forget`, `duplex`), `registerPrintOutputIpc`
//   (`pdf`, `printers`) and `registerPrintJobIpc` (`print`, `close`).
// Does NOT: open the window or keep the jobs (preview.ts), remember settings (prefs.ts) or lay out pages
//   (`main/print.ts`).
// Owner layer: main (architecture), `features/print`. Imports app/*, `ipc/handle`, `features/forms`,
//   `features/commands`.
// Why: moved verbatim from main.ts (Phase 4.5), same channels in the same order. The `print:*` channels come from
//   shared/ipc/print.ts and are answered only for the sender's own job (`printJobs.get(e.sender.id)`).
// Covering test: test/ipc-contract.test.ts (channels), test/ipc-guards*.test.ts; the Electron comparison in the PR.
import fs from 'fs';
import path from 'path';
import { BrowserWindow, dialog } from 'electron';
import { nowHM, today } from '../../../shared/dates';
import { outputDir } from '../../app/dirs';
import { writeMeta } from '../../app/meta';
import { store } from '../../app/state';
import { handle, handlePrint } from '../../ipc/handle';
import { cleanOpts, infoOf, renderOpen, sectionsHtml } from '../../print';
import { fail } from '../commands';
import { knownPath } from '../forms';
import { savePrintPrefs } from './prefs';
import { printJobs, printPreview } from './preview';

/** Registers `printFile` (opens the preview of a known Excel) and the window's `layout`, `forget` and `duplex`. */
export function registerPrintIpc() {
  handle('printFile', (_e, file: string, sheet?: string | string[]) => {
    // files the app knows, or forms in the export folders (also of earlier days)
    const inside = (dir?: string) =>
      !!dir &&
      !path.relative(path.resolve(dir), path.resolve(file)).startsWith('..') &&
      !path.isAbsolute(path.relative(path.resolve(dir), path.resolve(file)));
    const known =
      knownPath(file) ||
      [outputDir(), ...Object.values(store.state.settings.forms || {}).map((b) => b?.dir)].some(inside);
    if (!known || !/\.xls[xm]?$/i.test(file) || !fs.existsSync(file))
      return fail('Δεν βρέθηκε το ' + path.basename(file));
    if (/\.xls$/i.test(file))
      return fail(
        'Το ' +
          path.basename(file) +
          ' είναι παλιό .xls. Άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx για να τυπώνεται από εδώ.',
      );
    return printPreview(
      file,
      Array.isArray(sheet) ? sheet.filter((x) => typeof x === 'string') : sheet ? [sheet] : undefined,
    );
  });
  // from the preview window: a new layout (pages, orientation, sheets...) of the already opened Excel
  handlePrint('layout', async (e, req: { opts?: unknown; sheets?: unknown; save?: boolean }) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return fail('Έκλεισε η εκτύπωση');
    try {
      const opts = cleanOpts(req?.opts, job.base);
      const sheets = Array.isArray(req?.sheets)
        ? req!.sheets.filter((x): x is string => typeof x === 'string')
        : job.sheets;
      const doc = await renderOpen(job.book, { file: path.basename(job.file), sheets, layout: opts });
      job.sheets = doc.sheets.map((x) => x.name);
      job.opts = opts;
      if (req?.save) savePrintPrefs(job.key, opts);
      return { ok: true, html: sectionsHtml(doc), css: doc.css, info: infoOf(doc) };
    } catch (err) {
      return fail(err);
    }
  });
  // «Να θυμάται» unchecked or «Αρχικές ρυθμίσεις»: forgets the saved settings and returns the form's defaults
  handlePrint('forget', (e) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return null;
    savePrintPrefs(job.key, null);
    return job.base;
  });
  handlePrint('duplex', (_e, on: unknown) => {
    writeMeta({ printDuplex: on === true });
  });
}
/** Registers the window's `pdf` (save as PDF, with an audit line) and `printers` (the installed printers). */
export function registerPrintOutputIpc() {
  // PDF: the same as on paper, in the folder of the file (or where the user chooses)
  handlePrint('pdf', async (e) => {
    const job = printJobs.get(e.sender.id);
    if (!job) return fail('Έκλεισε η εκτύπωση');
    const pw = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(pw!, {
      title: 'Αποθήκευση PDF',
      defaultPath: path.join(path.dirname(job.file), path.basename(job.file).replace(/\.xls[xm]?$/i, '') + '.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, error: '' };
    try {
      const data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true });
      await fs.promises.writeFile(r.filePath, data);
      store.addAudit(
        {
          at: nowHM(),
          day: today(),
          text: 'PDF ' + path.basename(r.filePath) + ' από ' + path.basename(job.file),
          files: [path.basename(job.file)],
          source: 'app',
          undoable: false,
        },
        null,
      );
      return { ok: true, name: path.basename(r.filePath) };
    } catch (err) {
      return fail(err);
    }
  });
  handlePrint('printers', async (e) => {
    try {
      return (await e.sender.getPrintersAsync()).map((p) => ({
        name: p.name,
        label: p.displayName || p.name,
        def: !!p.isDefault,
      }));
    } catch {
      return [];
    }
  });
}
/** Registers the window's `print` (to the printer, with an audit line) and `close`. */
export function registerPrintJobIpc() {
  // With a printer chosen in the bar: prints without the Windows dialog, so the paper and the orientation of the
  // sheet stay (the dialog takes the printer's defaults, usually portrait, and cuts landscape sheets)
  handlePrint(
    'print',
    async (
      e,
      o: {
        landscape?: boolean;
        pageSize?: string;
        part?: string;
        device?: string;
        copies?: number;
        duplex?: string;
      },
    ) => {
      const job = printJobs.get(e.sender.id);
      if (!job) return fail('Έκλεισε η εκτύπωση');
      const pageSize = ['A3', 'A4', 'A5', 'Legal', 'Letter'].includes(String(o?.pageSize)) ? String(o.pageSize) : 'A4';
      let device = typeof o?.device === 'string' && o.device ? o.device : '';
      if (device) {
        try {
          if (!(await e.sender.getPrintersAsync()).some((p) => p.name === device)) device = '';
        } catch {
          device = '';
        }
      }
      const copies = Math.min(99, Math.max(1, Math.floor(Number(o?.copies) || 1)));
      const duplexMode = o?.duplex === 'longEdge' || o?.duplex === 'shortEdge' ? o.duplex : 'simplex';
      return new Promise((res) =>
        e.sender.print(
          {
            silent: !!device,
            ...(device ? { deviceName: device, copies, collate: true } : {}),
            printBackground: true,
            landscape: !!o?.landscape,
            pageSize,
            duplexMode,
            margins: { marginType: 'none' },
          },
          (ok, reason) => {
            if (ok)
              store.addAudit(
                {
                  at: nowHM(),
                  day: today(),
                  text:
                    'Εκτύπωση ' +
                    path.basename(job.file) +
                    (job.sheets.length > 1 || o?.part
                      ? ' (' + job.sheets.join(', ') + (o?.part ? ', μέρος ' + o.part : '') + ')'
                      : ''),
                  files: [path.basename(job.file)],
                  source: 'app',
                  undoable: false,
                },
                null,
              );
            res(ok ? { ok: true } : { ok: false, error: reason === 'cancelled' ? '' : 'Δεν τυπώθηκε: ' + reason });
          },
        ),
      );
    },
  );
  handlePrint('close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
}
