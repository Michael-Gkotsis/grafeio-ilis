// Ό,τι μπαίνει στο resources\app: runtime package.json + dist/ + templates/. Κοινό για το φορητό πακέτο και το zip της ενημέρωσης.
import fs from 'fs';
import path from 'path';

export const EV = '22.3.27';   // η έκδοση Electron που τρέχει (αν αλλάξει, η ενημέρωση από την εφαρμογή δεν αρκεί: χρειάζεται Setup.exe)
export const readPkg = () => JSON.parse(fs.readFileSync('package.json', 'utf8'));

export function copyApp(app) {
  const pkg = readPkg();
  fs.mkdirSync(app, { recursive: true });
  const runtimePkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main };
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(runtimePkg, null, 2));
  fs.cpSync('dist', path.join(app, 'dist'), { recursive: true });
  fs.cpSync('templates', path.join(app, 'templates'), { recursive: true });
}
