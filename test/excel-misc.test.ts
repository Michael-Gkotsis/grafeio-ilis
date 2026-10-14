// Excel: συνονόματοι ενεργοί χωρίς ΑΣΜ, πίνακας χωρίς «ΕΩΣ», αρχεία με ημερομηνίες 1904, αρχείο που αλλάζει την ώρα
// που διαβάζεται. Μόνο ψεύτικα ονόματα.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import type { AppState, Status } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, diffStatuses, parseStatuses, planDutiesWrite, planPostsWrite, planWrite, type SourceBinding } from '../src/shared/sources';
import { Workbook, toSerial } from '../src/main/xlsx';
import { readBook } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const bind = (kind: 'punish' | 'posts' | 'duties', sh: RawSheet): SourceBinding => { const x = bestFor(kind, [sh])!; return { file: 'x.xlsx', sheet: sh.name, header: x.header, cols: x.cols, write: true }; };
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
// δύο ενεργοί με ίδιο επώνυμο και όνομα (άλλο πατρώνυμο), χωρίς ΑΣΜ
const twins = (): AppState => {
  const s = fakeState(6);
  s.people = s.people.map(p => (p.id === 2 ? { ...p, last: 'ΔΙΔΥΜΟΣ', first: 'ΑΛΦΑΣ', father: 'ΠΕΤΡΟΣ', asm: '' } : p.id === 3 ? { ...p, last: 'ΔΙΔΥΜΟΣ', first: 'ΑΛΦΑΣ', father: 'ΠΑΥΛΟΣ', asm: '' } : p));
  return s;
};

describe('ενεργοί συνονόματοι σε φύλλο χωρίς ΑΣΜ, πατρώνυμο, θάλαμο (X2)', () => {
  it('καταστάσεις: κάθε γραμμή πάει σε αυτόν που έχει την εγγραφή· καμία νέα γραμμή', () => {
    const s0 = twins();
    const st: Status[] = [{ id: 'a', pid: 2, type: 'PUN', from: '2026-10-01', to: '2026-10-03', kind: 'Κράτηση' }, { id: 'b', pid: 3, type: 'PUN', from: '2026-10-05', to: '2026-10-06', kind: 'Κράτηση' }];
    const s = { ...s0, statuses: st };
    const sh: RawSheet = { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'],
      [1, 'ΔΙΔΥΜΟΣ', 'ΑΛΦΑΣ', D('2026-10-01'), D('2026-10-03'), 'ΚΡΑΤΗΣΗ'], [2, 'ΔΙΔΥΜΟΣ', 'ΑΛΦΑΣ', D('2026-10-05'), D('2026-10-06'), 'ΚΡΑΤΗΣΗ']] };
    const w = planWrite('punish', sh, bind('punish', sh), s, [], TODAY);
    expect(w.added).toBe(0); expect(w.insert).toBeNull();
    // γραμμή που δεν ταιριάζει με καμία εγγραφή τους: αμφίσημη, και κανείς τους δεν ξαναγράφεται ως νέος
    sh.rows[3][3] = D('2026-10-04');
    const w2 = planWrite('punish', sh, bind('punish', sh), s, [], TODAY);
    expect(w2.added).toBe(0); expect(w2.ambiguous).toEqual([3]);
  });
  it('πόστα και έλεγχος υπηρεσιών: καμία νέα γραμμή, κανείς «δεν βρέθηκε»', () => {
    const s0 = twins(); const s = { ...s0, people: s0.people.map(p => ({ ...p, post: p.id === 2 || p.id === 3 ? 'ΚΨΜ' : null })), guards: { '2026-09-01': { th1: 2 } } };
    const sh: RawSheet = { name: 'ΠΟΣΤΑ', rows: [['ΠΟΣΤΑ'], ['Α/Α', 'Επώνυμο', 'Όνομα', 'Πόστο'], [1, 'ΔΙΔΥΜΟΣ', 'ΑΛΦΑΣ', 'ΚΨΜ'], [2, 'ΔΙΔΥΜΟΣ', 'ΑΛΦΑΣ', 'ΚΨΜ']] };
    expect(planPostsWrite(sh, bind('posts', sh), s).added).toBe(0);
    const days = Array.from({ length: 30 }, (_, i) => String(i + 1));
    const dsh: RawSheet = { name: 'Ε', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026'], ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΣΥΝΟΛΟ', ...days], [1, 'ΔΙΔΥΜΟΣ', 'ΑΛΦΑΣ', 0]] };
    const w = planDutiesWrite(dsh, bind('duties', dsh), s, TODAY);
    expect(w.sets).toEqual([]); expect(w.notFound).toEqual([]); expect(w.ambiguous).toEqual([2]);
  });
});

