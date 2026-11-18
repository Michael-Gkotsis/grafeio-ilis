// Έλεγχος 18/11, φάση 5: πέντε σκληροκωδικωμένες λίστες/τιμές γίνονται ρυθμίσεις (Λ1 στήλη ΣΤΕΠ, Λ2 στήλη ΗΚΑΙ ανά κατάσταση,
// Λ3 λόγοι κίνησης, Λ4 μήνας κατάταξης ΕΣΣΟ, Λ5 κωδικοί ημερολογίου/προγράμματος αδειών). Προεπιλογή = όπως πριν. Μόνο ψεύτικα ονόματα.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { TYPES, kolColsOf, stepColOf, type AppState, type Status, type TypeKey } from '../src/shared/domain';
import { hkaiCounts, kolView } from '../src/shared/rules';
import { listOf, listRows, typeHkChoices, typeHkOf, itemName } from '../src/shared/ranks';
import { essoDischarge, essoMonthsOf, ESSO_MONTH, personDischarge, seasonEsso } from '../src/shared/mode';
import { autoCell, handChoices, handCount } from '../src/shared/imer';
import { planCode, planSheet, quotaShort } from '../src/shared/cadrePlan';
import { imerBook } from '../src/main/excel';
import { readBook } from '../src/main/sources';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'p5' + ++n }).state;
const stat = (pid: number, type: TypeKey, extra: Partial<Status> = {}): Status => ({ id: 's' + ++n, pid, type, from: D, to: D, ...extra } as Status);
const setLists = (s: AppState, patch: object) => run(s, { t: 'setSettings', settings: { lists: { ...(s.settings.lists || {}), ...patch } }, text: 'x' });
const withCols = (s: AppState) => run(s, { t: 'setHkCols', cols: [{ name: 'Καραντίνα', grp: 'abs' }, { name: 'Συνοδεία', grp: 'kol' }] });
const cols = (s: AppState) => { const c = hkaiCounts(s, D).cols; return Object.fromEntries(Object.entries(c).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])); };

describe('Λ1: στήλη ΗΚΑΙ για ΣΤΕΠ', () => {
  const base = () => { const s = fakeState(10); s.statuses = [stat(1, 'STEP'), stat(2, 'STEP')]; return s; };
  it('προεπιλογή: πουθενά, ο ΣΤΕΠ δεν μετρά σε στήλη', () => {
    const s = base(); expect(stepColOf(s.settings.lists)).toBeNull(); expect(cols(s)).toEqual({});
    expect(kolView(s, D).man.map(r => r.col)).toEqual(['', '']);
  });
  it('με στήλη: μετρά εκεί, στην ΗΚΑΙ και στο kolView', () => {
    const s = setLists(base(), { stepCol: 'ey' });
    expect(cols(s)).toEqual({ ey: 2 }); expect(kolView(s, D).man.map(r => r.col)).toEqual(['ey', 'ey']);
  });
  it('δική σου στήλη κωλυομένων δεκτή· σβήνεται η στήλη = πουθενά, και η ρύθμιση καθαρίζεται', () => {
    let s = withCols(base()); const own = kolColsOf(s.settings.lists).find(c => c[1] === 'Συνοδεία')![0];
    s = setLists(s, { stepCol: own }); expect(cols(s)).toEqual({ [own]: 2 });
    s = run(s, { t: 'setHkCols', cols: [{ name: 'Καραντίνα', grp: 'abs', key: 'u1' }] });
    expect(stepColOf(s.settings.lists)).toBeNull(); expect(s.settings.lists?.stepCol).toBeUndefined(); expect(cols(s)).toEqual({});
  });
  it('άκυρη τιμή (στήλη απόντων) αγνοείται', () => { expect(cols(setLists(base(), { stepCol: 'ka' }))).toEqual({}); });
});

