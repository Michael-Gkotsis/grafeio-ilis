// Προσομοίωση υπηρεσιών για τα τεστ δικαιοσύνης (duty-fuzz): Ν στρατιώτες (20 ως 160), μήνες με αυτόματη συμπλήρωση μέρα
// με τη μέρα, όπως ο λοχίας: άδειες, ιατρικά, νοσοκομείο, ΣΤΕΠ, κωλυόμενοι, νέοι στρατιώτες, όσοι φεύγουν, Σ.Ι., πόστα,
// μέρες χωρίς υπηρεσία, εξαιρέσεις, μόνιμοι Λ/Υ-Δ/Υ, θέσεις με το χέρι. Επαναλήψιμο από τον σπόρο. Μόνο φανταστικά ονόματα.
import { emptyState, TYPES, type AppState, type Person, type Status, type TypeKey, type Rules } from '../src/shared/domain';
import { addDays, dm, isWeekend, type ISODate } from '../src/shared/dates';
import { apply } from '../src/shared/commands';
import { everyBlock } from '../src/shared/domain';
const CTX = { today: '2026-10-01', newId: (() => { let i = 0; return () => 'c' + ++i; })() };
const allBlocksOf = (s: AppState) => everyBlock(s.settings);
import { fillDay, postsOf, isHol, dutyBlock, capBlock, guardUnavailable, isUnarmed, dutyPool, dutyIndexOf, statusesOn, postBy, fixedIds } from '../src/shared/rules';

export const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const SUR = ['ΔΟΚΙΜΙΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΦΑΝΤΑΣΙΟΣ', 'ΠΛΑΣΜΑΤΙΚΟΣ', 'ΤΥΧΑΙΟΣ', 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 'ΔΕΙΓΜΑΤΑΣ', 'ΕΙΚΟΝΙΚΟΣ', 'ΠΡΟΣΩΡΙΝΟΣ'];

export interface SimOpts {
  seed: number; n: number; days: number; start?: ISODate; phase?: 'sven' | 'spen';
  rules?: Partial<Rules>;
  custom?: boolean;        // και δικές σου υπηρεσίες (Πύλη ένοπλη, Περίπολος άοπλη), με δικές τους στήλες «Ποιος κάνει τι»
  switchAt?: number;       // αλλαγή εντύπου (ΣΒΕΝ ↔ ΣΠΕΝ) αυτή τη μέρα
  hols?: ISODate[];        // και άλλες αργίες (π.χ. Παρασκευή)
  // τι «θόρυβο» βάζει (0 = τίποτα): πιθανότητες ανά άτομο ή ανά μέρα
  noise?: Partial<Noise>;
}
export interface Noise {
  leave: number;     // ανά άτομο ανά μέρα: ξεκινά άδεια 3–10 μέρες
  med: number;       // ανά άτομο ανά μέρα: ΕΥ/ΕΑ/ΕΟ/ΕΑΡΒ 1–5 μέρες
  nos: number;       // νοσοκομείο/ΣΤΕΠ/αναρρωτική
  kol: number;       // κωλυόμενος 1–3 μέρες
  si: number;        // ποσοστό με Ι3 ΧΩΡΙΣ ΟΠΛΟ / Ι4
  post: number;      // ποσοστό με πόστο
  off: number;       // ποσοστό με μέρες χωρίς υπηρεσία
  cap: number;       // ποσοστό με «δεν κάνει» ένα είδος
  skip: number;      // ποσοστό με μία εξαίρεση από–έως
  join: number;      // ποσοστό που έρχεται αργότερα (νέοι στρατιώτες)
  leaveForever: number; // ποσοστό που φεύγει (εκτός δύναμης)
  manual: number;    // ανά μέρα: μία θέση με το χέρι (πριν την αυτόματη)
  ahead: number;     // ανά μέρα: μία θέση με το χέρι για 2–6 μέρες μετά (π.χ. ΣΚ)
  fixed: boolean;    // μόνιμος Λ/Υ και Δ/Υ
}
export const QUIET: Noise = { leave: 0, med: 0, nos: 0, kol: 0, si: 0, post: 0, off: 0, cap: 0, skip: 0, join: 0, leaveForever: 0, manual: 0, ahead: 0, fixed: false };
export const BUSY: Noise = { leave: 0.012, med: 0.02, nos: 0.003, kol: 0.01, si: 0.12, post: 0.04, off: 0.05, cap: 0.06, skip: 0.06, join: 0.12, leaveForever: 0.05, manual: 0.3, ahead: 0.15, fixed: true };

