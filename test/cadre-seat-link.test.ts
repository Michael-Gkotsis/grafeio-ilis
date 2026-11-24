// «Μόνο στελέχη» ↔ υπηρεσία στελεχών, αμφίδρομα (Michael, 24/11): στέλεχος στη θέση των Υπηρεσιών = η υπηρεσία (π.χ. ΑΥΔΜ) στο πρόγραμμα στελεχών,
// η υπηρεσία στο πρόγραμμα γεμίζει τη θέση, και το σβήσιμο από τη μία πλευρά σβήνει και την άλλη. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type CadreDutyCfg } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { autoFill, cellCode, dutyIndex, monthCount, personCells } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { hdRosterOn } from '../src/shared/hd';
import { fakeState } from './fixtures';

const D = '2026-12-05';
const D2 = '2026-12-06';
const YM = '2026-12';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-01', newId: () => 'q' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [
    { id: 'a', name: 'Αξιωματικός Υπηρεσίας Διανυκτερεύων Μονάδος', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' },
    { id: 'b', name: 'Βοηθός ΑΥΔΜ', short: 'ΒΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 3, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
function setup(as?: string): { s: AppState; k: string; cid: string; cid2: string } {
  let s = run(fakeState(40), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΛΟΣ', first: 'ΟΝΟΜΑ' } });
  const cid = s.cadreList[0].id, cid2 = s.cadreList[1].id;
  s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } }); s = run(s, { t: 'setCadreDutyOf', cid: cid2, person: { group: 'g' } });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g', ...(as ? { cadreAs: as } : {}) });
  return { s, k: blocksOf(s.settings).find(b => b.name === 'ΑΥΔΜ')!.posts[0].k, cid, cid2 };
}
const seat = (s: AppState, cid: string, k: string, date = D) => run(s, { t: 'assign', date, k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid });
const duty = (s: AppState, cid: string, svc: string, date = D) => run(s, { t: 'saveCadreDuty', duty: { date, svc, cid } });
const rows = (s: AppState, svc?: string, date = D) => (s.cadreDuties || []).filter(x => x.date === date && (!svc || x.svc === svc));
const cellOn = (s: AppState, cid: string, date = D) => { const i = monthIndex(s, YM); return personCells(s, s.cadreList.find(c => c.id === cid)!, i)[i.days.findIndex(d => d.d === date)]; };
const seatPid = (s: AppState, k: string, date = D) => s.guards[date]?.[k];

