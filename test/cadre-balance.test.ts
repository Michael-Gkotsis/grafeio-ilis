// Άδειες και απαλλαγές στελεχών (Michael, 17/11, πρόταση λοχία): υπόλοιπα αδειών ανά χρονιά και Καρτέλα απαλλαγών
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { CADRE_ABS, DEFAULT_SETTINGS, type AppState, type Cadre } from '../src/shared/domain';
import { cadreAbsKinds, cadreAbsOf } from '../src/shared/ranks';
import { postsOf } from '../src/shared/rules';
import { DEFAULT_LEAVE, apalCard, apalLedger, cadreSummary, leaveCfgOf, leaveOverdraft, leaveSheets, quotaBalances } from '../src/shared/cadreBalance';
import { cadreLeaveBook } from '../src/main/excel';
import { fakeState } from './fixtures';
import ExcelJS from 'exceljs';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
function withCadre(): { s: AppState; c: Cadre } {
  let s = fakeState(10);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΠΑΠΑΔΑΚΗΣ', first: 'ΓΕΩΡΓΙΟΣ' } });
  return { s, c: s.cadreList[0] };
}
const abs = (s: AppState, c: Cadre, kind: string, from: string, to: string) => run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind, from, to } });
const left = (s: AppState, c: Cadre, year: number, q: string) => quotaBalances(s, c.id, year).find(b => b.quota.id === q)!;

describe('Άδειες στελεχών: υπόλοιπα', () => {
  it('παλιά κατάσταση χωρίς τα νέα πεδία φορτώνει και δίνει τις προεπιλογές: 30 + 10, ημερολογιακές, 1 απαλλαγή ανά υπηρεσία', () => {
    const { s, c } = withCadre();
    expect(s.settings.cadreLeave).toBeUndefined(); expect(s.cadreGrants).toBeUndefined();
    expect(leaveCfgOf(s.settings)).toEqual(DEFAULT_LEAVE);
    expect(leaveCfgOf(DEFAULT_SETTINGS)).toEqual({ quotas: [{ id: 'ka', name: 'Κανονική άδεια', perYear: 30, kinds: ['ka'], all: true }, { id: 'amd', name: 'Άδεια μικρής διάρκειας', perYear: 10, kinds: ['amd'], all: true }], count: 'calendar', apalPerDuty: 1, apalHolExtra: 0, apalExpire: 'never' });
    const b = quotaBalances(s, c.id, 2026);
    expect(b.map(x => [x.quota.id, x.entitled, x.used, x.left])).toEqual([['ka', 30, 0, 30], ['amd', 10, 0, 10]]);
    expect(cadreSummary(s, c, 2026, D)).toMatchObject({ leaveLeft: 40, leaveEntitled: 40, apal: 0 });
  });
  it('ΑΜΔ είναι κατάσταση στελέχους που μετρά στη στήλη των κανονικών αδειών της ΗΚΑΙ· η λίστα του χρήστη που πριν δεν την είχε την δείχνει', () => {
    expect(CADRE_ABS.find(x => x[0] === 'amd')).toEqual(['amd', 'Άδεια μικρής διάρκειας', 'ka']);
    const old = { cadreAbs: { add: [{ name: 'Σχολείο', col: 'ka' }] } };   // αποθηκευμένες λίστες χωρίς τον κωδικό amd
    expect(cadreAbsKinds(old).map(x => x[0])).toContain('amd'); expect(cadreAbsOf('amd', old)?.[2]).toBe('ka');
  });
  it('ημερολογιακές και εργάσιμες μέρες, και κατάσταση που περνά το τέλος της χρονιάς μετρά ξεχωριστά σε κάθε χρονιά', () => {
    let { s, c } = withCadre();
    s = abs(s, c, 'ka', '2025-12-29', '2026-01-04');   // Δευ 29/12 … Κυρ 4/1: 3 μέρες το 2025, 4 το 2026 (1/1 αργία, 3-4/1 ΣΚ)
    expect(left(s, c, 2025, 'ka').used).toBe(3); expect(left(s, c, 2026, 'ka').used).toBe(4);
    expect(left(s, c, 2026, 'ka').left).toBe(26); expect(left(s, c, 2025, 'ka').left).toBe(27);
    s = { ...s, settings: { ...s.settings, cadreLeave: { count: 'working' } } };
    expect(left(s, c, 2025, 'ka').used).toBe(3);   // 29, 30, 31/12 εργάσιμες
    expect(left(s, c, 2026, 'ka').used).toBe(1);   // μόνο η Παρ 2/1 (1/1 αργία, 3-4/1 ΣΚ)
    expect(left(s, c, 2027, 'ka').used).toBe(0);
  });
  it('οι καταστάσεις διαλέγουν το είδος τους: ΑΜΔ δεν μειώνει την κανονική', () => {
    let { s, c } = withCadre();
    s = abs(s, c, 'amd', '2026-03-02', '2026-03-04'); s = abs(s, c, 'ka', '2026-06-01', '2026-06-10');
    expect(left(s, c, 2026, 'amd')).toMatchObject({ used: 3, left: 7 }); expect(left(s, c, 2026, 'ka')).toMatchObject({ used: 10, left: 20 });
  });
  it('έξτρα μέρες και υπόλοιπο από πέρσι προστίθενται· είδος για «μόνο σε όποιον δοθεί» φαίνεται μόνο με δόση', () => {
    let { s, c } = withCadre();
    s = { ...s, settings: { ...s.settings, cadreLeave: { quotas: [...DEFAULT_LEAVE.quotas, { id: 'gon', name: 'Γονική άδεια', perYear: 0, kinds: ['eid'], all: false }] } } };
    expect(quotaBalances(s, c.id, 2026).map(b => b.quota.id)).toEqual(['ka', 'amd']);   // χωρίς δόση δεν φαίνεται
    s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'gon', days: 9, kind: 'extra', note: 'ΔΝ 12' } });
    s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'ka', days: 4, kind: 'carry' } });
    s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'ka', days: 2, kind: 'extra' } });
    s = abs(s, c, 'eid', '2026-04-01', '2026-04-02');
    expect(quotaBalances(s, c.id, 2026).map(b => b.quota.id)).toEqual(['ka', 'amd', 'gon']);
    expect(left(s, c, 2026, 'gon')).toMatchObject({ entitled: 9, used: 2, left: 7 });
    expect(left(s, c, 2026, 'ka')).toMatchObject({ base: 30, extra: 2, carry: 4, entitled: 36, left: 36 });
    expect(quotaBalances(s, c.id, 2027).map(b => b.quota.id)).toEqual(['ka', 'amd']);   // η δόση είναι της χρονιάς της
    // διαγραφή στελέχους παίρνει μαζί και τις δόσεις του
    expect(run(s, { t: 'deleteCadre', id: c.id }).cadreGrants).toEqual([]);
  });
  it('προειδοποίηση (όχι μπλοκάρισμα) όταν η άδεια περνά το υπόλοιπο· η αλλαγή της ίδιας κατάστασης δεν μετρά διπλά', () => {
    let { s, c } = withCadre();
    s = abs(s, c, 'ka', '2026-02-01', '2026-03-01');   // 29 μέρες
    expect(leaveOverdraft(s, c.id, { kind: 'ka', from: '2026-05-01', to: '2026-05-03' })).toEqual([{ name: 'Κανονική άδεια', year: 2026, left: -2 }]);
    expect(leaveOverdraft(s, c.id, { kind: 'amd', from: '2026-05-01', to: '2026-05-03' })).toEqual([]);
    const id = s.cadreAbs[0].id;
    expect(leaveOverdraft(s, c.id, { id, kind: 'ka', from: '2026-02-01', to: '2026-03-01' })).toEqual([]);
    expect(abs(s, c, 'ka', '2026-05-01', '2026-05-03').cadreAbs).toHaveLength(2);   // αποθηκεύεται κανονικά
  });
});

