// The script of the print preview window, as one string, and its hash.
//
// Purpose: `PREVIEW_SCRIPT` (the JavaScript the window runs) and `SCRIPT_HASH` (its SHA-256 for the CSP).
// Does NOT: contain the script's code (it is TypeScript in previewWindow/, bundled into windowScript.gen.ts by
//   `npm run gen:print-window`) or build the window page (window.ts).
// Owner layer: main (architecture), `shared/print`. Pure string work; no Electron, no fs.
// Why: the window is a page loaded from a string with a strict CSP; only this script runs, by its hash, so it must
//   stay one inline string in the main bundle (no `<script src>`, no extra file to ship).
// Covering test: test/print-window-gen.test.ts (fresh bundle, hash), test/print-safety.test.ts (CSP).
import crypto from 'crypto';
import { PREVIEW_SCRIPT as GENERATED_SCRIPT } from './windowScript.gen';

/**
 * The script of the preview. It is the only one the CSP allows (by its hash), so whatever else the file puts in the
 * page does not run. Every change of a setting asks the app for a new layout (the Excel was already read once).
 * @see previewWindow/preview.ts (source)
 */
export const PREVIEW_SCRIPT: string = GENERATED_SCRIPT;
/** Hash of the preview script for the `script-src` of the CSP of the window (base64 SHA-256). */
export const SCRIPT_HASH = crypto.createHash('sha256').update(PREVIEW_SCRIPT).digest('base64');
