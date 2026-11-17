// «Δικές μου στήλες» της ΗΚΑΙ (UserLists.hkCols, Michael 17/11).
// (α) εντολή setHkCols: προσθήκη, μετονομασία, διαγραφή, έλεγχος, κείμενο Ιστορικού· (β) μέτρηση: μια δική σου στήλη ισοδυναμεί με την αντίστοιχη βασική
// (απόντες = Υπηρεσία φυλακίων, κωλυόμενοι = Σε κίνηση) σε τυχαίους κόσμους· (γ) διαγραφή: όλα γυρνούν στην προεπιλογή, κανείς δεν χάνεται·
// (δ) Excel: LibreOffice και μικρός υπολογιστής συμφωνούν, οι αριθμοί = hkaiCounts· (ε) προσαρμοστική διαδρομή· (στ) χωρίς δικές σου στήλες ό,τι βγαίνει είναι το ίδιο.
// Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Status } from '../src/shared/domain';
import { hkaiCounts, hkMin, kolView, strengthOf } from '../src/shared/rules';
import type { HkColInput } from '../src/shared/hkCols';
import { hkColsOf } from '../src/shared/ranks';
import { strengthView } from '../src/shared/strengthView';
import { fakeState } from './fixtures';
import { genHkState, DAYS } from './hk-gen';
import { fillHkai } from '../src/main/exports';
import { fillAdaptive } from '../src/main/fillAdaptive';
import { Workbook } from '../src/main/xlsx';
import { modelOfBuffer } from '../src/main/bookModel';
import { findSoffice } from '../src/main/xlsConvert';
import { Evaluator } from '../src/shared/sheetEval';
import { upper } from '../src/shared/text';
import { cellRef, colLetter } from '../src/shared/sheetModel';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'q' + ++n });
const go = (s: AppState, c: Command) => run(s, c).state;
const own = (s: AppState) => hkColsOf(s.settings.lists);
const ids = (l: { id: number }[]) => l.map(p => p.id).sort((a, b) => a - b);
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const COLS: HkColInput[] = [{ name: 'Καραντίνα', grp: 'abs' as const, short: 'Καρ.' }, { name: 'Συνοδεία κρατουμένων', grp: 'kol' as const }];
const withCols = (s: AppState, cols: HkColInput[] = COLS) => go(s, { t: 'setHkCols', cols });
const stat = (pid: number, type: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++n, pid, type, from: D, to: D, ...extra } as Status);

