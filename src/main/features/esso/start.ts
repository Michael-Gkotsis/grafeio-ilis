// Start a new ΕΣΣΟ series.
//
// Purpose: `startEsso` archives the current series, starts the database for the new one, and creates the new series'
//   Excel files (Δυναμολόγιο and υπηρεσίες).
// Does NOT: show a dialog (ipc.ts), write the archive itself (archive.ts), or restore.
// Owner layer: main (architecture), `features/esso`. Imports app/*, `features/commands`, `features/exports`,
//   `features/sources`, the pure ΕΣΣΟ rules; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6a); the order of the side effects is the contract (settle the auto-write,
//   archive, backup, state swap, reset of the sync memory, audit line, new Excel files, status push). The function is
//   over 80 lines and keeps its ratchet entry under the new path (no rewrite in a move).
// Covering test: test/esso.test.ts (names, fresh state, archive); the whole flow by the Electron comparison in the PR.
import path from 'path';
import { today, nowHM } from '../../../shared/dates';
import type { EssoResult, EssoStart } from '../../../shared/api';
import { ESSO_SERIES, currentEsso, essoName, freshState } from '../../../shared/esso';
import { KIND, NEW_KINDS, inRoster, type ListKind } from '../../../shared/sources';
import { writableDir } from '../../app/paths';
import { writeMeta } from '../../app/meta';
import { bindingOf, srcMeta } from '../../app/bindings';
import { serial } from '../../app/serial';
import { msgOf } from '../../app/errors';
import type { NewOut } from '../../app/types';
import { autoTimer, dirty, pending, store, setFormsDirty, setSeenUntil, setSessionStart } from '../../app/state';
import { fail, runCmd } from '../commands';
import { writeOuts } from '../exports';
import { stamp } from '../../sources';
import { afterRoster, createNew, notify } from '../sources';
import { archiveNow, copyInto, newRoot, settleAuto } from './archive';
import { essoBusy, okEssoDir, setEssoBusy } from './guard';

/**
 * Starts a new ΕΣΣΟ series. 1. Archive the current one (if that cannot be written, nothing changes). 2. Start the
 * database for the new one (`freshState`) without the old one's history. 3. Create the new series' Excel files in its
 * folder: the Δυναμολόγιο with its sheets (new, or the one the user handed over) and the υπηρεσίες check, all bound.
 * What could not be made in step 3 is reported in `warnings` and can be made from «Αρχεία Excel».
 * @param o the choices of the wizard; the folders must be ones the user picked (`okEssoDir`)
 * @returns `{ ok: true, archive, dir, files, warnings }`, or `{ ok: false, error }`; `error` also when another ΕΣΣΟ
 *   change is already running
 */
