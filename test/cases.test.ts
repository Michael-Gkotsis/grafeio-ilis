// Πίνακας περιπτώσεων (έρευνα §4.4): κάθε κανόνας του λοχία με μία περίπτωση «επιτρέπεται» και μία «απαγορεύεται»,
// ημερομηνίες-παγίδες, σειρά δικαιοσύνης, προέλεγχος, εισαγωγή Δυναμολογίου, αντίγραφα, ασφαλής εγγραφή.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyBlock, lastResort, fillDay, guardUnavailable, isHol, outBlock, ruleBlock, statusesOn, whyText, seedRank, fairOf, isRecordExpiredOn } from '../src/shared/rules';
import { preflight, hasErrors } from '../src/shared/preflight';
import { parseRoster, isPersonRow } from '../src/shared/roster';
import { addDays, daysBetween, dow, milDate } from '../src/shared/dates';
import { backupsToDelete } from '../src/main/db';
import { writeXlsx, isLocked, PREV_DIR, KEEP_PREV } from '../src/main/files';
import { DEFAULT_BLOCKS_SPEN, DEFAULT_SETTINGS, migrateSettings, type AppState, type TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';
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
    expect(() => run(s, { t: 'assign', date: D, k: 'mg1', pid: 2, force: 'δοκιμή' })).toThrow(/Όχι μαγειρεία/);
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
  it('διπλοθεσία δεν παρακάμπτεται ποτέ', () => {
    const s = run(fakeState(20), { t: 'assign', date: D, k: 'mg1', pid: 4 });
    expect(() => run(s, { t: 'assign', date: D, k: 'mg2', pid: 4, force: 'x' })).toThrow(/Ήδη/);
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
    expect(outBlock(s, '2026-10-11', 2)).toMatch(/Περιορισμός/);
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
    expect(() => outs(s, 5)).toThrow(/Περιορισμός/);
    expect(() => declare(s, 'OUT', 5, D)).toThrow(/δεν βγαίνει/);
  });
  it('Κ-Ε3: ποινή που ακόμα αιτείται (π.χ. κράτηση) κρατά μέσα, αν και δεν μετρά ακόμα στην ΗΚΑΙ (γραφέας, 10/10)', () => {
    const s = declare(fakeState(20), 'PUN', 5, D, D, { kind: 'Κράτηση' });
    expect(outBlock(s, D, 5)).toMatch(/Κράτηση \(αιτείται\)/);
    expect(() => outs(s, 5)).toThrow(/Κράτηση/);
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
  it('ΦΡΟΥΡΑ: άτομο σε δύο θέσεις ή με ιατρικό σε ένοπλη = ✕', () => {
    const s = armed(fakeState(40));
    const twice = { ...s, guards: { [D]: { th1: 2, th2: 2 } } };
    expect(hasErrors(preflight('froura', twice, D))).toBe(true);
    const sick = declare({ ...s, guards: { [D]: { th1: 3 } } }, 'EA', 3, D);
    // η δήλωση ΕΑ το βγάζει μόνη της από τη θέση· αν μπει με το χέρι στη βάση, ο προέλεγχος το πιάνει
    expect(sick.guards[D].th1).toBeUndefined();
    expect(hasErrors(preflight('froura', { ...sick, guards: { [D]: { th1: 3 } } }, D))).toBe(true);
  });
  it('Εξοδούχοι: τιμωρημένος εξοδούχος = ✕', () => {
    let s = run(fakeState(20), { t: 'outs', date: D, changes: [{ pid: 5, from: null, to: 'OUT' }] });
    s = declare(s, 'PUN', 5, D, D, { kind: 'Κράτηση' }); s = run(s, { t: 'approvePun', id: s.statuses.find(x => x.type === 'PUN')!.id });
    expect(hasErrors(preflight('outs', s, D))).toBe(true);
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
    expect(m.rev).toBe(2);
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
