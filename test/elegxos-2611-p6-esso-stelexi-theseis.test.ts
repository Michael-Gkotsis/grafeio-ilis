// Νέα ΕΣΣΟ: οι υπηρεσίες στελεχών σε θέσεις (guards με αρνητικό pid) μένουν, ώστε οι απαλλαγές να μην αλλάζουν. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { apalLedger } from '../src/shared/cadreBalance';
import { freshState } from '../src/shared/esso';
import { fakeState } from './fixtures';

const D1 = '2026-12-05', D2 = '2026-12-06', TODAY = '2026-12-20';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-01', newId: () => 'q' + ++n }).state;
const CFG: any = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [{ id: 'a', name: 'Αξιωματικός Υπηρεσίας', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 3, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
function base() {
  let s = run(fakeState(40), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  const cid = s.cadreList[0].id;
  s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } });
  const addB = (name: string, only: boolean) => { s = run(s, only ? { t: 'addBlock', phase: s.settings.phase, name, armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' } : { t: 'addBlock', phase: s.settings.phase, name, armed: false, n: 1, hrs: '' }); return blocksOf(s.settings).find(b => b.name === name)!.posts[0].k; };
  const kSoldier = addB('ΘΕΣΗ1', false), kOnly = addB('ΑΥΔΜ', true);
  return { s, cid, kSoldier, kOnly };
}
const seat = (s: AppState, cid: string, d: string, k: string) => run(s, { t: 'assign', date: d, k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid });
const ledger = (s: AppState, cid: string) => apalLedger(s, s.cadreList.find(c => c.id === cid)!, TODAY).map(({ id: _i, ...r }) => r);
const fresh = (s: AppState) => freshState(s, { s: 'Δ', y: 2026 }, '2026-12-10', 'C:\\Νέος');

describe('Νέα ΕΣΣΟ: υπηρεσίες στελεχών σε θέσεις', () => {
  it('(α) στέλεχος σε θέση στρατιώτη: ίδιες απαλλαγές', () => {
    const { s: s0, cid, kSoldier } = base(); const s = seat(s0, cid, D1, kSoldier);
    expect(ledger(s, cid).filter(x => x.kind === 'duty')).toHaveLength(1);
    expect(ledger(fresh(s), cid)).toEqual(ledger(s, cid));
  });
  it('(β) θέση «μόνο στελέχη» με συνδεδεμένη γραμμή: ίδιες, μία φορά', () => {
    const { s: s0, cid, kOnly } = base(); const s = seat(s0, cid, D1, kOnly);
    expect(s.cadreDuties?.[0]?.via).toBe(kOnly);
    const f = fresh(s);
    expect(ledger(f, cid)).toEqual(ledger(s, cid)); expect(ledger(f, cid).filter(x => x.kind === 'duty')).toHaveLength(1);
    // μετά από αλλαγή ρυθμίσεων (syncLinked) δεν σβήνει ούτε διπλασιάζει
    const r = run(f, { t: 'setSettings', settings: { rest: 2 } as any, text: 'δοκιμή' });
    expect(ledger(r, cid)).toEqual(ledger(s, cid)); expect(r.cadreDuties).toHaveLength(1);
  });
  it('(γ) γραμμή προγράμματος χωρίς via: ίδιες', () => {
    const { s: s0, cid } = base(); const s: AppState = { ...s0, cadreDuties: [{ id: 'd1', date: D2, svc: 'a', cid }] };
    expect(ledger(fresh(s), cid)).toEqual(ledger(s, cid));
  });
  it('όλα μαζί· οι φρουρές στρατιωτών φεύγουν, του στελέχους μένουν· η παλιά κατάσταση δεν αλλάζει', () => {
    const { s: s0, cid, kSoldier, kOnly } = base();
    let s = seat(seat(s0, cid, D1, kSoldier), cid, D2, kOnly);
    s = run(s, { t: 'assign', date: '2026-12-07', k: kSoldier, pid: 3 } as any);
    const before = JSON.stringify(s); const f = fresh(s);
    expect(JSON.stringify(s)).toBe(before);
    const pids = Object.values(f.guards).flatMap(g => Object.values(g));
    expect(pids.length).toBeGreaterThan(0); expect(pids.every(p => (p as number) < 0)).toBe(true);
    expect(f.guards['2026-12-07']).toBeUndefined();
    expect(ledger(f, cid)).toEqual(ledger(s, cid));
  });
});
