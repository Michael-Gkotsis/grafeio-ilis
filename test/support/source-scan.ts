// Path-independent scans of the source text, for the few rules that are about the source itself.
//
// Purpose: one place for "read the renderer source" so a test never hard-codes a file path. A rule says WHAT to find
//   (a tag, a call, an import), never WHERE; the scan walks src/ recursively over .ts, .tsx and .jsx, so moving a screen
//   to pages/<screen>/ui.tsx or turning htm into TSX cannot make a rule pass by looking at a file that no longer exists.
// Does NOT: parse code (regexes over text), judge behaviour (those checks render the screen, see test/support/probe.ts),
//   or follow aliases/dynamic imports (the renderer has none; an import that cannot be resolved throws).
// Why: before Phase 0.4 several tests did `readFileSync('src/renderer/screens/people.ts')`; after a move such a test
//   fails with ENOENT at best and passes without looking at anything at worst.
// Owner layer: test support only. Covering test: test/support/source-scan.test.ts.
import fs from 'fs';
import path from 'path';

export const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');
export const RENDERER_DIR = path.join(SRC_DIR, 'renderer');
/** Source extensions the scans read (the rewrite adds .tsx; .jsx is accepted for the same reason). */
export const SOURCE_EXTS = ['.ts', '.tsx', '.jsx'];

export interface SourceFile { file: string; rel: string; text: string }

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/**
 * All source files under `dir` (default: the whole renderer), recursively, with their text. Fails when there are fewer
 * than `min` files: a scan that finds nothing must never pass.
 * @param min smallest believable file count (the renderer has 40+ files today)
 */
export function readSources(dir: string = RENDERER_DIR, min = 10): SourceFile[] {
  const files = walk(dir).filter(f => SOURCE_EXTS.includes(path.extname(f)) && !f.endsWith('.d.ts'));
  if (files.length < min) throw new Error(`source scan of ${dir} found ${files.length} files (expected at least ${min})`);
  return files.map(file => ({ file, rel: path.relative(dir, file), text: fs.readFileSync(file, 'utf8') }));
}

/** Regex source for a component used as an element: htm `<${Name}` and JSX `<Name`, followed by space, `/` or `>`. */
export const componentTag = (name: string): string => `<(?:\\$\\{${name}\\}|${name})(?=[\\s/>])`;

/** Files whose text declares `export function|const|class <name>`: how a primitive is found without knowing its path. */
export const definersOf = (sources: SourceFile[], name: string): SourceFile[] =>
  sources.filter(s => new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(s.text));

/** Specifiers of static imports and `export ... from` (not `import('...')`, which is how lazy screens load). */
export function staticImports(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const re = /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  return [...code.matchAll(re)].map(m => m[1]);
}

const RESOLVE_TRY = ['', '.ts', '.tsx', '.jsx', '.js', '/index.ts', '/index.tsx', '/index.jsx'];
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;   // packages
  const base = path.resolve(path.dirname(from), spec);
  const hit = RESOLVE_TRY.map(x => base + x).find(f => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) throw new Error(`cannot resolve import '${spec}' from ${from}`);
  return hit;
}

/** The module the HTML page loads first: the `<script type="module" src>` of src/renderer/index.html. */
export function rendererEntry(): string {
  const page = fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
  const src = page.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1] ?? page.match(/<script[^>]*src="([^"]+)"[^>]*type="module"/)?.[1];
  if (!src) throw new Error('index.html has no module script');
  return path.resolve(RENDERER_DIR, src);
}

/**
 * Every file reachable from `entry` through STATIC imports (lazy `import()` screens are not followed): what the browser
 * must read before the first screen appears. Style files are leaves.
 */
export function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!SOURCE_EXTS.includes(path.extname(file))) return;
    for (const spec of staticImports(fs.readFileSync(file, 'utf8'))) {
      const next = resolveImport(file, spec);
      if (next) visit(next);
    }
  };
  visit(entry);
  return seen;
}
