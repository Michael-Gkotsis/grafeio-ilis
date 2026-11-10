// Builds the script of the print preview window from its TypeScript source.
//
// Purpose: `buildPreviewScript()` bundles src/main/shared/print/previewWindow/preview.ts into one plain script string,
//   and `generatedModuleText()` wraps it as the text of src/main/shared/print/windowScript.gen.ts.
// Does NOT: write any file (scripts/gen-print-window.mjs does) or run in the app.
// Owner layer: build tooling (architecture).
// Why: the window page has a CSP that allows one inline script by its hash, so the script must stay one string in
//   the main bundle. The generator and test/print-window-gen.test.ts both call this one function, so they cannot drift.
// Covering test: test/print-window-gen.test.ts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Repo-relative path of the generated module (the generator writes it, the test reads it). */
export const GENERATED_FILE = 'src/main/shared/print/windowScript.gen.ts';
const ENTRY = 'src/main/shared/print/previewWindow/preview.ts';

/**
 * The bundled script. esbuild puts a `// path/to/module.ts` marker above every module; the markers are dropped so the
 * text does not depend on the OS path separator. Line endings are `\n`.
 * @returns the script text, exactly what the page inlines and what the CSP hash covers
 */
export async function buildPreviewScript() {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    target: 'chrome108',
    minify: false,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*\/\/ src[\\/]/.test(line))
    .join('\n');
}

/** The text of the generated TypeScript module: a header and `PREVIEW_SCRIPT` as one string literal. */
export function generatedModuleText(script) {
  return [
    '// GENERATED FILE: do not edit. Run `npm run gen:print-window` (scripts/gen-print-window.mjs).',
    '//',
    '// Source: src/main/shared/print/previewWindow/*.ts, bundled by esbuild (iife, chrome108) in',
    '// scripts/print-window-build.mjs. test/print-window-gen.test.ts fails when this file is older than the source.',
    '// Excluded from Biome (biome.json): it is one long string, and stays type-checked.',
    `export const PREVIEW_SCRIPT = ${JSON.stringify(script)};`,
    '',
  ].join('\n');
}
