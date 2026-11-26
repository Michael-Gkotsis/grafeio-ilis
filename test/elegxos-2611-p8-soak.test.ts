// Έλεγχος 26/11, πακέτο Π8 (τελικός έλεγχος όλων μαζί): «μια μέρα στο γραφείο» × 90 μέρες με τυχαίες ρυθμίσεις (κέντρο/μονάδα, λίγοι ή
// πολλοί στρατιώτες, στελέχη με πρόγραμμα υπηρεσιών, «Μόνο στελέχη», μόνιμοι, όριο, όπλα και υλικό) και τυχαίες ενέργειες όπως του λοχία
// (άδειες, ΣΤΕΠ, ποινές, έξοδοι, κινήσεις δύναμης, νέοι και φεύγοντες, αυτόματη συμπλήρωση, χρεώσεις όπλων, άδειες στελεχών, αναίρεση).
// Κάθε μέρα: (α) Σήμερα = Δύναμη = ΗΚΑΙ = ΔΥΝΑΜΗ, (β) η αυτόματη δεν βάζει άτομο σε άδεια ή δύο φορές, (γ) κάθε όπλο έναν κάτοχο, (δ) η αναίρεση
// γυρίζει την αρχική κατάσταση, (στ) καμία εξαίρεση εκτός από τα μηνύματα κανόνων. Κάθε 15 μέρες βγαίνουν και τα Excel (κεφαλαία, χωρίς ISO ημερομηνίες).
// Κανονικά 14 σπόροι (~40 s)· SOAK_SEEDS=220 (8 λεπτά), SOAK_DAYS=90, SOAK_EXCEL=5 (Excel κάθε 5 μέρες), SOAK_STATS=1 (στατιστικά) για μεγαλύτερο τρέξιμο. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Person, type TypeKey } from '../src/shared/domain';
import { addDays, type ISODate } from '../src/shared/dates';
import { cadreOf, cadreOnlyAll, dutyStats, guardUnavailable, postsOf, statusWarn, twoMode } from '../src/shared/rules';
import { linkedSvc } from '../src/shared/cadreDuty';
import { registry } from '../src/shared/assets';
import { weaponKey } from '../src/shared/weapons';
import { Store } from '../src/main/db';
import { fillFroura, fillHkai, fillOuts, sigsOf } from '../src/main/exports';
import { buildTemplate, fillReport } from '../src/main/reports';
import { makeHdDocx } from '../src/main/hdDocx';
import { defaultPick, withBuilt, PRESETS, type Report } from '../src/shared/reports';
import { hdTags } from '../src/shared/hd';
import JSZip from 'jszip';
import { cadreDutyBook, dutyCheck, rosterPrint, weaponsBook, assetBook } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { check } from './strength-check';
import { rng } from './duty-sim';
import { fakeState, fakePeople } from './fixtures';

const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const D0 = '2026-12-01';
const SEEDS = +(process.env.SOAK_SEEDS || 14), DAYS = +(process.env.SOAK_DAYS || 90), EXCEL_EVERY = +(process.env.SOAK_EXCEL || 15);
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx = (today: ISODate = D0) => ({ today, newId: () => 'z' + ++seq });
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

