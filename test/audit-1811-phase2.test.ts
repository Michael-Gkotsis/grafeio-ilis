// Έλεγχος 18/11, φάση 2: (Σ3) οι θέσεις στρατιωτών βλέπουν το πρόγραμμα στελεχών, (Σ4) στέλεχος σε υπηρεσία του προγράμματος με στήλη
// απόντων δεν είναι ΠΑΡΩΝ πουθενά (ΗΚΑΙ, οθόνη, ΣΤΕΛΕΧΗ.xlsx, Έντυπα), (Σ5) στρατιώτης σε υπηρεσία εκτός στρατοπέδου είναι ΑΠΩΝ και στα Έντυπα.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Cadre, type CadreDutyCfg } from '../src/shared/domain';
import { hkaiCounts, monthBlock, monthDuties, monthTxt, pickPeople, ruleBlock, seatMap, strengthOf, secondDuty } from '../src/shared/rules';
import { cadreSheets, cadreStateOn, cadreStatusOn } from '../src/shared/cadre';
import { absenceOfCadre, absenceOfPerson } from '../src/shared/absence';
import { candidates, fieldValue } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'a' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [
    { id: 'g1', name: 'ΑΥΔΜ', services: [{ id: 's1', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: 'yp' }] },
    { id: 'g2', name: 'Φυλάκιο ποταμού', services: [{ id: 's3', name: 'Δ/ντης φυλακίου', short: 'Φ', perDay: 1, h24: true, hkCol: 'fyl' }, { id: 's4', name: 'Ημερήσια πύλη', short: 'ΗΠ', perDay: 1, h24: false, hkCol: '' }] }
  ],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
