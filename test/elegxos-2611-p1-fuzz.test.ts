// Έλεγχος 25/11, Π1 (υπηρεσίες στρατιωτών και στελεχών): τυχαίοι συνδυασμοί ρυθμίσεων × 60 μέρες, μόνο με εντολές (apply), όπως ο λοχίας:
// αυτόματη συμπλήρωση (και από θαλάμους, και ΠΣΚ), στέλεχος με το χέρι σε θέση στρατιωτών και σε θέση «Μόνο στελέχη», υπηρεσία στο πρόγραμμα
// στελεχών, σβήσιμο από τις δύο πλευρές, ανενεργή υπηρεσία, μόνιμο άτομο, όριο υπηρεσιών, λειτουργία μονάδας με 2 υπηρεσίες/μέρα.
// Μετά από κάθε εντολή: οι δύο καρτέλες (Υπηρεσίες και πρόγραμμα στελεχών) λένε τα ίδια, τα σύνολα ταιριάζουν με το πλέγμα, και η αναίρεση
// γυρίζει όλα πίσω. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Cadre, type CadreDutyCfg } from '../src/shared/domain';
import { addDays, type ISODate } from '../src/shared/dates';
import { live } from '../src/shared/ranks';
import { dutyPool, guardUnavailable, isUnarmed, lastResort, statusWarn, cadreOf, cadreOnlyAll, cadreOnlyOf, dutyLimitOf, dutyCount, dutyStats, fixedIds, monthDuties, pickPeople, postsOf, twoMode } from '../src/shared/rules';
import { dutyCfgOf, dutySheet, linkedSvc, monthCount, monthLimit, personOf, runsOn } from '../src/shared/cadreDuty';
import { cadreStatusOn } from '../src/shared/cadre';
import { monthOf } from '../src/shared/cadrePlan';
import { frouraLayout } from '../src/shared/froura';
import { Store } from '../src/main/db';
import { rng } from './duty-sim';
import { fakeState } from './fixtures';

const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const D0 = '2026-12-01';
const DAYS = 60;
let seq = 0;
const ctx = (today: ISODate = D0) => ({ today, newId: () => 'z' + ++seq });

