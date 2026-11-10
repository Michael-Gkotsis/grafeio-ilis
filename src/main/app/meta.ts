// Small settings kept outside the database: `data/meta.json` (last USB copy, report history, print prefs) and
// `data/flags.json` (GPU switch).
//
// Purpose: the two file paths, their types and the tolerant readers/writer for them.
// Does NOT: touch `store`, the window or Electron; it never throws on a missing or broken file (returns `{}`).
// Owner layer: main (architecture), `app/`.
// Why: moved verbatim out of main.ts (Phase 4.1a). Both files are frozen contracts (CLAUDE.md rule 3): their names,
//   keys and JSON shape must not change, users upgrade in place.
// Covering test: none of its own yet; the bytes written are covered by the golden/boot benchmarks and by
//   test/architecture.test.ts for the layer rules.
import fs from 'fs';
import path from 'path';
import { writeJson } from '../files';
import type { PrintOpts } from '../print';
import type { GroupKey } from '../reports';
import type { ISODate } from '../../shared/dates';
import { DATA } from './paths';

// GPU switch (research §5.6): on old Windows 7 graphics cards the acceleration can cost memory or give a black screen.
// Changed from the «Διάγνωση» screen and applies at the next start.
/** `data/flags.json`. */
export const FLAGS = path.join(DATA, 'flags.json');
/** Reads flags.json; any missing or broken file answers `{}`. */
export const readFlags = (): { disableGpu?: boolean } => {
  try {
    return JSON.parse(fs.readFileSync(FLAGS, 'utf8'));
  } catch {
    return {};
  }
};
// Small items that do not belong in the database (so a restore does not lose them): last USB copy, how far the user
// has seen the history
/** `data/meta.json`. */
export const META = path.join(DATA, 'meta.json');
/** Shape of meta.json (frozen; every key optional). */
export type Meta = {
  lastUsb?: string;
  usbDir?: string;
  seenAudit?: number;
  essoArchives?: string[];
  repLast?: Record<string, string>;
  repTimes?: Record<string, RepTimes>;
  repSheets?: Record<string, RepSheets>;
  repHist?: Record<string, RepHist[]>;
  printPrefs?: Record<string, Partial<PrintOpts>>;
  printDuplex?: boolean;
};
// printPrefs: the settings of the «Εκτύπωση» window per form (printKey); printDuplex: the printer does double-sided
// by itself
// Forms: how many times each person came out on each form with random picks (per ΕΣΣΟ: a New ΕΣΣΟ starts from zero)
// and which sheets each form wrote in which file (so it does not write over a sheet it did not make, and the import
// does not read them)
/** Per report id: the ΕΣΣΟ the counts belong to, and the count per person. */
export type RepTimes = { essos: string; n: Record<string, number> };
/** Per report id: the file it wrote, the sheets and the groups in them. */
export type RepSheets = { file: string; sheets: string[]; groups: GroupKey[] };
// history of versions: who was included each time it came out (so the same one can come out again if the paper is
// lost); the last 10 per form
/** One entry of a report's history. */
export type RepHist = {
  at: string;
  date: ISODate;
  ids: (number | string)[];
  n: number;
  file: string;
  sheets?: string[];
};
/** Most history entries kept per report. */
// repLast: when each form came out; essoArchives: ΕΣΣΟ archive folders that were written
export const HIST_MAX = 30;
/** Reads meta.json; any missing or broken file answers `{}`. */
export const readMeta = (): Meta => {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return {};
  }
};
/** Merges `m` into meta.json (shallow, last write wins). Failures are logged with `console.error('meta', e)`. */
export const writeMeta = (m: Partial<Meta>) => {
  try {
    writeJson(META, { ...readMeta(), ...m });
  } catch (e) {
    console.error('meta', e);
  }
};
