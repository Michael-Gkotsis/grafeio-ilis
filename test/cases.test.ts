// Πίνακας περιπτώσεων (έρευνα §4.4): κάθε κανόνας του λοχία με μία περίπτωση «επιτρέπεται» και μία «απαγορεύεται»,
// ημερομηνίες-παγίδες, σειρά δικαιοσύνης, προέλεγχος, εισαγωγή Δυναμολογίου, αντίγραφα, ασφαλής εγγραφή.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { postsOf, statOf, hkaiCounts, dutyBlock, lastResort, nextFor, swapCheck, fillDay, guardUnavailable, isHol, outBlock, ruleBlock, statusesOn, whyText, seedRank, fairOf, isRecordExpiredOn } from '../src/shared/rules';
import { preflight, hasErrors } from '../src/shared/preflight';
import { parseRoster, isPersonRow } from '../src/shared/roster';
import { addDays, daysBetween, dow, milDate } from '../src/shared/dates';
import { backupsToDelete } from '../src/main/db';
import { writeXlsx, isLocked, PREV_DIR, KEEP_PREV } from '../src/main/files';
import { DEFAULT_BLOCKS_SPEN, DEFAULT_SETTINGS, migrateSettings, type AppState, type TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';
import { daysWord, overMax, punBySuggestions, punText } from '../src/shared/punish';
import { usbDue, usbAge, newsSince, USB_DAYS } from '../src/shared/reminders';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'c' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const declare = (s: AppState, type: TypeKey, pid: number, from: string, to = from, extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type, pids: [pid], from, to, ...extra } as any });
const armed = (s: AppState) => ({ ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (b.id === 'th' ? { ...b, armed: true } : b)) } });
const D = '2026-10-13'; // Τρίτη

describe('Κ-Υ1 ένοπλες θέσεις', () => {
  for (const t of ['EA', 'EY', 'EO', 'NOS', 'STEP'] as TypeKey[]) {
    it(t + ': όχι σε ένοπλη', () => {
      const s = declare(armed(fakeState(20)), t, 2, D);
      expect(guardUnavailable(s, D, 2, 'th1')).toBeTruthy();
      expect(() => run(s, { t: 'assign', date: D, k: 'th1', pid: 2 })).toThrow();
    });
  }
  it('ΕΑ: επιτρέπεται σε άοπλη θέση (Κ-Υ2), αλλά όχι σε μαγειρεία (λοχίας, 10/10)', () => {
    const s = declare(armed(fakeState(20)), 'EA', 2, D);
    expect(guardUnavailable(s, D, 2, 'th5')).toBeNull();
    expect(run(s, { t: 'assign', date: D, k: 'th5', pid: 2 }).guards[D].th5).toBe(2);
    expect(guardUnavailable(s, D, 2, 'mg1')).toMatch(/Όχι μαγειρεία: ΕΑ/);
    // κανένα πλήρες μπλοκάρισμα (Michael, 17/10): χωρίς αιτία όχι, με αιτία ναι
    expect(() => run(s, { t: 'assign', date: D, k: 'mg1', pid: 2 })).toThrow(/Όχι μαγειρεία/);
    expect(run(s, { t: 'assign', date: D, k: 'mg1', pid: 2, force: 'δοκιμή' }).guards[D].mg1).toBe(2);
  });
  it('ΕΥ: ούτε σε άοπλη', () => {
    const s = declare(fakeState(20), 'EY', 2, D);
    expect(dutyBlock(s.statuses, D, 2, { armed: false })).toMatch(/ΕΥ/);
  });
  it('χωρίς κατάσταση: επιτρέπεται σε ένοπλη', () => {
    expect(guardUnavailable(armed(fakeState(20)), D, 2, 'th1')).toBeNull();
  });
});

describe('Κ-Υ3 άδεια', () => {
  it('με άδεια δεν μπαίνει σε καμία θέση', () => {
    const s = declare(fakeState(20), 'LEAVE', 3, '2026-10-12', '2026-10-15');
    expect(guardUnavailable(s, D, 3, 'mg1')).toMatch(/^ΚΑ /);
  });
  it('μετά τη λήξη της άδειας μπαίνει ξανά', () => {
    const s = declare(fakeState(20), 'LEAVE', 3, '2026-10-12', '2026-10-15');
    expect(guardUnavailable(s, '2026-10-16', 3, 'mg1')).toBeNull();
  });
  it('άδεια πάνω σε υπάρχουσα υπηρεσία αδειάζει τη θέση', () => {
    let s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 3 });
    s = declare(s, 'LEAVE', 3, D, '2026-10-20');
    expect(s.guards[D].mg1).toBeUndefined();
  });
});

