// Sweep 17/11: cadre duty roster and its autofill (#344, #345) over many random months. The autofill result is checked against the
// same rules the screen uses (eligibility): every duty it adds must be allowed, every slot it leaves empty must have nobody allowed,
// and a second run must add nothing. Plus the month counts against a plain day-by-day count. Fake names only.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { addDays, weekday, type ISODate } from '../src/shared/dates';
import type { AppState, CadreDutyCfg, CadreService } from '../src/shared/domain';
import { pickPeople, isHol } from '../src/shared/rules';
import { RESTRICTION_CODES, autoFill, dutySheet, eligibility, monthCheck, monthCount, monthLimit, serviceOf, dutyCfgOf } from '../src/shared/cadreDuty';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'w' + ++n }).state;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, l: T[]): T => l[Math.floor(r() * l.length)];
const days = (ym: string) => { const o: ISODate[] = []; for (let d = ym + '-01'; d.startsWith(ym); d = addDays(d, 1)) o.push(d); return o; };
const HARD = [...RESTRICTION_CODES, 'rest', 'same', 'seat', 'full', 'over2'];

function randomWorld(seed: number) {
  const r = rng(seed);
  const svc = (g: string, i: number): CadreService => ({ id: g + 's' + i, name: 'ΥΠΗΡΕΣΙΑ ' + g + i, short: g + i, perDay: pick(r, [1, 1, 1, 2]), h24: r() < 0.7, hkCol: '',
    ...(r() < 0.15 ? { offOnly: true } : {}), ...(r() < 0.25 ? { days: [...new Set([pick(r, [0, 1, 2, 3, 4, 5, 6]), pick(r, [0, 1, 2, 3, 4, 5, 6]), pick(r, [0, 6])])] } : {}) });
  const groups = ['Α', 'Β'].slice(0, r() < 0.5 ? 1 : 2).map(g => ({ id: g, name: 'ΟΜΑΔΑ ' + g, services: Array.from({ length: 1 + Math.floor(r() * 2) }, (_, i) => svc(g, i)) }));
  const cfg: CadreDutyCfg = { groups, limits: { off: { base: pick(r, [2, 3, 4]), extra: pick(r, [0, 1]) }, nco: { base: pick(r, [3, 4, 5]), extra: pick(r, [0, 1, 2]) } }, rest: pick(r, [0, 1, 1, 2]), carry: r() < 0.7, fairHol: r() < 0.8 };
  let s = run(fakeState(30), { t: 'setSettings', settings: { cadreDuty: cfg }, text: 'δοκιμή' });
  const RANKS = [['ΛΧΙΑΣ', 'Λοχίες'], ['ΕΠΧΙΑΣ', 'Επιλοχίες'], ['ΥΠΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΤΧΗΣ', 'Ίλαρχοι-Λοχαγοί']];
  const k = 4 + Math.floor(r() * 9);
  for (let i = 0; i < k; i++) { const [rank, hk] = pick(r, RANKS); s = run(s, { t: 'saveCadre', cadre: { rank, hk, last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(913 + i), first: 'Τ' + i, ...(r() < 0.3 ? { monthMax: 2 } : {}) } as any }); }
  const ym = pick(r, ['2026-12', '2027-01', '2027-02', '2026-04']);
  for (const c of s.cadreList) {
    const person: any = { group: pick(r, groups).id };
    if (r() < 0.1) person.limit = pick(r, [0, 1, 6]);
    if (r() < 0.08) person.none = r() < 0.5 ? {} : { until: ym + '-1' + Math.floor(r() * 9) };
    if (r() < 0.1) person.only = { services: [pick(r, groups.flatMap(g => g.services)).id] };
    if (r() < 0.1) person.no24 = { why: 'ΜΗΤΕΡΑ' };
    if (r() < 0.15) person.noDow = [pick(r, [0, 1, 2, 3, 4, 5, 6])];
    if (r() < 0.1) { s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: {} as any }); continue; }   // no group at all
    s = run(s, { t: 'setCadreDutyOf', cid: c.id, person });
    if (r() < 0.35) { const from = addDays(ym + '-01', Math.floor(r() * 26) - 3); s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(r, ['ka', 'amd', 'apal', 'yp', 'nos']), from, to: addDays(from, Math.floor(r() * 7)) }, replace: true }); }
    if (r() < 0.2) { const from = addDays(ym + '-01', Math.floor(r() * 26)); s = run(s, { t: 'setCadreNoDuty', cid: c.id, from, to: addDays(from, Math.floor(r() * 3)) }); }
    if (r() < 0.1) s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList.find(x => x.id === c.id)!, active: false } });
  }
  // a few cadre in soldier seats (manual) and a few hand-made roster duties, also in the previous month (carry)
  const seats = pickPeople(s).filter(p => p.cid);
  for (let i = 0; i < 3 && seats.length; i++) { const p = pick(r, seats); s = run(s, { t: 'assign', date: addDays(ym + '-01', Math.floor(r() * 28)), k: 'ly', pid: p.id, cid: p.cid, force: 'ΤΕΣΤ' } as any); }
  const allSvc = groups.flatMap(g => g.services);
  for (let i = 0; i < 4; i++) { const c = pick(r, s.cadreList); const v = pick(r, allSvc); s = run(s, { t: 'saveCadreDuty', duty: { cid: c.id, svc: v.id, date: addDays(ym + '-01', Math.floor(r() * 28) - (r() < 0.5 ? 31 : 0)), why: 'ΜΕ ΤΟ ΧΕΡΙ' } }); }
  return { s, ym, cfg };
}