describe('Καρτέλα απαλλαγών', () => {
  function withDuties() {
    let { s, c } = withCadre();
    const post = postsOf(s.settings)[0].k;
    s = { ...s, cadreList: s.cadreList.map(x => ({ ...x, pid: -1 })) }; c = s.cadreList[0];
    // Τρίτη 3/11, Σάββατο 7/11, Δευτέρα 9/11 (και μία μέλλουσα, 25/11)
    s = { ...s, guards: { ...s.guards, '2026-11-03': { [post]: -1 }, '2026-11-07': { [post]: -1 }, '2026-11-09': { [post]: -1 }, '2026-11-25': { [post]: -1 } } };
    return { s, c };
  }
  it('+1 για κάθε υπηρεσία (όχι όσες δεν έγιναν ακόμα), −1 για κάθε μέρα «Απαλλαγή», τρέχον υπόλοιπο', () => {
    let { s, c } = withDuties();
    s = abs(s, c, 'apal', '2026-11-05', '2026-11-05');
    const rows = apalLedger(s, c, D);
    expect(rows.map(r => [r.d, r.kind, r.gain, r.take, r.left])).toEqual([['2026-11-03', 'duty', 1, 0, 1], ['2026-11-05', 'apal', 0, 1, 0], ['2026-11-07', 'duty', 1, 0, 1], ['2026-11-09', 'duty', 1, 0, 2]]);
    expect(apalCard(rows, 2026)).toMatchObject({ opening: 0, left: 2, earned: 3, taken: 1 });
    expect(apalLedger(s, c).at(-1)).toMatchObject({ d: '2026-11-25', left: 3 });   // χωρίς «σήμερα» μετρούν όλες
    expect(cadreSummary(s, c, 2026, D).apal).toBe(2);
  });
  it('έξτρα σε ΣΚ/αργία και περισσότερες ανά υπηρεσία', () => {
    let { s, c } = withDuties();
    s = { ...s, settings: { ...s.settings, cadreLeave: { apalPerDuty: 2, apalHolExtra: 1 } } };
    expect(apalLedger(s, c, D).map(r => r.gain)).toEqual([2, 3, 2]);   // το Σάββατο 7/11 δίνει 3
  });
  it('αρχικό υπόλοιπο μπαίνει πρώτο και η καρτέλα της επόμενης χρονιάς ξεκινά από το υπόλοιπο, όταν δεν λήγουν', () => {
    let { s, c } = withDuties();
    s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'apal', days: 5, kind: 'start', note: 'ως 31/10' } });
    const rows = apalLedger(s, c, D);
    expect(rows[0]).toMatchObject({ d: '2026-01-01', kind: 'start', gain: 5, left: 5 });
    expect(rows.at(-1)!.left).toBe(8);
    expect(apalCard(rows, 2027)).toMatchObject({ opening: 8, left: 8, rows: [] });
    expect(() => run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'apal', days: 5, kind: 'extra' } })).toThrow();
  });
  it('με λήξη στο τέλος της χρονιάς οι απαλλαγές που έμειναν σβήνουν την 1/1', () => {
    let { s, c } = withDuties();
    s = { ...s, settings: { ...s.settings, cadreLeave: { apalExpire: 'year' as const } } };
    s = abs(s, c, 'apal', '2027-02-02', '2027-02-02');
    const rows = apalLedger(s, c, D);
    expect(rows.map(r => [r.d, r.kind, r.left])).toEqual([['2026-11-03', 'duty', 1], ['2026-11-07', 'duty', 2], ['2026-11-09', 'duty', 3], ['2027-01-01', 'reset', 0], ['2027-02-02', 'apal', -1]]);
    expect(apalCard(rows, 2026, 'year').left).toBe(3);
    expect(apalCard(rows, 2027, 'year')).toMatchObject({ opening: 0, left: -1, taken: 1 });   // αρνητικό: προειδοποίηση, όχι μπλοκάρισμα
    expect(apalCard(rows, 2028, 'year').left).toBe(0);
    expect(apalLedger(s, c, D).some(r => r.kind === 'reset')).toBe(true);
  });
  it('στέλεχος χωρίς θέση δεν έχει υπηρεσίες· ο στρατιώτης με το ίδιο αριθμό δεν μετρά', () => {
    const { s, c } = withCadre();
    expect(apalLedger(s, c, D)).toEqual([]);
  });
  it('Excel: νέο αρχείο με υπόλοιπα όλων και, από την καρτέλα, η καρτέλα απαλλαγών· όλα με κεφαλαία', async () => {
    let { s, c } = withDuties();
    s = abs(s, c, 'ka', '2026-06-01', '2026-06-10');
    const sh = leaveSheets(s, 2026, D, c.id);
    expect(sh.map(x => x.name)).toEqual(['ΥΠΟΛΟΙΠΑ', 'ΑΔΕΙΕΣ ΣΤΕΛΕΧΟΥΣ', 'ΚΑΡΤΕΛΑ ΑΠΑΛΛΑΓΩΝ']);
    expect(sh[0].head.slice(5, 8)).toEqual(['ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ: ΔΙΚΑΙΟΥΤΑΙ', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ: ΕΧΕΙ ΠΑΡΕΙ', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ: ΜΕΝΟΥΝ']);
    expect(sh[0].rows[0].slice(5, 8)).toEqual([30, 10, 20]); expect(sh[0].rows[0].at(-1)).toBe(3);
    expect(leaveSheets(s, 2026, D).map(x => x.name)).toEqual(['ΥΠΟΛΟΙΠΑ']);
    const m = await cadreLeaveBook(s, 2026, D, c.id);
    expect(m.name).toBe('ΑΔΕΙΕΣ-ΑΠΑΛΛΑΓΕΣ ΣΤΕΛΕΧΩΝ 2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.data as any);
    expect(wb.worksheets.map(w => w.name)).toEqual(['ΥΠΟΛΟΙΠΑ', 'ΑΔΕΙΕΣ ΣΤΕΛΕΧΟΥΣ', 'ΚΑΡΤΕΛΑ ΑΠΑΛΛΑΓΩΝ']);
    expect(String(wb.worksheets[0].getCell(4, 4).value)).toBe('ΠΑΠΑΔΑΚΗΣ');
    expect(String(wb.worksheets[2].getCell(4, 2).value)).toMatch(/^ΥΠΗΡΕΣΙΑ /);
  });
});
