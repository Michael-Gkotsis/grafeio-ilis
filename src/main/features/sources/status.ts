// The status of the bound Excel files, its push to the UI, and the import of the status kinds.
//
// Purpose: `sourceStatus` / `statusAll` (what the Αρχεία Excel screen and the top bar show), `notify` (pushes it as
//   the `sources` event), and `importStatuses` (reads a status kind from its Excel, also from the automatic check).
// Does NOT: write a file, plan a write, or import the roster or a sheet of another kind (roster.ts, import.ts).
// Owner layer: main (architecture), `features/sources`. Imports app/*, `features/exports`, `features/autowrite`.
// Why: moved verbatim from main.ts (Phase 4.3b). They are one file because they call each other in a ring:
//   `sourceStatus` reads a changed file by itself with `importStatuses`, which ends with `notify`, which calls
//   `statusAll`. Split into several files that ring would be an import cycle. `features/autowrite` cannot import
//   `notify` back (it is imported here), so main.ts still hands it over with `onAutoWriteDeps`.
// Covering test: test/sources*.test.ts, test/status*.test.ts; the Electron comparison in the PR description.
import path from 'path';
import { eventChannel } from '../../ipc/handle';
import { today } from '../../../shared/dates';
import type { CmdResult, SourceStatus } from '../../../shared/api';
import {
  KIND,
  baseOf,
  bindingMonth,
  diffStatuses,
  isStatusKind,
  parseStatuses,
  snapPeople,
  type ListKind,
  type SourceBinding,
  type StatusKind,
} from '../../../shared/sources';
import { bindingOf, moveBinding, srcMeta, stampNow } from '../../app/bindings';
import { autoTimer, dirty, setAutoTimer, store, win } from '../../app/state';
import { bookNow, locateCheck, readBook, syncStamp, tableState } from '../../sources';
import { runAuto } from '../autowrite';
import { fail, reply, runCmd } from '../commands';
import { lastDay, readOuts } from '../exports';
import { baseFor, keysOf, saveBinding } from './binding';
import { sheetOf } from './book';

const autoReading = new Set<ListKind>();
async function sourceStatus(): Promise<SourceStatus[]> {
  const metas = srcMeta.all();
  const out: SourceStatus[] = [];
  for (const [kind, b0] of Object.entries(store.state.settings.sources || {}) as [ListKind, SourceBinding][]) {
    if (!b0) continue;
    // first where the table and its columns are now (a new column in the Excel): otherwise the automatic read would
    // take values from wrong columns. If they cannot be found with certainty, the kind waits for a mapping.
    const loc = await locateCheck(kind, b0);
    if (loc.b !== b0) moveBinding(kind, loc.b);
    const b = bindingOf(kind) || loc.b;
    let m = metas[kind];
    let t = await tableState(b, m, kind);
    if (t.header != null) moveBinding(kind, { ...b, header: t.header });
    if (t.refresh) srcMeta.set(kind, t.refresh);
    // simple changes in the Excel pass by themselves (with an undo that does not touch the Excel)
    if (
      t.changed &&
      t.exists &&
      !loc.need &&
      isStatusKind(kind) &&
      b.autoRead !== false &&
      m?.at &&
      !m.hold &&
      !autoReading.has(kind)
    ) {
      autoReading.add(kind);
      try {
        const cur = bindingOf(kind) || b;
        if ((await importStatuses(kind, cur, {}, false, [], true)).ok) {
          m = srcMeta.get(kind);
          t = await tableState(cur, m, kind);
        }
      } finally {
        autoReading.delete(kind);
      }
    }
    // duty check: the sheet's month, for the reminder when the month changes
    let month: string | undefined;
    if (kind === 'duties' && t.exists) {
      try {
        const sh = (await bookNow(b.file))?.sheets.find((x) => x.name === b.sheet);
        month = (sh && bindingMonth(sh, bindingOf(kind) || b, today())) || undefined;
      } catch {
        /* try again later */
      }
    }
    out.push({
      kind,
      file: b.file,
      exists: t.exists,
      synced: !!m?.at,
      changed: t.changed,
      at: m?.at || '',
      error: m?.error,
      locked: m?.locked,
      pending: m?.pending,
      hold: m?.hold,
      month,
      ...(loc.need ? { remap: loc.need } : {}),
    });
  }
  return out;
}
/** The status the UI shows: the bound Excel files, and the forms made for today or later. */
export const statusAll = async () => ({
  sources: await sourceStatus(),
  forms: readOuts()
    .filter((o) => lastDay(o) >= today())
    .map(({ form, date, file, at, error, pending, manual }) => ({ form, date, file, at, error, pending, manual })),
});
/** Pushes the status to the window as the `sources` event; never throws (a closed window is skipped). */
export const notify = () => {
  statusAll().then(
    (st) => {
      try {
        win?.webContents.send(eventChannel('onSources'), st);
      } catch {
        /* window closed */
      }
    },
    (e) => console.error('sources status', e),
  );
};
/**
 * Reading a kind from its Excel (statuses): new records and changes enter the app.
 * @param choices the user's pick per ambiguous row (row index to candidate index, or null)
 * @param keepRemoved keep the records the Excel no longer has
 * @param keepApp ids of records changed on both sides where the user kept the app's values
 * @param auto from the change check, without a preview. Passes only if simple: new records or changes, all people
 *   known, nothing deleted, duplicated, of unknown kind or with a wrong date, and nothing that changed in the app too;
 *   otherwise it answers `fail('όχι απλό')`.
 */
