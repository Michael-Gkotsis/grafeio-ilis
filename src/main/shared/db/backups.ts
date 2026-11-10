// The list of backup files, and the rule that decides which of them to delete.
//
// Purpose: `BackupInfo`, `listBackups` (read `data/backups`) and `backupsToDelete` (the keep/delete rule, pure).
// Does NOT: create or delete files (`Store.backup` and `Store.pruneBackups` do), or know the database.
// Owner layer: main (architecture), `shared/db`.
// Why: split out of src/main/db.ts. The file name format `ilh_YYYY-MM-DD_*.db` is a FROZEN contract: users upgrade in
//   place and their old backups must still be listed.
// Covering test: test/cases.test.ts (`backupsToDelete`), test/db.test.ts (`listBackups`).
import fs from 'fs';
import path from 'path';
import { daysBetween } from '../../../shared/dates';

/** One backup file in `data/backups`. */
export interface BackupInfo {
  /** File name, `ilh_YYYY-MM-DD_<time>_<label>.db`. */
  name: string;
  /** ISODate, taken from the file name. */
  day: string;
  /** The label part of the file name (for example the reason of the backup). */
  label: string;
  /** Size in bytes. */
  size: number;
}

/**
 * Lists the backups of a folder, newest first.
 *
 * @param dir The backups folder. A missing folder gives an empty list. Files that do not match the name format are
 *   ignored.
 */
export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^ilh_\d{4}-\d{2}-\d{2}_.*\.db$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({
      name: f,
      day: f.slice(4, 14),
      label: f.replace(/^ilh_\d{4}-\d{2}-\d{2}_\d+_?/, '').replace(/\.db$/, ''),
      size: fs.statSync(path.join(dir, f)).size,
    }));
}

/**
 * Pure function so a test can check it: which backups to delete.
 *
 * @param names File names, newest first.
 * @param now ISODate of today (local time).
 * @returns The names to delete. The rule keeps every backup of the last 14 days, one per week for 8 more weeks, and
 *   one per month after that.
 */
export function backupsToDelete(names: string[], now: string): string[] {
  const del: string[] = [];
  const weeks = new Set<number>();
  const months = new Set<string>();
  for (const f of [...names].sort().reverse()) {
    const day = f.slice(4, 14);
    const age = daysBetween(day, now) - 1;
    if (age < 14) continue;
    const week = Math.floor(age / 7);
    if (age < 14 + 56) {
      if (!weeks.has(week)) {
        weeks.add(week);
        continue;
      }
      del.push(f);
      continue;
    }
    const m = day.slice(0, 7);
    if (!months.has(m)) {
      months.add(m);
      continue;
    }
    del.push(f);
  }
  return del;
}
