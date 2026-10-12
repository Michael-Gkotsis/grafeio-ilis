import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { Workbook, mergeFirstSheets } from '../src/main/xlsx';
import { pskDays } from '../src/shared/dates';
import { fakeState } from './fixtures';
import { statOf } from '../src/shared/rules';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'x' + ++seq };
const OUT = process.env.EXPORT_OUT; // προαιρετικά: φάκελος για να ανοίξεις τα αρχεία στο Excel

function busyState() {
  let s = fakeState(90);
  s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [20, 21, 22, 23, 24, 25, 26, 27], from: '2026-10-10', to: '2026-10-14' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [30], from: '2026-10-11', to: '2026-10-13', kind: 'Περιορισμός' } }, ctx).state;
  s = apply(s, { t: 'approvePun', id: s.statuses.find(x => x.type === 'PUN')!.id }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [31], from: '2026-10-12', to: '2026-10-16', kind: 'Κράτηση' } }, ctx).state;
  s = apply(s, { t: 'outs', date: '2026-10-12', changes: [40, 41, 42].map(pid => ({ pid, from: null, to: 'OUT' as const })) }, ctx).state;
  return s;
}
const save = (name: string, data: Buffer) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), data); } };

describe('εξαγωγή Excel', () => {
  it('ΦΡΟΥΡΑ: θέσεις, τιμωρημένοι και απόντες, με επιπλέον γραμμές όταν δεν χωράνε', async () => {
    const s = busyState();
    const r = await fillFroura(T('froura.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const ws = await (await Workbook.open(r.data)).sheet(0);
    expect(ws.get('A5')).toBe('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 12 ΟΚΤ 2026');
    // μόνο επώνυμο και όνομα (γραφέας, 10/10)· ο Λ/Υ με βαθμό και τηλέφωνο
    expect(ws.get('C13')).toMatch(/^[Α-Ω]+\d* [Α-Ω]+$/);
    expect(ws.get('F27')).toMatch(/^[Α-Ω]+\d* [Α-Ω]+$/);
    expect(ws.get('B36')).not.toMatch(/ΣΤΡ|ΔΝΕΑΣ/);
    expect(ws.get('A9')).toMatch(/^Λ\/Υ: .+, ΤΗΛ: /);
    // 8 απόντες > 6 γραμμές: οι υπογραφές κατεβαίνουν 2 γραμμές
    expect(ws.get('I43')).toBeTruthy();
    expect(ws.get('B48')).toBe('ΑΛΧΙΑΣ ΙΛΗΣ');
    expect(r.warnings).toEqual([]);
  });
  it('ΗΚΑΙ: αριθμοί ανά βαθμό, οι τύποι μένουν, οι ποινές της μέρας στις αποφάσεις', async () => {
    const s = busyState();
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const wb = await Workbook.open(r.data); const fr = await wb.sheet(0); const bk = await wb.sheet(1);
    expect(fr.get('A4')).toBe('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ 12/10/26');
    expect(fr.get('C29')).toBe('89');
    expect(fr.get('C26')).toBe('1');
    expect(fr.get('O29')).toBe('8');
    expect(fr.formula('E29')).toBe('SUM(C29:D29)');
    expect(fr.formula('AA29')).toBe('E29-Z29');
    expect(bk.get('G11')).toMatch(/^1\) Ο ΣΤΡ \(ΠΖ\) .* τιμωρήθηκε την 12\/10\/2026 .* με πέντε \(05\) ημέρες κράτηση, διότι ……\.$/);   // η ποινή της 11/10 όχι
    expect(bk.get('L23')).toBe('Αυλώνας, 12 Οκτ 26');
  });
  it('ΗΚΑΙ: ό,τι γράφει ο γραφέας στην οθόνη μπαίνει στο έντυπο και στα αθροίσματα', async () => {
    let s = busyState();
    s = apply(s, { t: 'setHkaiManual', date: '2026-10-12', manual: { cells: { 'Στρατιώτες': { sid: 2, fyl: 3, ab: 5 } }, text: { egr: 'ΔΟΚΙΜΑΣΤΙΚΟ ΚΕΙΜΕΝΟ' } } }, ctx).state;
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    const wb = await Workbook.open(r.data); const fr = await wb.sheet(0); const bk = await wb.sheet(1);
    expect(fr.get('L29')).toBe('2');
    expect(fr.get('V29')).toBe('3');
    if (!fr.hasFormula('AB29')) expect(fr.get('AB29')).toBe('5');
    expect(fr.formula('AA29')).toBe('E29-Z29');
    expect(bk.get('G8')).toBe('ΔΟΚΙΜΑΣΤΙΚΟ ΚΕΙΜΕΝΟ');
  });
  it('Προηγούμενες υπηρεσίες: μετράνε στο σύνολο και στη σειρά', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'setBaseline', pid: 3, baseline: { th: 4, sk: 2.7 as any, hol: 1 } }, ctx).state;
    expect(s.baseline[3]).toEqual({ th: 4, sk: 2, hol: 1 });
    const before = statOf(fakeState(10), 3).total;
    expect(statOf(s, 3).total).toBe(before + 6);
    expect(statOf(s, 3).hol).toBe(statOf(fakeState(10), 3).hol + 1);
  });
  it('Εξοδούχοι/Παραμένοντες: λίστες με αρίθμηση και υποσέλιδο κάτω από τη λίστα', async () => {
    const s = busyState();
    const r = await fillOuts(T('exodouxoi.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    const wb = await Workbook.open(r.data);
    const ex = await wb.sheet('ΕΞΟΔΟΥΧΟΙ'); const pa = await wb.sheet('ΠΑΡΑΜΕΝΟΝΤΕΣ');
    expect(ex.get('A5')).toBe('ΕΞΟΔΟΥΧΟΙ ΤΗΣ 12 ΟΚΤ 26');
    expect(ex.get('D9')).toBeTruthy();
    expect(ex.get('G11')).toBe('Αυλώνας, 12-10-2026');
    expect(ex.formula('A9')).toBe('ROW()-6');
    // 90 − 8 σε άδεια − 3 εξοδούχοι = 79 παραμένοντες → υποσέλιδο στη γραμμή 9+78
    expect(pa.get('D85')).toBeTruthy();
    expect(pa.get('G87')).toBe('Αυλώνας, 12-10-2026');
    expect(pa.get('D89')).toBe('ΑΛΧΙΑΣ ΙΛΗΣ');
  });
});

