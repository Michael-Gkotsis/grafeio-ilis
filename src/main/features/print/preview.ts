// The print preview window: the open jobs, the one-at-a-time gate and the window itself.
//
// Purpose: `printJobs` (one entry per open preview window), `printPage` (open the Excel and write the preview page)
//   and `printPreview` (wait for the gate, create the window, register the job, clean up when it closes).
// Does NOT: lay out pages (`main/print.ts`), answer the window's IPC (ipc.ts) or decide which files may be printed
//   (`printFile` in ipc.ts).
// Owner layer: main (architecture), `features/print`. Imports app/*, prefs.ts, the print engine, `features/commands`.
// Why: moved verbatim from main.ts (Phase 4.5). `printJobs` and the gate are single module-level instances, owned
//   here: the exports, the reports and the window's IPC all go through this one file, so previews stay serial.
// Covering test: test/print*.test.ts; `npm run bench:golden` (print geometry); the Electron comparison in the PR.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { readMeta } from '../../app/meta';
import { win } from '../../app/state';
import type { PrintJob } from '../../app/types';
import {
  cleanOpts,
  openBook,
  previewHtml,
  printDefaults,
  printKey,
  rememberedSheets,
  renderOpen,
  sheetFontSize,
} from '../../print';
import { fail } from '../commands';
import { printPrefs } from './prefs';

/** The open print windows, by the id of their webContents; the window's IPC handlers find their job here. */
export const printJobs = new Map<number, PrintJob>();

/**
 * Opens the Excel file and writes the preview page to a temp .html (the window is not created here).
 * @param sheets the sheets asked for; without them, the remembered ones, else all visible sheets
 * @param fix the form has «Σταθερό μέγεθος γραμμάτων» (@decision Michael 4/11): «Όσες χρειάζονται» pages with the
 *   Excel's own letter size, over whatever was saved
 */
async function printPage(file: string, sheets?: string[], fix?: boolean): Promise<Omit<PrintJob, 'file'>> {
  const book = await openBook(await fs.promises.readFile(file));
  const key = printKey(file);
  const visible = book.sheets.filter((x) => !x.hidden).map((x) => x.name);
  let base = printDefaults(key, sheets && sheets.length ? sheets : visible);
  const { opts, remember } = printPrefs(key, base);
  if (fix) {
    const sz = await sheetFontSize(book, (sheets && sheets[0]) || visible[0] || '');
    const f = cleanOpts({ pages: 'auto', size: sz }, base);
    base = { ...base, pages: f.pages, size: f.size };
    opts.pages = f.pages;
    opts.size = f.size;
  }
  // the sheets chosen last time (unless specific ones were asked for); if one is missing, the initial choice
  const rem = rememberedSheets(opts.sheets, visible);
  if (rem) opts.sheets = rem;
  else delete opts.sheets;
  const want = sheets && sheets.length ? sheets : rem;
  const doc = await renderOpen(book, { file: path.basename(file), sheets: want, layout: opts });
  const tmp = path.join(app.getPath('temp'), 'grafeio-print-' + crypto.randomUUID() + '.html');
  await fs.promises.writeFile(
    tmp,
    previewHtml(doc, path.basename(file), { opts, remember, duplex: !!readMeta().printDuplex }),
  );
  return { tmp, sheets: doc.sheets.map((x) => x.name), book, key, base, opts };
}
// One preview at a time («Τύπωσε όλα» in Έντυπα ημέρας): the next one opens when the previous one is closed
let previewGate: Promise<void> = Promise.resolve();
/**
 * Opens the print preview window of an Excel file, after the previous preview has been closed (the gate).
 * @param sheets the sheets to show; without them, the remembered ones, else all visible sheets
 * @param fix see `printPage`
 * @returns `{ ok: true }` once the window is loading, or `{ ok: false, error }`; never throws.
 */
export async function printPreview(
  file: string,
  sheets?: string[],
  fix?: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prev = previewGate;
  let free = () => {};
  previewGate = new Promise<void>((r) => {
    free = r;
  });
  await prev;
  try {
    const p = await printPage(file, sheets, fix);
    const pw = new BrowserWindow({
      parent: win || undefined,
      modal: !!win,
      width: 1280,
      height: 880,
      minWidth: 820,
      minHeight: 520,
      show: false,
      title: 'Εκτύπωση · ' + path.basename(file),
      backgroundColor: '#5f6368',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'print.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    pw.setMenu(null);
    const id = pw.webContents.id;
    printJobs.set(id, { file, ...p });
    pw.once('ready-to-show', () => {
      if (win && win.isMaximized()) pw.maximize();
      pw.show();
    });
    pw.on('closed', () => {
      const j = printJobs.get(id);
      if (j) fs.rmSync(j.tmp, { force: true });
      printJobs.delete(id);
      free();
    });
    try {
      await pw.loadFile(p.tmp);
    } catch (e) {
      pw.destroy();
      throw e;
    }
    return { ok: true };
  } catch (e) {
    free();
    return fail(e);
  }
}