export interface Sim {
  s: AppState; days: ISODate[]; joined: Map<number, ISODate>; left: Map<number, ISODate>;
  manual: Set<string>;   // «μέρα|θέση» που έβαλε ο λοχίας με το χέρι
  log: { d: ISODate; empty: string[]; warn: string[] }[];
  viol: string[];        // παραβάσεις κανόνων της αυτόματης συμπλήρωσης (πρέπει να είναι 0)
  soft: Set<string>;     // «μέρα|θέση» που γέμισαν παρά την αργία μετά από αργία (το μόνο που χαλαρώνει, με ειδοποίηση)
  avail: Map<number, number>;   // πόσες «θέσεις αναλογούν» σε κάθε άτομο (μέρες που μπορούσε, × θέσεις / όσοι μπορούσαν)
  availHol: Map<number, number>;
}

export function simulate(o: SimOpts): Sim {
  const r = rng(o.seed); const N = o.n; const nz: Noise = { ...BUSY, ...(o.noise || {}) };
  const start = o.start || '2026-10-01';
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const all: Person[] = Array.from({ length: N }, (_, i) => ({
    id: i + 1, rank: 'ΣΤΡ', spec: 'ΠΖ', last: SUR[i % SUR.length] + (i >= SUR.length ? ' ' + i : ''), first: 'ΑΛΦΑΣ', father: 'ΠΑΤΕΡΑΣ',
    asm: String(100000 + i), phone: '', room: (i % 8) + 1, si: r() < nz.si ? pick(['Ι3 ΧΩΡΙΣ ΟΠΛΟ', 'Ι4', 'Ι3 ΜΕ ΟΠΛΟ']) : 'Ι1', post: r() < nz.post ? 'ΚΨΜ' : null,
    role: null, essos: '2026 Γ΄', attached: false, active: true, notes: ''
  }));
  const days: ISODate[] = []; for (let i = 0; i < o.days; i++) days.push(addDays(start, i));
  const joined = new Map<number, ISODate>(), left = new Map<number, ISODate>();
  for (const p of all) {
    if (r() < nz.off) p.offDays = [Math.floor(r() * 7)];
    if (r() < nz.skip) { const f = pick(days.slice(0, -5)); p.skips = [{ id: 'k' + p.id, from: f, to: addDays(f, Math.floor(r() * 4)), why: 'ΓΑΜΟΣ' }]; }
    if (p.id > 2 && r() < nz.join) joined.set(p.id, pick(days.slice(7, -14)));
    else if (p.id > 2 && r() < nz.leaveForever) left.set(p.id, pick(days.slice(14)));
  }
  let s = emptyState();
  s.settings = { ...s.settings, phase: o.phase || 'sven' };
  s.rules = { ...s.rules, ...(o.rules || {}) };
  if (o.hols) s.settings = { ...s.settings, holidays: Object.fromEntries(o.hols.map(d => [d, 'ΑΡΓΙΑ'])) };
  if (o.custom) for (const ph of ['sven', 'spen']) {
    s = apply(s, { t: 'addBlock', phase: ph, name: 'ΠΥΛΗ', armed: true, n: 2, hrs: '14:00 → 14:00' }, CTX).state;
    s = apply(s, { t: 'addBlock', phase: ph, name: 'ΠΕΡΙΠΟΛΟΣ', armed: false, n: 1, hrs: '18:00 → 22:00' }, CTX).state;
  }
  s.people = all.filter(p => !joined.has(p.id));
  const ownCols = allBlocksOf(s).filter(b => b.custom).map(b => 'b:' + b.id);
  for (const p of all) if (r() < nz.cap) s.caps[p.id] = { [pick(['mg', 'th', 'sk', 'op', ...ownCols])]: 'ΙΑΤΡΙΚΟ' } as any;
  if (nz.fixed) s.settings = { ...s.settings, fixed: { ly: 1, dy: 2 } };
  // καταστάσεις: δηλώνονται από πριν (ο λοχίας τις ξέρει), όλες στην αρχή
  const ss: Status[] = []; let seq = 0;
  for (const p of all) for (let i = 0; i < days.length; i++) {
    const d = days[i]; const x = r();
    const add = (type: TypeKey, len: number, extra: Partial<Status> = {}) => ss.push({ id: 's' + ++seq, pid: p.id, type, from: d, to: addDays(d, len - 1), ...extra });
    if (x < nz.leave) add('LEAVE', 3 + Math.floor(r() * 8), { kind: 'Κανονική', ...(r() < 0.5 ? { fromTime: pick(['08:00', '14:00']), toTime: pick(['12:00', '20:00']) } : {}) });
    else if (x < nz.leave + nz.med) add(pick<TypeKey>(['EY', 'EA', 'EO', 'EARV']), 1 + Math.floor(r() * 5));
    else if (x < nz.leave + nz.med + nz.nos) add(pick<TypeKey>(['NOS', 'STEP', 'SICK']), 1 + Math.floor(r() * 6));
    else if (x < nz.leave + nz.med + nz.nos + nz.kol) add('KOL', 1 + Math.floor(r() * 3), { kind: 'ΣΤΕΠ', minus: true });
  }
  s.statuses = ss;
  const sim: Sim = { s, days, joined, left, manual: new Set(), log: [], viol: [], soft: new Set(), avail: new Map(), availHol: new Map() };
  for (const d of days) {
    if (o.switchAt != null && d === days[o.switchAt]) s = { ...s, settings: { ...s.settings, phase: s.settings.phase === 'spen' ? 'sven' : 'spen' } };
    // νέοι και όσοι φεύγουν
    for (const [pid, jd] of joined) if (jd === d) s = { ...s, people: [...s.people, { ...all[pid - 1], inOn: d }] };
    for (const [pid, ld] of left) if (ld === d) s = { ...s, people: s.people.map(p => (p.id === pid ? { ...p, active: false, outOn: d } : p)) };
    const posts = postsOf(s.settings).filter(x => x.kind !== 'ly');
    const pool = dutyPool(s);
    // θέση με το χέρι για σήμερα (πριν την αυτόματη) ή για αργότερα
    const hand = (day: ISODate) => {
      const x = pick(posts); const g = s.guards[day] || {}; if (g[x.k]) return;
      const busy = new Set(Object.values(g)); const free = pool.filter(p => !busy.has(p.id));
      const p = pick(free); if (!p) return;
      s = { ...s, guards: { ...s.guards, [day]: { ...g, [x.k]: p.id } } }; sim.manual.add(day + '|' + x.k);
    };
    if (r() < nz.manual) hand(d);
    if (r() < nz.ahead) hand(addDays(d, 2 + Math.floor(r() * 5)));
    // πόσοι μπορούσαν σήμερα (πριν την αυτόματη): για τις «θέσεις που αναλογούν»
    const before = s;
    const res = fillDay(s, d);
    s = { ...s, guards: res.guards };
    sim.log.push({ d, empty: res.empty, warn: res.warn });
    check(sim, before, s, d, res.empty, res.warn);
    share(sim, before, s, d);
  }
  sim.s = s;
  return sim;
}