// μία ρύθμιση από τον σπόρο
interface Cfg { unit: boolean; two: 'never' | 'last' | 'free'; rest: number; limit: number; per: 'all' | 'month'; fixed: boolean; second: boolean; rooms: boolean; own: number }
interface Ext { n?: number; nc?: number; leaveAll?: boolean }
function setup(seed: number, x: Ext = {}): { s: AppState; cfg: Cfg; r: () => number } {
  seq = 0; const r = rng(seed * 7919 + 13); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const cfg: Cfg = { unit: r() < 0.4, two: pick(['never', 'last', 'free'] as const), rest: pick([0, 1, 1, 2]), limit: r() < 0.5 ? 0 : pick([3, 5, 8, 20]), per: pick(['all', 'month'] as const), fixed: r() < 0.5, second: r() < 0.6, rooms: r() < 0.3, own: Math.floor(r() * 4) };
  let s = fakeState(30 + Math.floor(r() * 30));
  if (x.n != null) s = { ...s, people: s.people.slice(0, x.n) };
  const cd: Partial<CadreDutyCfg> = {
    groups: [
      { id: 'g1', name: 'Αξιωματικοί', services: [{ id: 'a', name: 'Αξιωματικός Υπηρεσίας', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] },
      { id: 'g2', name: 'Υπαξιωματικοί', services: [
        { id: 'b', name: 'Υπαξιωματικός Υπηρεσίας', short: 'ΥΔΚ', perDay: 1, h24: true, hkCol: '' },
        { id: 'c', name: 'Πύλη στελεχών', short: 'ΠΣ', perDay: 1 + Math.floor(r() * 2), h24: false, hkCol: '', ...(r() < 0.5 ? { days: [1, 2, 3, 4, 5] } : {}) }] }],
    limits: { off: { base: 3 + Math.floor(r() * 5), extra: 1 }, nco: { base: 4 + Math.floor(r() * 6), extra: Math.floor(r() * 2) } }, rest: cfg.rest, carry: r() < 0.7, fairHol: true
  };
  s = apply(s, { t: 'setSettings', settings: { cadreDuty: cd, ...(cfg.unit ? { mode: 'unit' } : {}) }, text: 'δοκιμή' }, ctx()).state;
  if (cfg.unit) s = apply(s, { t: 'setRules', rules: { ...s.rules, twoPerDay: cfg.two }, text: 'δοκιμή' }, ctx()).state;
  if (cfg.limit) s = apply(s, { t: 'setRules', rules: { ...s.rules, dutyMax: cfg.limit, dutyMaxPer: cfg.per }, text: 'δοκιμή' }, ctx()).state;
  // δικό τους όριο σε μερικούς στρατιώτες
  for (let i = 0; i < cfg.own && s.people.length; i++) { const p = pick(s.people); s = apply(s, { t: 'updatePerson', person: { ...p, dutyMax: 2 + Math.floor(r() * 10) } }, ctx()).state; }
  // στελέχη: αξιωματικοί στην g1, υπαξιωματικοί στην g2, μερικοί χωρίς ομάδα, με περιορισμούς
  const nc0 = 6 + Math.floor(r() * 7); const nc = x.nc ?? nc0;
  for (let i = 0; i < nc; i++) {
    const off = i % 3 === 0;
    s = apply(s, { t: 'saveCadre', cadre: { rank: off ? 'ΙΛΧΟΣ' : 'ΛΧΙΑΣ', hk: off ? 'Ίλαρχοι' : 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(913 + i), first: 'ΟΝΟΜΑ', ...(r() < 0.15 ? { monthMax: 2 + Math.floor(r() * 4) } : {}) } }, ctx()).state;
  }
  for (const c of s.cadreList) {
    const x = r(); const group = x < 0.1 ? undefined : c.hk === 'Ίλαρχοι' ? 'g1' : 'g2';
    const restr = r(); const person = { ...(group ? { group } : {}), ...(restr < 0.1 ? { none: {} } : restr < 0.2 ? { no24: {} } : restr < 0.3 ? { noDow: [0, 6] } : restr < 0.35 ? { only: { services: ['c'] } } : {}), ...(r() < 0.15 ? { limit: 1 + Math.floor(r() * 4) } : {}) };
    if (Object.keys(person).length) s = apply(s, { t: 'setCadreDutyOf', cid: c.id, person }, ctx()).state;
    if (r() < 0.4) { const f = addDays(D0, Math.floor(r() * 50)); s = apply(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(['ka', 'amd', 'apal', 'yp', 'nos', 'ey']), from: f, to: addDays(f, Math.floor(r() * 8)) }, replace: false }, ctx()).state; }
    if (r() < 0.15) { const f = addDays(D0, Math.floor(r() * 50)); s = apply(s, { t: 'setCadreNoDuty', cid: c.id, from: f, to: addDays(f, Math.floor(r() * 5)) }, ctx()).state; }
  }
  // υπηρεσίες: μία «Μόνο στελέχη» για τους αξιωματικούς, μία για τους υπαξιωματικούς (μετρά ως ΥΔΚ ή ως Πύλη), μία δική μου των στρατιωτών
  const ph = s.settings.phase;
  s = apply(s, { t: 'addBlock', phase: ph, name: 'ΑΥΔΜ ΘΕΣΗ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g1', ...(r() < 0.5 ? { cadreAs: 'a' } : {}) }, ctx()).state;
  if (cfg.second) s = apply(s, { t: 'addBlock', phase: ph, name: 'ΥΔΚ ΘΕΣΗ', armed: false, n: 1 + Math.floor(r() * 2), hrs: '', who: 'cadre', cadreGroup: 'g2', cadreAs: pick(['b', 'c']) }, ctx()).state;
  s = apply(s, { t: 'addBlock', phase: ph, name: 'ΠΥΛΗ', armed: true, n: 2, hrs: '14:00 → 14:00' }, ctx()).state;
  if (cfg.fixed) {
    const ps = postsOf(s.settings).filter(y => !cadreOnlyOf(s.settings).has(y.k)); const free = s.people.filter(p => !p.post).slice(1);
    const pyli = ps.find(y => blocksOf(s.settings).find(b => b.id === y.block)?.name === 'ΠΥΛΗ')!;
    const fixed: Record<string, number> = {}; [['ly', free[0]], ['dy', free[1]], [pyli.k, free[2]]].forEach(([k, p]) => { if (p) fixed[k as string] = (p as { id: number }).id; });
    if (Object.keys(fixed).length) s = apply(s, { t: 'setSettings', settings: { fixed }, text: 'μόνιμοι' }, ctx()).state;
  }
  // λίγες καταστάσεις στρατιωτών (άδεια)
  for (const p of s.people) if (x.leaveAll || r() < 0.15) { const f = addDays(D0, Math.floor(r() * 55)); s = { ...s, statuses: [...s.statuses, { id: 'L' + p.id, pid: p.id, type: 'LEAVE', kind: 'Κανονική', from: f, to: addDays(f, 2 + Math.floor(r() * 6)) }] }; }
  return { s, cfg, r };
}