describe('Κ-Υ5, Κ-Υ6 ανάπαυση και ΣΚ', () => {
  it('ανάπαυση 1 ημέρας: όχι δύο μέρες στη σειρά', () => {
    const s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 4 });
    expect(ruleBlock(s, addDays(D, 1), 4)).toMatch(/ανάπαυση/);
    expect(ruleBlock(s, addDays(D, 2), 4)).toBeNull();
  });
  it('όχι ΣΚ μετά από ΣΚ, αλλά επιτρέπεται με δύο εβδομάδες διαφορά', () => {
    const s = run(fakeState(20), { t: 'assign', date: '2026-10-17', k: 'mg1', pid: 4 }); // Σάββατο
    expect(ruleBlock(s, '2026-10-24', 4)).toMatch(/αργία/);
    expect(ruleBlock(s, '2026-10-31', 4)).toBeNull();
  });
  it('28/10 (Τετάρτη) μετρά ως αργία', () => {
    const s = fakeState(5);
    expect(isHol(s.settings, '2026-10-28')).toBe(true);
    expect(isHol(s.settings, '2026-10-27')).toBe(false);
  });
  it('η Παρασκευή δεν μετρά ως ΣΚ (η υπηρεσία μετρά στη μέρα που ξεκινά, 10 §4β)', () => {
    expect(isHol(fakeState(5).settings, '2026-10-16')).toBe(false);
  });
  it('ο κανόνας παρακάμπτεται μόνο με αιτιολογία, που γράφεται στο ιστορικό', () => {
    const s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 4 });
    expect(() => run(s, { t: 'assign', date: addDays(D, 1), k: 'mg2', pid: 4 })).toThrow(/ανάπαυση/);
    const r = apply(s, { t: 'assign', date: addDays(D, 1), k: 'mg2', pid: 4, force: 'δεν φτάνει ο κόσμος' }, ctx);
    expect(r.state.guards[addDays(D, 1)].mg2).toBe(4);
    expect(r.text).toMatch(/Αιτία: δεν φτάνει ο κόσμος/);
  });
  it('διπλοθεσία μόνο με αιτία· «μετακίνηση» αδειάζει την παλιά θέση', () => {
    const s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 4 });
    expect(() => run(s, { t: 'assign', date: D, k: 'mg2', pid: 4 })).toThrow(/ήδη/);
    const both = run(s, { t: 'assign', date: D, k: 'mg2', pid: 4, force: 'λίγοι διαθέσιμοι' });
    expect(both.guards[D].mg1).toBe(4); expect(both.guards[D].mg2).toBe(4);
    const moved = run(s, { t: 'assign', date: D, k: 'mg2', pid: 4, move: 'mg1' });
    expect(moved.guards[D].mg1).toBeFalsy(); expect(moved.guards[D].mg2).toBe(4);
  });
});

describe('Κ-Ι1, Κ-Τ1 αυτόματη λήξη', () => {
  it('ΕΑ που έληξε χθες δεν ισχύει σήμερα και γράφεται στο ιστορικό', () => {
    const s = declare(fakeState(10), 'EA', 2, '2026-10-05', '2026-10-11');
    expect(statusesOn(s.statuses, 2, '2026-10-12')).toHaveLength(0);
    expect(isRecordExpiredOn(s.statuses[0], '2026-10-12')).toBe(true);
    const r = apply(s, { t: 'expire' }, ctx);
    expect(r.extra?.[0]).toMatch(/Έληξε: ΕΑ/);
  });
  it('ΕΑ που λήγει σήμερα ισχύει ακόμα σήμερα', () => {
    const s = declare(fakeState(10), 'EA', 2, '2026-10-05', '2026-10-12');
    expect(statusesOn(s.statuses, 2, '2026-10-12')).toHaveLength(1);
  });
  it('εγκεκριμένη ποινή λήγει μόνη της', () => {
    let s = declare(fakeState(10), 'PUN', 2, '2026-10-05', '2026-10-11', { kind: 'Περιορισμός' });
    s = run(s, { t: 'approvePun', id: s.statuses[0].id });
    expect(outBlock(s, '2026-10-11', 2)).toMatch(/ΠΕΡΙΟΡΙΣΜΟΣ/);
    expect(outBlock(s, '2026-10-12', 2)).toBeNull();
  });
});

describe('Κ-Ε εξοδούχοι', () => {
  const outs = (s: AppState, pid: number, to: TypeKey = 'OUT') => run(s, { t: 'outs', date: D, changes: [{ pid, from: null, to }] });
  it('Κ-Ε1: με υπηρεσία δεν βγαίνει', () => {
    const s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 5 });
    expect(() => outs(s, 5)).toThrow(/υπηρεσία/);
  });
  for (const t of ['EY', 'STEP'] as TypeKey[]) {
    it('Κ-Ε2: ' + t + ' δεν βγαίνει', () => { expect(() => outs(declare(fakeState(20), t, 5, D), 5)).toThrow(); });
  }
  it('Κ-Ε2: ΕΑ βγαίνει', () => { expect(outs(declare(fakeState(20), 'EA', 5, D), 5).statuses.some(x => x.type === 'OUT')).toBe(true); });
  it('Κ-Ε3: τιμωρημένος δεν βγαίνει, και ούτε με «δήλωση» εξόδου', () => {
    let s = declare(fakeState(20), 'PUN', 5, D, D, { kind: 'Περιορισμός' });
    s = run(s, { t: 'approvePun', id: s.statuses[0].id });
    expect(() => outs(s, 5)).toThrow(/ΠΕΡΙΟΡΙΣΜΟΣ/);
    expect(() => declare(s, 'OUT', 5, D)).toThrow(/δεν βγαίνει/);
  });
  it('Κ-Ε3: η ποινή ισχύει αμέσως, χωρίς έγκριση (Michael, 17/10)', () => {
    const s = declare(fakeState(20), 'PUN', 5, D, D, { kind: 'Κράτηση' });
    expect(s.statuses[0].pending).toBeUndefined();
    expect(outBlock(s, D, 5)).toMatch(/ΚΡΑΤΗΣΗ/);
    expect(() => outs(s, 5)).toThrow(/ΚΡΑΤΗΣΗ/);
  });
  it('Κ-Ε4: ΔΝ', () => { expect(outs(fakeState(20), 5, 'DN').statuses.find(x => x.pid === 5)!.type).toBe('DN'); });
  it('εξοδούχος δεν μπαίνει σε υπηρεσία την ίδια μέρα', () => {
    expect(guardUnavailable(outs(fakeState(20), 5), D, 5, 'mg1')).toBeTruthy();
  });
});

