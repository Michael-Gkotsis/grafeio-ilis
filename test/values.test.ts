// Έντυπα › πίνακες τιμών (Φάση 1): κάθε μέτρηση δίνει τον ίδιο αριθμό με τον μετρητή της οθόνης της (Δύναμη, ΗΚΑΙ, κωλυόμενοι, Έξοδοι,
// Οπλισμός, υπηρεσίες). Ένωση «μία φορά», αφαίρεση, φίλτρα, ποσοστό, στιγμή μέτρησης. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { defaultPick, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { TYPE_KEYS, type AppState, type Status } from '../src/shared/domain';
import { hkMin, hkaiCounts, kolView, outMin, postsOf, strengthAt, strengthOf } from '../src/shared/rules';
import { dutyPicks, weaponInfo, outPeople, noSeat } from '../src/shared/weapons';
import { outsTables } from '../src/shared/returns';
import { outsAndStay } from '../src/shared/outsStay';
import { atOf, atText, evalTables, evalValue, exprText, filterChoices, hasVals, metricGroups, metricOf, metricsOf, newValueTable, rowValue, valueText, valsMissing, type VExpr, type VRow, type ValueTable } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const st = (id: string, pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id, pid, type, from, to, ...x });
const HK = hkMin(fakeState(1).rules), OUT = outMin(fakeState(1).rules);
// Μια μονάδα με όλα: άδειες, τιμητική, ΔΝ, εξοδούχοι, ιατρικά, ποινή, κωλυόμενος, υπηρεσίες και ένοπλες
function seed(): AppState {
  const s = fakeState(40);
  s.statuses = [
    st('a', 1, 'LEAVE', '2026-10-17', '2026-10-25'), st('b', 2, 'HON', '2026-10-18', '2026-10-21'), st('c', 3, 'DN', D, D), st('d', 3, 'LEAVE', '2026-10-01', '2026-10-02'),
    st('e', 4, 'OUT', D, D), st('f', 5, 'EA', '2026-10-17', '2026-10-21'), st('g', 6, 'EY', D, D), st('h', 7, 'PUN', D, '2026-10-21', { kind: 'Περιορισμός' }),
    st('i', 8, 'KOL', D, D, { minus: true, hkCol: 'yp', note: 'Υπηρεσία ΣΤΕΠ' }), st('j', 9, 'LEAVE', '2026-10-19', '2026-10-20'), st('k', 9, 'DN', D, D),
    st('l', 10, 'SICK', '2026-10-18', '2026-10-20'), st('m', 11, 'NOS', '2026-10-19', '2026-10-22'), st('n', 12, 'OUT', D, D), st('o', 13, 'DN', D, D)
  ];
  const ks = postsOf(s.settings).map(p => p.k);
  s.guards = { [D]: { [ks[0]]: 20, [ks[1]]: 21, [ks[2]]: 22 } };
  s.people[20].weapon = 'Α123456'; s.people[21].weapon = 'Α123457'; s.people[22].weapon = 'Α123458';
  s.requests = [{ id: 'r1', pid: 14, date: D, kind: 'leave', text: 'Άδεια', decision: 'ok' } as unknown as AppState['requests'][number], { id: 'r2', pid: 15, date: D, kind: 'leave', text: 'Άδεια' } as unknown as AppState['requests'][number]];
  return s;
}
const T = (metric: string, sign: '+' | '-' = '+', filter?: VExpr[number]['filter']) => ({ sign, metric, ...(filter ? { filter } : {}) });
const ev = (s: AppState, expr: VExpr, at = HK) => evalValue(s, D, at, expr);

