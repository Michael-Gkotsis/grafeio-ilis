// «Έντυπα › σελίδα δημιουργίας»: the route, the preview sample and the pages.
//
// Purpose: `formOpen` / `newForm` / `editForm` / `noForm` (which form the page opens), the preview sample
//   (`PV_SAMPLES`, `getSample`, `cutSample`…), the page labels, `formSnap` / `isFormDirty` (unsaved changes) and
//   `autoName`.
// Does NOT: draw anything (React) or reach Node.
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: pure so it can be tested without a screen. The sample applies ONLY to the preview: it does not go into the
//   form (`Report`) and does not reach the output (rep:run).
// Covering tests: test/rep-page.test.ts, test/screens-main.test.ts, test/status-fix.test.ts.
import type { Report } from '../model/reportTypes';

/**
 * The sample sizes the preview offers.
 * The sample applies ONLY to the preview: it does not go into the form (`Report`) and does not reach the output
 * (rep:run).
 */
export const PV_SAMPLES = [5, 10, 20, 0] as const; // how many rows each table shows; 0 = all
/** The sample size the preview starts with. */
export const PV_SAMPLE_DEF = 10;
/** The most rows per table that «Όλοι» shows in the preview. */
export const PV_MAX = 400; // «Όλοι»: up to this many rows per table (the output has no limit)
/** The most pages the preview draws. */
export const PV_PAGES = 12; // how many pages the preview draws at most
/** The label of a sample size: the number, or «Όλοι» for 0. */
export const sampleName = (n: number) => (n > 0 ? String(n) : 'Όλοι');
/** The row limit for a sample size (`PV_MAX` for 0). */
export const pvCap = (n: number) => (n > 0 ? n : PV_MAX);
/** The first rows of a table that the preview shows. */
export const cutSample = <T>(rows: T[], n: number): T[] => rows.slice(0, pvCap(n));
/** How many rows the preview shows out of how many there are. */
export interface PvCount {
  shown: number;
  total: number;
}
/** «Δείγμα: 5 από 130»; nothing when all are shown. */
export const sampleLabel = (c?: PvCount) => (c && c.shown < c.total ? 'Δείγμα: ' + c.shown + ' από ' + c.total : '');
// per form, within the session (not in the file of the form)
const samples = new Map<string, number>();
/** The sample size of a form in this session. */
export const getSample = (id: string) => samples.get(id) ?? PV_SAMPLE_DEF;
/** Sets the sample size of a form for this session. */
export const setSample = (id: string, n: number) => {
  samples.set(id, n);
};
/** The pages of the preview that are drawn (at most `PV_PAGES`); the label looks like «Σελίδα 2 από 5». */
export const shownPages = (pages: number) => Math.min(Math.max(0, pages), PV_PAGES);
/** Keeps a page number inside 1 and the pages that are shown. */
export const clampPage = (p: number, pages: number) => Math.max(1, Math.min(p, Math.max(1, shownPages(pages))));
/** The label of the page: «Σελίδα 2 από 5». */
export const pageText = (p: number, pages: number) => 'Σελίδα ' + clampPage(p, pages) + ' από ' + pages;
/**
 * Route: which form the page opens (param `repForm` of the «Έντυπα» screen); `id`: an existing form, otherwise a new
 * one.
 */
export const FORM_PARAM = 'repForm';
/** What the route asks the page to open: an existing form (`id`) or a new one (`start`, `preset`, `tpl`). */
export interface FormArg {
  id?: string;
  start?: 'upload' | 'build' | 'tpl';
  preset?: string;
  tpl?: string;
}
/** The form the page opens, with the key that identifies this opening. */
export interface FormOpen {
  arg: FormArg;
  r?: Report;
  key: string;
}
/** Reads the route params into the form to open; null when no page was asked for. */
export function formOpen(params: Record<string, any>, reports: Report[]): FormOpen | null {
  const a = params[FORM_PARAM];
  if (!a || typeof a !== 'object') return null;
  const arg: FormArg = {};
  if (typeof a.id === 'string') arg.id = a.id;
  if (a.start === 'upload' || a.start === 'build' || a.start === 'tpl') arg.start = a.start;
  if (typeof a.preset === 'string') arg.preset = a.preset;
  if (typeof a.tpl === 'string') arg.tpl = a.tpl;
  if (arg.id == null)
    return {
      arg,
      key: 'new:' + (arg.start || '') + ':' + (arg.preset || arg.tpl || '') + ':' + (typeof a.n === 'number' ? a.n : 0),
    };
  const r = reports.find((x) => x.id === arg.id);
  return r ? { arg, r, key: arg.id } : null; // a form that no longer exists (deleted): as if no page was asked for
}
/** A new form: `n` changes every time, so a second «Νέο έντυπο» starts clean. */
export const newForm = (arg: Omit<FormArg, 'id'> = {}): Record<string, any> => ({
  [FORM_PARAM]: { ...arg, n: Date.now() },
});
/** The route params that open an existing form. */
export const editForm = (id: string): Record<string, any> => ({ [FORM_PARAM]: { id } });
/** The route params that close the page. */
export const noForm = (): Record<string, any> => ({ [FORM_PARAM]: undefined });
/**
 * The «unsaved changes» of the creation page: only the content of the form (the form, the columns being built, the
 * kind of template, the signers). The step, the sample, the preview page and anything else that is screen do NOT
 * count. The baseline (`base`) is taken after the route has initialised the page.
 */
export const formSnap = (r: unknown, build: unknown, mode: unknown, signers: unknown): string =>
  JSON.stringify([r, build, mode, signers]);
/** True when the content changed since the baseline (never while busy, or before a baseline exists). */
export const isFormDirty = (base: string | null, cur: string, busy = false): boolean =>
  !busy && base != null && base !== cur;
/**
 * The name of a form when the user wrote none.
 * @decision Michael 29/10: «δεν μου αποθήκευσε». Its title (or the name of the template), otherwise «Έντυπο».
 */
export const autoName = (title?: string): string => (title || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Έντυπο';