describe('Λ2: στήλη ΗΚΑΙ ανά βασική κατάσταση', () => {
  it('προεπιλογή: όπως το TYPES', () => {
    const s = fakeState(10);
    for (const k of Object.keys(TYPES) as TypeKey[]) expect(typeHkOf(k, s.settings.lists)).toBe(TYPES[k].hkai);
    s.statuses = [stat(1, 'NOS'), stat(2, 'SICK'), stat(3, 'AGN'), stat(4, 'EY'), stat(5, 'PUN'), stat(6, 'LEAVE', { kind: 'Κανονική' })];
    expect(cols(s)).toEqual({ nos: 1, an: 1, adik: 1, ey: 1, tim: 1, ka: 1 });
  });
  it('αλλαγή: απόντες σε στήλη απόντων, κωλυόμενοι σε στήλη κωλυομένων, άδεια για Κανονική (όχι Ειδική)', () => {
    let s = fakeState(10);
    s.statuses = [stat(1, 'NOS'), stat(2, 'SICK'), stat(3, 'AGN'), stat(4, 'EY'), stat(5, 'PUN'), stat(6, 'LEAVE', { kind: 'Κανονική' }), stat(7, 'LEAVE', { kind: 'Ειδική' })];
    s = setLists(s, { typeCols: { NOS: 'an', AGN: 'fp', EY: 'yp', PUN: 'mag', LEAVE: 'eid' } });
    expect(cols(s)).toEqual({ an: 2, fp: 1, yp: 1, mag: 1, eid: 2 });
  });
  it('άκυρη στήλη (άλλης ομάδας) = η προεπιλογή· οι επιλογές είναι της ίδιας ομάδας', () => {
    const s = setLists(fakeState(3), { typeCols: { NOS: 'ey', EY: 'ka' } });
    expect(typeHkOf('NOS', s.settings.lists)).toBe('nos'); expect(typeHkOf('EY', s.settings.lists)).toBe('ey');
    expect(typeHkChoices('NOS').map(c => c[0])).toContain('fp'); expect(typeHkChoices('NOS').map(c => c[0])).not.toContain('ey');
    expect(typeHkChoices('EY').map(c => c[0])).not.toContain('bl');
  });
  it('δική σου στήλη της ομάδας· σβήσιμο της στήλης = προεπιλογή και καθαρισμός', () => {
    let s = withCols(fakeState(10)); s.statuses = [stat(1, 'NOS'), stat(2, 'EY')];
    const ab = s.settings.lists!.hkCols!.find(c => c.grp === 'abs')!.key, ko = s.settings.lists!.hkCols!.find(c => c.grp === 'kol')!.key;
    expect(typeHkChoices('NOS', s.settings.lists).map(c => c[0])).toContain(ab);
    s = setLists(s, { typeCols: { NOS: ab, EY: ko } }); expect(cols(s)).toEqual({ [ab]: 1, [ko]: 1 });
    s = run(s, { t: 'setHkCols', cols: [] });
    expect(cols(s)).toEqual({ nos: 1, ey: 1 }); expect(s.settings.lists?.typeCols).toBeUndefined();
  });
});

