// «Στήλη ΗΚΑΙ» ανά υπηρεσία (BlockDef.hkCol, 17/11) και όπλο ΑΠΩΝ για υπηρεσίες εκτός στρατοπέδου.
// (α) μεμονωμένες περιπτώσεις με σωστά νούμερα, (β) τυχαίο σύνολο καταστάσεων με ανεξάρτητο μοντέλο και συνέπεια Σήμερα/Δύναμη/ΗΚΑΙ,
// (γ) όπλα: ΑΠΩΝ ως προς ΕΚΤΟΣ, φίλτρα, κεφαλίδα, φύλλο ΑΠΟΝΤΑ, Μητρώο, (δ) χωρίς hkCol (ή με την προεπιλογή) ό,τι βγαίνει είναι το ίδιο.
// Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, emptyState, type AppState, type BlockDef, type Status } from '../src/shared/domain';
import { addDays, type ISODate } from '../src/shared/dates';
import { HK_A, HK_K, hkaiClassify, hkaiCounts, hkMin, kolView, postsOf, strengthOf, awayText, SVC_AWAY_LBL } from '../src/shared/rules';
import { SVC_KOL_COLS, svcAbsent, svcColOk, svcDefault } from '../src/shared/ranks';
import { strengthView } from '../src/shared/strengthView';
import { fakeState } from './fixtures';
import { genHkState, DAYS } from './hk-gen';
import { fillHkai } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { assetSheets, registry, rowPlace, totalsSheet, assetCfgOf } from '../src/shared/assets';
import { AWAY_KEY, WEAPON_FILTERS, WEAPON_COLS, awayPeople, exOutPeople, inOutText, isAbsent, isOut, outPeople, outReasonOf, weaponInfo, weaponMatch, weaponSheets, type WeaponFilter } from '../src/shared/weapons';
import { outHeadTxt } from '../src/shared/weaponView';
import { armedRows } from '../src/shared/armed';
import { upper } from '../src/shared/text';

const D = '2026-11-17';
let n = 0;
const ctx = { today: D, newId: () => 'h' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hm = (m: number) => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
const ids = (l: { id: number }[]) => l.map(p => p.id).sort((a, b) => a - b);
const ALL_COLS = [...SVC_KOL_COLS.map(x => x[0]), ...HK_A.map(x => x[0])];

// ένα στρατόπεδο με 14 στρατιώτες· οι δικές σου υπηρεσίες: «ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ» (ένοπλη, 15:00-22:00, 2 άτομα) με στήλη hkCol, και μία κανονική ένοπλη «ΠΥΛΗ»
function camp(hkCol?: string, o: { armWeapon?: 'own' | 'post'; hrs?: string; per?: number; nums?: number; shift?: { every: number } } = {}) {
  let k = 0; const run = (st: AppState, c: Command) => apply(st, c, { today: D, newId: () => 'blk' + ++k }).state;   // ίδια κλειδιά θέσεων σε κάθε κλήση
  let s = fakeState(14);
  s = { ...s, people: s.people.map(p => ({ ...p, weapon: String(5000 + p.id), wtype: 'G3A3' })) };
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Φυλάκιο Ποταμού', kind: 'other', armed: true, n: o.nums ?? 1, per: o.per ?? 2, hrs: o.hrs ?? '15:00-22:00', ...(o.shift ? { shift: o.shift } : {}), armWeapon: o.armWeapon ?? 'own', ...(hkCol ? { hkCol } : {}) });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Πύλη', kind: 'other', armed: true, n: 1, per: 1, hrs: '15:00-22:00' });
  const bs = blocksOf(s.settings); const post = bs.find(b => b.name === 'Φυλάκιο Ποταμού')!, gate = bs.find(b => b.name === 'Πύλη')!;
  return { s, post, gate, pk: post.posts.map(p => p.k), gk: gate.posts[0].k };
}
const withGuards = (s: AppState, g: Record<string, number>, d = D): AppState => ({ ...s, guards: { ...s.guards, [d]: g } });
const stat = (pid: number, type: string, extra: Partial<Status> = {}, d = D): Status => ({ id: 's' + ++n, pid, type, from: d, to: d, ...extra } as Status);