export async function startEsso(o: EssoStart): Promise<EssoResult> {
  const e = o?.esso;
  if (!e || !ESSO_SERIES.includes(e.s) || !Number.isInteger(e.y) || e.y < 2000 || e.y > 2100)
    return fail('Διάλεξε σειρά (Α΄, Β΄, Γ΄ ή Δ΄) και έτος');
  if (!okEssoDir(o.archiveRoot)) return fail('Άγνωστος φάκελος για το αρχείο. Διάλεξέ τον ξανά.');
  if (o.newDir && !okEssoDir(o.newDir)) return fail('Άγνωστος φάκελος για τα νέα Excel. Διάλεξέ τον ξανά.');
  const dir = o.newDir || path.join(newRoot(), essoName(e));
  const ros = o.roster ? pending.get(o.roster) : undefined;
  if (o.roster && !ros) return fail('Η επιλογή του Δυναμολογίου έληξε. Διάλεξέ το ξανά.');
  if (essoBusy) return fail('Γίνεται ήδη αλλαγή ΕΣΣΟ');
  for (const d of [o.archiveRoot, dir])
    if (!writableDir(d)) return fail('Δεν γράφεται ο φάκελος ' + d + '. Διάλεξε άλλον (π.χ. στα Έγγραφα ή σε USB).');
  setEssoBusy(true);
  try {
    await settleAuto();
    const prev = store.state;
    const old = currentEsso(prev);
    let arch: ReturnType<typeof archiveNow>;
    try {
      arch = await serial(async () => archiveNow(o.archiveRoot));
    } catch (err) {
      return fail('Δεν γράφτηκε το αρχείο της προηγούμενης ΕΣΣΟ, οπότε δεν άλλαξε τίποτα: ' + msgOf(err));
    }
    try {
      store.backup('πριν-νέα-ΕΣΣΟ');
    } catch (err) {
      console.error('backup', err);
    } // the database is already in the archive
    // unit kind and header from the first step: they already apply to the new Excel files made below
    const u =
      o.unit &&
      (o.unit.unitKind === 'ili' || o.unit.unitKind === 'lochos') &&
      Array.isArray(o.unit.unit) &&
      o.unit.unit.length === 3 &&
      o.unit.unit.every((x) => typeof x === 'string') &&
      typeof o.unit.unitName === 'string'
        ? {
            unitKind: o.unit.unitKind,
            unit: o.unit.unit.map((x) => x.trim()) as [string, string, string],
            unitName: o.unit.unitName.trim(),
          }
        : undefined;
    try {
      store.transact(() => {
        store.commit(freshState(prev, e, today(), dir, u));
      });
    } catch (err) {
      return fail(
        'Δεν ξεκίνησε η νέα ΕΣΣΟ, η βάση έμεινε όπως ήταν (το αρχείο κρατήθηκε στο ' + arch.dir + '): ' + msgOf(err),
      );
    }
    // what the app knew about the old Excel files and the forms it made no longer applies
    clearTimeout(autoTimer);
    dirty.clear();
    setFormsDirty(false);
    srcMeta.reset();
    writeOuts([]);
    store.clearAudit();
    setSeenUntil(0);
    setSessionStart(0);
    writeMeta({ seenAudit: 0 });
    srcMeta.allow([dir]);
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          'Νέα ΕΣΣΟ: ' +
          essoName(e) +
          '. Η προηγούμενη (' +
          (old ? essoName(old) : 'χωρίς όνομα') +
          ', ' +
          arch.manifest.people +
          ' σε δύναμη) κρατήθηκε στο ' +
          arch.dir +
          ' και ξαναφορτώνεται από Ρυθμίσεις › ΕΣΣΟ › Επαναφορά',
        files: [],
        source: 'app',
        undoable: false,
      },
      null,
    );
    const warnings = arch.missing.map((f) => 'Δεν βρέθηκε (δεν μπήκε στο αρχείο): ' + f);
    const files: string[] = [];
    const made = (k: ListKind, r: NewOut) => {
      if (r.ok) files.push(r.file);
      else warnings.push(KIND[k].label + ': ' + r.error);
    };
    if (ros) {
      // the user's Δυναμολόγιο of the new series: copy it into its folder, import it, use its sheets for the rest
      pending.delete(o.roster!);
      try {
        const copy = copyInto(dir, ros.file);
        srcMeta.allow([copy]);
        const r = runCmd({ t: 'importPeople', rows: ros.rows, source: path.basename(copy), deactivateMissing: true });
        if (!r.ok) warnings.push('Δεν μπήκαν οι στρατιώτες από το ' + path.basename(copy) + ': ' + r.error);
        else {
          afterRoster({
            ...ros,
            file: copy,
            binding: ros.binding ? { ...ros.binding, file: copy } : null,
            stamp: stamp(copy) || ros.stamp,
          });
          files.push(copy);
        }
      } catch (err) {
        warnings.push('Δεν αντιγράφηκε το Δυναμολόγιο στο ' + dir + ': ' + msgOf(err));
      }
      if (bindingOf('people'))
        for (const k of NEW_KINDS.filter((x) => inRoster(x) && !bindingOf(x))) made(k, await createNew(k));
      else made('people', await createNew('people'));
    } else made('people', await createNew('people'));
    made('duties', await createNew('duties'));
    notify();
    return { ok: true, archive: arch.dir, dir, files: [...new Set(files)], warnings };
  } finally {
    setEssoBusy(false);
  }
}