describe('ημερομηνίες-παγίδες', () => {
  it('αλλαγή ώρας 25/10/2026: οι μέρες μετράνε σωστά', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(3);
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
  });
  it('τέλος μήνα και 29/2', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(dow('2028-02-29')).toBe('Τρί');
  });
  it('στρατιωτική μορφή ημερομηνίας', () => { expect(milDate('2026-10-28')).toBe('28 Οκτ 26'); });
  it('το «έως» δεν πάει πριν από το «από»', () => {
    expect(() => declare(fakeState(5), 'EA', 2, '2026-10-15', '2026-10-14')).toThrow(/πριν/);
  });
});

describe('σειρά δικαιοσύνης (έρευνα §3.2)', () => {
  it('η ίδια μέρα δίνει πάντα την ίδια πρόταση', () => {
    const s = fakeState(40);
    expect(fillDay(s, D).guards[D]).toEqual(fillDay(s, D).guards[D]);
  });
  it('η κλήρωση δεν διαλέγει αλφαβητικά', () => {
    const s = fakeState(40);
    const first = fillDay(s, D).guards[D].ly;
    const firstOther = fillDay(s, addDays(D, 7)).guards[addDays(D, 7)].ly;
    expect(first === 1 && firstOther === 1).toBe(false);
    expect(seedRank(D, 1)).not.toBe(seedRank(D, 2));
  });
  it('καθημερινή: πρώτα όποιος έχει περισσότερες μέρες χωρίς υπηρεσία', () => {
    let s = fakeState(3);
    s = { ...s, settings: { ...s.settings, blocks: [{ id: 'mg', kind: 'mg', name: 'Μ', armed: false, posts: [{ k: 'mg1', label: 'Μ1', short: '1' }] }] } };
    s = run(s, { t: 'assign', date: '2026-10-01', k: 'mg1', pid: 1 });
    s = run(s, { t: 'assign', date: '2026-10-05', k: 'mg1', pid: 2 });
    s = run(s, { t: 'assign', date: '2026-10-08', k: 'mg1', pid: 3 });
    expect(fillDay(s, D).guards[D].mg1).toBe(1);
    expect(whyText({ ...s, guards: fillDay(s, D).guards }, D, 'mg1')).toMatch(/11 μέρες χωρίς υπηρεσία/);
  });
  it('αργία: πρώτα όποιος έχει λιγότερες αργίες', () => {
    let s = fakeState(2);
    s = { ...s, settings: { ...s.settings, blocks: [{ id: 'mg', kind: 'mg', name: 'Μ', armed: false, posts: [{ k: 'mg1', label: 'Μ1', short: '1' }] }] } };
    s = run(s, { t: 'assign', date: '2026-10-03', k: 'mg1', pid: 1 }); // Σάββατο
    s = run(s, { t: 'assign', date: '2026-10-07', k: 'mg1', pid: 2 }); // Τετάρτη
    s = { ...s, rules: { ...s.rules, noConsecHol: false } };
    expect(fillDay(s, '2026-10-17').guards['2026-10-17'].mg1).toBe(2);
    expect(fairOf(s, 1, '2026-10-17').hol).toBe(1);
  });
  it('θέση που κανείς δεν επιτρέπεται μένει κενή, όχι σιωπηλή παραβίαση', () => {
    let s = fakeState(1);
    s = declare(s, 'LEAVE', 1, D);
    const r = fillDay(s, D);
    expect(r.n).toBe(0); expect(r.empty.length).toBeGreaterThan(0);
  });
});

