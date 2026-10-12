import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { freeName } from '../src/main/files';
import { Workbook } from '../src/main/xlsx';
import { locateNow } from '../src/main/sources';
import { bestFor, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';

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

// Μαζί με το review (PR #16): πρώτα η γραμμή του πίνακα, μετά οι στήλες
describe('αντιστοίχιση όπως είναι τώρα στο αρχείο', () => {
  it('γραμμές από πάνω και νέα στήλη «ΔΝ»: βρίσκονται και τα δύο', async () => {
    const s = fakeState(6);
    const head = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος', 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    const row = (i: number, dn?: string) => { const p = s.people[i]; const r: (string | number | null)[] = [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si || null, null]; if (dn !== undefined) r.splice(7, 0, dn); return r; };
    const before: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΣΥΝΟΛΙΚΟ'], head, ...s.people.map((_, i) => row(i))] };
    const after: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΣΥΝΟΛΙΚΟ'], [], [], [...head.slice(0, 7), 'ΔΝ', ...head.slice(7)], ...s.people.map((_, i) => row(i, i % 2 ? 'ΝΑΙ' : ''))] };
    const x = bestFor('people', [before])!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-loc-')); const file = path.join(dir, 'dyn.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    after.rows.forEach((r, ri) => r.forEach((v, c) => { if (v != null && v !== '') ws.set(String.fromCharCode(65 + c) + (ri + 1), v as string | number); }));
    fs.writeFileSync(file, await wb.save());
    const b: SourceBinding = { file, sheet: 'ΣΥΝΟΛΙΚΟ', header: x.header, cols: x.cols, write: true };
    const nb = await locateNow('people', b);
    expect(nb.header).toBe(3);
    expect(nb.cols).toEqual({ ...b.cols, dn: 7, phone: 8, room: 9, si: 10, remarks: 11 });
    expect(await locateNow('people', nb)).toBe(nb);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