describe('πίνακας χωρίς στήλη «ΕΩΣ» (X4)', () => {
  it('η εγγραφή είναι μίας μέρας, όχι ως σήμερα· με στήλη «ΕΩΣ» κενή είναι χωρίς λήξη', () => {
    const s = fakeState(4); const p = s.people[1];
    const sh: RawSheet = { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, p.last, p.first, D('2026-10-01'), 'ΚΡΑΤΗΣΗ']] };
    const b = bind('punish', sh); expect(b.cols.to).toBeUndefined();
    const parsed = parseStatuses('punish', sh, b, s.people, TODAY);
    expect(parsed.cands[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-01', noEnd: false });
    expect(diffStatuses('punish', s, parsed, b).add[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-01' });
    expect(diffStatuses('punish', s, parsed, b).add[0].open).toBeUndefined();
    const sh2: RawSheet = { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, p.last, p.first, D('2026-10-01'), null, 'ΚΡΑΤΗΣΗ']] };
    const b2 = bind('punish', sh2);
    expect(diffStatuses('punish', s, parseStatuses('punish', sh2, b2, s.people, TODAY), b2).add[0]).toMatchObject({ from: '2026-10-01', to: TODAY, open: true });
  });
});

describe('ημερομηνίες 1904 (X14a)', () => {
  it('ό,τι γράφεται διαβάζεται πίσω με την ίδια ημερομηνία', async () => {
    const zip = await JSZip.loadAsync(await (await Workbook.blank('Φ')).save());
    const wx = await zip.file('xl/workbook.xml')!.async('string');
    zip.file('xl/workbook.xml', wx.replace('<sheets>', '<workbookPr date1904="1"/><sheets>'));
    const wb = await Workbook.open(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(wb.date1904).toBe(true);
    const ws = await wb.sheet('Φ'); ws.setNumber('A1', toSerial('2026-10-12', wb.date1904), 3);
    const back = await Workbook.open(await wb.save());
    expect((await back.values('Φ'))[0][0]).toEqual(D('2026-10-12'));
    expect(toSerial('2026-10-12')).toBe(toSerial('2026-10-12', true) + 1462);
  });
});

describe('αρχείο που αλλάζει την ώρα που διαβάζεται (X14c)', () => {
  it('ξαναδιαβάζεται, ώστε ώρα/μέγεθος να είναι αυτά του περιεχομένου που διαβάστηκε', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-race-')); const file = path.join(dir, 'a.xlsx');
    const wb = await Workbook.blank('Φ'); (await wb.sheet('Φ')).set('A1', 'ΠΡΩΤΟ'); fs.writeFileSync(file, await wb.save());
    const wb2 = await Workbook.blank('Φ'); (await wb2.sheet('Φ')).set('A1', 'ΔΕΥΤΕΡΟ ΚΑΙ ΜΕΓΑΛΥΤΕΡΟ'); const second = await wb2.save();
    // αμέσως μετά την πρώτη ανάγνωση κάποιος σώζει το αρχείο από το Excel
    const real = fs.promises.readFile; let n = 0;
    const spy = vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...a: any[]) => { const r = await (real as any)(...a); if (String(a[0]) === file && n++ === 0) { fs.writeFileSync(file, second); const t = new Date(Date.now() + 9000); fs.utimesSync(file, t, t); } return r; });
    try {
      const r = await readBook(file);
      expect(r.sheets[0].rows[0][0]).toBe('ΔΕΥΤΕΡΟ ΚΑΙ ΜΕΓΑΛΥΤΕΡΟ');
      expect(r.size).toBe(fs.statSync(file).size);
    } finally { spy.mockRestore(); }
  });
});
