// Μέτρηση του UI: χτίζει το bench/ui σε production, το ανοίγει στο Electron της εφαρμογής (--electron, Chromium 108) ή στο
// Chromium του Playwright, και μετρά κάθε οθόνη, καρτέλα και το ξαναζωγράφισμα μετά από εντολή. Χρειάζεται Playwright.
// npm run bench:ui (σε Linux χωρίς οθόνη: xvfb-run -a npm run bench:ui) · --cpu 4 πιο αργός επεξεργαστής · --profile Οπλισμός
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import { build as esbuild } from 'esbuild';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright')); }

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CPU = +arg('cpu', 4), N = +arg('n', 180), DAYS = +arg('days', 120), REPS = +arg('reps', 3), PROF = arg('profile', '');
const cfg = { root: 'bench/ui', base: './', plugins: [react()], logLevel: 'warn', build: { outDir: '../../dist/bench-ui', emptyOutDir: true, target: 'chrome108', minify: !PROF }, preview: { port: 4179 } };
await build(cfg);
// τα δεδομένα χτίζονται εδώ (node), όχι στη σελίδα: η μέτρηση είναι μόνο το UI
await esbuild({ entryPoints: ['bench/state.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/bench-state.cjs', logLevel: 'warning' });
const { benchState } = require(path.resolve('dist/bench-state.cjs'));
const day = new Date(); const END = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
fs.writeFileSync('dist/bench-ui/state.json', JSON.stringify(benchState({ n: N, days: DAYS, end: END })));
const srv = await preview(cfg);
const url = srv.resolvedUrls.local[0];
// --electron: μέσα στο Electron της εφαρμογής (Chromium 108, όπως στο PC της μονάδας)· αλλιώς στο Chromium του Playwright
let browser, page;
if (process.argv.includes('--electron')) {
  const { _electron } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
  browser = await _electron.launch({ executablePath: require('electron'), args: ['bench/ui/electron-main.cjs', '--no-sandbox'], env: { ...process.env, BENCH_URL: url } });
  page = await browser.firstWindow();
} else {
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
}
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const R = {}, D = {};   // D: στοιχεία στη σελίδα
const t0 = Date.now();
if (!process.argv.includes('--electron')) await page.goto(url);
await page.waitForSelector('.sidenav .navbtn');
R['boot ως την πρώτη οθόνη'] = Math.round(await page.evaluate(() => performance.now()));
R['boot: από τα δεδομένα ως την πρώτη οθόνη'] = R['boot ως την πρώτη οθόνη'] - Math.round(await page.evaluate(() => window.__benchData));
// κλικ και αναμονή ως την επόμενη εικόνα (απόδοση React + layout + paint)
const clickMs = sel => page.evaluate(async sel => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return -1;
  const a = performance.now(); el.click();
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  return performance.now() - a;
}, sel);
const metrics = async () => { const { metrics: m } = await cdp.send('Performance.getMetrics'); const o = {}; for (const x of m) if (['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration', 'Nodes', 'LayoutCount', 'RecalcStyleCount'].includes(x.name)) o[x.name] = x.value; return o; };
const med = xs => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
// --profile Οπλισμός: ποιες συναρτήσεις τρώνε τον χρόνο όταν ανοίγει η οθόνη (self time, και συνολικός)
if (PROF) {
  const i = await page.$$eval('.sidenav .navbtn:not(.sidenav__toggle)', (els, n) => els.findIndex(e => (e.querySelector('.navbtn__lbl')?.textContent || '') === n), PROF.split('>')[0]);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await cdp.send('Performance.enable'); const m0 = await metrics();
  if (PROF === 'boot') { await page.reload(); await page.waitForSelector('.sidenav .navbtn'); console.log('boot ms', await page.evaluate(() => performance.now() - window.__benchData)); }
  else console.log('ms', await clickMs(`.sidenav .navbtn:nth-of-type(${i + 1})`));
  const m1 = await metrics(); console.log(Object.fromEntries(Object.keys(m1).map(k => [k, Math.round((m1[k] - m0[k]) * (k.endsWith('Count') || k === 'Nodes' ? 1 : 1000))])));
  if (PROF.includes('>')) { const tab = PROF.split('>')[1]; console.log('tab ms', await page.evaluate(async t => { const el = [...document.querySelectorAll('.main [role=tab]')].find(e => e.textContent.startsWith(t)); const a = performance.now(); el.click(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return performance.now() - a; }, tab)); }
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map(); const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const tot = new Map();
  profile.samples.forEach((id, k) => {
    const dt = (profile.timeDeltas[k + 1] ?? 0) / 1000; const n = byId.get(id);
    const key = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + (n.callFrame.lineNumber + 1);
    self.set(key, (self.get(key) || 0) + dt);
    const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const m = byId.get(x); const kk = m.callFrame.functionName + ' ' + m.callFrame.url.split('/').pop() + ':' + (m.callFrame.lineNumber + 1); if (seen.has(kk)) continue; seen.add(kk); tot.set(kk, (tot.get(kk) || 0) + dt); }
  });
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, v]) => Math.round(v).toString().padStart(7) + '  ' + f).join('\n');
  const who = process.env.WHO; if (who) { const par = new Map(); profile.samples.forEach((id, k) => { const n = byId.get(id); if (n.callFrame.functionName !== who) return; const dt = (profile.timeDeltas[k + 1] ?? 0) / 1000; const chain = []; for (let x = parent.get(id); x != null && chain.length < 6; x = parent.get(x)) { const m = byId.get(x); chain.push(m.callFrame.functionName + ':' + (m.callFrame.lineNumber + 1)); } const kk = chain.join(' < '); par.set(kk, (par.get(kk) || 0) + dt); }); console.log('--- callers of ' + who + '\n' + top(par, 8)); }
  console.log('--- self\n' + top(self, 25) + '\n--- total\n' + top(tot, 45));
  await browser.close(); srv.httpServer.close(); process.exit(0);
}
const navs = await page.$$eval('.sidenav .navbtn:not(.sidenav__toggle)', els => els.map((e, i) => [i, e.querySelector('.navbtn__lbl')?.textContent || '']));
for (const [i, name] of navs) {
  const sel = `.sidenav .navbtn:nth-of-type(${i + 1})`;
  const xs = [];
  for (let r = 0; r < REPS; r++) { await clickMs('.sidenav .navbtn:nth-of-type(1)'); xs.push(await clickMs(sel)); }
  R['οθόνη ' + name] = med(xs); D['οθόνη ' + name] = await page.evaluate(() => document.getElementsByTagName('*').length);
  // καρτέλες της οθόνης
  const tabs = await page.$$eval('.main [role=tab]', els => els.map(e => e.textContent));
  for (let j = 0; j < tabs.length; j++) {
    const ts = `.main [role=tab]:nth-of-type(${j + 1})`;
    const ys = []; for (let r = 0; r < REPS; r++) { await clickMs(`.main [role=tab]:nth-of-type(${((j + 1) % tabs.length) + 1})`); ys.push(await clickMs(ts)); }
    R['  ' + name + ' › ' + tabs[j].replace(/\s*\(\d+\)/, '')] = med(ys); D['  ' + name + ' › ' + tabs[j].replace(/\s*\(\d+\)/, '')] = await page.evaluate(() => document.getElementsByTagName('*').length);
  }
}
// μετά από μια εντολή: η οθόνη ξαναζωγραφίζεται με το νέο κομμάτι της κατάστασης (Ctrl+Z στο bench «αγγίζει» το κλειδί)
const after = async (navIdx, key, tab) => {
  await clickMs(`.sidenav .navbtn:nth-of-type(${navIdx})`);
  if (tab) await page.evaluate(t => [...document.querySelectorAll('.main [role=tab]')].find(e => e.textContent.startsWith(t))?.click(), tab);
  await page.waitForTimeout(300);
  const xs = [];
  for (let r = 0; r < REPS; r++) xs.push(await page.evaluate(async key => {
    window.__benchTouch = key; const a = performance.now();
    const p = window.api.undo; let done; const w = new Promise(r => (done = r));
    window.api.undo = async (...x) => { const res = await p(...x); setTimeout(done, 0); return res; };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await w; window.api.undo = p;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - a;
  }, key));
  return med(xs);
};
const navIdx = name => navs.find(([, n]) => n === name)?.[0] + 1;
for (const [scr, key, tab] of [['Σήμερα', 'statuses'], ['Δυναμολόγιο', 'people'], ['Υπηρεσίες', 'guards', 'Θέσεις'], ['Υπηρεσίες', 'guards', 'Έλεγχος'], ['Υπηρεσίες', 'guards', 'Ποιος'], ['Εξοδούχοι', 'statuses'], ['ΗΚΑΙ', 'statuses'], ['Οπλισμός', 'people', 'Όπλα']])
  R['μετά από εντολή (' + key + '): ' + scr + (tab ? ' › ' + tab : '')] = await after(navIdx(scr), key, tab);
// αναζήτηση στο Δυναμολόγιο: ένα γράμμα
await clickMs('.sidenav .navbtn:nth-of-type(2)');
const typing = await page.evaluate(async () => {
  const el = document.querySelector('.main input[type="search"]'); if (!el) return -1;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const xs = [];
  for (const v of ['Δ', 'ΔΟ', 'ΔΟΚ', '', 'Π', '']) {
    const a = performance.now(); setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); xs.push(performance.now() - a);
  }
  return xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
});
R['Δυναμολόγιο: πληκτρολόγηση στην αναζήτηση'] = Math.round(typing);
R['σφάλματα σελίδας'] = errors.length;
const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
R['μνήμη JS (MB)'] = heap;
await browser.close(); srv.httpServer.close();
if (process.env.JSON) console.log(JSON.stringify({ R, D }));
else { console.log('CPU x' + CPU + ', ' + N + ' άτομα, ' + DAYS + ' μέρες'); for (const [k, v] of Object.entries(R)) console.log(k.padEnd(56), String(v).padStart(7), D[k] != null ? String(D[k]).padStart(7) + ' στοιχεία' : ''); if (errors.length) console.log(errors.slice(0, 5)); }