// ---------- η ρύθμιση ----------
// τα ίδια κλειδιά KV με το db.ts (δεν εξάγονται)
const KV_KEYS = ['rules', 'settings', 'printed', 'baseline', 'hkaiManual', 'cadreList', 'cadreAbs', 'cadreGrants', 'cadreNoDuty', 'cadreDuties', 'cadreDutyOf', 'assets', 'assetLog', 'dutyLog', 'nightTraining', 'weaponLog', 'dutyFix', 'notes', 'outNotes', 'imer', 'hd', 'dayPlan', 'backFix', 'lastExpire', 'dutyOnce'];
const SIZES = [0, 1, 2, 3, 5, 8, 14, 25, 40, 70, 120];
interface Cfg { n: number; unit: boolean; nc: number; limit: number; fixed: boolean; two: 'never' | 'last' | 'free'; weapons: boolean }
function world(seed: number): { s: AppState; cfg: Cfg; r: () => number } {
  seq = 0; const r = rng((Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0); for (let i = 0; i < 20; i++) r();
  const cfg: Cfg = { n: SIZES[seed % SIZES.length], unit: seed % 2 === 0, nc: pick(r, [0, 1, 2, 4, 8, 12]), limit: pick(r, [0, 0, 4, 8]), fixed: r() < 0.4, two: pick(r, ['never', 'last', 'free'] as const), weapons: r() < 0.8 };
  let s = fakeState(cfg.n);
  s = apply(s, { t: 'setSettings', settings: { ...(cfg.unit ? { mode: 'unit' } : {}), cadreDuty: { groups: [{ id: 'g1', name: 'Αξιωματικοί', services: [{ id: 'a', name: 'Αξιωματικός Υπηρεσίας', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] }, { id: 'g2', name: 'Υπαξιωματικοί', services: [{ id: 'b', name: 'Υπαξιωματικός Υπηρεσίας', short: 'ΥΔΚ', perDay: 1, h24: true, hkCol: '' }, { id: 'c', name: 'Πύλη στελεχών', short: 'ΠΣ', perDay: 1, h24: false, hkCol: '' }] }], limits: { off: { base: 5, extra: 1 }, nco: { base: 6, extra: 1 } }, rest: 1, carry: true, fairHol: true } }, text: 'δοκιμή' }, ctx()).state;
  if (cfg.unit) s = apply(s, { t: 'setRules', rules: { ...s.rules, twoPerDay: cfg.two }, text: 'δοκιμή' }, ctx()).state;
  if (cfg.limit) s = apply(s, { t: 'setRules', rules: { ...s.rules, dutyMax: cfg.limit, dutyMaxPer: 'month' }, text: 'δοκιμή' }, ctx()).state;
  for (let i = 0; i < cfg.nc; i++) {
    const off = i % 3 === 0;
    s = apply(s, { t: 'saveCadre', cadre: { rank: off ? 'ΙΛΧΟΣ' : 'ΛΧΙΑΣ', hk: off ? 'Ίλαρχοι' : 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(913 + i), first: 'ΟΝΟΜΑ', ...(cfg.weapons ? { weapon: 'S-' + i, wtype: 'Μ1911 Α1' } : {}) } as any }, ctx()).state;
  }
  for (const c of s.cadreList) s = apply(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: c.hk === 'Ίλαρχοι' ? 'g1' : 'g2' } }, ctx()).state;
  const ph = s.settings.phase;
  if (cfg.nc) {
    s = apply(s, { t: 'addBlock', phase: ph, name: 'ΑΥΔΜ ΘΕΣΗ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g1', cadreAs: 'a' }, ctx()).state;
    s = apply(s, { t: 'addBlock', phase: ph, name: 'ΥΔΚ ΘΕΣΗ', armed: false, n: 2, hrs: '', who: 'cadre', cadreGroup: 'g2', cadreAs: 'b' }, ctx()).state;
  }
  s = apply(s, { t: 'addBlock', phase: ph, name: 'ΠΥΛΗ', armed: true, n: 2, hrs: '14:00 → 14:00' }, ctx()).state;
  if (cfg.fixed && s.people.length > 4) s = apply(s, { t: 'setSettings', settings: { fixed: { ly: s.people[2].id, dy: s.people[3].id } }, text: 'μόνιμοι' }, ctx()).state;
  if (cfg.weapons) {
    s = apply(s, { t: 'setWeapons', changes: s.people.map(p => ({ pid: p.id, weapon: String(100000 + p.id), wtype: 'G3A3', rack: 'Α', wpos: String(1 + (p.id % 40)) })) }, ctx()).state;
    const assets = []; for (let i = 0; i < 20; i++) assets.push({ id: 'w' + i, cat: 'pistolia', type: 'Μ1911 Α1', no: 'W' + i, state: 'ok' as const });
    for (let i = 0; i < 10; i++) assets.push({ id: 'm' + i, cat: 'diopt', type: 'ΕΙΔΟΣ' + (i % 3), no: 'M' + i, state: 'ok' as const });
    for (let i = 0; i < 4; i++) assets.push({ id: 'v' + i, cat: 'troxofora', type: '1/4 τόνου', no: 'ΕΑ-' + i, state: 'ok' as const } as any);
    s = { ...s, assets: assets as AppState['assets'] };
  }
  return { s, cfg, r };
}