describe('Λ3: λόγοι κίνησης', () => {
  it('προεπιλογή: οι τρεις βασικοί με τη σειρά τους, χωρίς κρυφούς', () => {
    expect(listRows(undefined, 'moveWhys').map(r => [r.name, r.builtin, r.hidden])).toEqual([['ΜΕΤΑΘΕΣΗ', true, false], ['ΑΠΟΣΠΑΣΗ', true, false], ['ΑΠΟΛΥΣΗ', true, false]]);
    expect(listOf(undefined, 'moveWhys')).toEqual(['ΜΕΤΑΘΕΣΗ', 'ΑΠΟΣΠΑΣΗ', 'ΑΠΟΛΥΣΗ']);
  });
  it('δικός σου λόγος μπαίνει στο τέλος, με κεφαλαία· η Απόσπαση μένει με τη σταθερή τιμή της', () => {
    const s = setLists(fakeState(3), { moveWhys: { add: [{ name: itemName('νοσοκομειο', 'moveWhys') }] } });
    expect(listOf(s.settings.lists, 'moveWhys')).toEqual(['ΜΕΤΑΘΕΣΗ', 'ΑΠΟΣΠΑΣΗ', 'ΑΠΟΛΥΣΗ', 'ΝΟΣΟΚΟΜΕΙΟ']);
    const r = run(run(s, { t: 'setSettings', settings: { mode: 'unit' }, text: 'x' }), { t: 'addMove', pid: 1, dir: 'out', why: 'ΑΠΟΣΠΑΣΗ', on: D });
    expect(r.people.find(p => p.id === 1)!.moves![0].why).toBe('ΑΠΟΣΠΑΣΗ');
  });
});

describe('Λ4: μήνας κατάταξης ΕΣΣΟ', () => {
  it('προεπιλογή: ίδιες ημερομηνίες απόλυσης και σειρά της εποχής', () => {
    const em = essoMonthsOf(fakeState(1).settings); expect(em).toEqual(ESSO_MONTH);
    expect(essoDischarge({ s: 'Γ', y: 2026 }, 12, em)).toEqual(essoDischarge({ s: 'Γ', y: 2026 }));
    expect(seasonEsso(D, em)).toEqual({ s: 'Δ', y: 2026 }); expect(seasonEsso('2027-01-05', em)).toEqual({ s: 'Δ', y: 2026 });
  });
  it('αλλαγή: η απόλυση, η καρτέλα και η τωρινή σειρά ακολουθούν· άκυρες τιμές αγνοούνται', () => {
    const s = run(fakeState(1), { t: 'setSettings', settings: { essoMonth: { Γ: 9, Δ: 13 } }, text: 'x' });
    const em = essoMonthsOf(s.settings);
    expect(em).toEqual({ ...ESSO_MONTH, Γ: 9 });
    expect(essoDischarge({ s: 'Γ', y: 2026 }, 12, em)).toEqual({ y: 2027, m: 9 });
    expect(personDischarge({ essos: '2026 Γ΄', serve: 9 }, em)).toEqual({ y: 2027, m: 6 });
    expect(seasonEsso('2026-09-10', em)).toEqual({ s: 'Γ', y: 2026 }); expect(seasonEsso('2026-08-20', em)).toEqual({ s: 'Β', y: 2026 });
  });
});

describe('Λ5α: ΑΓ και ΛΙΠ στο Ημερολόγιο κωλυομένων', () => {
  afterEach(() => { vi.useRealTimers(); });
  const base = () => { const s = fakeState(6); s.statuses = [stat(1, 'AGN'), stat(2, 'LIP')]; return s; };
  const cell = (s: AppState, pid: number) => autoCell(s, s.people.find(p => p.id === pid)!, D)!;
  const texts = async (s: AppState) => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T10:00:00') });
    const m = await imerBook(s, { from: '2026-11-16', to: '2026-11-18' });
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-p5-')), 'x.xlsx'); fs.writeFileSync(f, m.data);
    return (await readBook(f)).sheets.flatMap(sh => sh.rows.flat().map(String));
  };
  it('προεπιλογή: ΑΓ/ΛΙΠ, απών, και δεν αλλάζουν προτάσεις ούτε το χέρι', () => {
    const s = base();
    expect(cell(s, 1)).toMatchObject({ code: 'ΑΓ', count: 'A' }); expect(cell(s, 2)).toMatchObject({ code: 'ΛΙΠ', count: 'A' });
    expect(handChoices(s.settings)).not.toContain('ΑΓ'); expect(handCount(s.settings, 'ΑΓ')).toEqual({ key: 'ΑΓ', count: 'P' });
  });
  it('αλλαγή κωδικού: κελί, χέρι, προτάσεις και Excel', async () => {
    const s = run(base(), { t: 'setSettings', settings: { imer: { codes: { 'ΑΓ': { code: 'ΑΓΝ' }, 'ΛΙΠ': { code: 'ΛΠ' } } } }, text: 'x' });
    expect(cell(s, 1).code).toBe('ΑΓΝ'); expect(cell(s, 2).code).toBe('ΛΠ');
    expect(handCount(s.settings, 'ΑΓΝ')).toEqual({ key: 'ΑΓ', count: 'A' }); expect(handChoices(s.settings)).toContain('ΑΓΝ');
    const all = await texts(s);
    expect(all).toContain('ΑΓΝ'); expect(all).toContain('ΛΠ'); expect(all).not.toContain('ΛΙΠ');
  });
  it('χωρίς αλλαγή: το Excel δεν έχει γραμμές υπομνήματος ΑΓ/ΛΙΠ', async () => {
    const all = await texts(fakeState(6));
    expect(all).not.toContain('ΣΕ ΑΓΝΟΙΑ'); expect(all).not.toContain('ΣΕ ΛΙΠΟΤΑΞΙΑ');
  });
});

