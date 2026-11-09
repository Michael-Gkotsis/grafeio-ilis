// Collects the performance baseline into one JSON (the format bench/compare.mjs reads).
// Does: builds the app, measures dist/ sizes, runs bench, bench:full (+ peak RSS), bench:reports, bench:ui and
// bench:ui:reports N times each and keeps every run plus min/median/max per metric.
// Does NOT: change any bench or app code. Needs Electron (npm i downloads it) and, on Linux without a screen, xvfb-run.
// Usage: node bench/collect.mjs [--runs 3] [--out bench/baseline/phase0.json] [--only bench,full,reports,ui,uireports]
//   Numbers are only comparable on a similar machine: the JSON records cpu, cores, RAM, node and the git commit.
import { spawn, spawnSync } from 'child_process';
import { gzipSync } from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 3);
const OUT = arg('out', 'bench/baseline/phase0.json');
const ONLY = new Set(arg('only', 'bench,full,reports,ui,uireports').split(','));
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = x => Math.round(x * 100) / 100;

/** metrics: name -> { unit, kind: 'time' | 'size' | 'count', how, runs: number[] } */
const metrics = {};
const add = (name, unit, kind, how, value) => {
  const m = (metrics[name] ??= { unit, kind, how, runs: [] });
  m.runs.push(round(value));
};
// the same metric name twice in one output (e.g. a label repeated) gets #2, #3 so runs stay aligned
const uniq = () => { const seen = new Map(); return n => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c > 1 ? `${n} #${c}` : n; }; };

const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, FORCE_COLOR: '0', ...env } });
const xvfb = (cmd, args) => (process.env.DISPLAY || process.platform !== 'linux' ? [cmd, args] : ['xvfb-run', ['-a', cmd, ...args]]);

// --- parsers: one per bench output format ---
const parseBench = text => {
  const u = uniq();
  for (const line of text.split('\n')) {
    const day = /^day (\d+): db (\d+) KB, ipc autofill ([\d.]+) KB, ipc outs ([\d.]+) KB \| (.*)$/.exec(line);
    if (day) {
      add(`bench/day ${day[1]}: db KB`, 'KB', 'size', 'npm run bench', +day[2]);
      for (const part of day[5].split(', ')) {
        const p = /^(.+?) ([\d.]+) ms$/.exec(part);
        if (p) add(`bench/day ${day[1]}: ${p[1]}`, 'ms', 'time', 'npm run bench', +p[2]);
      }
      continue;
    }
    const boot = /^boot \(full\) payload KB (\d+) serialize ms ([\d.]+)/.exec(line);
    if (boot) {
      add('bench/boot (full) payload KB', 'KB', 'size', 'npm run bench', +boot[1]);
      add('bench/boot (full) serialize', 'ms', 'time', 'npm run bench', +boot[2]);
      continue;
    }
    const a = /^(.+?) ms ([\d.]+)$/.exec(line);
    if (a) { add('bench/' + u(a[1]), 'ms', 'time', 'npm run bench', +a[2]); continue; }
    const b = /^(.+?) KB (\d+)$/.exec(line);
    if (b) add('bench/' + u(b[1] + ' KB'), 'KB', 'size', 'npm run bench', +b[2]);
  }
};
const parseMs = (prefix, how) => text => {
  const u = uniq();
  for (const line of text.split('\n')) {
    const m = /^(\S.*?)\s+([\d.]+) ms$/.exec(line);
    if (m) add(`${prefix}/${u(m[1])}`, 'ms', 'time', how, +m[2]);
  }
};
const parseUiReports = text => {
  const u = uniq();
  for (const line of text.split('\n')) {
    const m = /^(\S.*?)\s+(\d+) ms js\/layout\/style/.exec(line);
    if (m) add(`ui-reports/${u(m[1])}`, 'ms', 'time', 'npm run bench:ui:reports (Electron, CPU x4, 300 people)', +m[2]);
  }
};
const parseUi = text => {
  const json = text.split('\n').reverse().find(l => l.startsWith('{"R"'));
  if (!json) throw new Error('bench:ui printed no JSON');
  for (const [k, v] of Object.entries(JSON.parse(json).R)) {
    if (v < 0) continue; // -1 = tab/input not found on this screen
    const isHeap = k.startsWith('μνήμη JS');
    const kind = k === 'σφάλματα σελίδας' ? 'count' : isHeap ? 'size' : 'time';
    add(`ui/${k.trim()}`, isHeap ? 'MB' : kind === 'count' ? 'n' : 'ms', kind, 'npm run bench:ui (Electron, CPU x4, 180 people)', v);
  }
};

