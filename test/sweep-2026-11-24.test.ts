// Τελικός έλεγχος παλινδρόμησης της παρτίδας του 24/11 (Michael): «bug free, βεβαιώσου ότι θα τεσταριστούν και δεν θα έχουμε regression· βεβαιώσου πχ ότι
// μια υπηρεσία χρεώνεται σωστά στις υπηρεσίες στελεχών ή χρέωση οπλισμού και πάει λέγοντας». Εδώ τα νέα χαρακτηριστικά δουλεύουν ΜΑΖΙ σε μία κατάσταση
// ενός μήνα: υπηρεσία «Μόνο στελέχη» (#380) + όριο υπηρεσιών στρατιώτη (#378) + κρυμμένη υπηρεσία (#379), προεπισκόπηση πραγματικού αρχείου (#377),
// αναίρεση των νέων εντολών, χρέωση οπλισμού από άκρη σε άκρη (#381-#383), παλιά δεδομένα και mock API. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Cadre, type CadreDutyCfg } from '../src/shared/domain';
import { addDays, type ISODate } from '../src/shared/dates';
import { cadreOnlyOf, dutyCount, dutyLimitOf, fillDay, hkaiCounts, monthTxt, postsOf, seatMap } from '../src/shared/rules';
import { monthCount, monthLimit } from '../src/shared/cadreDuty';
import { fillFroura, fillHkai } from '../src/main/exports';
import { previewOf, printSetup } from '../src/main/formPreview';
import { openBook, renderOpen } from '../src/main/print';
import { Workbook } from '../src/main/xlsx';
import { assetSheets, assetView, heldBy, registry } from '../src/shared/assets';
import { W_NUM, canOut, normWeapon, secondWeapons, weaponInfo, weaponKey, weaponSheets } from '../src/shared/weapons';
import { openMoveList, outCountOn } from '../src/shared/weaponView';
import { mockApi } from '../src/renderer/mockApi';
import { normGreek } from '../src/shared/text';
import { frouraChecks } from '../src/shared/preflight';
import { fillOuts } from '../src/main/exports';
import { fakeState } from './fixtures';
import { simulate } from './duty-sim';

const D0 = '2026-12-01';   // Τρίτη
const YM = '2026-12';
const DAYS = 30;
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let n = 0;
const ctx = { today: D0, newId: () => 'sw' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const dd = (i: number) => YM + '-' + String(i).padStart(2, '0');
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [{ id: 'sv', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 12, extra: 1 }, nco: { base: 12, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
const LIMIT = 12;

interface Seed { s: AppState; key: string; hid: string[]; cl: Cadre[]; hidName: string }
// 60 στρατιώτες (χωρίς πόστα και Σ.Ι.), 4 στελέχη στην ομάδα g, υπηρεσία «Μόνο στελέχη», κρυμμένα τα μαγειρεία, όριο υπηρεσιών
function seed(o: { limit?: number; cadre?: boolean; hide?: boolean } = {}): Seed {
  let s = run(fakeState(60), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = { ...s, people: s.people.map(p => ({ ...p, post: null, si: 'Ι1' })) };
  for (let i = 0; i < 4; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(65 + i), first: 'ΟΝΟΜΑ' + i } });
  for (const c of s.cadreList) s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
  let key = '';
  if (o.cadre !== false) {
    s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Αξκός Υπηρεσίας', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g', cadreAs: 'sv' });
    key = blocksOf(s.settings).find(b => b.name === 'Αξκός Υπηρεσίας')!.posts[0].k;
  }
  const mg = s.settings.blocks.find(b => b.kind === 'mg')!;
  if (o.hide !== false) s = run(s, { t: 'setBlock', phase: 'sven', id: mg.id, patch: { hidden: true } });
  if (o.limit !== 0) {
    s = run(s, { t: 'setRules', rules: { ...s.rules, dutyMax: o.limit ?? LIMIT }, text: 'όριο' });
    // λίγοι κοντά στο όριο, ένας με δικό του χαμηλό όριο
    s = { ...s, baseline: Object.fromEntries([1, 2, 3, 4, 5].map(i => [i, { th: (o.limit ?? LIMIT) - 1 }])) };
    s = run(s, { t: 'updatePerson', person: { ...s.people.find(p => p.id === 7)!, dutyMax: 2 } });
  }
  return { s, key, hid: mg.posts.map(p => p.k), cl: s.cadreList, hidName: mg.name };
}
function fillDays(s: AppState, days = DAYS, from: ISODate = D0): { s: AppState; warn: string[][]; empty: string[][] } {
  const warn: string[][] = [], empty: string[][] = [];
  for (let i = 0; i < days; i++) { const r = fillDay(s, addDays(from, i), null); s = { ...s, guards: r.guards, ...(r.cadreList ? { cadreList: r.cadreList } : {}) }; warn.push(r.warn); empty.push(r.empty); }
  return { s, warn, empty };
}

