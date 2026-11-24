// 24/11, Michael: η οθόνη Οπλισμός/Οχήματα έσπαγε με «slice». Το DateField καλεί το onChange
// με ψεύτικο event { target: { value } } (όπως το input date), όχι με συμβολοσειρά.
// Άρα κάθε onChange του DateField πρέπει να διαβάζει .target.value.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('DateField onChange', () => {
  it('κάθε onChange διαβάζει .target.value', () => {
    const bad: string[] = [];
    for (const f of files(join(__dirname, '..', 'src', 'renderer'))) {
      const text = readFileSync(f, 'utf8');
      const re = /<\$\{DateField\}([\s\S]*?)\/>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const h = /onChange=\$\{([\s\S]*)\}\s*$/.exec(m[1]);
        if (/onChange=/.test(m[1]) && !(h && h[1].includes('.target.value'))) {
          bad.push(`${f}:${text.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
