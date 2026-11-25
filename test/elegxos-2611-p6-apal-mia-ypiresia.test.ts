// Μία υπηρεσία στελέχους σε θέση «μόνο στελέχη» δίνει μία απαλλαγή, όχι δύο. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type CadreDutyCfg } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { apalLedger } from '../src/shared/cadreBalance';
import { fakeState } from './fixtures';

const D = '2026-12-05';
const TODAY = '2026-12-20';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-01', newId: () => 'q' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [{ id: 'a', name: 'Αξιωματικός Υπηρεσίας', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 3, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
function setup(cadreOnly: boolean) {
  let s = run(fakeState(40), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  const cid = s.cadreList[0].id;
  s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } });
  s = run(s, cadreOnly ? { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' } : { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '' });
  const k = blocksOf(s.settings).find(b => b.name === 'ΑΥΔΜ')!.posts[0].k;
  return { s, k, cid };
}
const seat = (s: AppState, cid: string, k: string) => run(s, { t: 'assign', date: D, k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid });
const ledger = (s: AppState, cid: string) => apalLedger(s, s.cadreList.find(c => c.id === cid)!, TODAY);

describe('απαλλαγές από υπηρεσίες στελεχών', () => {
  it('θέση «μόνο στελέχη» συνδεδεμένη με υπηρεσία: μία γραμμή, υπόλοιπο 1', () => {
    const { s: s0, k, cid } = setup(true); const s = seat(s0, cid, k);
    expect(s.cadreDuties).toHaveLength(1);
    const r = ledger(s, cid).filter(x => x.kind === 'duty');
    expect(r).toHaveLength(1); expect(ledger(s, cid).at(-1)!.left).toBe(1);
  });
  it('στέλεχος σε κανονική θέση στρατιώτη: μία', () => {
    const { s: s0, k, cid } = setup(false); const s = seat(s0, cid, k);
    const r = ledger(s, cid); expect(r.filter(x => x.kind === 'duty')).toHaveLength(1); expect(r.at(-1)!.left).toBe(1);
  });
  it('υπηρεσία μόνο στο πρόγραμμα: μία', () => {
    const { s: s0, cid } = setup(false); const s = run(s0, { t: 'saveCadreDuty', duty: { date: D, svc: 'a', cid } });
    const r = ledger(s, cid); expect(r.filter(x => x.kind === 'duty')).toHaveLength(1); expect(r.at(-1)!.left).toBe(1);
  });
});
