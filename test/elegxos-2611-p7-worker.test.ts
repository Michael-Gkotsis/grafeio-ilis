// Έλεγχος 25/11 (Π7): η βαριά δουλειά της Αντιστοίχισης περνά από το νήμα των Excel (offload.ts), ώστε ένα μεγάλο αρχείο
// άλλης μονάδας να μην παγώνει το παράθυρο. list:model στο αρχείο 1,3 MB: ~0,5 s σε γρήγορο PC, ~3 s στο Atom.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'main', f), 'utf8');
const handler = (main: string, ch: string) => main.split('\n').find(l => l.includes("ipcMain.handle('" + ch + "'")) || '';

describe('Αντιστοίχιση: στο νήμα των Excel', () => {
  const main = src('main.ts'), worker = src('worker.ts');
  for (const [ch, fn] of [['tpl:model', 'tplModel'], ['tpl:try', 'tplTry'], ['list:model', 'listModel'], ['list:try', 'listTry']]) {
    it(ch + ' → off(\'' + fn + '\')', () => {
      expect(handler(main, ch)).toContain("off('" + fn + "'");
      expect(worker).toMatch(new RegExp('\\n\\s+' + fn + ': async'));
    });
  }
});
