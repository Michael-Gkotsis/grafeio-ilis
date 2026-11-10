// The personnel import: preview of a roster file, the file dialog, and the work after the import.
//
// Purpose: `rosterPreview` (parses a file into a preview with a token kept in `pending`), `pickRoster` (the dialog),
//   and `afterRoster` (makes the file the personnel source and reads the linked posts / out-of-strength sheets).
// Does NOT: apply the import (the `applyRoster` handler runs the command), write a file or read the statuses.
// Owner layer: main (architecture), `features/sources`. Imports app/*, `features/commands`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.3b). The new-ΕΣΣΟ start in main.ts calls the same three.
// Covering test: test/roster*.test.ts; the Electron comparison in the PR description.
import crypto from 'crypto';
import path from 'path';
import { dialog } from 'electron';
import type { ImportPreview } from '../../../shared/api';
import { apply, rosterChanges } from '../../../shared/commands';
import { parseRoster, type RawSheet } from '../../../shared/roster';
import { withRoomExtras } from '../../../shared/roomExtra';
import {
  bestFor,
  refitCols,
  snapFromSheet,
  tableHash,
  type ListKind,
  type SourceBinding,
} from '../../../shared/sources';
import { bindingOf, srcMeta, stampNow } from '../../app/bindings';
import { pending, store, win } from '../../app/state';
import { readBook } from '../../sources';
import { ctx, fail, runCmd } from '../commands';
import { markSynced } from './binding';
import { notReports, ovOf, sheetOf } from './book';
import { notify } from './status';

/**
 * Personnel import: from the button (auto-detection) or from the Αρχεία Excel (with the user's mapping). Keeps the
 * parsed rows in `pending` under a token (one preview at a time).
 * @param b the user's mapping, or null to auto-detect
 */
export async function rosterPreview(
  file: string,
  b: SourceBinding | null,
): Promise<ImportPreview | { ok: false; error: string }> {
  try {
    const book0 = await readBook(file);
    const book = { ...book0, sheets: notReports(file, book0.sheets) };
    if (b) b = refitCols('people', sheetOf(book.sheets, b.sheet), b);
    const src = store.state.settings.sources || {};
    const r = parseRoster(
      book.sheets,
      { main: ovOf(b || undefined), posts: ovOf(src.posts, file), outside: ovOf(src.outside, file) },
      store.state.settings.lists,
    );
    // e-mail, relative's e-mail, blood group from the sheet ΘΑΛΑΜΟΙ
    r.rows = withRoomExtras(r.rows, book.sheets, r.main, store.state.people, srcMeta.get('people')?.psnap);
    if (!r.rows.length) return { ok: false, error: r.warnings[0] || 'Δεν βρέθηκαν άτομα στο αρχείο' };
    // which table was read: so that the corrections are written there (Michael, 11/10)
    const det =
      b ||
      (() => {
        const x = bestFor(
          'people',
          book.sheets.filter((sh) => sh.name === r.main),
        );
        return x ? ({ file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding) : null;
      })();
    const sim = apply(
      store.state,
      { t: 'importPeople', rows: r.rows, source: path.basename(file), deactivateMissing: true },
      ctx(),
    ).state;
    const before = new Set(store.state.people.map((p) => p.id));
    const added = sim.people.filter((p) => !before.has(p.id)).length;
    const missing = sim.people.filter(
      (p) =>
        before.has(p.id) &&
        !p.active &&
        store.state.people.find((q) => q.id === p.id)!.active &&
        !r.rows.some((x) => x.asm && x.asm === p.asm),
    ).length;
    const token = crypto.randomUUID();
    pending.clear(); // one preview at a time: the cancelled ones do not keep the sheet in memory
    pending.set(token, {
      rows: r.rows,
      file,
      binding: det,
      stamp: { mtime: book.mtime, size: book.size },
      sheet: det ? sheetOf(book.sheets, det.sheet) || null : null,
    });
    return {
      ok: true,
      token,
      file: path.basename(file),
      total: r.rows.length,
      active: r.rows.filter((x) => x.active !== false).length,
      added,
      updated: r.rows.length - added,
      missing,
      warnings: r.warnings,
      essos: r.essos,
      skipped: r.skipped,
      declared: r.declared,
      found: r.found,
      suspicious: r.suspicious,
      ...rosterChanges(store.state, r.rows),
    };
  } catch (e) {
    return fail(e);
  }
}
/** The «Δυναμολόγιο» file dialog and the preview of the chosen file; null when cancelled. */
export async function pickRoster(): Promise<ImportPreview | { ok: false; error: string } | null> {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Δυναμολόγιο',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  srcMeta.allow([res.filePaths[0]]);
  const cur = bindingOf('people');
  return rosterPreview(res.filePaths[0], cur && path.resolve(cur.file) === path.resolve(res.filePaths[0]) ? cur : null);
}
/**
 * After the import: the file becomes the personnel source (if there is no other) and what each one writes is
 * remembered.
 */
export function afterRoster(p: {
  file: string;
  binding: SourceBinding | null;
  stamp: { mtime: number; size: number };
  sheet: RawSheet | null;
}) {
  if (!p.binding || !p.sheet) return;
  const cur = bindingOf('people');
  if (cur && path.resolve(cur.file) !== path.resolve(p.file)) return;
  if (
    !cur ||
    cur.sheet !== p.binding.sheet ||
    cur.header !== p.binding.header ||
    JSON.stringify(cur.cols) !== JSON.stringify(p.binding.cols)
  )
    runCmd({
      t: 'setSettings',
      settings: {
        sources: { ...(store.state.settings.sources || {}), people: { ...p.binding, write: cur ? cur.write : true } },
      },
      text: 'πηγή προσωπικού ' + path.basename(p.file) + ' › ' + p.binding.sheet,
    });
  srcMeta.set('people', {
    snap: snapFromSheet(p.sheet, p.binding, store.state.people),
    keys: [],
    mtime: p.stamp.mtime,
    size: p.stamp.size,
    hash: tableHash(p.sheet, p.binding),
    at: stampNow(),
    pending: false,
    error: undefined,
    locked: false,
    hold: undefined,
  });
  // posts and out-of-strength of the same file were read together
  const linked = (['posts', 'outside'] as ListKind[]).filter((k) => {
    const x = bindingOf(k);
    return x && path.resolve(x.file) === path.resolve(p.file);
  });
  Promise.all(linked.map((k) => markSynced(k, bindingOf(k)!))).then(notify, (e) => console.error('roster linked', e));
  notify();
}
