// Δυναμολόγιο (Michael, 17/10): στήλες, φίλτρα και ένα Excel με ένα φύλλο ανά φίλτρο. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ROSTER_COLS, rosterMatch, rosterSheets } from '../src/shared/rosterLists';
import { rosterLists, rosterPrint } from '../src/main/excel';
import { statusesOn } from '../src/shared/rules';
import type { AppState, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-17';
const st = (id: string, pid: number, type: Status['type'], from: string, to: string, extra: Partial<Status> = {}): Status => ({ id, pid, type, from, to, ...extra });
function sample(): AppState {
  const s = fakeState(12);
  s.people = s.people.map(p => (p.id === 3 ? { ...p, dn: true } : p.id === 4 ? { ...p, active: false } : p.id === 7 ? { ...p, role: 'ΘΑΛΑΜΑΡΧΗΣ' } : p));
  s.statuses = [st('a', 1, 'LEAVE', '2026-10-15', '2026-10-20', { kind: 'Κανονική', note: 'γάμος' }), st('b', 2, 'PUN', D, '2026-10-18', { kind: 'Κράτηση' }),
    st('c', 8, 'EY', D, D), st('d', 9, 'LEAVE', '2026-10-25', '2026-10-26'), st('e', 10, 'SICK', '2026-10-16', '2026-10-17')];
  return s;
}

describe('Δυναμολόγιο: φίλτρα', () => {
  it('Όλοι, Άδειες, Τιμωρημένοι, Πόστα, Εκτός δύναμης, Με δικαίωμα ΔΝ', () => {
    const s = sample();
    const who = (f: any) => s.people.filter(p => rosterMatch(f, p, statusesOn(s.statuses, p.id, D))).map(p => p.id);
    expect(who('all')).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(who('leave')).toEqual([1, 10]);   // όχι ο 9 (άδεια σε άλλη μέρα), όχι ο ΕΥ
    expect(who('pun')).toEqual([2]);
    expect(who('post')).toEqual([6]);
    expect(who('inactive')).toEqual([4]);
    expect(who('dnright')).toEqual([3]);
  });
});

describe('Δυναμολόγιο: ένα Excel, ένα φύλλο ανά φίλτρο', () => {
  it('φύλλα, στήλες και γραμμές', () => {
    const sh = rosterSheets(sample(), D);
    expect(sh.map(x => x.name)).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ', 'ΑΔΕΙΕΣ', 'ΤΙΜΩΡΗΜΕΝΟΙ', 'ΠΟΣΤΑ', 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', 'ΔΙΚΑΙΩΜΑ ΔΝ']);
    expect(sh[0].head).toEqual(ROSTER_COLS);
    expect(sh[0].rows.length).toBe(11);
    expect(sh[0].rows.map(r => r[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // θάλαμος, επώνυμο: ο πρώτος είναι του θαλάμου 1
    expect(sh[0].rows[0].slice(1, 10)).toEqual(['ΔΝΕΑΣ', 'ΠΖ', 'ΔΟΚΙΜΙΟΣ', 'ΑΛΦΑΣ', 'ΠΑΤΕΡΑΣ', '900000', '6900000000', 1, '']);
    const lv = sh[1];
    expect(lv.head.slice(-4)).toEqual(['ΕΙΔΟΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ']);
    expect(lv.rows.map(r => r.slice(-4))).toEqual([['Κανονική άδεια', '15/10/2026', '20/10/2026', 'γάμος'], ['Αναρρωτική άδεια', '16/10/2026', '17/10/2026', '']]);
    expect(sh[2].rows.map(r => r.slice(-4))).toEqual([['ΚΡΑΤΗΣΗ', '17/10/2026', '18/10/2026', '']]);
    expect(sh[5].rows.map(r => r[12])).toEqual(['ΝΑΙ']);
  });
  it('το αρχείο: όλα με κεφαλαία, τίτλος και κεφαλίδα σε κάθε φύλλο', async () => {
    const r = await rosterLists(sample(), D);
    expect(r.name).toBe('ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ 17-10-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ', 'ΑΔΕΙΕΣ', 'ΤΙΜΩΡΗΜΕΝΟΙ', 'ΠΟΣΤΑ', 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', 'ΔΙΚΑΙΩΜΑ ΔΝ']);
    const lv = wb.getWorksheet('ΑΔΕΙΕΣ')!;
    expect(String(lv.getCell(1, 1).value)).toMatch(/^ΑΔΕΙΕΣ 17\/10\/2026/);
    expect(lv.getCell(3, 4).value).toBe('ΕΠΙΘΕΤΟ');
    expect(lv.getCell(4, 14).value).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ');
    expect(lv.getCell(4, 17).value).toBe('ΓΑΜΟΣ');
    expect(wb.getWorksheet('ΤΙΜΩΡΗΜΕΝΟΙ')!.getCell(5, 1).value).toBeNull();
  });
});

describe('Συνολικό Δυναμολόγιο για εκτύπωση', () => {
  it('κεφαλίδα ΗΚΑΙ, τίτλος με ημερομηνία, μόνο οι ενεργοί', async () => {
    const s = sample();
    const r = await rosterPrint(s, D);
    expect(r.name).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 17-10-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ']);
    const ws = wb.worksheets[0];
    expect(ws.getCell(1, 1).value).toBe(s.settings.unit[0].toUpperCase());
    expect(String(ws.getCell(5, 1).value)).toMatch(/^ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ .*ΤΗΣ 17 ΟΚΤ 26$/);
    expect(ws.getCell(6, 1).value).toBe('ΔΥΝΑΜΗ: 11');
    expect(ws.getCell(8, 4).value).toBe('ΕΠΙΘΕΤΟ');
    expect(ws.getCell(19, 4).value).not.toBeNull();
    expect(ws.getCell(20, 4).value).toBeNull();
  });
});