describe('Κατάλογος μετρήσεων: ίδιοι αριθμοί με τις οθόνες', () => {
  it('Δύναμη: σύνολο, παρόντες, απόντες και κάθε είδος κατάστασης όπως το strengthOf', () => {
    const s = seed(); const g = strengthOf(s, D, HK);
    expect(ev(s, [T('str.total')])).toBe(g.total);
    expect(ev(s, [T('str.away')])).toBe(g.absent);
    expect(ev(s, [T('str.inside')])).toBe(g.total - g.absent);
    for (const k of TYPE_KEYS) expect(ev(s, [T('st.' + k)]), k).toBe(g.counts[k]);
    // παρόντες = σε δύναμη − απόντες − κωλυόμενοι (όπως η Δύναμη της οθόνης)
    const kv = kolView(s, D, HK);
    expect(ev(s, [T('str.present')])).toBe(g.present - kv.minus.length);
    expect(ev(s, [T('str.kol')])).toBe(kv.minus.length);
    expect(kv.minus.length).toBe(1);
  });
  it('Καταστάσεις και ιατρικά: κατηγορίες (ένωση)', () => {
    const s = seed(); const g = strengthOf(s, D, HK);
    expect(ev(s, [T('cat.med')])).toBe(new Set(['EY', 'EA', 'EARV', 'EO'].flatMap(k => g.lists[k as 'EY'].map(p => p.id))).size);
    expect(ev(s, [T('cat.abs')])).toBe(new Set(['LEAVE', 'HON', 'SICK'].flatMap(k => g.lists[k as 'EY'].map(p => p.id))).size);
    expect(ev(s, [T('cat.out')])).toBe(new Set(['OUT', 'DN'].flatMap(k => g.lists[k as 'EY'].map(p => p.id))).size);
  });
  it('Σύνολα ΗΚΑΙ: ίδια με το hkaiCounts', () => {
    const s = seed(); const h = hkaiCounts(s, D);
    expect(ev(s, [T('hk.total')])).toBe(h.total); expect(ev(s, [T('hk.soldiers')])).toBe(h.soldiers); expect(ev(s, [T('hk.cadre')])).toBe(h.cadreN);
    expect(ev(s, [T('hk.kol')])).toBe(h.kol); expect(ev(s, [T('hk.apo')])).toBe(h.apo); expect(ev(s, [T('hk.avail')])).toBe(h.avail);
    // η στήλη «Υπηρεσία» της ΗΚΑΙ (ο κωλυόμενος)
    const yp = Object.values(h.rank).reduce((a, r) => a + (r.c.yp || 0), 0); expect(ev(s, [T('hk.k:yp')])).toBe(yp);
  });
  it('Έξοδοι: ίδιες με το «Εξοδούχοι / Παραμένοντες»', () => {
    const s = seed(); const o = outsAndStay(s, D);
    expect(ev(s, [T('out.outs')])).toBe(o.outs.length); expect(ev(s, [T('out.stay')])).toBe(o.stay.length);
    expect(ev(s, [T('out.out')])).toBe(o.outs.filter(x => x.st.type === 'OUT').length); expect(ev(s, [T('out.dn')])).toBe(o.outs.filter(x => x.st.type === 'DN').length);
    expect(o.outs.length).toBeGreaterThan(0);
  });
  it('Υπηρεσίες της μέρας: άτομα και θέσεις όπως το dutyPicks / postsOf', () => {
    const s = seed(); const picks = dutyPicks(s, D);
    expect(ev(s, [T('duty.people')])).toBe(new Set(picks.flatMap(x => x.pids)).size);
    expect(ev(s, [T('duty.armed')])).toBe(new Set(picks.filter(x => x.armed).flatMap(x => x.pids)).size);
    const posts = postsOf(s.settings);
    expect(ev(s, [T('duty.posts')])).toBe(posts.length); expect(ev(s, [T('duty.filled')])).toBe(3);
    expect(ev(s, [T('duty.empty')])).toBe(posts.length - 3);
    expect(ev(s, [T('duty.aposts')])).toBe(posts.filter(p => p.armed).length);
  });
  it('Οπλισμός: δύναμη όπλων και ΕΚΤΟΣ όπως το weaponInfo/outPeople', () => {
    const s = seed(); s.weaponLog = [{ id: 'w1', pid: 21, weapon: 'Α123457', reason: 'Καθαρισμός', outDay: D, outTime: '07:00' }];
    const info = weaponInfo(s, D); const outs = outPeople([...s.people], info);
    expect(ev(s, [T('w.with')])).toBeGreaterThanOrEqual(3);
    expect(ev(s, [T('w.out')])).toBe(outs.length); expect(outs.length).toBeGreaterThanOrEqual(1);
    expect(ev(s, [T('w.in')])).toBe(ev(s, [T('w.with'), T('w.out', '-')]));
  });
  it('Κωλυόμενοι με δήλωση: όλοι, αφαιρούμενοι, ανά στήλη ΗΚΑΙ (όπως το kolView)', () => {
    const s = seed(); s.statuses.push(st('k2', 16, 'KOL', D, D, { note: 'Συνοδεία' }), st('k3', 17, 'KOL', D, D, { minus: true, hkCol: 'ey', note: 'Υπηρεσία' }));
    const kv = kolView(s, D, HK);
    expect(ev(s, [T('kol.man')])).toBe(kv.man.length); expect(kv.man.length).toBe(3);
    expect(ev(s, [T('kol.minus')])).toBe(kv.minus.length); expect(ev(s, [T('kol.keep')])).toBe(kv.keep.length); expect(kv.keep.length).toBe(1);
    expect(ev(s, [T('kol.col:yp')])).toBe(kv.minus.filter(x => x.col === 'yp').length); expect(ev(s, [T('kol.col:ey')])).toBe(1);
    expect(ev(s, [T('kol.minus')])).toBe(ev(s, [T('str.kol')]));
  });
  it('Έξοδοι με ώρες επιστροφής: οι τέσσερις πίνακες του outsTables', () => {
    const s = seed(); const o = outsTables(s, D);
    expect(ev(s, [T('ret.dn')])).toBe(o.dn.length); expect(ev(s, [T('ret.out')])).toBe(o.out.length);
    expect(ev(s, [T('ret.tonight')])).toBe(o.tonight.length); expect(ev(s, [T('ret.tomorrow')])).toBe(o.tomorrow.length);
    expect(o.dn.length + o.out.length).toBeGreaterThan(0);
  });
  it('Οπλισμός: ίδιος αριθμός ή θέση, χωρίς θέση, να παραδώσουν, κινήσεις της μέρας', () => {
    const s = seed(); s.people[3].weapon = s.people[4].weapon = 'Β555'; s.people[30].active = false; s.people[30].weapon = 'Γ777';
    s.weaponLog = [{ id: 'a', pid: 21, weapon: 'Α123457', reason: 'Καθαρισμός', outDay: D, outTime: '07:00' }, { id: 'b', pid: 22, weapon: 'Α123458', reason: 'Βολή', outDay: D, outTime: '06:00', inDay: D, inTime: '09:00' }];
    const info = weaponInfo(s, D);
    expect(ev(s, [T('w.dup')])).toBeGreaterThanOrEqual(2); expect(ev(s, [T('w.return')])).toBe(1); expect(ev(s, [T('w.noseat')])).toBe(s.people.filter(p => noSeat(p)).length);
    expect(ev(s, [T('w.moves.out')])).toBe(2); expect(ev(s, [T('w.moves.in')])).toBe(1); expect(info.arm).toBeDefined();
  });
  it('Πλάνο: «Όπλα ΕΝΤΟΣ = Δύναμη όπλων − ΕΚΤΟΣ» και «% ΕΚΤΟΣ»', () => {
    const s = seed(); s.weaponLog = [{ id: 'a', pid: 21, weapon: 'Α123457', reason: 'Καθαρισμός', outDay: D, outTime: '07:00' }];
    const w = ev(s, [T('w.with')]), out = ev(s, [T('w.out')]);
    expect(out).toBe(1); expect(ev(s, [T('w.with'), T('w.out', '-')])).toBe(w - out);
    expect(rowValue(s, D, HK, { label: '% ΕΚΤΟΣ', expr: [T('w.out')], percentOf: [T('w.with')] })).toBeCloseTo(out / w, 10);
    // με φίλτρο ουλαμού: το άτομο 21 είναι στον θάλαμο 6 (2ος Ουλ.)
    expect(ev(s, [T('w.with', '+', { unit: '1ος Ουλ.' }), T('w.out', '-', { unit: '1ος Ουλ.' })])).toBe(ev(s, [T('w.with', '+', { unit: '1ος Ουλ.' })]));
    expect(ev(s, [T('w.out', '+', { unit: '2ος Ουλ.' })])).toBe(1);
  });
  it('Πλάνο: «% παρόντων» με φίλτρο 1ος Ουλ.', () => {
    const s = seed(); const f = { unit: '1ος Ουλ.' };
    const row: VRow = { label: '% παρόντων 1ος Ουλ.', expr: [T('str.total', '+', f), T('str.away', '-', f), T('str.kol', '-', f)], percentOf: [T('str.total', '+', f)] };
    const pres = ev(s, [T('str.present', '+', f)]), tot = ev(s, [T('str.total', '+', f)]);
    expect(ev(s, row.expr)).toBe(pres); expect(rowValue(s, D, HK, row)).toBeCloseTo(pres / tot, 10);
  });
  it('Αιτήσεις της μέρας', () => {
    const s = seed();
    expect(ev(s, [T('req.all')])).toBe(2); expect(ev(s, [T('req.ok')])).toBe(1); expect(ev(s, [T('req.pending')])).toBe(1);
  });
  it('κάθε μέτρηση του καταστήματος υπολογίζεται χωρίς σφάλμα και δίνει αριθμό ≥ 0 (μόνη της)', () => {
    const s = seed();
    for (const m of metricsOf(s)) { const n = ev(s, [T(m.id)]); expect(Number.isFinite(n), m.id).toBe(true); expect(n, m.id).toBeGreaterThanOrEqual(0); }
    expect(metricGroups(s).map(g => g.group)).toEqual(expect.arrayContaining(['Δύναμη', 'Καταστάσεις', 'Ιατρικά', 'Έξοδοι και παραμένοντες', 'Υπηρεσίες της μέρας', 'Οπλισμός', 'Σύνολα ΗΚΑΙ']));
    expect(metricOf(s, 'str.total')?.label).toMatch(/δύναμη/i); expect(metricOf(s, 'nope')).toBeUndefined();
  });
});

