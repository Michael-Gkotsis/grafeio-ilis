// Περνά όλες τις οθόνες και καρτέλες της εφαρμογής στο Electron της εφαρμογής (Chromium 108) σε 1024×768 με τρεις ρυθμίσεις δεδομένων
// (κέντρο, πλήρη δεδομένα, μονάδα με πλήρη δεδομένα) και λίγα άτομα: γράφει σφάλματα κονσόλας, σελίδα που σκρολάρει πλάγια και κουμπιά
// ή καρτέλες που κόβονται. Έξοδος 1 αν βρεθεί κάτι. Χρήση: xvfb-run -a node bench/ui/screens.mjs  (ΠΡΟΣ ΤΑ ΕΞΩ: --size 1366x768)
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import { build as esbuild } from 'esbuild';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('size', '1024x768').split('x').map(Number);
const cfg = { root: 'bench/ui', base: './', plugins: [react()], logLevel: 'warn', build: { outDir: '../../dist/bench-ui', emptyOutDir: true, target: 'chrome108', minify: true }, preview: { port: 4181 } };
await build(cfg);
await esbuild({ entryPoints: ['bench/state.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/bench-state.cjs', logLevel: 'warning' });
const { benchState } = require(path.resolve('dist/bench-state.cjs'));
const { _electron } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const today = new Date(); const END = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
const CASES = [['κέντρο, 180 άτομα', { n: 180, days: 120 }], ['πλήρη δεδομένα', { n: 180, days: 120, full: true }], ['μονάδα, πλήρη δεδομένα', { n: 180, days: 120, full: true, unit: true }], ['3 άτομα', { n: 3, days: 20 }], ['40 άτομα, μονάδα', { n: 40, days: 60, unit: true }]];
const found = [];
for (const [name, opts] of CASES) {
  fs.writeFileSync('dist/bench-ui/state.json', JSON.stringify(benchState({ ...opts, end: END })));
  const srv = await preview(cfg); const url = srv.resolvedUrls.local[0];
  const app = await _electron.launch({ executablePath: require('electron'), args: ['bench/ui/electron-main.cjs', '--no-sandbox'], env: { ...process.env, BENCH_URL: url, BENCH_SIZE: W + 'x' + H } });
  const page = await app.firstWindow(); const errs = [];
  page.on('pageerror', e => errs.push('σφάλμα σελίδας: ' + String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('κονσόλα: ' + m.text().slice(0, 200)); });
  await page.waitForSelector('.sidenav .navbtn'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.mockchip')?.remove());   // «Δοκιμαστικό»: μόνο στη δοκιμή του browser, όχι στην εφαρμογή
  const bad = () => page.evaluate(() => {
    const out = []; const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push('η σελίδα σκρολάρει πλάγια (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
    const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    for (const el of document.querySelectorAll('button, [role=tab], a.btn, .btn')) {
      if (!visible(el) || el.closest('[hidden], [aria-hidden=true]')) continue;
      const r = el.getBoundingClientRect(); const txt = (el.textContent || '').trim().slice(0, 30) || el.getAttribute('aria-label') || el.className;
      // κόβεται από γονέα με overflow που δεν σκρολάρει, ή από το παράθυρο
      let cut = r.right > vw + 1 || r.left < -1; let p = el.parentElement;
      for (; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p); const pr = p.getBoundingClientRect();
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { cut = false; break; }
        if (cs.overflowX === 'hidden' && (r.right > pr.right + 1 || r.left < pr.left - 1) && pr.width > 0) { cut = true; break; }
      }
      if (cut) out.push('κουμπί που κόβεται «' + txt + '»');
      // κείμενο κουμπιού που κόβεται (nowrap + overflow hidden)
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') out.push('κείμενο κουμπιού που κόβεται «' + txt + '»');
    }
    return [...new Set(out)];
  });
  const navs = await page.$$eval('.sidenav .navbtn:not(.sidenav__toggle)', els => els.map((e, i) => [i, e.querySelector('.navbtn__lbl')?.textContent || '']));
  let screens = 0, tabsN = 0;
  for (const [i, nav] of navs) {
    await page.evaluate(i => document.querySelectorAll('.sidenav .navbtn:not(.sidenav__toggle)')[i].click(), i); await page.waitForTimeout(250); screens++;
    for (const b of await bad()) found.push(name + ' › ' + nav + ': ' + b);
    const tabs = await page.$$eval('.main [role=tab]', els => els.map(e => e.textContent));
    for (let j = 0; j < tabs.length; j++) {
      await page.evaluate(j => document.querySelectorAll('.main [role=tab]')[j]?.click(), j); await page.waitForTimeout(250); tabsN++;
      for (const b of await bad()) found.push(name + ' › ' + nav + ' › ' + tabs[j].replace(/\s*\(\d+\)/, '') + ': ' + b);
    }
  }
  // μακριά γραμμή μονάδας (Ρυθμίσεις › Μονάδα): η πάνω μπάρα δεν βγαίνει έξω από το παράθυρο και δεν κόβει την «Αναίρεση»
  for (const txt of ['ΙΛΗ ΕΚΠΑΙΔΕΥΣΗΣ ΚΕΤΘ', 'ΤΑΓΜΑ ΕΦΕΔΡΕΙΑΣ ΑΥΛΩΝΑ ΜΕ ΜΑΚΡΥ ΟΝΟΜΑ']) {
    await page.evaluate(x => { document.querySelector('.brand small').textContent = x; }, txt); await page.waitForTimeout(100);
    for (const b of await bad()) found.push(name + ' › μπάρα με «' + txt + '»: ' + b);
  }
  for (const e of new Set(errs)) found.push(name + ': ' + e);
  console.log(name + ': ' + screens + ' οθόνες, ' + tabsN + ' καρτέλες, ' + errs.length + ' σφάλματα κονσόλας');
  await app.close(); srv.httpServer.close();
}
console.log(found.length ? 'ΒΡΕΘΗΚΑΝ:\n' + [...new Set(found)].join('\n') : 'Καμία κόκκινη κονσόλα, κανένα κομμένο κουμπί.');
process.exit(found.length ? 1 : 0);