describe('«Μόνο στελέχη» ↔ πρόγραμμα στελεχών, αμφίδρομα', () => {
  it('στέλεχος στη θέση: μπαίνει στο πρόγραμμα ως ΑΥΔΜ, μία φορά, και μετρά μία', () => {
    const { s: s0, k, cid } = setup(); const s = seat(s0, cid, k);
    expect(rows(s)).toHaveLength(1); expect(rows(s)[0]).toMatchObject({ svc: 'a', cid, via: k });
    expect(cellCode(cellOn(s, cid))).toBe('ΑΥΔΜ'); expect(monthCount(s, cid, YM).done).toBe(1);
    expect(hdRosterOn(s, D).aydm).toContain('ΣΤΕΛΕΧΟΣ');
  });
  it('υπηρεσία στο πρόγραμμα: γεμίζει η κενή θέση, μία φορά, και μετρά μία', () => {
    const { s: s0, k, cid } = setup(); const s = duty(s0, cid, 'a');
    expect(seatPid(s, k)).toBeLessThan(0); expect(rows(s)).toHaveLength(1); expect(rows(s)[0].via).toBe(k);
    expect(cellCode(cellOn(s, cid))).toBe('ΑΥΔΜ'); expect(monthCount(s, cid, YM).done).toBe(1);
    expect(dutyIndex(s).get(cid)!.get(D)!.seat).toHaveLength(0);
  });
  it('σβήσιμο από το πρόγραμμα: φεύγει και από τη θέση', () => {
    const { s: s0, k, cid } = setup(); const s1 = duty(s0, cid, 'a');
    const s = run(s1, { t: 'deleteCadreDuty', id: rows(s1)[0].id });
    expect(rows(s)).toHaveLength(0); expect(seatPid(s, k)).toBeUndefined(); expect(monthCount(s, cid, YM).done).toBe(0);
  });
  it('σβήσιμο από τη θέση: φεύγει και από το πρόγραμμα', () => {
    const { s: s0, k, cid } = setup(); const s1 = seat(s0, cid, k);
    const s = run(s1, { t: 'assign', date: D, k, pid: null });
    expect(rows(s)).toHaveLength(0); expect(monthCount(s, cid, YM).done).toBe(0);
  });
  it('άλλο στέλεχος στη θέση: αλλάζει και το πρόγραμμα', () => {
    const { s: s0, k, cid, cid2 } = setup(); const s1 = seat(s0, cid, k); const s = seat(s1, cid2, k);
    expect(rows(s).map(x => x.cid)).toEqual([cid2]);
  });
  it('σβήσιμο με setCadreDuties (σβήσε αυτόματα) καθαρίζει και τη θέση', () => {
    const { s: s0, k, cid } = setup(); const s1 = duty(s0, cid, 'a');
    const s = run(s1, { t: 'setCadreDuties', add: [], del: rows(s1).map(x => x.id), text: 'δοκιμή' });
    expect(rows(s)).toHaveLength(0); expect(seatPid(s, k)).toBeUndefined();
  });
  it('υπηρεσία που δεν είναι δεμένη με θέση (ΒΑΥΔΜ): μένει μόνο στο πρόγραμμα, η θέση μένει κενή', () => {
    const { s: s0, k, cid } = setup(); const s = duty(s0, cid, 'b');
    expect(rows(s)).toHaveLength(1); expect(rows(s)[0].via).toBeUndefined(); expect(seatPid(s, k)).toBeUndefined();
  });
  it('θέση ήδη γεμάτη από άλλον: η υπηρεσία μένει μόνο στο πρόγραμμα, η θέση δεν αλλάζει', () => {
    const { s: s0, k, cid, cid2 } = setup(); const s1 = seat(s0, cid2, k); const s = duty(s1, cid, 'a');
    expect(rows(s).find(x => x.cid === cid)!.via).toBeUndefined(); expect(rows(s).find(x => x.cid === cid2)!.via).toBe(k);
    expect(s.cadreList.find(c => c.id === cid2)!.pid).toBe(seatPid(s, k));
  });
  it('«Μετρά ως υπηρεσία» ΒΑΥΔΜ: η σχέση είναι με τη δεύτερη υπηρεσία και αλλάζει όταν αλλάξεις τη ρύθμιση', () => {
    const { s: s0, k, cid } = setup('b'); const s1 = duty(s0, cid, 'a'); expect(seatPid(s1, k)).toBeUndefined();
    const s2 = seat(s0, cid, k); expect(rows(s2)[0].svc).toBe('b');
    const id = blocksOf(s2.settings).find(b => b.name === 'ΑΥΔΜ')!.id;
    const s3 = run(s2, { t: 'editBlock', phase: s2.settings.phase, id, name: 'ΑΥΔΜ', hrs: {}, who: 'cadre', cadreGroup: 'g', cadreAs: 'a' });
    expect(rows(s3).map(x => x.svc)).toEqual(['a']); expect(rows(s3)[0].via).toBe(k);
  });
  it('ο ίδιος άνθρωπος δύο μέρες: δύο εγγραφές, μία θέση ανά μέρα', () => {
    const { s: s0, k, cid } = setup(); const s = duty(seat(s0, cid, k), cid, 'a', D2);
    expect(rows(s, 'a', D)).toHaveLength(1); expect(rows(s, 'a', D2)).toHaveLength(1); expect(seatPid(s, k, D2)).toBeLessThan(0);
    expect(monthCount(s, cid, YM).done).toBe(2);
  });
  it('η υπηρεσία δεν είναι πια «μόνο στελέχη»: οι εγγραφές της θέσης φεύγουν από το πρόγραμμα', () => {
    const { s: s0, k, cid } = setup(); const s1 = seat(s0, cid, k);
    const id = blocksOf(s1.settings).find(b => b.name === 'ΑΥΔΜ')!.id;
    const s = run(s1, { t: 'editBlock', phase: s1.settings.phase, id, name: 'ΑΥΔΜ', hrs: {}, who: 'soldiers' });
    expect(rows(s)).toHaveLength(0);
  });
  it('θέση στρατιώτη (όχι μόνο στελέχη): δεν γράφει τίποτα στο πρόγραμμα στελεχών', () => {
    const { s: s0, cid } = setup(); const k = blocksOf(s0.settings).find(b => !b.who && b.posts.length)!.posts[0].k;
    const s = seat(s0, cid, k); expect(rows(s)).toHaveLength(0);
  });
  it('αυτόματη συμπλήρωση μήνα: ΑΥΔΜ μία φορά ανά μέρα, και η θέση και το πρόγραμμα δείχνουν το ίδιο στέλεχος', () => {
    const { s: s0, k } = setup(); const r = autoFill(s0, YM);
    const s = run(s0, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή', seats: r.seats });
    let days = 0;
    for (let i = 1; i <= 31; i++) {
      const d = YM + '-' + String(i).padStart(2, '0'); const a = rows(s, 'a', d); if (!a.length && seatPid(s, k, d) == null) continue; days++;
      expect(a.length).toBe(1);
      expect(s.cadreList.find(c => c.id === a[0].cid)!.pid).toBe(seatPid(s, k, d)); expect(a[0].via).toBe(k);
    }
    expect(days).toBeGreaterThan(0);
    for (const c of s.cadreList) for (let i = 1; i <= 31; i++) { const d = YM + '-' + String(i).padStart(2, '0'); expect((s.cadreDuties || []).filter(x => x.cid === c.id && x.date === d && x.svc === 'a').length).toBeLessThanOrEqual(1); }
  });
});

// Τυχαίες μορφές (Michael, 24/11): διαφορετικά έντυπα, ομάδες, υπηρεσίες και θέσεις μόνο-για-στελέχη· τυχαίες κινήσεις και από τις δύο πλευρές.
// Σταθερή αναλλοίωτη: κάθε θέση με στέλεχος έχει ακριβώς μία εγγραφή via στο πρόγραμμα με τη σωστή υπηρεσία, και κάθε εγγραφή via έχει τη θέση της.
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
describe('αμφίδρομη σχέση: τυχαίες μορφές και κινήσεις', () => {
  for (let seed = 1; seed <= 25; seed++) it('seed ' + seed, () => {
    const r = rng(seed); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]; const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    const ng = int(1, 3); const groups = Array.from({ length: ng }, (_, g) => ({ id: 'g' + g, name: 'Ομάδα' + g, services: Array.from({ length: int(1, 3) }, (_, v) => ({ id: 'g' + g + 's' + v, name: 'Υπηρεσία ' + g + v, short: 'Υ' + g + v, perDay: int(1, 2), h24: r() < 0.5, hkCol: '' })) }));
    let s = run(fakeState(30), { t: 'setSettings', settings: { cadreDuty: { groups, limits: { off: { base: 9, extra: 1 }, nco: { base: 9, extra: 1 } }, rest: 0, carry: true, fairHol: true } }, text: 'δοκιμή' });
    for (let i = 0; i < 8; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(65 + i), first: 'ΟΝΟΜΑ' } });
    s.cadreList.forEach((c, i) => { s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: groups[i % ng].id } }); });
    const keys: string[] = [];
    for (let b = 0; b < int(1, 3); b++) {
      const g = pick(groups); const as = r() < 0.5 ? pick(g.services).id : undefined;
      s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΜΟΝΟΣΤ' + b, armed: false, n: int(1, 3), hrs: '', who: 'cadre', cadreGroup: g.id, ...(as ? { cadreAs: as } : {}) });
      for (const p of blocksOf(s.settings).find(x => x.name === 'ΜΟΝΟΣΤ' + b)!.posts) keys.push(p.k);
    }
    const days = Array.from({ length: 6 }, (_, i) => '2026-12-' + String(i + 1).padStart(2, '0'));
    const check = (tag: string) => {
      const co = blocksOf(s.settings).flatMap(b => b.who === 'cadre' ? b.posts.map(p => ({ k: p.k, b })) : []);
      for (const d of days) {
        const seen = new Set<string>();
        for (const { k, b } of co) {
          const pid = s.guards[d]?.[k]; const cd = pid != null && pid < 0 ? s.cadreList.find(c => c.pid === pid) : undefined; if (!cd) continue;
          const g = groups.find(x => x.id === b.cadreGroup)!; const svc = g.services.find(x => x.id === b.cadreAs) || g.services[0];
          const hit = (s.cadreDuties || []).filter(x => x.date === d && x.cid === cd.id && x.svc === svc.id);
          expect(hit, tag + ' ' + d + ' ' + k).toHaveLength(1); expect(hit[0].via, tag).toBe(k); seen.add(hit[0].id);
        }
        for (const x of (s.cadreDuties || []).filter(y => y.date === d && y.via)) {
          expect(seen.has(x.id), tag + ' ορφανή εγγραφή ' + x.id).toBe(true);
        }
      }
    };
    for (let step = 0; step < 40; step++) {
      const d = pick(days); const c = pick(s.cadreList); const op = int(0, 4); const tag = 'seed ' + seed + ' βήμα ' + step + ' op ' + op;
      try {
        if (op === 0) s = seat(s, c.id, pick(keys), d);
        else if (op === 1) s = run(s, { t: 'assign', date: d, k: pick(keys), pid: null });
        else if (op === 2) s = duty(s, c.id, pick(groups.flatMap(g => g.services)).id, d);
        else if (op === 3) { const l = (s.cadreDuties || []).filter(x => x.date === d); if (l.length) s = run(s, { t: 'deleteCadreDuty', id: pick(l).id }); }
        else { const l = (s.cadreDuties || []).filter(x => x.date === d); s = run(s, { t: 'setCadreDuties', add: [], del: l.map(x => x.id), text: 'δοκιμή' }); }
      } catch (e) { if (!/Δεν υπάρχει αλλαγή|Δεν βρέθηκε|δεν μπαίνει/.test((e as Error).message)) throw e; }
      check(tag);
    }
    // ένας άνθρωπος δεν μετράει δύο φορές την ίδια υπηρεσία την ίδια μέρα, και το done είναι ίδιο με τις μοναδικές υπηρεσίες
    for (const c of s.cadreList) { const m = monthCount(s, c.id, YM); const own = (s.cadreDuties || []).filter(x => x.cid === c.id).length;
      const extraSeats = days.reduce((a, d) => a + (dutyIndex(s).get(c.id)?.get(d)?.seat.length || 0), 0); expect(m.done).toBe(own + extraSeats); }
  });
});
