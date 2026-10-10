// Φορητό πακέτο για Windows 7 x64: φάκελος με GrafeioIlis.exe, zip για το USB.
// Electron 22 είναι η τελευταία έκδοση που τρέχει σε Windows 7.
// Χρήση: npm run build && npm run package:win
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const EV = '22.3.27';
const ZIP = `electron-v${EV}-win32-x64.zip`;
const BASE = `https://github.com/electron/electron/releases/download/v${EV}/`;
const CACHE = '.cache';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const OUT = path.join('release', 'GrafeioIlis');

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Λήψη ${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

if (!fs.existsSync('dist/main/main.js')) throw new Error('Τρέξε πρώτα: npm run build');
fs.mkdirSync(CACHE, { recursive: true });
const zipPath = path.join(CACHE, ZIP);
if (!fs.existsSync(zipPath)) {
  console.log('Λήψη', ZIP);
  await download(BASE + ZIP, zipPath + '.part');
  fs.renameSync(zipPath + '.part', zipPath);
}
// έλεγχος SHA256 με το επίσημο SHASUMS256.txt
const sums = path.join(CACHE, `SHASUMS256-${EV}.txt`);
if (!fs.existsSync(sums)) await download(BASE + 'SHASUMS256.txt', sums);
const want = fs.readFileSync(sums, 'utf8').split('\n').find(l => l.endsWith('*' + ZIP) || l.endsWith(' ' + ZIP))?.split(' ')[0];
const got = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
if (!want || want !== got) throw new Error(`Λάθος SHA256 για ${ZIP}. Σβήσε το ${CACHE}/ και ξαναδοκίμασε.`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
execFileSync('unzip', ['-q', zipPath, '-d', OUT]);
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, 'GrafeioIlis.exe'));
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });
fs.rmSync(path.join(OUT, 'LICENSES.chromium.html'), { force: true }); // 8MB, δεν χρειάζεται να τρέξει

// Η εφαρμογή: μόνο ό,τι χρειάζεται στην εκτέλεση (όλα είναι bundled στο dist/)
const app = path.join(OUT, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
const runtimePkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main };
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(runtimePkg, null, 2));
fs.cpSync('dist', path.join(app, 'dist'), { recursive: true });
fs.cpSync('templates', path.join(app, 'templates'), { recursive: true });

fs.writeFileSync(path.join(OUT, 'ΔΙΑΒΑΣΕ ΜΕ.txt'), [
  'Γραφείο Ίλης ' + pkg.version,
  '',
  'Εκκίνηση: διπλό κλικ στο GrafeioIlis.exe. Δεν χρειάζεται internet ούτε εγκατάσταση.',
  'Δεδομένα: φάκελος data\\ δίπλα στο exe (αντίγραφα ασφαλείας στο data\\backups\\).',
  'Δικά σου έντυπα: βάλε froura.xlsx / hkai.xlsx / exodouxoi.xlsx σε φάκελο templates\\ δίπλα στο exe.',
  'Τα Excel βγαίνουν στα Έγγραφα\\Γραφείο Ίλης\\ (αλλάζει από τις Ρυθμίσεις).',
  'Για μεταφορά σε άλλο PC: αντέγραψε όλο τον φάκελο μαζί με το data\\.',
  ''
].join('\r\n'));

const zipOut = path.resolve('release', `GrafeioIlis-win7-x64-${pkg.version}.zip`);
fs.rmSync(zipOut, { force: true });
execFileSync('zip', ['-qr9', zipOut, 'GrafeioIlis'], { cwd: 'release' });
console.log('OK:', path.relative('.', zipOut), (fs.statSync(zipOut).size / 1048576).toFixed(1) + ' MB');
