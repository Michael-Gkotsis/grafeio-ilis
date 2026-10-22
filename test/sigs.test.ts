// Υπογραφές (Michael, 20/10): ακολουθούν ίλη/λόχο, όσες θέλεις, με τη σειρά από αριστερά προς τα δεξιά.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillFroura, fillHkai, fillOuts, sigsOf } from '../src/main/exports';
import { unitText } from '../src/shared/unit';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { PRESETS, defaultPick, type Report } from '../src/shared/reports';
import { sigFormOf, sigsFor, sigsSaved, type Sig } from '../src/shared/sigs';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-12';
const lochos = (s: any, x: any = {}) => ({ ...s, settings: { ...s.settings, unitKind: 'lochos', ...x } });
const three: Sig[] = [{ art: 'Ο', title: 'ΑΛΧΙΑΣ ΙΛΗΣ', name: 'Αλχιας Παπας' }, { art: 'Ο', title: 'ΥΔΚΤΗΣ ΙΛΗΣ' }, { art: 'Ο', title: 'ΔΚΤΗΣ ΙΛΗΣ', name: 'ΙΛΧΟΣ ΓΕΩΡΓΙΟΥ' }];
const cells = async (data: Buffer | Uint8Array, sheet: number | string = 0) => (await (await Workbook.open(data as Buffer)).sheet(sheet as any)).dump().cells as Record<string, string>;

