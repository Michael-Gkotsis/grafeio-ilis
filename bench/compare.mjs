// Compares a new baseline JSON (made by bench/collect.mjs) with bench/baseline/phase0.json.
// Does: prints a delta table (median new vs old) and exits 1 when any timing metric is slower than the threshold.
// Does NOT: judge sizes, memory or counts (they are printed, never fail); it does not run any bench.
// Usage: node bench/compare.mjs <new.json> [--base bench/baseline/phase0.json] [--threshold 5] [--min-abs 2] [--all]
//   --threshold  percent slower that fails (default 5)
//   --min-abs    ignore slowdowns smaller than this many ms (default 2): sub-2 ms timings jump more than 5% by noise alone
//   --all        also print unchanged rows (default: only changed rows beyond 1%)
import fs from 'fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const newPath = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !(all[i - 1] ?? '').startsWith('--'));
if (!newPath) { console.error('usage: node bench/compare.mjs <new.json> [--base file] [--threshold 5] [--min-abs 2] [--all]'); process.exit(2); }
const THRESHOLD = +arg('threshold', 5), MIN_ABS = +arg('min-abs', 2), ALL = process.argv.includes('--all');
const base = JSON.parse(fs.readFileSync(arg('base', 'bench/baseline/phase0.json'), 'utf8'));
const next = JSON.parse(fs.readFileSync(newPath, 'utf8'));

const rows = Object.entries(base.metrics).flatMap(([name, old]) => {
  const now = next.metrics[name];
  if (!now) return [{ name, unit: old.unit, old: old.median, now: null, pct: null, bad: false, missing: true }];
  const pct = old.median === 0 ? 0 : ((now.median - old.median) / old.median) * 100;
  const bad = old.kind === 'time' && pct > THRESHOLD && now.median - old.median >= MIN_ABS;
  return [{ name, unit: old.unit, old: old.median, now: now.median, pct, bad, missing: false }];
});
const shown = rows.filter(r => ALL || r.missing || r.bad || Math.abs(r.pct) > 1);
const fmt = x => (x == null ? '-' : String(x)).padStart(10);
console.log(`baseline ${base.commit.slice(0, 7)} (${base.machine.cpu}, ${base.machine.cores} cores) vs ${newPath}` +
  ` ${next.commit.slice(0, 7)} (${next.machine.cpu}, ${next.machine.cores} cores)`);
if (base.machine.cpu !== next.machine.cpu || base.machine.cores !== next.machine.cores) console.log('WARNING: different machine, deltas are not reliable');
console.log(`${'metric'.padEnd(64)}${'old'.padStart(10)}${'new'.padStart(10)}${'delta %'.padStart(10)}  unit`);
for (const r of shown) {
  const pct = r.pct == null ? 'missing' : (r.pct > 0 ? '+' : '') + r.pct.toFixed(1);
  console.log(`${r.name.slice(0, 63).padEnd(64)}${fmt(r.old)}${fmt(r.now)}${pct.padStart(10)}  ${r.unit}${r.bad ? '  SLOWER' : ''}`);
}
const bad = rows.filter(r => r.bad);
console.log(`\n${rows.length} metrics, ${bad.length} slower than ${THRESHOLD}% (and >= ${MIN_ABS} ms)`);
process.exit(bad.length ? 1 : 0);
