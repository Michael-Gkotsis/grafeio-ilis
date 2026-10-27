// Λίστα απεγκατάστασης του Setup: Delete για κάθε αρχείο, RMDir βαθύτεροι πρώτα, ποτέ data\ ή templates\ του χρήστη
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// @ts-ignore: σκριπτ .mjs χωρίς τύπους
import { walkTree, uninstallScript } from '../scripts/nsis-uninstall.mjs';

describe('απεγκατάσταση Setup', () => {
  it('σβήνει μόνο ό,τι υπάρχει στο πακέτο, φάκελοι βαθύτεροι πρώτα', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsis-'));
    for (const f of ['GrafeioIlis.exe', 'resources/app/dist/main.js', 'resources/app/templates/froura.xlsx', 'locales/el.pak', 'a$b.txt']) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), 'x');
    }
    const lines = (uninstallScript(walkTree(root)) as string).split('\r\n').filter(l => !l.startsWith(';') && l);
    expect(lines).toContain('Delete "$INSTDIR\\resources\\app\\dist\\main.js"');
    expect(lines).toContain('Delete "$INSTDIR\\a$$b.txt"');
    const rm = lines.filter(l => l.startsWith('RMDir'));
    expect(rm[0]).toMatch(/resources\\app\\(dist|templates)/);
    expect(rm.indexOf('RMDir "$INSTDIR\\resources\\app\\dist"')).toBeLessThan(rm.indexOf('RMDir "$INSTDIR\\resources\\app"'));
    expect(rm.indexOf('RMDir "$INSTDIR\\resources\\app"')).toBeLessThan(rm.indexOf('RMDir "$INSTDIR\\resources"'));
    expect(lines.some(l => /\bdata\b/.test(l) || /RMDir \/r/.test(l) || l === 'RMDir "$INSTDIR"')).toBe(false);
    fs.rmSync(root, { recursive: true });
  });
});
