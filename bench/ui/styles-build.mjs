// Build and serve helpers of the styles-diff tool (bench/ui/styles-diff.mjs).
//
// Purpose: turn one source tree (the current checkout or a temporary `git worktree` of a base ref) into a served
//   bench UI (vite build of the real renderer with mockApi + benchState data) and give back its URL.
// Does NOT: compare anything, drive the browser, or touch the checkout (the worktree lives under dist/ and is removed).
// Why: both sides of the diff must be built the same way, from their own sources, with identical seeded data.
// Run: not run directly; imported by styles-diff.mjs.
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

/** Fixed seed of the data: same people, same duties, same "today" on both sides (ISODate, local time). */
export const SEED = { n: 60, days: 120, end: '2026-06-10' };

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** Resolves a git ref to a commit hash; throws a readable error when the ref does not exist. */
export function resolveRef(root, ref) {
  try { return git(['rev-parse', '--verify', ref + '^{commit}'], root); }
  catch { throw new Error(`base ref "${ref}" not found (try: git fetch origin rewrite, or pass --base <ref>)`); }
}

/**
 * Creates a detached worktree of `ref` under dist/ with node_modules symlinked from the checkout.
 * @returns {{ dir: string, remove: () => void }} remove() is safe to call twice and never throws.
 */
export function addWorktree(root, ref) {
  const dir = path.join(root, 'dist', 'styles-diff', 'base-tree');
  const remove = () => {
    try { git(['worktree', 'remove', '--force', dir], root); } catch { /* already gone */ }
    fs.rmSync(dir, { recursive: true, force: true });
    try { git(['worktree', 'prune'], root); } catch { /* nothing to prune */ }
  };
  remove();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(['worktree', 'add', '--detach', dir, ref], root);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return { dir, remove };
}

/** Writes the seeded AppState (built with the CURRENT tree's bench/state.ts) so both sides get identical data. */
export async function buildStateJson(root, outFile) {
  const bundle = path.join(root, 'dist', 'styles-diff', 'bench-state.cjs');
  await esbuild({ entryPoints: [path.join(root, 'bench/state.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'warning' });
  delete require.cache[bundle];
  const { benchState } = require(bundle);
  fs.writeFileSync(outFile, JSON.stringify(benchState(SEED)));
}

/** vite build of `<tree>/bench/ui` into `outDir`. A base ref without bench/ui borrows the current tree's one. */
export async function buildTree(tree, outDir, fallbackTree, stateFile) {
  if (!fs.existsSync(path.join(tree, 'bench/ui/main.ts'))) fs.cpSync(path.join(fallbackTree, 'bench/ui'), path.join(tree, 'bench/ui'), { recursive: true });
  await build({
    root: path.join(tree, 'bench/ui'), base: './', plugins: [react()], logLevel: 'warn',
    build: { outDir, emptyOutDir: true, target: 'chrome108', minify: true }
  });
  fs.copyFileSync(stateFile, path.join(outDir, 'state.json'));
}

/** Serves a built folder with vite preview on a fixed port. @returns {{ url: string, close: () => void }} */
export async function serve(tree, outDir, port) {
  const srv = await preview({ root: path.join(tree, 'bench/ui'), logLevel: 'warn', build: { outDir }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  return { url: srv.resolvedUrls.local[0], close: () => srv.httpServer.close() };
}
