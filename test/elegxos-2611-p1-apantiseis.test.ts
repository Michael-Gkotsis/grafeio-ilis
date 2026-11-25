// Έλεγχος 25/11, Π1: απάντηση του Michael (25/11) «Στην αλλαγή ας αλλάζουν, αλλά και vice versa»: αλλάζεις υπηρεσία από «Στρατιώτες» σε «Μόνο στελέχη» και πίσω,
// και οι παλιές μέρες αλλάζουν και προς τις δύο μεριές. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { cellCode, monthCount, personCells } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { hdRosterOn } from '../src/shared/hd';
import { fakeState } from './fixtures';

const D = '2026-12-05', YM = '2026-12';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-10', newId: () => 'a' + ++n }).state;

describe('Π1: «Στρατιώτες» ↔ «Μόνο στελέχη»: οι παλιές μέρες αλλάζουν και προς τις δύο μεριές', () => {
  function setup() {
    let s = run(fakeState(30), { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'Αξιωματικοί', services: [{ id: 'a', name: 'Αξιωματικός Υπηρεσίας Διανυκτερεύων Μονάδος', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }], limits: { off: { base: 9, extra: 1 }, nco: { base: 9, extra: 1 } }, rest: 1, carry: true, fairHol: true } }, text: 'δοκιμή' });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΑΛΦΑ' } });
    const cid = s.cadreList[0].id; s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } });
    s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΠΥΛΗ', armed: false, n: 2, hrs: '' });   // υπηρεσία στρατιωτών
    const b = blocksOf(s.settings).find(x => x.name === 'ΠΥΛΗ')!;
    s = run(s, { t: 'assign', date: D, k: b.posts[0].k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid, force: 'δοκιμή' });   // στέλεχος με το χέρι
    s = run(s, { t: 'assign', date: D, k: b.posts[1].k, pid: 4 });                                                                    // στρατιώτης
    return { s, b, cid };
  }
  const cell = (s: AppState, cid: string) => { const i = monthIndex(s, YM); return cellCode(personCells(s, s.cadreList.find(c => c.id === cid)!, i)[4]); };
  it('στρατιωτών → «Μόνο στελέχη»: η παλιά μέρα του στελέχους γίνεται ΑΥΔΜ στο πρόγραμμα και στην ΗΔ· ο στρατιώτης μένει', () => {
    const { s: s0, b, cid } = setup();
    expect(cell(s0, cid)).toBe('Σ'); expect(hdRosterOn(s0, D).aydm).toBe('');
    const s = run(s0, { t: 'editBlock', phase: s0.settings.phase, id: b.id, name: 'ΠΥΛΗ', hrs: {}, who: 'cadre', cadreGroup: 'g' });
    expect(cell(s, cid)).toBe('ΑΥΔΜ'); expect(hdRosterOn(s, D).aydm).toContain('ΣΤΕΛΕΧΟΣ'); expect(monthCount(s, cid, YM).done).toBe(1);
    expect(s.guards[D][b.posts[1].k]).toBe(4);
    // και πίσω σε στρατιώτες: ξανά «Σ», χωρίς εγγραφή στο πρόγραμμα, μετρά μία
    const t = run(s, { t: 'editBlock', phase: s.settings.phase, id: b.id, name: 'ΠΥΛΗ', hrs: {}, who: 'soldiers' });
    expect(cell(t, cid)).toBe('Σ'); expect(t.cadreDuties || []).toEqual([]); expect(monthCount(t, cid, YM).done).toBe(1);
  });
});
