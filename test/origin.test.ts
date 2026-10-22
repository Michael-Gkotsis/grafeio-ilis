// Προέλευση (Michael, 22/10): ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ… ως δικό της πεδίο σε στρατιώτες και στελέχη, με δική της λίστα, και
// όχι μέσα στον βαθμό. Στα έντυπα μπαίνει μπροστά από τον βαθμό («ΕΠΟΠ ΛΧΙΑΣ»), ή στη δική της στήλη αν υπάρχει.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, rosterChanges, type Command } from '../src/shared/commands';
import { CADRE_RANKS, SOLDIER_RANKS, listOf, rankTxt, splitOrigins, splitRank, withOrigin } from '../src/shared/ranks';
import { hkaiCounts, isEpop, dutyPool } from '../src/shared/rules';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { bestFor, planPeopleWrite, snapFromSheet, snapPeople, type SourceBinding } from '../src/shared/sources';
import { fieldValue } from '../src/shared/reports';
import { rankName } from '../src/shared/froura';
import { hkWho } from '../src/shared/punish';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-22';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'o' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const NEW = { spec: 'ΠΖ', last: 'ΠΡΟΕΛΕΥΣΙΑΔΗΣ', first: 'ΑΛΦΑΣ', father: 'ΠΑΤΕΡΑΣ', asm: '955555', phone: '', room: 1, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '' };