describe('hkCol: εντολές και έλεγχος τιμής', () => {
  it('addBlock/editBlock κρατούν έγκυρη στήλη, πετούν την άκυρη και την προεπιλογή, το κενό την καθαρίζει', () => {
    const { s, post } = camp('fyl');
    expect(post.hkCol).toBe('fyl');
    const ed = (hkCol: string | undefined, base = s) => blocksOf(run(base, { t: 'editBlock', phase: base.settings.phase, id: post.id, name: post.name, hrs: {}, ...(hkCol !== undefined ? { hkCol } : {}) }).settings).find(b => b.id === post.id)!;
    expect(ed(undefined).hkCol).toBe('fyl');                // δεν ήρθε: όπως πριν
    expect(ed('kin').hkCol).toBe('kin');
    expect(ed('allh').hkCol).toBe('allh');
    expect(ed('').hkCol).toBeUndefined();                    // η προεπιλογή του πεδίου
    expect(ed('nope').hkCol).toBeUndefined();               // άγνωστο κλειδί: προεπιλογή
    expect(ed('bl').hkCol).toBeUndefined();                  // η κενή στήλη του εντύπου δεν διαλέγεται
    expect(ed('yp').hkCol).toBeUndefined();                  // = προεπιλογή του είδους
    expect(camp('zzz').post.hkCol).toBeUndefined();
    expect(camp('mag').post.hkCol).toBe('mag');              // άλλο είδος από μαγειρεία: η στήλη Μαγειρεία ΔΕΝ είναι η προεπιλογή του
    // όλα τα κλειδιά της ΗΚΑΙ εκτός της κενής περνούν
    for (const k of ALL_COLS) expect(svcColOk(k)).toBe(k);
    expect(svcColOk('bl')).toBeUndefined(); expect(svcColOk(undefined)).toBeUndefined(); expect(svcColOk(5)).toBeUndefined();
    expect(svcAbsent('fyl')).toBe(true); expect(svcAbsent('kin')).toBe(false); expect(svcAbsent(undefined)).toBe(false);
    expect(svcDefault('mg')).toBe('mag'); expect(svcDefault('th')).toBe('yp');
  });
  it('μαγειρεία: η προεπιλογή μένει «mag», η «Υπηρεσία» διαλέγεται ρητά', () => {
    const s0 = fakeState(6); const mg = blocksOf(s0.settings).find(b => b.kind === 'mg')!;
    const s = run(s0, { t: 'editBlock', phase: s0.settings.phase, id: mg.id, name: mg.name, hrs: {}, hkCol: 'yp' });
    expect(blocksOf(s.settings).find(b => b.id === mg.id)!.hkCol).toBe('yp');
    const s2 = run(s0, { t: 'editBlock', phase: s0.settings.phase, id: mg.id, name: mg.name, hrs: {}, hkCol: 'mag' });
    expect(blocksOf(s2.settings).find(b => b.id === mg.id)!.hkCol).toBeUndefined();
    const k = mg.posts[0].k;
    expect(ids(hkaiCounts(withGuards(s0, { [k]: 3 }), D).cols.mag)).toEqual([3]);
    expect(ids(hkaiCounts(withGuards(s2, { [k]: 3 }), D).cols.mag)).toEqual([3]);
    const h = hkaiCounts(withGuards(s, { [k]: 3 }), D); expect(ids(h.cols.yp)).toEqual([3]); expect(h.cols.mag).toEqual([]);
  });
});