describe('Αυτόματη συμπλήρωση υπηρεσιών στελεχών: 250 τυχαίοι μήνες', () => {
  it('ό,τι βάζει επιτρέπεται, ό,τι αφήνει κενό δεν το παίρνει κανείς, δεύτερη φορά δεν βάζει τίποτα, ντετερμινιστική', () => {
    let filled = 0, left = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const { s, ym } = randomWorld(seed);
      const r1 = autoFill(s, ym), r2 = autoFill(s, ym);
      expect(r2, 'seed ' + seed).toEqual(r1);
      const t = r1.add.length ? run(s, { t: 'setCadreDuties', add: r1.add, del: [], text: 'δοκιμή' }) : s;
      const cfg = dutyCfgOf(t.settings);
      const added = (t.cadreDuties || []).filter(x => x.auto);
      expect(added.length).toBe(r1.add.length);
      for (const x of added) {
        const c = t.cadreList.find(y => y.id === x.cid)!;
        expect(c.active, 'seed ' + seed).toBe(true);
        const why = eligibility(t, c, x.date, serviceOf(cfg, x.svc)!.svc, { ignore: x.id }).filter(q => HARD.includes(q.code));
        expect(why.map(q => q.code + ' ' + x.date), 'seed ' + seed + ' ' + c.last).toEqual([]);
        const over = eligibility(t, c, x.date, serviceOf(cfg, x.svc)!.svc, { ignore: x.id }).some(q => q.code === 'over');
        if (over) expect(r1.extra.some(e => e.cid === x.cid), 'seed ' + seed + ' over without «+1»').toBe(true);
      }
      // per day and service: never more than perDay (counting what was there before)
      for (const v of cfg.groups.flatMap(g => g.services)) for (const d of days(ym)) {
        const k = (t.cadreDuties || []).filter(x => x.date === d && x.svc === v.id).length;
        const before = (s.cadreDuties || []).filter(x => x.date === d && x.svc === v.id).length;
        expect(k, 'seed ' + seed).toBeLessThanOrEqual(Math.max(v.perDay, before));
      }
      // what stays empty: no active group member could take it (a hard reason, or already at limit + extra)
      for (const e of r1.empty) {
        const g = cfg.groups.find(x => x.services.some(v => v.id === e.svc))!; const v = serviceOf(cfg, e.svc)!.svc;
        for (const c of t.cadreList.filter(c => c.active && t.cadreDutyOf?.[c.id]?.group === g.id)) {
          const why = eligibility(t, c, e.date, v).filter(q => HARD.includes(q.code));
          expect(why.length, 'seed ' + seed + ' ' + e.date + ' ' + e.svc + ' ' + c.last + ' was free').toBeGreaterThan(0);
        }
      }
      expect(autoFill(t, ym).add, 'seed ' + seed + ' second run').toEqual([]);
      // the month check agrees: nothing broken by the autofill, empty days are exactly the reported ones
      const chk = monthCheck(t, ym);
      expect(chk.broken.filter(b => added.some(x => x.cid === b.c.id && x.date === b.d)), 'seed ' + seed).toEqual([]);
      const emptyN = chk.empty.reduce((a, x) => a + x.missing, 0);
      expect(emptyN, 'seed ' + seed).toBe(r1.empty.length);
      filled += r1.add.length; left += r1.empty.length;
    }
    expect(filled).toBeGreaterThan(1000); expect(left).toBeGreaterThan(0);
  });

  it('μήνας χωρίς περιορισμούς: ΣΚ/αργίες ίσες (διαφορά το πολύ 1) και σύνολα σχεδόν ίσα (διαφορά το πολύ 2, η μεταφορά τα φέρνει ίσα τον επόμενο μήνα)', () => {
    for (let k = 4; k <= 12; k++) for (const ym of ['2026-12', '2027-02', '2027-08']) {
      let s = run(fakeState(10), { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'ΠΥΛΗ', services: [{ id: 'v', name: 'ΠΥΛΗ', short: 'Π', perDay: 1, h24: true, hkCol: '' }] }], limits: { off: { base: 9, extra: 2 }, nco: { base: 9, extra: 2 } }, rest: 1, carry: false, fairHol: true } }, text: 'δοκιμή' });
      for (let i = 0; i < k; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΙΣΟΣ' + String.fromCharCode(913 + i), first: 'Χ' } as any });
      for (const c of s.cadreList) s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
      const r = autoFill(s, ym);
      const per = s.cadreList.map(c => r.add.filter(x => x.cid === c.id).length);
      const hol = s.cadreList.map(c => r.add.filter(x => x.cid === c.id && isHol(s.settings, x.date)).length);
      if (k * 9 >= days(ym).length) {
        expect(r.empty, k + ' ' + ym).toEqual([]);
        expect(Math.max(...per) - Math.min(...per), k + ' ' + ym + ' ' + per).toBeLessThanOrEqual(2);
        expect(Math.max(...hol) - Math.min(...hol), k + ' ' + ym + ' ΣΚ ' + hol).toBeLessThanOrEqual(1);
      }
      // rest 1: never two days in a row
      for (const c of s.cadreList) { const ds = r.add.filter(x => x.cid === c.id).map(x => x.date).sort(); for (let i = 1; i < ds.length; i++) expect(ds[i] > addDays(ds[i - 1], 1)).toBe(true); }
    }
  });

  it('4 μήνες στη σειρά (Δεκ–Μαρ), 4 έως 12 άτομα: ΣΚ/αργίες ίσα (διαφορά ≤ 1, πριν το sweep έβγαινε 2 και 12), σύνολα διαφορά ≤ 2', () => {
    for (let k = 4; k <= 12; k++) {
      let s = run(fakeState(10), { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'ΠΥΛΗ', services: [{ id: 'v', name: 'ΠΥΛΗ', short: 'Π', perDay: 1, h24: true, hkCol: '' }] }], limits: { off: { base: 9, extra: 2 }, nco: { base: Math.ceil(31 / k), extra: 1 } }, rest: 1, carry: true, fairHol: true } }, text: 'δοκιμή' });
      for (let i = 0; i < k; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΙΣΟΣ' + String.fromCharCode(913 + i), first: 'Χ' } as any });
      for (const c of s.cadreList) s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
      for (const ym of ['2026-12', '2027-01', '2027-02', '2027-03']) { const r = autoFill(s, ym); expect(r.empty, k + ' ' + ym).toEqual([]); s = run(s, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή' }); }
      const per = s.cadreList.map(c => (s.cadreDuties || []).filter(x => x.cid === c.id).length);
      const hol = s.cadreList.map(c => (s.cadreDuties || []).filter(x => x.cid === c.id && isHol(s.settings, x.date)).length);
      expect(Math.max(...hol) - Math.min(...hol), k + ' ΣΚ ' + hol).toBeLessThanOrEqual(1);
      expect(Math.max(...per) - Math.min(...per), k + ' ' + per).toBeLessThanOrEqual(2);
    }
  });

  it('το μέτρημα του μήνα ίσο με μέτρημα μέρα-μέρα (πρόγραμμα + θέσεις στρατιωτών), και το Excel με κεφαλαία', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const { s: s0, ym } = randomWorld(500 + seed);
      const r = autoFill(s0, ym); const s = r.add.length ? run(s0, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή' }) : s0;
      for (const c of s.cadreList) {
        const cnt = monthCount(s, c.id, ym);
        const roster = (s.cadreDuties || []).filter(x => x.cid === c.id && x.date.startsWith(ym)).length;
        let seat = 0; if (c.pid != null) for (const d of days(ym)) seat += Object.values(s.guards[d] || {}).filter(v => v === c.pid).length;
        expect(cnt.roster, 'seed ' + seed).toBe(roster); expect(cnt.seat, 'seed ' + seed).toBe(seat); expect(cnt.done).toBe(roster + seat);
        const lim = monthLimit(s, c, ym); expect(lim.effBase).toBe(Math.max(0, lim.base + lim.carry));
      }
      const sh = dutySheet(s, ym);
      for (const row of sh.byPerson) { expect(row.cells).toHaveLength(days(ym).length); for (const v of [row.rank, row.name, row.group, row.limit, ...row.cells]) expect(v).toBe(upper(v)); }
      for (const row of sh.byDay) { expect(row.svc).toBe(upper(row.svc)); expect(row.who).toBe(upper(row.who)); const v = dutyCfgOf(s.settings).groups.flatMap(g => g.services).find(x => upper(x.name) === row.svc)!; expect(!v.days?.length || v.days.includes(weekday(row.date.split('/').reverse().join('-')))).toBe(true); }
    }
  });
});
