// Recovery of a damaged or empty database at startup.
//
// Purpose: `recover(reason, empty)` asks the user (native dialogs) whether to restore the newest valid backup, or, for
//   an empty file with no backup at all, to start with an empty database; it moves the bad file aside, opens the
//   store again and writes the audit row that says what happened.
// Does NOT: decide when the store is corrupt (`Store.open()` throws `CorruptDbError`; app/boot.ts catches it), show
//   the final startup error box, nor quit; it only answers whether the store is open again.
// Owner layer: main (architecture), `app/`.
// Why: moved verbatim out of main.ts (Phase 4 boot). The dialog texts, the `χαλασμένη_<ms>.db` file name and the audit
//   texts are user-facing and part of the data folder contract (CLAUDE.md rule 3): they must not change.
// Covering test: none of its own (native dialogs); the six damaged-db cases (corrupt/empty, with and without a
//   backup) are driven under Electron in the PR report.
import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { copyDurable } from '../files';
import { HOLD_RESTORE, holdAll } from '../features/autowrite';
import { listBackups } from '../shared/db';
import { nowHM, today } from '../../shared/dates';
import { BACKUPS, DATA } from './paths';
import { store } from './state';

/**
 * Offers to recover a database that failed to open.
 *
 * - With a valid backup (the newest that passes `store.validate`): asks «Επαναφορά» / «Έξοδος», moves the bad file to
 *   `backups/χαλασμένη_<ms>.db`, copies the backup in, reopens the store, holds the auto-write (`HOLD_RESTORE`) and
 *   adds a non-undoable audit row.
 * - Without any valid backup and `empty` true: asks «Ξεκίνα με κενή βάση» / «Έξοδος», moves the empty file aside,
 *   opens a new database and adds the audit row.
 * - Without any valid backup and `empty` false: nothing can be offered, answers `false` with no dialog.
 *
 * @param reason The error message of the failed open, shown in the dialog detail and in the audit text.
 * @param empty True when the file exists but has zero bytes (for example a power cut during the first write).
 * @returns true when the store was reopened; false when the user chose «Έξοδος» or nothing could be offered.
 *   Rejects when the copy or the reopen fails; the caller's startup handler reports that.
 */
export async function recover(reason: string, empty = false): Promise<boolean> {
  const good = listBackups(BACKUPS).find((b) => !store.validate(path.join(BACKUPS, b.name)));
  const db = path.join(DATA, 'ilh.db');
  const aside = () => {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.renameSync(db, path.join(BACKUPS, 'χαλασμένη_' + Date.now() + '.db'));
  };
  if (!good) {
    // An empty file with no backup at all: otherwise the app would never open again. It starts empty, and the
    // restore from USB is done from there.
    if (!empty) return false;
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'Γραφείο Λοχία',
      noLink: true,
      buttons: ['Ξεκίνα με κενή βάση', 'Έξοδος'],
      defaultId: 1,
      cancelId: 1,
      message: 'Η βάση δεδομένων είναι άδεια και δεν βρέθηκε αντίγραφο ασφαλείας.',
      detail:
        'Λεπτομέρεια: ' +
        reason +
        '\n\nΑν έχεις αντίγραφο σε USB, ξεκίνα με κενή βάση και κάνε επαναφορά από εκεί (Ρυθμίσεις → Αντίγραφα ασφαλείας → «Φέρε αντίγραφο από USB…»).\nΤο άδειο αρχείο θα κρατηθεί στον φάκελο backups.',
    });
    if (r.response !== 0) return false;
    aside();
    await store.open();
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text: 'Η βάση ήταν άδεια χωρίς αντίγραφο: ξεκίνησε κενή (' + reason + ')',
        files: [],
        source: 'auto',
        undoable: false,
      },
      null,
    );
    return true;
  }
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Γραφείο Λοχία',
    noLink: true,
    buttons: ['Επαναφορά', 'Έξοδος'],
    defaultId: 0,
    cancelId: 1,
    message: empty
      ? 'Η βάση δεδομένων είναι άδεια (π.χ. κόπηκε το ρεύμα την ώρα που γραφόταν).'
      : 'Η βάση δεδομένων φαίνεται χαλασμένη.',
    detail:
      'Λεπτομέρεια: ' +
      reason +
      '\n\nΕπαναφορά από το αντίγραφο ' +
      good.name +
      ';\nΗ χαλασμένη βάση θα κρατηθεί στον φάκελο backups.',
  });
  if (r.response !== 0) return false;
  aside();
  copyDurable(path.join(BACKUPS, good.name), db);
  await store.open();
  holdAll(HOLD_RESTORE);
  store.addAudit(
    {
      at: nowHM(),
      day: today(),
      text:
        'Επαναφορά βάσης από αντίγραφο ' + good.name + ' (η προηγούμενη ήταν ' + (empty ? 'άδεια' : 'χαλασμένη') + ')',
      files: [],
      source: 'auto',
      undoable: false,
    },
    null,
  );
  return true;
}