// ---------------- έλεγχοι που ισχύουν πάντα ----------------
const viol = (out: string[], tag: string) => (m: string) => out.push(tag + ': ' + m);
function invariants(s: AppState, err: (m: string) => void) {
  const co = cadreOnlyAll(s.settings); const cl = s.cadreList || []; const list = s.cadreDuties || [];
  // co: και οι ανενεργές ή άλλου εντύπου (cadreOnlyAll): ό,τι έγινε εκεί μένει δεμένο με το πρόγραμμα
  // 1. θέση «Μόνο στελέχη» με στέλεχος ↔ μία εγγραφή του προγράμματος με via = η θέση, για την υπηρεσία που μετρά η θέση
  for (const d of Object.keys(s.guards)) for (const k of co.keys()) {
    const pid = s.guards[d][k]; if (pid == null) continue;
    if (pid > 0) { err(d + ' ' + k + ': στρατιώτης ' + pid + ' σε θέση στελεχών'); continue; }
    const c = cadreOf(s, pid); const v = linkedSvc(s.settings, k); if (!c || !v) { err(d + ' ' + k + ': άγνωστο στέλεχος ή υπηρεσία'); continue; }
    const hit = list.filter(x => x.date === d && x.via === k);
    // το ίδιο στέλεχος με το χέρι σε δύο θέσεις της ίδιας υπηρεσίας την ίδια μέρα (με αιτία): μία εγγραφή για τη μέρα, η άλλη θέση μετρά ως θέση (γνωστό, Π1-evrimata)
    if (!hit.length && [...co.keys()].some(q => q !== k && s.guards[d][q] === pid && linkedSvc(s.settings, q)?.id === v.id && list.some(x => x.date === d && x.via === q))) continue;
    if (hit.length !== 1 || hit[0].cid !== c.id || hit[0].svc !== v.id) err(d + ' ' + k + ': ' + hit.length + ' εγγραφές στο πρόγραμμα για το στέλεχος της θέσης');
  }
  // 2. κάθε εγγραφή με via: η θέση υπάρχει, έχει το ίδιο στέλεχος και μετρά την ίδια υπηρεσία
  for (const x of list) if (x.via) {
    const pid = s.guards[x.date]?.[x.via]; const c = pid != null ? cadreOf(s, pid) : undefined;
    if (!co.has(x.via) || c?.id !== x.cid || linkedSvc(s.settings, x.via)?.id !== x.svc) err(x.date + ' ' + x.svc + ' via ' + x.via + ': η θέση δεν έχει αυτό το στέλεχος');
  }
  // 3. καμία διπλή εγγραφή (μέρα, υπηρεσία, στέλεχος)
  const seen = new Set<string>(); for (const x of list) { const key = x.date + '|' + x.svc + '|' + x.cid; if (seen.has(key)) err('διπλή εγγραφή ' + key); seen.add(key); }
  // 4. το μέτρημα του μήνα του στελέχους = εγγραφές του προγράμματος + θέσεις στρατιωτών (η θέση «Μόνο στελέχη» μετρά μία, μέσω της εγγραφής)
  const yms = [...new Set([...Object.keys(s.guards), ...list.map(x => x.date)].map(d => d.slice(0, 7)))];
  for (const c of cl) for (const ym of yms) {
    const roster = list.filter(x => x.cid === c.id && x.date.startsWith(ym)).length;
    let seat = 0; if (c.pid != null) for (const d of Object.keys(s.guards)) if (d.startsWith(ym)) for (const k in s.guards[d]) if (s.guards[d][k] === c.pid && !(co.has(k) && list.some(x => x.date === d && x.via === k))) seat++;
    const m = monthCount(s, c.id, ym); if (m.done !== roster + seat) err(c.last + ' ' + ym + ': μετρά ' + m.done + ', πλέγμα ' + (roster + seat));
    // και ο κανόνας ορίου των θέσεων στρατιωτών (rules.ts monthDuties) μετρά το ίδιο, όταν δεν έχει δύο θέσεις την ίδια μέρα
    if (c.pid != null) {
      const last = ym + '-31'; const days = new Set<string>(); let twice = false;
      for (const d of Object.keys(s.guards)) if (d.startsWith(ym)) { const n = Object.values(s.guards[d]).filter(p => p === c.pid).length; if (n > 1) twice = true; if (n) days.add(d); }
      const md = monthDuties(s, last, c.pid, undefined, true);
      if (!twice && md !== m.done) err(c.last + ' ' + ym + ': όριο θέσεων μετρά ' + md + ', πρόγραμμα ' + m.done);
    }
  }
  // 5. Έλεγχος υπηρεσιών: τα σύνολα ανά άτομο = οι θέσεις του πλέγματος
  const cnt = new Map<number, number>(); for (const d of Object.keys(s.guards)) for (const k in s.guards[d]) cnt.set(s.guards[d][k], (cnt.get(s.guards[d][k]) || 0) + 1);
  for (const [pid, st] of dutyStats(s)) if ((cnt.get(pid) || 0) !== st.total) err('σύνολο ' + pid + ': ' + st.total + ' αντί ' + (cnt.get(pid) || 0));
}