describe('setHkCols: εντολή', () => {
  it('προσθήκη: κλειδιά u1, u2, κείμενο στο Ιστορικό, ομάδα και συντομία', () => {
    const r = run(fakeState(8), { t: 'setHkCols', cols: COLS });
    expect(own(r.state).map(x => [x.key, x.name, x.grp, x.short])).toEqual([['u1', 'Καραντίνα', 'abs', 'Καρ.'], ['u2', 'Συνοδεία κρατουμένων', 'kol', undefined]]);
    expect(r.text).toContain('νέα στήλη «Καραντίνα» (Απόντες)'); expect(r.text).toContain('νέα στήλη «Συνοδεία κρατουμένων» (Κωλυόμενοι)');
  });
  it('μετονομασία κρατά το κλειδί· η νέα στήλη παίρνει νέο κλειδί, ποτέ ξανά το u1 ή u2 που σβήστηκε', () => {
    let s = withCols(fakeState(8));
    s = go(s, { t: 'setHkCols', cols: [{ key: 'u1', name: 'Καραντίνα Α', grp: 'abs' }, { key: 'u2', name: 'Συνοδεία κρατουμένων', grp: 'kol' }] });
    expect(own(s).map(x => x.key + ':' + x.name)).toEqual(['u1:Καραντίνα Α', 'u2:Συνοδεία κρατουμένων']);
    s = go(s, { t: 'setHkCols', cols: [{ key: 'u1', name: 'Καραντίνα Α', grp: 'abs' }, { name: 'Νέα', grp: 'kol' }] });   // το u2 σβήνεται, μπαίνει νέα
    expect(own(s).map(x => x.key)).toEqual(['u1', 'u3']);
    const r = run(s, { t: 'setHkCols', cols: [] });
    expect(own(r.state)).toEqual([]); expect(r.state.settings.lists?.hkCols).toBeUndefined();
    expect(r.text).toContain('διαγράφηκε η στήλη «Καραντίνα Α»');
  });
  it('έλεγχος: κενό όνομα, διπλά (χωρίς πεζά/τόνους), όνομα βασικής στήλης, σύνολο, πάνω από το όριο, άγνωστη ομάδα', () => {
    const s = fakeState(6); const bad = (cols: unknown[]) => () => run(s, { t: 'setHkCols', cols: cols as never });
    expect(bad([{ name: '  ', grp: 'abs' }])).toThrow('όνομα');
    expect(bad([{ name: 'Καραντίνα', grp: 'abs' }, { name: 'ΚΑΡΑΝΤΙΝΑ', grp: 'kol' }])).toThrow('ήδη');
    expect(bad([{ name: 'Καραντινά', grp: 'abs' }, { name: 'καραντίνα', grp: 'abs' }])).toThrow('ήδη');
    expect(bad([{ name: 'Φυλάκια', grp: 'abs' }])).toThrow('Υπάρχει ήδη');
    expect(bad([{ name: 'Σε κίνηση', grp: 'kol' }])).toThrow('Υπάρχει ήδη');
    expect(bad([{ name: 'Σύνολο μου', grp: 'abs' }])).toThrow('σύνολο');
    expect(bad([{ name: 'Χ', grp: 'zzz' }])).toThrow('ομάδα');
    expect(bad(Array.from({ length: 11 }, (_, i) => ({ name: 'Στήλη ' + i, grp: 'abs' })))).toThrow('Το πολύ 10');
    expect(() => run(s, { t: 'setHkCols', cols: Array.from({ length: 10 }, (_, i) => ({ name: 'Στήλη ' + i, grp: 'abs' as const })) })).not.toThrow();
  });
  it('αλλαγή ομάδας γράφεται με προειδοποίηση· χωρίς αλλαγή το κείμενο λέει «καμία αλλαγή»', () => {
    const s = withCols(fakeState(6));
    expect(run(s, { t: 'setHkCols', cols: own(s).map(x => ({ ...x })) }).text).toContain('καμία αλλαγή');
    const r = run(s, { t: 'setHkCols', cols: own(s).map(x => (x.key === 'u1' ? { ...x, grp: 'kol' as const } : { ...x })) });
    expect(r.text).toContain('ομάδα Απόντες → Κωλυόμενοι'); expect(r.text).toContain('μετρά πια στη νέα ομάδα');
  });
  it('οι δικές σου στήλες διαλέγονται σε υπηρεσία, είδος άδειας, δήλωση και απουσία στελέχους· άγνωστο κλειδί πετιέται', () => {
    let s = withCols(fakeState(8)); const ph = s.settings.phase;
    s = go(s, { t: 'addBlock', phase: ph, name: 'Δοκιμή Α', kind: 'other', armed: false, n: 1, per: 1, hrs: '15:00-22:00', hkCol: 'u1' });
    s = go(s, { t: 'addBlock', phase: ph, name: 'Δοκιμή Β', kind: 'other', armed: false, n: 1, per: 1, hrs: '15:00-22:00', hkCol: 'u9' });
    const bs = blocksOf(s.settings); expect(bs.find(b => b.name === 'Δοκιμή Α')!.hkCol).toBe('u1'); expect(bs.find(b => b.name === 'Δοκιμή Β')!.hkCol).toBeUndefined();
    expect(() => run(fakeState(8), { t: 'addBlock', phase: ph, name: 'Δοκιμή Γ', kind: 'other', armed: false, n: 1, per: 1, hrs: '15:00-22:00', hkCol: 'u1' })).not.toThrow();
    expect(blocksOf(go(fakeState(8), { t: 'addBlock', phase: ph, name: 'Δοκιμή Γ', kind: 'other', armed: false, n: 1, per: 1, hrs: '15:00-22:00', hkCol: 'u1' }).settings).find(b => b.name === 'Δοκιμή Γ')!.hkCol).toBeUndefined();
  });
});

