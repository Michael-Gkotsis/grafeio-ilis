// The remembered print settings of each form.
//
// Purpose: `printPrefs` (the saved settings of a form, or its defaults) and `savePrintPrefs` (remember or forget them
//   in `meta.json`, keeping the last 200 forms).
// Does NOT: open the print window (preview.ts) or answer the window's IPC (ipc.ts).
// Owner layer: main (architecture), `features/print`. Imports app/meta and the print engine (`main/print.ts`).
// Why: moved verbatim from main.ts (Phase 4.5). `printPrefs` in `meta.json` is a frozen data contract (CLAUDE.md
//   rule 3): the same keys and the same order of keys (the oldest are dropped first).
// Covering test: test/print-sheets.test.ts, test/print*.test.ts; `npm run bench:golden` (print geometry).
import { readMeta, writeMeta } from '../../app/meta';
import { cleanOpts, type PrintOpts } from '../../print';

/**
 * The settings of a form: the saved ones (without the page breaks, which hold for today's print only), else its
 * defaults.
 * @param key `printKey(file)`
 * @param base the defaults of the form
 */
export function printPrefs(key: string, base: PrintOpts): { opts: PrintOpts; remember: boolean } {
  const saved = readMeta().printPrefs?.[key];
  return { opts: cleanOpts({ ...(saved || {}), breaks: undefined }, base), remember: true };
}
/**
 * Remembers the settings of a form, or forgets them.
 * @param o the settings to remember; `null` forgets the saved ones
 */
export function savePrintPrefs(key: string, o: PrintOpts | null) {
  const all = { ...(readMeta().printPrefs || {}) };
  if (o) {
    const { breaks: _b, ...keep } = o;
    delete all[key];
    all[key] = keep;
  } else delete all[key];
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k]; // the last 200 forms
  writeMeta({ printPrefs: all });
}
