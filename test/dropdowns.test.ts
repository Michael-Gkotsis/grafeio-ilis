// Ενιαίες λίστες επιλογής (Michael, 20/10): όλες οι οθόνες με το Select και το Combo (src/renderer/select.ts),
// όχι με το <select> ή το <datalist> των Windows, που δεν παίρνουν το στυλ και το σκοτεινό θέμα της εφαρμογής
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'src', 'renderer');
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []));

describe('λίστες επιλογής', () => {
  it('καμία οθόνη δεν φτιάχνει <select> ή <datalist> μόνη της', () => {
    const bad = files(dir).filter(f => !f.endsWith('select.ts')).filter(f => /<select[\s>]|<datalist[\s>]/.test(fs.readFileSync(f, 'utf8')));
    expect(bad.map(f => path.relative(dir, f))).toEqual([]);
  });
});