// ---------- (β) ισοδυναμία με τις βασικές στήλες σε τυχαίους κόσμους ----------
// Ο ίδιος κόσμος δύο φορές: μία με δική σου στήλη (u1 = απόντες, u2 = κωλυόμενοι) και μία με τη βασική (fyl = Φυλάκια, kin = Σε κίνηση).
// Ό,τι μετρά το ένα πρέπει να το μετρά και το άλλο, στήλη προς στήλη, στο σύνολο, στους Διαθέσιμους, στη Δύναμη και στο Σήμερα.
function world(seed: number, ownCols: boolean) {
  const r = rng(seed), pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const A = ownCols ? 'u1' : 'fyl', K = ownCols ? 'u2' : 'kin';
  let s = fakeState(16); if (ownCols) s = withCols(s);
  const ph = s.settings.phase;
  s = go(s, { t: 'addBlock', phase: ph, name: 'Φυλάκιο Δοκιμής', kind: 'other', armed: false, n: 1, per: 3, hrs: '15:00-22:00', hkCol: A });
  s = go(s, { t: 'addBlock', phase: ph, name: 'Περίπολος Δοκιμής', kind: 'other', armed: false, n: 1, per: 2, hrs: '15:00-22:00', hkCol: K });
  s = go(s, { t: 'addBlock', phase: ph, name: 'Πύλη Δοκιμής', kind: 'other', armed: false, n: 1, per: 2, hrs: '15:00-22:00' });
  const lists = { ...(s.settings.lists || {}), leaveKinds: { add: [{ name: 'Δική άδεια', col: A }] }, cadreAbs: { add: [{ name: 'Δική απουσία', col: A }] } };
  s = { ...s, settings: { ...s.settings, lists } };
  const posts = blocksOf(s.settings).filter(b => /Δοκιμής/.test(b.name)).flatMap(b => b.posts.map(p => p.k));
  const who = s.people.map(p => p.id).sort(() => r() - 0.5);
  const guards: Record<string, number> = {}; posts.forEach((k, i) => { if (r() < 0.8) guards[k] = who[i]; });
  const statuses: Status[] = [];
  for (const p of s.people) { const x = r(); if (x < 0.12) statuses.push(stat(p.id, 'LEAVE', { kind: pick(['Κανονική', 'Δική άδεια']) })); else if (x < 0.2) statuses.push(stat(p.id, 'KOL', { minus: true, hkCol: pick([K, A === 'u1' ? 'u1' : 'fyl', 'yp']), note: 'ΔΟΚΙΜΗ' })); else if (x < 0.25) statuses.push(stat(p.id, 'NOS')); }
  const cadreList = s.cadreList.map(c => c);
  return { ...s, guards: { ...s.guards, [D]: guards }, statuses, cadreList } as AppState;
}
describe('δική σου στήλη = ισοδυναμεί με τη βασική', () => {
  it('ΗΚΑΙ, Δύναμη, Σήμερα και Κωλυόμενοι ίδια, στήλη προς στήλη (60 κόσμοι)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const a = world(seed, true), b = world(seed, false);
      const ha = hkaiCounts(a, D), hb = hkaiCounts(b, D);
      expect([seed, ids(ha.cols.u1), ids(ha.cols.u2)]).toEqual([seed, ids(hb.cols.fyl), ids(hb.cols.kin)]);
      for (const k of Object.keys(hb.cols)) if (k !== 'fyl' && k !== 'kin') expect([seed, k, ids(ha.cols[k])]).toEqual([seed, k, ids(hb.cols[k])]);
      expect([seed, ha.apo, ha.kol, ha.avail, ha.total]).toEqual([seed, hb.apo, hb.kol, hb.avail, hb.total]);
      // καμία διαρροή: ό,τι υπάρχει στις στήλες είναι το σύνολο, κάθε άτομο σε ένα μόνο κελί
      const all = Object.values(ha.cols).flatMap(l => l.map(p => p.id)); expect(new Set(all).size).toBe(all.length);
      for (const at of [hkMin(a.rules), 10 * 60, 17 * 60, 23 * 60]) {
        const ca = strengthOf(a, D, at), cb = strengthOf(b, D, at), va = strengthView(a, D, at), vb = strengthView(b, D, at);
        expect([seed, at, ca.present, ca.absent, ca.total, ids(ca.awaySvc)]).toEqual([seed, at, cb.present, cb.absent, cb.total, ids(cb.awaySvc)]);
        expect([va.present, va.kol, va.absent, va.total]).toEqual([vb.present, vb.kol, vb.absent, vb.total]);
        expect(va.present + va.kol + va.absent).toBe(va.total);
      }
      const ka = kolView(a, D), kb = kolView(b, D);
      expect(ids(ka.cols.u2 || [])).toEqual(ids(kb.cols.kin || []));
    }
  });
  it('η στήλη απόντων αφαιρεί από τους Διαθέσιμους, η στήλη κωλυομένων όχι από τη Δύναμη', () => {
    const a = world(7, true), base = hkaiCounts({ ...a, guards: { ...a.guards, [D]: {} }, statuses: [] }, D), h = hkaiCounts(a, D);
    const apoNew = ids(h.cols.u1).length, kolNew = ids(h.cols.u2).length;
    expect(apoNew + kolNew).toBeGreaterThan(0);
    expect(h.total).toBe(base.total);
    const sa = strengthOf(a, D, hkMin(a.rules));
    expect(sa.present + sa.absent).toBeLessThanOrEqual(sa.total);
  });
});

