// Καρτέλα «Στελέχη» (Michael, 17/10): καταστάσεις = στήλες της ΗΚΑΙ, κωλυόμενοι και απόντες, Excel
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { hkaiCounts, HK_A, HK_K } from '../src/shared/rules';
import { CADRE_ABS, type AppState } from '../src/shared/domain';
import { cadreAbsOf } from '../src/shared/ranks';
import { cadreClash, cadreMatch, cadreSearch, cadreSheets, cadreStatusOn, hkOffText } from '../src/shared/cadre';
import { cadreLists } from '../src/main/excel';
import { fakeState } from './fixtures';
import ExcelJS from 'exceljs';

const D = '2026-10-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
function withCadre() {
  let s = fakeState(10);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ', role: 'Υπασπιστής', phone: '6900000000' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΥΠΟΘΕΤΙΚΟΣ', first: 'ΓΙΑΝΝΗΣ' } });
  return s;
}

describe('Στελέχη: καταστάσεις της ΗΚΑΙ', () => {
  it('κάθε στήλη της ΗΚΑΙ (εκτός της κενής) είναι κατάσταση στελέχους', () => {
    const cols = CADRE_ABS.map(x => x[2]).filter(Boolean);
    expect(cols.sort()).toEqual([...HK_K, ...HK_A].map(x => x[0]).filter(k => k !== 'bl').sort());
  });
  it('κωλυόμενος (υπηρεσία) μετρά στους κωλυόμενους, όχι στους απόντες· άδεια στους απόντες', () => {
    let s = withCadre(); const [a, b] = s.cadreList;
    const base = hkaiCounts(s, D);
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'yp', from: D, to: D } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: b.id, kind: 'ka', from: D, to: '2026-10-20' } });
    const h = hkaiCounts(s, D);
    expect(h.rank['Λοχίες'].c.yp).toBe(1);
    expect(h.rank['Ίλαρχοι'].c.ka).toBe(1);
    expect(h.kol).toBe(base.kol + 1);
    expect(h.apo).toBe(base.apo + 1);
    expect(h.avail).toBe(h.total - h.apo);
    expect(cadreStatusOn(s, a.id, D)).toMatchObject({ label: 'Υπηρεσία εντός στρατοπέδου', group: 'kol', col: 'yp' });
    expect(cadreMatch('kol', a, cadreStatusOn(s, a.id, D))).toBe(true);
    expect(cadreMatch('apo', b, cadreStatusOn(s, b.id, D))).toBe(true);
    expect(cadreMatch('apo', a, cadreStatusOn(s, a.id, '2026-10-18'))).toBe(false);
  });
  it('«Άλλο» μένει μόνο στη λίστα· παλιά δική σου με όνομα βασικής κρατά τη στήλη της', () => {
    let s = withCadre(); const a = s.cadreList[0];
    const base = hkaiCounts(s, D);
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'other', from: D, to: D } });
    const h = hkaiCounts(s, D);
    expect([h.kol, h.apo]).toEqual([base.kol, base.apo]);
    expect(cadreAbsOf('Πρατήριο', { cadreAbs: { add: [{ name: 'Πρατήριο', col: 'prat' }] } })?.[2]).toBe('prat');
  });
  it('επικάλυψη: χωρίς replace σταματά, με replace η νέα κόβει την παλιά και κρατά τις άλλες μέρες', () => {
    let s = withCadre(); const a = s.cadreList[0];
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'ka', from: '2026-10-15', to: '2026-10-25' } });
    const nu = { cid: a.id, kind: 'nos', from: '2026-10-18', to: '2026-10-19' };
    expect(cadreClash(s, nu)).toHaveLength(1);
    expect(() => run(s, { t: 'addCadreAbs', abs: nu })).toThrow(/ήδη κατάσταση/);
    s = run(s, { t: 'addCadreAbs', abs: nu, replace: true });
    const mine = s.cadreAbs.filter(x => x.cid === a.id).map(x => [x.kind, x.from, x.to]).sort((x, y) => x[1].localeCompare(y[1]));
    expect(mine).toEqual([['ka', '2026-10-15', '2026-10-17'], ['nos', '2026-10-18', '2026-10-19'], ['ka', '2026-10-20', '2026-10-25']]);
    expect(new Set(s.cadreAbs.map(x => x.id)).size).toBe(s.cadreAbs.length);
  });
  it('αλλαγή κατάστασης κρατά το id και δεν μετρά τον εαυτό της ως επικάλυψη', () => {
    let s = withCadre(); const a = s.cadreList[0];
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'ka', from: D, to: '2026-10-20' } });
    const id = s.cadreAbs[0].id;
    s = run(s, { t: 'addCadreAbs', abs: { id, cid: a.id, kind: 'an', from: D, to: '2026-10-22', note: 'ΑΠΟ 401' } });
    expect(s.cadreAbs).toEqual([{ id, cid: a.id, kind: 'an', from: D, to: '2026-10-22', note: 'ΑΠΟ 401' }]);
  });
  it('εκτός δύναμης: δεν μετρά στην ΗΚΑΙ και φαίνεται στο δικό του φίλτρο', () => {
    let s = withCadre(); const a = s.cadreList[0];
    const total = hkaiCounts(s, D).total;
    s = run(s, { t: 'saveCadre', cadre: { ...a, active: false } });
    expect(hkaiCounts(s, D).total).toBe(total - 1);
    expect(cadreMatch('inactive', s.cadreList[0], undefined)).toBe(true);
    expect(cadreMatch('all', s.cadreList[0], undefined)).toBe(false);
    expect(cadreSearch(s.cadreList[1], 'υποθετ')).toBe(true);
    expect(cadreSearch(s.cadreList[0], 'υπασπιστ')).toBe(true);
  });
  it('Excel: φύλλα στελέχη / καταστάσεις, με κεφαλαία', async () => {
    let s = withCadre(); const [a, b] = s.cadreList;
    s = run(s, { t: 'addCadreAbs', abs: { cid: b.id, kind: 'ka', from: D, to: '2026-10-20', note: 'Γονική' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'yp', from: '2026-10-18', to: '2026-10-18' } });
    const sh = cadreSheets(s, D);
    expect(sh.map(x => x.name)).toEqual(['ΣΤΕΛΕΧΗ', 'ΚΑΤΑΣΤΑΣΕΙΣ']);
    expect(sh[0].rows.map(r => [r[1], r[7]])).toEqual([['ΙΛΧΟΣ', 'Κανονική άδεια'], ['ΛΧΙΑΣ', 'ΠΑΡΩΝ']]);
    expect(sh[1].rows.map(r => r[5])).toEqual(['ΑΠΟΝΤΕΣ · Κ.Άδ.', 'ΚΩΛΥΟΜΕΝΟΙ · Υπηρ.']);
    const r = await cadreLists(s, D);
    expect(r.name).toBe('ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ 17-10-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    const ws = wb.getWorksheet('ΣΤΕΛΕΧΗ')!;
    expect(ws.getRow(4).getCell(8).value).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ');
    expect(wb.getWorksheet('ΚΑΤΑΣΤΑΣΕΙΣ')!.getRow(4).getCell(9).value).toBe('ΓΟΝΙΚΗ');
  });
});

describe('ΗΚΑΙ: αξιωματικός υπηρεσίας από τα Στελέχη', () => {
  it('αξιωματικός με «Υπηρεσία» τη μέρα, όχι λοχίας· ό,τι γράφτηκε με το χέρι κερδίζει', () => {
    let s = withCadre(); const [a, b] = s.cadreList;
    expect(hkOffText(s, D)).toBe('');
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'yp', from: D, to: D } });
    expect(hkOffText(s, D)).toBe('');
    s = run(s, { t: 'addCadreAbs', abs: { cid: b.id, kind: 'yp', from: D, to: D } });
    expect(hkOffText(s, D)).toBe('ΙΛΧΟΣ ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ');
    expect(hkOffText(s, '2026-10-18')).toBe('');
    s = { ...s, hkaiManual: { [D]: { cells: {}, text: { off: 'ΑΝΘΛΓΟΣ ΑΛΛΟΣ' } } } };
    expect(hkOffText(s, D)).toBe('ΑΝΘΛΓΟΣ ΑΛΛΟΣ');
  });
});
