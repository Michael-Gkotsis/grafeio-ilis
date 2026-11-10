// The error of a damaged database file, and the integrity check that finds one.
//
// Purpose: `CorruptDbError` (what `Store.open` throws for a file that is empty, broken or not ours) and `quickCheck`
//   (SQLite `PRAGMA quick_check` as a plain result).
// Does NOT: open, repair or restore a database (store.ts throws the error, main.ts shows the recovery screen).
// Owner layer: main (architecture), `shared/db`.
// Why: split out of src/main/db.ts so the error class and the check live apart from the 400-line `Store` class.
//   The Greek messages that go with the error stay where the error is thrown, byte for byte.
// Covering test: test/db.test.ts (empty file, damaged file, file without our tables).
import type { Database } from 'sql.js';

/**
 * The database file cannot be used as it is.
 *
 * `empty` is true when the file is empty (0 bytes) or does not have our tables (power cut, half-copied folder): the
 * app may then offer a fresh start or a backup. When false, SQLite itself reported damage.
 */
export class CorruptDbError extends Error {
  constructor(
    msg: string,
    public empty = false,
  ) {
    super(msg);
  }
}

/**
 * Runs `PRAGMA quick_check` on an open database.
 *
 * @returns null when the database is fine, otherwise the text SQLite gave (or the message of the error it threw).
 */
export function quickCheck(db: Database): string | null {
  try {
    const r = db.exec('PRAGMA quick_check');
    const v = r.length ? String(r[0].values[0][0]) : 'ok';
    return v === 'ok' ? null : v;
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}