function base(monthMax?: number) {
  let s = fakeState(30);
  s = run(s, { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΛΟΧΙΑΣ', first: 'ΒΗΤΑΣ', ...(monthMax ? { monthMax } : {}) } });
  return { s, c: s.cadreList[0] };
}
const duty = (s: AppState, c: Cadre, date: string, svc: string) => run(s, { t: 'saveCadreDuty', duty: { date, svc, cid: c.id } });
const pickId = (s: AppState, c: Cadre) => pickPeople(s).find(p => p.cid === c.id)!.id;
const seat = (s: AppState, c: Cadre, date: string, k: string, force?: string) => run(s, { t: 'assign', date, k, pid: pickId(s, c), cid: c.id, ...(force ? { force } : {}) });
const limit = (s: AppState, c: Cadre, person: object) => run(s, { t: 'setCadreDutyOf', cid: c.id, person });

describe('Σ3: θέση στρατιωτών και πρόγραμμα στελεχών', () => {
  it('μετρητής: 3 υπηρεσίες προγράμματος (μία σήμερα) μετρούν στο «N από M τον μήνα» και στο όριο', () => {
    let { s, c } = base(2);
    s = duty(s, c, '2026-11-05', 's1'); s = duty(s, c, '2026-11-10', 's1'); s = duty(s, c, D, 's1');
    const p = pickPeople(s).find(x => x.cid === c.id)!;
    expect(monthTxt(s, '2026-11-20', p)).toBe('3 από 2 τον μήνα');
    expect(monthTxt(s, D, p)).toBe('2 από 2 τον μήνα');             // επιλογή: η μέρα που διαλέγεις δεν μετρά
    expect(monthTxt(s, D, p, true)).toBe('3 από 2 τον μήνα');        // καρτέλα: μετρά και η σημερινή
    expect(monthDuties(s, '2026-11-20', p.id)).toBe(3);
    expect(monthTxt(s, '2026-12-02', p)).toBe('0 από 2 τον μήνα');   // άλλος μήνας
    expect(monthBlock(s, '2026-11-20', p.id)).toMatch(/3 από 2/);
  });
  it('μαζί με θέσεις στρατιωτών: προστίθενται', () => {
    let { s, c } = base(4);
    s = duty(s, c, '2026-11-05', 's1'); s = seat(s, c, '2026-11-12', 'th1');
    expect(monthDuties(s, '2026-11-20', seatMap(s).get(s.cadreList[0].pid!)!.id)).toBe(2);
  });
  it('χωρίς πρόγραμμα: όπως πριν (μέτρηση και κανόνες)', () => {
    let { s, c } = base(2);
    const id = pickId(s, c);
    expect(monthDuties(s, D, id)).toBe(0);
    expect(ruleBlock(s, D, id, undefined, 'th1')).toBeNull();
    s = seat(s, c, '2026-11-05', 'th1');
    expect(monthDuties(s, D, s.cadreList[0].pid!)).toBe(1);
  });
  it('⚠ ίδια μέρα με υπηρεσία προγράμματος: δεν μπλοκάρει, μπαίνει στη σημείωση', () => {
    let { s, c } = base();
    s = duty(s, c, '2026-11-20', 's1');
    expect(secondDuty(s, '2026-11-20', pickId(s, c), 'th1')).toMatch(/Έχει ήδη υπηρεσία ΑΥΔΜ αυτή τη μέρα/);
    const r = apply(s, { t: 'assign', date: '2026-11-20', k: 'th1', pid: pickId(s, c), cid: c.id }, { today: D, newId: () => 'z' });
    expect(r.text).toMatch(/πρόγραμμα στελεχών/);
    expect(secondDuty(s, '2026-11-21', pickId(s, c), 'th1')).toBeNull();
  });
  it('⚠ ανάπαυση μετά από υπηρεσία προγράμματος (cfg.rest, πριν και μετά): ζητά αιτία', () => {
    let { s, c } = base();
    s = duty(s, c, '2026-11-20', 's1');
    const id = pickId(s, c);
    expect(ruleBlock(s, '2026-11-21', id, undefined, 'th1')).toMatch(/Ανάπαυση: έχει υπηρεσία 20\/11/);
    expect(ruleBlock(s, '2026-11-19', id, undefined, 'th1')).toMatch(/Ανάπαυση: έχει υπηρεσία 20\/11/);
    expect(ruleBlock(s, '2026-11-22', id, undefined, 'th1')).toBeNull();
    expect(() => seat(s, c, '2026-11-21', 'th1')).toThrow(/Ανάπαυση/);
    expect(() => seat(s, c, '2026-11-21', 'th1', 'ανάγκη')).not.toThrow();
  });
  it('⚠ «Δεν θέλει υπηρεσία» και περιορισμοί (καμία / μόνο / όχι 24ωρες / μέρα εβδομάδας)', () => {
    const { s, c } = base(); const id = pickId(s, c);
    const nd = run(s, { t: 'setCadreNoDuty', cid: c.id, from: '2026-11-20', to: '2026-11-22', note: 'γάμος' });
    expect(ruleBlock(nd, '2026-11-21', id, undefined, 'th1')).toBe('Δεν θέλει υπηρεσία (γάμος)');
    expect(ruleBlock(nd, '2026-11-23', id, undefined, 'th1')).toBeNull();
    expect(ruleBlock(limit(s, c, { none: {} }), D, id, undefined, 'th1')).toMatch(/Ελαφράς: καμία υπηρεσία/);
    expect(ruleBlock(limit(s, c, { none: { until: '2026-11-16' } }), D, id, undefined, 'th1')).toBeNull();
    expect(ruleBlock(limit(s, c, { only: { services: ['s4'] } }), D, id, undefined, 'th1')).toMatch(/Ελαφράς: μόνο ΗΠ/);
    expect(ruleBlock(limit(s, c, { no24: { why: 'μητέρα' } }), D, id, undefined, 'th1')).toMatch(/Όχι 24ωρες \(μητέρα\)/);
    expect(ruleBlock(limit(s, c, { noDow: [2] }), D, id, undefined, 'th1')).toBe('Δεν θέλει τρίτη');   // 17/11/2026 = Τρίτη
    expect(ruleBlock(limit(s, c, { noDow: [3] }), D, id, undefined, 'th1')).toBeNull();
    expect(() => seat(limit(s, c, { none: {} }), c, D, 'th1')).toThrow(/Ελαφράς/);
  });
  it('οι στρατιώτες δεν επηρεάζονται', () => {
    const { s } = base();
    expect(ruleBlock(s, D, 1, undefined, 'th1')).toBeNull();
    expect(secondDuty(s, D, 1, 'th1')).toBeNull();
  });
});

describe('Σ4: στέλεχος σε υπηρεσία προγράμματος με στήλη απόντων', () => {
  it('ίδια κατάσταση με την ΗΚΑΙ σε οθόνη, ΣΤΕΛΕΧΗ.xlsx, Έντυπα· χωρίς στήλη = ΠΑΡΩΝ· δηλωμένη κατάσταση νικά', () => {
    let { s, c } = base();
    s = duty(s, c, D, 's3'); s = duty(s, c, '2026-11-18', 's4'); s = duty(s, c, '2026-11-19', 's1');
    expect(hkaiCounts(s, D).cadre.fyl!.map(x => x.id)).toEqual([c.id]);           // η ΗΚΑΙ: απών στη στήλη Φυλ.
    const st = cadreStateOn(s, c.id, D)!;
    expect(st.col).toBe('fyl'); expect(st.group).toBe('apo'); expect(st.label).toBe('Δ/ντης φυλακίου');
    expect(cadreStatusOn(s, c.id, D)).toBeUndefined();                              // οι κανόνες του προγράμματος δεν αλλάζουν
    const sh = cadreSheets(s, D)[0]; const k = sh.head.indexOf('ΚΑΤΑΣΤΑΣΗ');
    const row = (d: string) => cadreSheets(s, d)[0].rows[0];
    expect(row(D)[k]).toBe('Δ/ντης φυλακίου'); expect(row(D)[k + 1]).toBe('17/11/2026');
    expect(row('2026-11-18')[k]).toBe('ΠΑΡΩΝ');                                      // ΗΠ: χωρίς στήλη ΗΚΑΙ
    expect(row('2026-11-19')[k]).toBe('ΑΥΔΜ');                                       // yp = κωλυόμενος, όπως η ΗΚΑΙ
    expect(row('2026-11-20')[k]).toBe('ΠΑΡΩΝ');
    expect(absenceOfCadre(s, c, D)).toEqual({ absent: true, reason: 'Δ/ΝΤΗΣ ΦΥΛΑΚΙΟΥ', ret: '' });
    expect(absenceOfCadre(s, c, '2026-11-18').absent).toBe(false);
    expect(fieldValue(s, 'cadre', c, 'status', 0, D)).toBe('Δ/ντης φυλακίου');
    expect(fieldValue(s, 'cadre', c, 'absent', 0, D)).toBe('ΝΑΙ');
    expect(fieldValue(s, 'cadre', c, 'status', 0, '2026-11-18')).toBe('');
    // φίλτρο «Παρών»: με υπηρεσία δεν περνά
    const pk = (d: string) => (candidates(s, { kind: 'cadre', pick: { from: 'present' } } as never, d) as Cadre[]).map(x => x.id);
    expect(pk(D)).toEqual([]); expect(pk('2026-11-18')).toEqual([c.id]);
    // δηλωμένη κατάσταση (άδεια) νικά, όπως στην ΗΚΑΙ
    const t = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'ka', from: D, to: D }, replace: false });
    expect(cadreStateOn(t, c.id, D)!.col).toBe('ka'); expect(cadreStateOn(t, c.id, D)!.roster).toBeUndefined();
  });
});

