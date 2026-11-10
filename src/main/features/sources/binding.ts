// What main remembers about a bound file after it was read, and saving a binding.
//
// Purpose: `saveBinding` (set or clear the Excel of a kind, with the undo entry), `markSynced` (the memory after a
//   read), `cadreExtra` (the cadre sheets' snapshot), `keysOf` and `baseFor` (what the last read saw).
// Does NOT: read the status, import records, push the `sources` event or schedule a write.
// Owner layer: main (architecture), `features/sources`. Imports app/*, `features/commands`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.3b). The import, the roster, the plan and the status all need these and
//   must not need each other, so they sit below them. `sources.json` is a frozen data file (CLAUDE.md rule 3).
// Covering test: test/sources*.test.ts; the files written are covered by `npm run bench:golden`.
import path from 'path';
import { today } from '../../../shared/dates';
import { cadreMeta } from '../../../shared/cadreSource';
import { KIND, keepHeads, snapPeople, type ListKind, type SourceBinding } from '../../../shared/sources';
import { bindingOf, sameTable, srcMeta, stampNow } from '../../app/bindings';
import { store } from '../../app/state';
import { readBook, syncStampNow, type SourceMeta } from '../../sources';
import { runCmd } from '../commands';
import { sheetOf } from './book';

/**
 * After a read: stamps the kind's memory (when, the table fingerprint, the people's data) so that later changes pass.
 * @param extra fields that win over the stamp (e.g. `keys` of the duty check)
 */
export async function markSynced(kind: ListKind, b: SourceBinding, extra: Partial<SourceMeta> = {}) {
  srcMeta.set(kind, {
    ...(await syncStampNow(b)),
    psnap: snapPeople(store.state.people),
    at: stampNow(),
    pending: false,
    error: undefined,
    locked: false,
    hold: undefined,
    ...extra,
  });
}
/**
 * Cadres: after the read, which are on the sheet and the app's values at that moment (the next write writes only what
 * changed after).
 */
export async function cadreExtra(kind: 'cadres' | 'cadreAbs', b: SourceBinding): Promise<Partial<SourceMeta>> {
  const sh = sheetOf((await readBook(b.file)).sheets, b.sheet);
  return sh ? cadreMeta(kind, sh, b, store.state, today()) : {};
}
/** The records the Excel had at the previous read/write (only if it is the same table). */
export function keysOf(kind: ListKind, b: SourceBinding): string[] {
  return sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.keys || [] : [];
}
/** The app's values at the previous read/write of the same table (empty for another table). */
export const baseFor = (kind: ListKind, b: SourceBinding): Record<string, string> =>
  sameTable(bindingOf(kind), b) ? srcMeta.get(kind)?.base || {} : {};
/**
 * Sets or clears (`null`) the Excel of a kind, as an undoable `setSettings` command. A different file or table drops
 * what was remembered about the old one.
 */
export function saveBinding(kind: ListKind, b0: SourceBinding | null) {
  const cur = bindingOf(kind);
  // the column headings (heads) stay only if the table and its columns did not change; otherwise they are re-entered
  // at the next read
  const b = b0 && keepHeads(b0, cur);
  if (b) srcMeta.allow([b.file]); // a file that main itself set or made
  if (JSON.stringify(cur || null) === JSON.stringify(b)) return;
  const sources = { ...(store.state.settings.sources || {}) };
  if (b) sources[kind] = b;
  else delete sources[kind];
  runCmd({
    t: 'setSettings',
    settings: { sources },
    text: b
      ? 'Excel για ' + KIND[kind].label.toLowerCase() + ': ' + path.basename(b.file) + ' › ' + b.sheet
      : 'χωρίς Excel για ' + KIND[kind].label.toLowerCase(),
  });
  // another file or another table: what we knew about the old one no longer holds
  if (!b || !cur || path.resolve(cur.file) !== path.resolve(b.file) || cur.sheet !== b.sheet || cur.header !== b.header)
    srcMeta.set(kind, null);
}
