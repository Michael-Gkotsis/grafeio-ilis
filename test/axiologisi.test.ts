// Κωδικός μέρας και το έτοιμο «Δυναμολόγιο αξιολόγησης» (Michael, 3/11). Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import { dayCode } from '../src/shared/dayCode';
import type { AppState, Status } from '../src/shared/domain';
import { FIELDS, PRESETS, fieldValue, guessField, rowsOf, defaultPick } from '../src/shared/reports';
import { rowValue, valsUsed } from '../src/shared/values';
import { buildTemplate } from '../src/main/reports';
import { fakeState } from './fixtures';

const D = '2026-11-03';
const st = (pid: number, type: string, extra: Partial<Status> = {}) => ({ id: 's' + pid + type + (extra.kind || ''), pid, type, from: D, to: D, note: '', ...extra }) as unknown as Status;
const code = (s: AppState, pid: number) => dayCode(s, s.people.find(p => p.id === pid)!, D);
const base = () => { const s = fakeState(8); s.people = s.people.map(p => ({ ...p, si: 'Ι1' })); return s; };

describe('κωδικός μέρας', () => {
  it('κωδικοί ανά είδος', () => {
    const s = base(); s.statuses = [st(1, 'LEAVE'), st(2, 'SICK'), st(3, 'EY'), st(4, 'EA'), st(5, 'NOS'), st(6, 'STEP'), st(7, 'HON')];
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(i => code(s, i))).toEqual(['Κ.Α', 'ΑΝ.ΑΔ', 'Ε.Υ', 'Ε.Α', 'ΝΟΣ', 'ΣΤΕΠ', 'ΤΙΜΗΤΙΚΗ', '']);
  });
  it('προτεραιότητα: άδεια/νοσοκομείο, ΣΤΕΠ, ιατρικό, ΑΟΠΛΟΣ', () => {
    const s = base(); s.people[0].si = 'Ι4'; s.people[1].si = 'Ι4'; s.people[2].si = 'Ι4';
    s.statuses = [st(1, 'EY'), st(1, 'LEAVE'), st(2, 'EY'), st(2, 'STEP'), st(3, 'EA')];
    expect(code(s, 1)).toBe('Κ.Α'); expect(code(s, 2)).toBe('ΣΤΕΠ'); expect(code(s, 3)).toBe('Ε.Α');
    expect(code(s, 4)).toBe('');
    const u = base(); u.people[3].si = 'Ι4';
    expect(code(u, 4)).toBe('ΑΟΠΛΟΣ');
  });
  it('δικό σου είδος άδειας: το όνομά του', () => {
    const s = base(); s.statuses = [st(1, 'LEAVE', { kind: 'Γάμου' })];
    expect(code(s, 1)).toBe('ΓΑΜΟΥ');
  });
  it('στοιχείο Εντύπων και αναγνώριση επικεφαλίδων', () => {
    expect(FIELDS.people.some(f => f.k === 'dcode')).toBe(true);
    const s = base(); s.statuses = [st(1, 'SICK')];
    expect(fieldValue(s, 'people', s.people[0] as never, 'dcode', 0, D)).toBe('ΑΝ.ΑΔ');
    expect(guessField('people', 'ΚΩΔΙΚΟΣ ΜΕΡΑΣ')).toBe('dcode');
    expect(guessField('people', 'Κατάσταση ημέρας')).toBe('dcode');
    expect(guessField('people', 'ΠΑΡΑΤΗΡΗΣΕΙΣ')).toBe('notes');
    expect(guessField('people', 'ΒΘΜ')).toBe('rank');
  });
});

describe('Δυναμολόγιο αξιολόγησης', () => {
  const pre = PRESETS.find(p => p.id === 'axiologisi')!;
  it('στήλες, ταξινόμηση, υπογραφές, πίνακας τιμών', () => {
    expect(pre.name).toBe('Δυναμολόγιο αξιολόγησης');
    expect(pre.opts.cols.map(c => c.h)).toEqual(['Α/Α', 'ΒΘΜ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΣΙ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']);
    expect(pre.opts.cols[6].f).toBe('dcode'); expect(pre.opts.sig).toBe('list'); expect(pre.sort).toBe('room');
    expect(pre.vals![0].rows.map(r => r.label)).toEqual(['ΤΟΠΟΘΕΤΗΜΕΝΟΙ', 'ΑΠΟΝΤΕΣ', 'ΠΑΡΟΝΤΕΣ', 'ΕΚΠΑΙΔΕΥΟΜΕΝΟΙ ΣμηΕΑ', 'ΕΛΕΥΘΕΡΟΙ ΥΠΗΡΕΣΙΑΣ/ΑΣΚΗΣΕΩΝ', 'ΑΟΠΛΟΙ']);
    expect(valsUsed(pre.vals)[0].rows).toHaveLength(6);   // και η «δική μου τιμή» βγαίνει
  });
  it('τα νούμερα βγαίνουν από τη Δύναμη', () => {
    const s = base(); s.people[7].si = 'Ι4';
    s.statuses = [st(1, 'LEAVE'), st(2, 'EY'), st(3, 'EA')];
    const v = pre.vals![0].rows.map(r => rowValue(s, D, 600, r));
    expect(v).toEqual([8, 1, 7, null, 2, 1]);
  });
  it('φτιάχνει πρότυπο Excel', async () => {
    const b = await buildTemplate(pre.opts, 'people');
    expect(b.cols.length).toBe(7); expect(rowsOf).toBeTypeOf('function'); expect(defaultPick).toBeTypeOf('function');
  });
});