// ένας μήνας συμπληρωμένος μία φορά, και κοινός στα τεστ
let memo: (Seed & { r: ReturnType<typeof fillDays> }) | null = null;
const month = () => memo ||= (() => { const k = seed(); return { ...k, r: fillDays(k.s) }; })();
const OVER = /πάνω από το όριο υπηρεσιών/;
const cadreOfPid = (s: AppState, pid: number) => s.cadreList.find(c => c.pid === pid);
const seatOn = (s: AppState, d: ISODate, k: string) => s.guards[d]?.[k];
const registryRow = (s: AppState, no: string) => registry(s).find(r => weaponKey(r.a.no) === weaponKey(no))!;
const days = Array.from({ length: DAYS }, (_, i) => addDays(D0, i));

describe('1. υπηρεσία «Μόνο στελέχη» + όριο στρατιώτη + κρυμμένη υπηρεσία, ένας μήνας μαζί', () => {
  it('καμία θέση στελεχών δεν παίρνει στρατιώτη· γεμίζει κάθε μέρα με στέλεχος της ομάδας', () => {
    const { r, key, cl } = month();
    expect(cadreOnlyOf(r.s.settings).has(key)).toBe(true);
    for (const d of days) {
      const pid = seatOn(r.s, d, key); expect(pid, d).toBeDefined(); expect(pid! < 0, d).toBe(true);
      expect(cl.map(c => c.id)).toContain(cadreOfPid(r.s, pid!)!.id);
    }
    // κανένας στρατιώτης (θετικό pid) δεν είναι στη θέση, και κανένα στέλεχος δεν είναι σε θέση στρατιώτη
    for (const d of days) for (const [k, pid] of Object.entries(r.s.guards[d])) if (k !== key) expect(pid > 0, d + ' ' + k).toBe(true);
    expect(r.empty.flat().includes(key)).toBe(false);
  });
  it('κρυμμένη υπηρεσία: οι θέσεις της δεν γεμίζουν ποτέ και δεν είναι «κενές»', () => {
    const { r, hid } = month();
    expect(hid.length).toBeGreaterThan(0);
    for (const d of days) for (const k of hid) expect(r.s.guards[d][k], d + ' ' + k).toBeUndefined();
    expect(r.empty.flat().filter(k => hid.includes(k))).toEqual([]);
    expect(postsOf(r.s.settings).some(p => hid.includes(p.k))).toBe(false);
  });
  it('όριο: κανένας δεν το ξεπερνά όσο υπάρχουν άλλοι κάτω από αυτό· δικό του όριο του ατόμου υπερισχύει', () => {
    const { r } = month(); const end = addDays(D0, DAYS);
    const tot = (pid: number) => dutyCount(r.s, end, pid, 'all');
    for (const p of r.s.people) { const lim = dutyLimitOf(r.s.rules, p)!; expect(tot(p.id), 'pid ' + p.id).toBeLessThanOrEqual(lim.max); }
    expect(tot(7)).toBeLessThanOrEqual(2);
    // όσοι ήταν στο όριο-1 μπήκαν το πολύ μία φορά ακόμη, και οι υπόλοιποι ισοσκελίστηκαν
    for (const i of [1, 2, 3, 4, 5]) expect(tot(i)).toBeLessThanOrEqual(LIMIT);
    const rest = r.s.people.filter(p => p.id > 7).map(p => tot(p.id));
    expect(Math.max(...rest) - Math.min(...rest)).toBeLessThanOrEqual(2);
    expect(r.warn.flat().some(w => OVER.test(w))).toBe(false);
  });
  it('πολύ χαμηλό όριο (5): πρώτα γεμίζουν όλοι ως το όριο, και μόνο μετά μπαίνουν πάνω από αυτό, με ειδοποίηση', () => {
    const k = seed({ limit: 5 }); const r = fillDays(k.s); const end = addDays(D0, DAYS);
    const tot = k.s.people.filter(p => p.id !== 7 && p.id > 5).map(p => dutyCount(r.s, end, p.id, 'all'));
    // οι 50 στρατιώτες χωρίς δικό όριο ούτε baseline: κάλυψαν ο καθένας το όριο πριν περάσει κάποιος πάνω από αυτό
    expect(Math.min(...tot)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...tot) - Math.min(...tot)).toBeLessThanOrEqual(2);
    expect(r.warn.flat().some(w => OVER.test(w))).toBe(true);
    // η υπηρεσία των στελεχών δεν επηρεάστηκε από το όριο των στρατιωτών
    expect(days.every(d => seatOn(r.s, d, k.key)! < 0)).toBe(true);
  });
  it('η υπηρεσία των στελεχών χρεώνεται: monthCount, monthLimit, καρτέλα, ΗΚΑΙ «Υπηρεσία» και πρόγραμμα', () => {
    const { r, key, cl } = month(); const s = r.s;
    const picks = (cid: string) => days.filter(d => cadreOfPid(s, seatOn(s, d, key)!)?.id === cid);
    expect(cl.reduce((a, c) => a + picks(c.id).length, 0)).toBe(DAYS);
    for (const c of cl) {
      const mine = picks(c.id).length; expect(mine).toBeGreaterThan(0);
      const mc = monthCount(s, c.id, YM); expect(mc.seat).toBe(mine); expect(mc.done).toBe(mine); expect(mc.roster).toBe(0);
      expect(monthLimit(s, c, YM).done).toBe(mine);
      expect(monthTxt(s, dd(31), seatMap(s).get(s.cadreList.find(x => x.id === c.id)!.pid!)!, true)).toMatch(new RegExp('^' + mine + ' (από|τον μήνα)'));
      // ΗΚΑΙ: ακριβώς τις μέρες που είναι στη θέση μετρά στη στήλη «Υπηρεσία», ποτέ τις άλλες
      for (const d of days) expect((hkaiCounts(s, d).cadre['yp'] || []).some(x => x.id === c.id), c.last + ' ' + d).toBe(picks(c.id).includes(d));
    }
    // ισοκατανομή και ανάπαυση 1 μέρας: ποτέ το ίδιο στέλεχος δύο συνεχόμενες μέρες
    const per = cl.map(c => picks(c.id).length); expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1);
    for (let i = 1; i < DAYS; i++) expect(seatOn(s, days[i], key)).not.toBe(seatOn(s, days[i - 1], key));
  });
  it('ΗΚΑΙ Excel: το στέλεχος στη θέση γράφεται στη στήλη «Υπηρεσία» (ένα κελί παραπάνω, με τιμή 1) και φεύγει όταν αδειάσει η θέση', async () => {
    const { r, key } = month(); const d = dd(7);
    const empty = run(r.s, { t: 'assign', date: d, k: key, pid: null });
    const vals = async (s: AppState) => { const o = await fillHkai(T('hkai.xlsx'), s, d); return (await Workbook.open(o.data)).values(o.sheet || 'μπροστινο', 60, 40); };
    const a = await vals(r.s), b = await vals(empty); const diffs: string[] = [];
    a.forEach((row, i) => row.forEach((v, j) => { if (v !== b[i]?.[j]) diffs.push(i + ',' + j + ':' + b[i]?.[j] + '>' + v); }));
    expect(diffs).toHaveLength(1); expect(diffs[0]).toMatch(/:undefined>1$/);
    expect(hkaiCounts(r.s, d).cadre['yp']).toHaveLength(1); expect(hkaiCounts(empty, d).cadre['yp'] || []).toHaveLength(0);
  });
  it('απαλλαγή μετά την 24ωρη: ούτε στρατιώτης ούτε στέλεχος ξαναμπαίνουν την επόμενη μέρα· το στέλεχος παίρνει απαλλαγή στο υπόλοιπο', async () => {
    const { apalLedger } = await import('../src/shared/cadreBalance');
    const { r, key, cl } = month(); const s = r.s;
    expect(s.rules.restDays).toBe(1);
    for (let i = 1; i < DAYS; i++) {
      const prev = new Set(Object.values(s.guards[days[i - 1]]));
      for (const pid of Object.values(s.guards[days[i]])) expect(prev.has(pid), days[i] + ' pid ' + pid).toBe(false);
    }
    for (const c of cl) {
      const served = days.filter(d => cadreOfPid(s, seatOn(s, d, key)!)?.id === c.id);
      expect(apalLedger(s, s.cadreList.find(x => x.id === c.id)!).filter(x => x.kind === 'duty')).toHaveLength(served.length);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (h: string) => h.replace(/<[^>]*>/g, '\u0001').replace(/\u0001+/g, '|');
const pagesOf = (h: string) => h.split(/<div class="pg[ "]/).slice(1).map(plain);
// ό,τι βγάζει η εκτύπωση (printPage στο main.ts: printSetup + renderOpen)
async function printed(out: { name?: string; data: Buffer }) {
  const book = await openBook(out.data); const su = await printSetup(book, out.name!, undefined);
  return renderOpen(book, { file: out.name!, sheets: su.want, layout: su.opts });
}

describe('2. προεπισκόπηση πραγματικού αρχείου = εκτύπωση, με υπηρεσία «Μόνο στελέχη» και κρυμμένη υπηρεσία', () => {
  const D = dd(10);
  for (const kind of ['froura', 'hkai'] as const) it(kind + ': ίδιες σελίδες και κείμενο ανά σελίδα με την εκτύπωση', async () => {
    const { r } = month(); const out = kind === 'froura' ? await fillFroura(T('froura.xlsx'), r.s, D) : await fillHkai(T('hkai.xlsx'), r.s, D);
    const pv = await previewOf(out); const pr = await printed(out);
    expect(pv.sheets.map(x => x.name)).toEqual(pr.sheets.map(x => x.name));
    expect(pv.sheets.map(x => x.pages)).toEqual(pr.sheets.map(x => x.pages));
    pv.sheets.forEach((sh, i) => expect(pagesOf(sh.html)).toEqual(pagesOf(pr.sheets[i].html)));
    expect(pv.css).toBe(pr.css);
    // καμία κρυφή υπηρεσία στο αρχείο ή στην οθόνη
    for (const sh of pv.sheets) expect(sh.html).not.toContain('ΜΑΓΕΙΡΕΙΑ');
  });
  it('ΦΡΟΥΡΑ: το όνομα του στελέχους είναι στη θέση του και φαίνεται στην προεπισκόπηση· ο τίτλος της κρυφής δεν υπάρχει', async () => {
    const { r, key } = month();
    for (const d of [dd(3), dd(10), dd(24)]) {
      const c = cadreOfPid(r.s, seatOn(r.s, d, key)!)!;
      const out = await fillFroura(T('froura.xlsx'), r.s, d); const pv = await previewOf(out);
      const html = pv.sheets.map(x => x.html).join('');
      expect(html, d).toContain(esc(c.last));
      expect(html).toContain('ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ');
      expect(html).not.toContain('ΜΑΓΕΙΡΕΙΑ');
      // όσα στελέχη δεν είναι εκείνη τη μέρα στη θέση δεν γράφονται πουθενά
      for (const o of r.s.cadreList.filter(x => x.id !== c.id)) expect(html, d + ' ' + o.last).not.toContain(esc(o.last));
      expect(pv.warnings).toEqual(out.warnings);
    }
  });
  it('ΦΡΟΥΡΑ Excel: το όνομα του στελέχους γράφεται κεφαλαία και η κρυμμένη υπηρεσία δεν έχει γραμμές ούτε ονόματα', async () => {
    const { r, key, hid, hidName } = month();
    const d = dd(5); const pid = seatOn(r.s, d, key)!; const c = cadreOfPid(r.s, pid)!;
    const out = await fillFroura(T('froura.xlsx'), r.s, d);
    const rows = await (await Workbook.open(out.data)).values(out.sheet!, 400, 40);
    const txt = rows.flat().filter((v): v is string => typeof v === 'string');
    expect(txt.some(v => v.includes(c.last))).toBe(true);
    expect(txt.some(v => v.toUpperCase().includes(hidName.toUpperCase()))).toBe(false);
    expect(hid.every(k => out.warnings.every(w => !w.includes(k)))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe('3. αναίρεση και επανάληψη των νέων εντολών: η κατάσταση γυρίζει ακριβώς', () => {
  const snap = (s: AppState) => JSON.parse(JSON.stringify(s));
  let rt = 0; const mk = () => { let i = 0; const k = rt; return { today: D0, newId: () => 'u' + k + '_' + ++i }; };   // ίδια id στην επανάληψη, διαφορετικά ανά εντολή
  async function open(s: AppState) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-')); const st = new Store(dir, WASM); await st.open(); st.commit(s);
    return { st, done: () => { st.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
  }
  // εφαρμόζει την εντολή, αναιρεί (όπως το κουμπί), ξαναεφαρμόζει: πριν = μετά την αναίρεση, και η επανάληψη δίνει ό,τι και η πρώτη φορά
  async function roundTrip(st: Store, c: Command) {
    rt++; const before = snap(st.state);
    const r = apply(st.state, c, mk());
    st.addAudit({ at: '10:00', day: D0, text: r.text, files: [], source: 'app', undoable: true }, st.commit(r.state), false);
    const after = snap(st.state); expect(after).not.toEqual(before);
    const last = st.lastUndoable()!; st.revert(last.patch); st.markUndone(last.id);
    expect(snap(st.state)).toEqual(before);
    st.commit(apply(st.state, c, mk()).state);
    expect(snap(st.state)).toEqual(after);
  }

  it('όριο υπηρεσιών (setRules dutyMax/dutyMaxPer), όριο ατόμου (updatePerson), υπηρεσία «Μόνο στελέχη» (editBlock), μετονομασία τύπου, μαζική χρέωση, νέα εγγραφή με νέο τύπο και κύριο όπλο', async () => {
    let s = seed({ limit: 0 }).s;
    s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Πύλη', armed: false, n: 1, hrs: '' });
    s = run(s, { t: 'setWeapons', changes: [{ pid: 2, weapon: 'ΚΥΡ-200', wtype: 'G3A3' }] });
    s = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', no: 'ΤΥΦ-1', state: 'ok' }, date: D0 });
    s = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', no: 'ΤΥΦ-2', state: 'ok' }, date: D0 });
    const { st, done } = await open(s);
    try {
      const blk = blocksOf(st.state.settings).find(b => b.name === 'Πύλη')!;
      const items = (nos: string[]) => nos.map(no => { const x = registryRow(st.state, no); return x.stored ? { id: x.key } : { id: x.key, base: x.a }; });
      const cmds: (() => Command)[] = [
        () => ({ t: 'setRules', rules: { ...st.state.rules, dutyMax: 19, dutyMaxPer: 'month' }, text: 'όριο' }),
        () => ({ t: 'updatePerson', person: { ...st.state.people.find(p => p.id === 7)!, dutyMax: 3 } }),
        () => ({ t: 'editBlock', phase: st.state.settings.phase, id: blk.id, name: 'Πύλη', hrs: {}, who: 'cadre', cadreGroup: 'g', cadreAs: 'sv' }),
        () => ({ t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'G3A3 Νέο' }),
        () => ({ t: 'assetBulk', items: items(['ΤΥΦ-1', 'ΤΥΦ-2', 'ΚΥΡ-200']), op: { k: 'holder', holder: { k: 'person', pid: 4 } }, date: D0 }),
        () => ({ t: 'assetBulk', items: items(['ΤΥΦ-1', 'ΤΥΦ-2']), op: { k: 'state', state: 'repair', why: 'ΣΚΑΝΔΑΛΗ' }, date: D0 }),
        () => ({ t: 'saveAsset', asset: { cat: 'tyfekia', type: 'ΗΚ33', no: 'ΗΚ-9', state: 'ok' }, date: D0, addType: true }),
        () => ({ t: 'setWeapons', changes: [{ pid: 6, weapon: 'ΚΥΡ-600', wtype: 'G3A3 Νέο' }] }),
        () => ({ t: 'saveAsset', asset: { ...registryRow(st.state, 'ΚΥΡ-600').a, id: undefined as any, type: 'G3A4', rack: 'Ε', wpos: '5' }, date: D0, syncPrimary: true })
      ];
      for (const c of cmds) await roundTrip(st, c());
    } finally { done(); }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe('4. χρέωση οπλισμού από άκρη σε άκρη: Μητρώο, καρτέλα ατόμου, «Όπλα ανά άτομο», Κινήσεις και Excel συμφωνούν σε κάθε βήμα', () => {
  const DW = '2026-12-10';
  const wctx = { today: DW, newId: (() => { let i = 0; return () => 'w' + ++i; })() };
  const wrun = (s: AppState, c: Command) => apply(s, c, wctx).state;
  const nameOf = (x: { last: string; first: string }) => (x.last + ' ' + x.first).toUpperCase();
  // ποιος κρατά το όπλο με αυτόν τον αριθμό, όπως το λέει κάθε οθόνη/αρχείο (null = κανείς)
  function surfaces(s: AppState, no: string) {
    const key = weaponKey(no); const row = registry(s).find(r => weaponKey(r.a.no) === key)!;
    const reg = row.a.holder?.k === 'person' ? nameOf(s.people.find(p => p.id === (row.a.holder as any).pid)!) : row.a.holder?.k === 'cadre' ? nameOf(s.cadreList.find(c => c.id === (row.a.holder as any).cid)!) : null;
    // καρτέλα ατόμου: κύριο όπλο (Person/Cadre) ή δεύτερο όπλο
    const card: string[] = [];
    for (const p of s.people) if (weaponKey(p.weapon) === key) card.push(nameOf(p));
    for (const c of s.cadreList) if (weaponKey(c.weapon) === key) card.push(nameOf(c));
    for (const [pid, l] of secondWeapons(s)) if (l.some(a => weaponKey(a.no) === key)) card.push(nameOf(s.people.find(p => p.id === pid)!));
    // «Όπλα ανά άτομο» (πρώτο φύλλο, όλοι)
    const per = weaponSheets(s, DW)[0].rows.filter(r => weaponKey(r[W_NUM]) === key).map(r => (String(r[3]) + ' ' + String(r[4])).toUpperCase());
    // Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ»
    const xl: { who: string; type: string }[] = [];
    for (const sh of assetSheets(s, assetView(s, {}, DW), DW)) if (sh.kind === 'weapon') {
      const iN = sh.head.indexOf('ΑΡΙΘΜΟΣ ΟΠΛΟΥ'), iW = sh.head.indexOf('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), iT = sh.head.indexOf('ΤΥΠΟΣ ΟΠΛΟΥ');
      for (const r of sh.rows) if (weaponKey(r[iN]) === key) xl.push({ who: String(r[iW]), type: String(r[iT]) });
    }
    return { reg, card, per, xl };
  }
  // όλες οι επιφάνειες λένε το ίδιο: κάτοχος who (ή αχρέωτο)
  function agree(s: AppState, no: string, who: string | null, cadre = false) {
    const x = surfaces(s, no);
    expect(x.reg, 'Μητρώο ' + no).toBe(who);
    expect(x.card, 'καρτέλα ' + no).toEqual(who ? [who] : []);
    expect(x.per, 'Όπλα ανά άτομο ' + no).toEqual(who && !cadre ? [who] : []);
    expect(x.xl, 'Excel ' + no).toHaveLength(1);
    expect(x.xl[0].who, 'Excel ' + no).toBe(who ?? 'ΑΧΡΕΩΤΟ');
  }
  const base = (): AppState => {
    let s = fakeState(8);
    s = wrun(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣΒ', first: 'ΟΝΟΜΑ' } });
    s = wrun(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', no: 'ΤΥΦ-100', state: 'ok' }, date: DW });
    s = wrun(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', no: 'ΤΥΦ-101', state: 'ok' }, date: DW });
    s = wrun(s, { t: 'setWeapons', changes: [{ pid: 2, weapon: 'ΚΥΡ-200', wtype: 'G3A3' }] });   // κύριο όπλο του 2 (εικονική γραμμή v:p:2)
    return s;
  };
  const rowKey = (s: AppState, no: string) => registryRow(s, no);
  const holder = (s: AppState, no: string, h: any) => { const r = rowKey(s, no); return wrun(s, { t: 'assetHolder', id: r.key, ...(r.stored ? {} : { base: r.a }), holder: h, date: DW }); };

  it('εγγραφή του Μητρώου: χρέωση σε στρατιώτη, μεταφορά σε στέλεχος, επιστροφή', () => {
    let s = base(); const c = s.cadreList[0]; const p3 = nameOf(s.people.find(p => p.id === 3)!);
    agree(s, 'ΤΥΦ-100', null);
    s = holder(s, 'ΤΥΦ-100', { k: 'person', pid: 3 }); agree(s, 'ΤΥΦ-100', p3);
    expect(heldBy(registry(s), { k: 'person', pid: 3 }).map(r => r.a.no)).toEqual(['ΤΥΦ-100']);
    s = holder(s, 'ΤΥΦ-100', { k: 'cadre', cid: c.id }); agree(s, 'ΤΥΦ-100', nameOf(c), true);
    expect(heldBy(registry(s), { k: 'person', pid: 3 })).toEqual([]); expect(s.people.find(p => p.id === 3)!.weapon).toBeFalsy();
    expect(s.cadreList[0].weapon).toBe('ΤΥΦ-100');
    s = holder(s, 'ΤΥΦ-100', null); agree(s, 'ΤΥΦ-100', null);
    expect(s.cadreList[0].weapon).toBeFalsy();
  });
  it('κύριο όπλο (v:p:<pid>): σε άλλον στρατιώτη, σε στέλεχος και πίσω', () => {
    let s = base(); const c = s.cadreList[0]; const p2 = nameOf(s.people.find(p => p.id === 2)!), p5 = nameOf(s.people.find(p => p.id === 5)!);
    expect(rowKey(s, 'ΚΥΡ-200').key).toBe('v:p:2'); agree(s, 'ΚΥΡ-200', p2);
    s = holder(s, 'ΚΥΡ-200', { k: 'person', pid: 5 }); agree(s, 'ΚΥΡ-200', p5);
    expect(s.people.find(p => p.id === 2)!.weapon).toBeFalsy();
    s = holder(s, 'ΚΥΡ-200', { k: 'cadre', cid: c.id }); agree(s, 'ΚΥΡ-200', nameOf(c), true);
    expect(s.people.find(p => p.id === 5)!.weapon).toBeFalsy(); expect(s.cadreList[0].wtype).toBe('G3A3');
    s = holder(s, 'ΚΥΡ-200', { k: 'person', pid: 2 }); agree(s, 'ΚΥΡ-200', p2);
    s = holder(s, 'ΚΥΡ-200', null); agree(s, 'ΚΥΡ-200', null);
  });
  it('Κινήσεις: το όπλο που χρεώθηκε από το Μητρώο βγαίνει «εκτός» και μετρά μία φορά, μέχρι να επιστραφεί', () => {
    let s = holder(base(), 'ΤΥΦ-100', { k: 'person', pid: 3 });
    const cnt = (x: AppState) => outCountOn(x, DW, '12:00');
    expect(cnt(s)).toBe(0); expect(canOut(s.people.find(p => p.id === 3)!, weaponInfo(s, DW, '12:00'))).toBe(true);
    s = wrun(s, { t: 'weaponOut', pids: [3, 2], reason: 'ΕΚΠ', day: DW, time: '08:00' });
    expect(cnt(s)).toBe(2); expect(openMoveList(s, weaponInfo(s, DW, '12:00')).map(m => m.pid).sort()).toEqual([2, 3]);
    // επιστροφή από το Μητρώο του όπλου που είναι εκτός: ο στρατιώτης δεν έχει πια όπλο, άρα δεν μετρά ως εκτός σε αυτόν
    s = holder(s, 'ΤΥΦ-100', null); agree(s, 'ΤΥΦ-100', null);
    expect(s.people.find(p => p.id === 3)!.weapon).toBeFalsy();
    s = wrun(s, { t: 'weaponIn', ids: s.weaponLog.filter(m => !m.inDay).map(m => m.id), day: DW, time: '13:00' });
    expect(cnt(s)).toBe(0);
  });
  it('μαζική χρέωση (κύριο + δεύτερα όπλα): όλα συμφωνούν στο Μητρώο, την καρτέλα και το Excel', () => {
    let s = base(); const p4 = nameOf(s.people.find(p => p.id === 4)!);
    const items = ['ΤΥΦ-100', 'ΤΥΦ-101', 'ΚΥΡ-200'].map(no => { const r = rowKey(s, no); return r.stored ? { id: r.key } : { id: r.key, base: r.a }; });
    s = wrun(s, { t: 'assetBulk', items, op: { k: 'holder', holder: { k: 'person', pid: 4 } }, date: DW });
    for (const no of ['ΤΥΦ-100', 'ΤΥΦ-101', 'ΚΥΡ-200']) agree(s, no, p4);
    expect(heldBy(registry(s), { k: 'person', pid: 4 })).toHaveLength(3);
    expect(s.people.find(p => p.id === 4)!.weapon).toBe('ΤΥΦ-100');   // το πρώτο γίνεται κύριο, τα άλλα δεύτερα
    expect(s.people.find(p => p.id === 2)!.weapon).toBeFalsy();
    const sh = weaponSheets(s, DW)[0]; expect(sh.rows.filter(r => String(r[3]) + ' ' + String(r[4]) === nameOf(s.people[3]).replace(/ /, ' ')).length).toBe(3);
    // μαζική επιστροφή
    const back = ['ΤΥΦ-100', 'ΤΥΦ-101', 'ΚΥΡ-200'].map(no => ({ id: rowKey(s, no).key }));
    s = wrun(s, { t: 'assetBulk', items: back, op: { k: 'holder', holder: null }, date: DW });
    for (const no of ['ΤΥΦ-100', 'ΤΥΦ-101', 'ΚΥΡ-200']) agree(s, no, null);
    expect(heldBy(registry(s), { k: 'person', pid: 4 })).toEqual([]);
  });
  it('μετονομασία τύπου: αλλάζει το Person.wtype, το κύριο όπλο στέλεχους, τις εγγραφές και το κείμενο του Excel', () => {
    let s = base(); s = holder(s, 'ΤΥΦ-101', { k: 'person', pid: 3 });
    s = wrun(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'G3 Νέο' });
    for (const no of ['ΤΥΦ-100', 'ΤΥΦ-101', 'ΚΥΡ-200']) { const x = surfaces(s, no); expect(x.xl[0].type, no).toBe('G3 ΝΕΟ'); }
    // το Δυναμολόγιο γράφει τους τύπους με κεφαλαία (και τόνο): ίδιος τύπος, χωρίς τόνους
    for (const id of [2, 3]) expect(normGreek(s.people.find(p => p.id === id)!.wtype)).toBe(normGreek('G3 Νέο'));
    expect(weaponSheets(s, DW)[0].rows.filter(r => normGreek(r[9]) === normGreek('G3 Νέο')).length).toBe(2);
    expect(assetSheets(s, assetView(s, {}, DW), DW).filter(x => x.kind === 'weapon').map(x => x.name)).toContain('G3 ΝΕΟ');
    expect(normWeapon('ΤΥΦ-100')).toBe('ΤΥΦ-100');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe('5. παλιά δεδομένα (πριν από τις αλλαγές του 24/11): φορτώνουν, γεμίζουν και βγαίνουν όπως πριν', () => {
  // τα αποτελέσματα του e0be67d (πριν από το όριο και τις υπηρεσίες στελεχών), 60 μέρες, 40 στρατιώτες· ίδιοι αριθμοί με το cadre-service.test.ts
  const GOLD: Record<number, string> = { 1: '838d1b67a8dd4cea266c6db132254ecb40058a64', 5: '147d843116da2f11bdfca0ea4214d33f2a7cf393' };
  for (const sd of [1, 5]) it('σπόρος ' + sd + ': οι θέσεις και οι ειδοποιήσεις είναι ίδιες με πριν (sha1)', () => {
    const a = simulate({ seed: sd, n: 40, days: 60 });
    expect(crypto.createHash('sha1').update(JSON.stringify(a.s.guards) + JSON.stringify(a.log)).digest('hex')).toBe(GOLD[sd]);
  });
  it('η παλιά κατάσταση δεν έχει κανένα νέο πεδίο· αποθηκεύεται, ξαναφορτώνει και συμπληρώνει όπως η αρχική', async () => {
    const old = simulate({ seed: 3, n: 40, days: 30 }).s;
    const json = JSON.stringify(old);
    for (const f of ['"dutyMax"', '"dutyMaxPer"', '"accs"', '"cadreGroup"', '"cadreAs"', '"who"']) expect(json.includes(f), f).toBe(false);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-old-'));
    try {
      const st = new Store(dir, WASM); await st.open(); st.commit(old); st.flush(); st.close();
      const st2 = new Store(dir, WASM); await st2.open();
      const loaded = st2.state; st2.close();
      expect(JSON.stringify(loaded.guards)).toBe(JSON.stringify(old.guards));
      expect(loaded.people).toEqual([...old.people].sort((x, y) => x.id - y.id));   // η βάση τα δίνει με τη σειρά των id
      // επόμενες μέρες με την ίδια εντολή που στέλνει το UI
      const last = Object.keys(old.guards).sort().pop()!;
      let a: AppState = { ...old, people: [...old.people].sort((x, y) => x.id - y.id) }, b = loaded;
      for (let i = 1; i <= 5; i++) { const d = addDays(last, i); a = apply(a, { t: 'autofill', date: d }, { today: d, newId: () => 'a' + i }).state; b = apply(b, { t: 'autofill', date: d }, { today: d, newId: () => 'a' + i }).state; }
      expect(b.guards).toEqual(a.guards);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('με τα νέα χαρακτηριστικά ανενεργά (ομάδα στελεχών, όριο 999 στον καθένα) τα αρχεία βγαίνουν byte-προς-byte ίδια', async () => {
    const old = simulate({ seed: 2, n: 40, days: 30 }); const d = old.days[old.days.length - 1];
    let nw = run(old.s, { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
    nw = run(nw, { t: 'setRules', rules: { ...nw.rules, dutyMax: 999, dutyMaxPer: 'month' }, text: 'όριο' });
    nw = run(nw, { t: 'updatePerson', person: { ...nw.people[0], dutyMax: 999 } });
    const same = async (f: (s: AppState) => Promise<{ data: Buffer }>) => expect(Buffer.compare((await f(old.s)).data, (await f(nw)).data)).toBe(0);
    await same(s => fillFroura(T('froura.xlsx'), s, d));
    await same(s => fillHkai(T('hkai.xlsx'), s, d));
    await same(s => fillOuts(T('exodouxoi.xlsx'), s, d, { outs: undefined, stay: undefined }));
    // και η αυτόματη συμπλήρωση των επόμενων 20 ημερών δίνει τις ίδιες θέσεις και ειδοποιήσεις
    const a = fillDays(old.s, 20, addDays(d, 1)); const b = fillDays(nw, 20, addDays(d, 1));
    expect(b.s.guards).toEqual(a.s.guards); expect(b.warn).toEqual(a.warn); expect(b.empty).toEqual(a.empty);
  });
});

describe('6. mock API (πρόγραμμα περιήγησης): προεπισκόπηση και συμπλήρωση με υπηρεσία «Μόνο στελέχη»', () => {
  it('formPreview και autofill δεν σκάνε· η θέση στελεχών γεμίζει με στέλεχος', async () => {
    const api = mockApi(); const { state } = await api.boot();
    const t = state.settings.phase; void t;
    const ok = async (c: Command) => { const r = await api.run(c); expect(r.ok, JSON.stringify(r)).toBe(true); };
    await ok({ t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
    const cl = (await api.boot()).state.cadreList.filter(c => c.active).slice(0, 3);
    for (const c of cl) await ok({ t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
    const st0 = (await api.boot()).state;
    await ok({ t: 'addBlock', phase: st0.settings.phase, name: 'Αξκός Υπηρεσίας', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g', cadreAs: 'sv' });
    const mg = (await api.boot()).state.settings.blocks.find(b => b.kind === 'mg');
    if (mg) await ok({ t: 'setBlock', phase: 'sven', id: mg.id, patch: { hidden: true } });
    const day = addDays(st0.guards ? Object.keys(st0.guards).sort().pop()! : D0, 1);
    await ok({ t: 'autofill', date: day });
    const s = (await api.boot()).state; const key = blocksOf(s.settings).find(b => b.name === 'Αξκός Υπηρεσίας')!.posts[0].k;
    const pid = s.guards[day]?.[key]; expect(pid).toBeDefined(); expect(pid! < 0).toBe(true);
    for (const kind of ['froura', 'hkai', 'outs'] as const) {
      const pv = await api.formPreview({ kind, date: day } as any);
      expect('ok' in pv).toBe(false); expect((pv as any).sheets.length).toBeGreaterThan(0);
    }
  });
});

describe('7. κενές θέσεις: ό,τι λέει η οθόνη είναι ό,τι γράφει το Excel', () => {
  it('η ΦΡΟΥΡΑ αφήνει τις κενές θέσεις κενές (όχι «ΚΕΝΗ») και η οθόνη (έλεγχος πριν την εξαγωγή, κάρτα Excel) το λέει σωστά', async () => {
    const { r, key } = month(); const d = dd(12);
    const reg = postsOf(r.s.settings).find(x => x.k !== key && x.k !== 'ly' && x.k !== 'dy')!.k;
    const s = run(run(r.s, { t: 'assign', date: d, k: key, pid: null }), { t: 'assign', date: d, k: reg, pid: null });   // κενή μία θέση στρατιώτη και η θέση των στελεχών
    const out = await fillFroura(T('froura.xlsx'), s, d);
    const rows = await (await Workbook.open(out.data)).values(out.sheet!, 400, 40);
    expect(rows.flat().some(v => typeof v === 'string' && v.toUpperCase().includes('ΚΕΝΗ'))).toBe(false);
    expect(out.empty!.length).toBeGreaterThan(0);
    const msg = frouraChecks(s, d).map(c => c.text).find(x => /κενές θέσεις/.test(x))!;
    expect(msg).toBeDefined(); expect(msg).toMatch(/^2 κενές θέσεις/); expect(msg).not.toContain('ΚΕΝΗ'); expect(msg).toContain('θα μείνουν κενές');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'screens', 'guard.ts'), 'utf8');
    expect(src).not.toMatch(/γράφεται\s*«ΚΕΝΗ»/); expect(src).toContain('κενό στο Excel');
  });
});