describe('βαθμός και προέλευση χωριστά', () => {
  it('ο βαθμός χωρίζεται από την προέλευση, μπροστά ή πίσω, με τελείες ή χωρίς', () => {
    expect(splitRank('ΕΠΟΠ ΛΧΙΑΣ')).toEqual({ origin: 'ΕΠΟΠ', rank: 'ΛΧΙΑΣ' });
    expect(splitRank('Ο.Β.Α. ΣΤΡ')).toEqual({ origin: 'ΟΒΑ', rank: 'ΣΤΡ' });
    expect(splitRank('Ε.Π.Ο.Π. ΔΝΕΑΣ')).toEqual({ origin: 'ΕΠΟΠ', rank: 'ΔΝΕΑΣ' });
    expect(splitRank('ΕΠΛΧΙΑΣ (ΣΜΥ)')).toEqual({ origin: 'ΣΜΥ', rank: 'ΕΠΛΧΙΑΣ' });
    expect(splitRank('ΕΠΟΠ')).toEqual({ origin: 'ΕΠΟΠ', rank: '' });
    expect(splitRank('ΛΧΙΑΣ')).toEqual({ origin: '', rank: 'ΛΧΙΑΣ' });
    expect(splitRank('ΕΠΟΠΤΗΣ')).toEqual({ origin: '', rank: 'ΕΠΟΠΤΗΣ' });   // όχι μέρος λέξης
    // δική σου προέλευση από τις Λίστες
    expect(splitRank('ΣΣΑΣ ΑΝΘΣΤΗΣ', { origins: { add: [{ name: 'ΣΣΑΣ' }] } })).toEqual({ origin: 'ΣΣΑΣ', rank: 'ΑΝΘΣΤΗΣ' });
    expect(withOrigin({ rank: 'ΕΠΟΠ' })).toEqual({ rank: 'ΣΤΡ', origin: 'ΕΠΟΠ' });
    expect(withOrigin({ rank: 'ΛΧΙΑΣ', origin: 'σμυ' })).toEqual({ rank: 'ΛΧΙΑΣ', origin: 'ΣΜΥ' });
    expect(rankTxt({ rank: 'ΛΧΙΑΣ', origin: 'ΕΠΟΠ' })).toBe('ΕΠΟΠ ΛΧΙΑΣ');
    expect(rankTxt({ rank: 'ΣΤΡ' })).toBe('ΣΤΡ');
  });
  it('η προέλευση έφυγε από τις λίστες βαθμών και έχει δική της λίστα', () => {
    expect([...SOLDIER_RANKS, ...CADRE_RANKS].some(r => splitRank(r).origin)).toBe(false);
    expect(listOf(undefined, 'origins')).toEqual(['ΕΠΟΠ', 'ΟΒΑ', 'ΣΜΥ', 'ΣΣΕ']);
  });
  it('νέος στρατιώτης: «ΕΠΟΠ ΣΤΡ» στον βαθμό γίνεται ΣΤΡ με προέλευση ΕΠΟΠ· νέα προέλευση μένει στις Λίστες', () => {
    let s = run(fakeState(5), { t: 'addPerson', person: { ...NEW, rank: 'ΕΠΟΠ ΣΤΡ' } });
    const p = s.people[s.people.length - 1];
    expect([p.rank, p.origin]).toEqual(['ΣΤΡ', 'ΕΠΟΠ']);
    expect(isEpop(p)).toBe(true); expect(dutyPool(s).some(x => x.id === p.id)).toBe(false);
    s = run(s, { t: 'updatePerson', person: { ...p, origin: 'ΣΣΑΣ' } });
    expect(s.people.find(x => x.id === p.id)!.origin).toBe('ΣΣΑΣ');
    expect(listOf(s.settings.lists, 'origins')).toContain('ΣΣΑΣ');
    expect(isEpop(s.people.find(x => x.id === p.id)!)).toBe(false);
    // χωρίς προέλευση: το πεδίο φεύγει
    s = run(s, { t: 'updatePerson', person: { ...s.people.find(x => x.id === p.id)!, origin: '' } });
    expect('origin' in s.people.find(x => x.id === p.id)!).toBe(false);
  });
  it('στέλεχος: το παλιό «ΕΠΟΠ» γίνεται ΣΤΡ με προέλευση ΕΠΟΠ και μένει στη γραμμή του', () => {
    let s = run(fakeState(3), { t: 'saveCadre', cadre: { rank: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: 'ΣΤΕΛΕΧΙΔΗΣ', first: 'ΒΗΤΑΣ', monthMax: 3 } });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΕΠΛΧΙΑΣ', origin: 'ΣΜΥ', hk: 'Επιλοχίες', last: 'ΜΟΝΙΜΙΔΗΣ', first: 'ΓΑΜΜΑΣ' } });
    const [a, b] = s.cadreList;
    expect([a.rank, a.origin, a.hk, a.pid]).toEqual(['ΣΤΡ', 'ΕΠΟΠ', 'ΕΠΟΠ Στρατιώτης', -1]);
    expect([b.rank, b.origin]).toEqual(['ΕΠΛΧΙΑΣ', 'ΣΜΥ']);
    const h = hkaiCounts(s, D);
    expect(h.rank['ΕΠΟΠ Στρατιώτης'].n).toBe(1); expect(h.rank['Επιλοχίες'].n).toBe(1);
  });
});

describe('ΗΚΑΙ', () => {
  it('ΕΠΟΠ/ΟΒΑ στρατιώτες στη δική τους γραμμή, ΕΠΟΠ ΛΧΙΑΣ στους Λοχίες', () => {
    const s = fakeState(6);
    s.people = s.people.map(p => (p.id === 2 ? { ...p, rank: 'ΣΤΡ', origin: 'ΕΠΟΠ' } : p.id === 3 ? { ...p, rank: 'ΣΤΡ', origin: 'ΟΒΑ' } : p.id === 4 ? { ...p, rank: 'ΛΧΙΑΣ', origin: 'ΕΠΟΠ' } : p));
    const h = hkaiCounts(s, D);
    expect([h.rank['ΕΠΟΠ Στρατιώτης'].n, h.rank['ΟΒΑ Στρατιώτης'].n, h.rank['Λοχίες'].n, h.rank['Στρατιώτες'].n]).toEqual([1, 1, 1, 2]);
    // όλοι οι ΕΠΟΠ/ΟΒΑ (και ο ΛΧΙΑΣ) υπηρεσίες μόνο με το χέρι
    expect(dutyPool(s).map(p => p.id)).toEqual([1, 5, 6]);
  });
  it('στα κείμενα και στα έντυπα ο βαθμός γράφεται με την προέλευση μπροστά', () => {
    const p = { ...fakeState(1).people[0], rank: 'ΛΧΙΑΣ', origin: 'ΕΠΟΠ' };
    expect(rankName(p)).toMatch(/^ΕΠΟΠ ΛΧΙΑΣ \(ΠΖ\) /);
    expect(hkWho(p)).toMatch(/^ΕΠΟΠ ΛΧΙΑΣ \(ΠΖ\) /);
  });
});

