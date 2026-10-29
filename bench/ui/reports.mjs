// Μέτρηση του «Νέο έντυπο» (Έντυπα): κάθε βήμα και κάθε πλήκτρο, με αργό επεξεργαστή (--cpu 4) στο Electron της εφαρμογής.
// xvfb-run -a node bench/ui/reports.mjs [--cpu 4] [--n 300] [--profile]
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import { build as esbuild } from 'esbuild';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CPU = +arg('cpu', 4), N = +arg('n', 300), PROF = process.argv.includes('--profile');
const cfg = { root: 'bench/ui', base: './', plugins: [react()], logLevel: 'warn', build: { outDir: '../../dist/bench-ui', emptyOutDir: true, target: 'chrome108', minify: !PROF }, preview: { port: 4179 } };
await build(cfg);
await esbuild({ entryPoints: ['bench/state.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/bench-state.cjs', logLevel: 'warning' });
const { benchState } = require(path.resolve('dist/bench-state.cjs'));
const day = new Date(); const END = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
fs.writeFileSync('dist/bench-ui/state.json', JSON.stringify(benchState({ n: N, days: 120, end: END })));
const srv = await preview(cfg); const url = srv.resolvedUrls.local[0];
const { _electron } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const browser = await _electron.launch({ executablePath: require('electron'), args: ['bench/ui/electron-main.cjs', '--no-sandbox'], env: { ...process.env, BENCH_URL: url } });
const page = await browser.firstWindow();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.waitForSelector('.sidenav .navbtn');
const R = {};
// ενέργεια και αναμονή ως την επόμενη εικόνα
await cdp.send('Performance.enable');
const metrics = async () => { const { metrics: m } = await cdp.send('Performance.getMetrics'); const o = {}; for (const x of m) o[x.name] = x.value; return o; };
const M = {};
const time = async (k, f) => {
  const m0 = await metrics();
  await page.evaluate(() => { window.__t0 = performance.now(); });
  await f();
  const ms = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(() => r(performance.now() - window.__t0), 0))));
  const m1 = await metrics();
  (R[k] = R[k] || []).push(Math.round(ms));
  M[k] = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(x => Math.round((m1[x] - m0[x]) * 1000)).join('/') + ' n' + Math.round(m1.Nodes);
};
if (PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
await time('Έντυπα (Ctrl+E)', () => page.keyboard.press('Control+e'));
await page.waitForTimeout(300);
await time('+ Νέο έντυπο', () => page.getByRole('button', { name: '+ Νέο έντυπο' }).first().click());
await time('έτοιμο: Ονομαστική κατάσταση (βήμα 4)', () => page.getByRole('button', { name: /Ονομαστική κατάσταση/ }).first().click());
await page.waitForTimeout(500);
await time('βήμα 3', () => page.locator('.rep-steps button').nth(2).click());
for (let i = 0; i < 3; i++) await time('(κλικ χωρίς αλλαγή: χρόνος του Playwright)', () => page.locator('.rep-steps').click({ position: { x: 2, y: 2 } }));
await page.waitForTimeout(800);
const title = page.getByLabel('Γενικός τίτλος σελίδας', { exact: true });
await title.click();
for (let i = 0; i < 6; i++) await time('πλήκτρο στον τίτλο', () => page.keyboard.type('Α'));
const sel = async (label, text) => { await page.getByLabel(label, { exact: true }).click(); await page.locator('.ui-dd__pop').getByText(text, { exact: false }).first().click(); };
await time('άνοιγμα λίστας στήλης', () => page.getByLabel('Στοιχείο στήλης 2', { exact: true }).click());
await time('διάλεξε Συνδυασμός', () => page.locator('.ui-dd__pop').getByText('Συνδυασμός στοιχείων', { exact: false }).first().click());
await time('στήλη: Ιατρικό τη μέρα', () => sel('Στοιχείο στήλης 3', 'Ιατρικό τη μέρα'));
const head = page.getByLabel('Επικεφαλίδα στήλης 1', { exact: true });
await head.click();
for (let i = 0; i < 4; i++) await time('πλήκτρο σε επικεφαλίδα', () => page.keyboard.type('Β'));
await time('+ Πίνακας', () => page.getByRole('button', { name: '+ Πίνακας', exact: true }).click());
await time('πίνακας 2: Καταστάσεις', () => sel('Ο πίνακας 2 αφορά', 'Καταστάσεις'));
await page.waitForTimeout(1500);
await time('βήμα 4', () => page.getByRole('button', { name: 'Επόμενο' }).click());
await page.waitForTimeout(600);
await time('βήμα 4: πίνακας 1', () => page.locator('.rep-tables').getByRole('button', { name: /^1 ·/ }).click());
const chips = page.locator('.rep-wiz__main [aria-pressed]');
for (let i = 0; i < 3; i++) await time('φίλτρο στο βήμα 4', () => page.locator('.rep-conds .ui-seg button, .rep-conds button').nth(1 + i * 3).click());
await page.waitForTimeout(600);
await time('βήμα 5', () => page.getByRole('button', { name: 'Επόμενο' }).click());
const name = page.locator('#o-name');   // και στη μπάρα πάνω υπάρχει «Όνομα εντύπου» (ίδιο r.name)
await name.click();
for (let i = 0; i < 4; i++) await time('πλήκτρο στο όνομα', () => page.keyboard.type('Γ'));
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const w = Math.max(...Object.keys(R).map(k => k.length));
for (const [k, xs] of Object.entries(R)) console.log(k.padEnd(w), String(med(xs)).padStart(6), 'ms', ('js/layout/style ' + M[k]).padEnd(32), xs.length > 1 ? '(' + xs.join(', ') + ')' : '');
if (PROF) {
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map(); const parent = new Map(); const tot = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const nm = n => n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + (n.callFrame.lineNumber + 1);
  profile.samples.forEach((id, k) => {
    const dt = (profile.timeDeltas[k + 1] ?? 0) / 1000; self.set(nm(byId.get(id)), (self.get(nm(byId.get(id))) || 0) + dt);
    const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const kk = nm(byId.get(x)); if (seen.has(kk)) continue; seen.add(kk); tot.set(kk, (tot.get(kk) || 0) + dt); }
  });
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, v]) => Math.round(v).toString().padStart(7) + '  ' + f).join('\n');
  console.log('--- self\n' + top(self, 25) + '\n--- total\n' + top(tot, 50));
}
if (errors.length) console.log('ERRORS', errors);
await browser.close(); srv.httpServer.close(); process.exit(0);