// ---------------- έλεγχοι μετά την αυτόματη συμπλήρωση μιας μέρας ----------------
function afterFill(prev: AppState, s: AppState, d: ISODate, text: string, err: (m: string) => void, rooms?: number[]) {
  const g0 = prev.guards[d] || {}, g = s.guards[d] || {}; const co = cadreOnlyOf(s.settings); const valid = new Set(postsOf(s.settings).map(x => x.k));
  const cfg = dutyCfgOf(s.settings); const fx = s.settings.fixed || {}; const fixed = fixedIds(s);
  const times = new Map<number, number>(); for (const k in g) times.set(g[k], (times.get(g[k]) || 0) + 1);
  for (const k in g) {
    if (g0[k] === g[k]) continue; const pid = g[k];
    if (g0[k] != null) { err(d + ' ' + k + ': άλλαξε θέση που είχε ήδη άτομο'); continue; }
    if (!valid.has(k)) err(d + ' ' + k + ': γέμισε θέση που δεν υπάρχει σήμερα (ανενεργή υπηρεσία)');
    if (!co.has(k)) {
      if (pid < 0) err(d + ' ' + k + ': η αυτόματη έβαλε στέλεχος σε θέση στρατιωτών');
      if (twoMode(s) === 'never' && (times.get(pid) || 0) > 1) err(d + ' ' + k + ': ' + pid + ' σε δύο θέσεις');
      // μονάδα: 2η υπηρεσία μόνο αν κανείς χωρίς υπηρεσία σήμερα δεν μπορούσε να πάρει τη θέση
      if (twoMode(s) !== 'never' && (times.get(pid) || 0) > 1 && pid > 0 && !fixed.has(pid)) {
        const gg = { ...g }; delete gg[k]; const w: AppState = { ...s, guards: { ...s.guards, [d]: gg } }; const post = postsOf(s.settings).find(y => y.k === k)!;
        const free = dutyPool(s).filter(p => !times.has(p.id) && !fixed.has(p.id) && !(rooms?.length && !rooms.includes(p.room!)) && !(post.kind === 'ly' && p.post) && !guardUnavailable(w, d, p.id, k) && !lastResort(live(s), d, p.id, post, s.settings.lists) && !statusWarn(s, d, p.id) && !(s.rules.strictUnarmed && post.kind === 'sk' && isUnarmed(s, d, p.id)));
        if (free.length) err(d + ' ' + k + ': 2η υπηρεσία στον ' + pid + ' ενώ μπορούσαν ' + free.map(p => p.id).join(','));
      }
      // όριο υπηρεσιών: πάνω από αυτό μόνο με ειδοποίηση
      const p = s.people.find(x => x.id === pid); const lim = p && !fixed.has(pid) ? dutyLimitOf(s.rules, p) : null;
      if (lim && dutyCount(prev, d, pid, lim.per) >= lim.max && !text.includes('πάνω από το όριο υπηρεσιών')) err(d + ' ' + k + ': ' + pid + ' πάνω από το όριο χωρίς ειδοποίηση');
      // μόνιμο άτομο: αν η θέση του πήρε άλλον, η ενέργεια λέει γιατί
      if (fx[k] && fx[k] !== pid && valid.has(k) && s.people.some(x => x.id === fx[k] && x.active) && !text.includes('Μόνιμος')) err(d + ' ' + k + ': άλλος στη θέση του μόνιμου χωρίς ειδοποίηση');
      continue;
    }
    // θέση «Μόνο στελέχη»: στέλεχος της ομάδας, που μπορεί εκείνη τη μέρα
    const c = cadreOf(s, pid); const o = co.get(k)!; if (!c) { err(d + ' ' + k + ': όχι στέλεχος'); continue; }
    const p = personOf(s, c.id); const v = linkedSvc(s.settings, k)!;
    if (p.group !== o.group) err(d + ' ' + k + ': ' + c.last + ' δεν είναι της ομάδας');
    if (!c.active) err(d + ' ' + k + ': εκτός δύναμης');
    const st = cadreStatusOn(s, c.id, d); if (st && st.col !== 'yp') err(d + ' ' + k + ': ' + c.last + ' έχει ' + st.label);
    if ((s.cadreNoDuty || []).some(x => x.cid === c.id && x.from <= d && d <= x.to)) err(d + ' ' + k + ': δεν θέλει υπηρεσία');
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (p.none || p.noDow?.includes(dow) || (p.no24 && v.h24) || (p.only && !p.only.services.includes(v.id))) err(d + ' ' + k + ': ' + c.last + ' με περιορισμό');
    // όχι διπλή υπηρεσία την ίδια μέρα, ανάπαυση cfg.rest μέρες πριν (πρόγραμμα ή θέσεις)
    const busy = (day: ISODate, notK?: string) => (s.cadreDuties || []).some(x => x.cid === c.id && x.date === day && x.via !== notK) || Object.entries(s.guards[day] || {}).some(([q, v2]) => v2 === c.pid && q !== notK && !(co.has(q) && (s.cadreDuties || []).some(x => x.date === day && x.via === q)));
    if (busy(d, k)) err(d + ' ' + k + ': ' + c.last + ' έχει και άλλη υπηρεσία την ίδια μέρα');
    for (let i = 1; i <= cfg.rest; i++) if (busy(addDays(d, -i))) err(d + ' ' + k + ': ' + c.last + ' χωρίς ανάπαυση (' + addDays(d, -i) + ')');
    const l = monthLimit(s, c, monthOf(d)); if (l.done > l.effBase + l.extra) err(d + ' ' + k + ': ' + c.last + ' πάνω από όριο+έξτρα ' + l.done + '/' + l.effBase + '+' + l.extra);
  }
}