describe('μετάπτωση στο άνοιγμα (splitOrigins)', () => {
  it('χωρίζει όσους έχουν προέλευση στον βαθμό, μία φορά', () => {
    const s = fakeState(4);
    s.people = s.people.map(p => (p.id === 2 ? { ...p, rank: 'ΕΠΟΠ ΛΧΙΑΣ' } : p.id === 3 ? { ...p, rank: 'Ο.Β.Α. ΣΤΡ' } : p));
    s.cadreList = [{ id: 'c1', rank: 'ΟΒΑ', hk: 'ΟΒΑ Στρατιώτης', last: 'ΠΑΛΙΟΣ', first: 'ΔΕΛΤΑΣ', active: true }];
    s.settings = { ...s.settings, lists: { soldierRanks: { add: [{ name: 'ΕΠΟΠ ΚΛΗΡ', hk: 'Δεκανείς' }, { name: 'ΕΠΟΠ ΣΤΡ' }] } } };
    const m = splitOrigins(s)!;
    expect(m.people.map(p => [p.rank, p.origin ?? ''])).toEqual([['ΔΝΕΑΣ', ''], ['ΛΧΙΑΣ', 'ΕΠΟΠ'], ['ΣΤΡ', 'ΟΒΑ'], ['ΣΤΡ', '']]);
    expect(m.people[0]).toBe(s.people[0]);   // όσοι δεν έχουν, μένουν ίδιοι
    expect(m.cadreList[0]).toMatchObject({ rank: 'ΣΤΡ', origin: 'ΟΒΑ', hk: 'ΟΒΑ Στρατιώτης' });
    expect(m.settings.lists!.soldierRanks!.add).toEqual([{ name: 'ΚΛΗΡ', hk: 'Δεκανείς' }]);   // το ΣΤΡ είναι ήδη βασικός
    expect(hkaiCounts(m, D).rank).toEqual(hkaiCounts(s, D).rank);   // η ΗΚΑΙ μετρά ίδια
    expect(splitOrigins(m)).toBeNull();
    expect(splitOrigins(fakeState(4))).toBeNull();
  });
});

