// Το main τρέχει σε Electron 22 (Node 16): απαγορεύονται APIs που ήρθαν αργότερα.
//
// Phase 0.4: the scan used the relative path 'src/main' (the working directory) and only .ts files. It now walks the
// layers that run in Node (main, shared, preload and the future core) from the repo root, over .ts/.tsx/.jsx, and fails
// when it finds almost nothing, so a rename of a folder cannot turn this rule into a pass over zero files.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { readSources, SRC_DIR } from './support/source-scan';

/** Folders of src/ that run in Node or are shared with it (src/core is the target name of src/shared). */
const NODE_LAYERS = ['main', 'shared', 'preload', 'core'];

describe('Node 16', () => {
  it('ο κώδικας main/shared δεν χρησιμοποιεί APIs μετά το Node 16', () => {
    const bad = /\bstructuredClone\(|\.findLast(Index)?\(|\.toSorted\(|\.toReversed\(|\.toSpliced\(|\bfetch\(/;
    const files = NODE_LAYERS.filter(d => fs.existsSync(path.join(SRC_DIR, d))).flatMap(d => readSources(path.join(SRC_DIR, d), 1));
    expect(files.length).toBeGreaterThan(30);   // main + shared + preload have 60+ files today
    expect(files.filter(f => bad.test(f.text)).map(f => f.rel)).toEqual([]);
  });
});