export async function importStatuses(
  kind: StatusKind,
  b: SourceBinding,
  choices: Record<number, number | null>,
  keepRemoved = false,
  keepApp: string[] = [],
  auto = false,
): Promise<CmdResult> {
  try {
    const book = await readBook(b.file);
    const sheet = sheetOf(book.sheets, b.sheet);
    if (!sheet) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const parsed = parseStatuses(kind, sheet, b, store.state.people, today(), store.state.settings.lists);
    const d = diffStatuses(kind, store.state, parsed, b, choices, keysOf(kind, b), baseFor(kind, b), today());
    if (
      auto &&
      (parsed.unknown.length ||
        parsed.skipped.length ||
        d.unmatched.length ||
        d.dup.length ||
        d.removed.length ||
        d.update.some((u) => u.conflict) ||
        d.add.some((a) => a.open) ||
        d.update.some((u) => u.patch.open) ||
        !(d.add.length + d.update.length))
    )
      return fail('όχι απλό');
    saveBinding(kind, b);
    // changed on both sides and the user kept the app's: they do not pass, and are written to the Excel afterwards
    const kept = new Set(keepApp);
    const r = runCmd({
      t: 'importRecords',
      adds: d.add,
      updates: d.update.filter((u) => !kept.has(u.id)).map((u) => ({ id: u.id, patch: u.patch })),
      deletes: keepRemoved ? [] : d.removed.map((x) => x.id),
      source: path.basename(b.file),
      what: KIND[kind].label.toLowerCase() + (auto ? ' (αυτόματα, χωρίς προεπισκόπηση)' : ''),
    });
    if (!r.ok) return r;
    srcMeta.set(kind, {
      keys: d.keys,
      base: baseOf(kind, store.state, d.keys),
      ...syncStamp(b, book),
      psnap: snapPeople(store.state.people),
      at: stampNow(),
      pending: false,
      error: undefined,
      locked: false,
      hold: undefined,
    });
    // what the app has and the Excel lacks (or the user kept from the app) is written right after (if the kind writes
    // by itself)
    if (b.write !== false && (d.appOnly.length || d.kept.length || kept.size)) {
      dirty.add(kind);
      clearTimeout(autoTimer);
      setAutoTimer(setTimeout(runAuto, 1200));
    }
    notify();
    // automatic (from the change check): the answer does not reach the UI, so the changes are not marked as sent.
    // sync(), which the UI runs as soon as it gets the files' status, brings them.
    if (auto) return { ok: true, changes: {}, newAudit: [], text: r.text || '' };
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) {
    return fail(e);
  }
}
