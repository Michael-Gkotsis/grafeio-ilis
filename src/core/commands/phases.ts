// Helpers of the own duty forms (phases): name check and delete check.
//
// Purpose: `phaseNameOk` (the name of an own form: capitals, unique, no «ΦΡΟΥΡΑ») and `phaseDelWhy` (why a form
//   cannot be deleted; '' = it can).
// Does NOT: change the settings.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: The name goes into the Excel file name, and a form with duties already made must stay for the history.
// Covering tests: test/own-phases.test.ts.
import { norm, upper } from '../lib/text';
import type { Phase } from '../model/duty';
import { blocksOf, everyBlock, phaseList } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import type { Settings } from '../model/settings';

/** Name of your own duty form: capitals (it goes into the Excel name), not the same as another, not «ΦΡΟΥΡΑ …». */
export function phaseNameOk(st: Settings, raw: string, self?: Phase): string {
  const name = upper(raw)
    .replace(/\s+/g, ' ')
    .replace(/^ΦΡΟΥΡΑ\s+/, '')
    .trim();
  if (!name) throw new Error('Γράψε όνομα για το έντυπο υπηρεσιών');
  if (/[\\/:*?"<>|]/.test(name))
    throw new Error('Το όνομα μπαίνει στο όνομα του αρχείου Excel: χωρίς \\ / : * ? " < > |');
  if (phaseList(st).some((x) => x.id !== self && norm(x.name) === norm(name)))
    throw new Error('Υπάρχει ήδη έντυπο υπηρεσιών ' + name);
  return name;
}
/**
 * Why your own duty form cannot be deleted ('' = it can): not the one in force, not if duties that only this form
 * has were made on some day (their name would be lost from the history).
 */
export function phaseDelWhy(s: AppState, id: Phase): string {
  if ((s.settings.phase || 'sven') === id) return 'Ισχύει τώρα: διάλεξε πρώτα άλλο έντυπο στις Θέσεις';
  const mine = new Set(blocksOf(s.settings, id).flatMap((b) => b.posts.map((p) => p.k)));
  const rest = { ...s.settings, phases: (s.settings.phases || []).filter((x) => x.id !== id) };
  for (const b of everyBlock(rest)) for (const p of b.posts) mine.delete(p.k);
  if (!mine.size) return '';
  const used = Object.values(s.guards).some((g) => Object.keys(g).some((k) => mine.has(k)));
  return used ? 'Έχει υπηρεσίες που έγιναν και υπάρχουν μόνο σε αυτό· μένει για το ιστορικό' : '';
}