describe('hkCol: ΗΚΑΙ, Δύναμη, Σήμερα', () => {
  const base = () => camp();
  it('στήλη απόντων (Φυλάκια): στη στήλη, Σύνολο απόντων +n, Διαθέσιμοι −n, Υπηρεσία εντός −n', () => {
    const b = base(), a = camp('fyl');
    const g = { [b.pk[0]]: 1, [b.pk[1]]: 2, [b.gk]: 3 };
    const h0 = hkaiCounts(withGuards(b.s, g), D), h1 = hkaiCounts(withGuards(a.s, g), D);
    expect(ids(h0.cols.yp)).toEqual([1, 2, 3]); expect(h0.cols.fyl).toEqual([]);
    expect(ids(h1.cols.fyl)).toEqual([1, 2]); expect(ids(h1.cols.yp)).toEqual([3]);
    expect(h1.apo).toBe(h0.apo + 2); expect(h1.kol).toBe(h0.kol - 2); expect(h1.avail).toBe(h0.avail - 2); expect(h1.total).toBe(h0.total);
    // η γραμμή της βαθμίδας: φυλάκια +2, υπηρεσία −2
    const row = (h: ReturnType<typeof hkaiCounts>) => Object.values(h.rank).reduce((t, r) => ({ fyl: t.fyl + (r.c.fyl || 0), yp: t.yp + (r.c.yp || 0) }), { fyl: 0, yp: 0 });
    expect(row(h1).fyl).toBe(row(h0).fyl + 2); expect(row(h1).yp).toBe(row(h0).yp - 2);
  });
  it('στήλη κωλυομένων (Σε κίνηση): μετρά εκεί και μένει παρών στη Δύναμη', () => {
    const b = base(), a = camp('kin'); const g = { [b.pk[0]]: 1, [b.pk[1]]: 2 };
    const h0 = hkaiCounts(withGuards(b.s, g), D), h1 = hkaiCounts(withGuards(a.s, g), D);
    expect(ids(h1.cols.kin)).toEqual([1, 2]); expect(h1.cols.yp).toEqual([]);
    expect(h1.kol).toBe(h0.kol); expect(h1.apo).toBe(h0.apo); expect(h1.avail).toBe(h0.avail);
    const c0 = strengthOf(withGuards(b.s, g), D), c1 = strengthOf(withGuards(a.s, g), D);
    expect(c1.present).toBe(c0.present); expect(c1.absent).toBe(c0.absent); expect(c1.awaySvc).toEqual([]);
    expect(kolView(withGuards(a.s, g), D).cols.kin.map(p => p.id).sort()).toEqual([1, 2]);
  });
  it('η απουσία και ο κωλυόμενος της ίδιας μέρας νικούν· το ΕΥ όχι (όπως η υπηρεσία νικά το ΕΥ σήμερα)', () => {
    const a = camp('fyl');
    const g2 = { [a.pk[0]]: 1, [a.pk[1]]: 2, 'th1': 3, 'th2': 4, 'th3': 6, 'th4': 7 };
    const s: AppState = { ...withGuards(a.s, g2), statuses: [stat(1, 'LEAVE', { kind: 'Κανονική' }), stat(2, 'KOL', { note: 'ΣΤΕΠ', minus: true, hkCol: 'os' }), stat(3, 'NOS'), stat(4, 'EY')] };
    const h = hkaiCounts(s, D);
    expect(ids(h.cols.ka)).toEqual([1]); expect(ids(h.cols.os)).toEqual([2]); expect(ids(h.cols.nos)).toEqual([3]);
    expect(h.cols.fyl).toEqual([]);
    // οι θαλαμοφύλακες 4, 6, 7 στην προεπιλογή yp (ο 4 έχει και ΕΥ: νικά η υπηρεσία)
    expect(ids(h.cols.yp)).toEqual([4, 6, 7]); expect(h.cols.ey).toEqual([]);
    // ΕΥ + υπηρεσία εκτός: νικά η υπηρεσία (όπως το yp σήμερα)
    const s2 = { ...withGuards(a.s, { [a.pk[0]]: 4 }), statuses: [stat(4, 'EY')] };
    expect(ids(hkaiCounts(s2, D).cols.fyl)).toEqual([4]); expect(hkaiCounts(s2, D).cols.ey).toEqual([]);
    // ΣΤΕΠ (κωλυόμενος αυτόματα): ο ΣΤΕΠ νικά και μένει στην προεπιλογή (δεν γίνεται απών)
    const s3 = { ...withGuards(a.s, { [a.pk[0]]: 4 }), statuses: [stat(4, 'STEP')] };
    expect(hkaiCounts(s3, D).cols.fyl).toEqual([]); expect(strengthOf(s3, D, hkMin(s3.rules)).awaySvc).toEqual([]);
    // ένα νούμερο αύριο δεν αγγίζει σήμερα
    expect(hkaiCounts(withGuards(a.s, { [a.pk[0]]: 4 }, addDays(D, 1)), D).cols.fyl).toEqual([]);
  });
  it('Δύναμη και Σήμερα: απόντες λόγω υπηρεσίας, σε όλες τις ώρες της μέρας· σύνολο ίδιο', () => {
    const a = camp('fyl'), b = base(); const g = { [a.pk[0]]: 1, [a.pk[1]]: 2, [a.gk]: 3 };
    const s = withGuards(a.s, g), s0 = withGuards(b.s, g);
    for (const at of [hkMin(s.rules), 9 * 60, 13 * 60 + 30, 17 * 60, 23 * 60]) {
      const c = strengthOf(s, D, at), c0 = strengthOf(s0, D, at), v = strengthView(s, D, at);
      expect(ids(c.awaySvc)).toEqual([1, 2]); expect(c.absent).toBe(c0.absent + 2); expect(c.present).toBe(c0.present - 2); expect(c.total).toBe(c0.total);
      expect(awayText(c)).toContain('2 ' + SVC_AWAY_LBL);
      expect(v.absent).toBe(c.absent); expect(v.present + v.kol + v.absent).toBe(v.total);
      const grp = v.cats.away.groups.find(x => x.key === 'svc')!; expect(grp.rows.map(r => r.p.id).sort()).toEqual([1, 2]);
      expect(ids(kolViewPeople(s, at))).toEqual([]);
    }
    // χωρίς υπηρεσία εκτός δεν αλλάζει τίποτα στο κείμενο
    expect(awayText(strengthOf(s0, D))).not.toContain(SVC_AWAY_LBL);
  });
});
const kolViewPeople = (s: AppState, at: number) => kolView(s, D, at).minus.map(x => x.p);

