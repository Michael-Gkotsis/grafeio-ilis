// Το main τρέχει σε Electron 22 (Node 16): απαγορεύονται APIs που ήρθαν αργότερα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : []));

describe('Node 16', () => {
  it('ο κώδικας main/shared δεν χρησιμοποιεί APIs μετά το Node 16', () => {
    const bad = /\bstructuredClone\(|\.findLast(Index)?\(|\.toSorted\(|\.toReversed\(|\.toSpliced\(|\bfetch\(/;
    const hits = [...files('src/main'), ...files('src/shared'), ...files('src/preload')].filter(f => bad.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