// Κανόνες που η αυτόματη συμπλήρωση δεν παραβαίνει ποτέ, για τις θέσεις που γέμισε η ίδια
function check(sim: Sim, before: AppState, after: AppState, d: ISODate, empty: string[], warn: string[]) {
  const g0 = before.guards[d] || {}, g = after.guards[d] || {};
  const seen = new Map<number, string>(); const fixed = fixedIds(after);
  for (const k in g) { const pid = g[k]; if (seen.has(pid)) sim.viol.push(d + ' διπλή θέση ' + pid + ' ' + seen.get(pid) + '/' + k); seen.set(pid, k); }
  for (const k in g) {
    if (g0[k]) continue; const pid = g[k]; const x = postBy(after, k)!;
    if (fixed.has(pid) && (k === 'ly' || k === 'dy')) continue;
    // ο κανόνας με τις υπόλοιπες θέσεις της μέρας (χωρίς την ίδια)
    const gg = { ...g }; delete gg[k]; const w: AppState = { ...after, guards: { ...after.guards, [d]: gg } };
    const why = guardUnavailable(w, d, pid, k);
    if (why) {
      // η μόνη επιτρεπτή εξαίρεση: αργία μετά από αργία όταν δεν έφταναν οι υπόλοιποι, και μόνο με ειδοποίηση (όλοι οι άλλοι κανόνες ισχύουν)
      const onlyHol = why.startsWith('Έκανε αργία') && !guardUnavailable({ ...w, rules: { ...w.rules, noConsecHol: false } }, d, pid, k) && warn.some(t => t.startsWith(dm(d) + ': ') && t.includes('κάνει αργία πρόσφατα'));
      if (onlyHol) sim.soft.add(d + '|' + k); else sim.viol.push(d + ' ' + k + ' ' + pid + ': ' + why);
    }
    if (post_ly(x) && personOf(after, pid)?.post) sim.viol.push(d + ' ' + k + ' πόστο σε Λ/Υ-Δ/Υ ' + pid);
    if (after.rules.strictUnarmed && x.kind === 'sk' && isUnarmed(after, d, pid)) sim.viol.push(d + ' ' + k + ' άοπλος σε σκοπιά ' + pid);
  }
  // κενή θέση ενώ κάποιος χωρίς θέση σήμερα μπορούσε (μία απλή ματιά, χωρίς αλυσίδες)
  const busy = new Set(Object.values(g)); const fixedIds0 = fixed;
  for (const k of empty) {
    const x = postBy(after, k)!;
    const can = dutyPool(after).filter(p => !busy.has(p.id) && !fixedIds0.has(p.id) && !(x.kind === 'ly' && p.post) && !guardUnavailable(after, d, p.id, k) && !(after.rules.strictUnarmed && x.kind === 'sk' && isUnarmed(after, d, p.id)));
    if (can.length) sim.viol.push(d + ' κενή ' + k + ' ενώ μπορούσαν ' + can.map(p => p.id).join(','));
  }
}