describe('προέλεγχος', () => {
  it('ΦΡΟΥΡΑ: κενές θέσεις = ⚠, όχι ✕', () => {
    const c = preflight('froura', fakeState(40), D);
    expect(hasErrors(c)).toBe(false); expect(c.length).toBeGreaterThan(0);
  });
  it('ΦΡΟΥΡΑ: πλήρης χωρίς λάθη = καθαρό', () => {
    const s = fakeState(40); const full = { ...s, guards: fillDay(s, D).guards };
    expect(preflight('froura', full, D)).toEqual([]);
  });
  it('ΦΡΟΥΡΑ: άτομο σε δύο θέσεις ή με ιατρικό σε ένοπλη = ⚠ (μπορεί να μπήκε με αιτία), όχι ✕', () => {
    const s = armed(fakeState(40));
    const twice = { ...s, guards: { [D]: { th1: 2, th2: 2 } } };
    expect(hasErrors(preflight('froura', twice, D))).toBe(false);
    expect(preflight('froura', twice, D).some(c => /δύο θέσεις/.test(c.text))).toBe(true);
    const sick = declare({ ...s, guards: { [D]: { th1: 3 } } }, 'EA', 3, D);
    // η δήλωση ΕΑ το βγάζει μόνη της από τη θέση· αν μπει με το χέρι στη βάση, ο προέλεγχος το πιάνει
    expect(sick.guards[D].th1).toBeUndefined();
    expect(hasErrors(preflight('froura', { ...sick, guards: { [D]: { th1: 3 } } }, D))).toBe(false);
    expect(preflight('froura', { ...sick, guards: { [D]: { th1: 3 } } }, D).some(c => c.level === 'warn' && /ΕΑ/.test(c.text))).toBe(true);
  });
  it('Εξοδούχοι: τιμωρημένος εξοδούχος = ⚠, όχι ✕', () => {
    let s = run(fakeState(20), { t: 'outs', date: D, changes: [{ pid: 5, from: null, to: 'OUT' }] });
    // η δήλωση ποινής ακυρώνει μόνη της την έξοδο· εδώ η ποινή ήρθε αλλιώς (π.χ. από το Excel)
    s = { ...s, statuses: [...s.statuses, { id: 'pun5', pid: 5, type: 'PUN', from: D, to: D, kind: 'Κράτηση' }] };
    expect(hasErrors(preflight('outs', s, D))).toBe(false);
    expect(preflight('outs', s, D).some(c => /δεν βγαίνει/.test(c.text))).toBe(true);
  });
  it('ΗΚΑΙ: τα αθροίσματα συμφωνούν και κανείς δεν μετριέται δύο φορές', () => {
    let s = fakeState(40);
    s = { ...s, guards: fillDay(s, D).guards, settings: { ...s.settings, cadre: { ...s.settings.cadre, 'Ίλαρχοι': 1 } } };
    s = declare(s, 'LEAVE', 30, D); s = declare(s, 'EY', 31, D);
    expect(preflight('hkai', s, D).filter(c => c.level === 'err')).toEqual([]);
  });
});

describe('Δυναμολόγιο', () => {
  it('αγνοεί τις γραμμές συνόλων κάτω από τα ονόματα', () => {
    const rows: any[][] = [['ΔΥΝΑΜΟΛΟΓΙΟ Γ ΕΣΣΟ 2026'], ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΘΑΛΑΜΟΣ'],
      [1, 'ΣΤΡ', 'ΔΟΚΙΜΙΟΣ', 'ΑΛΦΑΣ', 'ΠΑΤΕΡΑΣ', '900001', 1], [2, 'ΣΤΡ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΒΗΤΑΣ', 'ΠΑΤΕΡΑΣ', '900002', 2],
      [null, null, 'ΣΥΝΟΛΟ', 'ΣΥΝΟΛΟ', 155], [null, null, 'ΘΑΛΑΜΟΙ', 'ΘΑΛΑΜΟΙ', 'ΣΤΡΑΤΙΩΤΕΣ'], [null, null, '1ΟΣ', '1ΟΣ', 20],
      [null, null, 'ΑΔΕΙΕΣ', 'ΑΔΕΙΕΣ', 0], [null, null, 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ', 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ', 0]];
    const r = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows }]);
    expect(r.rows.map(x => x.last)).toEqual(['ΔΟΚΙΜΙΟΣ', 'ΥΠΟΘΕΤΙΔΗΣ']);
    expect(r.essos).toBe('2026 Γ΄');
    expect(r.skipped).toEqual(['ΣΥΝΟΛΟ', 'ΘΑΛΑΜΟΙ', '1ΟΣ', 'ΑΔΕΙΕΣ', 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ']);
    // το φύλλο γράφει ΣΥΝΟΛΟ 155 αλλά βρέθηκαν 2: προειδοποίηση πριν την εισαγωγή
    expect(r.declared).toBe(155); expect(r.found).toBe(2);
    expect(r.warnings[0]).toMatch(/ΣΥΝΟΛΟ 155, αλλά βρέθηκαν 2/);
  });
  it('όταν το ΣΥΝΟΛΟ ταιριάζει δεν υπάρχει προειδοποίηση· γραμμή χωρίς ΑΣΜ/τηλέφωνο/θάλαμο σημειώνεται', () => {
    const rows: any[][] = [['ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΘΑΛΑΜΟΣ'],
      ['ΣΤΡ', 'ΔΟΚΙΜΙΟΣ', 'ΑΛΦΑΣ', 'Π', '900001', 1], ['ΣΤΡ', 'ΣΗΜΕΙΩΣΗ', 'ΚΑΤΙ', 'Π', '', ''], [null, 'ΣΥΝΟΛΟ', 'ΣΥΝΟΛΟ', 2]];
    const r = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows }]);
    expect(r.declared).toBe(2); expect(r.found).toBe(2);
    expect(r.warnings.some(w => /ΣΥΝΟΛΟ/.test(w))).toBe(false);
    expect(r.suspicious).toEqual(['ΣΗΜΕΙΩΣΗ ΚΑΤΙ']);
  });
  it('δέχεται κανονικά ονόματα με τόνους, παύλα και διπλά επώνυμα', () => {
    expect(isPersonRow('Παπαδόπουλος-Δοκιμίου', 'Άλφας', 'Πατέρας')).toBe(true);
    expect(isPersonRow('8ΟΣ', '8ΟΣ', '18')).toBe(false);
  });
  it('νέα εισαγωγή σβήνει τις λάθος γραμμές της παλιάς που δεν έχουν ιστορικό', () => {
    const base = fakeState(0);
    const row = (last: string, asm: string) => ({ rank: 'ΣΤΡ', spec: '', last, first: 'ΑΛΦΑΣ', father: 'Π', asm, phone: '', room: 1, si: '', post: null, role: null, essos: '', attached: false, notes: '' });
    let s = run(base, { t: 'importPeople', rows: [row('ΔΟΚΙΜΙΟΣ', '1'), row('ΣΥΝΟΛΟ', ''), row('ΤΥΧΑΙΟΣ', '3')], source: 'α', deactivateMissing: false });
    s = run(s, { t: 'assign', date: D, k: 'mg1', pid: 3 });
    s = run(s, { t: 'importPeople', rows: [row('ΔΟΚΙΜΙΟΣ', '1')], source: 'β', deactivateMissing: true });
    expect(s.people.map(p => [p.last, p.active])).toEqual([['ΔΟΚΙΜΙΟΣ', true], ['ΤΥΧΑΙΟΣ', false]]);
  });
});

