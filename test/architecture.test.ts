// Architecture test: the structure rules of CLAUDE.md as a ratchet. New violations fail; old ones are listed in
// test/architecture/baseline.json and can only shrink.
//
// Purpose: enforce (1) no new import cycles, (2) process boundaries (shared / renderer / main / preload),
//   (3) FSD layering for the future renderer folders, (4) file <= 400 and function <= 80 (screen component <= 150)
//   physical lines, (5) no new `.forEach(` and no new `any`.
// Does NOT: check behaviour, formatting or comments; and it never reads files outside src/ (one scan, ~1 s).
// Owner layer: test only. Helpers: test/support/arch-model.ts, arch-scan.ts, arch-rules.ts, arch-baseline.ts.
// Why: the rewrite moves ~125 files; without a ratchet the old shape comes back one import at a time.
//
// HOW THE BASELINE WORKS
//   - Everything the test reports that already existed when it was added is in test/architecture/baseline.json.
//   - You fix something -> the test tells you "Remove from baseline" -> run
//       ARCH_UPDATE=1 npx vitest run test/architecture.test.ts
//     and commit the smaller baseline.json. The update path refuses to run when CI is set, and refuses to write a
//     baseline in which any number is bigger or any entry is new without a removed entry of at least the same size
//     (that exception exists only so a pure file move can rename its key).
//   - GROWING A BASELINE ENTRY, OR ADDING ONE BY HAND, IS FORBIDDEN IN REVIEW. Fix the code instead.
//   - Measure: physical lines (first to last line of the file or function, blank lines and comments included), the
//     same as `wc -l` and the analysis scripts of the plan. Dynamic `import()` is not an edge of the cycle graph.
//   - Screen component = a function in src/renderer/screens/** or src/renderer/pages/** whose name starts with a
//     capital letter (limit 150); every other function is limited to 80.
// Covering test of itself: the "rules bite" sections below run each rule on hand-made graphs.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FILE_LINE_LIMIT, MIN_SCANNED_FILES, type ArchFile, type ArchImport, type Baseline, type ImportKind,
} from './support/arch-model';
import { REPO_ROOT, listSourcePaths, resolveImports, scanSource, scanTree } from './support/arch-scan';
import {
  FILE_TEXT, FUNCTION_TEXT, checkBoundaries, checkBoundaryBaseline, checkCounts, checkCycles, checkFsd,
  findCycles, oversizeFiles, oversizeFunctions, perFileCounts, styleText,
} from './support/arch-rules';
import {
  README, currentState, loadBaseline, planUpdate, writeBaseline,
} from './support/arch-baseline';

const files = scanTree();

if (process.env.ARCH_UPDATE) {
  const next = currentState(files);
  const plan = planUpdate(loadBaseline(), next);
  if (!plan.ok) throw new Error(`ARCH_UPDATE refused:\n  ${plan.errors.join('\n  ')}`);
  writeBaseline(next);
}

const baseline = loadBaseline();
const need = (): Baseline => {
  if (!baseline) {
    throw new Error('test/architecture/baseline.json is missing. Create it: ARCH_UPDATE=1 npx vitest run ' +
      'test/architecture.test.ts');
  }
  return baseline;
};
const expectClean = (problems: string[]): void => { expect(problems, `\n${problems.join('\n')}\n`).toEqual([]); };

// Where each ambient setter may be called. Defining file + src/core/ambient.ts; core/duty/indexes.ts keeps its own
// noteNamesakes call in personMap (the people index must stay right for any caller, including the worker). Test files
// are not scanned.
const AMBIENT_DEFINERS = { clockOf: 'src/core/lib/dates.ts', setClock: 'src/core/lib/dates.ts',
  noteNamesakes: 'src/core/model/person.ts', setUnitKind: 'src/core/model/unit.ts' } as const;
const AMBIENT_ALLOWED: Record<keyof typeof AMBIENT_DEFINERS, string[]> = {
  clockOf: [AMBIENT_DEFINERS.clockOf, 'src/core/ambient.ts'],
  setClock: [AMBIENT_DEFINERS.setClock],
  noteNamesakes: [AMBIENT_DEFINERS.noteNamesakes, 'src/core/ambient.ts', 'src/core/duty/indexes.ts'],
  setUnitKind: [AMBIENT_DEFINERS.setUnitKind, 'src/core/ambient.ts'],
};
/** Every `setter(` call (comments removed) in src/, as setter + repo-relative file. */
function ambientCallers(): { setter: keyof typeof AMBIENT_DEFINERS; file: string }[] {
  const setters = Object.keys(AMBIENT_DEFINERS) as (keyof typeof AMBIENT_DEFINERS)[];
  return listSourcePaths().flatMap(file => {
    const code = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return setters.filter(setter => new RegExp(`\\b${setter}\\(`).test(code)).map(setter => ({ setter, file }));
  });
}