describe('Σύνθεση: ένωση, αφαίρεση, φίλτρα, ποσοστό', () => {
  it('ΚΑ + Τιμητικές + ΔΝ: όποιος έχει δύο μετρά μία φορά', () => {
    const s = seed(); const g = strengthOf(s, D, HK);
    // το άτομο 9 έχει άδεια και ΔΝ, το 3 ΔΝ (και παλιά άδεια που έληξε)
    expect(g.lists.LEAVE.map(p => p.id)).toContain(9); expect(g.lists.DN.map(p => p.id)).toContain(9);
    const a = ev(s, [T('st.LEAVE')]), b = ev(s, [T('st.HON')]), c = ev(s, [T('st.DN')]);
    const sum = ev(s, [T('st.LEAVE'), T('st.HON'), T('st.DN')]);
    const ids = new Set([...g.lists.LEAVE, ...g.lists.HON, ...g.lists.DN].map(p => p.id));
    expect(sum).toBe(ids.size); expect(sum).toBeLessThan(a + b + c);
    // ανεξάρτητα από τη σειρά
    expect(ev(s, [T('st.DN'), T('st.HON'), T('st.LEAVE')])).toBe(sum);
  });
  it('αφαίρεση: Παρόντες = Σε δύναμη − Απόντες [− Κωλυόμενοι]', () => {
    const s = seed();
    const total = ev(s, [T('str.total')]), away = ev(s, [T('str.away')]), kol = ev(s, [T('str.kol')]);
    expect(ev(s, [T('str.total'), T('str.away', '-')])).toBe(total - away);
    expect(ev(s, [T('str.total'), T('str.away', '-'), T('str.kol', '-')])).toBe(ev(s, [T('str.present')]));
    expect(total - away - kol).toBe(ev(s, [T('str.present')]));
    // ο κωλυόμενος που λείπει δεν αφαιρείται δύο φορές
    expect(ev(s, [T('str.total'), T('str.away', '-'), T('str.away', '-')])).toBe(total - away);
  });
  it('αριθμοί (ΗΚΑΙ) προστίθενται και αφαιρούνται: Δύναμη ΗΚΑΙ − Απόντες', () => {
    const s = seed(); const h = hkaiCounts(s, D);
    expect(ev(s, [T('hk.total'), T('hk.apo', '-')])).toBe(h.total - h.apo);
    // μόνο όροι «−» χωρίς + : αρνητικό πλήθος
    expect(ev(s, [T('str.away', '-')])).toBe(-ev(s, [T('str.away')]));
  });
  it('φίλτρα: 1ος Ουλ., θάλαμος, βαθμός, ένοπλοι/άοπλοι, στρατιώτες/στελέχη', () => {
    const s = seed(); const g = strengthOf(s, D, HK);
    const u1 = s.people.filter(p => p.room! <= 4).length;
    expect(ev(s, [T('str.total', '+', { unit: '1ος Ουλ.' })])).toBe(u1);
    expect(ev(s, [T('str.total', '+', { unit: '1ος Ουλ.' }), T('str.total', '+', { unit: '2ος Ουλ.' })])).toBe(40);
    const away = new Set(Object.values(g.awayLists).flat().map(p => p.id)), awayU1 = s.people.filter(p => p.room! <= 4 && away.has(p.id)).length;
    expect(ev(s, [T('str.away', '+', { unit: '1ος Ουλ.' })])).toBe(awayU1);
    expect(ev(s, [T('str.total', '+', { room: 3 })])).toBe(s.people.filter(p => p.room === 3).length);
    expect(ev(s, [T('str.total', '+', { rank: 'ΔΝΕΑΣ' })])).toBe(1);
    expect(ev(s, [T('str.total', '+', { arm: 'unarmed' })])).toBe(4); expect(ev(s, [T('str.total', '+', { arm: 'armed' })])).toBe(36);
    expect(ev(s, [T('str.armed')])).toBe(36);
    expect(ev(s, [T('str.total', '+', { who: 'cadre' })])).toBe(0); expect(ev(s, [T('str.total', '+', { who: 'soldiers' })])).toBe(40);
    // το φίλτρο μπαίνει και στον όρο που αφαιρείται
    expect(ev(s, [T('str.total', '+', { unit: '1ος Ουλ.' }), T('str.away', '-', { unit: '1ος Ουλ.' })])).toBe(u1 - awayU1);
    expect(filterChoices(s).units).toEqual(['1ος Ουλ.', '2ος Ουλ.']); expect(filterChoices(s).rooms).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('στελέχη: ένωση με στρατιώτες και φίλτρο «Στελέχη»', () => {
    const s = seed(); s.cadreList = [{ id: 'k1', rank: 'ΛΧΙΑΣ', hk: 'ΛΧΙΑΣ', last: 'ΑΛΦΑ', first: 'Α', active: true }, { id: 'k2', rank: 'ΥΠΛΓΟΣ', hk: 'ΥΠΛΓΟΣ', last: 'ΒΗΤΑ', first: 'Β', active: true }] as AppState['cadreList'];
    expect(ev(s, [T('str.all')])).toBe(42); expect(ev(s, [T('str.all', '+', { who: 'cadre' })])).toBe(2);
    expect(ev(s, [T('str.all', '+', { who: 'cadre' }), T('str.all', '+', { who: 'soldiers' })])).toBe(42);
    expect(ev(s, [T('cadre.all')])).toBe(2);
  });
  it('ποσοστό: κλάσμα, μορφές και παρονομαστής 0', () => {
    const s = seed(); const row: VRow = { label: '% παρόντων', expr: [T('str.present')], percentOf: [T('str.total')] };
    const n = ev(s, [T('str.present')]), den = ev(s, [T('str.total')]);
    expect(rowValue(s, D, HK, row)).toBeCloseTo(n / den, 10);
    expect(valueText(n / den, 'pct')).toBe(Math.round(n / den * 100) + '%');
    expect(valueText(0.9625, 'pct1')).toBe('96,3%'); expect(valueText(0.5, 'pct')).toBe('50%'); expect(valueText(12, 'int')).toBe('12'); expect(valueText(null, 'pct')).toBe('—');
    expect(rowValue(s, D, HK, { label: 'x', expr: [T('str.present')], percentOf: [T('str.total', '+', { room: 99 })] })).toBeNull();
    const out = evalTables(s, D, HK, [{ id: 'v1', title: 'ΔΥΝΑΜΗ', rows: [row, { label: ' Σύνολο ', expr: [T('str.total')] }] }]);
    expect(out[0]).toMatchObject({ title: 'ΔΥΝΑΜΗ', rows: [{ label: '% παρόντων', fmt: 'pct' }, { label: 'Σύνολο', v: 40, fmt: 'int' }] });
  });
  it('κενές γραμμές/πίνακες δεν μετρούν· μέτρηση που χάθηκε δεν σπάει', () => {
    const s = seed(); const t: ValueTable = { id: 'v', rows: [{ label: 'x', expr: [] }] };
    expect(hasVals({ vals: [t] })).toBe(false); expect(hasVals({ vals: [newValueTable('v2')] })).toBe(true); expect(evalTables(s, D, HK, [t])).toEqual([]);
    const bad: ValueTable = { id: 'b', rows: [{ label: 'x', expr: [T('duty.b:ΧΑΘΗΚΕ'), T('str.total')] }] };
    expect(valsMissing(s, [bad])).toEqual(['duty.b:ΧΑΘΗΚΕ']); expect(evalTables(s, D, HK, [bad])[0].rows[0].v).toBe(40);
    expect(exprText(s, [T('st.LEAVE'), T('st.HON'), T('st.DN'), T('str.away', '-', { unit: '1ος Ουλ.' })])).toMatch(/ \+ .* \+ .* − .*\(1ος Ουλ\.\)$/);
  });
});

describe('Στιγμή μέτρησης', () => {
  it('08:00 και 18:00: ο εξοδούχος και ο ΔΝ της μέρας λείπουν μόνο μετά την ώρα εξόδου', () => {
    const s = seed(); const m8 = 8 * 60, m18 = 18 * 60;
    expect(ev(s, [T('st.OUT')], m8)).toBe(strengthOf(s, D, m8).counts.OUT); expect(ev(s, [T('st.OUT')], m18)).toBe(strengthOf(s, D, m18).counts.OUT);
    const a8 = ev(s, [T('str.away')], m8), a18 = ev(s, [T('str.away')], m18);
    expect(a18).toBeGreaterThan(a8);
    const d = ev(s, [T('cat.out')], m18) - ev(s, [T('cat.out')], m8);
    expect(d).toBeGreaterThan(0); expect(a18 - a8).toBeGreaterThanOrEqual(d - 5);
    expect(ev(s, [T('str.present')], m18)).toBeLessThan(ev(s, [T('str.present')], m8));
  });
  it('atOf: προεπιλογή όπως η Δύναμη, ώρα ΗΚΑΙ, ώρα εξόδου, τώρα, δική σου ώρα', () => {
    const s = seed(); const today = '2026-10-21';
    expect(atOf(s, undefined, D, today, 600)).toBe(strengthAt(s.rules, D, today, 600)); expect(atOf(s, undefined, today, today, 600)).toBe(strengthAt(s.rules, today, today, 600));
    expect(atOf(s, 'hkai', D, today, 600)).toBe(HK); expect(atOf(s, 'out', D, today, 600)).toBe(OUT); expect(atOf(s, 'now', D, today, 777)).toBe(777); expect(atOf(s, '18:30', D, today, 600)).toBe(18 * 60 + 30);
    expect(atOf(s, '25:99', D, today, 600)).toBe(strengthAt(s.rules, D, today, 600));
    expect(atText(s, 'hkai')).toMatch(/ΗΚΑΙ/); expect(atText(s, '18:30')).toBe('18:30'); expect(atText(s, undefined)).toBe('όπως η Δύναμη');
  });
});

// ------------------------------------------------------------------ στο έντυπο
const baseOpts = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΑΤΑΣΤΑΣΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }], ...x });
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const VALS: ValueTable[] = [{ id: 'v1', title: 'ΔΥΝΑΜΗ', rows: [
  { label: 'Ενεργές άδειες = ΚΑ + Τιμητικές + ΔΝ', expr: [T('st.LEAVE'), T('st.HON'), T('st.DN')] },
  { label: 'Σε δύναμη', expr: [T('str.total')] },
  { label: '% παρόντων', expr: [T('str.present')], percentOf: [T('str.total')] }] }];