describe('αντίγραφα βάσης', () => {
  it('κρατά 14 μέρες, 1 ανά εβδομάδα για 8 εβδομάδες, 1 ανά μήνα', () => {
    const names: string[] = [];
    for (let i = 0; i < 200; i++) { const d = addDays('2026-10-12', -i); names.push('ilh_' + d + '_090000_ημερήσιο.db'); if (i < 3) names.push('ilh_' + d + '_120000_πριν-εισαγωγή.db'); }
    const del = new Set(backupsToDelete(names, '2026-10-12'));
    const kept = names.filter(n => !del.has(n));
    expect(kept.filter(n => n.slice(4, 14) >= addDays('2026-10-12', -13)).length).toBe(14 + 3);
    expect(kept.length).toBeLessThan(14 + 3 + 9 + 6);
    expect(kept.length).toBeGreaterThan(14 + 3 + 6);
  });
});

describe('ασφαλής εγγραφή Excel', () => {
  const xlsx = async (v: string) => { const z = new JSZip(); z.file('[Content_Types].xml', '<x/>'); z.file('xl/workbook.xml', '<w>' + v + '</w>'); return z.generateAsync({ type: 'nodebuffer' }); };
  it('γράφει, κρατά την προηγούμενη έκδοση και δεν αφήνει .tmp', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-'));
    await writeXlsx(dir, 'a.xlsx', await xlsx('1'));
    await writeXlsx(dir, 'a.xlsx', await xlsx('2'));
    expect(fs.readdirSync(dir).sort()).toEqual([PREV_DIR, 'a.xlsx']);
    expect(fs.readdirSync(path.join(dir, PREV_DIR))).toHaveLength(1);
    expect(isLocked(path.join(dir, 'a.xlsx'))).toBe(false);
  });
  it(`κρατά μόνο τις ${KEEP_PREV} τελευταίες εκδόσεις`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-'));
    for (let i = 0; i < KEEP_PREV + 3; i++) { await writeXlsx(dir, 'b.xlsx', await xlsx(String(i))); await new Promise(r => setTimeout(r, 1005 * (i > KEEP_PREV ? 1 : 0))); }
    expect(fs.readdirSync(path.join(dir, PREV_DIR)).length).toBeLessThanOrEqual(KEEP_PREV);
  }, 20000);
  it('χαλασμένο αρχείο δεν αντικαθιστά το καλό', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-'));
    await writeXlsx(dir, 'c.xlsx', await xlsx('ok'));
    await expect(writeXlsx(dir, 'c.xlsx', Buffer.from('όχι zip'))).rejects.toThrow();
    expect(fs.readdirSync(dir).sort()).toEqual(['c.xlsx']);
  });
});

describe('Υπενθυμίσεις «Σήμερα»', () => {
  it(`αντίγραφο σε USB: ποτέ ή πάνω από ${USB_DAYS} μέρες → υπενθύμιση`, () => {
    expect(usbDue(null, '2026-10-12')).toBe(true);
    expect(usbAge('2026-10-05', '2026-10-12')).toBe(7);
    expect(usbDue('2026-10-05', '2026-10-12')).toBe(false);
    expect(usbDue('2026-10-04', '2026-10-12')).toBe(true);
    expect(usbDue('2026-09-28', '2026-10-01')).toBe(false);   // αλλαγή μήνα
  });
  it('τι άλλαξε: μόνο από το προηγούμενο άνοιγμα ως το τωρινό, χωρίς τα αναιρεμένα', () => {
    const e = (id: number, undone = false) => ({ id, at: '10:00', day: '2026-10-12', text: 't' + id, files: [], source: 'app' as const, undoable: true, undone });
    const audit = [e(9), e(8), e(7, true), e(6), e(5), e(4)];
    expect(newsSince(audit, 5, 8).map(x => x.id)).toEqual([8, 6]);
    expect(newsSince(audit, 9, 9)).toEqual([]);
  });
});