describe('Δυναμολόγιο (Excel)', () => {
  const HEAD = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'];
  const HEAD_O = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΠΡΟΕΛΕΥΣΗ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'];
  const s0 = fakeState(4);
  const rowOf = (p: AppState['people'][number], i: number, rank = p.rank) => [i + 1, rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si];
  const rowO = (p: AppState['people'][number], i: number, rank = p.rank, origin = '') => [i + 1, rank, origin, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si];
  const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsx', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };
  it('ανάγνωση: «ΕΠΟΠ ΛΧΙΑΣ» στον βαθμό, ή στήλη «ΠΡΟΕΛΕΥΣΗ»', () => {
    const a = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...s0.people.map((p, i) => rowOf(p, i, i === 1 ? 'ΕΠΟΠ ΛΧΙΑΣ' : p.rank))] }]).rows;
    expect(a.map(r => [r.rank, r.origin])).toEqual([['ΔΝΕΑΣ', undefined], ['ΛΧΙΑΣ', 'ΕΠΟΠ'], ['ΣΤΡ', undefined], ['ΣΤΡ', undefined]]);
    const b = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD_O, ...s0.people.map((p, i) => rowO(p, i, p.rank, i === 2 ? 'ΟΒΑ' : ''))] }]).rows;
    expect(b.map(r => r.origin)).toEqual(['', '', 'ΟΒΑ', '']);
  });
  it('επανεισαγωγή χωρίς στήλη και χωρίς προέλευση στον βαθμό: μένει όποια όρισες στην εφαρμογή', () => {
    let s = run(s0, { t: 'updatePerson', person: { ...s0.people[2], origin: 'ΟΒΑ' } });
    const rows = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...s0.people.map((p, i) => rowOf(p, i))] }]).rows;
    expect(rosterChanges(s, rows).changes).toEqual([]);
    s = run(s, { t: 'importPeople', rows, source: 'Δ.xlsx', deactivateMissing: true });
    expect(s.people[2].origin).toBe('ΟΒΑ');
    // με στήλη «ΠΡΟΕΛΕΥΣΗ» κενή: φεύγει, και το λέει η προεπισκόπηση
    const rows2 = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD_O, ...s0.people.map((p, i) => rowO(p, i))] }]).rows;
    expect(rosterChanges(s, rows2).changes).toEqual([{ who: s.people[2].last + ' ' + s.people[2].first, what: 'προέλευση ΟΒΑ → —' }]);
    expect('origin' in run(s, { t: 'importPeople', rows: rows2, source: 'Δ.xlsx', deactivateMissing: true }).people[2]).toBe(false);
  });
  it('εγγραφή: χωρίς στήλη «ΠΡΟΕΛΕΥΣΗ» μπαίνει μπροστά από τον βαθμό, με στήλη στη δική της', () => {
    const sh: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...s0.people.map((p, i) => rowOf(p, i))] };
    const s = run(s0, { t: 'updatePerson', person: { ...s0.people[2], origin: 'ΕΠΟΠ' } });
    const p = planPeopleWrite(sh, bind(sh), s, snapFromSheet(sh, bind(sh), s0.people));
    expect(p.sets).toEqual([{ r: 3, c: 1, v: 'ΕΠΟΠ ΣΤΡ' }]);
    const sho: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD_O, ...s0.people.map((p, i) => rowO(p, i))] };
    const q = planPeopleWrite(sho, bind(sho), s, snapFromSheet(sho, bind(sho), s0.people));
    expect(q.sets).toEqual([{ r: 3, c: 2, v: 'ΕΠΟΠ' }]);
    // ήδη γραμμένο: τίποτα
    const done: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD_O, ...s.people.map((p, i) => rowO(p, i, p.rank, p.origin || ''))] };
    expect(planPeopleWrite(done, bind(done), s, snapFromSheet(done, bind(done), s.people)).sets).toEqual([]);
    expect(snapPeople(s.people)[3].rank).toBe('ΕΠΟΠ ΣΤΡ');
  });
});

describe('Έντυπα', () => {
  it('Βαθμός (με την προέλευση), Μόνο βαθμός, Προέλευση, Βαθμός και ονοματεπώνυμο', () => {
    const s = fakeState(2); const p = { ...s.people[1], rank: 'ΛΧΙΑΣ', origin: 'ΕΠΟΠ' };
    expect(['rank', 'rank1', 'origin'].map(f => fieldValue(s, 'people', p, f, 0, D))).toEqual(['ΕΠΟΠ ΛΧΙΑΣ', 'ΛΧΙΑΣ', 'ΕΠΟΠ']);
    expect(String(fieldValue(s, 'people', p, 'who', 0, D))).toMatch(/^ΕΠΟΠ ΛΧΙΑΣ \(ΠΖ\) /);
    const c = { id: 'c', rank: 'ΕΠΛΧΙΑΣ', origin: 'ΣΜΥ', hk: 'Επιλοχίες', last: 'Α', first: 'Β', active: true };
    expect(['rank', 'rank1', 'origin'].map(f => fieldValue(s, 'cadre', c, f, 0, D))).toEqual(['ΣΜΥ ΕΠΛΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΣΜΥ']);
  });
});