describe('Σ5: στρατιώτης σε υπηρεσία εκτός στρατοπέδου', () => {
  function camp(hkCol?: string) {
    let k = 0; const r = (st: AppState, c: Command) => apply(st, c, { today: D, newId: () => 'b' + ++k }).state;
    let s = fakeState(14);
    s = r(s, { t: 'addBlock', phase: s.settings.phase, name: 'Φυλάκιο Ποταμού', kind: 'other', armed: false, n: 1, per: 2, hrs: '15:00-22:00', ...(hkCol ? { hkCol } : {}) });
    const post = blocksOf(s.settings).find(b => b.name === 'Φυλάκιο Ποταμού')!;
    return { s: { ...s, guards: { ...s.guards, [D]: { [post.posts[0].k]: 1 } } } as AppState };
  }
  it('η στήλη ΑΠΩΝ συμφωνεί με το strengthOf και το φίλτρο «Παρών»', () => {
    const { s } = camp('fyl'); const pm = new Map(s.people.map(p => [p.id, p]));
    const present = new Set(strengthOf(s, D).lists.present.map(p => p.id));
    expect(present.has(1)).toBe(false);
    expect(absenceOfPerson(s, pm.get(1)!, D)).toEqual({ absent: true, reason: 'ΥΠΗΡΕΣΙΑ ΕΚΤΟΣ', ret: '' });
    expect(fieldValue(s, 'people', pm.get(1)!, 'absent', 0, D)).toBe('ΝΑΙ');
    expect(absenceOfPerson(s, pm.get(2)!, D).absent).toBe(false);                  // άλλος στρατιώτης
    expect(absenceOfPerson(s, pm.get(1)!, '2026-11-18').absent).toBe(false);       // άλλη μέρα
    const flt = new Set((candidates(s, { kind: 'people', pick: { need: ['present'] } } as never, D) as { id: number }[]).map(p => p.id));
    expect(flt.has(1)).toBe(false); expect(flt.has(2)).toBe(true);
    for (const p of s.people) expect(absenceOfPerson(s, p, D).absent).toBe(!present.has(p.id));
  });
  it('υπηρεσία στη στήλη κωλυομένων ή χωρίς στήλη: παρών, όπως πριν· η άδεια νικά', () => {
    const k = camp('kin'); const n0 = camp(); const pm = new Map(k.s.people.map(p => [p.id, p]));
    expect(absenceOfPerson(k.s, pm.get(1)!, D).absent).toBe(false);
    expect(absenceOfPerson(n0.s, pm.get(1)!, D).absent).toBe(false);
    const a = camp('fyl');
    const withLeave: AppState = { ...a.s, statuses: [{ id: 'l1', pid: 1, type: 'LEAVE', kind: 'Κανονική', from: D, to: D } as never] };
    expect(absenceOfPerson(withLeave, pm.get(1)!, D).reason).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ');
  });
});