describe('Απαντήσεις του λοχία (10/10)', () => {
  const spen = (s: AppState, blocksSpen = s.settings.blocksSpen): AppState => ({ ...s, settings: { ...s.settings, phase: 'spen' as const, blocksSpen } });
  it('ΕΟ/ΕΑ σε άοπλη σκοπιά: μόνο αν δεν υπάρχει άλλος, με προειδοποίηση', () => {
    const sk = { ...DEFAULT_BLOCKS_SPEN.find(b => b.id === 'sk')!, armed: false };
    const s = declare(spen(fakeState(3), [sk]), 'EO', 1, D);
    expect(lastResort(s.statuses, D, 1, { kind: 'sk' })).toMatch(/ΕΟ: σκοπιά μόνο αν δεν υπάρχει άλλος/);
    const r = fillDay(s, D);
    expect(r.guards[D].sk3a).not.toBe(1); expect(r.guards[D].sk3b).not.toBe(1);
    expect(r.guards[D].sk4a).toBe(1);
    expect(r.warn).toHaveLength(1);
    expect(r.empty).toEqual(['sk4b']);
  });
  it('3ο/4ο νούμερο: ξανά στο ίδιο νούμερο μετά από 3 ημέρες, μαζί με την ανάπαυση', () => {
    let s = spen(fakeState(20));
    s = run(s, { t: 'assign', date: D, k: 'th3', pid: 2 });
    const D2 = addDays(D, 2), D3 = addDays(D, 3);
    expect(guardUnavailable(s, addDays(D, 1), 2, 'th1')).toMatch(/ανάπαυση/);
    expect(guardUnavailable(s, D2, 2, 'th3')).toMatch(/3ο νούμερο στις 13\/10/);
    expect(guardUnavailable(s, D2, 2, 'sk3a')).toMatch(/3ο νούμερο/);
    expect(guardUnavailable(s, D2, 2, 'th4')).toBeNull();
    expect(guardUnavailable(s, D3, 2, 'th3')).toBeNull();
    expect(() => run(s, { t: 'assign', date: D2, k: 'th3', pid: 2 })).toThrow(/νούμερο/);
    expect(run(s, { t: 'assign', date: D2, k: 'th3', pid: 2, force: 'αλλαγή ΣΚ' }).guards[D2].th3).toBe(2);
    expect(fillDay(s, D2).guards[D2].th3).not.toBe(2);
    expect(ruleBlock({ ...s, rules: { ...s.rules, numRest: 0 } }, D2, 2, undefined, 'th3')).toBeNull();
  });
  it('ΤΑΕ: ένοπλη, χωρίς ώρες· οι παλιές ρυθμίσεις διορθώνονται', () => {
    const tae = DEFAULT_BLOCKS_SPEN.find(b => b.id === 'tae')!;
    expect(tae.armed).toBe(true); expect(tae.posts[0].hrs).toBe('');
    const old = { ...DEFAULT_SETTINGS, rev: 0, blocksSpen: DEFAULT_BLOCKS_SPEN.map(b => (b.id === 'tae' ? { ...b, armed: false, posts: [{ ...b.posts[0], hrs: 'ημέρα' }] } : b)) };
    const m = migrateSettings(old as any);
    expect(m.blocksSpen.find(b => b.id === 'tae')).toMatchObject({ armed: true, posts: [{ hrs: '' }] });
    expect(m.rev).toBe(5);
    const turnedOff = { ...m, blocksSpen: m.blocksSpen.map(b => (b.id === 'tae' ? { ...b, armed: false } : b)) };
    expect(migrateSettings(turnedOff).blocksSpen.find(b => b.id === 'tae')!.armed).toBe(false);
  });
  it('Μόνιμοι Λ/Υ και Δ/Υ: μπαίνουν κάθε μέρα εκτός σειράς· αν λείπει ένας, η θέση γεμίζει με τη σειρά', () => {
    let s = fakeState(30); s = { ...s, settings: { ...s.settings, fixed: { ly: 7, dy: 8 } } };
    for (const d of [D, addDays(D, 1)]) s = run(s, { t: 'autofill', date: d });
    for (const d of [D, addDays(D, 1)]) {
      expect(s.guards[d].ly).toBe(7); expect(s.guards[d].dy).toBe(8);
      expect(Object.entries(s.guards[d]).filter(([, p]) => p === 7 || p === 8)).toHaveLength(2);
    }
    expect(preflight('froura', s, addDays(D, 1)).filter(c => c.text.includes('(Λ/Υ') || c.text.includes('(Δ/Υ'))).toEqual([]);
    const D2 = addDays(D, 2);
    s = declare(s, 'EY', 7, D2);
    s = run(s, { t: 'autofill', date: D2 });
    expect(s.guards[D2].ly).not.toBe(7); expect(s.guards[D2].ly).not.toBe(8); expect(s.guards[D2].ly).toBeTruthy();
    expect(s.guards[D2].dy).toBe(8);
    // αλλαγή για μία μέρα: ο αντικαταστάτης μετρά υπηρεσία κανονικά
    const D3 = addDays(D, 3), far = addDays(D, 10);
    const busy = new Set([D2, D3, addDays(D, 4)].flatMap(d => Object.values(s.guards[d] || {})));
    const sub = s.people.find(p => !busy.has(p.id) && p.id !== 7 && p.id !== 8)!.id;
    const before = fairOf(s, sub, far).total;
    s = run(s, { t: 'assign', date: D3, k: 'ly', pid: sub });
    expect(s.guards[D3].ly).toBe(sub);
    expect(fairOf(s, sub, far).total).toBe(before + 1);
  });
});

