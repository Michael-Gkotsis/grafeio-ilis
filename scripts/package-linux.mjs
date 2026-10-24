// Πακέτο .deb για Ubuntu / Debian (64-bit): εγκαθίσταται στο /opt/grafeio-ilis, με εικονίδιο στο μενού εφαρμογών.
// Electron 22 με το δικό του Chromium· δεν χρειάζεται internet ούτε τίποτα άλλο εκτός από τις συνηθισμένες βιβλιοθήκες γραφικών.
// Χρήση: npm run build && npm run package:linux
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { electronZip, copyApp } from './electron-dl.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ID = 'grafeio-ilis';
const STAGE = path.join('release', 'deb');
const OPT = path.join(STAGE, 'opt', ID);

if (!fs.existsSync('dist/main/main.js')) throw new Error('Τρέξε πρώτα: npm run build');
const zipPath = await electronZip('linux', 'x64');

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(OPT, { recursive: true });
execFileSync('unzip', ['-q', zipPath, '-d', OPT]);
fs.renameSync(path.join(OPT, 'electron'), path.join(OPT, ID));
fs.rmSync(path.join(OPT, 'resources', 'default_app.asar'), { force: true });
fs.rmSync(path.join(OPT, 'LICENSES.chromium.html'), { force: true });
copyApp(pkg, path.join(OPT, 'resources', 'app'));

const put = (rel, text, mode) => {
  const f = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  fs.chmodSync(f, mode);
};
fs.mkdirSync(path.join(STAGE, 'usr', 'bin'), { recursive: true });
fs.symlinkSync(`/opt/${ID}/${ID}`, path.join(STAGE, 'usr', 'bin', ID));
fs.mkdirSync(path.join(STAGE, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps'), { recursive: true });
fs.copyFileSync('build/icon.png', path.join(STAGE, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps', `${ID}.png`));
put(`usr/share/applications/${ID}.desktop`, [
  '[Desktop Entry]',
  'Type=Application',
  `Name=${pkg.productName}`,
  `Comment=${pkg.description.split(':')[0]}`,
  `Exec=/opt/${ID}/${ID} %U`,
  `Icon=${ID}`,
  'Terminal=false',
  'Categories=Office;',
  'StartupWMClass=' + pkg.productName,
  ''
].join('\n'), 0o644);

// Το chrome-sandbox του Electron θέλει SUID root· χωρίς αυτό το Chromium δεν ξεκινά σε Ubuntu
put('DEBIAN/postinst', `#!/bin/sh\nset -e\nchown root:root /opt/${ID}/chrome-sandbox || true\nchmod 4755 /opt/${ID}/chrome-sandbox || true\nexit 0\n`, 0o755);
put('DEBIAN/control', [
  `Package: ${ID}`,
  `Version: ${pkg.version}`,
  'Section: misc',
  'Priority: optional',
  'Architecture: amd64',
  'Maintainer: Michael Gkotsis <noreply@users.noreply.github.com>',
  'Depends: libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0 | libatspi2.0-0t64, libuuid1, libsecret-1-0, libasound2 | libasound2t64, libgbm1, libdrm2',
  `Description: ${pkg.productName}`,
  ` ${pkg.description.split(':')[0]}. Δεδομένα στο ~/.config/Γραφείο Ίλης/data, Excel στα Έγγραφα/Γραφείο Ίλης.`,
  ''
].join('\n'), 0o644);

for (const d of [STAGE, ...fs.readdirSync(STAGE, { recursive: true, withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(e.parentPath ?? e.path, e.name))]) fs.chmodSync(d, 0o755);
const out = path.resolve('release', `GrafeioIlis-ubuntu-amd64-${pkg.version}.deb`);
fs.rmSync(out, { force: true });
execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '-b', STAGE, out], { stdio: 'inherit' });
console.log('OK:', path.relative('.', out), (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