// «Θέσεις που αναλογούν»: κάθε μέρα, οι θέσεις που γέμισαν (εκτός Λ/Υ-Δ/Υ των μονίμων) μοιράζονται σε όσους μπορούσαν να μπουν κάπου
// εκείνη τη μέρα χωρίς κατάσταση/δυνατότητα που τους κρατά (όχι η ανάπαυση: αυτή είναι συνέπεια της σειράς)
function share(sim: Sim, before: AppState, after: AppState, d: ISODate) {
  const g = after.guards[d] || {}; const fixed = fixedIds(after);
  const posts = postsOf(after.settings).filter(x => g[x.k] && !(fixed.has(g[x.k]) && (x.k === 'ly' || x.k === 'dy')));
  const can = dutyPool(after).filter(p => !fixed.has(p.id) && posts.some(x => !dutyBlock(after.statuses, d, p.id, x, after.settings.lists) && !capBlock(after, d, p.id, x)));
  if (!can.length) return;
  const per = posts.length / can.length; const h = isHol(after.settings, d);
  for (const p of can) { sim.avail.set(p.id, (sim.avail.get(p.id) || 0) + per); if (h) sim.availHol.set(p.id, (sim.availHol.get(p.id) || 0) + per); }
}

// --------------------------- μετρήσεις ---------------------------
export interface PStat { pid: number; total: number; hol: number; we: number; byType: Record<string, number>; days: ISODate[]; exp: number; expHol: number }
export function stats(sim: Sim): Map<number, PStat> {
  const out = new Map<number, PStat>(); const s = sim.s; const fixed = fixedIds(s);
  for (const d of sim.days) {
    const g = s.guards[d] || {}; const h = isHol(s.settings, d);
    for (const k in g) {
      const pid = g[k]; if (fixed.has(pid) && (k === 'ly' || k === 'dy')) continue;
      let x = out.get(pid); if (!x) { x = { pid, total: 0, hol: 0, we: 0, byType: {}, days: [], exp: sim.avail.get(pid) || 0, expHol: sim.availHol.get(pid) || 0 }; out.set(pid, x); }
      x.total++; if (h) x.hol++; if (isWeekend(d)) x.we++;
      const kind = postBy(s, k)!.kind; x.byType[kind] = (x.byType[kind] || 0) + 1;
      if (!x.days.includes(d)) x.days.push(d);
    }
  }
  for (const [pid, v] of sim.avail) if (!out.has(pid)) out.set(pid, { pid, total: 0, hol: 0, we: 0, byType: {}, days: [], exp: v, expHol: sim.availHol.get(pid) || 0 });
  return out;
}
// «Καθαροί»: όλη την περίοδο σε δύναμη, χωρίς καμία κατάσταση, δυνατότητα, πόστο, Σ.Ι., μέρες χωρίς υπηρεσία, εξαίρεση, όχι μόνιμοι
export function cleanIds(sim: Sim): number[] {
  const s = sim.s; const fixed = fixedIds(s);
  return s.people.filter(p => p.active && !sim.joined.has(p.id) && !sim.left.has(p.id) && !fixed.has(p.id) && !p.post && p.si === 'Ι1' && !p.offDays && !p.skips && !s.caps[p.id]
    && !s.statuses.some(x => x.pid === p.id)).map(p => p.id);
}
const post_ly = (x: { kind: string }) => x.kind === 'ly';
const personOf = (s: AppState, pid: number) => s.people.find(p => p.id === pid);
// Λόγος υπηρεσιών προς όσες αναλογούσαν, για μια ομάδα ατόμων (όχι μόνιμοι Λ/Υ-Δ/Υ, μόνο όσοι είχαν αρκετές θέσεις να τους αναλογούν)
export function shareRatio(sim: Sim, pick: (p: Person) => boolean): { ratio: number; n: number } {
  const fixed = fixedIds(sim.s); let T = 0, E = 0, n = 0;
  for (const x of stats(sim).values()) {
    const p = sim.s.people.find(q => q.id === x.pid);
    if (!p || fixed.has(p.id) || x.exp < 2 || !pick(p)) continue;
    T += x.total; E += x.exp; n++;
  }
  return { ratio: E ? T / E : NaN, n };
}
export const range = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const softOn = (sim: Sim, d: ISODate, pid: number) => [...sim.soft].some(m => m.startsWith(d + '|') && (sim.s.guards[d] || {})[m.slice(11)] === pid);
// συνεχόμενα ΣΚ/αργίες (ανάμεσα 2 ως 9 μέρες, όπως ο κανόνας) και ανάπαυση
export function restViol(sim: Sim): string[] {
  const s = sim.s; const out: string[] = []; const idx = dutyIndexOf(s); const fixed = fixedIds(s);
  for (const [pid, ds] of idx) {
    if (fixed.has(pid)) continue;
    const l = [...ds].sort();
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i]; const man = (d: ISODate) => [...sim.manual].some(m => m.startsWith(d + '|') && (s.guards[d] || {})[m.slice(11)] === pid);
      if (man(a) || man(b)) continue;
      const gap = (Date.parse(b) - Date.parse(a)) / 864e5;
      // όπως το ruleBlock: η ανάπαυση ως restDays μέρες, η αργία μετά από αργία από 2 ως 9 μέρες (1 μέρα είναι ήδη ανάπαυση ή, με restDays 0, επιτρέπεται)
      if (gap <= s.rules.restDays) out.push(pid + ' ανάπαυση ' + a + '→' + b);
      else if (s.rules.noConsecHol && gap >= 2 && gap <= 9 && isHol(s.settings, a) && isHol(s.settings, b) && !softOn(sim, a, pid) && !softOn(sim, b, pid)) out.push(pid + ' αργία μετά από αργία ' + a + '→' + b);
    }
  }
  return out;
}
export { statusesOn, TYPES };