// ---------------- η μέρα του λοχία ----------------
function day(s: AppState, d: ISODate, r: () => number, cfg: Cfg, run: (s: AppState, c: Command, d: ISODate) => AppState | null): AppState {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const co = () => cadreOnlyOf(s.settings); const cl = () => s.cadreList.filter(c => c.active);
  const seatOf = (c: Cadre) => pickPeople(s).find(p => p.cid === c.id)!.id;
  const ahead = addDays(d, Math.floor(r() * 3));
  // στέλεχος με το χέρι σε θέση στρατιωτών (με αιτία)
  if (r() < 0.2) { const x = pick(postsOf(s.settings).filter(y => !co().has(y.k) && !s.guards[ahead]?.[y.k])); const c = pick(cl()); if (x && c) s = run(s, { t: 'assign', date: ahead, k: x.k, pid: seatOf(c), cid: c.id, force: 'δοκιμή' }, d) || s; }
  // στέλεχος με το χέρι σε θέση «Μόνο στελέχη»
  if (r() < 0.2) { const k = pick([...co().keys()].filter(q => !s.guards[ahead]?.[q])); const c = pick(cl()); if (k && c) s = run(s, { t: 'assign', date: ahead, k, pid: seatOf(c), cid: c.id, force: 'δοκιμή' }, d) || s; }
  // υπηρεσία στο πρόγραμμα στελεχών (δεμένη με θέση ή όχι)
  if (r() < 0.25) { const c = pick(cl()); const svc = pick(['a', 'b', 'c']); if (c) s = run(s, { t: 'saveCadreDuty', duty: { date: ahead, svc, cid: c.id } }, d) || s; }
  // σβήσιμο από το πρόγραμμα, ή από τη θέση
  if (r() < 0.12 && s.cadreDuties?.length) s = run(s, { t: 'deleteCadreDuty', id: pick(s.cadreDuties).id }, d) || s;
  if (r() < 0.12) { const past = addDays(d, -Math.floor(r() * 5)); const k = pick([...co().keys()].filter(q => s.guards[past]?.[q] != null)); if (k) s = run(s, { t: 'assign', date: past, k, pid: null }, d) || s; }
  // πολλές μαζί από το πρόγραμμα (setCadreDuties), όπως η «Αυτόματη συμπλήρωση μήνα» της οθόνης στελεχών
  if (r() < 0.05) { const c = pick(cl()); if (c) s = run(s, { t: 'setCadreDuties', add: [{ date: addDays(d, 1), svc: pick(['a', 'b']), cid: c.id, auto: true }], del: [], text: 'δοκιμή' }, d) || s; }
  // ανενεργή / ξανά ενεργή υπηρεσία
  if (r() < 0.04) { const b = pick(blocksOf(s.settings).filter(x => x.custom)); if (b) s = run(s, { t: 'setBlock', phase: s.settings.phase, id: b.id, patch: { hidden: !b.hidden } }, d) || s; }
  // η αυτόματη συμπλήρωση της μέρας (και από θαλάμους), και ΠΣΚ μπροστά
  const rooms = cfg.rooms && r() < 0.3 ? [1 + Math.floor(r() * 4), 5 + Math.floor(r() * 4)] : undefined;
  s = run(s, { t: 'autofill', date: d, ...(rooms ? { rooms } : {}) }, d) || s;
  if (r() < 0.08) s = run(s, { t: 'autofillRange', dates: [addDays(d, 1), addDays(d, 2)] }, d) || s;
  return s;
}

