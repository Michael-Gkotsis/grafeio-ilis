// The message of a caught value.
//
// Purpose: `msgOf` turns anything that was thrown into the text the UI shows after a Greek prefix.
// Does NOT: translate, log, or build a `{ ok: false }` result (`fail` in features/commands does that).
// Owner layer: main (architecture), `app/`. Imports nothing.
// Why: it was a one-line helper of main.ts that the ΕΣΣΟ code and the reports both use, so neither can
//   own it. Moved verbatim (Phase 4.4).
// Covering test: test/architecture.test.ts (layers); the messages are exercised by the Electron comparison.

/** The `message` of an `Error`, or `String(e)` for anything else thrown. */
export const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
