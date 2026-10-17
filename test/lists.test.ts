// Ρυθμίσεις › Λίστες: βαθμοί στρατιωτών, βαθμοί στελεχών και Ο/Σ που πρόσθεσε ή έκρυψε ο χρήστης.
// Χωρίς προσθήκες όλα ίδια με πριν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { CADRE_RANKS, SOLDIER_RANKS, SPECS, absCode, cadreAbsKinds, cadreAbsOf, guessHk, hkOfRank, leaveCol, listOf, listRows, medKinds, siUnarmed, statusLbl, type UserLists } from '../src/shared/ranks';
import { LEAVE_KINDS, PUN_KINDS, CADRE_ABS } from '../src/shared/domain';
import { overMax, punText } from '../src/shared/punish';
import { capsOf, dutyBlock, hkRankOf, hkaiCounts, isUnarmed, outBlock } from '../src/shared/rules';
import { typeOfValue } from '../src/shared/sources';
import { listColumns, type SourceBinding } from '../src/shared/sources';
import { apply } from '../src/shared/commands';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-12';

describe('λίστες', () => {
  it('χωρίς προσθήκες: οι βασικές λίστες όπως πριν', () => {
    expect(listOf(undefined, 'soldierRanks')).toEqual(SOLDIER_RANKS);
    expect(listOf({}, 'cadreRanks')).toEqual(CADRE_RANKS);
    expect(listOf({ soldierRanks: {} }, 'specs')).toEqual(SPECS);
  });
  it('κρυμμένα βγαίνουν, δικά σου μπαίνουν στο τέλος, χωρίς διπλά (και με άλλους τόνους ή τελείες)', () => {
    const l: UserLists = { specs: { add: [{ name: 'ΠΝ' }, { name: 'π.ζ' }, { name: 'ΠΝ' }, { name: '' }], hide: ['τθ'] } };
    expect(listOf(l, 'specs')).toEqual([...SPECS.filter(x => x !== 'ΤΘ'), 'ΠΝ']);
    const rows = listRows(l, 'specs');
    expect(rows.find(r => r.name === 'ΤΘ')).toMatchObject({ builtin: true, hidden: true });
    expect(rows.filter(r => !r.builtin).map(r => r.name)).toEqual(['ΠΝ']);
  });
  it('δικός σου βαθμός στρατιώτη μετρά στη γραμμή της ΗΚΑΙ που διάλεξες', () => {
    const l: UserLists = { soldierRanks: { add: [{ name: 'ΚΛΗΡ', hk: 'Δεκανείς' }, { name: 'ΑΓΝ', hk: 'Επίλαρχοι' }] } };
    expect(hkRankOf('κληρ', l)).toBe('Δεκανείς');
    // γραμμή που δεν είναι για στρατιώτες: από το όνομα, όπως πριν
    expect(hkRankOf('ΑΓΝ', l)).toBe('Στρατιώτες');
    expect(hkRankOf('ΔΝΕΑΣ', l)).toBe('Δεκανείς');
    expect(hkOfRank(l, 'soldierRanks', 'ΣΤΡ')).toBeUndefined();
    const s0 = fakeState(10);
    const s = { ...s0, people: s0.people.map((p, i) => (i === 0 ? { ...p, rank: 'ΚΛΗΡ' } : p)), settings: { ...s0.settings, lists: l } };
    const before = hkaiCounts({ ...s, settings: s0.settings }, D).rank;
    const after = hkaiCounts(s, D).rank;
    expect(after['Δεκανείς'].n).toBe(before['Δεκανείς'].n + 1);
    expect(after['Στρατιώτες'].n).toBe(before['Στρατιώτες'].n - 1);
  });
  it('δικός σου βαθμός στελέχους διαλέγει μόνος του τη γραμμή της ΗΚΑΙ', () => {
    const l: UserLists = { cadreRanks: { add: [{ name: 'ΣΜΧΟΣ', hk: 'Επίλαρχοι' }] } };
    expect(guessHk('σμχος', l)).toBe('Επίλαρχοι');
    expect(guessHk('ΣΜΧΟΣ')).toBe('Λοχίες');
    expect(guessHk('ΙΛΧΟΣ', l)).toBe('Ίλαρχοι');
  });
  it('το dropdown του Excel παίρνει τις προσθήκες και όχι τα κρυμμένα', () => {
    const sh: RawSheet = { name: 'Φ', rows: [['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα'], [1, 'ΣΤΡ', 'ΠΖ', 'Α', 'Β']] };
    const b: SourceBinding = { file: 'x', sheet: 'Φ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4 } };
    expect(listColumns('people', sh, b).map(l => l.items)).toEqual([SOLDIER_RANKS, SPECS]);
    const rank = listColumns('people', sh, b, { soldierRanks: { add: [{ name: 'ΚΛΗΡ' }], hide: ['ΔΕΑ'] } }).find(l => l.what === 'Βαθμός')!;
    expect(rank.items).toEqual([...SOLDIER_RANKS.filter(x => x !== 'ΔΕΑ'), 'ΚΛΗΡ']);
  });
  it('αλλαγή στις λίστες αναιρείται όπως κάθε ρύθμιση', () => {
    const s = fakeState(3);
    const r = apply(s, { t: 'setSettings', settings: { lists: { specs: { add: [{ name: 'ΠΝ' }] } } }, text: 'λίστα' }, { today: D, newId: () => 'x' });
    expect(listOf(r.state.settings.lists, 'specs')).toContain('ΠΝ');
    expect(r.undoable).not.toBe(false);
  });

  it('ποινές: δικό σου είδος με δικό του κείμενο και ανώτατες ημέρες· τα βασικά όπως πριν', () => {
    expect(listOf(undefined, 'punKinds')).toEqual(PUN_KINDS);
    const l: UserLists = { punKinds: { add: [{ name: 'Επίπληξη', acc: 'επίπληξη (προφορική)', max: 2 }, { name: 'Αγγαρεία' }] } };
    const s = fakeState(3); const p = s.people[0];
    const st = { id: 'x', pid: p.id, type: 'PUN' as const, from: D, to: '2026-10-14', kind: 'ΕΠΙΠΛΗΞΗ' };
    expect(punText(p, st, l).dur).toBe('ΤΡΕΙΣ (03) ΗΜΕΡΕΣ ΕΠΙΠΛΗΞΗ (ΠΡΟΦΟΡΙΚΗ)');
    expect(punText(p, { ...st, kind: 'Αγγαρεία' }, l).dur).toBe('ΤΡΕΙΣ (03) ΗΜΕΡΕΣ ΑΓΓΑΡΕΙΑ');
    expect(overMax('Επίπληξη', 3, l)).toBe(2); expect(overMax('Επίπληξη', 2, l)).toBe(0); expect(overMax('Αγγαρεία', 30, l)).toBe(0);
    expect(punText(p, { ...st, kind: 'Κράτηση' }, l).dur).toBe('ΤΡΕΙΣ (03) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ');
    expect(overMax('Κράτηση', 9, l)).toBe(8); expect(overMax('Κράτηση', 9)).toBe(8);
  });
  it('άδειες: η «Ειδική» μετρά στις Ειδικές της ΗΚΑΙ, οι άλλες βασικές στις Κανονικές, οι δικές σου όπου όρισες', () => {
    expect(listOf(undefined, 'leaveKinds')).toEqual(LEAVE_KINDS);
    const l: UserLists = { leaveKinds: { add: [{ name: 'Γονική', col: 'eid' }, { name: 'Φοιτητική' }, { name: 'Λάθος', col: 'nos' }] } };
    expect(['Κανονική', 'ΑΜΔ', 'ΥΕΘΑ', undefined].map(k => leaveCol(k))).toEqual(['ka', 'ka', 'ka', 'ka']);
    expect(leaveCol('ΕΙΔΙΚΗ')).toBe('eid'); expect(leaveCol('Ειδική', l)).toBe('eid');
    expect([leaveCol('γονική', l), leaveCol('Φοιτητική', l), leaveCol('Λάθος', l)]).toEqual(['eid', 'ka', 'ka']);
    const s0 = fakeState(10); const pid = s0.people[2].id;
    const s = (kind: string) => ({ ...s0, statuses: [{ id: 'l', pid, type: 'LEAVE' as const, from: D, to: D, kind }] });
    const h1 = hkaiCounts(s('Κανονική'), D), h2 = hkaiCounts(s('Ειδική'), D);
    expect(h1.cols.ka.map(p => p.id)).toEqual([pid]); expect(h1.cols.eid).toEqual([]);
    expect(h2.cols.eid.map(p => p.id)).toEqual([pid]); expect(h2.cols.ka).toEqual([]);
    expect(h2.apo).toBe(h1.apo);
  });
  it('απουσίες στελεχών: δικό σου είδος μετρά στη στήλη που όρισες· κρυμμένο βασικό διαβάζεται ακόμα', () => {
    expect(cadreAbsKinds()).toEqual(CADRE_ABS);
    const l: UserLists = { cadreAbs: { add: [{ name: 'Σχολείο', col: 'ekp' }, { name: 'Υπηρεσιακή' }], hide: ['Φύλλο πορείας'] } };
    expect(cadreAbsKinds(l).map(x => x[0])).toEqual(['ka', 'an', 'eid', 'nos', 'ekp', 'allh', 'other', 'Σχολείο', 'Υπηρεσιακή']);
    expect(cadreAbsOf('fp', l)).toEqual(['fp', 'Φύλλο πορείας', 'fp']);
    expect(cadreAbsOf('Σχολείο', l)).toEqual(['Σχολείο', 'Σχολείο', 'ekp']);
    const s0 = fakeState(4); let s: AppState = { ...s0, settings: { ...s0.settings, lists: l } };
    s = apply(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΥΠΟΘΕΤΙΚΟΣ', first: 'Α' } }, { today: D, newId: () => 'c1' }).state;
    const r = apply(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'Σχολείο', from: D, to: D } }, { today: D, newId: () => 'a1' });
    expect(r.text).toContain('σχολείο');
    const h = hkaiCounts(r.state, D);
    expect(h.rank['Ίλαρχοι'].c.ekp).toBe(1);
    const h0 = hkaiCounts({ ...r.state, cadreAbs: [{ ...r.state.cadreAbs[0], kind: 'Υπηρεσιακή' }] }, D);
    expect(h0.rank['Ίλαρχοι'].c.ekp).toBeUndefined();
    expect(h.apo).toBe(h0.apo + 1);
  });
  it('ιατρικά: δικό σου είδος συμπεριφέρεται σαν τον βασικό του, με δικό του όνομα και κωδικό· χωρίς προσθήκες όπως πριν', () => {
    const l: UserLists = { medKinds: { add: [{ name: 'ΕΛ ΓΥΜΝ', like: 'EY', code: 'Ε.Γ' }, { name: 'ΕΛ ΒΑΔ', like: 'EA' }, { name: 'ΚΑΚΟ', like: 'PUN' }] } };
    expect(listOf(undefined, 'medKinds')).toEqual(['ΕΑ', 'ΕΥ', 'ΕΟ', 'ΕΑΡΒ']);
    // μόνο ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ ως βάση
    expect(medKinds(l).map(x => x.name)).toEqual(['ΕΛ ΓΥΜΝ', 'ΕΛ ΒΑΔ']);
    expect(typeOfValue('medical', 'ελ. γυμν', undefined, l)).toBe('EY');
    expect(typeOfValue('medical', 'ΕΛ ΒΑΔ')).toBeNull();   // χωρίς τη λίστα: άγνωστο, ρωτά όπως πριν
    expect(typeOfValue('medical', 'ΕΛ ΒΑΔ', undefined, l)).toBe('EA');
    expect(typeOfValue('medical', 'ΚΑΚΟ', undefined, l)).toBeNull();
    const own = { type: 'EY' as const, kind: 'ΕΛ ΓΥΜΝ' }, plain = { type: 'EY' as const, kind: 'ΕΥ 3 ΗΜΕΡΩΝ' };
    expect([statusLbl(own, l), statusLbl(own), statusLbl(plain, l)]).toEqual(['ΕΛ ΓΥΜΝ', 'ΕΥ', 'ΕΥ']);
    expect([absCode(own, l), absCode(own), absCode({ type: 'EA', kind: 'ΕΛ ΒΑΔ' }, l), absCode({ type: 'EO', kind: 'x' }, l)]).toEqual(['Ε.Γ', 'Ε.Υ', 'Ε.Α', undefined]);
    // κανόνες ίδιοι με του βασικού: ΕΥ = καμία υπηρεσία, όχι έξοδο (με το δικό του όνομα στον λόγο)
    const s0 = fakeState(10); const pid = s0.people[0].id;
    const st = [{ id: 'm', pid, from: D, to: D, ...own }];
    const s = { ...s0, statuses: st, settings: { ...s0.settings, lists: l } };
    expect(dutyBlock(st, D, pid, { armed: false, kind: 'mg' })).toBe(dutyBlock([{ id: 'b', pid, type: 'EY', from: D, to: D }], D, pid, { armed: false, kind: 'mg' }));
    expect(outBlock(s, D, pid)).toMatch(/^ΕΛ ΓΥΜΝ/);
    expect(hkaiCounts(s, D)).toEqual(hkaiCounts({ ...s, statuses: [{ ...st[0], kind: undefined }] }, D));
  });
  it('Σ.Ι. άοπλων: τα βασικά όπως πριν, τα δικά σου πιάνουν όσα αρχίζουν από αυτά, όσα απενεργοποίησες δεν ισχύουν', () => {
    for (const si of ['Ι3 ΑΟΠΛΟ', 'άοπλος', 'I4', 'Ι4 ']) expect(siUnarmed(si)).toBe(true);
    for (const si of ['Ι1', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι5', '', 'Ι 4']) expect(siUnarmed(si)).toBe(false);
    const l: UserLists = { siUnarmed: { add: [{ name: 'Ι5' }], hide: ['Ι4'] } };
    expect(['Ι5', 'Ι 5 ΧΩΡΙΣ', 'Ι.5', 'Ι4', 'Ι3 ΑΟΠΛΟ', 'Ι1'].map(si => siUnarmed(si, l))).toEqual([true, true, true, false, true, false]);
    const s0 = fakeState(10); const p = s0.people[0];
    const s = { ...s0, people: s0.people.map((x, i) => (i === 0 ? { ...x, si: 'Ι5', post: null } : x)), settings: { ...s0.settings, lists: l } };
    expect(Object.keys(capsOf(s, p.id)).sort()).toEqual(['op', 'sk', 'tae']);
    expect(isUnarmed(s, D, p.id)).toBe(true);
    expect(capsOf({ ...s, settings: s0.settings }, p.id)).toEqual(capsOf({ ...s0, people: s.people }, p.id));
    expect(isUnarmed({ ...s, settings: s0.settings }, D, p.id)).toBe(false);
  });
});

describe('νέος βαθμός από τη φόρμα του στρατιώτη (Michael, 17/10)', () => {
  const ctx = { today: '2026-10-12', newId: () => 'x' };
  it('ο βαθμός και το Ο/Σ που γράφτηκαν με το χέρι μένουν στις Λίστες· οι γνωστοί όχι', () => {
    const s0 = fakeState(3);
    const s1 = apply(s0, { t: 'addPerson', person: { ...s0.people[0], rank: 'κληρ', spec: 'ΠΖ', last: 'ΝΕΟΣ', first: 'ΑΛΦΑ', asm: '' } as any }, ctx).state;
    expect(s1.settings.lists?.soldierRanks?.add).toEqual([{ name: 'ΚΛΗΡ' }]);
    expect(s1.settings.lists?.specs).toBeUndefined();
    expect(listOf(s1.settings.lists, 'soldierRanks')).toContain('ΚΛΗΡ');
    // διόρθωση: μόνο αν άλλαξε ο βαθμός
    const p = s1.people[0];
    const s2 = apply(s1, { t: 'updatePerson', person: { ...p, rank: 'ΣΤΡ', spec: 'ΠΝ' } }, ctx).state;
    expect(s2.settings.lists?.specs?.add).toEqual([{ name: 'ΠΝ' }]);
    expect(s2.settings.lists?.soldierRanks?.add).toEqual([{ name: 'ΚΛΗΡ' }]);
    const odd = { ...s2, people: s2.people.map(x => (x.id === p.id ? { ...x, rank: 'ΠΑΡΑΞΕΝΟΣ' } : x)) };
    const s3 = apply(odd, { t: 'updatePerson', person: { ...odd.people[0], phone: '69' } }, ctx).state;
    expect(s3.settings.lists?.soldierRanks?.add).toEqual([{ name: 'ΚΛΗΡ' }]);
  });
});