// ---------- θέσεις «Μόνο στελέχη» ↔ πρόγραμμα υπηρεσιών στελεχών, σύνολα Έλεγχου υπηρεσιών (όπως Π1, εδώ μέσα στο χάος όλων των ενεργειών) ----------
function linkErrors(s: AppState, d: ISODate, err: string[]) {
  const co = cadreOnlyAll(s.settings); const list = s.cadreDuties || [];
  for (const day of Object.keys(s.guards)) for (const k of co.keys()) {
    const pid = s.guards[day][k]; if (pid == null || pid > 0) { if (pid != null && pid > 0) err.push(d + ' ' + day + ' ' + k + ': στρατιώτης σε θέση στελεχών'); continue; }
    const c = cadreOf(s, pid); const v = linkedSvc(s.settings, k); if (!c || !v) { err.push(d + ' ' + day + ' ' + k + ': άγνωστο στέλεχος ή υπηρεσία'); continue; }
    const hit = list.filter(x => x.date === day && x.via === k);
    if (!hit.length && [...co.keys()].some(q => q !== k && s.guards[day][q] === pid && linkedSvc(s.settings, q)?.id === v.id && list.some(x => x.date === day && x.via === q))) continue;   // γνωστό (Π1): ίδιο στέλεχος σε 2 θέσεις της ίδιας υπηρεσίας
    if (hit.length !== 1 || hit[0].cid !== c.id || hit[0].svc !== v.id) err.push(d + ' ' + day + ' ' + k + ': ' + hit.length + ' εγγραφές στο πρόγραμμα στελεχών για το στέλεχος της θέσης');
  }
  for (const x of list) if (x.via) { const pid = s.guards[x.date]?.[x.via]; const c = pid != null ? cadreOf(s, pid) : undefined; if (!co.has(x.via) || c?.id !== x.cid) err.push(d + ' ' + x.date + ' ' + x.svc + ' via ' + x.via + ': η θέση δεν έχει αυτό το στέλεχος'); }
  const seen = new Set<string>(); for (const x of list) { const key = x.date + '|' + x.svc + '|' + x.cid; if (seen.has(key)) err.push(d + ' διπλή εγγραφή ' + key); seen.add(key); }
  const cnt = new Map<number, number>(); for (const day of Object.keys(s.guards)) for (const k in s.guards[day]) cnt.set(s.guards[day][k], (cnt.get(s.guards[day][k]) || 0) + 1);
  for (const [pid, st] of dutyStats(s)) if ((cnt.get(pid) || 0) !== st.total) err.push(d + ' Έλεγχος υπηρεσιών: σύνολο ' + pid + ' ' + st.total + ' αντί ' + (cnt.get(pid) || 0));
}

