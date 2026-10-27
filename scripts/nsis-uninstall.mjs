// Λίστα απεγκατάστασης για το setup.nsi: Delete για κάθε αρχείο και RMDir για κάθε φάκελο (οι βαθύτεροι πρώτα)
// από το πραγματικό δέντρο που εγκαθίσταται. Έτσι η απεγκατάσταση δεν αγγίζει ό,τι άλλο υπάρχει στον φάκελο (data\, templates\).
import fs from 'fs';
import path from 'path';

// Αρχεία και φάκελοι κάτω από το root, με σχετικές διαδρομές και «/»
export function walkTree(root, rel = '') {
  const files = []; const dirs = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { dirs.push(r); const sub = walkTree(root, r); files.push(...sub.files); dirs.push(...sub.dirs); } else files.push(r);
  }
  return { files, dirs };
}

// $ διπλασιάζεται, γιατί στο NSIS ξεκινά μεταβλητή
const q = p => '"$INSTDIR\\' + p.replace(/\//g, '\\').replace(/\$/g, '$$$$') + '"';

export function uninstallScript({ files, dirs }) {
  const depth = d => d.split('/').length;
  return [
    '; Φτιάχνεται αυτόματα από το package-win-setup.mjs: μην το αλλάξεις',
    ...[...files].sort().map(f => 'Delete ' + q(f)),
    ...[...dirs].sort((a, b) => depth(b) - depth(a) || (a < b ? -1 : 1)).map(d => 'RMDir ' + q(d)),
    ''
  ].join('\r\n');
}