describe('Από την εφαρμογή του άλλου γραφέα', () => {
  it('«Επόμενος»: ο επόμενος στη σειρά με τους ίδιους κανόνες, και ο μεθεπόμενος', () => {
    let s = run(fakeState(30), { t: 'autofill', date: D });
    const cur = s.guards[D].th1;
    const n1 = nextFor(s, D, 'th1', [cur])!;
    expect(n1).toBeTruthy(); expect(n1).not.toBe(cur);
    expect(Object.values(s.guards[D])).not.toContain(n1);
    expect(guardUnavailable({ ...s, guards: { ...s.guards, [D]: { ...s.guards[D], th1: 0 } } }, D, n1, 'th1')).toBeNull();
    const n2 = nextFor(s, D, 'th1', [cur, n1])!;
    expect(n2).not.toBe(n1); expect(n2).not.toBe(cur);
    s = run(s, { t: 'assign', date: D, k: 'th1', pid: n1 });
    expect(s.guards[D].th1).toBe(n1);
  });
  it('Ανταλλαγή δύο ατόμων με έλεγχο κανόνων και για τους δύο', () => {
    let s = run(fakeState(30), { t: 'autofill', date: D });
    const a = s.guards[D].th1, b = s.guards[D].mg1;
    s = run(s, { t: 'swapPosts', date: D, a: 'th1', b: 'mg1' });
    expect(s.guards[D].th1).toBe(b); expect(s.guards[D].mg1).toBe(a);
    // ΕΟ δεν πάει σε μαγειρεία ούτε με ανταλλαγή
    s = declare(s, 'EO', b, D);
    expect(swapCheck(s, D, 'th1', 'mg1').soft).toMatch(/Όχι μαγειρεία/);   // μόνο με αιτιολογία, όχι απαγόρευση (Michael, 17/10)
    expect(() => run(s, { t: 'swapPosts', date: D, a: 'th1', b: 'mg1' })).toThrow(/ανταλλαγή/);
    expect(run(s, { t: 'swapPosts', date: D, a: 'th1', b: 'mg1', force: 'εντολή λοχία' }).guards[D].mg1).toBe(b);
  });
  it('Πόστο: καμία υπηρεσία εκτός από Λ/Υ και Δ/Υ', () => {
    const s = fakeState(20); // ο 6 έχει πόστο
    for (const k of ['th1', 'mg1']) expect(guardUnavailable(s, D, 6, k)).toMatch(/Πόστο/);
    const sp = { ...s, settings: { ...s.settings, phase: 'spen' as const } };
    expect(guardUnavailable(sp, D, 6, 'tae')).toMatch(/Πόστο/);
    expect(guardUnavailable(s, D, 6, 'ly')).toBeNull();
  });
  it('ΣΚ: μετρούν μόνο οι αργίες, όχι ΔΝ, έξοδος ή θάλαμος (Michael, 17/10)', () => {
    const SAT = '2026-10-17';
    let s = fakeState(40);
    // όλοι όσοι δεν έχουν ΔΝ έκαναν ήδη μία αργία· όσοι έχουν ΔΝ (και θάλαμο που βγαίνει) καμία: μπαίνουν αυτοί
    const dn = new Set([2, 3, 4, 7, 8]);
    s = { ...s, people: s.people.map(p => (dn.has(p.id) ? { ...p, dn: true, room: 1 } : p)), baseline: Object.fromEntries(s.people.filter(p => !dn.has(p.id)).map(p => [p.id, { hol: 1 }])) };
    const used = new Set(Object.values(fillDay(s, SAT).guards[SAT]));
    for (const id of dn) expect(used.has(id)).toBe(true);
  });
  it('Πέμπτη-Παρασκευή: όσοι χρωστάνε ΣΚ μένουν για το ΣΚ, και η ανάπαυση τηρείται (Michael, 17/10)', () => {
    const FRI = '2026-10-16', SAT = '2026-10-17';
    let s = fakeState(80);
    // οι 20 πρώτοι δεν έχουν κάνει καμία αργία, οι άλλοι από μία: την Παρασκευή δεν μπαίνει κανείς από τους 20
    // (όσοι έχουν πόστο κάνουν μόνο Λ/Υ και Δ/Υ και δεν «χρωστάνε» ΣΚ: μένουν έξω από τη μέτρηση)
    const zero = new Set(s.people.slice(0, 20).map(p => p.id));
    const owe = new Set(s.people.slice(0, 20).filter(p => !p.post).map(p => p.id));
    s = { ...s, baseline: Object.fromEntries(s.people.filter(p => !zero.has(p.id)).map(p => [p.id, { hol: 1 }])) };
    s = { ...s, guards: fillDay(s, FRI).guards };
    const fri = Object.values(s.guards[FRI]);
    expect(fri.filter(id => owe.has(id))).toEqual([]);
    // και το Σάββατο μπαίνουν αυτοί, αφού δεν έχουν υπηρεσία την Παρασκευή
    const sat = new Set(Object.values(fillDay(s, SAT).guards[SAT]));
    expect([...owe].filter(id => sat.has(id)).length).toBeGreaterThanOrEqual(Math.min(owe.size, sat.size) - 3);
  });
  it('ΣΤΕΠ: σε καμία υπηρεσία, ούτε άοπλη (Michael, 13/10)', () => {
    const s = declare(fakeState(20), 'STEP', 2, D);
    for (const k of ['th5', 'mg1']) expect(guardUnavailable(s, D, 2, k)).toMatch(/ΣΤΕΠ/);
  });
});

