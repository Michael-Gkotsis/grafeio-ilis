// Μέρες της εβδομάδας χωρίς υπηρεσία (λοχίας, 12/10)
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { fillDay, guardUnavailable, nextFor, offDayBlock, swapCheck, fairOf } from '../src/shared/rules';
import { frouraChecks } from '../src/shared/preflight';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'id' + ++seq };
const SAT = '2026-10-17', SUN = '2026-10-18', TUE = '2026-10-13';
const off = (pid: number, days: number[], n = 40) => apply(fakeState(n), { t: 'setOffDays', pid, days }, ctx).state;

describe('μέρες χωρίς υπηρεσία', () => {
  it('αποθηκεύεται στο άτομο με τη σειρά της εβδομάδας, και σβήνεται όταν αδειάσει', () => {
    const r = apply(fakeState(5), { t: 'setOffDays', pid: 2, days: [0, 6, 1] }, ctx);
    expect(r.state.people[1].offDays).toEqual([1, 6, 0]);
    expect(r.text).toContain('όχι Δευτέρα, Σάββατο, Κυριακή');
    const r2 = apply(r.state, { t: 'setOffDays', pid: 2, days: [] }, ctx);
    expect('offDays' in r2.state.people[1]).toBe(false);
    expect(r2.text).toContain('όλες τις μέρες');
  });
  it('ισχύει μόνο τις μέρες που ορίστηκαν', () => {
    const s = off(3, [6, 0]);
    expect(offDayBlock(s, SAT, 3)).toBe('Δεν κάνει υπηρεσία Σάββατο');
    expect(offDayBlock(s, SUN, 3)).toBe('Δεν κάνει υπηρεσία Κυριακή');
    expect(offDayBlock(s, TUE, 3)).toBeNull();
    expect(guardUnavailable(s, SAT, 3, 'th1')).toBe('Δεν κάνει υπηρεσία Σάββατο');
    expect(guardUnavailable(s, TUE, 3, 'th1')).toBeNull();
  });
  it('η αυτόματη συμπλήρωση δεν τον βάζει εκείνη τη μέρα, αλλά τις άλλες κανονικά', () => {
    // λίγα άτομα: χωρίς τον κανόνα θα έμπαιναν όλοι
    const s = off(3, [6], 16);
    expect(Object.values(fillDay(s, SAT).guards[SAT])).not.toContain(3);
    expect(Object.values(fillDay(s, '2026-10-16').guards['2026-10-16'])).toContain(3);   // Παρασκευή
  });
  it('το «Επόμενος» τον προσπερνά', () => {
    const s = off(3, [6], 16);
    const seen: number[] = [];
    for (let id = nextFor(s, SAT, 'th1', seen); id != null; id = nextFor(s, SAT, 'th1', seen)) seen.push(id);
    expect(seen).not.toContain(3);
    expect(seen.length).toBeGreaterThan(5);
  });
  it('ο μόνιμος Λ/Υ μπαίνει πάντα (Michael, 18/10), και εκείνη τη μέρα, με προειδοποίηση', () => {
    let s = off(4, [6]);
    s = apply(s, { t: 'setSettings', settings: { fixed: { ly: 4 } }, text: '' }, ctx).state;
    const r = fillDay(s, SAT);
    expect(r.guards[SAT].ly).toBe(4);
    expect(r.warn.join(' ')).toMatch(/Μόνιμος Λ\/Υ .*μπήκε παρά τον κανόνα \(Δεν κάνει υπηρεσία Σάββατο\)/);
    expect(fillDay(s, TUE).guards[TUE].ly).toBe(4);
  });
  it('με το χέρι μπαίνει μόνο με αιτία, και φαίνεται ως προειδοποίηση', () => {
    const s = off(3, [6]);
    expect(() => apply(s, { t: 'assign', date: SAT, k: 'th1', pid: 3 }, ctx)).toThrow('Δεν κάνει υπηρεσία Σάββατο');
    const r = apply(s, { t: 'assign', date: SAT, k: 'th1', pid: 3, force: 'εντολή λοχία' }, ctx);
    expect(r.state.guards[SAT].th1).toBe(3);
    expect(r.text).toContain('παρά τον κανόνα: Δεν κάνει υπηρεσία Σάββατο');
    const c = frouraChecks(r.state, SAT).find(x => x.text.includes('Δεν κάνει υπηρεσία'));
    expect(c?.level).toBe('warn');
    // άλλη μέρα: χωρίς αιτία
    expect(apply(s, { t: 'assign', date: TUE, k: 'th1', pid: 3 }, ctx).state.guards[TUE].th1).toBe(3);
  });
  it('η ανταλλαγή που τον φέρνει σε τέτοια μέρα θέλει αιτία', () => {
    let s = off(3, [6]);
    s = apply(s, { t: 'assign', date: SAT, k: 'th1', pid: 3, force: 'x' }, ctx).state;
    s = apply(s, { t: 'assign', date: SAT, k: 'mg1', pid: 7 }, ctx).state;
    expect(swapCheck(s, SAT, 'th1', 'mg1').soft).toContain('Δεν κάνει υπηρεσία Σάββατο');
  });
  it('μένει στα σύνολα και στη σειρά δικαιοσύνης όπως πριν', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'assign', date: TUE, k: 'th1', pid: 3 }, ctx).state;
    const before = fairOf(s, 3, SAT);
    s = apply(s, { t: 'setOffDays', pid: 3, days: [6] }, ctx).state;
    expect(fairOf(s, 3, SAT)).toEqual(before);
  });
  it('η εισαγωγή Δυναμολογίου δεν σβήνει τις μέρες', () => {
    const s = off(2, [6, 0], 5);
    const rows = s.people.map(({ id, active, offDays, ...p }) => ({ ...p, phone: '6999999999' }));
    const r = apply(s, { t: 'importPeople', rows, source: 'test.xlsx', deactivateMissing: true }, ctx);
    expect(r.state.people[1].offDays).toEqual([6, 0]);
    expect(r.state.people[1].phone).toBe('6999999999');
  });
});
