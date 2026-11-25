// Έλεγχος 25/11, Π1: υπηρεσία «Μόνο στελέχη» που έγινε ανενεργή ή δεν είναι στο έντυπο που ισχύει (ΣΒΕΝ → ΣΠΕΝ). Οι υπηρεσίες που έγιναν
// μένουν όπως ήταν (setBlock: «οι υπηρεσίες που έγιναν μένουν»): στο πρόγραμμα στελεχών ως ΑΥΔΜ, στην ΗΔ, στο Excel ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ, μία
// φορά στο μέτρημα. Πριν τη διόρθωση η αλλαγή εντύπου έσβηνε την εγγραφή του προγράμματος και η μέρα έδειχνε «Σ». Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { autoFill, cellCode, dutySheet, monthCount, personCells } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { hdRosterOn } from '../src/shared/hd';
import { fakeState } from './fixtures';

const PAST = '2026-12-05', TODAY = '2026-12-10', LATER = '2026-12-14', YM = '2026-12';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: TODAY, newId: () => 'h' + ++n }).state;
function setup() {
  let s = run(fakeState(30), { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'Αξιωματικοί', services: [
    { id: 'a', name: 'Αξιωματικός Υπηρεσίας Διανυκτερεύων Μονάδος', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }, { id: 'b', name: 'Βοηθός', short: 'ΒΟΗ', perDay: 1, h24: true, hkCol: '' }] }],
    limits: { off: { base: 9, extra: 1 }, nco: { base: 9, extra: 1 } }, rest: 1, carry: true, fairHol: true } }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΑΛΦΑ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΛΟΣ', first: 'ΒΗΤΑ' } });
  const [cid, cid2] = s.cadreList.map(c => c.id);
  for (const c of [cid, cid2]) s = run(s, { t: 'setCadreDutyOf', cid: c, person: { group: 'g' } });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' });
  const b = blocksOf(s.settings).find(x => x.name === 'ΑΥΔΜ')!; const k = b.posts[0].k;
  const pid = (st: AppState, c: string) => pickPeople(st).find(p => p.cid === c)!.id;
  s = run(s, { t: 'assign', date: PAST, k, pid: pid(s, cid), cid });
  s = run(s, { t: 'assign', date: LATER, k, pid: pid(s, cid2), cid: cid2 });
  return { s, b, k, cid, cid2 };
}
const day = (s: AppState, cid: string, d: string) => { const i = monthIndex(s, YM); return personCells(s, s.cadreList.find(c => c.id === cid)!, i)[i.days.findIndex(x => x.d === d)]; };
function same(s0: AppState, s: AppState, cid: string) {
  expect(cellCode(day(s, cid, PAST))).toBe('ΑΥΔΜ');
  expect(hdRosterOn(s, PAST).aydm).toContain('ΣΤΕΛΕΧΟΣ');
  expect(dutySheet(s, YM).byPerson.find(r => r.name.startsWith('ΣΤΕΛΕΧΟΣ'))!.cells[4]).toBe('ΑΥΔΜ');
  expect(monthCount(s, cid, YM).done).toBe(1);                      // μία φορά, όχι θέση + εγγραφή
  expect((s.cadreDuties || []).filter(x => x.date === PAST)).toEqual((s0.cadreDuties || []).filter(x => x.date === PAST));   // ίδια εγγραφή (ίδιο id)
}

describe('Π1: η παλιά υπηρεσία «Μόνο στελέχη» μένει όπως έγινε', () => {
  it('αρχή: ΑΥΔΜ στο πρόγραμμα, στην ΗΔ και στο Excel', () => { const { s, cid } = setup(); same(s, s, cid); });
  it('ανενεργή υπηρεσία: η παλιά μέρα μένει ΑΥΔΜ· η μελλοντική θέση και η εγγραφή της φεύγουν μαζί· ξανά ενεργή: ίδια', () => {
    const { s: s0, b, k, cid, cid2 } = setup();
    const h = run(s0, { t: 'setBlock', phase: s0.settings.phase, id: b.id, patch: { hidden: true } });
    same(s0, h, cid);
    expect(h.guards[LATER]?.[k]).toBeUndefined(); expect((h.cadreDuties || []).some(x => x.date === LATER)).toBe(false); expect(monthCount(h, cid2, YM).done).toBe(0);
    const back = run(h, { t: 'setBlock', phase: h.settings.phase, id: b.id, patch: { hidden: false } });
    same(s0, back, cid);
  });
  it('άλλο έντυπο (ΣΒΕΝ → ΣΠΕΝ → ΣΒΕΝ): οι παλιές μέρες μένουν ΑΥΔΜ, και οι μελλοντικές', () => {
    const { s: s0, cid, cid2 } = setup();
    const sp = run(s0, { t: 'setPhase', phase: 'spen' });
    same(s0, sp, cid); expect(cellCode(day(sp, cid2, LATER))).toBe('ΑΥΔΜ'); expect(monthCount(sp, cid2, YM).done).toBe(1);
    same(s0, run(sp, { t: 'setPhase', phase: 'sven' }), cid);
  });
  it('η ανενεργή θέση δεν «κρατά» άτομο της υπηρεσίας στην αυτόματη συμπλήρωση του προγράμματος', () => {
    const { s: s0, b } = setup();
    let h = run(s0, { t: 'setBlock', phase: s0.settings.phase, id: b.id, patch: { hidden: true } });
    h = run(h, { t: 'setSettings', settings: { cadreDuty: { ...h.settings.cadreDuty!, rest: 0, limits: { off: { base: 40, extra: 0 }, nco: { base: 40, extra: 0 } } } }, text: 'χωρίς ανάπαυση' });   // 2 στελέχη, 2 υπηρεσίες τη μέρα
    const r = autoFill(h, YM, {});
    for (const d of ['2026-12-03', '2026-12-20']) expect(r.add.filter(x => x.svc === 'a' && x.date === d)).toHaveLength(1);
  });
  it('η υπηρεσία γίνεται «Στρατιώτες»: δεν είναι πια υπηρεσία στελεχών, η μέρα μετρά ως θέση στρατιωτών (Σ)', () => {
    const { s: s0, b, cid } = setup();
    const t = run(s0, { t: 'editBlock', phase: s0.settings.phase, id: b.id, name: 'ΑΥΔΜ', hrs: {}, who: 'soldiers' });
    expect(cellCode(day(t, cid, PAST))).toBe('Σ'); expect(monthCount(t, cid, YM).done).toBe(1);
  });
});
