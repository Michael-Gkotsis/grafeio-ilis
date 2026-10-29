// Ίλη ή Λόχος (ΗΚΑΙ / ΗΚΑΛ) και γραμμές της ΗΚΑΙ που προσθέτει ο χρήστης (Michael, 18/10)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { hkaiCounts, hkRankOf } from '../src/shared/rules';
import { guessHk, hkRowsOf } from '../src/shared/ranks';
import { hkRowLabel, unitSettingsFor, unitText } from '../src/shared/unit';
import { hkaiFront } from '../src/renderer/sheets';
import { detectHkai } from '../src/shared/sources';
import { preflight } from '../src/shared/preflight';
import { fakeState as fakeNew } from './fixtures';
// η παλιά διάταξη (κεφαλίδα αριστερά, ημερομηνία δεξιά): αυτά τα τεστ δεν αφορούν τη θέση τους (head-date-swap.test.ts)
const fakeState: typeof fakeNew = n => { const s = fakeNew(n); return { ...s, settings: { ...s.settings, hdLeft: true } }; };

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'u' + ++seq };
const OUT = process.env.EXPORT_OUT;
const save = (name: string, data: Buffer) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), data); } };

describe('λέξεις της μονάδας', () => {
  it('ίλη → λόχος με το τακτικό στο σωστό γένος, και πίσω', () => {
    expect(unitText('4ης ΙΛΗΣ', 'lochos')).toBe('4ου ΛΟΧΟΥ');
    expect(unitText('4η ΙΛΗ', 'lochos')).toBe('4ος ΛΟΧΟΣ');
    expect(unitText('2η ΕΠΧΙΑ Ν/Σ', 'lochos')).toBe('2ο ΤΑΓΜΑ Ν/Σ');
    expect(unitText('2Η ΕΠΧΙΑ', 'lochos')).toBe('2Ο ΤΑΓΜΑ');
    expect(unitText('ΔΚΤΗΣ ΕΠΧΙΑΣ', 'lochos')).toBe('ΔΚΤΗΣ ΤΑΓΜΑΤΟΣ');
    expect(unitText('ΑΛΧΙΑΣ ΙΛΗΣ', 'lochos')).toBe('ΑΛΧΙΑΣ ΛΟΧΟΥ');
    expect(unitText('ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', 'lochos')).toBe('ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)');
    expect(unitText('ΦΙΛΗΣ ΙΛΗΣ', 'lochos')).toBe('ΦΙΛΗΣ ΛΟΧΟΥ');
    expect(unitText('4ου ΛΟΧΟΥ', 'ili')).toBe('4ης ΙΛΗΣ');
    expect(unitText('2ο ΤΑΓΜΑ Ν/Σ', 'ili')).toBe('2η ΕΠΧΙΑ Ν/Σ');
    expect(unitSettingsFor({ unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'], unitName: '4ης ΙΛΗΣ' }, 'lochos'))
      .toEqual({ unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2ο ΤΑΓΜΑ Ν/Σ', '4ος ΛΟΧΟΣ'], unitName: '4ου ΛΟΧΟΥ' });
  });
});

describe('ΗΚΑΛ (λόχος)', () => {
  it('όνομα αρχείου, γραμμές αξιωματικών, υπογραφές και κεφαλίδα του λόχου· οι τύποι μένουν', async () => {
    let s = fakeState(40);
    s = apply(s, { t: 'setSettings', settings: { unitKind: 'lochos', ...unitSettingsFor(s.settings, 'lochos') }, text: 'λόχος' }, ctx).state;
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    expect(r.name).toBe('ΗΚΑΛ 12.10.26.xlsx');
    const wb = await Workbook.open(r.data); const fr = await wb.sheet(0); const bk = await wb.sheet(1);
    expect(fr.get('A4')).toBe('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ΟΥ ΛΟΧΟΥ ΤΗΣ 12 ΟΚΤ 26');
    expect(fr.get('A2')).toBe('2Ο ΤΑΓΜΑ');
    expect([fr.get('A17'), fr.get('A18'), fr.get('A19'), fr.get('A23'), fr.get('A29')]).toEqual(['ΤΑΓΜΑΤΑΡΧΕΣ', 'ΛΟΧΑΓΟΙ', 'ΥΠΟΛΟΧΑΓΟΙ-ΑΝΘΥΠΟΛΟΧΑΓΟΙ', 'ΑΡΧΙΛΟΧΙΕΣ', 'ΣΤΡΑΤΙΩΤΕΣ']);
    expect(fr.get('G37')).toBe('ΑΛΧΙΑΣ ΛΟΧΟΥ');
    expect(fr.get('V37')).toBe('ΔΙΟΙΚΗΤΗΣ ΛΟΧΟΥ');
    expect(bk.get('L26')).toBe('ΔΙΟΙΚΗΤΗΣ ΛΟΧΟΥ');
    expect(fr.formula('E29')).toBe('SUM(C29:D29)');
    expect(fr.formula('C22')).toBe('SUM(C17:C21)');
  });
  it('ΦΡΟΥΡΑ και εξοδούχοι: κεφαλίδα και υπογραφές του λόχου', async () => {
    let s = fakeState(40);
    s = apply(s, { t: 'setSettings', settings: { unitKind: 'lochos', ...unitSettingsFor(s.settings, 'lochos') }, text: 'λόχος' }, ctx).state;
    const f = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, '2026-10-12')).data)).sheet(0);
    expect([f.get('L2'), f.get('L3'), f.get('B46'), f.get('D46'), f.get('K46')]).toEqual(['2Ο ΤΑΓΜΑ Ν/Σ', '4ΟΣ ΛΟΧΟΣ', 'ΑΛΧΙΑΣ ΛΟΧΟΥ', 'ΔΚΤΗΣ ΛΟΧΟΥ', 'ΔΚΤΗΣ ΤΑΓΜΑΤΟΣ']);
    const o = await (await Workbook.open((await fillOuts(T('exodouxoi.xlsx'), s, '2026-10-12')).data)).sheet(0);
    expect(o.get('H3')).toBe('4ΟΣ ΛΟΧΟΣ');
    expect(Object.values(o.dump().cells).some(v => /ΙΛΗ/.test(v))).toBe(false);
  });
  it('στην ίλη τα έντυπα μένουν όπως πριν', async () => {
    const s = fakeState(40);
    const fr = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, '2026-10-12')).data)).sheet(0);
    expect([fr.get('A17'), fr.get('A2'), fr.get('G37')]).toEqual(['Επίλαρχοι', '2Η ΕΠΧΙΑ', 'ΑΛΧΙΑΣ ΙΛΗΣ']);
  });
});

