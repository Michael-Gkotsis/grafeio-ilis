// The IPC handlers of the Excel sources: roster import, the Αρχεία Excel screen, plan, write and status.
//
// Purpose: `registerRosterIpc`, `registerSourcesIpc` and `registerSourcesWriteIpc` register `pickRoster`,
//   `applyRoster`, `srcPick`, `srcRead`, `srcSave`, `srcImport`, `srcApply`, `srcKeys`, `srcPeople`, `srcPlan`,
//   `srcWrite`, `srcNewFile` and `srcStatus` on their contract channels.
// Does NOT: know how a file is read or planned (the sibling files do), and does not register the form-template
//   handlers (`formPick`, `formInfo`, ...): those stay in main.ts with the form and print file handlers.
// Owner layer: main (architecture), `features/sources`. Imports app/*, `ipc/handle`, `features/*`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.3b), same channels in the same order (main.ts calls the three in the
//   same places of the boot closure). The file picker stays in main.ts and is passed in, as before.
// Covering test: test/ipc-contract.test.ts (channels); the Electron comparison in the PR description.
import path from 'path';
import type { CmdResult } from '../../../shared/api';
import type { Command } from '../../../shared/commands';
import {
  KIND,
  planPeopleWrite,
  snapFromSheet,
  type ListKind,
  type SourceBinding,
  type StatusKind,
} from '../../../shared/sources';
import { current, srcMeta, stampNow } from '../../app/bindings';
import { pending, store } from '../../app/state';
import { handle } from '../../ipc/handle';
import { OldFormatError, readBook, syncStamp } from '../../sources';
import { retryPending, syncOut } from '../autowrite';
import { fail, reply, runCmd } from '../commands';
import { saveBinding } from './binding';
import { bookOf, sheetOf } from './book';
import { applySheet } from './import';
import { createNew, planOut } from './plan';
import { afterRoster, pickRoster, rosterPreview } from './roster';
import { importStatuses, notify, statusAll } from './status';

/** Registers `pickRoster` and `applyRoster`. @param answer turns a `runCmd` result into the UI answer */
export function registerRosterIpc(answer: (r: ReturnType<typeof runCmd>) => CmdResult) {
  handle('pickRoster', () => pickRoster());
  handle('applyRoster', (_e, token: string, deactivateMissing: boolean) => {
    const p = pending.get(token);
    if (!p) return fail('Η εισαγωγή έληξε, διάλεξε ξανά το αρχείο');
    pending.delete(token);
    try {
      store.backup('πριν-εισαγωγή');
    } catch (e) {
      return fail('Δεν πάρθηκε αντίγραφο ασφαλείας πριν την εισαγωγή: ' + String(e));
    }
    const r = runCmd({ t: 'importPeople', rows: p.rows, source: path.basename(p.file), deactivateMissing });
    if (r.ok) afterRoster(p);
    return answer(r);
  });
}
/** Registers the Αρχεία Excel handlers. @param pickXlsx the Excel file dialog of main.ts */
export function registerSourcesIpc(pickXlsx: (title: string) => Promise<string | null>) {
  handle('srcPick', async (_e, kind: ListKind | null) => {
    const file = await pickXlsx(kind ? 'Excel για ' + KIND[kind].label : 'Εισαγωγή Excel');
    if (!file) return null;
    try {
      return await bookOf(file);
    } catch (e) {
      return fail(e instanceof OldFormatError ? e.message : e);
    }
  });
  handle('srcRead', async (_e, kind: ListKind) => {
    try {
      const b = await current(kind);
      if (!b) return fail('Δεν έχει οριστεί αρχείο');
      return { ...(await bookOf(b.file)), binding: b };
    } catch (e) {
      return fail(e);
    }
  });
  handle('srcSave', async (_e, kind: ListKind, b: SourceBinding | null) => {
    if (b && (typeof b.file !== 'string' || !srcMeta.allowed(b.file)))
      return fail('Άγνωστο αρχείο: διάλεξέ το με το «Διάλεξε Excel…»');
    try {
      saveBinding(kind, b);
      // personnel: the starting point for the corrections is what the Excel says now
      // if the app already has the same as the Excel it writes by itself from here on; otherwise «Ενημέρωση Excel»
      // with a preview first
      if (b && kind === 'people' && !srcMeta.get('people')) {
        const book = await readBook(b.file);
        const sh = sheetOf(book.sheets, b.sheet);
        if (sh) {
          const snap = snapFromSheet(sh, b, store.state.people);
          srcMeta.set('people', {
            snap,
            keys: [],
            ...syncStamp(b, book),
            at: planPeopleWrite(sh, b, store.state, snap).sets.length ? '' : stampNow(),
          });
        }
      }
      notify();
      return reply('');
    } catch (e) {
      return fail(e);
    }
  });
  const known = (b: SourceBinding | null | undefined) => !!b && typeof b.file === 'string' && srcMeta.allowed(b.file);
  handle(
    'srcImport',
    (
      _e,
      kind: StatusKind,
      b: SourceBinding,
      choices: Record<number, number | null>,
      keepRemoved: boolean,
      keepApp: string[],
    ) =>
      !known(b)
        ? fail('Άγνωστο αρχείο')
        : importStatuses(kind, b, choices || {}, !!keepRemoved, Array.isArray(keepApp) ? keepApp : []),
  );
  handle('srcApply', (_e, kind: ListKind, b: SourceBinding, cmd: Command, keys?: string[]) =>
    !known(b) ? fail('Άγνωστο αρχείο') : applySheet(kind, b, cmd, Array.isArray(keys) ? keys : []),
  );
  handle('srcKeys', (_e, kind: ListKind) => ({
    keys: srcMeta.get(kind)?.keys || [],
    base: srcMeta.get(kind)?.base || {},
  }));
  handle('srcPeople', async (_e, b: SourceBinding) => {
    if (!b || typeof b.file !== 'string' || !srcMeta.allowed(b.file)) return fail('Άγνωστο αρχείο');
    const nb = (await current('people', b))!;
    return rosterPreview(nb.file, nb);
  });
}
/** Registers `srcPlan`, `srcWrite`, `srcNewFile` and `srcStatus`. */
export function registerSourcesWriteIpc() {
  handle('srcPlan', (_e, kind: ListKind) => planOut(kind));
  handle('srcWrite', async (_e, kind: ListKind) => {
    const r = await syncOut(kind, false);
    notify();
    return r.ok ? { ok: true, text: r.text, file: r.file } : r;
  });
  handle('srcNewFile', (_e, kind: ListKind) => createNew(kind));
  handle('srcStatus', async () => {
    retryPending();
    return statusAll();
  });
}
