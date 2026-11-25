// Πέντε μικρές διορθώσεις του ελέγχου 25/11 (Π5): κλειδί εκτύπωσης με σύντομους μήνες, «Επικεφαλίδα» στην ΗΚΑΙ,
// κλειδί προεπισκόπησης των Εντύπων, παραδείγματα στα Ονόματα αρχείων, χαρακτήρες ελέγχου στα ονόματα. Μόνο ψεύτικα δεδομένα.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { printKey } from '../src/main/print';
import { DATE_FMTS, FILE_ROWS, fileName, fileNameOf, frouraName, safeName, sameNames, sampleWhen, TEXT_TAIL, type FileId, type FileNames } from '../src/shared/fileNames';
import { MONTHS } from '../src/shared/dates';
import { norm, upper } from '../src/shared/text';
import { repFileName } from '../src/shared/reports';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { ExportButton } from '../src/renderer/common';
import { previewKey } from '../src/renderer/screens/reports';
import { fakeState } from './fixtures';

const st0 = fakeState(5).settings;
const withFn = (fileNames: FileNames) => ({ ...st0, fileNames });
const DAYS = ['2026-01-13', '2026-05-07', '2026-06-21', '2026-11-13', '2026-12-05', '2027-03-30'];

// το printKey όπως ήταν πριν (frozen συμβόλαιο meta.json): τα προεπιλεγμένα ονόματα πρέπει να βγάζουν ακριβώς το ίδιο
const GR = /(ΙΑΝΟΥΑΡΙΟΣ|ΦΕΒΡΟΥΑΡΙΟΣ|ΜΑΡΤΙΟΣ|ΑΠΡΙΛΙΟΣ|ΜΑΙΟΣ|ΙΟΥΝΙΟΣ|ΙΟΥΛΙΟΣ|ΑΥΓΟΥΣΤΟΣ|ΣΕΠΤΕΜΒΡΙΟΣ|ΟΚΤΩΒΡΙΟΣ|ΝΟΕΜΒΡΙΟΣ|ΔΕΚΕΜΒΡΙΟΣ)/g;
function oldKey(file: string): string {
  const base = file.split(/[\\/]/).pop() || file;
  const k = base.replace(/\.xls[xm]?$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(GR, ' ').replace(/\d{1,4}([-./]\d{1,4})+/g, ' ').replace(/\(\d+\)/g, ' ').replace(/\b(ΕΩΣ)\b/g, ' ').replace(/\b\d+\b/g, ' ')
    .replace(/[-_.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return k.slice(0, 80) || 'ΑΡΧΕΙΟ';
}
const ids = (): FileId[] => [...FILE_ROWS(st0).map(r => r.id), 'report'];

describe('F1 κλειδί εκτύπωσης: σύντομοι μήνες', () => {
  it('«Φρουρά-13 Νοέ 26» και «… Δεκ 26» έχουν το ίδιο κλειδί', () => {
    expect(printKey('Φρουρά-13 Νοέ 26.xlsx')).toBe(printKey('Φρουρά-13 Δεκ 26.xlsx'));
    expect(printKey('Φρουρά-13 Νοέ 26.xlsx')).toBe('ΦΡΟΥΡΑ');
    expect(printKey('ΗΚΑΙ 5 ΙΟΥΝ 2026.xlsx')).toBe(printKey('ΗΚΑΙ 5 ΜΑΙ 2026.xlsx'));
  });
  it('ολόκληρη λέξη μόνο: ένα όνομα που περιέχει «ΜΑΡ» ή «ΔΕΚ» μέσα σε λέξη μένει ίδιο', () => {
    expect(printKey('ΜΑΡΤΥΡΕΣ ΔΕΚΑΝΟΣ.xlsx')).toBe('ΜΑΡΤΥΡΕΣ ΔΕΚΑΝΟΣ');
  });
  it('τα προεπιλεγμένα ονόματα (d-m-Y, d.m.y) βγάζουν το ίδιο κλειδί με πριν, για κάθε αρχείο και πολλές μέρες', () => {
    for (const id of ids()) for (const day of DAYS) {
      const n = id === 'report' ? repFileName({ name: 'Λίστα Αδειών' }, day) : fileNameOf(st0, id, sampleWhen(id, day));
      expect(printKey(n)).toBe(oldKey(n));
      for (const f of ['d-m-Y', 'd.m.y'] as const) {
        const m = fileNameOf(withFn({ date: f }) as any, id, sampleWhen(id, day));
        expect(printKey(m)).toBe(oldKey(m));
      }
    }
  });
  it('κάθε αρχείο × κάθε μορφή ημερομηνίας: το κλειδί είναι ίδιο σε 4 διαφορετικούς μήνες', () => {
    for (const id of ids()) for (const f of DATE_FMTS) {
      const st = withFn({ date: f }) as any;
      const keys = new Set(['2026-01-13', '2026-05-07', '2026-08-21', '2026-11-13'].map(day => {
        const n = id === 'report' ? repFileName({ name: 'Λίστα Αδειών' }, day, st) : fileNameOf(st, id, sampleWhen(id, day));
        return printKey(n);
      }));
      expect([id, f, [...keys]]).toEqual([id, f, [...keys].slice(0, 1)]);
    }
  });
  it('το ΠΣΚ (ΣΒΕΝ και ΣΠΕΝ) κρατά το ίδιο κλειδί σε κάθε μορφή και μήνα', () => {
    for (const ph of ['sven', 'spen'] as const) for (const f of DATE_FMTS) {
      const st = withFn({ date: f }) as any;
      const keys = new Set([['2026-01-10', '2026-01-12'], ['2026-06-13', '2026-06-15'], ['2026-11-14', '2026-11-16'], ['2026-12-26', '2026-12-28']]
        .map(([from, to]) => printKey(frouraName(st, ph, { from, to, psk: true }))));
      expect(keys.size).toBe(1);
    }
  });
});

describe('F2 ΗΚΑΙ: το «Επικεφαλίδα:» της οθόνης', () => {
  it('το ExportButton χρησιμοποιεί το κουτάκι που του δίνεται, όχι δικό του', () => {
    const pick = { node: React.createElement('span', { id: 'ΞΕΝΟ-ΚΟΥΤΑΚΙ' }), nodeAt: () => null, headId: 'h1', take: () => 'h1' };
    const store: any = { state: fakeState(3), audit: [], boot: {}, today: '2026-11-13', tomorrow: '2026-11-14', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
    const nav: any = { view: 'hkai', params: {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
    const el = React.createElement(ExportButton as any, { kind: 'hkai', date: '2026-11-13', label: 'η ΗΚΑΙ', pick });
    const h = renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, el)));
    expect(h).toContain('ΞΕΝΟ-ΚΟΥΤΑΚΙ');
  });
});

describe('F3 κλειδί προεπισκόπησης Εντύπων', () => {
  const r: any = { id: 'r1', name: 'Έντυπο', sheet: 'Φύλλο', head: [], cols: [], cells: [] };
  const key = (x: any) => previewKey(null, x, [1, 2], '2026-11-13', false, 5);
  it('ίδιο έντυπο, ίδιο κλειδί', () => { expect(key({ ...r })).toBe(key(JSON.parse(JSON.stringify(r)))); });
  it('κάθε πεδίο που αλλάζει το αρχείο αλλάζει το κλειδί', () => {
    const base = key(r);
    for (const p of [{ hdId: 'h2' }, { images: [{ id: 'i' }] }, { tday: 'tomorrow' }, { nohead: true }, { who: [1, 2] }, { src: 'people' }, { fixed: true }, { sort: 'name' }])
      expect(key({ ...r, ...p })).not.toBe(base);
  });
  it('αλλαγή στα ids ή στη μέρα αλλάζει το κλειδί', () => {
    expect(previewKey(null, r, [1, 2], 'a', false, 5)).not.toBe(previewKey(null, r, [1, 3], 'a', false, 5));
    expect(previewKey(null, r, [1, 2], 'a', false, 5)).not.toBe(previewKey(null, r, [1, 2], 'b', false, 5));
  });
});

describe('F4 Ονόματα αρχείων: παραδείγματα και διπλά ονόματα', () => {
  const day = '2026-11-13';
  it('Έλεγχος υπηρεσιών: ο μήνας του αρχείου (όχι «ΝΟΕΜΒΡΙΟΥ»)', () => {
    const real = fileNameOf(st0, 'check', { text: norm(MONTHS[10]) + ' 2026' });
    expect(fileNameOf(st0, 'check', sampleWhen('check', day))).toBe(real);
    expect(real).toBe('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΝΟΕΜΒΡΙΟΣ 2026.xlsx');
  });
  it('άδειες στελεχών: μόνο η χρονιά', () => {
    expect(fileNameOf(st0, 'cadreLeave', sampleWhen('cadreLeave', day))).toBe(fileNameOf(st0, 'cadreLeave', { text: '2026' }));
  });
  it('πρόγραμμα αδειών και υπηρεσίες στελεχών: μήνας με κεφαλαία και χρονιά', () => {
    for (const id of ['cadrePlan', 'cadreDuty'] as const)
      expect(fileNameOf(st0, id, sampleWhen(id, day))).toBe(fileNameOf(st0, id, { text: upper(MONTHS[10]) + ' 2026' }));
  });
  it('τα αρχεία με κείμενο στο τέλος είναι τα τέσσερα, οι άλλοι κρατούν τη μέρα', () => {
    expect([...TEXT_TAIL].sort()).toEqual(['cadreDuty', 'cadreLeave', 'cadrePlan', 'check']);
    expect(sampleWhen('froura', day)).toBe(day);
    expect(sampleWhen('imer', day)).toEqual({ from: day, to: day });
  });
  it('χωρίς ρυθμίσεις δεν υπάρχουν διπλά ονόματα', () => { expect(sameNames(st0, day)).toEqual([]); });
  it('δύο γραμμές με το ίδιο όνομα και κατάληξη βγάζουν προειδοποίηση', () => {
    const st = withFn({ per: { weapons: { name: 'ΑΡΧΕΙΟ', sep: '-' }, vehicles: { name: 'ΑΡΧΕΙΟ', sep: '-' } } }) as any;
    const d = sameNames(st, day);
    expect(d.length).toBe(1);
    expect(d[0][0]).toBe(fileName(st, 'weapons', 'ΑΡΧΕΙΟ', day, 'xlsx'));
  });
  it('ίδιο όνομα με άλλη κατάληξη δεν είναι διπλό', () => {
    const st = withFn({ per: { hd: { name: 'ΑΡΧΕΙΟ' }, weapons: { name: 'ΑΡΧΕΙΟ' } } }) as any;
    expect(sameNames(st, day)).toEqual([]);
  });
});

describe('F5 χαρακτήρες ελέγχου στα ονόματα αρχείων', () => {
  it('safeName: tab και άλλοι χαρακτήρες ελέγχου γίνονται κενό και κόβονται από τις άκρες', () => {
    expect(safeName('ΑΒ\tΓΔ')).toBe('ΑΒ ΓΔ');
    expect(safeName('\tΑΒ\u0000\u001f')).toBe('ΑΒ');
    expect(safeName('Α/Β:Γ')).toBe('Α-Β-Γ');
    expect(safeName('  Λίστα 1  ')).toBe('Λίστα 1');
  });
  it('repFileName: ίδιο αποτέλεσμα με το safeName και για τα παλιά ονόματα', () => {
    expect(repFileName({ name: 'Α/Β:Γ?' }, '2026-11-13')).toBe(fileName({}, 'report', safeName(upper('Α/Β:Γ?')), '2026-11-13', 'xlsx'));
    expect(repFileName({ name: 'Λίστα\tΑδειών' }, '2026-11-13')).toBe('ΛΙΣΤΑ ΑΔΕΙΩΝ 13-11-2026.xlsx');
  });
});
