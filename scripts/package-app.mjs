// Τα αρχεία της αυτόματης ενημέρωσης για τα Releases: release/GrafeioIlis-app-<V>.zip (το περιεχόμενο του resources\app στη ρίζα)
// και release/latest.json. Χρήση: npm run build && npm run package:app
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import JSZip from 'jszip';
import { EV, copyApp, readPkg } from './app-files.mjs';

if (!fs.existsSync('dist/main/main.js')) throw new Error('Τρέξε πρώτα: npm run build');
const pkg = readPkg(); const V = pkg.version;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-app-'));
try {
  copyApp(tmp);
  const zip = new JSZip();
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else zip.file(r, fs.readFileSync(path.join(dir, e.name)), { date: new Date(1980, 0, 2) });   // σταθερή ημερομηνία: ίδιο περιεχόμενο, ίδιο zip
    }
  };
  walk(tmp);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  fs.mkdirSync('release', { recursive: true });
  const file = `GrafeioIlis-app-${V}.zip`;
  fs.writeFileSync(path.join('release', file), buf);

  // «Τι άλλαξε»: οι τίτλοι των commits (χωρίς merge) από την προηγούμενη έκδοση (tag). Χωρίς tag ή git: κενή λίστα.
  let notes = [];
  try {
    const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const prev = git('describe', '--tags', '--abbrev=0', '--exclude', 'v' + V);
    notes = git('log', '--no-merges', '--pretty=%s', `${prev}..HEAD`).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);
  } catch { /* πρώτη έκδοση ή χωρίς tags */ }

  const manifest = { version: V, date: new Date().toISOString().slice(0, 10), electron: EV, app: { file, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }, notes };
  fs.writeFileSync(path.join('release', 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('OK:', file, (buf.length / 1048576).toFixed(2) + ' MB, latest.json,', notes.length, 'σημειώσεις');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