function simulate(seed: number, check: boolean, x: Ext = {}): { s: AppState; errs: string[]; cmds: number; empty: number; text: string[] } {
  const { s: s0, cfg, r } = setup(seed, x); let empty = 0; const text: string[] = []; let s = s0; const errs: string[] = []; let cmds = 0;
  const run = (st: AppState, c: Command, d: ISODate): AppState | null => {
    let res; try { res = apply(st, c, ctx(d)); } catch { return null; }   // κανόνας που ζητά αιτία ή «καμία αλλαγή»: όπως ο λοχίας, προχωρά
    cmds++; if (c.t === 'autofill') { text.push(res.text); const m = /(\d+) έμειναν κενές/.exec(res.text); if (m) empty += +m[1]; }
    if (check) {
      const e = viol(errs, d + ' ' + c.t);
      invariants(res.state, e);
      if (c.t === 'autofill') afterFill(st, res.state, c.date, res.text, e, c.rooms);
      if (c.t === 'autofillRange') { let p = st; for (const x of c.dates) { afterFill(p, { ...res.state, guards: { ...p.guards, [x]: res.state.guards[x] } }, x, res.text, e); p = { ...p, guards: { ...p.guards, [x]: res.state.guards[x] } }; } }
    }
    return res.state;
  };
  for (let i = 0; i < DAYS; i++) s = day(s, addDays(D0, i), r, cfg, run);
  return { s, errs, cmds, empty, text };
}

describe('Π1: υπηρεσίες στρατιωτών και στελεχών, τυχαίες ρυθμίσεις × 60 μέρες', () => {
  for (let seed = 1; seed <= 16; seed++) it('σπόρος ' + seed, () => {
    const { s, errs, cmds } = simulate(seed, true);
    expect(cmds).toBeGreaterThan(DAYS);
    expect(errs.slice(0, 15)).toEqual([]);
    // οθόνη/Excel του προγράμματος: το σύνολο κάθε γραμμής = το μέτρημα του μήνα· ΦΡΟΥΡΑ: το όνομα του στελέχους στη θέση του
    for (const ym of ['2026-12', '2027-01']) for (const row of dutySheet(s, ym).byPerson) {
      const c = s.cadreList.find(x => row.name.startsWith(x.last.toUpperCase()))!; expect(row.sum).toBe(monthCount(s, c.id, ym).done);
    }
    for (let i = 0; i < DAYS; i += 7) {
      const d = addDays(D0, i); const lay = frouraLayout(s, d); const g = s.guards[d] || {};
      for (const k of cadreOnlyOf(s.settings).keys()) if (g[k] != null) { const c = cadreOf(s, g[k])!; expect(lay.extra.find(x => x.k === k)?.name || [...lay.cells.values()].flat().join('|')).toContain(c.last); }
    }
  });
});