// Golden files (έρευνα §4.4): κάθε κελί, merge και ρύθμιση σελίδας του αποτελέσματος συγκρίνεται με το αποθηκευμένο.
// Αν αλλάξει σκόπιμα ένα έντυπο: npx vitest run -u και έλεγχος του diff στο test/__snapshots__.
function spenState() {
  let s = busyState();
  s = apply(s, { t: 'setPhase', phase: 'spen' }, ctx).state;
  s = apply(s, { t: 'addBlock', phase: 'spen', name: 'Πύλη', kind: 'other', armed: true, n: 2, hrs: '08:00-20:00' }, ctx).state;
  s = { ...s, guards: { ...s.guards, '2026-10-12': {} } };
  const ly = s.people.find(p => p.id === 2)!;
  s = apply(s, { t: 'updatePerson', person: { ...ly, weapon: 'Ο-0001' } }, ctx).state;
  s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
  return s;
}
describe('ΦΡΟΥΡΑ ΣΠΕΝ', () => {
  it('οπλοφύλακες, ζεύγη σκοπών, ΤΑΕ και νέα υπηρεσία «Πύλη» σε δική της γραμμή', async () => {
    const s = spenState(); const g = s.guards['2026-10-12'];
    expect(Object.keys(g)).toEqual(expect.arrayContaining(['op1', 'op4', 'sk3a', 'sk3b', 'sk4b', 'tae']));
    const r = await fillFroura(T('froura-spen.xlsx'), s, '2026-10-12');
    save(r.name, r.data);
    expect(r.name).toBe('ΦΡΟΥΡΑ ΣΠΕΝ 12-10-2026.xlsx');
    const ws = await (await Workbook.open(r.data)).sheet(0);
    expect(ws.get('J12')).toBe('ΟΠΛΟΦΥΛΑΚΕΣ');
    expect(ws.get('J13')).toMatch(/^[Α-Ω]+\d* [Α-Ω]+$/);
    expect(ws.get('J27')!.split('\n')).toHaveLength(2);
    expect(ws.get('C33')).toBeTruthy();
    expect(ws.get('B34')).toBe('ΠΥΛΗ 1ο'); expect(ws.get('B35')).toBe('ΠΥΛΗ 2ο'); expect(ws.get('C35')).toBeTruthy();
    // οι τιμωρημένοι κατέβηκαν δύο γραμμές για τη «Πύλη»
    expect(ws.get('A40')).toBe('1');
    const ly = s.people.find(p => p.id === g.ly)!;
    expect(ws.get('A9')).toContain(ly.weapon ? 'ΟΠΛΟ: ' + ly.weapon : 'ΤΗΛ:');
    expect(r.warnings).toEqual([]);
  });
});

