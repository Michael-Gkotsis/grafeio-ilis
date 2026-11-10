// Restore a ΕΣΣΟ series from its archive folder.
//
// Purpose: `restoreEsso` puts the current series into the archive, swaps the database for the archived one, points
//   the Excel bindings back at the files, and relaunches the app.
// Does NOT: show a dialog (ipc.ts) or start a new series (start.ts).
// Owner layer: main (architecture), `features/esso`. Imports app/*, `features/commands`, `features/exports`,
//   `features/autowrite`, the archive engine; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6a); the order of the side effects is the contract (settle the auto-write,
//   archive the running series, validate, backup, close, swap the file, reopen, rebind, hold the auto-write,
//   relaunch). It does not use main's boot functions (`recover`, `lockdown`), so it needs no hook. Over 80 lines: it
//   keeps its ratchet entry under the new path.
// Covering test: test/esso.test.ts (archive engine, restored paths); the whole flow by the Electron comparison in the
//   PR.
import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { copyDurable } from '../../files';
import { today, nowHM } from '../../../shared/dates';
import { restoredPath } from '../../../shared/esso';
import { SOURCES_FILE, readArchive } from '../../esso';
import { DATA, archiveRoot, writableDir } from '../../app/paths';
import { srcMeta } from '../../app/bindings';
import { serial } from '../../app/serial';
import { msgOf } from '../../app/errors';
import { store } from '../../app/state';
import { fail } from '../commands';
import { writeOuts } from '../exports';
import { HOLD_RESTORE, holdAll } from '../autowrite';
import { archiveNow, settleAuto } from './archive';
import { essoBusy, knownArchives, okEssoDir, sameDir, setEssoBusy } from './guard';

/**
 * Restores the ΕΣΣΟ series archived in `dir`. First the running series is archived too (so the user can go back to
 * it), then the archived database replaces the live one (as in a backup restore) and the Excel bindings point to
 * where the files were, if they still exist, else to the archive's copies. The app does not write to the Excel files
 * until it has read them again (`HOLD_RESTORE`). The app restarts.
 * @param dir an archive folder the user picked in a dialog, or one `meta.json` remembers
 * @returns `{ ok: true }` just before the relaunch, or `{ ok: false, error }` with the database left as it was
 */
export async function restoreEsso(dir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!okEssoDir(dir) && !knownArchives().some((d) => sameDir(d, dir)))
    return fail('Άγνωστος φάκελος. Διάλεξέ τον με το «Διάλεξε φάκελο…».');
  const a = readArchive(dir);
  if (!a.ok) return a;
  const bad = store.validate(a.db);
  if (bad) return fail('Η βάση του αρχείου δεν είναι καλή: ' + bad);
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  setEssoBusy(true);
  try {
    await settleAuto();
    const s0 = store.state;
    let kept = '';
    if (s0.people.length || Object.keys(s0.settings.sources || {}).length) {
      const root = writableDir(path.dirname(dir)) ? path.dirname(dir) : archiveRoot();
      try {
        kept = (await serial(async () => archiveNow(root))).dir;
      } catch (err) {
        return fail('Δεν γράφτηκε αρχείο της τωρινής ΕΣΣΟ, οπότε δεν έγινε η επαναφορά: ' + msgOf(err));
      }
    }
    const db = path.join(DATA, 'ilh.db'),
      tmp = db + '.restore.tmp';
    try {
      copyDurable(a.db, tmp);
      const b2 = store.validate(tmp);
      if (b2) throw new Error(b2);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err));
    }
    try {
      store.backup('πριν-επαναφορά-ΕΣΣΟ');
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      return fail(
        'Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης (' +
          msgOf(err) +
          '). Η βάση έμεινε όπως ήταν.',
      );
    }
    try {
      store.close();
    } catch {
      /* carry on */
    }
    try {
      for (let i = 0; ; i++) {
        try {
          fs.renameSync(tmp, db);
          break;
        } catch (err) {
          if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
      }
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      try {
        await store.open();
      } catch (e2) {
        dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2));
        app.exit(1);
      }
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + msgOf(err));
    }
    await store.open();
    const at = (rel: string) => path.join(dir, ...rel.split('/'));
    const re = (f: string) => restoredPath(f, a.manifest, at, fs.existsSync);
    const st = store.state.settings;
    const sources = Object.fromEntries(
      Object.entries(st.sources || {}).map(([k, b]) => [k, b && { ...b, file: re(b.file) }]),
    );
    const forms = Object.fromEntries(
      Object.entries(st.forms || {}).map(([k, b]) => [k, b?.file ? { ...b, file: re(b.file) } : b]),
    );
    store.commit({ ...store.state, settings: { ...st, sources, forms } });
    let sj: Parameters<typeof srcMeta.reset>[0] = {};
    try {
      sj = JSON.parse(fs.readFileSync(path.join(dir, SOURCES_FILE), 'utf8')) || {};
    } catch {
      /* none: everything is read again */
    }
    srcMeta.reset(sj);
    srcMeta.allow([
      ...Object.values(sources).map((b) => b?.file || ''),
      ...Object.values(forms).flatMap((b) => [b?.file || '', b?.dir || '']),
    ]);
    holdAll(HOLD_RESTORE);
    writeOuts([]);
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          'Επαναφορά ΕΣΣΟ: ' +
          a.manifest.name +
          ' από ' +
          dir +
          (kept ? '. Η ΕΣΣΟ που έτρεχε κρατήθηκε στο ' + kept : ''),
        files: [],
        source: 'app',
        undoable: false,
      },
      null,
    );
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } finally {
    setEssoBusy(false);
  }
}