// ---------- έλεγχος των Excel ----------
const LOWER = /[a-zα-ωά-ώ]/;
const SEAT = /^([Α-Ω]+\d*[α-ω]|\d+ο)$/;          // κωδικοί θέσεων, π.χ. Θ1α, και τα νούμερα «1ο» της ΦΡΟΥΡΑΣ: ακριβώς όπως είναι
// Γνωστό (Π8, ερώτηση στον Michael): η σημείωση κάτω από τον Έλεγχο υπηρεσιών είναι με πεζά από το #362· περιμένει απάντηση πριν αλλάξει η έξοδος
const KNOWN_LOWER = /^Θ1α… θαλαμοφύλακας/;
async function scan(tag: string, buf: Buffer, tpl?: Buffer): Promise<string[]> {
  const e: string[] = []; const wb = await Workbook.open(buf); const tw = tpl ? await Workbook.open(tpl) : null;
  const tn = tw ? tw.sheetNames() : [];
  for (const n of wb.sheetNames()) {
    const rows = await wb.values(n); const tr = tw && tn.includes(n) ? await tw.values(n) : null;
    rows.forEach((row, ri) => row.forEach((v, ci) => {
      if (typeof v !== 'string' || !v) return;
      if (KNOWN_LOWER.test(v)) return;
      if (tr && tr[ri]?.[ci] === v) return;          // όπως στο πρότυπο: δεν το έγραψε η εφαρμογή
      const where = tag + ' ' + n + '!' + String.fromCharCode(65 + (ci % 26)) + (ri + 1) + ' «' + v.slice(0, 40) + '»';
      if (/\b\d{4}-\d{2}-\d{2}\b/.test(v)) e.push(where + ' ημερομηνία ISO');
      if (/undefined|NaN|\[object|#REF|#VALUE|#DIV|#N\/A/.test(v)) e.push(where + ' σκουπίδια');
      if (LOWER.test(v) && !v.split(/[\s/,;:()·+\-–]+/).every(w => !LOWER.test(w) || SEAT.test(w))) e.push(where + ' όχι κεφαλαία');
    }));
  }
  return e;
}
async function excelOf(s: AppState, d: ISODate, forms: boolean, errs: string[]) {
  const ym = d.slice(0, 7);
  const jobs: [string, () => Promise<{ data: Buffer; warnings?: string[] }>, Buffer?][] = [
    ['ΦΡΟΥΡΑ', () => fillFroura(T('froura.xlsx'), s, d), T('froura.xlsx')],
    ['ΗΚΑΙ', () => fillHkai(T('hkai.xlsx'), s, d), T('hkai.xlsx')],
    ['ΕΞΟΔΟΥΧΟΙ', () => fillOuts(T('exodouxoi.xlsx'), s, d), T('exodouxoi.xlsx')],
    ['ΔΥΝΑΜΟΛΟΓΙΟ', () => rosterPrint(s, d)], ['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', () => dutyCheck(s, ym)], ['ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ', () => cadreDutyBook(s, ym, d)],
    ['ΟΠΛΙΣΜΟΣ', () => weaponsBook(s, d)], ['ΜΗΤΡΩΟ', () => assetBook(s, registry(s), d)]
  ];
  for (const [name, f, tpl] of jobs) {
    try { const r = await f(); const w = r.warnings?.filter(x => /undefined|NaN|\[object/.test(x)) || []; errs.push(...w.map(x => d + ' ' + name + ' προειδοποίηση ' + x)); errs.push(...(await scan(d + ' ' + name, r.data, tpl)).slice(0, 5)); }
    catch (e: any) { errs.push(d + ' ' + name + ' ΣΦΑΛΜΑ ' + (e?.message || e)); }
  }
  // Ημερήσια Διαταγή (Word) και κάθε έτοιμο έντυπο των Εντύπων, με όλους τους ενεργούς
  if (forms) {
    try {
      const g = sigsOf(s, 'hd', null); const tags = hdTags(s.settings, d, { aydm: '', dn: '', ilxos: '', ax: [], op: [], t2: '', t3: '' }, g.sigs ?? g.def);
      const buf = await makeHdDocx(null, tags, null, { dateText: d, font: 'Arial' }); const x = (await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, ' ');
      if (/undefined|NaN|\[object|\b\d{4}-\d{2}-\d{2}\b/.test(x)) errs.push(d + ' ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ: σκουπίδια ή ISO ημερομηνία: ' + (/undefined|NaN|\[object|\b\d{4}-\d{2}-\d{2}\b/.exec(x) || [''])[0]);
    } catch (e: any) { errs.push(d + ' ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΣΦΑΛΜΑ ' + (e?.message || e)); }
    const ids = s.people.filter(p => p.active).map(p => p.id);
    for (const pre of PRESETS) {
      try {
        const kind = (pre as any).kind || 'people'; const b = await buildTemplate(pre.opts, kind);
        const r: Report = withBuilt({ id: 'r', name: pre.id, tpl: 't', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' } as Report, b, pre.opts);
        const res = await fillReport(b.data, s, r, kind === 'people' ? ids : [], d);
        errs.push(...(await scan(d + ' ΕΝΤΥΠΟ ' + pre.id, res.data, b.data)).slice(0, 3));
      } catch (e: any) { errs.push(d + ' ΕΝΤΥΠΟ ' + pre.id + ' ΣΦΑΛΜΑ ' + (e?.message || e)); }
    }
  }
}

// ---------- μία μέρα στο γραφείο ----------
const ST: TypeKey[] = ['LEAVE', 'LEAVE', 'SICK', 'STEP', 'NOS', 'HON', 'PUN', 'EY'];
const BUG = (e: unknown) => e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;
const COV: Record<string, [number, number]> = {};   // εντολή → [πέρασαν, απορρίφθηκαν με μήνυμα κανόνα], μόνο για SOAK_STATS
interface Run { s: AppState; errs: string[]; undoBad: string[]; thrown: number; cmds: number; undos: number; fills: number; empty: number; excel: number }
async function simulate(seed: number): Promise<Run> {
  const { s: s0, cfg, r } = world(seed);
  const out: Run = { s: s0, errs: [], undoBad: [], thrown: 0, cmds: 0, undos: 0, fills: 0, empty: 0, excel: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8-')); const st = new Store(dir, WASM); await st.open(); st.commit(s0);
  const canon = (x: unknown): string => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
  // λίστες KV: χωρίς σειρά (η αναίρεση ξαναβάζει τη γραμμή στο τέλος), και «λείπει» = κενό
  const empt = (v: any): string => (v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length) ? 'κενό' : canon(Array.isArray(v) ? v.map(canon).sort() : v));
  const parts = (a: AppState): Record<string, string> => ({ people: canon(a.people), statuses: canon([...a.statuses].sort((x, y) => (x.id < y.id ? -1 : 1))), guards: canon(a.guards), caps: canon(a.caps), requests: canon([...a.requests].sort((x, y) => (x.id < y.id ? -1 : 1))), ...Object.fromEntries(KV_KEYS.map(k => [k, empt((a as any)[k])])) });
  const norm = (a: AppState) => canon(parts(a));
  const which = (x: AppState, y: AppState) => { const p = parts(x), q = parts(y); return Object.keys(p).filter(k => p[k] !== q[k]).join(','); };
  const cur = () => st.state;
  const act = (c: Command, d: ISODate): { text: string } | null => {
    let res; try { res = apply(cur(), c, ctx(d)); } catch (e: any) { if (BUG(e)) out.errs.push(d + ' ' + c.t + ' ΕΞΑΙΡΕΣΗ ' + e.message + ' ' + String(e.stack).split('\n')[1]); out.thrown++; (COV[c.t] ||= [0, 0])[1]++; return null; }
    out.cmds++; (COV[c.t] ||= [0, 0])[0]++;
    if (/undefined|NaN|\[object/.test(res.text)) out.errs.push(d + ' ' + c.t + ': κείμενο «' + res.text + '»');
    const prev0 = cur(); const before = norm(prev0); const p = st.commit(res.state);
    if (r() < 0.2) { const after = norm(cur()); st.revert(p); out.undos++; if (norm(st.state) !== before) out.undoBad.push(d + ' ' + c.t + ' ΔΙΑΦΟΡΑ: ' + which(prev0, st.state) + (process.env.SOAK_DBG ? ' | ' + which(prev0, st.state).split(',').map(k => 'A=' + String(JSON.stringify((prev0 as any)[k])).slice(0, 600) + ' B=' + String(JSON.stringify((st.state as any)[k])).slice(0, 600)).join(' ') : '')); st.commit(res.state); if (norm(cur()) !== after) out.undoBad.push(d + ' ' + c.t + ' (ξανά) ΔΙΑΦΟΡΑ: ' + which(res.state, cur())); }
    return res;
  };
  const people = () => cur().people.filter(p => p.active);
  for (let i = 0; i < DAYS; i++) {
    const d = addDays(D0, i); const ppl = people();
    // άδειες, ΣΤΕΠ, ποινές, νοσοκομείο
    if (ppl.length && r() < 0.5) { const type = pick(r, ST); const pids = [...new Set([pick(r, ppl).id, pick(r, ppl).id])]; const from = addDays(d, Math.floor(r() * 3)); act({ t: 'declare', cmd: { type, pids, from, to: addDays(from, Math.floor(r() * 6)), ...(type === 'LEAVE' ? { kind: 'Κανονική' } : {}), ...(type === 'PUN' ? { kind: 'Κράτηση', by: 'ΔΟΚΙΜΗ', reason: 'δοκιμή' } : {}), ...(type === 'STEP' && r() < 0.3 ? { open: true } : {}) } }, d); }
    if (r() < 0.12) { const o = cur().statuses.filter(x => x.from <= d && x.to >= d); if (o.length) act({ t: 'endStatus', id: pick(r, o).id }, d); }
    if (r() < 0.12) { const o = cur().statuses.filter(x => x.type === 'LEAVE' && x.from <= d && x.to >= d); if (o.length) act({ t: 'endLeave', id: pick(r, o).id, date: d, time: '12:00' }, d); }
    // έξοδοι
    if (ppl.length && r() < 0.3) act({ t: 'outs', date: d, changes: ppl.filter(() => r() < 0.3).map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) }, d);
    // νέος στρατιώτης, φεύγων (μονάδα: κίνηση δύναμης), σβήσιμο από τη δύναμη
    if (r() < 0.06) { const p = fakePeople(1)[0]; const { id: _i, active: _a, ...np } = { ...p, last: 'ΝΕΟΣ' + i, asm: String(800000 + i) } as Person; void _i; void _a; act({ t: 'addPerson', person: np as any }, d); }
    if (cfg.unit && ppl.length > 1 && r() < 0.05) act({ t: 'addMove', pid: pick(r, ppl).id, dir: 'out', why: 'Μετάθεση', on: addDays(d, Math.floor(r() * 4)) }, d);
    if (cfg.unit) act({ t: 'applyMoves' }, d);
    if (ppl.length > 3 && r() < 0.03) act({ t: 'updatePerson', person: { ...pick(r, ppl), active: false } }, d);
    // στελέχη
    const cl = cur().cadreList.filter(c => c.active);
    if (cl.length && r() < 0.2) { const f = addDays(d, Math.floor(r() * 10)); act({ t: 'addCadreAbs', abs: { cid: pick(r, cl).id, kind: pick(r, ['ka', 'amd', 'apal', 'yp', 'nos']), from: f, to: addDays(f, Math.floor(r() * 6)) }, replace: false }, d); }
    if (cl.length && r() < 0.15) act({ t: 'saveCadreDuty', duty: { date: addDays(d, Math.floor(r() * 3)), svc: pick(r, ['a', 'b', 'c']), cid: pick(r, cl).id } }, d);
    // όπλα και υλικό
    const as = cur().assets || [];
    if (as.length && r() < 0.3) { const a = pick(r, as); const q = r(); act({ t: 'assetHolder', id: a.id, holder: q < 0.5 && ppl.length ? { k: 'person', pid: pick(r, ppl).id } : q < 0.7 && cl.length ? { k: 'cadre', cid: pick(r, cl).id } : q < 0.8 ? { k: 'unit', name: 'ΑΛΛΗ ΙΛΗ' } : null, date: d }, d); }
    if (cfg.weapons && ppl.length && r() < 0.1) act({ t: 'weaponOut', pids: [pick(r, ppl).id], reason: 'ΔΟΚΙΜΗ', day: d, time: '10:00' }, d);
    if (r() < 0.1) { const o = cur().weaponLog.filter(x => !x.inDay); if (o.length) act({ t: 'weaponIn', ids: [pick(r, o).id], day: d, time: '15:00' }, d); }
    // αιτήσεις, οχήματα, αλλαγές ώρας, αλλαγή λειτουργίας, ανταλλαγή θέσεων, σβήσιμο κατάστασης
    if (ppl.length && r() < 0.1) act({ t: 'addRequest', req: { pid: pick(r, ppl).id, date: d, text: 'ΔΟΚΙΜΗ', ...(r() < 0.6 ? { leave: { type: 'LEAVE', kind: 'Κανονική', from: addDays(d, 2), to: addDays(d, 2 + Math.floor(r() * 5)) } } : {}) } }, d);
    if (r() < 0.1) { const w = cur().requests.filter(x => !x.decision); if (w.length) act({ t: 'decideRequest', id: pick(r, w).id, ok: r() < 0.7 }, d); }
    const veh = (cur().assets || []).filter(a => a.cat === 'troxofora');
    if (veh.length && r() < 0.2) { const a = pick(r, veh); const q = r(); act(q < 0.3 ? { t: 'assetFuel', id: a.id, date: d, litres: 20 + Math.floor(r() * 30), km: 1000 + i * 40 } : q < 0.55 ? { t: 'assetKm', id: a.id, date: d, km: 1000 + i * 40 } : q < 0.75 ? { t: 'assetMaint', id: a.id, date: d, km: 1000 + i * 40 } : { t: 'assetDriver', id: a.id, date: d, driver: ppl.length && r() < 0.8 ? { k: 'person', pid: pick(r, ppl).id } as any : null }, d); }
    if (r() < 0.04) act({ t: 'setDayPlan', date: addDays(d, Math.floor(r() * 3)), plan: pick(r, [{ train: true }, { out: '14:00' }, { backOut: '23:30' }, { backDn: '07:00' }]) }, d);
    if (r() < 0.03) act({ t: 'setSettings', settings: { mode: r() < 0.5 ? 'unit' : 'centre' } as any, text: 'δοκιμή' }, d);
    if (r() < 0.06) { const g = cur().guards[addDays(d, 1)]; const ks = g ? Object.keys(g) : []; if (ks.length > 1) act({ t: 'swapPosts', date: addDays(d, 1), a: ks[0], b: ks[1] }, d); }
    if (r() < 0.04) act({ t: 'clearDay', date: addDays(d, 1 + Math.floor(r() * 3)) }, d);
    if (r() < 0.05) { const o = cur().statuses; if (o.length) act({ t: 'deleteStatus', id: pick(r, o).id }, d); }
    if (r() < 0.03) act({ t: 'setPhase', phase: r() < 0.5 ? 'sven' : 'spen' }, d);
    // υπηρεσίες: η αυτόματη συμπλήρωση της μέρας (και λίγο μπροστά)
    const before = cur().guards[d] || {}; const res = act({ t: 'autofill', date: d }, d);
    if (res) {
      out.fills++; const m = /(\d+) έμειναν κενές/.exec(res.text); if (m) out.empty += +m[1];
      const s = cur(); const g = s.guards[d] || {}; const valid = new Set(postsOf(s.settings).map(x => x.k)); const times = new Map<number, number>();
      for (const k in g) times.set(g[k], (times.get(g[k]) || 0) + 1);
      for (const k in g) if (g[k] !== before[k]) {
        if (!valid.has(k)) out.errs.push(d + ' ' + k + ': γέμισε θέση που δεν υπάρχει');
        if (g[k] > 0) {
          if (guardUnavailable({ ...s, guards: { ...s.guards, [d]: { ...g, [k]: undefined as any } } }, d, g[k], k) && !/πάνω από|Μόνιμος|ΠΡΟΣΟΧΗ|Χωρίς άλλη επιλογή|κενές/.test(res.text)) out.errs.push(d + ' ' + k + ': η αυτόματη έβαλε τον ' + g[k] + ' που δεν μπορεί (' + String(guardUnavailable({ ...s, guards: { ...s.guards, [d]: { ...g, [k]: undefined as any } } }, d, g[k], k)) + '), χωρίς ειδοποίηση · ' + res.text.slice(0, 300));
          // ανεξάρτητα από τους κανόνες της εφαρμογής: ολόκληρη μέρα σε άδεια, αναρρωτική, νοσοκομείο ή ΣΤΕΠ → όχι σε υπηρεσία, εκτός μόνιμου ή ειδοποίησης
          const gone = s.statuses.find(x => x.pid === g[k] && ['LEAVE', 'SICK', 'NOS', 'HON'].includes(x.type) && x.from < d && d < x.to);
          if (gone && !/Χωρίς άλλη επιλογή|ΠΡΟΣΟΧΗ|Μόνιμος/.test(res.text) && !(s.settings.fixed && Object.values(s.settings.fixed).includes(g[k]))) out.errs.push(d + ' ' + k + ': ' + g[k] + ' σε ' + gone.type + ' ' + gone.from + '–' + gone.to + ' βγήκε σε υπηρεσία');
          if (twoMode(s) === 'never' && (times.get(g[k]) || 0) > 1) out.errs.push(d + ' ' + k + ': ' + g[k] + ' σε δύο θέσεις');
          if (statusWarn(s, d, g[k]) && !/ΠΡΟΣΟΧΗ|ειδοποίηση|πάνω από|Μόνιμος/.test(res.text) && !(s.settings.fixed && Object.values(s.settings.fixed).includes(g[k]))) out.errs.push(d + ' ' + k + ': ' + g[k] + ' με κατάσταση (' + statusWarn(s, d, g[k]) + ') βγήκε σε υπηρεσία');
        }
      }
    }
    if (r() < 0.07) act({ t: 'autofillRange', dates: [addDays(d, 1), addDays(d, 2)] }, d);
    if (r() < 0.05) { const t = cur().guards[d]; if (t) { const who = Object.values(t)[0]; if (who != null) act({ t: 'setDutyOnce', date: d, who: who > 0 ? String(who) : 'c:' + who, once: r() < 0.5 }, d); } }
    // κάθε μέρα: οι δυνάμεις συμφωνούν, τα όπλα έχουν έναν κάτοχο
    for (const x of [d, addDays(d, 1)]) out.errs.push(...check(cur(), x).map(e => e));
    linkErrors(cur(), d, out.errs);
    const rg = registry(cur()).filter(x => x.cat?.kind === 'weapon'); const seen = new Set<string>(); const prim = new Set<string>(); const dup = new Set<string>();
    for (const p of [...cur().people, ...cur().cadreList]) { const k = weaponKey(p.weapon); if (!k) continue; if (prim.has(k)) dup.add(k); prim.add(k); }
    for (const x of rg) { const k = weaponKey(x.a.no); if (!k || dup.has(k)) continue; if (seen.has(k)) out.errs.push(d + ' όπλο ' + k + ' δύο φορές στο Μητρώο'); seen.add(k); }
    if ((i + 1) % EXCEL_EVERY === 0 || i === DAYS - 1) { out.excel++; await excelOf(cur(), d, i === DAYS - 1 || (i + 1) % (EXCEL_EVERY * 3) === 0, out.errs); }
  }
  out.s = cur(); st.close(); fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('Π8: μια μέρα στο γραφείο × ' + DAYS + ' μέρες, τυχαίες ρυθμίσεις', () => {
  for (let seed = 1; seed <= SEEDS; seed++) it('σπόρος ' + seed, async () => {
    const o = await simulate(seed);
    if (process.env.SOAK_STATS) { const s = o.s; console.log('σπόρος', seed, 'άτομα', s.people.length, 'στελέχη', s.cadreList.length, 'εντολές', o.cmds, 'απορρίφθηκαν', o.thrown, 'αναιρέσεις', o.undos, 'συμπληρώσεις', o.fills, 'κενές', o.empty, 'ημέρες με υπηρεσίες', Object.keys(s.guards).length, 'θέσεις', Object.values(s.guards).reduce((a, g) => a + Object.keys(g).length, 0), 'προγρ.στελ.', (s.cadreDuties || []).length, 'καταστάσεις', s.statuses.length, 'όπλα-έξοδοι', s.weaponLog.length, 'ιστορικό υλικού', (s.assetLog || []).length); }
    if (process.env.SOAK_STATS && seed === SEEDS) console.log('ΕΝΤΟΛΕΣ ' + Object.entries(COV).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(', '));
    expect(o.cmds).toBeGreaterThan(DAYS);
    expect(o.errs.slice(0, 12)).toEqual([]);
    expect(o.undoBad.slice(0, 8)).toEqual([]);
    expect(o.excel).toBeGreaterThan(0);
  }, 600000);
});
void blocksOf;
