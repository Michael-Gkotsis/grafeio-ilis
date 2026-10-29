// Σελίδα Δύναμη (Michael, 26/10): Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη σε κάθε ώρα και μέρα, ομάδες και «Γυρνά…». Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { hhmm, strengthView, type StrengthView } from '../src/shared/strengthView';
import { fillDay, kolView, strengthOf } from '../src/shared/rules';
import type { AppState, Status } from '../src/shared/domain';
import { mockApi } from '../src/renderer/mockApi';
import { addDays, today } from '../src/shared/dates';
import { fakeState } from './fixtures';

let seq = 0;
const D = '2026-10-21', PREV = '2026-10-20', NEXT = '2026-10-22';
const st = (pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id: 'v' + ++seq, pid, type, from, to, ...x });
function seed(): AppState {
  const s = fakeState(60);
  s.statuses = [
    st(3, 'LEAVE', PREV, '2026-10-23'), st(4, 'LEAVE', PREV, D, { toTime: '12:00' }), st(6, 'NOS', PREV, NEXT), st(7, 'OUT', D, D), st(8, 'DN', D, D), st(9, 'DN', PREV, PREV),
    st(10, 'KOL', D, NEXT, { note: 'Υπηρεσία ΣΤΕΠ', minus: true, hkCol: 'yp' }), st(11, 'KOL', D, D, { note: 'Συνοδεία' }), st(12, 'KOL', D, D, { note: 'Υπηρεσία ΣΤΕΠ', minus: true, fromTime: '12:00' }),
    st(13, 'EY', D, D), st(14, 'PUN', PREV, NEXT, { kind: 'Περιορισμός' }), st(15, 'EA', D, NEXT), st(16, 'STEP', D, D)
  ];
  s.guards = fillDay(s, D).guards; s.guards = fillDay({ ...s }, NEXT).guards;
  return s;
}
const TIMES = [360, 480, 600, 1080, 1380];
const ids = (v: StrengthView) => (['present', 'kol', 'away'] as const).flatMap(c => v.cats[c].groups.flatMap(g => g.rows.map(r => r.p.id)));
const grp = (v: StrengthView, cat: 'present' | 'kol' | 'away', key: string) => v.cats[cat].groups.find(g => g.key === key)?.rows.map(r => r.p.id) || [];

describe('Δύναμη: οι τέσσερις αριθμοί', () => {
  it('Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, σε πολλές ώρες και μέρες, και συμφωνούν με strengthOf/kolView', () => {
    const s = seed();
    for (const d of [PREV, D, NEXT, '2026-10-23', '2026-10-25']) for (const at of TIMES) {
      const v = strengthView(s, d, at), c = strengthOf(s, d, at), k = kolView(s, d, at);
      expect(v.present + v.kol + v.absent).toBe(v.total);
      expect(v.total).toBe(c.total); expect(v.absent).toBe(c.absent); expect(v.kol).toBe(k.minus.length); expect(v.present).toBe(c.present - k.minus.length);
      expect(v.cats.present.n).toBe(v.present); expect(v.cats.kol.n).toBe(v.kol); expect(v.cats.away.n).toBe(v.absent);
      // κάθε άτομο σε μία μόνο ομάδα
      const all = ids(v); expect(all.length).toBe(v.total); expect(new Set(all).size).toBe(v.total);
      expect(v.line).toBe(v.present + ' + ' + v.kol + ' + ' + v.absent + ' = ' + v.total + ' · στις ' + hhmm(at));
    }
  });
  it('η ώρα μετράει: ο ΔΝ της χθες είναι απών ως τις 06:00, ο κωλυόμενος με ώρα έναρξης μετά την έναρξη', () => {
    const s = seed();
    expect(grp(strengthView(s, D, 300), 'away', 'DN')).toContain(9);
    expect(grp(strengthView(s, D, 600), 'away', 'DN')).not.toContain(9);
    expect(grp(strengthView(s, D, 600), 'kol', 'yp')).toEqual([10]);
    expect(grp(strengthView(s, D, 780), 'kol', 'yp').sort()).toEqual([10, 12]);
    expect(grp(strengthView(s, D, 1080), 'away', 'OUT')).toEqual([7]);
    expect(grp(strengthView(s, D, 600), 'away', 'OUT')).toEqual([]);
  });
});