const grid = async (data: Buffer) => (await (await Workbook.open(data)).values(0, 80, 12)) as (string | number | null)[][];
const find = (g: (string | number | null)[][], v: string) => g.findIndex(r => (r || []).some(x => x === v));

describe('Πίνακες τιμών στο έντυπο', () => {
  const clock = { today: D, now: 12 * 60 };
  it('κάτω από τον πίνακα ατόμων και πριν τις υπογραφές· οι υπογραφές μένουν τελευταίες', async () => {
    const s = seed(); const o = baseOpts({ sig: 'both' }); const b = await buildTemplate(o, 'people');
    const r = withBuilt(rep({ vals: VALS, at: 'hkai' }), b, o);
    const sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
    const out = await fillReport(b.data, s, { ...r, sigs }, s.people.slice(0, 6).map(p => p.id), D, { clock });
    const g = await grid(out.data);
    const last = find(g, s.people[5].last + ' ' + s.people[5].first), title = find(g, 'ΔΥΝΑΜΗ'), lab = find(g, 'ΕΝΕΡΓΕΣ ΑΔΕΙΕΣ = ΚΑ + ΤΙΜΗΤΙΚΕΣ + ΔΝ'), sig = find(g, 'ΕΠΟΠΤΗΣ');
    expect(last).toBeGreaterThan(-1); expect(title).toBeGreaterThan(last + 0); expect(lab).toBeGreaterThan(title); expect(sig).toBeGreaterThan(lab + 2);
    // κενή γραμμή ανάμεσα στον πίνακα ατόμων και στον πίνακα τιμών
    expect(title - last).toBeGreaterThanOrEqual(2);
    const row = g[lab].filter(x => x != null); const exp = evalValue(s, D, HK, VALS[0].rows[0].expr);
    expect(row[row.length - 1]).toBe(exp);
    const tot = g[find(g, 'ΣΕ ΔΥΝΑΜΗ')].filter(x => x != null); expect(tot[tot.length - 1]).toBe(40);
    const pr = g[find(g, '% ΠΑΡΟΝΤΩΝ')].filter(x => x != null); expect(pr[pr.length - 1]).toBeCloseTo(evalValue(s, D, HK, [T('str.present')]) / 40, 10);
  });
  it('ποσοστό: μορφή κελιού στο xlsx (0%) και αριθμός στο κελί', async () => {
    const s = seed(); const o = baseOpts(); const b = await buildTemplate(o, 'people');
    const r = withBuilt(rep({ vals: VALS }), b, o);
    const out = await fillReport(b.data, s, r, s.people.slice(0, 3).map(p => p.id), D, { clock });
    const wb = await Workbook.open(out.data); const g = await grid(out.data); const ri = find(g, '% ΠΑΡΟΝΤΩΝ');
    const ci = g[ri].findIndex(x => typeof x === 'number'); expect(ci).toBeGreaterThan(-1);
    expect(g[ri][ci]).toBeCloseTo(evalValue(s, D, HK, [T('str.present')]) / 40, 10);
    const z = await (await import('jszip')).default.loadAsync(await wb.save());
    expect(await z.file('xl/styles.xml')!.async('string')).toMatch(/numFmtId="9" fontId/);   // 0% είναι η ενσωματωμένη μορφή 9
  });
  it('στιγμή μέτρησης στο έντυπο: 08:00 και 18:00 δίνουν διαφορετικό «Απόντες»', async () => {
    const s = seed(); const o = baseOpts(); const b = await buildTemplate(o, 'people');
    const vals: ValueTable[] = [{ id: 'v', rows: [{ label: 'Απόντες', expr: [T('str.away')] }] }];
    const val = async (at: string) => { const r = withBuilt(rep({ vals, at }), b, o); const out = await fillReport(b.data, s, r, [1], D, { clock }); const g = await grid(out.data); const x = g[find(g, 'ΑΠΟΝΤΕΣ')].filter(v => v != null); return x[x.length - 1] as number; };
    const v8 = await val('08:00'), v18 = await val('18:00');
    expect(v8).toBe(ev(s, [T('str.away')], 8 * 60)); expect(v18).toBe(ev(s, [T('str.away')], 18 * 60)); expect(v18).toBeGreaterThan(v8);
  });
  it('έντυπο μόνο με πίνακα τιμών (χωρίς άτομα): γεμίζει και έχει τα κελιά, υπογραφές από κάτω', async () => {
    const s = seed(); const o = baseOpts({ nopeople: true, cols: [], title: 'ΔΥΝΑΜΗ ΜΟΝΑΔΑΣ' }); const b = await buildTemplate(o, 'people');
    const r = withBuilt(rep({ vals: VALS, at: 'hkai' }), b, o);
    expect(r.cols).toEqual([]);
    const out = await fillReport(b.data, s, { ...r, sigs: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] }, s.people.map(p => p.id), D, { clock });   // τα άτομα αγνοούνται: χωρίς στήλες
    const g = await grid(out.data);
    expect(find(g, 'ΔΥΝΑΜΗ ΜΟΝΑΔΑΣ')).toBeGreaterThan(-1);
    const lab = find(g, 'ΣΕ ΔΥΝΑΜΗ'); expect(lab).toBeGreaterThan(-1); expect(g[lab].filter(x => x != null).pop()).toBe(40);
    expect(find(g, 'ΕΠΟΠΤΗΣ')).toBeGreaterThan(find(g, '% ΠΑΡΟΝΤΩΝ'));
    expect(find(g, 'ΣΕ ΔΥΝΑΜΗ')).toBeLessThan(15); expect(out.warnings).toEqual([]);
  });
  it('δύο πίνακες τιμών: μία κενή γραμμή ανάμεσα, ο καθένας με τον τίτλο του', async () => {
    const s = seed(); const o = baseOpts({ nopeople: true, cols: [] }); const b = await buildTemplate(o, 'people');
    const vals: ValueTable[] = [{ id: 'a', title: 'ΠΡΩΤΟΣ', rows: [{ label: 'Α', expr: [T('str.total')] }] }, { id: 'b', title: 'ΔΕΥΤΕΡΟΣ', rows: [{ label: 'Β', expr: [T('str.away')] }] }];
    const out = await fillReport(b.data, s, withBuilt(rep({ vals }), b, o), [], D, { clock }); const g = await grid(out.data);
    const a = find(g, 'ΠΡΩΤΟΣ'), c = find(g, 'ΔΕΥΤΕΡΟΣ');
    expect(c - a).toBe(3);
  });
  it('μέτρηση που σβήστηκε: προειδοποίηση και το έντυπο βγαίνει', async () => {
    const s = seed(); const o = baseOpts(); const b = await buildTemplate(o, 'people');
    const vals: ValueTable[] = [{ id: 'v', rows: [{ label: 'Χ', expr: [T('duty.b:ΧΑΘΗΚΕ')] }, { label: 'Υ', expr: [T('str.total')] }] }];
    const out = await fillReport(b.data, s, withBuilt(rep({ vals }), b, o), [1], D, { clock });
    expect(out.warnings.join(' ')).toMatch(/δεν υπάρχει πια/);
  });
  it('φύλλα ανά ομάδα: οι πίνακες τιμών μπαίνουν σε κάθε φύλλο', async () => {
    const s = seed(); const o = baseOpts(); const b = await buildTemplate(o, 'people');
    const r = withBuilt(rep({ vals: VALS, group: 'room' } as Partial<Report>), b, o);
    const out = await fillReport(b.data, s, r, s.people.map(p => p.id), D, { clock });
    const wb = await Workbook.open(out.data);
    for (let i = 0; i < out.sheets.length; i++) { const v = (await wb.values(i, 80, 12)) as (string | number | null)[][]; expect(find(v, 'ΣΕ ΔΥΝΑΜΗ'), out.sheets[i]).toBeGreaterThan(-1); }
  });
});

describe('Τα παλιά έντυπα βγαίνουν ίδια', () => {
  it('χωρίς πίνακες τιμών (ή με κενούς): ίδιο xlsx byte-προς-byte περιεχόμενο φύλλου', async () => {
    const s = seed(); const o = baseOpts({ sig: 'both' }); const b = await buildTemplate(o, 'people'); const ids = s.people.slice(0, 8).map(p => p.id);
    const a = await fillReport(b.data, s, withBuilt(rep({}), b, o), ids, D);
    const e = await fillReport(b.data, s, withBuilt(rep({ vals: [{ id: 'x', rows: [{ label: 'α', expr: [] }] }], at: '18:00' }), b, o), ids, D);
    expect(await grid(e.data)).toEqual(await grid(a.data)); expect(e.warnings).toEqual(a.warnings);
  });
});
