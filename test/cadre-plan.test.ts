// Πρόγραμμα αδειών στελεχών (17/11, φάση 2): ευρετήριο του μήνα, εγγραφή διαστήματος (νέο, επικάλυψη, κόψιμο, σβήσιμο),
// «Δεν θέλει υπηρεσία» (δεν είναι κατάσταση: δεν αγγίζει ΗΚΑΙ, Δύναμη, ΣΤΕΛΕΧΗ.xlsx), Excel, και παλιά κατάσταση χωρίς cadreNoDuty
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { apply, type Command } from '../src/shared/commands';
import { DEFAULT_SETTINGS, emptyState, type AppState, type Cadre } from '../src/shared/domain';
import { cadreAbsOn, hkaiCounts, holOf } from '../src/shared/rules';
import { cadreSheets, cadreStatusOn } from '../src/shared/cadre';
import { cadreSummary } from '../src/shared/cadreBalance';
import { cutRange, leaveLeftText, monthIndex, planCode, planDays, planFilters, planRows, planSheet, setNoDuty, shiftMonth, shortOf } from '../src/shared/cadrePlan';
import { cadrePlanBook } from '../src/main/excel';
import { fileNameOf } from '../src/shared/fileNames';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';
import { upperOrd } from '../src/shared/text';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
function base(): { s: AppState; a: Cadre; b: Cadre } {
  let s = fakeState(10);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΠΑΠΑΔΑΚΗΣ', first: 'ΓΕΩΡΓΙΟΣ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΥΠΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΤΥΧΑΙΟΣ', first: 'ΚΩΣΤΑΣ' } });
  return { s, a: s.cadreList.find(c => c.last === 'ΠΑΠΑΔΑΚΗΣ')!, b: s.cadreList.find(c => c.last === 'ΤΥΧΑΙΟΣ')! };
}
const abs = (s: AppState, c: Cadre, kind: string, from: string, to: string, replace = false) => run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind, from, to }, replace });
const mine = (s: AppState, c: Cadre) => s.cadreAbs.filter(x => x.cid === c.id).map(x => [x.kind, x.from, x.to]).sort((p, q) => p[1].localeCompare(q[1]));
const DEC = '2026-12';

