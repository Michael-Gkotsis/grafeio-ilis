// One file write at a time: the ordering queue that all Excel/forms writers of main share.
//
// Purpose: `serial` runs async jobs one after another, so the auto-write, «Ενημέρωση Excel», the form export, the ESSO
//   copy and the report writers never read-and-write the same Excel or `forms.json` at once.
// Does NOT: know what the jobs write, time them out or retry them; a failing job does not stop the next one.
// Owner layer: main (architecture), `app/`. Imports nothing.
// Why: it lived in main.ts and four areas use it (exports, sources/auto-write, reports, ESSO), so no area can own it.
//   Moved verbatim (Phase 4.2b).
// Covering test: test/architecture.test.ts (layers); the write order is exercised by `npm run bench:golden` and
//   `npm run bench:full`.

let ioChain: Promise<unknown> = Promise.resolve();

/**
 * Runs `f` after every job queued before it has settled (resolved or rejected), and answers with `f`'s own result.
 * A rejection reaches only the caller of the failing job; the queue goes on.
 */
export function serial<T>(f: () => Promise<T>): Promise<T> {
  const p = ioChain.then(f, f);
  ioChain = p.catch(() => undefined);
  return p;
}