// ---------- (β) τυχαίο σύνολο με ανεξάρτητο μοντέλο ----------
// Μοντέλο (χωρίς τον κώδικα των κανόνων): ποιος είναι σε ποια υπηρεσία → ποια στήλη. Καταστάσεις χωρίς ώρες: Κανονική άδεια (ka), Νοσοκομείο (nos),
// κωλυόμενος με αφαίρεση (η στήλη του), ΕΥ. Σειρά: απουσία, κωλυόμενος, υπηρεσία, ΕΥ.
function randomWorld(seed: number) {
  const r = rng(seed); const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  let s = fakeState(16); s = { ...s, people: s.people.map((p, i) => ({ ...p, active: i !== 7 || r() < 0.5 })) };
  const blocks: BlockDef[] = blocksOf(s.settings).map(b => (b.kind === 'ly' || r() < 0.35 ? b : { ...b, ...(r() < 0.8 ? { hkCol: pick(ALL_COLS) } : {}) }));
  // κάποιο μπλοκ με στήλη απόντων σχεδόν πάντα
  const i = Math.floor(r() * blocks.length); if (blocks[i].kind !== 'ly') blocks[i] = { ...blocks[i], hkCol: pick(HK_A.map(x => x[0])) };
  s = { ...s, settings: { ...s.settings, blocks } };
  const posts = postsOf(s.settings);
  const days = DAYS.slice(0, 7); const statuses: Status[] = [];
  for (const p of s.people) if (r() < 0.6) {
    const from = pick(days); const to = addDays(from, Math.floor(r() * 3)); const t = r();
    statuses.push(t < 0.3 ? stat(p.id, 'LEAVE', { kind: 'Κανονική', from, to }) : t < 0.45 ? stat(p.id, 'NOS', { from, to }) : t < 0.7 ? stat(p.id, 'KOL', { note: 'ΣΤΕΠ', minus: true, hkCol: pick(['-', ...SVC_KOL_COLS.map(x => x[0])]), from, to }) : stat(p.id, 'EY', { from, to }));
  }
  const guards: AppState['guards'] = {};
  for (const d of days) { const g: Record<string, number> = {}; for (const po of posts) if (r() < 0.3) g[po.k] = 1 + Math.floor(r() * 16); guards[d] = g; }
  return { s: { ...s, statuses, guards }, days, blocks };
}
// η προεπιλεγμένη στήλη της υπηρεσίας του (μαγειρεία 'mag', αλλιώς 'yp'), για όποιον έχει υπηρεσία εκτός με κωλυόμενο «χωρίς στήλη»
function defaultOf(s: AppState, pid: number, d: ISODate): string {
  const kb = new Map<string, BlockDef>(); for (const b of blocksOf(s.settings)) for (const p of b.posts) kb.set(p.k, b);
  const ks = Object.entries(s.guards[d] || {}).filter(([, q]) => q === pid).map(([k]) => kb.get(k)).filter((b): b is BlockDef => !!b);
  const last = ks.find(b => b.hkCol && HK_A.some(x => x[0] === b.hkCol)) ?? ks[ks.length - 1]; return last && last.kind === 'mg' ? 'mag' : 'yp';
}
function model(s: AppState, d: ISODate): Map<number, string | null> {
  const blocks = blocksOf(s.settings); const keyBlock = new Map<string, BlockDef>(); for (const b of blocks) for (const p of b.posts) keyBlock.set(p.k, b);
  const duty = new Map<number, string>();   // pid → στήλη της υπηρεσίας: ο τελευταίος γράφει, η στήλη απόντων δεν χάνεται
  for (const [k, pid] of Object.entries(s.guards[d] || {})) {
    const b = keyBlock.get(k); if (!b) continue;
    const col = b.hkCol && ALL_COLS.includes(b.hkCol) ? b.hkCol : b.kind === 'mg' ? 'mag' : 'yp';
    const prev = duty.get(pid); if (prev && HK_A.some(x => x[0] === prev) && !HK_A.some(x => x[0] === col)) continue; duty.set(pid, col);
  }
  const out = new Map<number, string | null>();
  for (const p of s.people.filter(x => x.active)) {
    const st = s.statuses.filter(x => x.pid === p.id && x.from <= d && d <= x.to);
    const lv = st.find(x => x.type === 'LEAVE'), nos = st.find(x => x.type === 'NOS'), kol = st.find(x => x.type === 'KOL' && x.minus), ey = st.find(x => x.type === 'EY');
    // κωλυόμενος «χωρίς στήλη» ('-'): δεν μπαίνει σε στήλη κωλυομένων, και η υπηρεσία του μετρά όπως πάντα (ποτέ απών)
    const dc = duty.get(p.id), dflt = dc && HK_A.some(x => x[0] === dc) ? 'DEFAULT' : dc;
    out.set(p.id, lv ? 'ka' : nos ? 'nos' : kol && kol.hkCol !== '-' ? kol.hkCol! : kol ? (dflt === 'DEFAULT' ? defaultOf(s, p.id, d) : dflt ?? (ey ? 'ey' : null)) : dc ?? (ey ? 'ey' : null));
  }
  return out;
}
describe('hkCol: τυχαίο σύνολο (200 μέρες) απέναντι σε ανεξάρτητο μοντέλο', () => {
  it('η στήλη κάθε στρατιώτη, τα σύνολα και η συνέπεια Σήμερα/Δύναμη/ΗΚΑΙ', () => {
    const errs: string[] = []; let checked = 0, away = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { s, days } = randomWorld(seed);
      for (const d of days) {
        checked++; const m = model(s, d); const h = hkaiCounts(s, d); const E = (t: string) => errs.push('s' + seed + ' ' + d + ' ' + t);
        const got = new Map<number, string | null>(); for (const w of hkaiClassify(s, d).who) if (w.kind === 'soldier') got.set(w.p!.id, w.col);
        for (const [pid, col] of m) if (got.get(pid) !== col) E('p' + pid + ' ' + got.get(pid) + ' ≠ ' + col);
        const sets = (col: string) => [...m].filter(([, c]) => c === col).map(([p]) => p).sort((a, b) => a - b);
        for (const col of ALL_COLS) if (ids(h.cols[col]).join() !== sets(col).join()) E('στήλη ' + col + ' ' + ids(h.cols[col]) + ' ≠ ' + sets(col));
        const apoS = [...m.values()].filter(c => c && HK_A.some(x => x[0] === c)).length, kolS = [...m.values()].filter(c => c && HK_K.some(x => x[0] === c)).length;
        if (h.soldiers !== m.size) E('στρατιώτες');
        if (h.apo - (h.apo - HK_A.reduce((t, [k]) => t + h.cols[k].length, 0)) !== apoS) E('απόντες');
        if (HK_K.reduce((t, [k]) => t + h.cols[k].length, 0) !== kolS) E('κωλυόμενοι');
        if (h.avail !== h.total - h.apo) E('διαθέσιμοι');
        // Σήμερα / Δύναμη: απών = άδεια ή νοσοκομείο ή υπηρεσία εκτός· ΗΚΑΙ απόντες στρατιώτες = οι ίδιοι
        const at = hkMin(s.rules), c = strengthOf(s, d, at), v = strengthView(s, d, at), kv = kolView(s, d, at);
        const awayIds = [...m].filter(([, col]) => col && HK_A.some(x => x[0] === col)).map(([p]) => p).sort((a, b) => a - b);
        const svcIds = awayIds.filter(p => !s.statuses.some(x => x.pid === p && x.from <= d && d <= x.to && (x.type === 'LEAVE' || x.type === 'NOS')));
        away += svcIds.length;
        if (ids(c.awaySvc).join() !== svcIds.join()) E('awaySvc ' + ids(c.awaySvc) + ' ≠ ' + svcIds);
        const ihkAway = HK_A.flatMap(([k]) => h.cols[k]).map(p => p.id).sort((a, b) => a - b);
        const sAway = [...Object.values(c.awayLists).flat(), ...c.awaySvc].map(p => p.id).sort((a, b) => a - b);
        if (ihkAway.join() !== sAway.join()) E('ΗΚΑΙ απόντες ' + ihkAway + ' ≠ Σήμερα ' + sAway);
        if (c.absent !== sAway.length || v.absent !== c.absent) E('απόντες Σήμερα/Δύναμη ' + c.absent + '/' + v.absent + ' ≠ ' + sAway.length);
        if (v.present + v.kol + v.absent !== v.total || c.present !== v.present + kv.minus.length) E('Π+Κ+Α');
        if (kv.minus.length !== v.kol) E('κωλυόμενοι Δύναμης');
        if (ids(kv.minus.map(x => x.p)).join() !== [...m].filter(([p]) => s.statuses.some(x => x.pid === p && x.type === 'KOL' && x.minus && x.from <= d && d <= x.to) && !s.statuses.some(x => x.pid === p && x.from <= d && d <= x.to && (x.type === 'LEAVE' || x.type === 'NOS'))).map(([p]) => p).sort((a, b) => a - b).join()) E('kolView.minus');
        // οι κωλυόμενοι της ΗΚΑΙ (στήλες κωλυομένων) = οι παρόντες που βγάζει το kolView.cols
        const kc = Object.values(kv.cols).flat().map(p => p.id).sort((a, b) => a - b);
        if (kc.join() !== HK_K.flatMap(([k]) => h.cols[k] || []).map(p => p.id).sort((a, b) => a - b).join()) E('kolView.cols ≠ ΗΚΑΙ κωλυόμενοι');
        if (awayText(c).split(' · ').filter(Boolean).reduce((t, x) => t + parseInt(x, 10), 0) !== c.absent) E('awayText');
      }
    }
    expect(checked).toBe(210); expect(away).toBeGreaterThan(30);   // το δείγμα έχει πράγματι υπηρεσίες εκτός
    expect(errs.slice(0, 20)).toEqual([]);
  });
});