// ---------- (γ) διαγραφή ----------
describe('διαγραφή στήλης: όλα γυρνούν στην προεπιλογή, κανείς δεν χάνεται', () => {
  it('υπηρεσία, είδος άδειας, δήλωση, απουσία στελέχους και υπηρεσία στελεχών', () => {
    const a = world(11, true); let s = a;
    s = { ...s, cadreList: [{ id: 'c1', rank: 'ΛΓΟΣ', hk: 'Ίλαρχοι', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ', active: true }], cadreAbs: [{ id: 'a1', cid: 'c1', kind: 'Δική απουσία', from: D, to: D }] };
    const before = hkaiCounts(s, D); const sum = (h: typeof before) => Object.values(h.cols).reduce((t, l) => t + l.length, 0);
    expect(ids(before.cols.u1).length + ids(before.cols.u2).length).toBeGreaterThan(0);
    const r = run(s, { t: 'setHkCols', cols: [] });
    const after = hkaiCounts(r.state, D);
    expect(r.text).toContain('γύρισαν στην προεπιλογή');
    expect(r.text).toContain('οι υπηρεσίες «Φυλάκιο Δοκιμής»'); expect(r.text).toContain('τα είδη άδειας «Δική άδεια»'); expect(r.text).toContain('οι απουσίες στελεχών «Δική απουσία»');
    expect(after.cols.u1).toBeUndefined(); expect(after.total).toBe(before.total);
    expect(sum(after)).toBe(sum(before));                                 // κανείς δεν χάθηκε από την ΗΚΑΙ
    expect(blocksOf(r.state.settings).every(b => !b.hkCol || !/^u\d+$/.test(b.hkCol))).toBe(true);
    expect(r.state.statuses.every(x => !x.hkCol || !/^u\d+$/.test(x.hkCol))).toBe(true);
    expect(JSON.stringify(r.state.settings.lists)).not.toMatch(/"u\d+"/);
  });
  it('σβήνεται μόνο η μία: η άλλη μένει όπως ήταν', () => {
    const a = world(11, true);
    const r = run(a, { t: 'setHkCols', cols: [{ key: 'u1', name: 'Καραντίνα', grp: 'abs', short: 'Καρ.' }] });
    expect(ids(hkaiCounts(r.state, D).cols.u1)).toEqual(ids(hkaiCounts(a, D).cols.u1));
    expect(r.text).not.toContain('Φυλάκιο Δοκιμής»,');
  });
});

// ---------- (στ) χωρίς δικές σου στήλες ό,τι βγαίνει είναι το ίδιο ----------
describe('χωρίς δικές σου στήλες', () => {
  it('hkCols: [] και χωρίς hkCols δίνουν ίδια ΗΚΑΙ, Δύναμη και Excel· γνωστά κελιά', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx'));
    for (const seed of [3, 8, 15]) {
      const s0 = genHkState(seed, { own: seed % 2 === 1 }), d = DAYS[seed % DAYS.length];
      const s1: AppState = { ...s0, settings: { ...s0.settings, lists: { ...(s0.settings.lists || {}), hkCols: [] } } };
      expect(JSON.stringify(hkaiCounts(s1, d))).toBe(JSON.stringify(hkaiCounts(s0, d)));
      expect(JSON.stringify(strengthOf(s1, d))).toBe(JSON.stringify(strengthOf(s0, d)));
      const a = await fillHkai(tpl, s0, d, {}), b = await fillHkai(tpl, s1, d, {});
      const da = await firstSheet(a.data), db = await firstSheet(b.data);
      expect(db).toEqual(da); expect(b.warnings).toEqual(a.warnings);
      // γνωστά κελιά του εντύπου, όπως πάντα: η κεφαλίδα και τα σύνολα στις ίδιες θέσεις
      expect(da.cells['E6']).toBe('Σύνολο'); expect(da.cells['N6']).toBe('Σύνολο κωλυομένων'); expect(da.cells['Z7']).toBe('Σύνολο απόντων'); expect(da.cells['AA6']).toBe('Διαθέσιμοι για εκπαίδευση');
      const gr = Object.keys(da.cells).find(k => /^A\d+$/.test(k) && da.cells[k] === 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ')!.slice(1);
      expect(da.cells['Z' + gr]).toMatch(/^=SUM\(Z\d+[:,]Z\d+\)$/); expect(da.cells['Z7']).toBe('Σύνολο απόντων');   // το γενικό σύνολο της στήλης ΣΥΝΟΛΟ ΑΠΟΝΤΩΝ
    }
  }, 120000);
});

const firstSheet = async (buf: Buffer) => { const wb = await Workbook.open(buf); return (await wb.sheet(wb.sheetNames()[0])).dump(); };
// ---------- (δ) Excel ----------
const soffice = findSoffice();
function recalc(bufs: Buffer[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-ownlo-'));
  try {
    const prof = path.join(dir, 'prof', 'user'); fs.mkdirSync(prof, { recursive: true });
    fs.writeFileSync(path.join(prof, 'registrymodifications.xcu'), '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
    const inDir = path.join(dir, 'in'); fs.mkdirSync(inDir);
    const files = bufs.map((b, i) => { const f = path.join(inDir, 'f' + i + '.xlsx'); fs.writeFileSync(f, b); return f; });
    execFileSync(soffice!, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), ...files], { timeout: 300000, stdio: 'ignore' });
    return Promise.all(files.map((_, i) => modelOfBuffer(fs.readFileSync(path.join(dir, 'out', 'f' + i + '.xlsx')))));
  } finally { /* καθαρίζεται μετά την ανάγνωση */ }
}
function excelState(seed: number): AppState {
  const r = rng(seed * 13 + 1); const k = 1 + Math.floor(r() * 3);
  const cols = Array.from({ length: k }, (_, i): { name: string; grp: 'abs' | 'kol' } => ({ name: ['Καραντίνα', 'Συνοδεία κρατουμένων', 'Δεξαμενή', 'Εφεδρεία κοντά'][i], grp: (r() < 0.5 ? 'abs' : 'kol') as 'abs' | 'kol' }));
  // ΗΚΑΛ (λόχος) = το ίδιο έντυπο με τις λέξεις του λόχου (Michael 17/11): κάθε 3ος κόσμος
  let s = genHkState(seed, { own: seed % 2 === 0, cadre: true, lochos: seed % 3 === 0 }); s = withCols(s, cols);
  const keys = own(s).map(x => x.key);
  const lists = { ...(s.settings.lists || {}), leaveKinds: { add: [...(s.settings.lists?.leaveKinds?.add || []), { name: 'Δική άδεια', col: keys[0] }] } };
  const d = DAYS[seed % DAYS.length];
  const mine: Status[] = s.people.filter((_, i) => i % 3 === 0).map((p, i) => ({ id: 'o' + i, pid: p.id, type: i % 2 ? 'KOL' : 'LEAVE', kind: i % 2 ? undefined : 'Δική άδεια', minus: i % 2 ? true : undefined, hkCol: i % 2 ? keys[keys.length - 1] : undefined, from: d, to: d, note: 'ΔΟΚΙΜΗ' } as Status));
  return { ...s, settings: { ...s.settings, lists }, statuses: [...s.statuses, ...mine] };
}
describe.skipIf(!soffice)('Excel με δικές σου στήλες: LibreOffice = μικρός υπολογιστής = hkaiCounts', () => {
  it('κεφαλίδες με κεφαλαία, σύνολα και Διαθέσιμοι σωστά (6 κόσμοι)', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx'));
    const seeds = [1, 2, 3, 4, 5, 6]; const outs: { s: AppState; d: string; data: Buffer; w: string[] }[] = [];
    for (const seed of seeds) { const s = excelState(seed), d = DAYS[seed % DAYS.length]; const r = await fillHkai(tpl, s, d, {}); outs.push({ s, d, data: r.data, w: r.warnings }); }
    const lo = await recalc(outs.map(o => o.data));
    for (let i = 0; i < outs.length; i++) {
      const { s, d, data } = outs[i]; const h = hkaiCounts(s, d);
      const mine = await modelOfBuffer(data), sh = mine[0], sl = lo[i][0], ev = new Evaluator(mine);
      const colOf = (nm: string) => { for (const [r, row] of sh.rows.entries()) { if (r > 12) break; const c = row?.findIndex(v => typeof v === 'string' && v.replace(/\s+/g, ' ').trim() === nm); if (c != null && c >= 0) return c; } return -1; };
      const grand = sh.rows.findIndex(row => row?.some(v => typeof v === 'string' && /ΓΕΝΙΚΟ ΣΥΝΟΛΟ/.test(v)));
      expect(grand).toBeGreaterThan(0);
      // ΗΚΑΛ: το ίδιο έντυπο με τις λέξεις του λόχου (unitWords), και οι δικές σου στήλες μέσα
      if (s.settings.unitKind === 'lochos') expect(sh.rows.some(row => row?.some(v => typeof v === 'string' && /ΛΟΧ|ΤΑΓΜ/.test(v))), 'seed ' + seeds[i] + ' ΗΚΑΛ').toBe(true);
      // LibreOffice και ο δικός μας υπολογιστής συμφωνούν σε κάθε αριθμητικό τύπο
      let checked = 0;
      for (const f of sh.formulas.keys()) {
        const [r, c] = f.split(':').map(Number); const a = ev.cell(sh, r, c), b = sl.rows[r]?.[c];
        if (typeof a === 'number') { expect([seeds[i], cellRef(r, c), a]).toEqual([seeds[i], cellRef(r, c), Number(b || 0)]); checked++; }
      }
      expect(checked).toBeGreaterThan(100);
      for (const x of own(s)) {
        const c = colOf(upper(x.name)); expect([seeds[i], x.name, c >= 0]).toEqual([seeds[i], x.name, true]);   // κεφαλίδα με κεφαλαία
        expect(Number(sl.rows[grand]?.[c] || 0)).toBe(h.cols[x.key].length);                                          // ΓΕΝΙΚΟ ΣΥΝΟΛΟ της στήλης = όσοι μετρούν εκεί
      }
      // Σύνολο απόντων / κωλυομένων και Διαθέσιμοι του γενικού συνόλου = hkaiCounts
      const apoC = colOf('Σύνολο απόντων'), kolC = colOf('Σύνολο κωλυομένων'), avC = colOf('Διαθέσιμοι για εκπαίδευση');
      expect(Number(sl.rows[grand][apoC] || 0)).toBe(h.apo); expect(Number(sl.rows[grand][kolC] || 0)).toBe(h.kol); expect(Number(sl.rows[grand][avC] || 0)).toBe(h.avail);
      // οι δικές σου στήλες μπαίνουν ακριβώς πριν από το σύνολο της ομάδας τους
      for (const x of own(s)) { const c = colOf(upper(x.name)), t = x.grp === 'abs' ? apoC : kolC; expect(c).toBeLessThan(t); }
    }
  }, 600000);
});

// ---------- (ε) προσαρμοστική διαδρομή ----------
describe('προσαρμοστικό έντυπο μονάδας', () => {
  it('έντυπο χωρίς τη στήλη: αναφέρεται με το δικό της όνομα· έντυπο με στήλη του ίδιου ονόματος: γεμίζει και ο έλεγχος των τύπων συμφωνεί', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx'));
    const s = excelState(2), d = DAYS[2], h = hkaiCounts(s, d);
    expect(h.cols.u1.length).toBeGreaterThan(0);
    const plain = (await fillAdaptive(tpl, s, d, null)).report;
    expect(plain.unplacedStates).toEqual(expect.arrayContaining([{ key: 'u1', n: h.cols.u1.length }]));
    expect(plain.warnings.join('\n')).toContain('«Καραντίνα»');
    expect(plain.warnings.join('\n')).not.toContain('«u1»');
    const mine = (await fillHkai(tpl, s, d, {})).data;           // το έντυπο της μονάδας με τις στήλες μέσα (κεφαλίδες με κεφαλαία)
    const r = (await fillAdaptive(mine, s, d, null)).report;
    expect(r.unplacedStates).toEqual([]); expect(r.cross.mismatches).toEqual([]);
    expect(r.warnings.join('\n')).not.toContain('Καραντίνα');
    const sh = (await modelOfBuffer(mine))[0]; let col = -1; sh.rows.slice(0, 12).forEach(row => row?.forEach((v, c) => { if (typeof v === 'string' && v.trim() === upper('Καραντίνα')) col = c; }));
    expect(col).toBeGreaterThan(0);
    const L = colLetter(col); const sum = r.written.filter(w => new RegExp('^' + L + '\\d+$').test(w.ref) && typeof w.value === 'number').reduce((t, w) => t + (w.value as number), 0);
    expect(sum).toBe(h.cols.u1.length);                        // ό,τι γράφτηκε στη δική σου στήλη = όσοι μετρούν εκεί
  }, 120000);
});
