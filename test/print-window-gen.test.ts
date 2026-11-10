// The script of the print preview window is generated from TypeScript: the committed bundle must be fresh, and its
// hash must be the one in the CSP of the page.
//
// Purpose: (1) `windowScript.gen.ts` is exactly what `npm run gen:print-window` would write now (a source edit without
//   regenerating fails here); (2) `SCRIPT_HASH` is the SHA-256 of the exact text inlined in `previewHtml`; (3) the
//   bundle is safe to inline and uses nothing Chromium 108 (Electron 22, Windows 7) lacks.
// Does NOT: run the script (that is compared in a real Electron window in the PR).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildPreviewScript, generatedModuleText, GENERATED_FILE } from '../scripts/print-window-build.mjs';
import { PREVIEW_SCRIPT, SCRIPT_HASH } from '../src/main/shared/print/windowScript';
import { previewHtml } from '../src/main/shared/print/window';
import type { PrintDoc } from '../src/main/shared/print/pagesetup';

const emptyDoc = { sheets: [], all: [], total: 0, css: '', cols: [] } as unknown as PrintDoc;

describe('print window script: generated from TypeScript', () => {
  it('the committed windowScript.gen.ts is what the build writes now (run npm run gen:print-window)', async () => {
    const built = await buildPreviewScript();
    expect(PREVIEW_SCRIPT === built, 'stale bundle: run npm run gen:print-window').toBe(true);
    const file = fs.readFileSync(path.join(__dirname, '..', GENERATED_FILE), 'utf8');
    expect(file === generatedModuleText(built), 'stale file: run npm run gen:print-window').toBe(true);
  });

  it('SCRIPT_HASH is the SHA-256 of the exact script text inside previewHtml, and the CSP names only it', () => {
    const html = previewHtml(emptyDoc, 'a.xlsx');
    const inlined = /<script>([\s\S]*?)<\/script><\/body><\/html>$/.exec(html);
    expect(inlined).not.toBeNull();
    expect(inlined?.[1] === PREVIEW_SCRIPT).toBe(true);
    const digest = crypto
      .createHash('sha256')
      .update(inlined?.[1] ?? '')
      .digest('base64');
    expect(SCRIPT_HASH).toBe(digest);
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp).toContain(`script-src 'sha256-${digest}'`);
    expect(csp.match(/'sha256-/g)).toHaveLength(1);
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('the bundle can sit in an inline <script>, is browser-only and has no source map or module syntax', () => {
    expect(PREVIEW_SCRIPT).not.toMatch(/<\/script|<!--/i);
    expect(PREVIEW_SCRIPT).not.toMatch(/\bimport\s*[({]|\bexport\s|sourceMappingURL|require\(/);
    expect(PREVIEW_SCRIPT).not.toMatch(
      /\.toSorted\(|\.toReversed\(|\.findLast(Index)?\(|\bstructuredClone\(|\bfetch\(/,
    );
    expect(PREVIEW_SCRIPT).toContain('window.printer');
  });
});