describe('golden files', () => {
  const golden = async (data: Buffer) => { const wb = await Workbook.open(data); const out: Record<string, unknown> = {}; for (const n of wb.sheetNames()) out[n] = (await wb.sheet(n)).dump(); return out; };
  it('ΦΡΟΥΡΑ', async () => { expect(await golden((await fillFroura(T('froura.xlsx'), busyState(), '2026-10-12')).data)).toMatchSnapshot(); });
  it('ΦΡΟΥΡΑ ΣΠΕΝ', async () => { expect(await golden((await fillFroura(T('froura-spen.xlsx'), spenState(), '2026-10-12')).data)).toMatchSnapshot(); });
  it('ΗΚΑΙ', async () => { expect(await golden((await fillHkai(T('hkai.xlsx'), busyState(), '2026-10-12')).data)).toMatchSnapshot(); });
  it('Εξοδούχοι', async () => { expect(await golden((await fillOuts(T('exodouxoi.xlsx'), busyState(), '2026-10-12')).data)).toMatchSnapshot(); });
});

describe('έλεγχος template', () => {
  it('ΗΚΑΙ: αν σβηστεί ένας τύπος αθροίσματος, το έντυπο δεν βγαίνει', async () => {
    const wb = await Workbook.open(T('hkai.xlsx')); const fr = await wb.sheet(0);
    const xml = (fr as any).toXml ? null : null; void xml;
    // σβήνουμε τον τύπο του E20 γράφοντας αριθμό στη θέση του, όπως θα έκανε κάποιος στο Excel
    const zip = await (await import('jszip')).default.loadAsync(T('hkai.xlsx'));
    const name = Object.keys(zip.files).find(f => /xl\/worksheets\/sheet1\.xml$/.test(f))!;
    const x = (await zip.file(name)!.async('string')).replace(/(<c r="E20"[^>]*>)<f>[^<]*<\/f>(<v>[^<]*<\/v>)?/, '$1<v>5</v>');
    zip.file(name, x);
    const broken = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(fillHkai(broken, busyState(), '2026-10-12')).rejects.toThrow(/E20/);
  });
});

describe('Φρουρά ΠΣΚ', () => {
  it('συμπληρώνει Παρ-Σαβ-Κυρ με τους κανόνες ανάμεσά τους και βγάζει ένα Excel με 3 φύλλα', async () => {
    const days = pskDays('2026-10-17');
    expect(days).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(pskDays('2026-10-14')[0]).toBe('2026-10-16');
    let s = fakeState(90);
    s = apply(s, { t: 'autofillRange', dates: days }, ctx).state;
    for (let i = 1; i < 3; i++) {
      const prev = new Set(Object.values(s.guards[days[i - 1]]));
      expect(Object.values(s.guards[days[i]]).filter(p => prev.has(p))).toEqual([]);   // ανάπαυση: όχι δύο μέρες στη σειρά
    }
    const parts = await Promise.all(days.map(d => fillFroura(T('froura.xlsx'), s, d)));
    const data = await mergeFirstSheets(parts.map(p => p.data), ['ΠΑΡ 16-10', 'ΣΑΒ 17-10', 'ΚΥΡ 18-10']);
    save('ΦΡΟΥΡΑ ΠΣΚ.xlsx', data);
    const wb = await Workbook.open(data);
    expect(wb.sheetNames()).toEqual(['ΠΑΡ 16-10', 'ΣΑΒ 17-10', 'ΚΥΡ 18-10']);
    expect((await wb.sheet(1)).get('A5')).toBe('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 17 ΟΚΤ 2026');
    expect((await wb.sheet(2)).get('A5')).toBe('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 18 ΟΚΤ 2026');
    const zip = await (await import('jszip')).default.loadAsync(data);
    const wbx = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbx.match(/_xlnm\.Print_Area/g)).toHaveLength(3);
    expect(wbx).toContain("localSheetId=\"2\">'ΚΥΡ 18-10'!$A$1:$M$");
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('sheet_m3.xml');
  });
});
