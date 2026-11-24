// Θέση «μόνο για στελέχη» που έβαλες με το χέρι στις Υπηρεσίες (Michael, 24/11): στο πρόγραμμα των στελεχών φαίνεται και μετρά ως η υπηρεσία
// στελεχών που αντιστοιχεί (ΑΥΔΜ), όχι ως «Σ». Ο κωδικός της θέσης (Y22) δεν παίζει ρόλο: η αντιστοιχία είναι «Μετρά ως υπηρεσία» (cadreAs,
// αλλιώς η πρώτη υπηρεσία της ομάδας). Οι άλλες θέσεις στρατιωτών μένουν «Σ». Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type CadreDutyCfg } from '../src/shared/domain';
import { pickPeople, postsOf } from '../src/shared/rules';
import { cellCode, dutyIndex, monthCount, personCells } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { dutySheet } from '../src/shared/cadreDuty';
import { fakeState } from './fixtures';

const D = '2026-12-05';
const YM = '2026-12';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-01', newId: () => 'q' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [
    { id: 'a', name: 'Αξιωματικός Υπηρεσίας Διανυκτερεύων Μονάδος', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' },
    { id: 'b', name: 'Βοηθός ΑΥΔΜ', short: 'ΒΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 3, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
function setup(as?: string): { s: AppState; k: string; cid: string } {
  let s = run(fakeState(40), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  const cid = s.cadreList[0].id; s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g', ...(as ? { cadreAs: as } : {}) });
  return { s, k: blocksOf(s.settings).find(b => b.name === 'ΑΥΔΜ')!.posts[0].k, cid };
}
const put = (s: AppState, cid: string, k: string, date = D) => run(s, { t: 'assign', date, k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid });
const cellOn = (s: AppState, cid: string, date = D) => { const i = monthIndex(s, YM); return personCells(s, s.cadreList.find(c => c.id === cid)!, i)[i.days.findIndex(d => d.d === date)]; };

describe('θέση «μόνο για στελέχη» στο πρόγραμμα των στελεχών', () => {
  it('φαίνεται ως η πρώτη υπηρεσία της ομάδας (ΑΥΔΜ), όχι «Σ», και μετρά στον μήνα', () => {
    const { s: s0, k, cid } = setup(); const s = put(s0, cid, k);
    const x = cellOn(s, cid); expect(x.seat).toHaveLength(1); expect(x.seat[0].svc?.short).toBe('ΑΥΔΜ');
    expect(cellCode(x)).toBe('ΑΥΔΜ');
    expect(monthCount(s, cid, YM).done).toBe(1);
  });
  it('«Μετρά ως υπηρεσία»: η δεύτερη υπηρεσία της ομάδας δίνει τον κωδικό της', () => {
    const { s: s0, k, cid } = setup('b'); const s = put(s0, cid, k);
    expect(cellCode(cellOn(s, cid))).toBe('ΒΑΥΔΜ');
  });
  it('ο κωδικός της θέσης στις Υπηρεσίες (Y22…) δεν επηρεάζει την αντιστοιχία', () => {
    const { s: s0, k, cid } = setup(); expect(k).toMatch(/\d/);
    const code = cellCode(cellOn(put(s0, cid, k), cid)); expect(code).toBe('ΑΥΔΜ'); expect(code).not.toBe(k);
  });
  it('θέση στρατιωτών που δεν είναι «μόνο στελέχη»: μένει «Σ»', () => {
    const { s: s0, cid } = setup(); const plain = postsOf(s0.settings).find(p => !blocksOf(s0.settings).find(b => b.id === p.block)?.who)!;
    const s = put(s0, cid, plain.k); const x = cellOn(s, cid);
    expect(x.seat[0].svc).toBeUndefined(); expect(cellCode(x)).toBe('Σ'); expect(monthCount(s, cid, YM).done).toBe(1);
  });
  it('αλλαγή του «Μετρά ως» αλλάζει αμέσως τον κωδικό (το ευρετήριο δεν μένει παλιό)', () => {
    const { s: s0, k, cid } = setup(); const s = put(s0, cid, k); expect(cellCode(cellOn(s, cid))).toBe('ΑΥΔΜ');
    const id = blocksOf(s.settings).find(b => b.name === 'ΑΥΔΜ')!.id;
    const t = run(s, { t: 'editBlock', phase: s.settings.phase, id, name: 'ΑΥΔΜ', hrs: {}, who: 'cadre', cadreGroup: 'g', cadreAs: 'b' });
    expect(cellCode(cellOn(t, cid))).toBe('ΒΑΥΔΜ'); expect(dutyIndex(t).get(cid)!.get(D)!.seat[0].svc?.id).toBe('b');
  });
  it('το Excel του προγράμματος στελεχών γράφει ΑΥΔΜ στη μέρα της θέσης', () => {
    const { s: s0, k, cid } = setup(); const s = put(s0, cid, k);
    const sheet = dutySheet(s, YM); const row = sheet.byPerson.find(r => r.name.includes('ΣΤΕΛΕΧΟΣ'))!;
    expect(row.cells[+D.slice(8) - 1]).toBe('ΑΥΔΜ');
  });
});
