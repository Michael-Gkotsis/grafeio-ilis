// ΕΠΟΠ/ΟΒΑ στρατιώτες (Michael, 21/10): όριο υπηρεσιών τον μήνα, μόνο με το χέρι, απαλλαγή την επόμενη μέρα στην ΗΚΑΙ.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { dutyPool, fillDay, hkaiCounts, isEpop, monthBlock, monthDuties, nextFor, whyText } from '../src/shared/rules';
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
  it('απαλλαγή την επόμενη μέρα στην ΗΚΑΙ, μόνο για ΕΠΟΠ/ΟΒΑ', () => {
    let s = run(epopState(), { t: 'assign', date: D, k: 'th1', pid: 3 });
    s = run(s, { t: 'assign', date: D, k: 'th2', pid: 7 });
    const h = hkaiCounts(s, '2026-10-13');
    expect(h.cols.apal.map(p => p.id)).toEqual([3]);
    expect(h.rank['ΕΠΟΠ Στρατιώτης'].c.apal).toBe(1);
    expect(hkaiCounts(s, D).cols.yp.map(p => p.id).sort()).toEqual([3, 7]);
    expect(hkaiCounts(s, '2026-10-14').cols.apal).toEqual([]);
  });
  it('όριο στη φόρμα: ακέραιος πάνω από 0, αλλιώς χωρίς όριο', () => {
    const s = epopState(); const p = s.people.find(x => x.id === 3)!;
    expect(run(s, { t: 'updatePerson', person: { ...p, monthMax: 4.7 } }).people.find(x => x.id === 3)!.monthMax).toBe(4);
    expect('monthMax' in run(s, { t: 'updatePerson', person: { ...p, monthMax: 0 } }).people.find(x => x.id === 3)!).toBe(false);
    const n = run(s, { t: 'addPerson', person: { rank: 'ΕΠΟΠ ΣΤΡ', spec: '', last: 'ΝΕΟΣΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: '', asm: '', phone: '', room: null, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '', monthMax: 3 } });
    expect(n.people[n.people.length - 1].monthMax).toBe(3);
  });
});
