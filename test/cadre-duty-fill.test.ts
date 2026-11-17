// Υπηρεσίες στελεχών, φάση 3β: αυτόματη συμπλήρωση μήνα (autoFill). Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Cadre, CadreDutyCfg } from '../src/shared/domain';
import { fillDay, pickPeople } from '../src/shared/rules';
import { autoFill, dutyCfgOf, eligibility, monthCheck, monthLimit, serviceOf } from '../src/shared/cadreDuty';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'f' + ++n }).state;
const YM = '2026-12';
const dd = (i: number) => YM + '-' + String(i).padStart(2, '0');
const mk = (cfg: Partial<CadreDutyCfg>) => run(fakeState(30), { t: 'setSettings', settings: { cadreDuty: cfg }, text: 'δοκιμή' });
const ONE: Partial<CadreDutyCfg> = { groups: [{ id: 'g', name: 'Πύλη', services: [{ id: 'sv', name: 'Πύλη', short: 'Π', perDay: 1, h24: true, hkCol: '' }] }], limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true };
// k υπαξιωματικοί στην ομάδα g
function team(cfg: Partial<CadreDutyCfg>, k: number, grp = 'g', hk = 'Λοχίες', rank = 'ΛΧΙΑΣ') {
  let s = mk(cfg);
  for (let i = 0; i < k; i++) s = run(s, { t: 'saveCadre', cadre: { rank, hk, last: 'ΕΠΩΝΥΜΟ' + String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26), first: 'ΟΝΟΜΑ' + i } });
  const ids = s.cadreList.map(c => c.id);
  for (const id of ids) s = run(s, { t: 'setCadreDutyOf', cid: id, person: { group: grp } });
  return s;
}
const apl = (s: AppState, ym = YM) => { const r = autoFill(s, ym); return { r, s: run(s, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή' }) }; };
const seat = (s: AppState, c: Cadre, date: string, k: string) => run(s, { t: 'assign', date, k, pid: pickPeople(s).find(p => p.cid === c.id)!.id, cid: c.id });
const cnt = (s: AppState, c: Cadre) => (s.cadreDuties || []).filter(x => x.cid === c.id).length;

describe('autoFill υπηρεσιών στελεχών', () => {
  it('γεμίζει μόνο τις κενές θέσεις και κρατά ό,τι υπάρχει (δικό σου ή αυτόματο)', () => {
    let s = team(ONE, 8); const [a] = s.cadreList;
    s = run(s, { t: 'saveCadreDuty', duty: { date: dd(3), svc: 'sv', cid: a.id, why: 'χειροκίνητη' } });
    const r = autoFill(s, YM);
    expect(r.add.some(x => x.date === dd(3))).toBe(false);
    expect(r.add).toHaveLength(30); expect(r.add.every(x => x.auto)).toBe(true);
    const t = run(s, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή' });
    expect(t.cadreDuties).toHaveLength(31); expect(t.cadreDuties!.find(x => x.date === dd(3))!.why).toBe('χειροκίνητη');
    expect(autoFill(t, YM).add).toEqual([]);                         // δεύτερη φορά: τίποτα να γεμίσει
    expect(monthCheck(t, YM).empty).toEqual([]);
  });
  it('σέβεται περιορισμούς: κατάσταση, δεν θέλει, noDow, ελαφράς, όχι 24ωρες, εκτός δύναμης', () => {
    let s = team(ONE, 6); const c = s.cadreList;
    s = run(s, { t: 'addCadreAbs', abs: { cid: c[0].id, kind: 'ka', from: dd(1), to: dd(31) }, replace: false });
    s = run(s, { t: 'setCadreDutyOf', cid: c[1].id, person: { group: 'g', none: {} } });
    s = run(s, { t: 'setCadreDutyOf', cid: c[2].id, person: { group: 'g', no24: {} } });
    s = run(s, { t: 'setCadreDutyOf', cid: c[3].id, person: { group: 'g', noDow: [0, 6] } });
    s = run(s, { t: 'setCadreDutyOf', cid: c[4].id, person: { group: 'g', only: { services: ['zz'] } } });
    const { r, s: t } = apl(s);
    const who = new Set(r.add.map(x => x.cid)); expect(who).toEqual(new Set([c[3].id, c[5].id]));
    for (const x of r.add) if (x.cid === c[3].id) expect([0, 6]).not.toContain(new Date(x.date + 'T12:00:00Z').getUTCDay());
    // κανένα από όσα μπήκαν δεν έχει σκληρό λόγο
    for (const x of t.cadreDuties!) { const cd = t.cadreList.find(y => y.id === x.cid)!; expect(eligibility(t, cd, x.date, serviceOf(dutyCfgOf(t.settings), x.svc)?.svc, { ignore: x.id }).filter(q => ['inactive', 'state', 'dow', 'none', 'only', 'no24', 'rest', 'same', 'seat'].includes(q.code))).toEqual([]); }
  });
  it('μόνο αξιωματικοί για υπηρεσία offOnly', () => {
    const cfg = { ...ONE, groups: [{ id: 'g', name: 'ΑΥΔΜ', services: [{ id: 'sv', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '', offOnly: true }] }] };
    let s = team(cfg, 3); const off = s.cadreList.length;
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΥΠΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΑΞΙΩΜΑΤΙΚΟΣ', first: 'ΑΛΦΑΣ' } });
    const o = s.cadreList[off]; s = run(s, { t: 'setCadreDutyOf', cid: o.id, person: { group: 'g' } });
    const r = autoFill(s, YM);
    expect(new Set(r.add.map(x => x.cid))).toEqual(new Set([o.id]));
    expect(r.add.length).toBeLessThan(31); expect(r.empty.length).toBeGreaterThan(0);   // ένας αξιωματικός: ανάπαυση, όριο 3+1
  });
  it('ανάπαυση και θέσεις στρατιωτών: κανείς δίπλα σε υπηρεσία, ούτε από όσες μπήκαν στην ίδια συμπλήρωση', () => {
    let s = team(ONE, 10); const c0 = s.cadreList[0];
    s = seat(s, c0, dd(10), 'dy');
    const { r, s: t } = apl(s);
    expect(r.add.filter(x => x.cid === c0.id && [dd(9), dd(10), dd(11)].includes(x.date))).toEqual([]);
    for (const c of t.cadreList) { const ds = new Set([...(t.cadreDuties || []).filter(x => x.cid === c.id).map(x => x.date)]); for (const d of ds) { const nx = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10); expect(ds.has(nx)).toBe(false); } }
    // το όριο μετρά και τις θέσεις στρατιωτών
    const lim = monthLimit(t, c0, YM); expect(lim.done).toBe(lim.roster + 1);
  });
  it('πρώτα όσοι είναι κάτω από το όριο, μετά «+1», αλλιώς κενές', () => {
    // 4 υπαξιωματικοί, όριο 4+1 → 20 υπηρεσίες το πολύ· με ανάπαυση 1 μέρα κάθε 2η μέρα: 31 μέρες δεν φτάνουν
    const s = team(ONE, 4); const r = autoFill(s, YM);
    expect(r.add.length).toBeLessThanOrEqual(20); expect(r.empty.length).toBe(31 - r.add.length);
    expect(r.extra.length).toBe(r.add.length - 16 > 0 ? r.add.length - 16 : 0);
    const per = new Map<string, number>(); for (const x of r.add) per.set(x.cid, (per.get(x.cid) || 0) + 1);
    for (const v of per.values()) expect(v).toBeLessThanOrEqual(5);
    // κάθε +1 έρχεται μετά το 4ο ένα ατόμου
    const seen = new Map<string, number>(); for (const x of r.add) { const k = (seen.get(x.cid) || 0) + 1; seen.set(x.cid, k); if (k === 5) expect(r.extra.some(e => e.cid === x.cid && e.date === x.date)).toBe(true); else expect(r.extra.some(e => e.cid === x.cid && e.date === x.date)).toBe(false); }
  });
  it('κενή όταν είναι αδύνατο (κανείς στην ομάδα)', () => {
    const s = team(ONE, 0); const r = autoFill(s, YM);
    expect(r.add).toEqual([]); expect(r.empty).toHaveLength(31);
  });
  it('δικαιοσύνη: σε απλό σενάριο max−min ≤ 1', () => {
    const cfg = { ...ONE, limits: { off: { base: 9, extra: 0 }, nco: { base: 9, extra: 0 } } };
    const s = team(cfg, 10); const { s: t } = apl(s);
    const c = s.cadreList.map(x => cnt(t, x)); expect(c.reduce((a, b) => a + b, 0)).toBe(31); expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });
  it('δίκαιες ΣΚ/αργίες: όποιος έκανε ΣΚ τους προηγούμενους μήνες περνά τελευταίος', () => {
    const cfg = { ...ONE, limits: { off: { base: 9, extra: 0 }, nco: { base: 9, extra: 0 } }, rest: 0 };
    let s = team(cfg, 4); const [a] = s.cadreList;
    // ο a έκανε 2 ΣΚ τον Νοέμβριο, ο b καμία. Ο Δεκέμβριος ξεκινά Τρίτη· 5/12 Σάββατο
    s = run(s, { t: 'saveCadreDuty', duty: { date: '2026-11-07', svc: 'sv', cid: a.id } }); s = run(s, { t: 'saveCadreDuty', duty: { date: '2026-11-14', svc: 'sv', cid: a.id } });
    const r = autoFill(s, YM); const sat = r.add.find(x => x.date === dd(5))!;
    expect(sat.cid).not.toBe(a.id);
    const off = autoFill(s, YM, { fairHol: false }); expect(off.add.find(x => x.date === dd(5))).toBeTruthy();
  });
  it('η μεταφορά αλλάζει το όριο: όποιος έκανε παραπάνω τον προηγούμενο μήνα παίρνει λιγότερες', () => {
    const cfg = { ...ONE, limits: { off: { base: 2, extra: 0 }, nco: { base: 2, extra: 0 } }, rest: 0 };
    let s = team(cfg, 3); const [a, b, c] = s.cadreList;
    for (const d of ['02', '04', '06', '08']) s = run(s, { t: 'saveCadreDuty', duty: { date: '2026-11-' + d, svc: 'sv', cid: a.id } });   // 4 από 2: carry −2 → όριο 0
    for (const x of [b, c]) s = run(s, { t: 'saveCadreDuty', duty: { date: '2026-11-03', svc: 'sv', cid: x.id } });
    expect(monthLimit(s, a, YM).effBase).toBe(0);
    const r = autoFill(s, YM); expect(r.add.filter(x => x.cid === a.id)).toEqual([]);
    expect(r.add.length).toBe(2 * 3);   // b και c: carry +1 → 3 η καθεμία
  });
  it('ντετερμινιστικό: δύο εκτελέσεις δίνουν ακριβώς το ίδιο', () => {
    const s = team(ONE, 12); expect(autoFill(s, YM)).toEqual(autoFill(s, YM));
  });
  it('οι υπηρεσίες των στρατιωτών δεν αλλάζουν: η αυτόματη συμπλήρωσή τους είναι ίδια με και χωρίς πρόγραμμα στελεχών', () => {
    const s = team(ONE, 6); const { s: t } = apl(s);
    for (const d of ['2026-12-08', '2026-12-09', '2026-12-12']) expect(fillDay(t, d).guards).toEqual(fillDay(s, d).guards);
  });
  it('απόδοση: 60 στελέχη × 5 υπηρεσίες × 31 μέρες', () => {
    const cfg: Partial<CadreDutyCfg> = { ...ONE, groups: [{ id: 'g', name: 'Ομάδα', services: [1, 2, 3, 4, 5].map(i => ({ id: 'v' + i, name: 'Υπ' + i, short: 'Υ' + i, perDay: 1, h24: true, hkCol: '' })) }], limits: { off: { base: 9, extra: 1 }, nco: { base: 9, extra: 1 } }, rest: 1 };
    const s = team(cfg, 60); const t0 = Date.now(); const r = autoFill(s, YM); const ms = Date.now() - t0;
    expect(r.add.length + r.empty.length).toBe(155); expect(r.add.length).toBeGreaterThan(100); expect(ms).toBeLessThan(2000);
  });
});
