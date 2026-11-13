// Λειτουργία μονάδας (μέρος 1): διακόπτης, νέος στρατιώτης με ΕΣΣΟ/ημερομηνία/ήρθε από/Λόχο, ΗΚΑΙ, μήνας απόλυσης,
// Δυναμολόγιο Excel με στήλες ΕΣΣΟ και Λόχος. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx, type NewPerson } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { hkaiEgrLines, linesText } from '../src/shared/hkaiText';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { ESSO_MONTH, dischargeLabel, essoChoices, essoDischarge, essoRows, daysToDischarge, defaultEsso, isUnit, seasonEsso, subRows, SUB_CHIPS_MAX, subKeyOf } from '../src/shared/mode';
import { listOf } from '../src/shared/ranks';
import { fakeState } from './fixtures';

const TODAY = '2026-11-13';
const ctx: Ctx = { today: TODAY, newId: () => 'x' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const NEW: NewPerson = { rank: 'στρ', spec: 'πζ', last: 'Καινούργιος', first: 'Νέος', father: 'Πατέρας', asm: '910001', phone: '', room: null, si: 'Ι1', post: null, role: null, essos: '2026 Γ΄', attached: false, notes: '' };
const unit = (s: AppState): AppState => run(s, { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' });

describe('διακόπτης λειτουργίας', () => {
  it('χωρίς ρύθμιση είναι κέντρο', () => {
    expect(isUnit(fakeState(2).settings)).toBe(false);
    expect(isUnit({ mode: 'centre' })).toBe(false);
    expect(isUnit({ mode: 'unit' })).toBe(true);
  });
  it('η πρώτη μετάβαση σε μονάδα ανοίγει τον μέσο όρο μόνο αν δεν είχε οριστεί', () => {
    const s0 = fakeState(2);
    const r = apply(s0, { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' }, ctx);
    expect(r.state.rules.newAvg).toBe(true); expect(r.text).toMatch(/μέσο όρο/);
    // ήδη ορισμένο (false): δεν αλλάζει
    const s1 = { ...s0, rules: { ...s0.rules, newAvg: false } };
    expect(run(s1, { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' }).rules.newAvg).toBe(false);
    // επιστροφή στο κέντρο: τίποτα δεν σβήνεται, ούτε αλλάζει ο κανόνας
    const back = run(r.state, { t: 'setSettings', settings: { mode: 'centre' }, text: 'κέντρο' });
    expect(back.rules.newAvg).toBe(true); expect(back.people.length).toBe(2);
    // άλλη ρύθμιση στο κέντρο δεν αγγίζει τον κανόνα
    expect(run(s0, { t: 'setSettings', settings: { place: 'Χ' }, text: 'τόπος' }).rules.newAvg).toBeUndefined();
  });
});

describe('νέος στρατιώτης στη μονάδα', () => {
  it('κρατά ΕΣΣΟ, ημερομηνία εισαγωγής, «Ήρθε από» (κεφαλαία) και Λόχο', () => {
    const s = run(unit(fakeState(3)), { t: 'addPerson', person: { ...NEW, inOn: '2026-09-10', came: ' κεν  αυλωνα ', sub: ' 1ος ΛΟΧΟΣ ' } });
    expect(s.people[3]).toMatchObject({ essos: '2026 Γ΄', inOn: '2026-09-10', came: 'ΚΕΝ ΑΥΛΩΝΑ', sub: '1ος ΛΟΧΟΣ' });
  });
  it('ημερομηνία πάνω από ένα χρόνο μπροστά δεν δέχεται· σήμερα προεπιλογή όπως πριν', () => {
    const s = unit(fakeState(3));
    expect(() => apply(s, { t: 'addPerson', person: { ...NEW, inOn: '2028-01-01' } }, ctx)).toThrow(/ένα χρόνο/);
    expect(run(s, { t: 'addPerson', person: NEW }).people[3].inOn).toBe(TODAY);
    expect('came' in run(s, { t: 'addPerson', person: NEW }).people[3]).toBe(false);
  });
  it('η καρτέλα διορθώνει ΕΣΣΟ, ημερομηνία, ήρθε από και Λόχο', () => {
    const s = run(unit(fakeState(3)), { t: 'addPerson', person: NEW });
    const p = { ...s.people[3], inOn: '2026-10-01', came: 'μετάθεση', sub: '4η ΙΛΗ' };
    expect(run(s, { t: 'updatePerson', person: p }).people[3]).toMatchObject({ inOn: '2026-10-01', came: 'ΜΕΤΑΘΕΣΗ', sub: '4η ΙΛΗ' });
  });
});

describe('ΗΚΑΙ 1. ΕΓΓΡΑΦΕΣ', () => {
  const mk = (mode?: 'unit') => { const s = fakeState(3); s.people[1] = { ...s.people[1], inOn: TODAY, came: 'ΚΕΝ ΑΥΛΩΝΑ' }; s.settings = { ...s.settings, ...(mode ? { mode } : {}) }; return s; };
  it('στη μονάδα προστίθεται «ΗΡΘΕ ΑΠΟ …»', () => {
    expect(linesText(hkaiEgrLines(mk('unit'), TODAY))).toMatch(/ΕΣΣΟ 2026 Γ΄: ΗΡΘΕ ΑΠΟ ΚΕΝ ΑΥΛΩΝΑ\.$/);
  });
  it('στο κέντρο η γραμμή μένει όπως ήταν', () => {
    const t = linesText(hkaiEgrLines(mk(), TODAY));
    expect(t).toMatch(/ΕΣΣΟ 2026 Γ΄\.$/); expect(t).not.toMatch(/ΗΡΘΕ/);
  });
  it('χωρίς «Ήρθε από» δεν προστίθεται τίποτα στη μονάδα', () => {
    const s = mk('unit'); delete s.people[1].came;
    expect(linesText(hkaiEgrLines(s, TODAY))).toMatch(/ΕΣΣΟ 2026 Γ΄\.$/);
  });
});

describe('ΕΣΣΟ και απόλυση', () => {
  it('μήνας κατάταξης κάθε σειράς και +12 μήνες', () => {
    expect(ESSO_MONTH).toEqual({ Α: 2, Β: 5, Γ: 8, Δ: 11 });
    expect(essoDischarge({ s: 'Δ', y: 2025 })).toEqual({ y: 2026, m: 11 });
    expect(dischargeLabel(essoDischarge({ s: 'Δ', y: 2025 }))).toBe('Νοέμβριος 2026');
    expect(dischargeLabel(essoDischarge({ s: 'Α', y: 2026 }))).toBe('Φεβρουάριος 2027');
    expect(dischargeLabel(essoDischarge({ s: 'Γ', y: 2026 }))).toBe('Αύγουστος 2027');
    expect(essoDischarge({ s: 'Γ', y: 2026 }, 9)).toEqual({ y: 2027, m: 5 });
  });
  it('μέρες ως το τέλος του μήνα απόλυσης', () => {
    expect(daysToDischarge({ y: 2026, m: 11 }, TODAY)).toBe(17);
    expect(daysToDischarge({ y: 2026, m: 10 }, TODAY)).toBeLessThan(0);
    expect(daysToDischarge({ y: 2027, m: 8 }, TODAY)).toBeGreaterThan(30);
  });
  it('πίνακας ΕΣΣΟ: σε δύναμη και εκτός, από την παλιότερη· λίστα επιλογής και προεπιλογή', () => {
    const s = fakeState(5);
    s.people[0].essos = '2025 Δ΄'; s.people[1].essos = "2026 Α'"; s.people[1].active = false; s.people[4].essos = '';
    const rows = essoRows(s.people);
    expect(rows.map(r => [r.txt, r.active, r.inactive])).toEqual([['2025 Δ΄', 1, 0], ['2026 Α΄', 0, 1], ['2026 Γ΄', 2, 0]]);
    expect(seasonEsso(TODAY)).toEqual({ s: 'Δ', y: 2026 });
    expect(seasonEsso('2027-01-05')).toEqual({ s: 'Δ', y: 2026 });
    expect(essoChoices(s.people, TODAY)).toEqual(['2027 Β΄', '2027 Α΄', '2026 Δ΄', '2026 Γ΄', '2026 Α΄', '2025 Δ΄']);
    expect(defaultEsso(s.people, TODAY)).toBe('2026 Γ΄');
  });
});

describe('Λόχοι / Ίλες', () => {
  const withList = (names: string[]): AppState => { const s = fakeState(6); s.settings = { ...s.settings, lists: { subUnits: { add: names.map(name => ({ name })) } } }; return s; };
  it('η λίστα είναι δική σου, με τη σειρά που μπήκε', () => {
    expect(listOf(fakeState(1).settings.lists, 'subUnits')).toEqual([]);
    expect(listOf(withList(['1ος ΛΟΧΟΣ', '4η ΙΛΗ']).settings.lists, 'subUnits')).toEqual(['1ος ΛΟΧΟΣ', '4η ΙΛΗ']);
  });
  it('πλήθος ανά Λόχο/Ίλη μόνο για όσους είναι σε δύναμη, και φίλτρο με το ίδιο κλειδί', () => {
    const s = withList(['1ος ΛΟΧΟΣ', '4η ΙΛΗ']);
    s.people[0].sub = '1ος ΛΟΧΟΣ'; s.people[1].sub = '1ος ΛΟΧΟΣ'; s.people[2].sub = '4η ΙΛΗ'; s.people[3].sub = '4η ΙΛΗ'; s.people[3].active = false; s.people[4].sub = 'ΑΛΛΗ';
    expect(subRows(s.people, s.settings.lists)).toEqual([{ name: '1ος ΛΟΧΟΣ', n: 2 }, { name: '4η ΙΛΗ', n: 1 }, { name: 'ΑΛΛΗ', n: 1 }]);
    expect(s.people.filter(p => p.active && subKeyOf(p) === subKeyOf({ sub: '1ος λοχος' })).length).toBe(2);
    expect(SUB_CHIPS_MAX).toBe(6);
  });
  it('η μετονομασία αλλάζει τη λίστα και τους στρατιώτες· διπλό όνομα δεν δέχεται', () => {
    const s = withList(['1ος ΛΟΧΟΣ', '4η ΙΛΗ']); s.people[0].sub = '1ος ΛΟΧΟΣ'; s.people[1].sub = '4η ΙΛΗ';
    const r = run(s, { t: 'renameSub', from: '1ος ΛΟΧΟΣ', to: '2ος ΛΟΧΟΣ' });
    expect(listOf(r.settings.lists, 'subUnits')).toEqual(['2ος ΛΟΧΟΣ', '4η ΙΛΗ']);
    expect(r.people.map(p => p.sub)).toEqual(['2ος ΛΟΧΟΣ', '4η ΙΛΗ', undefined, undefined, undefined, undefined]);
    expect(() => apply(s, { t: 'renameSub', from: '1ος ΛΟΧΟΣ', to: '4η ιλη' }, ctx)).toThrow(/ήδη/);
  });
});

describe('Δυναμολόγιο Excel με στήλες ΕΣΣΟ, ημερομηνία και Λόχο', () => {
  const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'ΕΣΣΟ', 'ΗΜ. ΕΙΣΑΓΩΓΗΣ', 'ΛΟΧΟΣ'];
  const sheet = (head: string[] = HEAD): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ Γ΄ ΕΣΣΟ 2026'], head,
    [1, 'ΣΤΡ', 'ΠΖ', 'ΑΛΦΑ', 'ΒΗΤΑ', 'ΓΑΜΜΑ', 100001, "2025 Δ'", '02/12/2025', '1ος ΛΟΧΟΣ'],
    [2, 'ΣΤΡ', 'ΠΖ', 'ΔΕΛΤΑ', 'ΕΨΙΛΟΝ', 'ΖΗΤΑ', 100002, '', new Date(Date.UTC(2026, 8, 10)), ''],
    [3, 'ΣΤΡ', 'ΠΖ', 'ΗΤΑ', 'ΘΗΤΑ', 'ΙΩΤΑ', 100003, 'Β΄ ΕΣΣΟ 2026', 46000, 'ΙΛΗ 4']] as RawSheet['rows'] });
  it('στη μονάδα η τιμή της γραμμής νικά τον τίτλο', () => {
    const r = parseRoster([sheet()], {}, undefined, true).rows;
    expect(r.map(x => x.essos)).toEqual(['2025 Δ΄', '2026 Γ΄', '2026 Β΄']);
    expect(r[0]).toMatchObject({ inOn: '2025-12-02', sub: '1ος ΛΟΧΟΣ'.toUpperCase() });
    expect(r[1].inOn).toBe('2026-09-10'); expect('sub' in r[1]).toBe(false);
    expect(r[2].inOn).toBe('2025-12-09'); expect(r[2].sub).toBe('ΙΛΗ 4');   // αριθμός του Excel
  });
  it('στο κέντρο οι στήλες αγνοούνται και η ΕΣΣΟ βγαίνει από τον τίτλο', () => {
    const r = parseRoster([sheet()]).rows;
    expect(r.map(x => x.essos)).toEqual(['2026 Γ΄', '2026 Γ΄', '2026 Γ΄']);
    expect(r.some(x => 'inOn' in x || 'sub' in x)).toBe(false);
  });
  it('άλλες γραφές επικεφαλίδων', () => {
    const r = parseRoster([sheet(['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Ε.Σ.Σ.Ο.', 'ΗΜΕΡΟΜΗΝΙΑ ΕΙΣΑΓΩΓΗΣ', 'ΥΠΟΜΟΝΑΔΑ'])], {}, undefined, true).rows;
    expect(r[0]).toMatchObject({ essos: '2025 Δ΄', inOn: '2025-12-02' });
  });
});