describe('Κείμενο ποινής', () => {
  it('γράφει πρόταση για το Word με τη διάρκεια ολογράφως', () => {
    let s = fakeState(5);
    s = run(s, { t: 'declare', cmd: { type: 'PUN', pids: [2], from: '2026-10-13', to: '2026-10-14', kind: 'Κράτηση', by: 'ΛΧΙΑ ΑΓΝΩΣΤΟΠΟΥΛΟ', reason: 'άργησε στο προσκλητήριο.', on: '2026-10-12' } as any });
    const st = s.statuses.find(x => x.type === 'PUN')!;
    expect(st).toMatchObject({ by: 'ΛΧΙΑ ΑΓΝΩΣΤΟΠΟΥΛΟ', on: '2026-10-12' });
    const t = punText(s.people[1], st);
    expect(t.plain).toBe('Ο ΣΤΡ (ΠΖ) ' + s.people[1].last + ' ' + s.people[1].first + ' ΤΙΜΩΡΗΘΗΚΕ ΤΗΝ 12 ΟΚΤ 26 ΑΠΟ ΤΟΝ ΛΧΙΑ ΑΓΝΩΣΤΟΠΟΥΛΟ ΜΕ ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ, ΔΙΟΤΙ ΑΡΓΗΣΕ ΣΤΟ ΠΡΟΣΚΛΗΤΗΡΙΟ.');
    expect(t.html).toContain('<u>ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ</u>');
    expect(daysWord(1) + '|' + daysWord(14) + '|' + daysWord(23)).toBe('μία|δεκατέσσερις|είκοσι τρεις');
    expect(overMax('Κράτηση', 9)).toBe(8); expect(overMax('Στέρηση εξόδου', 4)).toBe(0);
    s = run(s, { t: 'setPunInfo', id: st.id, by: '', reason: 'άλλος λόγος', on: '2026-10-12' });
    const st2 = s.statuses.find(x => x.id === st.id)!;
    expect(st2.by).toBeUndefined(); expect(punText(s.people[1], st2).plain).toContain('ΑΠΟ ΤΟΝ …… ΜΕ');
  });
  it('στελέχη: απουσίες μετρούν στην ΗΚΑΙ στη σωστή στήλη και βαθμό', () => {
    let s = fakeState(10);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'λχιας', hk: 'Λοχίες', last: 'Δοκιμίδης', first: 'Δοκίμιος' } });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΥΠΟΘΕΤΙΚΟΣ', first: 'ΓΙΑΝΝΗΣ' } });
    const c = s.cadreList[0];
    expect(c).toMatchObject({ rank: 'ΛΧΙΑΣ', last: 'ΔΟΚΙΜΙΔΗΣ', active: true });
    s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'ka', from: D, to: addDays(D, 3) } });
    expect(() => run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'an', from: addDays(D, 2), to: addDays(D, 5) } })).toThrow(/ήδη κατάσταση/);
    const h = hkaiCounts(s, D);
    expect(h.rank['Λοχίες'].c.ka).toBe(1);
    expect(h.rank['Ίλαρχοι'].n).toBe(1);
    expect(h.total).toBe(10 + 2);
    expect(h.apo).toBe(hkaiCounts({ ...s, cadreAbs: [] }, D).apo + 1);
    expect(punBySuggestions(s)).toContain('ΛΧΙΑΣ ΔΟΚΙΜΙΔΗΣ');
  });
});

describe('Επεξεργασία υπηρεσίας', () => {
  it('αλλάζει πλήθος και ώρες στις δικές σου, κρατά το ιστορικό, αλλάζει σειρά', () => {
    let s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 3, hrs: '' });
    const b = s.settings.blocks.find(x => x.custom)!;
    s = run(s, { t: 'assign', date: D, k: b.id + '_3', pid: 9 });
    s = run(s, { t: 'editBlock', phase: 'sven', id: b.id, name: 'Πύλη Α', n: 2, hrs: { [b.id + '_1']: '07:30-08:00' } });
    const b2 = s.settings.blocks.find(x => x.id === b.id)!;
    expect(b2.name).toBe('Πύλη Α');
    expect(postsOf(s.settings).filter(x => x.block === b.id).map(x => x.k)).toEqual([b.id + '_1', b.id + '_2']);
    expect(postsOf(s.settings).find(x => x.k === b.id + '_1')!.hours).toBe('07:30-08:00');
    expect(statOf(s, 9).total).toBe(1);   // η κρυμμένη θέση μετρά ακόμα στο ιστορικό
    const i = s.settings.blocks.findIndex(x => x.id === b.id);
    s = run(s, { t: 'editBlock', phase: 'sven', id: b.id, name: '', n: 0, hrs: {}, move: -1 });
    expect(s.settings.blocks.findIndex(x => x.id === b.id)).toBe(i - 1);
    expect(s.settings.blocks.find(x => x.id === b.id)!.posts.filter(x => !x.hidden)).toHaveLength(2);
  });
});
