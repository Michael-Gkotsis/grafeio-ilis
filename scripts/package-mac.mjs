// Πακέτο για macOS (Intel x64 ή Apple Silicon arm64): ένα .app μέσα σε zip. Τρέχει ΜΟΝΟ σε macOS (χρειάζεται codesign, iconutil, ditto).
// Δεν έχει πιστοποιητικό Apple (πληρωμένο): η υπογραφή είναι «ad-hoc», οπότε την πρώτη φορά ο χρήστης το ανοίγει από τις Ρυθμίσεις συστήματος.
// Χρήση: npm run build && npm run package:mac [x64|arm64]   (χωρίς όρισμα: x64)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { electronZip, copyApp } from './electron-dl.mjs';

const ARCH = process.argv[2] || 'x64';
if (!['x64', 'arm64'].includes(ARCH)) throw new Error(`Άγνωστη αρχιτεκτονική «${ARCH}»: x64 ή arm64`);
if (process.platform !== 'darwin') throw new Error('Το πακέτο macOS φτιάχνεται μόνο σε macOS (codesign, iconutil)');
if (!fs.existsSync('dist/main/main.js')) throw new Error('Τρέξε πρώτα: npm run build');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const zipPath = await electronZip('darwin', ARCH);

const OUT = path.join('release', `GrafeioIlis-mac-${ARCH}`);
const APP = path.join(OUT, 'GrafeioIlis.app');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
run('ditto', ['-x', '-k', zipPath, OUT]);
fs.renameSync(path.join(OUT, 'Electron.app'), APP);
for (const f of ['LICENSE', 'LICENSES.chromium.html', 'version']) fs.rmSync(path.join(OUT, f), { force: true });
const res = path.join(APP, 'Contents', 'Resources');
fs.rmSync(path.join(res, 'default_app.asar'), { force: true });
copyApp(pkg, path.join(res, 'app'));

// όνομα και έκδοση στο Info.plist
const plist = path.join(APP, 'Contents', 'Info.plist');
const set = (k, v) => run('plutil', ['-replace', k, '-string', v, plist]);
set('CFBundleName', pkg.productName); set('CFBundleDisplayName', pkg.productName);
set('CFBundleShortVersionString', pkg.version); set('CFBundleVersion', pkg.version);
set('CFBundleIdentifier', 'gr.grafeioilis.app');

// εικονίδιο από το build/icon.png (256 px και κάτω)
const set_ = path.join(OUT, 'icon.iconset');
fs.mkdirSync(set_);
for (const [n, px] of [['icon_16x16', 16], ['icon_32x32', 32], ['icon_128x128', 128], ['icon_256x256', 256]]) {
  run('sips', ['-z', String(px), String(px), 'build/icon.png', '--out', path.join(set_, n + '.png')]);
}
run('iconutil', ['-c', 'icns', set_, '-o', path.join(res, 'electron.icns')]);
fs.rmSync(set_, { recursive: true, force: true });

fs.writeFileSync(path.join(OUT, 'ΔΙΑΒΑΣΕ ΜΕ.txt'), [
  'Γραφείο Λοχία ' + pkg.version + ' για macOS (' + (ARCH === 'arm64' ? 'Apple Silicon M1/M2/M3' : 'Intel') + ')',
  '',
  '1. Σύρε το GrafeioIlis.app στο φάκελο Εφαρμογές (Applications).',
  '2. Την πρώτη φορά το macOS δεν το αφήνει να ανοίξει γιατί δεν έχει πληρωμένη υπογραφή Apple.',
  '   Δοκίμασε να το ανοίξεις, μετά: Ρυθμίσεις συστήματος › Απόρρητο και ασφάλεια › κάτω-κάτω «Άνοιγμα ούτως ή άλλως» (Open Anyway).',
  '   (σε παλιότερο macOS: δεξί κλικ στο GrafeioIlis.app › Άνοιγμα.)',
  '   Αν λέει «είναι κατεστραμμένο», άνοιξε το Terminal και γράψε:  xattr -cr /Applications/GrafeioIlis.app',
  '',
  'Δεδομένα: ~/Library/Application Support/Γραφείο Ίλης/data (αντίγραφα ασφαλείας στο backups).',
  'Δικά σου έντυπα: βάλε froura.xlsx / hkai.xlsx / exodouxoi.xlsx στο ~/Library/Application Support/Γραφείο Ίλης/templates.',
  'Τα Excel βγαίνουν στα Έγγραφα/Γραφείο Ίλης (αλλάζει από τις Ρυθμίσεις).',
  ''
].join('\n'));

// ad-hoc υπογραφή: χωρίς αυτή το arm64 δεν ξεκινά καθόλου αφού αλλάξαμε το περιεχόμενο του .app
run('codesign', ['--force', '--deep', '--sign', '-', APP]);

const zipOut = path.resolve('release', `GrafeioIlis-mac-${ARCH}-${pkg.version}.zip`);
fs.rmSync(zipOut, { force: true });
run('ditto', ['-c', '-k', '--keepParent', OUT, zipOut]);
console.log('OK:', path.relative('.', zipOut), (fs.statSync(zipOut).size / 1048576).toFixed(1) + ' MB');
