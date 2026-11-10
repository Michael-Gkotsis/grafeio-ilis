// The IPC handlers of the exports: forms, own Excel books, the Ημερήσια Διαταγή Word and the absence calendar.
//
// Purpose: `registerExportsIpc`, `registerHdIpc` and `registerImerIpc` register the export channels of the contract.
// Does NOT: build or write a file itself (build.ts / service.ts do); open the print window (main.ts's print preview
//   arrives through the `onPrintPreview` hook of service.ts).
// Owner layer: main (architecture), `features/exports`. Imports only app/*, ipc/*, shared/* and its own files.
// Why: part of taking the exports out of main.ts (Phase 4.2b). The handler bodies are unchanged and registered in the
//   original order by main.ts.
// Covering test: test/ipc-contract.test.ts (channels); the registration order and every handler text of the whole
//   boot closure were compared old vs new once (PR description).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dialog, shell } from 'electron';
import { LockedError, writeAll } from '../../files';
import type { ISODate } from '../../../shared/dates';
import type { ExportKind } from '../../../shared/api';
import { cleanHd, hdTags, HD_SECTIONS, type HdDoc } from '../../../shared/hd';
import type { ImerReq } from '../../../shared/imer';
import type { Sig } from '../../../shared/sigs';
import { sigsOf } from '../../exports';
import { builtinTemplate, checkTemplate, fillDocx } from '../../hdDocx';
import { handle } from '../../ipc/handle';
import { outputDir } from '../../app/dirs';
import { TPL_DIR, TPL_MAX } from '../../app/paths';
import { serial } from '../../app/serial';
import { store, win } from '../../app/state';
import { fail } from '../commands';
import { excel, made } from './build';
import { exportGuarded, printPreview } from './service';

/** Registers `exportFile`, `exportLists`, `exportCadre`, `exportRoster` and `exportWeapons`. */
export function registerExportsIpc() {
  handle('exportFile', (_e, kind: ExportKind, date: ISODate, opts) => exportGuarded(kind, date, opts || {}));
  // sigs: signatures for this time only (else Settings')
  handle('exportLists', async (_e, date: ISODate, sigs?: Sig[]) => {
    try {
      const r = await made('lists', date, store.state, sigs);
      const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
      shell.openPath(out);
      return { ok: true, file: out, warnings: r.warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
  handle('exportCadre', async (_e, date: ISODate, sigs?: Sig[]) => {
    try {
      const r = await made('cadre', date, store.state, sigs);
      const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
      shell.openPath(out);
      return { ok: true, file: out, warnings: r.warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
  handle('exportRoster', async (_e, date: ISODate, print?: boolean, sigs?: Sig[]) => {
    try {
      const r = await made('rosterPrint', date, store.state, sigs);
      const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
      const warnings = r.warnings;
      if (print) {
        const p = await printPreview(out);
        if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
      } else shell.openPath(out);
      return { ok: true, file: out, warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
  // Weapons: one Excel, a sheet per filter; print: print preview of the weapons statement
  handle('exportWeapons', async (_e, date: ISODate, print?: boolean, sigs?: Sig[]) => {
    try {
      const r = await made('weapons', date, store.state, sigs);
      const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
      const warnings = r.warnings;
      if (print) {
        const p = await printPreview(out);
        if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
      } else shell.openPath(out);
      return { ok: true, file: out, warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
}
/** Registers `exportHd` and `pickHdTpl` (the Ημερήσια Διαταγή Word). */
export function registerHdIpc() {
  // Ημερήσια Διαταγή: Word from the template (your own or the built-in one), or printing without Word in the app's
  // print preview
  handle('exportHd', async (_e, req: { date: ISODate; doc: HdDoc; print?: boolean; sigs?: Sig[] }) => {
    try {
      const s = store.state;
      const g = sigsOf(s, 'hd', req.sigs);
      const tags = hdTags(s.settings, req.date, cleanHd(req.doc), g.sigs ?? g.def);
      if (req.print) {
        // the same print preview as the Excel files (Michael, 4/11): the page becomes an Excel and opens there
        const r = await excel().hdBook(s, req.date, tags, HD_SECTIONS);
        const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
        const p = await printPreview(out);
        return p.ok ? { ok: true, file: out, warnings: [] } : { ok: false, error: 'Δεν άνοιξε η εκτύπωση: ' + p.error };
      }
      const own = s.settings.hdTpl?.file;
      let buf: Buffer | null = null;
      const warnings: string[] = [];
      if (own) {
        try {
          buf = await fs.promises.readFile(path.join(TPL_DIR, path.basename(own)));
        } catch {
          warnings.push('Το δικό σου πρότυπο Word δεν βρέθηκε: βγήκε με το έτοιμο.');
        }
      }
      const data = await fillDocx(buf || (await builtinTemplate()), tags);
      const [out] = await serial(() =>
        writeAll([
          {
            dir: outputDir(),
            name:
              'ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ' +
              req.date.slice(8, 10) +
              '-' +
              req.date.slice(5, 7) +
              '-' +
              req.date.slice(0, 4) +
              '.docx',
            data,
          },
        ]),
      );
      shell.openPath(out);
      return { ok: true, file: out, warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
  handle('pickHdTpl', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε το Word που θα γίνει πρότυπο της Ημερήσιας Διαταγής',
      filters: [{ name: 'Word', extensions: ['docx'] }],
      properties: ['openFile'],
    });
    const src = res.canceled ? null : res.filePaths[0];
    if (!src) return null;
    try {
      if (fs.statSync(src).size > TPL_MAX) return fail('Το αρχείο είναι πάνω από 5 MB.');
      const buf = await fs.promises.readFile(src);
      const bad = await checkTemplate(buf);
      if (bad) return fail(bad);
      const file = crypto.randomUUID() + '.docx';
      await fs.promises.mkdir(TPL_DIR, { recursive: true });
      await fs.promises.writeFile(path.join(TPL_DIR, file), buf);
      return { ok: true, file, name: path.basename(src) };
    } catch (e) {
      return fail(e);
    }
  });
}
/** Registers `exportImer` (the absence calendar). */
export function registerImerIpc() {
  // Ημερολόγιο κωλυομένων: Excel with a sheet per platoon from the screen (Δυναμολόγιο › Ημερολόγιο);
  // print: print preview
  handle('exportImer', async (_e, req: ImerReq, print?: boolean, sigs?: Sig[]) => {
    try {
      const r = await made('imer', req.to, store.state, sigs, req);
      const [out] = await serial(() => writeAll([{ dir: outputDir(), name: r.name, data: r.data }]));
      const warnings = r.warnings;
      if (print) {
        const p = await printPreview(out);
        if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
      } else shell.openPath(out);
      return { ok: true, file: out, warnings };
    } catch (e) {
      return e instanceof LockedError ? { ok: false, error: e.message, locked: true } : fail(e);
    }
  });
}
