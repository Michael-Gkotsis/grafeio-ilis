// Pure helpers of the «Ρυθμίσεις › ΕΣΣΟ» cards: a folder path, the series choices, an archive time and the wizard steps.
// Purpose: `joinDir`, `SERIES_ITEMS`, `atTxt` and `ESSO_STEPS`, shared by the cards, the wizard and the restore dialog.
// Does NOT: render anything, touch React or call `window.api`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6) so the text rules are
//   testable without a render.
// Covering test: test/settings-esso-view.test.ts.
import type { EssoStart, ImportPreview } from '../../../../shared/api';
import { ESSO_SERIES, type Esso, type EssoSeries } from '../../../../shared/esso';
import { dmy } from '../../../../shared/dates';

/**
 * A file name inside a folder, with the separator the folder already uses.
 * @param dir - a folder path, Windows (`C:\x\`) or POSIX; trailing separators are dropped
 * @param name - the file or folder name to append
 * @returns `dir` + one separator (`\` when `dir` has a backslash anywhere, else `/`) + `name`
 */
export const joinDir = (dir: string, name: string): string =>
  dir.replace(/[\\/]+$/, '') + (dir.includes('\\') ? '\\' : '/') + name;

/** The Α΄ Β΄ Γ΄ Δ΄ choices of the series switch. */
export const SERIES_ITEMS: { value: EssoSeries; label: string }[] = ESSO_SERIES.map((s) => ({
  value: s,
  label: s + '΄',
}));

/**
 * When an archive was made, for people.
 * @param at - local time `YYYY-MM-DD HH:mm` (anything else is returned unchanged)
 * @returns `dd/mm/yyyy HH:mm` («2026-08-10 09:12» → «10/08/2026 09:12»)
 */
export const atTxt = (at: string): string => (/^\d{4}-\d{2}-\d{2}/.test(at) ? dmy(at.slice(0, 10)) + at.slice(10) : at);

/** The four steps of the «Νέα ΕΣΣΟ» wizard, in order (the dialog description numbers them from 1). */
export const ESSO_STEPS = ['ΕΣΣΟ', 'Αρχείο τωρινής', 'Excel νέας', 'Επιβεβαίωση'];

/**
 * The request that starts the new ΕΣΣΟ.
 * @param e - the chosen ΕΣΣΟ
 * @param root - the archive folder for the current ΕΣΣΟ
 * @param dir - the sergeant's own folder for the new Excel files, or null for the default
 * @param ros - the roster file the sergeant picked, if any
 * @param unit - the unit header to write into the new settings
 */
export const essoStartArgs = (
  e: Esso,
  root: string,
  dir: string | null,
  ros: ImportPreview | null,
  unit: EssoStart['unit'],
): EssoStart => ({
  esso: { s: e.s, y: e.y },
  archiveRoot: root,
  ...(dir ? { newDir: dir } : {}),
  ...(ros ? { roster: ros.token } : {}),
  unit,
});