describe('υπογραφές', () => {
  it('λόχος: οι υπογραφές των εντύπων γράφουν λόχο και τάγμα', async () => {
    const s = lochos(fakeState(30));
    const h = await cells((await fillHkai(T('hkai.xlsx'), s, D)).data);
    expect(h.G37).toBe('ΑΛΧΙΑΣ ΛΟΧΟΥ'); expect(h.V37).toBe('ΔΙΟΙΚΗΤΗΣ ΛΟΧΟΥ');
    const f = await cells((await fillFroura(T('froura.xlsx'), s, D, 'sven')).data);
    expect(f.B46).toBe('ΑΛΧΙΑΣ ΛΟΧΟΥ'); expect(f.K46).toBe('ΔΚΤΗΣ ΤΑΓΜΑΤΟΣ');
    expect(unitText('ΔΚΤΗΣ ΛΟΧΟΥ', 'ili')).toBe('ΔΚΤΗΣ ΙΛΗΣ');   // και προς τα πίσω
  });

  it('χωρίς δικές σου υπογραφές το έντυπο μένει όπως είναι', async () => {
    const s = fakeState(30);
    expect(sigsOf(s, 'hkai').sigs).toBeNull();
    const o = await cells((await fillOuts(T('exodouxoi.xlsx'), s, D, {})).data);
    expect(o.D10).toBe('Ο'); expect(o.D11).toBe('ΑΛΧΙΑΣ ΙΛΗΣ'); expect(o.G11).toBe('ΔΚΤΗΣ ΙΛΗΣ');
  });

  it('τρεις, με ονόματα, από αριστερά προς τα δεξιά (και σε κεφαλαία, στη μονάδα που ισχύει)', async () => {
    const s = lochos(fakeState(30), { sigs: { froura: three } });
    const r = await fillFroura(T('froura.xlsx'), s, D, 'sven');
    const f = await cells(r.data);
    expect([f.A46, f.D46, f.J46]).toEqual(['ΑΛΧΙΑΣ ΛΟΧΟΥ', 'ΥΔΚΤΗΣ ΛΟΧΟΥ', 'ΔΚΤΗΣ ΛΟΧΟΥ']);
    expect(f.A50).toBe('ΑΛΧΙΑΣ ΠΑΠΑΣ'); expect(f.J50).toBe('ΙΛΧΟΣ ΓΕΩΡΓΙΟΥ');
    expect(f.H46).toBeUndefined();   // το «2ο ΓΡΑΦΕΙΟ» του εντύπου έφυγε
    expect(r.warnings).toEqual([]);
  });

  it('μία: στη θέση της τελευταίας του εντύπου', async () => {
    const s = fakeState(30);
    const o = await cells((await fillOuts(T('exodouxoi.xlsx'), s, D, {}, [three[2]])).data);
    expect(o.G10).toBe('Ο'); expect(o.G11).toBe('ΔΚΤΗΣ ΙΛΗΣ'); expect(o.G15).toBe('ΙΛΧΟΣ ΓΕΩΡΓΙΟΥ');
    expect(o.D10).toBeUndefined(); expect(o.D11).toBeUndefined();
  });

  it('ίδιο πλήθος: στις θέσεις του εντύπου, με την παύλα της ΗΚΑΙ', async () => {
    const s = fakeState(30);
    const sg: Sig[] = [{ art: 'Ο', title: 'ΥΔΚΤΗΣ ΙΛΗΣ' }, { art: 'Η', title: 'ΕΠΟΠΤΡΙΑ', name: 'ΚΩΣΤΑ' }];
    const h = await cells((await fillHkai(T('hkai.xlsx'), s, D, { sigs: sg })).data);
    expect([h.H36, h.G37, h.W36, h.V37, h.V41]).toEqual(['-Ο-', 'ΥΔΚΤΗΣ ΙΛΗΣ', '-Η-', 'ΕΠΟΠΤΡΙΑ', 'ΚΩΣΤΑ']);
  });

  it('το όνομα κάτω από την υπογραφή φαίνεται και στην εκτύπωση', async () => {
    const s = fakeState(30);
    const r = await fillOuts(T('exodouxoi.xlsx'), s, D, {}, three);
    const xml: string = (await Workbook.open(r.data) as any).workbookXml;
    expect(xml).toMatch(/\$A\$1:\$H\$15</);   // ήταν ως τη γραμμή 11
  });

  it('η λίστα των Ρυθμίσεων: λέξεις ίλης γίνονται λόχου, κενές φεύγουν', () => {
    const s = lochos(fakeState(5));
    expect(sigsFor(s.settings, [...three, { art: 'Ο', title: ' ' }]).map(x => x.title)).toEqual(['ΑΛΧΙΑΣ ΛΟΧΟΥ', 'ΥΔΚΤΗΣ ΛΟΧΟΥ', 'ΔΚΤΗΣ ΛΟΧΟΥ']);
    expect(sigsSaved({ signers: { sergeant: 'Χ', commander: '' } } as any, 'reports').map(x => x.name)).toEqual(['Χ', '']);
    expect(sigFormOf('frouraPsk')).toBe('froura'); expect(sigFormOf('check')).toBe('check');
  });

  it('Έντυπα: {ΥΠΟΓΡΑΦΕΣ} γεμίζει με τη λίστα (των Ρυθμίσεων, ή του εντύπου)', async () => {
    const o = PRESETS.find(p => p.id === 'onomastiki')!.opts;
    const b = await buildTemplate({ ...o, sig: 'list' }, 'people');
    const s0 = lochos(fakeState(30), { sigs: { reports: three } });
    const rep: Report = { id: 'r1', name: 'Α', tpl: 't1', kind: 'people', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
    const ids = s0.people.slice(0, 5).map((p: any) => p.id);
    const all = Object.values(await cells((await fillReport(b.data, s0, rep, ids, D)).data));
    expect(all).toEqual(expect.arrayContaining(['ΑΛΧΙΑΣ ΛΟΧΟΥ', 'ΥΔΚΤΗΣ ΛΟΧΟΥ', 'ΔΚΤΗΣ ΛΟΧΟΥ', 'ΑΛΧΙΑΣ ΠΑΠΑΣ']));
    expect(all).not.toContain('{ΥΠΟΓΡΑΦΕΣ}');
    const one = Object.values(await cells((await fillReport(b.data, s0, { ...rep, sigs: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] }, ids, D)).data));
    expect(one).toContain('ΕΠΟΠΤΗΣ'); expect(one).not.toContain('ΥΔΚΤΗΣ ΛΟΧΟΥ');
  });
});