describe('δικές σου γραμμές στην ΗΚΑΙ', () => {
  const withRows = () => {
    let s = fakeState(40);
    s = apply(s, { t: 'saveCadre', cadre: { rank: 'ΛΓΟΣ', hk: 'Ίλαρχοι', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' } }, ctx).state;
    s = apply(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΤΥΧΑΙΟΣ', first: 'ΒΗΤΑΣ' } }, ctx).state;
    s = apply(s, { t: 'setHkRows', rows: [
      { name: 'Λοχαγοί', grp: 'off', after: 'Ίλαρχοι', ranks: ['ΛΓΟΣ'] },
      { name: 'Αντισυνταγματάρχες', grp: 'off', after: 'ΔΕΑ' },
      { name: 'Έφεδροι', grp: 'nco', after: 'Στρατιώτες', ranks: ['ΕΦ ΣΤΡ'] }
    ], text: 'γραμμές' }, ctx).state;
    return s;
  };
  it('σειρά γραμμών, βαθμοί που μαζεύουν, στελέχη που μετακινούνται', () => {
    const s = withRows();
    expect(hkRowsOf(s.settings.lists).off).toEqual(['Επίλαρχοι', 'Ίλαρχοι', 'Λοχαγοί', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ', 'Αντισυνταγματάρχες']);
    expect(guessHk('ΛΓΟΣ', s.settings.lists)).toBe('Λοχαγοί');
    expect(hkRankOf('ΕΦ ΣΤΡ', s.settings.lists)).toBe('Έφεδροι');
    expect(s.cadreList.map(c => c.rank + ':' + c.hk)).toEqual(expect.arrayContaining(['ΛΓΟΣ:Λοχαγοί', 'ΙΛΧΟΣ:Ίλαρχοι']));
    const h = hkaiCounts(s, '2026-10-12');
    expect([h.rank['Λοχαγοί'].n, h.rank['Ίλαρχοι'].n]).toEqual([1, 1]);
    // σβήνεται η γραμμή: το στέλεχος γυρνά εκεί που θα ήταν
    const t = apply(s, { t: 'setHkRows', rows: [], text: 'γραμμές' }, ctx).state;
    expect(t.cadreList.find(c => c.rank === 'ΛΓΟΣ')!.hk).toBe('Ίλαρχοι');
  });
  it('μπαίνουν στο έντυπο με τύπους και μέσα στα σύνολα· ό,τι είναι από κάτω κατεβαίνει', async () => {
    let s = withRows();
    s = { ...s, people: s.people.map((p, i) => (i < 3 ? { ...p, rank: 'ΕΦ ΣΤΡ' } : p)) };
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    save('ΗΚΑΙ γραμμές.xlsx', r.data);
    expect(r.warnings).toEqual([]);
    const fr = await (await Workbook.open(r.data)).sheet(0);
    // Λοχαγοί στη 19 (κάτω από Ίλαρχοι), Αντισυνταγματάρχες στη 23 (μετά τον ΔΕΑ), σύνολο αξκών στη 24
    expect([fr.get('A18'), fr.get('A19'), fr.get('A20'), fr.get('A22'), fr.get('A23'), fr.get('A24')]).toEqual(['ΙΛΑΡΧΟΙ', 'ΛΟΧΑΓΟΙ', 'ΑΝΘΥΠΙΛΑΡΧΟΙ-ΑΝΘΛΓΟΙ', 'ΔΕΑ', 'ΑΝΤΙΣΥΝΤΑΓΜΑΤΑΡΧΕΣ', 'ΣΥΝΟΛΟ ΑΞΚΩΝ']);
    expect(fr.get('C19')).toBe('1');
    expect(fr.formula('E19')).toBe('SUM(C19:D19)');
    expect(fr.formula('AA23')).toBe('E23-Z23');
    expect(fr.formula('C24')).toBe('SUM(C17:C23)');
    // Έφεδροι μετά τους Στρατιώτες (32), σύνολο οπλιτών 33, γενικό 34
    expect([fr.get('A31'), fr.get('A32'), fr.get('A33'), fr.get('A34')]).toEqual(['ΣΤΡΑΤΙΩΤΕΣ', 'ΕΦΕΔΡΟΙ', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ']);
    expect(fr.get('C32')).toBe('3');
    expect(fr.formula('C33')).toBe('SUM(C25:C32)');
    expect(fr.formula('C34')).toBe('SUM(C24,C33)');
    // η ημερομηνία κάτω από τον πίνακα κατέβηκε 3 γραμμές· οι ΜΕΤΑΒΟΛΕΣ στο πλάι αριθμημένες χωρίς κενό
    expect(fr.get('V37')).toMatch(/^ΑΥΛΩΝΑΣ, 12 ΟΚΤ 26$/);
    expect([fr.get('AC17'), fr.get('AC18'), fr.get('AC19'), fr.get('AC20'), fr.get('AC21'), fr.get('AC22'), fr.get('AC23'), fr.get('AC24')]).toEqual(['1', '2', '3', '4', '5', '6', '7', 'ΔΙΑΓΡΑΦΗΚΑΝ']);
    expect(preflight('hkai', s, '2026-10-12').filter(c => c.level === 'err')).toEqual([]);
  });
});

describe('άλλο όνομα γραμμής και κεφαλίδα της ΗΚΑΙ (Michael, 18/10)', () => {
  it('βασική και δική σου γραμμή με άλλο όνομα: στην οθόνη, στο έντυπο, στην αναγνώριση template· το κλειδί μένει', async () => {
    let s = fakeState(40);
    s = apply(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΤΥΧΑΙΟΣ', first: 'ΒΗΤΑΣ' } }, ctx).state;
    s = apply(s, { t: 'setHkRows', rows: [{ name: 'Λοχαγοί', grp: 'off', after: 'Ίλαρχοι' }], names: { 'Ίλαρχοι': ' Ίλαρχοι  Λοχαγοί ', 'Λοχαγοί': 'Λγοί', 'Άγνωστη': 'Χ', 'Λοχίες': '' }, text: 'ονόματα' }, ctx).state;
    expect(s.settings.lists!.hkNames).toEqual({ 'Ίλαρχοι': 'Ίλαρχοι Λοχαγοί', 'Λοχαγοί': 'Λγοί' });
    expect(s.cadreList.find(c => c.rank === 'ΙΛΧΟΣ')!.hk).toBe('Ίλαρχοι');
    expect([hkRowLabel('Ίλαρχοι', s.settings), hkRowLabel('Επίλαρχοι', s.settings)]).toEqual(['Ίλαρχοι Λοχαγοί', 'Επίλαρχοι']);
    expect(hkaiFront(s, '2026-10-12', hkaiCounts(s, '2026-10-12')).rows.flat().some(c => c?.v === 'Ίλαρχοι Λοχαγοί')).toBe(true);
    // στον λόχο το δικό σου όνομα κερδίζει το «Λοχαγοί» του λόχου
    expect(hkRowLabel('Ίλαρχοι', { ...s.settings, unitKind: 'lochos' })).toBe('Ίλαρχοι Λοχαγοί');
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    const fr = await (await Workbook.open(r.data)).sheet(0);
    expect([fr.get('A17'), fr.get('A18'), fr.get('A19')]).toEqual(['ΕΠΙΛΑΡΧΟΙ', 'ΙΛΑΡΧΟΙ ΛΟΧΑΓΟΙ', 'ΛΓΟΙ']);
    expect(fr.get('C18')).toBe('1');
    // το έντυπο που βγήκε, αν γίνει template, βρίσκει τις γραμμές με τα νέα ονόματα
    const rows = Array.from({ length: 40 }, (_, i) => Array.from({ length: 4 }, (_, c) => fr.get(String.fromCharCode(65 + c) + (i + 1)) || ''));
    const d = detectHkai({ name: 'x', rows }, 'Αυλώνας', ['Λοχαγοί'], s.settings.lists!.hkNames);
    expect([d.map.rows['Ίλαρχοι'], d.map.rows['Λοχαγοί']]).toEqual([18, 19]);
    // σβήνεται η δική σου γραμμή: φεύγει και το όνομά της
    const t = apply(s, { t: 'setHkRows', rows: [], text: 'γραμμές' }, ctx).state;
    expect(t.settings.lists!.hkNames).toEqual({ 'Ίλαρχοι': 'Ίλαρχοι Λοχαγοί' });
  });
  it('η κεφαλίδα της ΗΚΑΙ: η δική σου (με τις λέξεις του λόχου), αλλιώς του εντύπου', async () => {
    let s = fakeState(40);
    const A = async (st: typeof s) => { const fr = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), st, '2026-10-12')).data)).sheet(0); return [fr.get('A1'), fr.get('A2'), fr.get('A3')]; };
    expect(await A(s)).toEqual(['ΚΕΤΘ', '2Η ΕΠΧΙΑ', 'ΚΑΤΑΣΤΑΣΗ']);
    s = apply(s, { t: 'setSettings', settings: { hkai: { head: ['ΚΕΝ Αυλώνα', '2η ΕΠΧΙΑ Ν/Σ'] } }, text: 'κεφαλίδα' }, ctx).state;
    expect(await A(s)).toEqual(['ΚΕΝ ΑΥΛΩΝΑ', '2Η ΕΠΧΙΑ Ν/Σ', 'ΚΑΤΑΣΤΑΣΗ']);
    expect(hkaiFront(s, '2026-10-12', hkaiCounts(s, '2026-10-12')).rows[1][0]!.v).toBe('2η ΕΠΧΙΑ Ν/Σ');
    s = apply(s, { t: 'setSettings', settings: { unitKind: 'lochos' }, text: 'λόχος' }, ctx).state;
    expect(await A(s)).toEqual(['ΚΕΝ ΑΥΛΩΝΑ', '2Ο ΤΑΓΜΑ Ν/Σ', 'ΚΑΤΑΣΤΑΣΗ']);
    // μόνο η 2η γραμμή: η 1η μένει του εντύπου
    s = apply(s, { t: 'setSettings', settings: { unitKind: 'ili', hkai: { head: ['', '3η ΕΠΧΙΑ'] } }, text: 'κεφαλίδα' }, ctx).state;
    expect((await A(s)).slice(0, 2)).toEqual(['ΚΕΤΘ', '3Η ΕΠΧΙΑ']);
  });
});