describe('Πρόγραμμα αδειών: ημέρες και ευρετήριο μήνα', () => {
  it('ημέρες του μήνα με αρχικό ημέρας, ΣΚ και αργίες (και οι δικές σου)', () => {
    const days = planDays(DEFAULT_SETTINGS, DEC);
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ d: '2026-12-01', n: 1, dow: 'Τ', we: false });   // Τρίτη
    expect(days[4]).toMatchObject({ n: 5, dow: 'Σ', we: true }); expect(days[5]).toMatchObject({ n: 6, dow: 'Κ', we: true });
    expect(days[24]).toMatchObject({ n: 25, hol: expect.any(String) });   // Χριστούγεννα
    expect(planDays(DEFAULT_SETTINGS, '2026-02')).toHaveLength(28);
    const own = { ...DEFAULT_SETTINGS, holidays: { '2026-12-10': 'Γιορτή μονάδας' } };
    expect(planDays(own, DEC)[9].hol).toBe('Γιορτή μονάδας'); expect(holOf(own, '2026-12-10')).toBe('Γιορτή μονάδας');
  });
  it('shiftMonth και κωδικοί: ΚΑ, ΑΜΔ, ΑΠ, ΑΝ, ΝΟΣ, δικά σου με σύντομο όνομα', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01'); expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    const st = DEFAULT_SETTINGS;
    expect(['ka', 'amd', 'apal', 'an', 'nos', 'yp'].map(k => planCode(k, st).code)).toEqual(['ΚΑ', 'ΑΜΔ', 'ΑΠ', 'ΑΝ', 'ΝΟΣ', 'ΥΠ']);
    expect(['ka', 'amd', 'apal', 'an'].map(k => planCode(k, st).fam)).toEqual(['ka', 'amd', 'apal', 'other']);
    expect(shortOf('Γονική άδεια')).toBe('ΓΑ'); expect(shortOf('Σχολείο')).toBe('ΣΧΟ');
    const own = { ...DEFAULT_SETTINGS, lists: { cadreAbs: { add: [{ name: 'Γονική', col: 'ka' }] } } };
    expect(planCode('Γονική', own)).toMatchObject({ code: 'ΓΟΝ', fam: 'other' });
    const q = { ...own, cadreLeave: { quotas: [{ id: 'q3', name: 'Γονική', perYear: 9, kinds: ['Γονική'], all: false }] } };
    expect(planCode('Γονική', q).fam).toBe('leave');
  });
  it('το ευρετήριο δίνει σε κάθε μέρα ό,τι δίνουν το cadreAbsOn και το cadreStatusOn (και κόβει στα όρια του μήνα)', () => {
    let { s, a, b } = base();
    s = abs(s, a, 'ka', '2026-11-27', '2026-12-03'); s = abs(s, a, 'amd', '2026-12-07', '2026-12-08'); s = abs(s, a, 'apal', '2026-12-30', '2027-01-04');
    s = abs(s, b, 'an', '2026-12-10', '2026-12-10');
    const ix = monthIndex(s, DEC);
    for (const c of [a, b]) for (const d of ix.days) {
      const v = ix.cells.get(c.id)?.[d.n - 1];
      expect(v?.id, c.last + ' ' + d.d).toBe(cadreAbsOn(s, c.id, d.d)?.id);
      expect(v?.name).toBe(cadreStatusOn(s, c.id, d.d)?.label);
    }
    expect(ix.cells.get(a.id)![0]).toMatchObject({ code: 'ΚΑ', from: '2026-11-27', to: '2026-12-03' });
    expect(ix.cells.get(a.id)![30]).toMatchObject({ code: 'ΑΠ', fam: 'apal' });
    expect(monthIndex(s, '2027-03').cells.size).toBe(0);
  });
  it('επικάλυψη στα δεδομένα: νικά η πρώτη, όπως στο cadreAbsOn', () => {
    const { s, a } = base();
    const t: AppState = { ...s, cadreAbs: [{ id: 'p', cid: a.id, kind: 'ka', from: '2026-12-01', to: '2026-12-05' }, { id: 'q', cid: a.id, kind: 'an', from: '2026-12-03', to: '2026-12-08' }] };
    const ix = monthIndex(t, DEC);
    expect(ix.cells.get(a.id)!.map(v => v?.id).slice(0, 9)).toEqual(['p', 'p', 'p', 'p', 'p', 'q', 'q', 'q', undefined]);
    expect(ix.cells.get(a.id)![3]?.id).toBe(cadreAbsOn(t, a.id, '2026-12-04')?.id);
  });
  it('φίλτρα: Όλοι, Αξιωματικοί, Υπαξιωματικοί, Με άδεια τον μήνα· οι εκτός δύναμης δεν φαίνονται· σε μια φάση 3 προστίθενται φίλτρα στη λίστα', () => {
    let { s, a, b } = base();
    s = abs(s, a, 'ka', '2026-12-14', '2026-12-18'); s = abs(s, b, 'an', '2026-12-14', '2026-12-15');
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΔΕΚ', hk: 'Δεκανείς', last: 'ΕΚΤΟΣ', first: 'Χ', active: false } });
    const ix = monthIndex(s, DEC); const ids = (f: string) => planRows(s, ix, f).map(c => c.last);
    expect(ids('all').sort()).toEqual(['ΠΑΠΑΔΑΚΗΣ', 'ΤΥΧΑΙΟΣ']);
    expect(ids('off')).toEqual(['ΤΥΧΑΙΟΣ']); expect(ids('nco')).toEqual(['ΠΑΠΑΔΑΚΗΣ']);
    expect(ids('leave')).toEqual(['ΠΑΠΑΔΑΚΗΣ']);   // η αναρρωτική δεν είναι είδος άδειας με υπόλοιπο
    expect(planRows(s, ix, 'άγνωστο')).toHaveLength(2);
    const extra = [...planFilters(), { id: 'g1', label: 'Πύλη', match: (c: Cadre) => c.id === b.id }];
    expect(planRows(s, ix, 'g1', extra).map(c => c.last)).toEqual(['ΤΥΧΑΙΟΣ']);
  });
  it('υπόλοιπο αδειών συμπαγές: «ΚΑ 25 · ΑΜΔ 10» και κόκκινο όταν πάει κάτω από 0', () => {
    let { s, a } = base();
    s = abs(s, a, 'ka', '2026-12-01', '2026-12-05');
    expect(leaveLeftText(s, a.id, 2026)).toMatchObject({ text: 'ΚΑ 25 · ΑΜΔ 10', neg: false });
    s = abs(s, a, 'amd', '2026-03-01', '2026-03-12');
    expect(leaveLeftText(s, a.id, 2026)).toMatchObject({ text: 'ΚΑ 25 · ΑΜΔ -2', neg: true });
  });
});

