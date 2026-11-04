// «Εκτός δύναμης» από την καρτέλα του στρατιώτη (έλεγχος «όλα γράφονται στα Excel», 4/11): γράφεται στο φύλλο ΕΚΤΟΣ ΔΥΝΑΜΗΣ του
// Δυναμολογίου και δεν γυρίζει σε δύναμη με την επόμενη εισαγωγή του Δυναμολογίου. Μόνο ψεύτικα στοιχεία.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, planOutsideWrite } from '../src/shared/sources';
import { hkaiDiaLines } from '../src/shared/hkaiText';
import { fakeState } from './fixtures';

const TODAY = '2026-11-04';
const ctx: Ctx = { today: TODAY, newId: () => 'o' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const out = (s: AppState, p: Person, notes: string) => run(s, { t: 'updatePerson', person: { ...p, active: false, notes } });
const SHEET: RawSheet = { name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', rows: [['ΕΚΤΟΣ ΔΥΝΑΜΗΣ'], ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], []] };
const bind = { file: 'x.xlsx', sheet: SHEET.name, header: 1, cols: bestFor('outside', [SHEET])!.cols };
const row = (p: Person) => ({ rank: p.rank, spec: p.spec, last: p.last, first: p.first, father: p.father, asm: p.asm, phone: p.phone, room: p.room, si: p.si, role: p.role, essos: p.essos });

describe('εκτός δύναμης από την καρτέλα', () => {
  it('γράφεται στο φύλλο ΕΚΤΟΣ ΔΥΝΑΜΗΣ με τον λόγο', () => {
    const s0 = fakeState(5); const s = out(s0, s0.people[1], 'ΜΕΤΑΘΕΣΗ');
    expect(s.people[1].notes).toBe('Εκτός δύναμης: ΜΕΤΑΘΕΣΗ');
    const plan = planOutsideWrite(SHEET, bind, s);
    expect(plan.added).toBe(1);
    expect(plan.sets.find(x => x.c === bind.cols.remarks)?.v).toBe('ΜΕΤΑΘΕΣΗ');
    expect(plan.sets.find(x => x.c === bind.cols.last)?.v).toBe(s0.people[1].last);
    // ο λόγος στις ΔΙΑΓΡΑΦΕΣ της ΗΚΑΙ μένει ο ίδιος (χωρίς τη λέξη)
    expect(JSON.stringify(hkaiDiaLines(s, TODAY))).toContain('ΜΕΤΑΘΕΣΗ');
    expect(JSON.stringify(hkaiDiaLines(s, TODAY))).not.toContain('Εκτός');
  });
  it('χωρίς λόγο: γράφεται με κενές παρατηρήσεις', () => {
    const s0 = fakeState(5); const s = out(s0, s0.people[1], '');
    expect(s.people[1].notes).toBe('Εκτός δύναμης');
    expect(planOutsideWrite(SHEET, bind, s).added).toBe(1);
  });
  it('δεν γυρίζει σε δύναμη με νέα εισαγωγή του Δυναμολογίου (το ΣΥΝΟΛΙΚΟ τον έχει ακόμα)', () => {
    const s0 = fakeState(5); const s = out(s0, s0.people[1], 'ΜΕΤΑΘΕΣΗ');
    const back = run(s, { t: 'importPeople', rows: s0.people.map(row), source: 'Δ.xlsx', deactivateMissing: true });
    expect(back.people[1].active).toBe(false);
  });
  it('ξανά σε δύναμη από την καρτέλα: φεύγει από το φύλλο, μένει ο λόγος στη σημείωση', () => {
    const s0 = fakeState(5); const s = out(s0, s0.people[1], 'ΜΕΤΑΘΕΣΗ');
    const s2 = run(s, { t: 'updatePerson', person: { ...s.people[1], active: true } });
    expect(s2.people[1].notes).toBe('ΜΕΤΑΘΕΣΗ'); expect(s2.people[1].active).toBe(true);
    expect(planOutsideWrite(SHEET, bind, s2).added).toBe(0);
  });
  it('άλλη αλλαγή σε κάποιον εκτός δύναμης δεν αλλάζει τη σημείωσή του', () => {
    const s0 = fakeState(5); const s = out(s0, s0.people[1], 'ΜΕΤΑΘΕΣΗ');
    const s2 = run(s, { t: 'updatePerson', person: { ...s.people[1], phone: '6911111111' } });
    expect(s2.people[1].notes).toBe('Εκτός δύναμης: ΜΕΤΑΘΕΣΗ');
  });
});
