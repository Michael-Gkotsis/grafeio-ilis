// Setup.exe (εγκατάσταση και ενημέρωση) από το φάκελο που έφτιαξε το package:win. Χρειάζεται το makensis (NSIS 3).
// Χρήση: npm run build && npm run package:win [x64|ia32] && npm run package:setup [x64|ia32]   (χωρίς όρισμα: x64)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { walkTree, uninstallScript } from './nsis-uninstall.mjs';

const ARCH = process.argv[2] || 'x64';
if (!['x64', 'ia32'].includes(ARCH)) throw new Error(`Άγνωστη αρχιτεκτονική «${ARCH}»: x64 ή ia32`);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const SRC = path.resolve('release', 'GrafeioIlis');
const MARK = path.join('release', 'GrafeioIlis.arch');

if (!fs.existsSync(path.join(SRC, 'GrafeioIlis.exe'))) throw new Error(`Λείπει το ${path.relative('.', SRC)}. Τρέξε πρώτα: npm run build && npm run package:win -- ${ARCH}`);
const built = fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').trim() : '';
if (built !== ARCH) throw new Error(`Ο φάκελος release/GrafeioIlis είναι φτιαγμένος για ${built || 'άγνωστη αρχιτεκτονική'}, όχι για ${ARCH}. Τρέξε πρώτα: npm run package:win -- ${ARCH}`);
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error(`Η έκδοση «${pkg.version}» πρέπει να είναι της μορφής 0.1.17`);
// data\ και templates\ είναι του χρήστη: αν μπουν στο πακέτο, η εγκατάσταση θα τα έγραφε πάνω στα δικά του
for (const d of ['data', 'templates']) if (fs.existsSync(path.join(SRC, d))) throw new Error(`Μέσα στο release/GrafeioIlis υπάρχει φάκελος ${d}\\, που δεν πρέπει να μπει στο Setup (θα έγραφε πάνω στα δεδομένα του χρήστη).`);

const inc = path.resolve('release', `setup-uninstall-${ARCH}.nsh`);
const BOM = '﻿'; // το NSIS Unicode διαβάζει UTF-8 μόνο με BOM
fs.writeFileSync(inc, BOM + uninstallScript(walkTree(SRC)), 'utf8');

const out = path.resolve('release', `GrafeioIlis-win7-${ARCH}-Setup-${pkg.version}.exe`);
const r = spawnSync('makensis', [
  '-V2', '-WX',
  `-DVERSION=${pkg.version}`, `-DARCH=${ARCH}`, `-DSRC=${SRC}`, `-DOUTFILE=${out}`,
  `-DICON=${path.resolve('build', 'icon.ico')}`, `-DUNINST_INC=${inc}`,
  path.resolve('scripts', 'setup.nsi')
], { stdio: 'inherit', env: { ...process.env, LC_ALL: 'C.UTF-8' } }); // χωρίς UTF-8 το makensis καταρρέει στο «ΔΙΑΒΑΣΕ ΜΕ.txt»
if (r.signal) throw new Error(`Το makensis σταμάτησε απότομα (${r.signal})`);
if (r.error?.code === 'ENOENT') throw new Error('Λείπει το makensis (sudo apt-get install nsis)');
if (r.status !== 0) throw new Error('Το makensis απέτυχε (δες τα μηνύματα παραπάνω)');
console.log('OK:', path.relative('.', out), (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