// --- peak RSS of a child: poll VmHWM (kernel high-water mark) so no bench code has to change ---
const runWithPeakRss = (cmd, args) => new Promise(resolve => {
  const child = spawn(cmd, args, { env: { ...process.env, FORCE_COLOR: '0' } });
  let out = '', hwmKb = 0;
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const timer = setInterval(() => {
    try {
      const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${child.pid}/status`, 'utf8'));
      if (m) hwmKb = Math.max(hwmKb, +m[1]);
    } catch { /* process already gone */ }
  }, 20);
  child.on('close', () => { clearInterval(timer); resolve({ out, rssMb: hwmKb / 1024 }); });
});

// --- bundle sizes of the built app ---
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const bundleFiles = () => ['dist/main', 'dist/preload', 'dist/renderer'].flatMap(walk).map(f => {
  const buf = fs.readFileSync(f);
  return { file: f, raw: buf.length, gzip: gzipSync(buf).length };
});
const eagerFiles = () => {
  const html = fs.readFileSync('dist/renderer/index.html', 'utf8');
  return [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map(m => 'dist/renderer/' + m[1]);
};

const machine = () => ({
  cpu: os.cpus()[0]?.model.trim(), cores: os.cpus().length, ramMb: Math.round(os.totalmem() / 1048576),
  node: process.version, os: `${os.type()} ${os.release()}`, electron: JSON.parse(fs.readFileSync('node_modules/electron/package.json', 'utf8')).version,
});

const main = async () => {
  const commit = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const dirty = run('git', ['status', '--porcelain', '--', 'src', 'templates']).stdout.trim() !== '';
  console.error('build...');
  const built = run('node', ['scripts/build.mjs']);
  if (built.status !== 0) throw new Error('build failed\n' + built.stderr);
  run('npx', ['esbuild', 'bench/full.ts', '--bundle', '--platform=node', '--target=node16', '--outfile=dist/bench-full.js', '--log-level=warning', '--external:electron']);
  const files = bundleFiles();
  const eager = eagerFiles();
  const eagerJs = files.filter(f => eager.includes(f.file) && f.file.endsWith('.js'));
  const eagerAll = files.filter(f => eager.includes(f.file));
  const sum = (xs, k) => xs.reduce((s, f) => s + f[k], 0);
  const sizeOf = (name, xs, how) => { add(name + ' (raw)', 'KB', 'size', how, sum(xs, 'raw') / 1024); add(name + ' (gzip)', 'KB', 'size', how, sum(xs, 'gzip') / 1024); };
  sizeOf('bundle/renderer eager JS', eagerJs, 'dist/renderer/index.html: script tags, no modulepreload');
  sizeOf('bundle/renderer eager JS+CSS', eagerAll, 'dist/renderer/index.html: script and stylesheet tags');
  for (const area of ['renderer', 'main', 'preload']) sizeOf(`bundle/${area} total`, files.filter(f => f.file.startsWith(`dist/${area}/`)), `sum of dist/${area}/`);

  const steps = [
    ['bench', () => { const r = run('npm', ['run', 'bench']); parseBench(r.stdout); }],
    ['full', async () => {
      // the bench is run directly (not through npm) so the RSS belongs to the bench process itself
      const r = await runWithPeakRss('node', ['dist/bench-full.js']);
      parseMs('full', 'npm run bench:full (node, 180 people)')(r.out);
      add('memory/bench:full peak RSS', 'MB', 'size', 'VmHWM of node dist/bench-full.js, polled every 20 ms', r.rssMb);
    }],
    ['reports', () => parseMs('reports', 'npm run bench:reports')(run('npm', ['run', 'bench:reports']).stdout)],
    ['ui', () => { const [c, a] = xvfb('npm', ['run', 'bench:ui']); parseUi(run(c, a, { JSON: '1' }).stdout); }],
    ['uireports', () => { const [c, a] = xvfb('npm', ['run', 'bench:ui:reports']); parseUiReports(run(c, a).stdout); }],
  ];
  for (let i = 0; i < RUNS; i++) {
    for (const [name, fn] of steps) {
      if (!ONLY.has(name)) continue;
      console.error(`run ${i + 1}/${RUNS}: ${name}`);
      await fn();
    }
  }
  const out = {
    format: 1, commit, appCodeDirty: dirty, date: new Date().toISOString(), runs: RUNS, machine: machine(),
    bundleFiles: files.map(f => ({ file: f.file, rawBytes: f.raw, gzipBytes: f.gzip, eager: eager.includes(f.file) })),
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, m]) => [k, {
      unit: m.unit, kind: m.kind, how: m.how, runs: m.runs, median: round(median(m.runs)), min: Math.min(...m.runs), max: Math.max(...m.runs),
    }])),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.error(`wrote ${OUT}: ${Object.keys(out.metrics).length} metrics`);
};
await main();
