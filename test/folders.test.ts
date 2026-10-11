import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { freeName } from '../src/main/files';

describe('φάκελοι αρχείων', () => {
  it('νέο Excel: ελεύθερο όνομα μέσα στον φάκελο, χωρίς να πατήσει υπάρχον', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-dir-'));
    expect(freeName(dir, 'Ποινές')).toBe(path.join(dir, 'Ποινές.xlsx'));
    fs.writeFileSync(path.join(dir, 'Ποινές.xlsx'), '');
    expect(freeName(dir, 'Ποινές')).toBe(path.join(dir, 'Ποινές (2).xlsx'));
    fs.writeFileSync(path.join(dir, 'Ποινές (2).xlsx'), '');
    expect(freeName(dir, 'Ποινές')).toBe(path.join(dir, 'Ποινές (3).xlsx'));
    expect(path.basename(freeName(dir, 'Α/Β: Γ?'))).toBe('Α-Β- Γ-.xlsx');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