describe('architecture: the real src/ tree', () => {
  it('scans enough files (a broken glob must not pass vacuously)', () => {
    expect(files.length).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);
    expect(files.filter(file => file.path.startsWith('src/shared/')).length).toBeGreaterThan(20);
    expect(files.filter(file => file.path.startsWith('src/renderer/')).length).toBeGreaterThan(20);
    expect(files.filter(file => file.path.startsWith('src/main/')).length).toBeGreaterThan(10);
    expect(files.flatMap(file => file.imports).filter(imp => imp.target).length).toBeGreaterThan(300);
  });

  it('rule 1: no new import cycle over runtime imports, none grows, none stays after it is fixed', () => {
    expectClean(checkCycles('value', findCycles(files, ['value']), need().cycles.value));
  });

  it('rule 1: the same over runtime + type-only imports', () => {
    expectClean(checkCycles('with type imports', findCycles(files, ['value', 'type']), need().cycles.withTypes));
  });

  it('rule 2: process boundaries (shared is pure; renderer sandbox; main !-> renderer; preload minimal)', () => {
    expectClean(checkBoundaryBaseline(checkBoundaries(files), need().boundaries));
  });

  it('rule 3: FSD layering under src/renderer (quiet until the layer folders exist)', () => {
    expectClean(checkFsd(files).map(violation => violation.message));
  });

  it('rule 4: file size (400 lines) only shrinks', () => {
    expectClean(checkCounts(oversizeFiles(files, FILE_LINE_LIMIT), need().oversizeFiles, FILE_TEXT(FILE_LINE_LIMIT)));
  });

  it('rule 4: function size (80 lines, screen component 150) only shrinks', () => {
    expectClean(checkCounts(oversizeFunctions(files), need().oversizeFunctions, FUNCTION_TEXT));
  });

  it('rule 5: .forEach( calls only go down; new files have none', () => {
    expectClean(checkCounts(perFileCounts(files, file => file.forEach), need().forEach, styleText('forEach')));
  });

  it("rule 5: 'any' type annotations only go down; new files have none", () => {
    expectClean(checkCounts(perFileCounts(files, file => file.anyCount), need().any, styleText('any')));
  });

  it('ambient setters (clockOf, setClock, noteNamesakes, setUnitKind) are called only where the allowlist says', () => {
    expectClean(ambientCallers().filter(hit => !AMBIENT_ALLOWED[hit.setter].includes(hit.file)).map(hit =>
      `${hit.file} calls ${hit.setter}(; go through applyAmbient() from src/core/ambient.ts instead`));
  });

  it('ambient allowlist: the scan really sees the defining files and ambient.ts', () => {
    const seen = ambientCallers().map(hit => `${hit.setter}@${hit.file}`);
    expect(seen).toContain('noteNamesakes@src/core/ambient.ts');
    expect(seen).toContain('noteNamesakes@src/core/duty/indexes.ts');
    expect(seen).toContain('setClock@src/core/lib/dates.ts');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The rules bite: each one is run on a hand-made graph so it is proven to fail without needing a bad file in src/.
// ---------------------------------------------------------------------------------------------------------------

const imp = (
  spec: string, kind: ImportKind = 'value', target: string | null = null, external: string | null = null,
): ArchImport => ({ spec, kind, line: 1, target, external });
const node = (path: string, imports: ArchImport[] = [], extra: Partial<ArchFile> = {}): ArchFile =>
  ({ path, lines: 10, imports, functions: [], forEach: 0, anyCount: 0, ...extra });
/** Build a graph from `{ file: [targets...] }`; the specifier is written as a relative path. */
const graph = (edges: Record<string, string[]>, kind: ImportKind = 'value'): ArchFile[] =>
  Object.entries(edges).map(([path, targets]) => node(path, targets.map(target => imp(`./${target}`, kind, target))));

describe('architecture rules bite: import cycles', () => {
  const a = 'src/shared/a.ts';
  const b = 'src/shared/b.ts';
  const c = 'src/shared/c.ts';
  it('finds a loop, ignores a chain, ignores dynamic imports, separates type-only edges', () => {
    expect(findCycles(graph({ [a]: [b], [b]: [a] }), ['value'])).toEqual([[a, b]]);
    expect(findCycles(graph({ [a]: [b], [b]: [c], [c]: [] }), ['value'])).toEqual([]);
    expect(findCycles(graph({ [a]: [b], [b]: [a] }, 'dynamic'), ['value', 'type'])).toEqual([]);
    const typeLoop = [node(a, [imp('./b', 'type', b)]), node(b, [imp('./a', 'value', a)])];
    expect(findCycles(typeLoop, ['value'])).toEqual([]);
    expect(findCycles(typeLoop, ['value', 'type'])).toEqual([[a, b]]);
  });
  it('fails on a new cycle and on a cycle that gained a member, naming the files', () => {
    const now = findCycles(graph({ [a]: [b], [b]: [a] }), ['value']);
    expect(checkCycles('value', now, [])[0]).toMatch(/New import cycle.*src\/shared\/a\.ts, src\/shared\/b\.ts/);
    const grown = findCycles(graph({ [a]: [b], [b]: [c], [c]: [a] }), ['value']);
    expect(checkCycles('value', grown, now)[0]).toMatch(/gained members: src\/shared\/c\.ts/);
  });
  it('passes on the baseline, and demands removal when a cycle is gone or got smaller', () => {
    const now = findCycles(graph({ [a]: [b], [b]: [a] }), ['value']);
    expect(checkCycles('value', now, now)).toEqual([]);
    expect(checkCycles('value', [], now)[0]).toMatch(/no longer exists.*Remove from baseline/);
    const big = [[a, b, c]];
    expect(checkCycles('value', now, big)[0]).toMatch(/got smaller.*Remove from baseline/);
  });
});

describe('architecture rules bite: process boundaries', () => {
  const external = (path: string, spec: string): Array<{ key: string; message: string }> =>
    checkBoundaries([node(path, [imp(spec, 'value', null, spec.replace(/^node:/, '').split('/')[0])])]);
  const internal = (path: string, target: string): Array<{ key: string; message: string }> =>
    checkBoundaries([node(path, [imp('../x', 'value', target)])]);
  it('src/shared and src/core stay free of Node, Electron, React, htm and process folders', () => {
    const forbidden = [
      'fs', 'node:path', 'os', 'child_process', 'worker_threads', 'electron', 'react', 'react-dom/client', 'htm',
    ];
    expect(forbidden.map(spec => external('src/shared/x.ts', spec).length)).toEqual(forbidden.map(() => 1));
    expect(external('src/core/duty/x.ts', 'fs')[0].message)
      .toMatch(/src\/core\/duty\/x\.ts:1 imports 'fs'.*shared-pure.*Fix:/);
    const processFiles = ['src/main/db.ts', 'src/renderer/app.ts', 'src/preload/preload.ts'];
    expect(processFiles.map(target => internal('src/shared/x.ts', target).length)).toEqual([1, 1, 1]);
    expect(internal('src/shared/x.ts', 'src/shared/y.ts')).toEqual([]);
    expect(external('src/shared/x.ts', 'exceljs')).toEqual([]);
  });
  it('the renderer may not import main, electron or Node built-ins', () => {
    expect(internal('src/renderer/a.ts', 'src/main/db.ts')[0].message).toMatch(/renderer-no-main/);
    expect(external('src/renderer/a.ts', 'electron')[0].message).toMatch(/renderer-sandbox/);
    expect(external('src/renderer/a.ts', 'node:fs')[0].message).toMatch(/renderer-sandbox/);
    expect(internal('src/renderer/a.ts', 'src/shared/dates.ts')).toEqual([]);
    expect(external('src/renderer/a.ts', 'react')).toEqual([]);
  });
  it('main may not import the renderer; preload imports only electron, shared and itself', () => {
    expect(internal('src/main/a.ts', 'src/renderer/app.ts')[0].message).toMatch(/main-no-renderer/);
    expect(external('src/main/a.ts', 'fs')).toEqual([]);
    expect(external('src/preload/p.ts', 'electron')).toEqual([]);
    expect(internal('src/preload/p.ts', 'src/shared/ipc/api.ts')).toEqual([]);
    expect(internal('src/preload/p.ts', 'src/preload/print.ts')).toEqual([]);
    expect(external('src/preload/p.ts', 'fs')[0].message).toMatch(/preload-minimal/);
    expect(internal('src/preload/p.ts', 'src/main/db.ts')[0].message).toMatch(/preload-minimal/);
  });
  it('a boundary violation that is not in the baseline fails, and one that was fixed must be removed', () => {
    const now = external('src/shared/x.ts', 'fs');
    expect(checkBoundaryBaseline(now, [])[0]).toMatch(/Fix:/);
    expect(checkBoundaryBaseline(now, [now[0].key])).toEqual([]);
    expect(checkBoundaryBaseline([], [now[0].key])[0]).toMatch(/Remove from baseline/);
  });
});

describe('architecture rules bite: FSD layering (in-memory file graph)', () => {
  const R = 'src/renderer';
  const between = (from: string, spec: string, target: string, kind: ImportKind = 'value'): string[] =>
    checkFsd([node(from, [imp(spec, kind, target)]), node(target)]).map(violation => violation.message);
  it('allows downward imports through the public API, and anything inside one slice', () => {
    expect(between(`${R}/pages/a/ui/A.tsx`, '../../../widgets/w', `${R}/widgets/w/index.ts`)).toEqual([]);
    expect(between(`${R}/pages/a/ui/A.tsx`, '../../../shared/ui/Button', `${R}/shared/ui/Button.tsx`)).toEqual([]);
    expect(between(`${R}/app/Root.tsx`, '../pages/a', `${R}/pages/a/index.ts`)).toEqual([]);
    expect(between(`${R}/widgets/w/ui/W.tsx`, '../model/view', `${R}/widgets/w/model/view.ts`)).toEqual([]);
    expect(between(`${R}/shared/ui/A.tsx`, './B', `${R}/shared/lib/B.ts`)).toEqual([]);
    expect(between(`${R}/pages/a/index.ts`, '../../entities/person', `${R}/entities/person/index.tsx`)).toEqual([]);
    expect(between('src/renderer/old.ts', './pages/a/ui/x', `${R}/pages/a/ui/x.ts`)).toEqual([]);
  });
  it('fails an upward import, including shared importing anything above it', () => {
    expect(between(`${R}/widgets/w/index.ts`, '../../pages/a', `${R}/pages/a/index.ts`)[0]).toMatch(/fsd-downward/);
    const up = between(`${R}/shared/ui/A.tsx`, '../../entities/person', `${R}/entities/person/index.ts`);
    expect(up[0]).toMatch(/fsd-downward/);
    expect(between(`${R}/entities/e/index.ts`, '../../app/store', `${R}/app/store.ts`)[0]).toMatch(/fsd-downward/);
  });
  it('fails an import between two slices of the same layer (pages/a -> pages/b), also type-only and dynamic', () => {
    const msg = between(`${R}/pages/a/ui/A.tsx`, '../../b', `${R}/pages/b/index.ts`);
    expect(msg[0]).toMatch(/pages\/a.*pages\/b.*fsd-no-cross-slice/);
    expect(between(`${R}/features/f/index.ts`, '../g', `${R}/features/g/index.ts`, 'type')).toHaveLength(1);
    expect(between(`${R}/features/f/index.ts`, '../g', `${R}/features/g/index.ts`, 'dynamic')).toHaveLength(1);
  });
  it('fails a deep import and says which public path to use', () => {
    const msg = between(`${R}/pages/a/ui/A.tsx`, '../../../widgets/x/ui/y', `${R}/widgets/x/ui/y.tsx`);
    expect(msg[0]).toMatch(/fsd-public-api/);
    expect(msg[0]).toContain("import from '../../../widgets/x' instead of '../../../widgets/x/ui/y'");
  });
});

describe('architecture rules bite: size and style ratchets', () => {
  const rule = FILE_TEXT(FILE_LINE_LIMIT);
  it('a new oversize file fails, a grown one fails, a fixed one must leave the baseline', () => {
    expect(checkCounts({ 'src/a.ts': 401 }, {}, rule)[0]).toMatch(/src\/a\.ts has 401 lines.*not in the baseline/);
    expect(checkCounts({ 'src/a.ts': 451 }, { 'src/a.ts': 450 }, rule)[0]).toMatch(/grew from 450 to 451/);
    expect(checkCounts({ 'src/a.ts': 450 }, { 'src/a.ts': 450 }, rule)).toEqual([]);
    expect(checkCounts({}, { 'src/a.ts': 450 }, rule)[0]).toMatch(/Remove from baseline/);
    expect(checkCounts({ 'src/a.ts': 420 }, { 'src/a.ts': 450 }, rule)[0]).toMatch(/Lower the baseline/);
  });
  it('the scanner counts forEach, any, lines and named functions (80, or 150 for a screen component)', () => {
    const body = (n: number): string => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`).join('\n');
    const text = [
      `export function big(items: any[]) {\n${body(90)}\n  items.forEach(x => x);\n  items?.forEach(x => x);\n}`,
      `export const Screen = () => {\n${body(100)}\n};`,
      'export const small = (v: unknown) => [v].map(x => x as any);',
      '// items.forEach(x) in a comment is not a call',
    ].join('\n');
    const plain = scanSource('src/shared/new.ts', text);
    expect(plain.forEach).toBe(2);
    expect(plain.anyCount).toBe(2);
    expect(oversizeFunctions([plain])).toEqual({ 'src/shared/new.ts::big': 94, 'src/shared/new.ts::Screen': 102 });
    const screen = scanSource('src/renderer/screens/new.ts', text);
    expect(oversizeFunctions([screen])).toEqual({ 'src/renderer/screens/new.ts::big': 94 });
    expect(scanSource('src/x.ts', 'a\nb\n').lines).toBe(2);
  });
  it('the scanner reads multi-line, type-only, re-export, dynamic and import-type edges', () => {
    const text = [
      "import type { A } from './a';", "import { type B } from './b';", "import { c,\n  d } from './c';",
      "export * from './e';", "export type { F } from './f';", "const lazy = () => import('./g');",
      "type H = import('./h').H;",
      "import fs from 'node:fs/promises';", "import x from '@scope/pkg/deep';",
    ].join('\n');
    const scanned = resolveImports([scanSource('src/shared/s.ts', text)])[0];
    const kinds = scanned.imports.map(i => `${i.spec}:${i.kind}:${i.external ?? ''}`);
    expect(kinds).toEqual(['./a:type:', './b:type:', './c:value:', './e:value:', './f:type:', './g:dynamic:',
      './h:type:',
      'node:fs/promises:value:fs', '@scope/pkg/deep:value:@scope/pkg']);
  });
  it('a new file with a forEach or any fails; a bigger count fails', () => {
    expect(checkCounts({ 'src/n.ts': 1 }, {}, styleText('forEach'))[0])
      .toMatch(/src\/n\.ts has 1 forEach\(.*New code must have 0/);
    expect(checkCounts({ 'src/n.ts': 4 }, { 'src/n.ts': 3 }, styleText('any'))[0]).toMatch(/went from 3 to 4/);
  });
});

describe('architecture baseline update guard', () => {
  const base = (over: Partial<Baseline> = {}): Baseline => ({
    _readme: README, cycles: { value: [], withTypes: [] }, boundaries: [], oversizeFiles: { 'src/a.ts': 500 },
    oversizeFunctions: {}, forEach: { 'src/a.ts': 3 }, any: {}, ...over,
  });
  it('refuses on CI, accepts improvements and a pure rename, refuses growth and unpaid new entries', () => {
    expect(planUpdate(base(), base(), { CI: 'true' }).ok).toBe(false);
    expect(planUpdate(null, base(), {}).ok).toBe(true);
    expect(planUpdate(base(), base({ oversizeFiles: { 'src/a.ts': 450 }, forEach: {} }), {}).ok).toBe(true);
    expect(planUpdate(base(), base({ oversizeFiles: { 'src/moved/a.ts': 500 } }), {}).ok).toBe(true);
    expect(planUpdate(base(), base({ oversizeFiles: { 'src/a.ts': 501 } }), {}).ok).toBe(false);
    expect(planUpdate(base(), base({ oversizeFiles: { 'src/a.ts': 500, 'src/b.ts': 401 } }), {}).ok).toBe(false);
    expect(planUpdate(base(), base({ forEach: { 'src/a.ts': 3, 'src/new.ts': 1 } }), {}).ok).toBe(false);
  });
});