describe('Δύναμη: κατηγορίες', () => {
  it('ο κωλυόμενος που αφαιρείται μετρά μόνο στους Κωλυόμενους, όχι στους Παρόντες', () => {
    const v = strengthView(seed(), D, 600);
    expect(grp(v, 'kol', 'yp')).toEqual([10]);
    expect(v.cats.present.groups.flatMap(g => g.rows.map(r => r.p.id))).not.toContain(10);
    expect(v.cats.kol.groups[0].rows[0].what).toBe('Υπηρεσία ΣΤΕΠ');
  });
  it('χωρίς αφαίρεση, δική μας υπηρεσία, ΕΥ, ποινή και ιατρικά μένουν Παρόντες με δική τους υποομάδα', () => {
    const s = seed(), v = strengthView(s, D, 600);
    expect(grp(v, 'present', 'keep')).toEqual([11]);
    expect(grp(v, 'present', 'ey')).toEqual([13]); expect(grp(v, 'present', 'pun')).toEqual([14]);
    expect(grp(v, 'present', 'med').sort()).toEqual([15, 16]);
    const duty = grp(v, 'present', 'duty'); expect(duty.length).toBeGreaterThan(0);
    const onDuty = new Set(Object.values(s.guards[D])); duty.forEach(id => expect(onDuty.has(id)).toBe(true));
    expect(v.cats.present.groups.find(g => g.key === 'duty')!.rows[0].what).not.toBe('');
    expect(v.cats.kol.n).toBe(1);
  });
});

describe('Δύναμη: «Γυρνά…»', () => {
  const ret = (v: StrengthView, key: string, id: number) => v.cats.away.groups.find(g => g.key === key)!.rows.find(r => r.p.id === id)!.ret;
  it('ΔΝ, εξοδούχος, άδεια και νοσοκομείο: μέρα, ώρα και λόγος', () => {
    const s = seed(), v = strengthView(s, D, 1080);
    expect(ret(v, 'DN', 8)).toMatch(/^Γυρνά (Πέμπτη|Τετάρτη|Δευτέρα|Τρίτη|Παρασκευή) \d\d\/\d\d \d\d:\d\d \(.+\)$/);
    expect(ret(v, 'OUT', 7)).toBe('Γυρνά Τετάρτη 21/10 22:00 (εξοδούχος την Τετάρτη)');
    expect(ret(v, 'LEAVE', 3)).toBe('Γυρνά Σάββατο 24/10 πρωί (τέλος ΚΑ)');
    expect(ret(v, 'NOS', 6)).toBe('Γυρνά Παρασκευή 23/10 πρωί (τέλος Νοσοκομείο)');
  });
  it('άδεια με ώρα επιστροφής γυρνά εκείνη την ώρα· ΔΝ της χθες γυρνά το πρωί', () => {
    const s = seed();
    expect(ret(strengthView(s, D, 300), 'LEAVE', 4)).toBe('Γυρνά Τετάρτη 21/10 12:00 (τέλος ΚΑ)');
    expect(ret(strengthView(s, D, 300), 'DN', 9)).toMatch(/^Γυρνά Τετάρτη 21\/10 06:00 /);
  });
  it('άδεια από την ώρα επιστροφής και μετά: παρών', () => {
    expect(grp(strengthView(seed(), D, 780), 'away', 'LEAVE')).toEqual([3]);
  });
});

describe('Δύναμη: δεδομένα δοκιμής της εφαρμογής (mockApi)', () => {
  it('οι τέσσερις αριθμοί αθροίζουν σε πολλές ώρες και μέρες', async () => {
    const { state } = await mockApi().boot();
    for (const i of [-2, -1, 0, 1, 3]) for (const at of TIMES) {
      const d = addDays(today(), i), v = strengthView(state, d, at), c = strengthOf(state, d, at);
      expect(v.present + v.kol + v.absent).toBe(c.total); expect(v.absent).toBe(c.absent); expect(new Set(ids(v)).size).toBe(c.total);
    }
    expect(strengthView(state, today(), 600).kol).toBeGreaterThan(0);
  });
});