describe('Π1: η αναίρεση γυρίζει πίσω και τις δύο καρτέλες', () => {
  const norm = (s: AppState) => JSON.stringify({ g: s.guards, d: [...(s.cadreDuties || [])].sort((a, b) => a.id.localeCompare(b.id)), c: s.cadreList, b: blocksOf(s.settings) });
  for (const seed of [3, 8]) it('σπόρος ' + seed + ': κάθε εντολή, μετά αναίρεση, μετά ξανά', async () => {
    const { s: s0, cfg, r } = setup(seed);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-')); const st = new Store(dir, WASM); await st.open(); st.commit(s0);
    let undos = 0; const bad: string[] = [];
    const run = (cur: AppState, c: Command, d: ISODate): AppState | null => {
      let res; try { res = apply(cur, c, ctx(d)); } catch { return null; }
      const before = norm(st.state); const p = st.commit(res.state);
      if (r() < 0.35) { st.revert(p); undos++; if (norm(st.state) !== before) bad.push(d + ' ' + c.t); st.commit(res.state); }
      return st.state;
    };
    let s = st.state;
    for (let i = 0; i < 30; i++) s = day(s, addDays(D0, i), r, cfg, run);
    st.close(); fs.rmSync(dir, { recursive: true, force: true });
    expect(undos).toBeGreaterThan(10); expect(bad).toEqual([]);
  });
});

// Michael 25/11: «με ελάχιστα άτομα και υπηρεσίες περισσότερες από άτομα»: κανένας ή ελάχιστοι στρατιώτες, κανένα ή ένα στέλεχος, όλοι σε άδεια.
// Η αυτόματη δεν σκάει, δεν βάζει κανέναν δύο φορές (εκτός από 2 υπηρεσίες/μέρα της μονάδας), αφήνει κενές θέσεις και το λέει
describe('Π1: ακραίες περιπτώσεις (λίγα άτομα, περισσότερες θέσεις από άτομα)', () => {
  const cases: [string, Ext][] = [['0 στρατιώτες, 0 στελέχη', { n: 0, nc: 0 }], ['1 στρατιώτης, 1 στέλεχος', { n: 1, nc: 1 }], ['2 στρατιώτες, 2 στελέχη', { n: 2, nc: 2 }],
    ['3 στρατιώτες', { n: 3 }], ['5 στρατιώτες', { n: 5 }], ['8 στρατιώτες, 1 στέλεχος', { n: 8, nc: 1 }], ['12 στρατιώτες (λίγο κάτω από τις θέσεις)', { n: 12 }],
    ['όλοι σε άδεια κάποια στιγμή, 3 στελέχη', { n: 10, nc: 3, leaveAll: true }]];
  for (const [name, x] of cases) for (const seed of [2, 7, 11]) it(name + ', σπόρος ' + seed, () => {
    const { s, errs, empty, text } = simulate(seed, true, x);
    expect(errs.slice(0, 15)).toEqual([]);
    const seats = postsOf(s.settings).length;
    if ((x.n || 0) < seats) expect(empty).toBeGreaterThan(0);                       // δεν φτάνουν: μένουν κενές και το λέει
    expect(text.every(t => !/undefined|NaN|\?\?/.test(t))).toBe(true);
  });
});

// ίδιος σπόρος, ίδιο αποτέλεσμα (για να ξανατρέχει ένα σφάλμα)
it('Π1: επαναλήψιμο από τον σπόρο', () => { expect(norm2(simulate(5, false).s)).toBe(norm2(simulate(5, false).s)); });
const norm2 = (s: AppState) => JSON.stringify([s.guards, (s.cadreDuties || []).map(x => [x.date, x.svc, x.cid, x.via])]);
void runsOn;
