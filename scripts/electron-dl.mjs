// Κοινό για τα πακέτα Linux και macOS: κατεβάζει το επίσημο Electron 22 και ελέγχει το SHA256 με το SHASUMS256.txt
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const EV = '22.3.27';
const BASE = `https://github.com/electron/electron/releases/download/v${EV}/`;
const CACHE = '.cache';

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Λήψη ${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// platform: 'linux' | 'darwin', arch: 'x64' | 'arm64'. Επιστρέφει τη διαδρομή του zip.
export async function electronZip(platform, arch) {
  const name = `electron-v${EV}-${platform}-${arch}.zip`;
  fs.mkdirSync(CACHE, { recursive: true });
  const zipPath = path.join(CACHE, name);
  if (!fs.existsSync(zipPath)) {
    console.log('Λήψη', name);
    await download(BASE + name, zipPath + '.part');
    fs.renameSync(zipPath + '.part', zipPath);
  }
  const sums = path.join(CACHE, `SHASUMS256-${EV}.txt`);
  if (!fs.existsSync(sums)) await download(BASE + 'SHASUMS256.txt', sums);
  const want = fs.readFileSync(sums, 'utf8').split('\n').find(l => l.endsWith('*' + name) || l.endsWith(' ' + name))?.split(' ')[0];
  const got = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  if (!want || want !== got) throw new Error(`Λάθος SHA256 για ${name}. Σβήσε το ${CACHE}/ και ξαναδοκίμασε.`);
  return zipPath;
}

// Η εφαρμογή: μόνο ό,τι χρειάζεται στην εκτέλεση (όλα είναι bundled στο dist/)
export function copyApp(pkg, appDir) {
  fs.mkdirSync(appDir, { recursive: true });
  const runtimePkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main };
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));
  fs.cpSync('dist', path.join(appDir, 'dist'), { recursive: true });
  fs.cpSync('templates', path.join(appDir, 'templates'), { recursive: true });
}
