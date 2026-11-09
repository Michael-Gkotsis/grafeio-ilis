// Browser DOM + computed-style diff of the renderer against a base git ref (default origin/rewrite).
//
// Purpose: prove "no visible change" for structural renderer PRs and CSS PRs. Builds the CURRENT tree and the BASE ref
//   (git worktree) the same way, serves both with vite preview, walks every screen, tab and click-opened dialog in
//   light and dark theme at 1366x768 (+ 1024x768 and a phone width), captures the normalised DOM, the computed style
//   and the bounding box of every element, and compares base against current.
// Does NOT: run in `npm test` or CI (needs a browser), change anything under src/, or keep baselines on disk. There is
//   no --update: both sides are always rebuilt and compared directly, so there is no stored baseline that could go stale.
// Why: the SSR snapshots (test/screens-*.test.ts) cannot see CSS, dialogs opened by a click, local-state tabs or data
//   loaded by effects (test/__snapshots__/screens/COVERAGE.md).
// Output: dist/styles-diff/report.md and report.json (gitignored). Exit code 1 if anything differs, 0 if identical.
// Run: node bench/ui/styles-diff.mjs [--base <git-ref>] [--only <group text>] [--runs 1366-light,1366-dark,1024-light,phone] [--jobs 2]
//   Needs Playwright (npm i -D playwright is NOT a dependency; it is preinstalled locally). Takes a few minutes.
import { createRequire } from 'module';
import path from 'path';
import { addWorktree, buildStateJson, buildTree, resolveRef, serve } from './styles-build.mjs';
import { openContext, Session } from './styles-kit.mjs';
import { compareRun, printBad, writeReport } from './styles-report.mjs';
import { GROUPS } from './styles-walk.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright')); }

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = process.cwd();
const JOBS = +arg('jobs', 2);
const OUT = path.join(ROOT, 'dist', 'styles-diff');
const RUNS = {
  '1366-light': { width: 1366, height: 768, theme: 'light' },
  '1366-dark': { width: 1366, height: 768, theme: 'dark' },
  '1024-light': { width: 1024, height: 768, theme: 'light' },
  phone: { width: 600, height: 800, theme: 'light', phone: true }
};

/** Walks every group of one run on one side. @returns {{ out: object, errors: string[] }} */
async function walkSide(browser, url, spec, only) {
  const context = await openContext(browser, spec);
  const out = {}, errors = [];
  const groups = GROUPS.filter(g => (spec.phone ? g.phone || g.phoneOnly : !g.phoneOnly) && (!only || g.name.includes(only)));
  for (const g of groups) {
    const session = new Session(context, url, g.name, out, errors);
    await session.start();
    const t = Date.now();
    try { await g.run(session); } catch (e) { out[`${g.name} › (walk failed)`] = { skipped: String(e.message).split('\n')[0] }; }
    await session.stop();
    if (process.env.STYLES_DEBUG) console.log(`  group ${g.name}: ${Date.now() - t} ms`);
  }
  await context.close();
  return { out, errors };
}

async function main() {
  const base = arg('base', 'origin/rewrite'), only = arg('only', ''), runNames = arg('runs', Object.keys(RUNS).join(',')).split(',');
  const t0 = Date.now(), lap = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);
  const hash = resolveRef(ROOT, base);
  const tree = addWorktree(ROOT, hash);   // removed in finally, also when a build or the walk fails
  const servers = [];
  let browser;
  try {
    await buildStateJson(ROOT, path.join(OUT, 'state.json'));
    await buildTree(ROOT, path.join(OUT, 'cur'), ROOT, path.join(OUT, 'state.json'));
    await buildTree(tree.dir, path.join(OUT, 'base'), ROOT, path.join(OUT, 'state.json'));
    lap(`built current and base ${base} (${hash.slice(0, 8)})`);
    servers.push(await serve(ROOT, path.join(OUT, 'cur'), 4181), await serve(tree.dir, path.join(OUT, 'base'), 4182));
    browser = await chromium.launch();
    const rows = [], notes = [], errs = [];
    const runOne = async name => {
      const spec = RUNS[name];
      const [b, c] = await Promise.all([walkSide(browser, servers[1].url, spec, only), walkSide(browser, servers[0].url, spec, only)]);
      const cmp = compareRun(name, b.out, c.out);
      lap(`${name}: ${cmp.rows.length} states, ${cmp.total} differences`);
      return { cmp, errs: [...b.errors.map(e => `BASE ${name} ${e}`), ...c.errors.map(e => `CURRENT ${name} ${e}`)] };
    };
    // JOBS runs at a time (each run drives two pages, base and current): 2 jobs = 4 pages on a 4-core machine
    const results = [];
    for (let i = 0; i < runNames.length; i += JOBS) results.push(...await Promise.all(runNames.slice(i, i + JOBS).map(runOne)));
    results.map(r => { rows.push(...r.cmp.rows); notes.push(...r.cmp.rows.filter(x => x.skipped).map(x => `${x.name}: ${x.skipped}`)); errs.push(...r.errs); });
    const bad = writeReport(OUT, { base, hash, states: rows.length }, rows, notes);
    printBad(bad);
    errs.slice(0, 10).map(e => console.log('page error: ' + e));
    console.log(`\n${rows.length} states compared, ${bad.length} different, ${notes.length} not openable (same on both sides). Report: dist/styles-diff/report.md`);
    lap('done');
    process.exitCode = bad.length ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    servers.map(s => s.close());
    tree.remove();
  }
}
main().catch(e => { console.error(e); process.exit(2); });
