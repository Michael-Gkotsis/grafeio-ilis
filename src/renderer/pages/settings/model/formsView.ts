// Pure rules of the «Έντυπα: template και φάκελος» card: the binding a template dialog saves.
// Purpose: `formBindingOf` and `formSaveText`, shared by `FormDialog` and `useForms`.
// Does NOT: render anything, touch React or call `window.api`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6) so the rules are
//   testable without a render.
// Covering test: test/settings-sources-view.test.ts.
import type { FormInfo } from '../../../../shared/api';
import { HK_COLS, HK_RANKS, type FormBinding, type FormKind, type HkaiMap } from '../../../../shared/sources';
import { base } from '../../../widgets/sources-alert';

/**
 * The binding that the template dialog saves.
 * @param form - the form
 * @param i - what the main process found in the template file
 * @param current - the binding stored now (kept for the folder and the month box)
 * @param sheet - the chosen sheet (front page for the ΗΚΑΙ)
 * @param sheet2 - the chosen second sheet (back page, or the sheet of the remaining), ignored for other forms
 * @param map - the ΗΚΑΙ cell map as edited (null for other forms)
 * @returns the binding; for the ΗΚΑΙ `cells` holds only what the sergeant changed against the recognition
 */
export function formBindingOf(
  form: FormKind,
  i: FormInfo,
  current: FormBinding,
  sheet: string,
  sheet2: string,
  map: HkaiMap | null,
): FormBinding {
  const hk = i.hkai;
  const two = form === 'hkai' || form === 'outs';
  const b: FormBinding = { ...current, file: i.custom ? i.file : undefined, sheet, sheet2: two ? sheet2 : undefined };
  if (form === 'hkai' && map && hk) {
    // Keep only what the sergeant changed against the recognition.
    const cells: Partial<HkaiMap> = {};
    const rows: Record<string, number> = {};
    const cols: Record<string, string> = {};
    for (const r of HK_RANKS) if (map.rows[r] !== hk.map.rows[r]) rows[r] = map.rows[r];
    for (const [k] of HK_COLS) if (map.cols[k] !== hk.map.cols[k]) cols[k] = map.cols[k];
    if (map.title !== hk.map.title) cells.title = map.title;
    if (map.date !== hk.map.date) cells.date = map.date;
    if (Object.keys(rows).length) cells.rows = rows;
    if (Object.keys(cols).length) cells.cols = cols;
    b.cells = Object.keys(cells).length ? cells : undefined;
  }
  return b;
}

/**
 * The toast text after a template was saved.
 * @param label - the form's label
 * @param b - the saved binding
 */
export const formSaveText = (label: string, b: FormBinding): string =>
  label + ': ' + (b.file ? base(b.file) : 'template της εφαρμογής') + (b.sheet ? ' › ' + b.sheet : '');
