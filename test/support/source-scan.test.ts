// Unit tests of the source scanner (test/support/source-scan.ts) on throw-away folders, so the tests that rely on it can
// trust that "found nothing" is an error and that htm and JSX spellings are both seen.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RENDERER_DIR, componentTag, definersOf, readSources, rendererEntry, staticClosure, staticImports } from './source-scan';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('source scan', () => {
  it('reads .ts, .tsx and .jsx recursively and refuses an empty result', () => {
    put('a/one.ts', 'x'); put('a/b/two.tsx', 'y'); put('three.jsx', 'z'); put('skip.css', 'c'); put('types.d.ts', 'd');
    expect(readSources(dir, 3).map(s => s.rel).sort()).toEqual(['a/b/two.tsx', 'a/one.ts', 'three.jsx']);
    expect(() => readSources(dir, 4)).toThrow(/found 3 files/);
    expect(() => readSources(path.join(dir, 'a', 'b'), 2)).toThrow(/found 1 files/);
  });
  it('the real renderer is found (a move of the folder cannot make a scan vacuous)', () => {
    expect(readSources(RENDERER_DIR, 30).length).toBeGreaterThanOrEqual(30);
  });
  it('componentTag matches the htm and the JSX spelling of an element, not a longer name', () => {
    const re = new RegExp(componentTag('Button'));
    expect(re.test('<${Button} variant="x">')).toBe(true);
    expect(re.test('<Button variant="x">')).toBe(true);
    expect(re.test('<Button>')).toBe(true);
    expect(re.test('<Button/>')).toBe(true);
    expect(re.test('<ButtonGroup a>')).toBe(false);
    expect(re.test('<${ButtonGroup} a>')).toBe(false);
  });
  it('definersOf finds the file that declares a primitive, by content', () => {
    put('prim/Select.tsx', 'export function Select() {}'); put('use.ts', 'const Select = 1;');
    expect(definersOf(readSources(dir, 2), 'Select').map(s => s.rel)).toEqual(['prim/Select.tsx']);
  });
  it('staticImports sees static imports and re-exports, not lazy ones or comments', () => {
    const text = [
      "import { a, b } from './a';", "import type { T } from '../t';", "import './style.css';", "export { c } from './c';",
      "import {\n  d,\n  e,\n} from './d';", "const L = lazy(() => import('./lazy'));", "// import x from './comment';",
      "/* import y from './block'; */", "import React from 'react';",
    ].join('\n');
    expect(staticImports(text)).toEqual(['./a', '../t', './style.css', './c', './d', 'react']);
  });
  it('staticClosure follows static imports (index files too) and skips lazy ones; an unresolvable import throws', () => {
    put('app/entry.ts', "import { x } from './mid';\nimport './s.css';\nconst L = () => import('./lazy');");
    put('app/mid.tsx', "import { y } from './deep';"); put('app/deep/index.ts', 'export const y = 1;');
    put('app/lazy.ts', 'export const l = 1;'); put('app/s.css', 'a{}');
    const seen = [...staticClosure(path.join(dir, 'app', 'entry.ts'))].map(f => path.relative(dir, f)).sort();
    expect(seen).toEqual(['app/deep/index.ts', 'app/entry.ts', 'app/mid.tsx', 'app/s.css']);
    put('app/bad.ts', "import './missing';");
    expect(() => staticClosure(path.join(dir, 'app', 'bad.ts'))).toThrow(/cannot resolve/);
  });
  it('the renderer entry is the module script of index.html and reaches the app shell', () => {
    const files = [...staticClosure(rendererEntry())];
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(f => /app\.(ts|tsx)$/.test(f))).toBe(true);
  });
});
