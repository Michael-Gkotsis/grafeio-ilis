// The database schema: its version, the migration steps and how many undo patches are kept.
//
// Purpose: `SCHEMA_VERSION`, `UNDO_KEEP` and `MIGRATIONS` (one SQL script per version).
// Does NOT: run the migrations (`Store.migrate` in store.ts does).
// Owner layer: main (architecture), `shared/db`.
// Why: FROZEN data contract (CLAUDE.md hard rule 3). Users upgrade in place from `data/ilh.db`, so the tables, the
//   version number and the order of the steps must never change. A new schema change is appended as a new step and
//   `SCHEMA_VERSION` goes up by one. Moved from src/main/db.ts with the text byte for byte.
// Covering test: test/db.test.ts.

/** The version of the schema this build writes. `MIGRATIONS[v]` upgrades a file from version `v` to `v + 1`. */
export const SCHEMA_VERSION = 2;

/** How many of the newest audit rows with a patch can be undone. Older rows lose their patch. */
export const UNDO_KEEP = 50;

/** The migration scripts, by the version they upgrade from (index 0 creates version 1). */
export const MIGRATIONS: string[] = [
  `CREATE TABLE person (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE status (id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE guard (date TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE cap (pid INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, day TEXT, text TEXT, files TEXT, source TEXT,
                       patch TEXT, undoable INTEGER, undone INTEGER DEFAULT 0);
   CREATE INDEX audit_day ON audit(day);`,
  // 2: soldiers' requests (ΗΚΑΙ, 5. ΑΙΤΗΣΕΙΣ); the old version of the app simply does not read this table
  `CREATE TABLE request (id TEXT PRIMARY KEY, data TEXT NOT NULL);`,
];
