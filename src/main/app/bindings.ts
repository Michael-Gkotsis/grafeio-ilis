// The Excel binding of each list kind and what main remembers about its file.
//
// Purpose: `srcMeta` (the per-kind sync memory, `data/sources.json`), `bindingOf` (the binding in the settings),
//   `stampNow`, `sameTable`, and the two helpers that keep a binding true to its file: `moveBinding` (the table moved
//   inside the sheet) and `current` (the binding as the file is now).
// Does NOT: read or write any Excel file itself (it asks `main/sources.ts`), schedule an auto-write, or decide what
//   to import; those are `features/autowrite` and the sources area still in main.ts.
// Owner layer: main (architecture), `app/`. Imports `app/paths`, `app/state`, `sources`, `shared/*`.
// Why: both the auto-write (writes back to the files) and the reading side (import, plan, status) need exactly these,
//   and neither may import the other without a cycle, so they live below both. Moved verbatim from main.ts (Phase
//   4.3a). `sources.json` is a frozen data file (CLAUDE.md rule 3): `SourceMetaStore` reads it only on first use.
// Covering test: test/architecture.test.ts (layers, no cycle); test/sources*.test.ts for the store itself;
//   `npm run bench:golden`.
import path from 'path';
import { nowHM, today } from '../../shared/dates';
import { KIND, type ListKind, type SourceBinding } from '../../shared/sources';
import { SourceMetaStore, locateNow } from '../sources';
import { DATA } from './paths';
import { store } from './state';

/** What main remembers per list kind about its Excel file (when it was last synced, its fingerprint, errors...). */
export const srcMeta = new SourceMetaStore(path.join(DATA, 'sources.json'));

/** The Excel binding of a list kind from the settings, or undefined when no file is set. Reads `store`. */
export const bindingOf = (k: ListKind): SourceBinding | undefined => store.state.settings.sources?.[k];

/** «yyyy-mm-dd hh:mm», local time: the `at` stamp of a read or write of a file. */
export const stampNow = () => today() + ' ' + nowHM();

/** True when both bindings point at the same table: same file (case as the OS sees it), sheet and header row. */
export const sameTable = (a?: SourceBinding, b?: SourceBinding) =>
  !!a && !!b && path.resolve(a.file) === path.resolve(b.file) && a.sheet === b.sheet && a.header === b.header;

/**
 * The table moved inside the sheet (rows above it, from Excel or from a write of the app to another table of the same
 * sheet): the binding follows. The same for columns that moved or were added (`b.cols`, from refitCols). It is not
 * a user action, so it is not put into the undo history.
 * @param colsText the History text for the column change, when the caller has its own
 */
export function moveBinding(kind: ListKind, b: SourceBinding, colsText?: string) {
  const cur = bindingOf(kind);
  if (!cur) return;
  const row = cur.header !== b.header,
    cols = !!b.cols && JSON.stringify(cur.cols) !== JSON.stringify(b.cols),
    heads = !!b.heads && JSON.stringify(cur.heads || null) !== JSON.stringify(b.heads);
  if (!row && !cols && !heads) return;
  store.commit({
    ...store.state,
    settings: {
      ...store.state.settings,
      sources: {
        ...(store.state.settings.sources || {}),
        [kind]: { ...cur, header: b.header, cols: cols ? b.cols : cur.cols, ...(b.heads ? { heads: b.heads } : {}) },
      },
    },
  });
  const lbl = 'Excel ' + KIND[kind].label.toLowerCase() + ': ';
  if (row)
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          lbl +
          'ο πίνακας είναι πια στη γραμμή ' +
          (b.header + 1) +
          ' του φύλλου «' +
          b.sheet +
          '» (άλλαξαν γραμμές από πάνω)',
        files: [],
        source: 'auto',
        undoable: false,
      },
      null,
    );
  if (cols && colsText)
    store.addAudit(
      { at: nowHM(), day: today(), text: lbl + colsText, files: [], source: 'auto', undoable: false },
      null,
    );
  else if (cols)
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text:
          lbl + 'οι στήλες ακολούθησαν τις επικεφαλίδες τους στο φύλλο «' + b.sheet + '» (μπήκε ή μετακινήθηκε στήλη)',
        files: [],
        source: 'auto',
        undoable: false,
      },
      null,
    );
}

/** The binding of a kind as it is in the file now (the table or columns may have moved; the binding follows). */
export async function current(kind: ListKind, b = bindingOf(kind)): Promise<SourceBinding | undefined> {
  if (!b) return b;
  const nb = await locateNow(kind, b);
  if (nb !== b && sameTable(bindingOf(kind), b)) moveBinding(kind, nb);
  return nb;
}
