// Ονόματα αρχείων: χωρίς ρυθμίσεις βγαίνουν ακριβώς τα ίδια ονόματα με πριν, και οι ρυθμίσεις αλλάζουν όνομα, διαχωριστικό και ημερομηνία.
import { describe, it, expect } from 'vitest';
import { dm, dmy, dmyy } from '../src/shared/dates';
import { frouraFile, isOutsAll } from '../src/shared/domain';
import { imerTitle } from '../src/shared/imer';
import { reportOf } from '../src/shared/unit';
import { repFileName } from '../src/shared/reports';
import { DATE_FMTS, fileName, fileNameOf, fmtDate, frouraName, newStem, safeName, type FileNames } from '../src/shared/fileNames';
import { fakeState } from './fixtures';

const D = '2026-11-13';
const S = fakeState(3).settings;
const withFn = (fileNames: FileNames) => ({ ...S, fileNames });
const dash = (x: string) => x.replace(/\//g, '-');

describe('ονόματα αρχείων: προεπιλογές όπως ήταν', () => {
  it('ημερήσια αρχεία', () => {
    expect(frouraName(S, 'sven', D)).toBe(frouraFile(S, 'sven') + dash(dmy(D)) + '.xlsx');
    expect(frouraName(S, 'spen', D)).toBe(frouraFile(S, 'spen') + dash(dmy(D)) + '.xlsx');
    expect(fileNameOf(S, 'hkai', D)).toBe(reportOf(S) + ' ' + dmyy(D).replace(/\//g, '.') + '.xlsx');
    expect(fileNameOf(S, 'outs', D)).toBe((isOutsAll(S) ? 'ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ ' : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ') + dash(dmy(D)) + '.xlsx');
    expect(fileNameOf({ ...S, outsFmt: 'all' }, 'outs', D)).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ 13-11-2026.xlsx');
    expect(fileNameOf({ ...S, outsFmt: 'cur' }, 'outs', D)).toBe('ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'weapons', D)).toBe('ΟΠΛΙΣΜΟΣ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'roster', D)).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'lists', D)).toBe('ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'cadre', D)).toBe('ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'hd', D)).toBe('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ 13-11-2026.xlsx');
    expect(fileNameOf(S, 'hd', D, 'docx')).toBe('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ 13-11-2026.docx');
  });
  it('ΗΚΑΙ με τελείες και διψήφιο έτος, ΗΚΑΛ στον λόχο', () => {
    expect(fileNameOf(S, 'hkai', D)).toBe('ΗΚΑΙ 13.11.26.xlsx');
    expect(fileNameOf({ ...S, unitKind: 'lochos' }, 'hkai', D)).toBe('ΗΚΑΛ 13.11.26.xlsx');
  });
  it('φρουρά ΣΠΕΝ και δικό έντυπο υπηρεσιών', () => {
    expect(frouraName(S, 'sven', D)).toBe('ΦΡΟΥΡΑ 13-11-2026.xlsx');
    expect(frouraName(S, 'spen', D)).toBe('ΦΡΟΥΡΑ ΣΠΕΝ 13-11-2026.xlsx');
    const own = { ...S, phases: [{ id: 'ask', name: 'ΑΣΚΗΣΗ', base: 'spen' as const, blocks: [] }] } as any;
    expect(frouraName(own, 'ask', D)).toBe('ΦΡΟΥΡΑ ΑΣΚΗΣΗ 13-11-2026.xlsx');
  });
  it('ΠΣΚ, ημερολόγιο κωλυομένων, έλεγχος υπηρεσιών', () => {
    const psk = { from: '2026-11-13', to: '2026-11-15', psk: true as const };
    expect(frouraName(S, 'sven', psk)).toBe('ΦΡΟΥΡΑ ΠΣΚ ' + dash(dm('2026-11-13')) + ' έως ' + dash(dm('2026-11-15')) + '-2026.xlsx');
    expect(frouraName(S, 'sven', psk)).toBe('ΦΡΟΥΡΑ ΠΣΚ 13-11 έως 15-11-2026.xlsx');
    expect(fileNameOf(S, 'outs', psk)).toBe((isOutsAll(S) ? 'ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ' : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ') + ' ΠΣΚ 13-11 έως 15-11-2026.xlsx');
    expect(fileNameOf(S, 'imer', { from: '2026-11-01', to: '2026-11-30' })).toBe(imerTitle(S) + ' 01-11-2026 έως 30-11-2026.xlsx');
    expect(fileNameOf(S, 'check', { text: 'ΝΟΕΜΒΡΙΟΣ 2026' })).toBe('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΝΟΕΜΒΡΙΟΣ 2026.xlsx');
  });
  it('έντυπα: όνομα του εντύπου και ημερομηνία σαν πριν', () => {
    expect(repFileName({ name: 'Αγγαρεία/μαγειρεία' }, '2026-10-19')).toBe('ΑΓΓΑΡΕΙΑ-ΜΑΓΕΙΡΕΙΑ 19-10-2026.xlsx');
    expect(repFileName({ name: 'Έντυπο' }, '2026-10-19', S)).toBe('ΕΝΤΥΠΟ 19-10-2026.xlsx');
  });
  it('νέο αρχείο: προεπιλεγμένο όνομα', () => {
    expect(newStem({ ...S, unitName: '4ης ΙΛΗΣ', essos: { s: 'Γ', y: 2026 } }, 'people', D)).toBe('ΔΥΝΑΜΟΛΟΓΙΟ Γ΄ ΕΣΣΟ 2026 4ης ΙΛΗΣ');
    expect(newStem({ ...S, essos: undefined }, 'duties', D)).toBe('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ 2026');
  });
});

describe('ονόματα αρχείων: ρυθμίσεις', () => {
  it('κάθε μορφή ημερομηνίας', () => {
    const want = ['13-11-2026', '13-11-26', '13.11.2026', '13.11.26', '13 Νοέ 26', '13 ΝΟΕ 2026', '2026-11-13'];
    expect(DATE_FMTS.map(f => fmtDate(D, f))).toEqual(want);
    want.forEach((w, i) => expect(fileNameOf(withFn({ date: DATE_FMTS[i] }), 'weapons', D)).toBe('ΟΠΛΙΣΜΟΣ ' + w + '.xlsx'));
    expect(fmtDate('2026-05-03', 'd Mon y')).toBe('03 Μάι 26');
    expect(fmtDate('2026-12-01', 'd Mon y')).toBe('01 Δεκ 26');
  });
  it('η μορφή για όλα αλλάζει και την ΗΚΑΙ, η δική της υπερισχύει', () => {
    expect(fileNameOf(withFn({ date: 'd-m-Y' }), 'hkai', D)).toBe('ΗΚΑΙ 13-11-2026.xlsx');
    expect(fileNameOf(withFn({ date: 'd-m-y', per: { hkai: { date: 'Y-m-d' } } }), 'hkai', D)).toBe('ΗΚΑΙ 2026-11-13.xlsx');
    expect(fileNameOf(withFn({ date: 'd-m-y', per: { hkai: { date: 'Y-m-d' } } }), 'weapons', D)).toBe('ΟΠΛΙΣΜΟΣ 13-11-26.xlsx');
  });
  it('όνομα και διαχωριστικό (παραδείγματα του Michael)', () => {
    const a = withFn({ per: { froura: { name: 'Φρουρά', sep: '-', date: 'd Mon y' } } });
    expect(frouraName(a, 'sven', D)).toBe('Φρουρά-13 Νοέ 26.xlsx');
    const b = withFn({ per: { frouraSpen: { name: 'φρουρά ΣΠΕΝ', sep: '.', date: 'd-m-y' } } });
    expect(frouraName(b, 'spen', D)).toBe('φρουρά ΣΠΕΝ.13-11-26.xlsx');
    for (const sep of [' ', '-', '.', '_'] as const) expect(fileNameOf(withFn({ per: { weapons: { sep } } }), 'weapons', D)).toBe('ΟΠΛΙΣΜΟΣ' + sep + '13-11-2026.xlsx');
  });
  it('αποκλεισμός χαρακτήρων και κενά στις άκρες', () => {
    expect(safeName('  α\\β/γ:δ*ε?ζ"η<θ>ι|κ  ')).toBe('α-β-γ-δ-ε-ζ-η-θ-ι-κ');
    expect(fileNameOf(withFn({ per: { weapons: { name: ' Όπλα/1 ' } } }), 'weapons', D)).toBe('Όπλα-1 13-11-2026.xlsx');
  });
  it('κενό δικό όνομα: το προεπιλεγμένο', () => {
    expect(fileNameOf(withFn({ per: { weapons: { name: '   ' } } }), 'weapons', D)).toBe('ΟΠΛΙΣΜΟΣ 13-11-2026.xlsx');
    expect(fileNameOf(withFn({ per: {} }), 'roster', D)).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 13-11-2026.xlsx');
  });
  it('ΠΣΚ με δικό όνομα και μορφή', () => {
    const psk = { from: '2026-11-14', to: '2026-11-16', psk: true as const };
    const a = withFn({ per: { frouraSpen: { name: 'Φρουρά ΣΠΕΝ', sep: '.', date: 'd-m-y' } } });
    expect(frouraName(a, 'spen', psk)).toBe('Φρουρά ΣΠΕΝ.ΠΣΚ 14-11 έως 16-11-26.xlsx');
    expect(frouraName(withFn({ date: 'd Mon y' }), 'sven', psk)).toBe('ΦΡΟΥΡΑ ΠΣΚ 14 Νοέ έως 16 Νοέ 26.xlsx');
    expect(frouraName(withFn({ date: 'Y-m-d' }), 'sven', psk)).toBe('ΦΡΟΥΡΑ ΠΣΚ 2026-11-14 έως 2026-11-16.xlsx');
  });
  it('μηνιαίος έλεγχος: μόνο το όνομα, ο μήνας μένει· ημερολόγιο με μορφή', () => {
    expect(fileNameOf(withFn({ date: 'Y-m-d', per: { check: { name: 'Υπηρεσίες', sep: '-' } } }), 'check', { text: 'ΝΟΕΜΒΡΙΟΣ 2026' })).toBe('Υπηρεσίες-ΝΟΕΜΒΡΙΟΣ 2026.xlsx');
    expect(fileNameOf(withFn({ date: 'd.m.y' }), 'imer', { from: '2026-11-01', to: '2026-11-30' })).toBe(imerTitle(S) + ' 01.11.26 έως 30.11.26.xlsx');
  });
  it('έντυπα: μόνο η μορφή για όλα, όχι δικό όνομα', () => {
    expect(repFileName({ name: 'Φύλλο' }, '2026-10-19', withFn({ date: 'd.m.y', per: { weapons: { name: 'Χ' } } }))).toBe('ΦΥΛΛΟ 19.10.26.xlsx');
  });
  it('fileName χωρίς ημερομηνία', () => {
    expect(fileName(S, 'weapons', 'ΝΕΟ', null, '.xlsx')).toBe('ΝΕΟ.xlsx');
  });
});
