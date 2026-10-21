// ΕΠΟΠ/ΟΒΑ στρατιώτες (Michael, 21/10): όριο υπηρεσιών τον μήνα, μόνο με το χέρι, η απαλλαγή μόνο με το χέρι.
// Συνήθως στα Στελέχη (μπαίνουν στις θέσεις με αρνητικό αριθμό), ή στο Δυναμολόγιο αν ήρθαν από το Excel.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { dutyPool, fillDay, hkaiCounts, isEpop, monthBlock, monthDuties, nextFor, seatMap, seatPeople, whyText } from '../src/shared/rules';
import { hkaiChecks } from '../src/shared/preflight';
import { frouraSheet } from '../src/renderer/sheets';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-12';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// ο 3 είναι ΕΠΟΠ ΣΤΡ με όριο 2, ο 4 ΟΒΑ ΣΤΡ χωρίς όριο
function epopState(): AppState {
  const s = fakeState(30);
  s.people = s.people.map(p => (p.id === 3 ? { ...p, rank: 'ΕΠΟΠ ΣΤΡ', monthMax: 2 } : p.id === 4 ? { ...p, rank: 'Ο.Β.Α. ΣΤΡ' } : p));
  return s;
}

describe('ΕΠΟΠ/ΟΒΑ', () => {
  it('αναγνωρίζονται από τον βαθμό', () => {
    expect(isEpop({ rank: 'ΕΠΟΠ ΣΤΡ' })).toBe(true);
    expect(isEpop({ rank: 'ΕΠΟΠ ΛΧΙΑΣ' })).toBe(true);
    expect(isEpop({ rank: 'Ε.Π.Ο.Π. ΔΝΕΑΣ' })).toBe(true);
    expect(isEpop({ rank: 'ΟΒΑ ΣΤΡ' })).toBe(true);
    expect(isEpop({ rank: 'ΣΤΡ' })).toBe(false);
    expect(isEpop({ rank: 'ΔΝΕΑΣ' })).toBe(false);
    expect(dutyPool(epopState()).some(p => p.id === 3 || p.id === 4)).toBe(false);
  });
  it('η αυτόματη συμπλήρωση και το «Επόμενος» δεν τους βάζουν', () => {
    let s = epopState();
    for (const d of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']) s = { ...s, guards: fillDay(s, d).guards };
    const used = new Set(Object.values(s.guards).flatMap(g => Object.values(g)));
    expect(used.has(3)).toBe(false); expect(used.has(4)).toBe(false);
    expect(used.size).toBeGreaterThan(5);
    for (let i = 0; i < 30; i++) expect([3, 4]).not.toContain(nextFor(s, '2026-10-16', 'th1', [...Array(i).keys()].map(x => x + 1).filter(x => x !== 3 && x !== 4)));
  });
  it('μόνιμος Δ/Υ ΕΠΟΠ: μπαίνει ως το όριο', () => {
    let s = epopState(); s = { ...s, settings: { ...s.settings, fixed: { dy: 3 } }, rules: { ...s.rules, restDays: 0 } };
    s = { ...s, guards: fillDay(s, '2026-10-01').guards };
    s = { ...s, guards: fillDay(s, '2026-10-05').guards };
    const r = fillDay(s, '2026-10-09');
    expect(s.guards['2026-10-01'].dy).toBe(3); expect(s.guards['2026-10-05'].dy).toBe(3);
    expect(r.guards['2026-10-09'].dy).not.toBe(3);
    expect(r.warn.join(' ')).toMatch(/όριο του μήνα/);
  });
  it('με το χέρι: ως το όριο κανονικά, μετά μόνο με αιτία', () => {
    let s = run(epopState(), { t: 'assign', date: '2026-10-02', k: 'th1', pid: 3 });
    s = run(s, { t: 'assign', date: '2026-10-06', k: 'dy', pid: 3 });
    expect(monthDuties(s, '2026-10-20', 3)).toBe(2);
    expect(monthBlock(s, '2026-10-20', 3)).toMatch(/2 από 2/);
    expect(monthBlock(s, '2026-11-02', 3)).toBeNull();   // νέος μήνας
    expect(() => run(s, { t: 'assign', date: '2026-10-20', k: 'th1', pid: 3 })).toThrow(/όριο του μήνα/);
    const r = apply(s, { t: 'assign', date: '2026-10-20', k: 'th1', pid: 3, force: 'λείπουν άτομα' }, ctx);
    expect(r.state.guards['2026-10-20'].th1).toBe(3); expect(r.text).toMatch(/παρά τον κανόνα/);
    // χωρίς όριο: πάντα κανονικά
    expect(monthBlock(s, '2026-10-20', 4)).toBeNull();
    expect(whyText(s, '2026-10-06', 'dy')).toMatch(/2η υπηρεσία του μήνα \(όριο 2\)/);
  });
  it('χωρίς αυτόματη απαλλαγή την επόμενη μέρα στην ΗΚΑΙ (μόνο με το χέρι)', () => {
    const s = run(epopState(), { t: 'assign', date: D, k: 'th1', pid: 3 });
    expect(hkaiCounts(s, D).cols.yp.map(p => p.id)).toEqual([3]);
    expect(hkaiCounts(s, '2026-10-13').cols.apal).toEqual([]);
  });
  it('όριο στη φόρμα: ακέραιος πάνω από 0, αλλιώς χωρίς όριο', () => {
    const s = epopState(); const p = s.people.find(x => x.id === 3)!;
    expect(run(s, { t: 'updatePerson', person: { ...p, monthMax: 4.7 } }).people.find(x => x.id === 3)!.monthMax).toBe(4);
    expect('monthMax' in run(s, { t: 'updatePerson', person: { ...p, monthMax: 0 } }).people.find(x => x.id === 3)!).toBe(false);
    const n = run(s, { t: 'addPerson', person: { rank: 'ΕΠΟΠ ΣΤΡ', spec: '', last: 'ΝΕΟΣΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: '', asm: '', phone: '', room: null, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '', monthMax: 3 } });
    expect(n.people[n.people.length - 1].monthMax).toBe(3);
  });
});

describe('ΕΠΟΠ/ΟΒΑ στα Στελέχη', () => {
  const withCadre = () => {
    let s = fakeState(30);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: 'ΣΤΕΛΕΧΑΚΗΣ', first: 'ΑΛΦΑΣ', monthMax: 2 } });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΧΩΡΙΣΥΠΗΡΕΣΙΕΣ', first: 'ΒΗΤΑΣ' } });
    return s;
  };
  it('με όριο παίρνει αρνητικό αριθμό θέσης και μπαίνει στη λίστα επιλογής', () => {
    const s = withCadre(); const [a, b] = s.cadreList;
    expect(a.pid).toBe(-1); expect(a.monthMax).toBe(2); expect(b.pid).toBeUndefined();
    expect(seatPeople(s).filter(p => p.cid).map(p => p.last)).toEqual(['ΣΤΕΛΕΧΑΚΗΣ']);
    expect(seatMap(s).get(-1)?.cid).toBe(a.id);
    // ο αριθμός μένει και όταν σβήσεις το όριο
    const s2 = run(s, { t: 'saveCadre', cadre: { ...a, monthMax: undefined } });
    expect(s2.cadreList[0].pid).toBe(-1); expect(seatPeople(s2).some(p => p.cid)).toBe(false);
  });
  it('μόνο με το χέρι: θέση, ΦΡΟΥΡΑ, ΗΚΑΙ «Υπηρ.», όριο', () => {
    let s = withCadre();
    for (const d of ['2026-10-12', '2026-10-13']) s = { ...s, guards: fillDay(s, d).guards };
    expect(Object.values(s.guards).some(g => Object.values(g).includes(-1))).toBe(false);
    s = run(s, { t: 'clearDay', date: '2026-10-12' });
    s = run(s, { t: 'assign', date: '2026-10-12', k: 'dy', pid: -1 });
    expect(s.guards['2026-10-12'].dy).toBe(-1);
    expect(JSON.stringify(frouraSheet(s, '2026-10-12'))).toMatch(/ΣΤΕΛΕΧΑΚΗΣ/);
    const h = hkaiCounts(s, '2026-10-12');
    expect(h.cadre.yp.map(c => c.last)).toEqual(['ΣΤΕΛΕΧΑΚΗΣ']); expect(h.rank['ΕΠΟΠ Στρατιώτης'].c.yp).toBe(1);
    expect(hkaiCounts(s, '2026-10-13').cadre.apal).toBeUndefined();
    s = run(s, { t: 'assign', date: '2026-10-20', k: 'dy', pid: -1 });
    expect(monthBlock(s, '2026-10-25', -1)).toMatch(/2 από 2/);
    expect(() => run(s, { t: 'assign', date: '2026-10-25', k: 'th1', pid: -1 })).toThrow(/όριο του μήνα/);
  });
  it('με κατάσταση στελέχους (άδεια, απαλλαγή) θέλει αιτία· με «Υπηρεσία» όχι', () => {
    let s = withCadre(); const cid = s.cadreList[0].id;
    s = run(s, { t: 'addCadreAbs', abs: { cid, kind: 'apal', from: D, to: D } });
    expect(monthBlock(s, D, -1)).toMatch(/Στέλεχος: Απαλλαγή/);
    expect(() => run(s, { t: 'assign', date: D, k: 'dy', pid: -1 })).toThrow(/Απαλλαγή/);
    expect(hkaiCounts(s, D).cadre.apal.map(c => c.last)).toEqual(['ΣΤΕΛΕΧΑΚΗΣ']);
    s = run(s, { t: 'addCadreAbs', abs: { cid, kind: 'yp', from: '2026-10-14', to: '2026-10-14' } });
    expect(monthBlock(s, '2026-10-14', -1)).toBeNull();
  });
  it('δεν σβήνεται με υπηρεσίες· εκτός δύναμης φεύγει από τις επόμενες', () => {
    let s = withCadre(); const x = s.cadreList[0];
    s = run(s, { t: 'assign', date: '2026-10-10', k: 'dy', pid: -1 });
    s = run(s, { t: 'assign', date: '2026-10-14', k: 'dy', pid: -1 });
    expect(() => run(s, { t: 'deleteCadre', id: x.id })).toThrow(/εκτός δύναμης/);
    s = run(s, { t: 'saveCadre', cadre: { ...x, active: false } });
    expect(s.guards['2026-10-10'].dy).toBe(-1); expect(s.guards['2026-10-14'].dy).toBeUndefined();
    expect(monthBlock(s, '2026-10-16', -1)).toMatch(/εκτός δύναμης/);
  });
  it('ίδιο άτομο σε Δυναμολόγιο και Στελέχη: προειδοποίηση', () => {
    let s = withCadre(); const p = s.people[2];
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: p.last, first: p.first } });
    expect(hkaiChecks(s, D).map(c => c.text).join(' ')).toMatch(/μετρούν δύο φορές/);
  });
});