describe('Λ5β: κωδικός ανά κατάσταση στο Πρόγραμμα αδειών', () => {
  it('προεπιλογή: όπως πριν', () => {
    const st = fakeState(3).settings;
    expect(['ka', 'amd', 'apal', 'an', 'nos', 'yp', 'adik'].map(k => planCode(k, st).code)).toEqual(['ΚΑ', 'ΑΜΔ', 'ΑΠ', 'ΑΝ', 'ΝΟΣ', 'ΥΠ', 'ΑΔΙΚ']);
  });
  it('αλλαγή: ο κωδικός αλλάζει, και στο υπόλοιπο αδειών', () => {
    const s = setLists(fakeState(3), { planCodes: { ka: 'ΚΑΝ', yp: ' ε π ' } });
    expect(planCode('ka', s.settings).code).toBe('ΚΑΝ'); expect(planCode('yp', s.settings).code).toBe('ΕΠ'); expect(planCode('amd', s.settings).code).toBe('ΑΜΔ');
    expect(quotaShort({ kinds: ['ka'], name: 'Κανονική άδεια' } as never, s.settings.lists)).toBe('ΚΑΝ');
  });
  it('δικό σου είδος και αποδιπλασιασμός: ίδιος κωδικός παίρνει αριθμό, ο ρητός πρώτος', () => {
    let s = setLists(fakeState(3), { cadreAbs: { add: [{ name: 'Άδεια αιμοδοσίας', col: 'ka' }, { name: 'Άδεια ασθενείας', col: 'ka' }] } });
    expect(planCode('Άδεια αιμοδοσίας', s.settings).code).toBe('ΑΑ'); expect(planCode('Άδεια ασθενείας', s.settings).code).toBe('ΑΑ2');
    s = setLists(s, { planCodes: { 'Άδεια ασθενείας': 'ΑΑ' } });
    expect(planCode('Άδεια ασθενείας', s.settings).code).toBe('ΑΑ'); expect(planCode('Άδεια αιμοδοσίας', s.settings).code).toBe('ΑΑ2');
  });
  it('το φύλλο/Excel χρησιμοποιεί τον κωδικό', () => {
    let s = fakeState(3);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΠΑΠΑΔΑΚΗΣ', first: 'ΓΕΩΡΓΙΟΣ' } });
    const c = s.cadreList[0]; s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'ka', from: '2026-12-02', to: '2026-12-03' }, replace: false });
    s = setLists(s, { planCodes: { ka: 'ΑΔ' } });
    const sh = planSheet(s, '2026-12', 'all'); expect(sh.rows[0].cells[1]).toBe('ΑΔ'); expect(sh.legend.map(l => l.code)).toContain('ΑΔ');
  });
});