// ---------- (γ) όπλα ----------
describe('όπλα: ΑΠΩΝ για υπηρεσία εκτός στρατοπέδου', () => {
  const wState = (hkCol: string | undefined, o: { armWeapon?: 'own' | 'post'; per?: number } = {}) => { const c = camp(hkCol, o); return { ...c, s: withGuards(c.s, { [c.pk[0]]: 1, ...(c.pk[1] ? { [c.pk[1]]: 2 } : {}), [c.gk]: 3 }) }; };
  it('δικό του όπλο: ΑΠΩΝ μέσα στις ώρες (με περιθώριο 15′) ΜΟΝΟ για τους δύο του φυλακίου· η Πύλη μένει ΕΚΤΟΣ', () => {
    const { s } = wState('fyl'); const t = (i: number) => s.people[i - 1];
    const live = weaponInfo(s, D, '18:00');
    expect(inOutText(t(1), live)).toBe('ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:45–22:15'); expect(inOutText(t(2), live)).toBe('ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:45–22:15');
    expect(inOutText(t(3), live)).toBe('ΕΚΤΟΣ: Πύλη 14:45–22:15');
    expect(inOutText(t(4), live)).toBe('ΕΝΤΟΣ');
    expect(isAbsent(live, 1)).toBe(true); expect(isAbsent(live, 3)).toBe(false);
    expect([1, 2, 3].every(p => isOut(live, p))).toBe(true);   // το ΑΠΩΝ δεν είναι στον οπλοβαστό
    expect(outReasonOf(live, 1)).toBe(AWAY_KEY); expect(live.away.has(3)).toBe(false); expect(live.out.has(1)).toBe(false);
    // έξω από τις ώρες: ΕΝΤΟΣ, και πριν/μετά τίποτα
    for (const hm of ['05:00', '14:30', '22:30', '23:30']) { const i = weaponInfo(s, D, hm); expect(inOutText(t(1), i)).toBe('ΕΝΤΟΣ'); expect(i.away.size).toBe(0); }
    // ακριβώς στο περιθώριο
    expect(weaponInfo(s, D, '14:45').away.has(1)).toBe(true); expect(weaponInfo(s, D, '20:14').away.has(1)).toBe(true); expect(weaponInfo(s, D, '22:15').away.has(1)).toBe(false);
    // όλη η μέρα (χωρίς ώρα): ΑΠΩΝ με τις ώρες του νούμερου
    expect(inOutText(t(1), weaponInfo(s, D))).toBe('ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:45–22:15');
  });
  it('χωρίς στήλη απόντων (ή στήλη κωλυομένων) όλα μένουν ΕΚΤΟΣ όπως σήμερα', () => {
    for (const col of [undefined, 'kin', 'yp']) {
      const { s } = wState(col); const i = weaponInfo(s, D, '18:00');
      expect(inOutText(s.people[0], i)).toBe('ΕΚΤΟΣ: ' + armedRows(s, D).find(r => r.who === 1)!.label + ' 14:45–22:15');
      expect(i.away.size).toBe(0); expect(i.awayName.size).toBe(0);
      expect(weaponSheets(s, D).some(x => x.name === 'ΑΠΟΝΤΑ')).toBe(false);
    }
  });
  it('όπλο της θέσης: απόν μόνο το όπλο που περνά από χέρι σε χέρι· των άλλων ΕΝΤΟΣ', () => {
    // δύο νούμερα των 12 ωρών, ένα άτομο στο καθένα: το όπλο του 1ου περνά στον 2ο
    const c = camp('fyl', { armWeapon: 'post', per: 1, nums: 2, shift: { every: 720 } }); const s = withGuards(c.s, { [c.pk[0]]: 1, [c.pk[1]]: 2 });
    const rows = armedRows(s, D); expect(rows.map(r => [r.who, r.owner])).toEqual([[1, 1], [2, 1]]);
    const mid = (r: typeof rows[number]) => hm(Math.floor((r.out + r.in) / 2)), midDay = (r: typeof rows[number]) => addDays(D, Math.floor(Math.floor((r.out + r.in) / 2) / 1440));   // το νούμερο μπορεί να πέφτει μετά τα μεσάνυχτα
    for (const r of rows) {
      const i = weaponInfo(s, midDay(r), mid(r));
      expect([...i.away.keys()]).toEqual([1]);                                  // μόνο το όπλο της θέσης (του 1ου) είναι ΑΠΩΝ, όποιος κι αν το κρατά
      expect(inOutText(s.people[0], i)).toMatch(/^ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ \d\d:\d\d–\d\d:\d\d$/);
      expect(inOutText(s.people[1], i)).toBe('ΕΝΤΟΣ');                          // το δικό του όπλο του 2ου μένει στον οπλοβαστό
      expect(inOutText(s.people[2], i)).toBe('ΕΝΤΟΣ');
    }
    // όλη η μέρα: μία γραμμή ΑΠΩΝ από την πρώτη έξοδο ως την τελευταία είσοδο
    const d = weaponInfo(s, D); expect([...d.away.keys()]).toEqual([1]);
    expect(d.away.get(1)).toBe('ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ ' + hm(rows[0].out) + '–' + hm(rows[1].in));
    // δικό του: ο καθένας με το δικό του όπλο στο δικό του νούμερο
    const o = camp('fyl', { armWeapon: 'own', per: 1, nums: 2, shift: { every: 720 } }); const so = withGuards(o.s, { [o.pk[0]]: 1, [o.pk[1]]: 2 });
    const ro = armedRows(so, D); expect(weaponInfo(so, D).away.size).toBe(2);
    expect([...weaponInfo(so, midDay(ro[0]), mid(ro[0])).away.keys()]).toEqual([1]); expect([...weaponInfo(so, midDay(ro[1]), mid(ro[1])).away.keys()]).toEqual([2]);
  });
  it('φίλτρα, μετρητές κεφαλίδας και σύνολα: ΑΠΩΝ ξεχωριστά, και μέσα στα εκτός', () => {
    const { s } = wState('fyl'); const i = weaponInfo(s, D, '18:00'); const m = (f: WeaponFilter) => s.people.filter(p => weaponMatch(f, p, i)).map(p => p.id);
    expect(m('away')).toEqual([1, 2]); expect(m('out')).toEqual([3]);           // το «Εκτός» δεν ξαναμετρά τα απόντα
    expect(m('with')).toHaveLength(14);
    expect(WEAPON_FILTERS.map(x => x[0])).toContain('away'); const fi = WEAPON_FILTERS.findIndex(x => x[0] === 'away'); expect(WEAPON_FILTERS[fi - 1][0]).toBe('out');
    expect(WEAPON_FILTERS[fi].slice(1, 3)).toEqual(['Απόντα', 'ΑΠΟΝΤΑ']);
    expect(ids(outPeople(s.people, i))).toEqual([1, 2, 3]); expect(ids(awayPeople(s.people, i))).toEqual([1, 2]); expect(ids(exOutPeople(s.people, i))).toEqual([3]);
    expect(outHeadTxt(outPeople(s.people, i).length, awayPeople(s.people, i).length)).toBe('3, εκ των οποίων 2 απόντα');
    expect(outHeadTxt(3, 0)).toBe('3');
    // εντός + εκτός + απόντα = όσοι με όπλο
    const inside = s.people.filter(p => !isOut(i, p.id)).length; expect(inside + 3).toBe(14);
  });
  it('Excel ΟΠΛΙΣΜΟΣ: φύλλο ΑΠΟΝΤΑ μόνο όταν υπάρχει απόν όπλο, με κεφαλαία και το σωστό κείμενο', () => {
    const { s } = wState('fyl'); const sh = weaponSheets(s, D);
    // για μια μέρα χωρίς ώρα: όλα τα νούμερα της μέρας
    const ab = sh.find(x => x.name === 'ΑΠΟΝΤΑ')!; expect(ab).toBeTruthy();
    expect(ab.rows).toHaveLength(2); expect(ab.title).toContain('ΑΠΟΝΤΑ');
    const last = WEAPON_COLS.indexOf('ΕΝΤΟΣ / ΕΚΤΟΣ');
    for (const r of ab.rows) { expect(String(r[last])).toBe('ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:45–22:15'); expect(r.every(v => typeof v !== 'string' || v === upper(v))).toBe(true); }
    expect(sh.find(x => x.name === 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ')!.rows.map(r => r[3])).toEqual([s.people[2].last]);
    expect(sh.map(x => x.name).indexOf('ΑΠΟΝΤΑ')).toBe(sh.map(x => x.name).indexOf('ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ') + 1);
    // ο πρώτος πίνακας (όλοι) γράφει ΑΠΩΝ στη στήλη του
    expect(sh[0].rows.filter(r => String(r[last]).startsWith('ΑΠΩΝ'))).toHaveLength(2);
    // άλλη μέρα χωρίς υπηρεσίες: ούτε φύλλο
    expect(weaponSheets(s, addDays(D, 3)).some(x => x.name === 'ΑΠΟΝΤΑ')).toBe(false);
  });
  it('Μητρώο οπλισμού: ΘΕΣΗ «ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)» όσο κρατά, και ΑΠΟΝΤΑ στα ΣΥΝΟΛΑ', () => {
    const { s } = wState('fyl'); const cfg = assetCfgOf(s.settings);
    const during = registry(s, { day: D, hm: '18:00' }), after = registry(s, { day: D, hm: '23:30' }), none = registry(s);
    const row = (rs: typeof during, pid: number) => rs.find(r => r.link?.k === 'person' && r.link.pid === pid)!;
    expect(rowPlace(cfg, row(during, 1))).toBe('ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)'); expect(rowPlace(cfg, row(during, 2))).toBe('ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)');
    expect(row(during, 3).away).toBeUndefined(); expect(row(during, 4).away).toBeUndefined();   // η Πύλη είναι ΕΚΤΟΣ, όχι απούσα
    expect(row(after, 1).away).toBeUndefined(); expect(row(none, 1).away).toBeUndefined();
    const sh = assetSheets(s, during, D); const book = sh.find(x => x.name === 'G3A3')!; const th = book.head.indexOf('ΘΕΣΗ');
    expect(book.rows.filter(r => r[th] === 'ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)')).toHaveLength(2);
    const tot = sh.find(x => x.kind === 'totals')!; const ci = tot.head.indexOf('ΑΠΟΝΤΑ'); expect(ci).toBeGreaterThan(-1);
    expect(tot.rows[tot.rows.length - 1][ci]).toBe(2); expect(tot.rows[tot.rows.length - 1][0]).toBe('ΓΕΝΙΚΟ ΣΥΝΟΛΟ');
    expect(tot.rows[tot.rows.length - 1][tot.head.indexOf('ΧΡΕΩΜΕΝΑ')]).toBe(14);
    // χωρίς απόντα: κανένα ΑΠΟΝΤΑ, ίδιες στήλες με πριν
    expect(totalsSheet(after, cfg, D).head).toEqual(['ΚΑΤΗΓΟΡΙΑ', 'ΤΥΠΟΣ', 'ΣΥΝΟΛΟ', 'ΧΡΕΩΜΕΝΑ', 'ΑΧΡΕΩΤΑ', 'ΣΕ ΑΛΛΟΝ', 'ΕΠΙΣΚΕΥΗ', 'ΔΙΑΓΡΑΦΗ']);
  });
  it('άλλη συνέπεια: το ΑΠΩΝ δεν αλλάζει ποιος μπαίνει ούτε τις κινήσεις όπλων', () => {
    const a = wState('fyl'), b = wState(undefined);
    expect(armedRows(a.s, D).map(r => [r.id, r.out, r.in, r.who, r.owner])).toEqual(armedRows(b.s, D).map(r => [r.id, r.out, r.in, r.who, r.owner]));
  });
});

// ---------- (δ) χωρίς hkCol (ή με την προεπιλογή) ό,τι βγαίνει είναι το ίδιο ----------
const T = (nm: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', nm));
const withDefaults = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => ({ ...b, hkCol: svcDefault(b.kind) })), blocksSpen: s.settings.blocksSpen.map(b => ({ ...b, hkCol: svcDefault(b.kind) })) } });
async function cellsOf(s: AppState, d: ISODate): Promise<Record<string, unknown>> {
  const sh = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, d)).data)).sheet(1); const o: Record<string, unknown> = {};
  for (let r = 1; r <= 70; r++) for (let c = 0; c < 30; c++) { const a = String.fromCharCode(65 + (c % 26)); const k = (c < 26 ? '' : 'A') + a + r; const v = sh.get(k); if (v != null && v !== '') o[k] = v; }
  return o;
}
describe('χωρίς hkCol: η ΗΚΑΙ βγαίνει όπως πάντα', () => {
  it('hkaiCounts/hkaiClassify/Δύναμη ίδια με hkCol = προεπιλογή του είδους (60 τυχαίες καταστάσεις)', () => {
    let compared = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = genHkState(seed, { own: seed % 2 === 0, attached: true }); const t = withDefaults(s);
      expect(blocksOf(t.settings).every(b => b.hkCol === svcDefault(b.kind))).toBe(true);
      for (const d of DAYS.filter((_, i) => i % 3 === seed % 3)) {
        expect(hkaiCounts(t, d)).toEqual(hkaiCounts(s, d)); expect(hkaiClassify(t, d)).toEqual(hkaiClassify(s, d));
        const at = hkMin(s.rules); expect(strengthOf(t, d, at)).toEqual(strengthOf(s, d, at)); expect(strengthView(t, d, at)).toEqual(strengthView(s, d, at));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(250);
  });
  it('οι τιμές στα κελιά της ΗΚΑΙ (templates/hkai.xlsx) ίδιες, όπως και οι σελίδες οπλισμού', async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = genHkState(seed * 5, { own: seed % 2 === 0 }); const t = withDefaults(s); const d = DAYS[2 + seed];
      const a = await cellsOf(s, d), b = await cellsOf(t, d);
      expect(Object.keys(a).length).toBeGreaterThan(20); expect(b).toEqual(a);
      expect(weaponSheets(t, d)).toEqual(weaponSheets(s, d));
    }
  });
  it('και οι δικές σου υπηρεσίες χωρίς στήλη κωλυομένων/απόντων αφήνουν την ΗΚΑΙ ίδια με πριν από την αλλαγή', () => {
    // η στήλη είναι προαιρετική: στην εντολή χωρίς hkCol το BlockDef δεν αποκτά πεδίο
    const { s } = camp(); expect(blocksOf(s.settings).every(b => !('hkCol' in b))).toBe(true);
    expect(emptyState().settings.blocks.every(b => !('hkCol' in b))).toBe(true);
  });
});