describe('Πρόγραμμα αδειών: εγγραφή διαστήματος', () => {
  it('νέα κατάσταση σε ελεύθερες μέρες: μία κανονική κατάσταση στελέχους (ΗΚΑΙ, Δύναμη όπως πάντα)', () => {
    const { s, a } = base(); const t = abs(s, a, 'ka', '2026-12-14', '2026-12-18');
    expect(mine(t, a)).toEqual([['ka', '2026-12-14', '2026-12-18']]);
    expect(hkaiCounts(t, '2026-12-15').apo).toBe(hkaiCounts(s, '2026-12-15').apo + 1);
  });
  it('επικάλυψη: χωρίς replace σφάλμα, με replace η παλιά κόβεται και χωρίζεται σε δύο', () => {
    let { s, a } = base();
    s = abs(s, a, 'ka', '2026-12-10', '2026-12-20');
    expect(() => abs(s, a, 'amd', '2026-12-14', '2026-12-15')).toThrow();
    const t = abs(s, a, 'amd', '2026-12-14', '2026-12-15', true);
    expect(mine(t, a)).toEqual([['ka', '2026-12-10', '2026-12-13'], ['amd', '2026-12-14', '2026-12-15'], ['ka', '2026-12-16', '2026-12-20']]);
    expect(new Set(t.cadreAbs.map(x => x.id)).size).toBe(3);
    // πάνω από την αρχή: κόβεται μόνο το τέλος· πάνω από όλη: αντικαθίσταται
    const u = abs(s, a, 'apal', '2026-12-08', '2026-12-12', true); expect(mine(u, a)).toEqual([['apal', '2026-12-08', '2026-12-12'], ['ka', '2026-12-13', '2026-12-20']]);
    const w = abs(s, a, 'an', '2026-12-09', '2026-12-21', true); expect(mine(w, a)).toEqual([['an', '2026-12-09', '2026-12-21']]);
  });
  it('«Σβήσε» μέσα στο διάστημα: κόβει, χωρίζει ή σβήνει ολόκληρη, και μόνο του στελέχους', () => {
    let { s, a, b } = base();
    s = abs(s, a, 'ka', '2026-12-10', '2026-12-20'); s = abs(s, a, 'amd', '2026-12-22', '2026-12-23'); s = abs(s, b, 'ka', '2026-12-10', '2026-12-20');
    let t = run(s, { t: 'clearCadrePlan', cid: a.id, from: '2026-12-14', to: '2026-12-15' });
    expect(mine(t, a)).toEqual([['ka', '2026-12-10', '2026-12-13'], ['ka', '2026-12-16', '2026-12-20'], ['amd', '2026-12-22', '2026-12-23']]);
    expect(mine(t, b)).toEqual([['ka', '2026-12-10', '2026-12-20']]);
    t = run(t, { t: 'clearCadrePlan', cid: a.id, from: '2026-12-12', to: '2026-12-23' });   // τέλος της πρώτης, όλη η δεύτερη και η τρίτη
    expect(mine(t, a)).toEqual([['ka', '2026-12-10', '2026-12-11']]);
    expect(() => run(t, { t: 'clearCadrePlan', cid: a.id, from: '2026-12-28', to: '2026-12-30' })).toThrow();
    expect(() => run(t, { t: 'clearCadrePlan', cid: a.id, from: '2026-12-30', to: '2026-12-28' })).toThrow();
  });
  it('cutRange: οι εγγραφές έξω από το διάστημα μένουν ίδιες (ίδιο αντικείμενο)', () => {
    const l = [{ id: '1', from: '2026-12-01', to: '2026-12-03', k: 1 }, { id: '2', from: '2026-12-10', to: '2026-12-12', k: 2 }];
    const out = cutRange(l, () => true, '2026-12-11', '2026-12-30', () => 'z');
    expect(out[0]).toBe(l[0]); expect(out[1]).toEqual({ id: '2', from: '2026-12-10', to: '2026-12-10', k: 2 });
  });
  it('υπόλοιπο: η εγγραφή από το πλέγμα μετρά όπως όταν μπαίνει από την καρτέλα', () => {
    let { s, a } = base(); s = abs(s, a, 'ka', '2026-12-14', '2026-12-18');
    expect(cadreSummary(s, a, 2026, D).quotas.find(q => q.quota.id === 'ka')!.left).toBe(25);
  });
});

