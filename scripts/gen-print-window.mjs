// Regenerates src/main/shared/print/windowScript.gen.ts from the TypeScript source of the print window script.
//
// Usage: npm run gen:print-window
// Purpose: writes the committed bundle that `windowScript.ts` hashes and `previewHtml` inlines.
// Does NOT: build the app (npm run build) or decide anything: the build is `buildPreviewScript()`, shared with
//   test/print-window-gen.test.ts, which fails when the committed file is not what this script would write.
// Owner layer: build tooling (architecture).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreviewScript, generatedModuleText, GENERATED_FILE } from './print-window-build.mjs';

const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', GENERATED_FILE);
const text = generatedModuleText(await buildPreviewScript());
let before = '';
try {
  before = readFileSync(target, 'utf8');
} catch {
  // first run: the file does not exist yet
}
if (before === text) console.log('unchanged  ' + GENERATED_FILE);
else {
  writeFileSync(target, text);
  console.log('written    ' + GENERATED_FILE);
}
