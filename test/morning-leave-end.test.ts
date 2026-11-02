// Άδεια που λήγει το πρωί (Michael, 2/11): ΚΑ ως Δευτέρα 06:00 και ΔΝ τη Δευτέρα. Πριν την ώρα εξόδου είναι παρών (όχι «ΔΝ» στους Απόντες),
// στο «Ποιοι γυρίζουν» φαίνεται μόνο η ΔΝ του, και όποιος γύρισε το πρωί χωρίς τίποτα άλλο δεν είναι στο Γ4 ούτε στο «Ποιοι γυρίζουν». Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { fakeState } from './fixtures';
import type { AppState, Status } from '../src/shared/domain';
import { statusesAt, strengthOf } from '../src/shared/rules';
import { returnsOn } from '../src/shared/returns';
import { dayBook } from '../src/shared/outsDay';
import { mins } from '../src/shared/hours';

const MON = '2026-11-02';
const lv = (x: Partial<Status> = {}): Status => ({ id: 'l1', pid: 1, type: 'LEAVE', from: '2026-10-28', to: MON, toTime: '06:00', kind: 'Κανονική', ...x });
const dn = (x: Partial<Status> = {}): Status => ({ id: 'd1', pid: 1, type: 'DN', from: MON, to: MON, ...x });
const st = (ss: Status[]): AppState => ({ ...fakeState(10), statuses: ss });
const away = (s: AppState, t: string) => statusesAt(s, 1, MON, mins(t)).filter(x => x.type !== 'KOL').map(x => x.type);

describe('ΚΑ ως 06:00 και ΔΝ την ίδια μέρα', () => {
  const s = st([lv(), dn()]);
  it('05:00 σε άδεια, 08:00 και 13:30 παρών, 17:00 ΔΝ', () => {
    expect(away(s, '05:00')[0]).toBe('LEAVE');
    expect(away(s, '08:00')).toEqual([]);
    expect(away(s, '13:30')).toEqual([]);
    expect(away(s, '17:00')).toEqual(['DN']);
    expect(strengthOf(s, MON, mins('13:30')).absent).toBe(0);
    expect(strengthOf(s, MON, mins('17:00')).absent).toBe(1);
  });
  it('Όλη η δύναμη: Α1 με ΔΝ', () => {
    expect(dayBook(s, MON).find(r => r.p.id === 1)!.g).toBe('A1');
  });
  it('Ποιοι γυρίζουν: η ΔΝ, γυρνά αύριο', () => {
    const b = returnsOn(s, MON).find(x => x.p.id === 1)!;
    expect(b.r.day).toBe('2026-11-03');
  });
});

describe('ΚΑ ως 06:00 χωρίς τίποτα άλλο', () => {
  const s = st([lv()]);
  it('δεν είναι στο Γ4 (γύρισε πριν την ΗΚΑΙ): Γ5', () => {
    expect(dayBook(s, MON).find(r => r.p.id === 1)!.g).toBe('G5');
  });
  it('δεν είναι στο «Ποιοι γυρίζουν»', () => {
    expect(returnsOn(s, MON).some(x => x.p.id === 1)).toBe(false);
  });
  it('ΚΑ ως 14:00: Γ4 και στο «Ποιοι γυρίζουν»', () => {
    const s2 = st([lv({ toTime: '14:00' })]);
    expect(dayBook(s2, MON).find(r => r.p.id === 1)!.g).toBe('G4');
    expect(returnsOn(s2, MON).some(x => x.p.id === 1)).toBe(true);
  });
});

// Γ «ΓΙΑΤΙ ΜΕΝΕΙ» (Michael, 2/11): το ΕΑ δεν είναι λόγος που δεν βγαίνει, είναι απλώς η ιατρική του κατάσταση: πάει στις ΠΑΡΑΤΗΡΗΣΕΙΣ
describe('Excel «Όλη η δύναμη»: ΓΙΑΤΙ ΜΕΝΕΙ μόνο ό,τι κόβει την έξοδο', () => {
  it('ΕΑ στο Γ5: όχι στο ΓΙΑΤΙ ΜΕΝΕΙ, ναι στις ΠΑΡΑΤΗΡΗΣΕΙΣ· ποινή στο Γ2: στο ΓΙΑΤΙ ΜΕΝΕΙ', async () => {
    const fs = await import('fs'), path = await import('path');
    const { fillOuts } = await import('../src/main/exports');
    const { Workbook } = await import('../src/main/xlsx');
    const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
    const base = st([{ id: 'e1', pid: 2, type: 'EA', from: MON, to: '2026-11-05' }, { id: 'p1', pid: 3, type: 'PUN', kind: 'Περιορισμός', from: MON, to: '2026-11-05' }, dn({ pid: 4, id: 'd4' })]);
    const s: AppState = { ...base, settings: { ...base.settings, outsFmt: 'all' } };
    const g = new Map(dayBook(s, MON).map(r => [r.p.id, r.g])); expect(g.get(2)).toBe('G5'); expect(g.get(3)).toBe('G2');
    const r = await fillOuts(T, s, MON); const wb = await Workbook.open(r.data);
    const rows = await wb.values(r.sheets![1], 400, 30);
    const head = rows.find(x => x.includes('ΓΙΑΤΙ ΜΕΝΕΙ'))!, cw = head.indexOf('ΓΙΑΤΙ ΜΕΝΕΙ'), cn = head.findIndex(v => typeof v === 'string' && /ΠΑΡΑΤΗΡΗΣΕΙΣ/.test(v));
    const last = (pid: number) => s.people.find(p => p.id === pid)!.last;
    const rowOf = (pid: number) => rows.find(x => x.includes(last(pid)))!;
    expect(String(rowOf(2)[cw] ?? '')).not.toMatch(/ΕΑ/);
    expect(String(rowOf(2)[cn] ?? '')).toMatch(/ΕΑ/);
    expect(String(rowOf(3)[cw] ?? '')).toMatch(/ΠΕΡΙΟΡΙΣΜΟΣ|ΠΟΙΝΗ/);
  });
});