describe('«Δεν θέλει υπηρεσία»', () => {
  it('παλιά κατάσταση χωρίς cadreNoDuty φορτώνει όπως πριν, και το πλέγμα δουλεύει', () => {
    const { s, a } = base();
    expect(s.cadreNoDuty).toBeUndefined(); expect(emptyState().cadreNoDuty).toBeUndefined();
    const ix = monthIndex(s, DEC); expect(ix.noDuty.size).toBe(0);
    expect(planSheet(s, DEC).rows).toHaveLength(2);
    expect(run(s, { t: 'deleteCadre', id: a.id }).cadreNoDuty).toBeUndefined();
  });
  it('μπαίνει με from–to, ενώνεται με γειτονικές της ίδιας παρατήρησης, και κόβει ό,τι πέφτει πάνω του', () => {
    const { s, a, b } = base();
    let t = run(s, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-05', to: '2026-12-09' });
    expect(t.cadreNoDuty).toMatchObject([{ cid: a.id, from: '2026-12-05', to: '2026-12-09' }]);
    t = run(t, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-10', to: '2026-12-11' });
    expect(t.cadreNoDuty!.map(x => [x.from, x.to])).toEqual([['2026-12-05', '2026-12-11']]);
    t = run(t, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-07', to: '2026-12-08', note: 'γάμος' });
    expect(t.cadreNoDuty!.map(x => [x.from, x.to, x.note]).sort((p, q) => String(p[0]).localeCompare(String(q[0])))).toEqual([['2026-12-05', '2026-12-06', undefined], ['2026-12-07', '2026-12-08', 'γάμος'], ['2026-12-09', '2026-12-11', undefined]]);
    t = run(t, { t: 'setCadreNoDuty', cid: b.id, from: '2026-12-07', to: '2026-12-08' });
    expect(t.cadreNoDuty!.filter(x => x.cid === b.id)).toHaveLength(1);
    expect(setNoDuty([], a.id, '2026-12-01', '2026-12-02', '  ', () => 'q')).toEqual([{ id: 'q', cid: a.id, from: '2026-12-01', to: '2026-12-02' }]);
    expect(() => run(s, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-09', to: '2026-12-05' })).toThrow();
  });
  it('ΔΕΝ είναι κατάσταση: ούτε cadreAbs, ούτε cadreStatusOn, ούτε ΗΚΑΙ, ούτε ΣΤΕΛΕΧΗ.xlsx, ούτε υπόλοιπα άδειας', () => {
    const { s, a } = base();
    const t = run(s, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-01', to: '2026-12-31' });
    expect(t.cadreAbs).toBe(s.cadreAbs);
    for (let d = 1; d <= 31; d++) { const day = '2026-12-' + String(d).padStart(2, '0'); expect(cadreStatusOn(t, a.id, day)).toBeUndefined(); expect(hkaiCounts(t, day)).toEqual(hkaiCounts(s, day)); }
    expect(cadreSheets(t, '2026-12-10')).toEqual(cadreSheets(s, '2026-12-10'));
    expect(cadreSummary(t, a, 2026, D)).toEqual(cadreSummary(s, a, 2026, D));
    expect(JSON.stringify(cadreSheets(t, '2026-12-10'))).not.toMatch(/ΘΕΛΕΙ/);
  });
  it('διαγραφή εγγραφής, «Σβήσε» και διαγραφή στελέχους τα σβήνουν', () => {
    let { s, a } = base();
    s = run(s, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-05', to: '2026-12-09' });
    expect(run(s, { t: 'deleteCadreNoDuty', id: s.cadreNoDuty![0].id }).cadreNoDuty).toEqual([]);
    expect(() => run(s, { t: 'deleteCadreNoDuty', id: 'λάθος' })).toThrow();
    const c = run(s, { t: 'clearCadrePlan', cid: a.id, from: '2026-12-06', to: '2026-12-07' });
    expect(c.cadreNoDuty!.map(x => [x.from, x.to])).toEqual([['2026-12-05', '2026-12-05'], ['2026-12-08', '2026-12-09']]);
    expect(c.cadreAbs).toBe(s.cadreAbs);
    expect(run(s, { t: 'deleteCadre', id: a.id }).cadreNoDuty).toEqual([]);
  });
  it('το πλέγμα το δείχνει μαζί με την κατάσταση της μέρας', () => {
    let { s, a } = base();
    s = abs(s, a, 'ka', '2026-12-14', '2026-12-15'); s = run(s, { t: 'setCadreNoDuty', cid: a.id, from: '2026-12-15', to: '2026-12-16' });
    const ix = monthIndex(s, DEC);
    expect(ix.cells.get(a.id)![14]?.code).toBe('ΚΑ'); expect(ix.noDuty.get(a.id)![14]).toBeDefined(); expect(ix.noDuty.get(a.id)![15]).toBeDefined(); expect(ix.noDuty.get(a.id)![13]).toBeUndefined();
  });
  it('βάση: αποθηκεύεται (kv), φορτώνει ξανά και η αναίρεση το βγάζει', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gipl-'));
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    let st = new Store(dir, WASM); await st.open();
    expect(st.state.cadreNoDuty).toBeUndefined();   // παλιά/νέα βάση χωρίς το κλειδί
    st.commit(run(st.state, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' } }));
    const cid = st.state.cadreList[0].id;
    const p1 = st.commit(run(st.state, { t: 'setCadreNoDuty', cid, from: '2026-12-05', to: '2026-12-06' }));
    const p2 = st.commit(run(st.state, { t: 'setCadreNoDuty', cid, from: '2026-12-20', to: '2026-12-21', note: 'Χ' }));
    expect(p2.kvd).toMatchObject([{ key: 'cadreNoDuty' }]);   // αναίρεση ανά εγγραφή, όχι όλη η λίστα
    st.close(); st = new Store(dir, WASM); await st.open();
    expect(st.state.cadreNoDuty!.map(x => x.from).sort()).toEqual(['2026-12-05', '2026-12-20']);
    st.revert(p2); expect(st.state.cadreNoDuty!.map(x => x.from)).toEqual(['2026-12-05']);
    st.revert(p1); expect(st.state.cadreNoDuty).toEqual([]);
    st.close();
  });
});

describe('Excel «ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ»', () => {
  function sample() {
    let { s, a, b } = base();
    s = { ...s, settings: { ...s.settings, holidays: { '2026-12-10': 'Γιορτή μονάδας' } } };
    s = abs(s, a, 'ka', '2026-12-14', '2026-12-18'); s = abs(s, a, 'amd', '2026-12-02', '2026-12-02'); s = abs(s, b, 'apal', '2026-12-24', '2026-12-24');
    s = run(s, { t: 'setCadreNoDuty', cid: b.id, from: '2026-12-24', to: '2026-12-24' });   // ίδια μέρα με κατάσταση
    s = run(s, { t: 'setCadreNoDuty', cid: b.id, from: '2026-12-29', to: '2026-12-30' });
    return { s, a, b };
  }
  it('κωδικοί, κεφαλαία, ΣΚ/αργίες, υπόμνημα', () => {
    const { s } = sample(); const sh = planSheet(s, DEC);
    expect(sh.title).toBe('ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ ΔΕΚΕΜΒΡΙΟΣ 2026');
    expect(sh.rows.map(r => r.name)).toEqual(['ΤΥΧΑΙΟΣ ΚΩΣΤΑΣ', 'ΠΑΠΑΔΑΚΗΣ ΓΕΩΡΓΙΟΣ']);   // σειρά ΗΚΑΙ: αξιωματικοί πρώτα
    const pap = sh.rows[1], tyx = sh.rows[0];
    expect(pap.rank).toBe('ΛΧΙΑΣ'); expect(pap.cells.slice(13, 18)).toEqual(['ΚΑ', 'ΚΑ', 'ΚΑ', 'ΚΑ', 'ΚΑ']); expect(pap.cells[1]).toBe('ΑΜΔ'); expect(pap.cells[0]).toBe('');
    expect(tyx.cells[23]).toBe('ΑΠ/X'); expect(tyx.cells[28]).toBe('X'); expect(tyx.cells[29]).toBe('X');
    expect(pap.left).toBe('ΚΑ 25 · ΑΜΔ 9');
    expect(sh.shade[4]).toBe('we'); expect(sh.shade[9]).toBe('hol'); expect(sh.shade[24]).toBe('hol'); expect(sh.shade[0]).toBe('');
    expect(sh.legend.map(l => l.code)).toEqual(['ΚΑ', 'ΑΜΔ', 'ΑΠ', 'X']);
    const all = [sh.title, ...sh.rows.flatMap(r => [r.rank, r.name, r.left, ...r.cells]), ...sh.legend.flatMap(l => [l.code, l.name])];
    for (const t of all) expect(t).toBe(upperOrd(t));
    expect(planSheet(s, DEC, 'off').rows).toHaveLength(1);
  });
  it('το αρχείο: ένα φύλλο, A4 οριζόντια σε μία σελίδα φάρδος, γκρι ΣΚ/αργίες, όνομα από το fileNames, υπόμνημα κάτω', async () => {
    const { s } = sample();
    const m = await cadrePlanBook(s, DEC, D);
    expect(m.name).toBe('ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ ΔΕΚΕΜΒΡΙΟΣ 2026.xlsx'); expect(m.name).toBe(fileNameOf(s.settings, 'cadrePlan', { text: 'ΔΕΚΕΜΒΡΙΟΣ 2026' }));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.data as any);
    expect(wb.worksheets).toHaveLength(1); const ws = wb.worksheets[0];
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(String(ws.getCell(1, 1).value)).toMatch(/^ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ ΔΕΚΕΜΒΡΙΟΣ 2026 · /);
    const head = ws.getRow(3).values as any[];
    expect(head.slice(1, 4)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ']); expect(String(head[4])).toBe('1\nΤ'); expect(head[35]).toBe('ΥΠΟΛΟΙΠΟ ΑΔΕΙΩΝ');
    expect(ws.getCell(5, 3).value).toBe('ΠΑΠΑΔΑΚΗΣ ΓΕΩΡΓΙΟΣ'); expect(ws.getCell(5, 4 + 13).value).toBe('ΚΑ');
    const fg = (r: number, c: number) => (ws.getCell(r, c).fill as any)?.fgColor?.argb;
    expect(fg(5, 4 + 4)).toBe('FFD9D9D9'); expect(fg(5, 4 + 9)).toBe('FFBFBFBF'); expect(fg(5, 4 + 1)).toBeUndefined();   // ΣΚ, αργία, καθημερινή
    const legend = String(ws.getCell(7, 1).value); expect(legend).toMatch(/^ΥΠΟΜΝΗΜΑ: .*ΚΑ = ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ.*ΑΜΔ = ΑΔΕΙΑ ΜΙΚΡΗΣ ΔΙΑΡΚΕΙΑΣ.*ΑΠ = ΑΠΑΛΛΑΓΗ.*X = ΔΕΝ ΘΕΛΕΙ ΥΠΗΡΕΣΙΑ/);
    // κανένα πεζό γράμμα σε κανένα κελί
    ws.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') expect(c.value).toBe(upperOrd(c.value)); }));
  });
  it('χωρίς στελέχη: φύλλο με «ΚΑΝΕΝΑΣ»', async () => {
    const m = await cadrePlanBook(fakeState(3), DEC, D);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.data as any);
    expect(wb.worksheets[0].getCell(4, 1).value).toBe('ΚΑΝΕΝΑΣ');
  });
});
