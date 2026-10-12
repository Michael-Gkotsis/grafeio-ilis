// Καθαρές συναρτήσεις κανόνων: ίδιες στο main process και στο UI (09 §2, shared/rules)
import { addDays, daysBetween, dm, isWeekend, parseD, type ISODate } from './dates';
import {
  TYPES, TYPE_KEYS, RECORD_CATS, CADRE_ABS, CAP_KINDS, CAP_ACC, buildPosts, blocksOf, postTxt, shortName,
  type AppState, type Baseline, type Person, type Post, type Status, type TypeKey, type DutyKind, type Guards, type Settings, type Rules
} from './domain';

// --------------------------- ευρετήρια (cache ανά αντικείμενο) ---------------------------
const peopleIdx = new WeakMap<Person[], Map<number, Person>>();
export function personMap(people: Person[]): Map<number, Person> {
  let m = peopleIdx.get(people);
  if (!m) { m = new Map(people.map(p => [p.id, p])); peopleIdx.set(people, m); }
  return m;
}
export const activePeople = (s: AppState) => s.people.filter(p => p.active);

// Θέσεις του εντύπου που ισχύει τώρα (ΣΒΕΝ ή ΣΠΕΝ), χωρίς όσες έχουν αφαιρεθεί
const postsIdx = new WeakMap<Settings['blocks'], Post[]>();
export function postsOf(settings: Settings): Post[] {
  const blocks = blocksOf(settings) || settings.blocks;
  let p = postsIdx.get(blocks);
  if (!p) { p = buildPosts(blocks.filter(b => !b.hidden)).filter(x => !x.hidden); postsIdx.set(blocks, p); }
  return p;
}
// Όλες οι θέσεις που έχουν υπάρξει (και των δύο εντύπων, και όσες αφαιρέθηκαν): για το ιστορικό και τον έλεγχο υπηρεσιών
const allIdx = new WeakMap<Settings, Post[]>();
export function allPosts(settings: Settings): Post[] {
  let p = allIdx.get(settings);
  if (!p) {
    const seen = new Set<string>(); p = [];
    for (const x of [...postsOf(settings), ...buildPosts([...(settings.blocks || []), ...(settings.blocksSpen || [])])]) if (!seen.has(x.k)) { seen.add(x.k); p.push(x); }
    allIdx.set(settings, p);
  }
  return p;
}
// θέση από το κλειδί της: με ευρετήριο, γιατί καλείται για κάθε υπηρεσία του ημερολογίου (σύνολα, «Γιατί αυτός;»)
const postKeyIdx = new WeakMap<Settings, Map<string, Post>>();
export const postBy = (s: AppState, k: string): Post | undefined => {
  let m = postKeyIdx.get(s.settings);
  if (!m) { m = new Map(allPosts(s.settings).map(p => [p.k, p])); postKeyIdx.set(s.settings, m); }
  return m.get(k);
};

// --------------------------- αργίες ---------------------------
export const isHol = (settings: Settings, d: ISODate) => isWeekend(d) || !!settings.holidays[d];
export const holName = (settings: Settings, d: ISODate) => settings.holidays[d] || (isWeekend(d) ? 'ΣΚ' : '');

// --------------------------- καταστάσεις ---------------------------
const ORDER = (k: TypeKey) => TYPE_KEYS.indexOf(k);
// Όλες οι ενεργές καταστάσεις ενός ατόμου μια μέρα. Πρώτα οι απουσίες. Οι ποινές που αιτούνται δεν μετράνε (Κ-19).
// Ευρετήριο καταστάσεων ανά άτομο: κάθε έξοδος/ΔΝ είναι κατάσταση, οπότε σε έναν χρόνο είναι δεκάδες χιλιάδες.
// Φτιάχνεται μία φορά για κάθε πίνακα καταστάσεων (οι εντολές φτιάχνουν πάντα νέο πίνακα, δεν τον αλλάζουν).
const byPidIdx = new WeakMap<Status[], Map<number, Status[]>>();
const NONE: Status[] = [];
export function statusesOf(statuses: Status[], pid: number): Status[] {
  let m = byPidIdx.get(statuses);
  if (!m) {
    m = new Map();
    for (const x of statuses) { const l = m.get(x.pid); if (l) l.push(x); else m.set(x.pid, [x]); }
    byPidIdx.set(statuses, m);
  }
  return m.get(pid) || NONE;
}
// Ίδια ερώτηση ξανά και ξανά (κάθε υποψήφιος σε κάθε θέση της αυτόματης συμπλήρωσης): κρατιέται ανά πίνακα, μέρα και άτομο.
// Το αποτέλεσμα είναι μόνο για ανάγνωση.
const onIdx = new WeakMap<Status[], Map<ISODate, Map<number, Status[]>>>();
export function statusesOn(statuses: Status[], pid: number, date: ISODate): Status[] {
  let byDay = onIdx.get(statuses); if (!byDay) { byDay = new Map(); onIdx.set(statuses, byDay); }
  let byPid = byDay.get(date); if (!byPid) { byPid = new Map(); byDay.set(date, byPid); }
  let r = byPid.get(pid);
  if (!r) {
    r = statusesOf(statuses, pid).filter(s => !s.pending && s.from <= date && date <= s.to);
    r = r.length ? r.sort((a, b) => (Number(!!TYPES[b.type].away) - Number(!!TYPES[a.type].away)) || ORDER(a.type) - ORDER(b.type)) : NONE;
    byPid.set(pid, r);
  }
  return r;
}
const untilTxt = (s: Status, date: ISODate) => (s.to === date ? '' : ' έως ' + dm(s.to));
export const isRecordExpiredOn = (s: Status, date: ISODate) => RECORD_CATS.includes(TYPES[s.type].cat) && s.to === addDays(date, -1);

export interface Strength { total: number; present: number; absent: number; counts: Record<TypeKey, number>; lists: Record<TypeKey | 'present', Person[]> }
export function strengthOf(s: AppState, date: ISODate): Strength {
  const people = activePeople(s);
  const counts = {} as Record<TypeKey, number>;
  const lists = { present: [] } as unknown as Strength['lists'];
  TYPE_KEYS.forEach(k => { counts[k] = 0; lists[k] = []; });
  let present = 0;
  for (const p of people) {
    const ss = statusesOn(s.statuses, p.id, date);
    ss.forEach(x => { counts[x.type]++; lists[x.type].push(p); });
    if (!ss.some(x => TYPES[x.type].away)) { present++; lists.present.push(p); }
  }
  return { total: people.length, present, absent: people.length - present, counts, lists };
}

// --------------------------- Δυνατότητα υπηρεσιών (Κ-15) ---------------------------
export function defaultCaps(p: Person): Partial<Record<DutyKind, string>> {
  // όποιος έχει πόστο εξαιρείται από όλες τις υπηρεσίες εκτός από Λ/Υ και Δ/Υ
  if (p.post) return Object.fromEntries(CAP_KINDS.map(([k]) => [k, 'Πόστο: ' + p.post]));
  const si = (p.si || '').toUpperCase();
  if (si.includes('ΑΟΠΛ') || si.startsWith('Ι4')) return { op: 'Σ.Ι. ' + p.si, sk: 'Σ.Ι. ' + p.si };
  return {};
}
export function capsOf(s: AppState, pid: number): Partial<Record<DutyKind, string>> {
  const p = personMap(s.people).get(pid);
  const c: Partial<Record<DutyKind, string | null>> = { ...(p ? defaultCaps(p) : {}), ...(s.caps[pid] || {}) };
  const out: Partial<Record<DutyKind, string>> = {};
  (Object.keys(c) as DutyKind[]).forEach(k => { if (c[k]) out[k] = c[k] as string; });
  return out;
}
export function capBlock(s: AppState, pid: number, post?: Post | null): string | null {
  if (!post) return null;
  const c = capsOf(s, pid)[post.kind];
  return c ? 'Δεν κάνει ' + (CAP_ACC[post.kind] || post.kind) + ' (' + c + ')' : null;
}
export const capLabel = (k: DutyKind) => CAP_KINDS.find(x => x[0] === k)?.[1] || k;

// Κ-01, Κ-02, Κ-05: γιατί κάποιος ΔΕΝ μπαίνει σε μια θέση (null = μπαίνει). Χωρίς θέση: ελέγχει σαν ένοπλη.
export function dutyBlock(statuses: Status[], date: ISODate, pid: number, post?: { armed: boolean; kind?: DutyKind } | null): string | null {
  for (const s of statusesOn(statuses, pid, date)) {
    const t = TYPES[s.type];
    if (t.noDuty) return t.label + untilTxt(s, date);
    if (t.noArmed && (!post || post.armed)) return 'Άοπλος: ' + t.label + untilTxt(s, date);
    if (t.light && post?.kind === 'mg') return 'Όχι μαγειρεία: ' + t.label + untilTxt(s, date);
  }
  return null;
}
// ΕΟ/ΕΑ σε (άοπλη) σκοπιά: επιτρέπεται, αλλά μόνο αν δεν υπάρχει άλλος (λοχίας, 10/10)
export function lastResort(statuses: Status[], date: ISODate, pid: number, post?: { kind?: DutyKind } | null): string | null {
  if (post?.kind !== 'sk') return null;
  const st = statusesOn(statuses, pid, date).find(x => TYPES[x.type].light);
  return st ? TYPES[st.type].label + ': σκοπιά μόνο αν δεν υπάρχει άλλος' : null;
}
// Μόνιμος Λ/Υ ή Δ/Υ: μπαίνει μόνος του κάθε μέρα, χωρίς κανόνες ανάπαυσης και σειρά δικαιοσύνης
export const isFixed = (s: AppState, pid: number, k?: string | null) => !!k && (k === 'ly' || k === 'dy') && s.settings.fixed?.[k] === pid;
export const fixedIds = (s: AppState) => new Set(Object.values(s.settings.fixed || {}).filter((x): x is number => !!x));
export const postOf = (s: AppState, date: ISODate, pid: number, exceptKey?: string): Post | undefined =>
  allPosts(s.settings).find(x => x.k !== exceptKey && (s.guards[date] || {})[x.k] === pid);

// Ημερομηνίες υπηρεσίας ανά άτομο, ώστε οι κανόνες να μη σαρώνουν όλο το ιστορικό
const idxCache = new WeakMap<Guards, Map<number, Set<ISODate>>>();
export function dutyIndex(guards: Guards): Map<number, Set<ISODate>> {
  let m = idxCache.get(guards);
  if (m) return m;
  m = new Map();
  for (const d in guards) for (const k in guards[d]) { const id = guards[d][k]; if (!m.has(id)) m.set(id, new Set()); m.get(id)!.add(d); }
  idxCache.set(guards, m);
  return m;
}
// Κ-13, Κ-14: ανάπαυση μετά από υπηρεσία, όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες
export function ruleBlock(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>, k?: string | null): string | null {
  const r = s.rules;
  if (isFixed(s, pid, k)) return null;
  const ds = (idx || dutyIndex(s.guards)).get(pid);
  if (!ds) return null;
  for (let i = 1; i <= r.restDays; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d)) return 'Υπηρεσία ' + dm(d) + ' (ανάπαυση)';
  // από 2 μέρες: Παρασκευή αργία και Κυριακή είναι δύο αργίες στη σειρά (η 1 μέρα είναι ήδη ανάπαυση)
  if (r.noConsecHol && isHol(s.settings, date))
    for (let i = 2; i <= 9; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d) && isHol(s.settings, d)) return 'Έκανε αργία ' + holName(s.settings, d) + ' ' + dm(d);
  return k ? numBlock(s, date, pid, k, ds) : null;
}
// 3ο και 4ο νούμερο (οι βάρδιες 18:00/20:00): ξανά στο ίδιο νούμερο μόνο μετά από rules.numRest μέρες (λοχίας, 10/10)
function numBlock(s: AppState, date: ISODate, pid: number, k: string, ds: Set<ISODate>): string | null {
  const n = s.rules.numRest || 0; const post = postBy(s, k);
  if (n < 2 || !post || post.rot == null || post.rot < 2) return null;
  for (let i = 1; i < n; i++) for (const d of [addDays(date, -i), addDays(date, i)]) {
    if (!ds.has(d)) continue;
    const g = s.guards[d] || {};
    for (const kk in g) if (g[kk] === pid && postBy(s, kk)?.rot === post.rot) return (post.rot + 1) + 'ο νούμερο στις ' + dm(d) + ' (ξανά μετά από ' + n + ' μέρες)';
  }
  return null;
}
export function guardUnavailable(s: AppState, date: ISODate, pid: number, k: string | null, idx?: Map<number, Set<ISODate>>): string | null {
  const post = k ? postBy(s, k) : null;
  const r = dutyBlock(s.statuses, date, pid, post) || capBlock(s, pid, post);
  if (r) return r;
  const o = postOf(s, date, pid, k || undefined);
  if (o) return 'Ήδη ' + postTxt(o);
  return ruleBlock(s, date, pid, idx, k);
}
// Κ-06, Κ-07, Κ-08: γιατί κάποιος ΔΕΝ βγαίνει έξοδο (null = βγαίνει)
export function outBlock(s: AppState, date: ISODate, pid: number): string | null {
  const o = postOf(s, date, pid);
  if (o) return 'Έχει υπηρεσία: ' + o.label;
  const st = statusesOn(s.statuses, pid, date).find(x => TYPES[x.type].noOut);
  if (st) return (st.type === 'PUN' && st.kind ? st.kind : TYPES[st.type].label) + untilTxt(st, date);
  // ποινή που ακόμα αιτείται: δεν μετρά στην ΗΚΑΙ (Κ-19), αλλά ο τιμωρημένος μένει μέσα
  const pend = statusesOf(s.statuses, pid).find(x => x.type === 'PUN' && x.pending && x.from <= date && date <= x.to);
  return pend ? (pend.kind || 'Ποινή') + ' (αιτείται)' + untilTxt(pend, date) : null;
}
export const outRoomsOn = (rules: Rules, d: ISODate): number[] | null => rules.outRooms[parseD(d).getDay()] || null;

// --------------------------- Έλεγχος υπηρεσιών (από το ημερολόγιο υπηρεσιών) ---------------------------
export interface DutyStat { byKind: Record<string, number>; total: number; hol: number; last: ISODate | null; lastHol: ISODate | null; log: { d: ISODate; k: string; h: boolean }[] }
// ανά ημερολόγιο υπηρεσιών και ανά λίστα αργιών: αν αλλάξουν οι αργίες, ξαναμετριούνται οι αργίες του καθενός
const statsCache = new WeakMap<Guards, { hol: Settings['holidays']; st: Map<number, DutyStat> }>();
export const emptyStat = (): DutyStat => ({ byKind: {}, total: 0, hol: 0, last: null, lastHol: null, log: [] });
export function dutyStats(s: AppState): Map<number, DutyStat> {
  const c = statsCache.get(s.guards);
  if (c && c.hol === s.settings.holidays) return withBaseline(s, c.st);
  const st = new Map<number, DutyStat>();
  for (const d of Object.keys(s.guards).sort()) {
    const g = s.guards[d]; const h = isHol(s.settings, d);
    for (const k in g) {
      const post = postBy(s, k); if (!post) continue;
      let x = st.get(g[k]); if (!x) { x = emptyStat(); st.set(g[k], x); }
      x.byKind[post.kind] = (x.byKind[post.kind] || 0) + 1; x.total++;
      if (h) { x.hol++; x.lastHol = d; }
      x.last = d; x.log.push({ d, k, h });
    }
  }
  statsCache.set(s.guards, { hol: s.settings.holidays, st });
  return withBaseline(s, st);
}
// Προηγούμενες υπηρεσίες (χωρίς ημερομηνία) προστίθενται στα σύνολα, όχι στο ημερολόγιο
const baseCache = new WeakMap<object, { from: Map<number, DutyStat>; out: Map<number, DutyStat> }>();
export const baseTotal = (b: Baseline | undefined) => (b ? Object.entries(b).reduce((a, [k, n]) => a + (k === 'hol' ? 0 : n || 0), 0) : 0);
function withBaseline(s: AppState, st: Map<number, DutyStat>): Map<number, DutyStat> {
  const base = s.baseline; if (!base || !Object.keys(base).length) return st;
  const c = baseCache.get(base); if (c && c.from === st) return c.out;
  const out = new Map(st);
  for (const [id, b] of Object.entries(base)) {
    const pid = Number(id); const x0 = st.get(pid) || emptyStat();
    const x: DutyStat = { ...x0, byKind: { ...x0.byKind } };
    for (const [k, n] of Object.entries(b)) if (k !== 'hol' && n) x.byKind[k] = (x.byKind[k] || 0) + n;
    x.total += baseTotal(b); x.hol += b.hol || 0;
    out.set(pid, x);
  }
  baseCache.set(base, { from: st, out });
  return out;
}
export const statOf = (s: AppState, pid: number) => dutyStats(s).get(pid) || emptyStat();

// --------------------------- Αυτόματη συμπλήρωση (σειρά δικαιοσύνης, έρευνα §3.2) ---------------------------
// 1. Φίλτρο: όλοι οι κανόνες (καταστάσεις, δυνατότητα, ανάπαυση, ΣΚ μετά από ΣΚ).
// 2. Στις άοπλες θέσεις πηγαίνουν τελευταίοι όσοι χρειάζονται για να γεμίσουν οι κενές ένοπλες θέσεις της μέρας
//    (χωρίς αυτούς κάποια ένοπλη θα έμενε κενή). Όταν οι ένοπλοι περισσεύουν, ισχύει για όλους η σειρά δικαιοσύνης,
//    και ο ΕΑ/ΕΟ δεν μπαίνει πρώτος σε κάθε άοπλη θέση (ΣΒΕΝ, σχέδιο 11/10).
// 3. Αργία/ΣΚ: λιγότερες αργίες → παλιότερη τελευταία αργία. Καθημερινή: παλιότερη τελευταία υπηρεσία → λιγότερες υπηρεσίες.
// 4. Λιγότερες φορές στο ίδιο είδος θέσης.
// 5. Ισοπαλία: κλήρωση με σταθερό σπόρο την ημερομηνία (ίδια μέρα → ίδια πρόταση, όχι αλφαβητικά).
export function seedRank(date: ISODate, pid: number): number {
  let h = 2166136261;
  const str = date + ':' + pid;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export interface Fair { total: number; hol: number; byKind: Record<string, number>; lastBefore: ISODate; lastHolBefore: ISODate }
// Στοιχεία δικαιοσύνης ενός ατόμου για μια ημέρα: μετρά όλες τις υπηρεσίες εκτός από την ίδια την ημέρα
export function fairOf(s: AppState, pid: number, date: ISODate): Fair {
  const st = statOf(s, pid);
  const f: Fair = { total: 0, hol: 0, byKind: {}, lastBefore: '', lastHolBefore: '' };
  for (const e of st.log) {
    if (e.d === date) continue;
    const kind = postBy(s, e.k)?.kind || '';
    f.total++; f.byKind[kind] = (f.byKind[kind] || 0) + 1;
    if (e.h) { f.hol++; if (e.d < date && e.d > f.lastHolBefore) f.lastHolBefore = e.d; }
    if (e.d < date && e.d > f.lastBefore) f.lastBefore = e.d;
  }
  const b = s.baseline?.[pid];
  if (b) { for (const [k, n] of Object.entries(b)) if (k !== 'hol' && n) f.byKind[k] = (f.byKind[k] || 0) + n; f.total += baseTotal(b); f.hol += b.hol || 0; }
  return f;
}
export function fairCompare(h: boolean, kind: string, date: ISODate) {
  return (a: Fair & { pid: number }, b: Fair & { pid: number }) =>
    (h ? a.hol - b.hol || a.lastHolBefore.localeCompare(b.lastHolBefore) : a.lastBefore.localeCompare(b.lastBefore) || a.total - b.total) ||
    (a.byKind[kind] || 0) - (b.byKind[kind] || 0) || seedRank(date, a.pid) - seedRank(date, b.pid);
}
export function fillDay(s: AppState, date: ISODate): { guards: Guards; n: number; empty: string[]; warn: string[] } {
  const g: Record<string, number> = { ...(s.guards[date] || {}) };
  let work: AppState = { ...s, guards: { ...s.guards, [date]: g } };
  const people = activePeople(s);
  const fair = new Map(people.map(p => [p.id, { ...fairOf(s, p.id, date), pid: p.id }]));
  const idx = new Map<number, Set<ISODate>>();
  dutyIndex(s.guards).forEach((v, id) => idx.set(id, new Set(v)));
  let n = 0; const empty: string[] = []; const warn: string[] = [];
  const posts = postsOf(s.settings);
  // 1. οι μόνιμοι Λ/Υ και Δ/Υ, αν είναι διαθέσιμοι· αλλιώς η θέση γεμίζει με τη σειρά, όπως όλες
  for (const x of posts) {
    const f = (x.k === 'ly' || x.k === 'dy') ? s.settings.fixed?.[x.k] : undefined;
    if (g[x.k] || !f || !people.some(p => p.id === f) || guardUnavailable(work, date, f, x.k, idx)) continue;
    g[x.k] = f; n++;
    work = { ...work, guards: { ...work.guards, [date]: { ...g } } };
    if (!idx.has(f)) idx.set(f, new Set()); idx.get(f)!.add(date);
  }
  const fixed = fixedIds(s); const memo = new Map<string, number[]>();
  for (const x of posts) {
    if (g[x.k]) continue;
    const cand = candidates(work, date, x, people, fair, idx, fixed, memo)[0];
    if (!cand) { empty.push(x.k); continue; }
    const lr = lastResort(s.statuses, date, cand.id, x); if (lr) warn.push(shortName(cand) + ' (' + x.label + '): ' + lr);
    g[x.k] = cand.id; n++;
    work = { ...work, guards: { ...work.guards, [date]: { ...g } } };
    if (!idx.has(cand.id)) idx.set(cand.id, new Set()); idx.get(cand.id)!.add(date);
  }
  return { guards: { ...s.guards, [date]: g }, n, empty, warn };
}
// Όσοι επιτρέπονται σε μια θέση, με τη σειρά που θα τους διάλεγε η αυτόματη συμπλήρωση
function candidates(s: AppState, date: ISODate, x: Post, people: Person[], fair: Map<number, Fair & { pid: number }>, idx: Map<number, Set<ISODate>>, fixed: Set<number>, memo?: Map<string, number[]>): Person[] {
  const h = isHol(s.settings, date);
  const need = x.armed ? [] : armedLeft(s, date, x.k);
  const keep = need.length ? armedNeeded(s, date, need, people.filter(p => !fixed.has(p.id)), idx, memo) : null;
  const reserve = (p: Person) => (keep?.has(p.id) ? 1 : 0);
  const last = (p: Person) => (lastResort(s.statuses, date, p.id, x) ? 1 : 0);
  // ΣΚ/αργία: πρώτα όσοι δεν έχουν δικαίωμα ΔΝ και όσων ο θάλαμος δεν βγαίνει έξοδο εκείνη τη μέρα
  const rooms = h ? outRoomsOn(s.rules, date) : null;
  const home = (p: Person) => (h ? (p.dn ? 1 : 0) + (rooms && p.room != null && rooms.includes(p.room) ? 1 : 0) : 0);
  const cmp = fairCompare(h, x.kind, date);
  // τα κλειδιά υπολογίζονται μία φορά ανά άτομο, όχι σε κάθε σύγκριση της ταξινόμησης (ίδια σειρά με πριν)
  return people.filter(p => !fixed.has(p.id) && !guardUnavailable(s, date, p.id, x.k, idx))
    .map(p => ({ p, key: last(p) * 100 + reserve(p) * 10 + home(p), f: fair.get(p.id)! }))
    .sort((a, b) => a.key - b.key || cmp(a.f, b.f)).map(c => c.p);
}
// Οι κενές ένοπλες θέσεις της μέρας (εκτός από την except)
const armedLeft = (s: AppState, date: ISODate, except: string) => { const g = s.guards[date] || {}; return postsOf(s.settings).filter(y => y.armed && y.k !== except && !g[y.k]); };
// Ποιοι χρειάζονται για τις ένοπλες θέσεις: όσοι, αν πάνε αλλού, γεμίζουν λιγότερες ένοπλες (μέγιστη αντιστοίχιση
// ατόμων σε θέσεις· για καθέναν από την αντιστοίχιση δοκιμάζεται αν τη θέση του την παίρνει άλλος)
// memo: ποιοι περνούν τους κανόνες κάθε θέσης, μία φορά ανά μέρα (αλλάζει μόνο για όποιον μπήκε ήδη σε θέση εκείνη τη μέρα)
function armedNeeded(s: AppState, date: ISODate, seats: Post[], people: Person[], idx: Map<number, Set<ISODate>>, memo?: Map<string, number[]>): Set<number> {
  const busy = new Set(Object.values(s.guards[date] || {}));
  const ok = (y: Post) => {
    let l = memo?.get(y.k);
    if (!l) { l = people.filter(p => !guardUnavailable(s, date, p.id, y.k, idx)).map(p => p.id); memo?.set(y.k, l); }
    return l.filter(pid => !busy.has(pid));
  };
  const adj = seats.map(ok);
  const bySeat: (number | undefined)[] = []; const byPid = new Map<number, number>();
  const aug = (si: number, seen: Set<number>, ban: number, bs: (number | undefined)[], bp: Map<number, number>): boolean => {
    for (const pid of adj[si]) {
      if (pid === ban || seen.has(pid)) continue;
      seen.add(pid);
      const o = bp.get(pid);
      if (o === undefined || aug(o, seen, ban, bs, bp)) { bp.set(pid, si); bs[si] = pid; return true; }
    }
    return false;
  };
  seats.forEach((_, si) => aug(si, new Set(), -1, bySeat, byPid));
  const out = new Set<number>();
  for (const [pid, si] of byPid) {
    const bs = [...bySeat]; const bp = new Map(byPid); bs[si] = undefined; bp.delete(pid);
    if (!aug(si, new Set(), pid, bs, bp)) out.add(pid);
  }
  return out;
}
// «Επόμενος στη σειρά» για μια θέση: ο πρώτος που επιτρέπεται, εκτός από όσους ήδη προτάθηκαν (skip)
export function nextFor(s: AppState, date: ISODate, k: string, skip: number[]): number | null {
  const x = postsOf(s.settings).find(p => p.k === k) || postBy(s, k); if (!x) return null;
  const g = { ...(s.guards[date] || {}) }; delete g[k];
  const work: AppState = { ...s, guards: { ...s.guards, [date]: g } };
  const people = activePeople(s);
  const fair = new Map(people.map(p => [p.id, { ...fairOf(s, p.id, date), pid: p.id }]));
  const idx = new Map<number, Set<ISODate>>(); dutyIndex(work.guards).forEach((v, id) => idx.set(id, v));
  return candidates(work, date, x, people, fair, idx, fixedIds(s)).find(p => !skip.includes(p.id))?.id ?? null;
}
// Ανταλλαγή δύο ατόμων που έχουν ήδη υπηρεσία την ίδια μέρα: τι εμποδίζει τον καθένα στη θέση του άλλου
export function swapCheck(s: AppState, date: ISODate, a: string, b: string): { hard: string | null; soft: string | null } {
  const g = s.guards[date] || {}; const pa = g[a], pb = g[b]; const A = postBy(s, a), B = postBy(s, b);
  if (!pa || !pb || !A || !B) return { hard: 'Η ανταλλαγή θέλει δύο κατειλημμένες θέσεις', soft: null };
  const work: AppState = { ...s, guards: { ...s.guards, [date]: { ...g, [a]: pb, [b]: pa } } };
  const pm = personMap(s.people); const nm = (id: number) => (pm.get(id) ? shortName(pm.get(id)!) : '?');
  const hard = (dutyBlock(s.statuses, date, pb, A) && nm(pb) + ': ' + dutyBlock(s.statuses, date, pb, A)) || (dutyBlock(s.statuses, date, pa, B) && nm(pa) + ': ' + dutyBlock(s.statuses, date, pa, B)) || null;
  const sa = capBlock(s, pb, A) || ruleBlock(work, date, pb, undefined, a), sb = capBlock(s, pa, B) || ruleBlock(work, date, pa, undefined, b);
  return { hard, soft: (sa && nm(pb) + ': ' + sa) || (sb && nm(pa) + ': ' + sb) || null };
}
// «Γιατί αυτός;»: μία γραμμή αιτιολόγησης για όποιον είναι σε μια θέση (έρευνα §3.1)
// Μέσοι όροι αργιών και υπηρεσιών όλων για μια μέρα: μία φορά για όλες τις θέσεις της μέρας, όχι μία ανά θέση
export function fairAvg(s: AppState, date: ISODate): { hol: number; total: number } {
  const v = activePeople(s).map(p => fairOf(s, p.id, date)); const n = v.length || 1;
  return { hol: v.reduce((a, x) => a + x.hol, 0) / n, total: v.reduce((a, x) => a + x.total, 0) / n };
}
// «Γιατί αυτός;» για κάθε κατειλημμένη θέση μιας μέρας
export function whyAll(s: AppState, date: ISODate): Record<string, string> {
  const g = s.guards[date] || {}; const keys = Object.keys(g); if (!keys.length) return {};
  const a = fairAvg(s, date); const out: Record<string, string> = {};
  for (const k of keys) out[k] = whyText(s, date, k, a);
  return out;
}
export function whyText(s: AppState, date: ISODate, k: string, avgs?: { hol: number; total: number }): string {
  const pid = (s.guards[date] || {})[k]; const post = postBy(s, k);
  if (!pid || !post) return '';
  const f = fairOf(s, pid, date);
  const av = avgs || fairAvg(s, date); const avg = (fn: (x: { hol: number; total: number }) => number) => fn(av);
  const r1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  const parts: string[] = [];
  if (isHol(s.settings, date)) {
    parts.push(f.hol + (f.hol === 1 ? ' αργία' : ' αργίες') + ' (μ.ό. ' + r1(avg(x => x.hol)) + ')');
    parts.push(f.lastHolBefore ? 'τελευταία αργία ' + dm(f.lastHolBefore) : 'καμία αργία ως τώρα');
  } else {
    parts.push(f.lastBefore ?  (daysBetween(f.lastBefore, date) - 2) + ' μέρες χωρίς υπηρεσία' : 'καμία υπηρεσία ως τώρα');
    parts.push(f.total + (f.total === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' (μ.ό. ' + r1(avg(x => x.total)) + ')');
  }
  if (post.armed) parts.push('ένοπλος');
  return parts.join(' · ');
}

// --------------------------- «Τι θα αλλάξει» για μια δήλωση (dry-run) ---------------------------
export interface StatusCmd { type: TypeKey; pids: number[]; from: ISODate; to: ISODate; kind?: string; note?: string; by?: string; reason?: string; on?: ISODate }
export interface PlanFile { fn: string; desc: string; warn?: boolean }
export interface StatusPlan {
  files: PlanFile[];
  overlaps: { pid: number; status: Status }[];
  conflicts: { pid: number; date: ISODate; k: string }[];
  past: { pid: number; date: ISODate; k: string }[];   // υπηρεσίες πριν από σήμερα: έγιναν, μένουν
  blocked: { pid: number; date: ISODate; reason: string }[];
  cancels: Status[];
}
const overlapsRange = (s: Status, from: ISODate, to: ISODate) => !(to < s.from || from > s.to);
// Έξοδος/ΔΝ πολλών ημερών που ακυρώνεται μόνο για from–to: μένουν οι μέρες πριν και μετά.
// Το πρώτο κομμάτι κρατά το id (ίδια γραμμή στο Excel), το δεύτερο παίρνει νέο.
export function splitOut(st: Status, from: ISODate, to: ISODate, newId: () => string): Status[] {
  const out: Status[] = [];
  if (st.from < from) out.push({ ...st, to: addDays(from, -1) });
  if (st.to > to) out.push({ ...st, id: out.length ? newId() : st.id, from: addDays(to, 1) });
  return out;
}
const rangeTxt = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));
// today: οι υπηρεσίες πριν από σήμερα δεν σβήνονται (έγιναν), μόνο αναφέρονται
export function planStatusChange(s: AppState, cmd: StatusCmd, today?: ISODate): StatusPlan {
  const t = TYPES[cmd.type];
  const n = cmd.pids.length;
  const pm = personMap(s.people);
  const files: PlanFile[] = [];
  const overlaps: StatusPlan['overlaps'] = [], conflicts: StatusPlan['conflicts'] = [], past: StatusPlan['past'] = [], blocked: StatusPlan['blocked'] = [], cancels: Status[] = [];
  const dates = Object.keys(s.guards).filter(d => d >= cmd.from && d <= cmd.to).sort();
  const posts = allPosts(s.settings);
  for (const pid of cmd.pids) {
    const ov = statusesOf(s.statuses, pid).find(x => overlapsRange(x, cmd.from, cmd.to) && (TYPES[x.type].cat === t.cat || (!!TYPES[x.type].away && !!t.away)));
    if (ov) overlaps.push({ pid, status: ov });
    if (t.cat === 'out') {
      for (let d = cmd.from; d <= cmd.to; d = addDays(d, 1)) { const r = outBlock(s, d, pid); if (r) { blocked.push({ pid, date: d, reason: r }); break; } }
    } else if (cmd.type !== 'PUN') {
      // οι ίδιοι κανόνες με τις υπηρεσίες (dutyBlock): καμία υπηρεσία, όχι ένοπλη, ΕΟ/ΕΑ όχι μαγειρεία
      const hyp: Status = { id: '', pid, type: cmd.type, from: cmd.from, to: cmd.to };
      dates.forEach(date => posts.forEach(x => {
        if (s.guards[date][x.k] === pid && dutyBlock([hyp], date, pid, x)) (today && date < today ? past : conflicts).push({ pid, date, k: x.k });
      }));
    }
    // και η ποινή που ακόμα αιτείται κρατά τον στρατιώτη μέσα (outBlock)
    if (t.noOut && !t.away)
      s.statuses.forEach(x => { if (x.pid === pid && TYPES[x.type].cat === 'out' && overlapsRange(x, cmd.from, cmd.to)) cancels.push(x); });
  }
  const rows = (k: number) => '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή');
  if (cmd.type === 'PUN') files.push({ fn: 'ΗΚΑΙ', desc: 'Αιτείται στις Αποφάσεις Διοικητή (4. Ποινές)· ισχύει όταν εγκριθεί' });
  else if (t.cat === 'med' || t.cat === 'other') files.push({ fn: 'Ιατρικά', desc: rows(n) + ' · αφαιρείται μόνο του όταν λήξει' });
  else if (t.cat === 'abs') files.push({ fn: 'ΗΚΑΙ', desc: 'Απόντες: ' + t.long + ' ' + rows(n) });
  if (t.hkai && cmd.type !== 'PUN' && t.cat !== 'abs') files.push({ fn: 'ΗΚΑΙ', desc: 'Κωλυόμενοι: ' + t.long + ' ' + rows(n) });
  const keep = (x: Status) => splitOut(x, cmd.from, cmd.to, () => '').map(y => rangeTxt(y.from, y.to)).join(', ');
  if (cancels.length) files.push({ fn: 'Εξοδούχοι', warn: true, desc: 'Ακυρώνεται η έξοδος: ' + cancels.map(x => shortName(pm.get(x.pid)!) + ' (' + rangeTxt(x.from, x.to) + (keep(x) ? ', μένει ' + keep(x) : '') + ')').join(', ') + '. ' + (cmd.type === 'PUN' ? 'Ο τιμωρημένος' : t.label) + ' δεν βγαίνει έξοδο.' });
  dates.forEach(date => {
    const cs = conflicts.filter(x => x.date === date);
    if (!cs.length) return;
    files.push({ fn: 'Υπηρεσίες ' + dm(date), warn: true, desc: cs.map(x => shortName(pm.get(x.pid)!) + ' βγαίνει από ' + postTxt(posts.find(p => p.k === x.k)!)).join(' · ') + '. ' + (cs.length > 1 ? 'Οι θέσεις μένουν' : 'Η θέση μένει') + ' ΚΕΝΗ.' });
  });
  [...new Set(past.map(x => x.date))].forEach(date => {
    files.push({ fn: 'Υπηρεσίες ' + dm(date), desc: past.filter(x => x.date === date).map(x => shortName(pm.get(x.pid)!) + ' (' + postTxt(posts.find(p => p.k === x.k)!) + ')').join(' · ') + ': υπηρεσία που έγινε, μένει.' });
  });
  return { files, overlaps, conflicts, past, blocked, cancels };
}

// --------------------------- ΗΚΑΙ (Κ-17) ---------------------------
// Κάθε άτομο μετριέται σε ΜΙΑ στήλη: πρώτα απουσία, μετά υπηρεσία, ΕΥ, ποινή, πόστο.
export const HK_K: [string, string, string][] = [['yp', 'Υπηρ.', 'Υπηρεσία εντός στρατοπέδου'], ['ey', 'ΕΥ', 'Ελεύθεροι υπηρεσίας'], ['tim', 'Τιμ.', 'Τιμωρημένοι'], ['bl', '', '(κενή στήλη του εντύπου)'], ['os', 'Ο/Σ', 'Ο/Σ (εδώ: πόστα, υπόθεση)'], ['mag', 'Μαγ.', 'Μαγειρεία'], ['sid', 'Σιδ.', 'Σιδηρουργείο'], ['kin', 'Κίν.', 'Σε κίνηση']];
export const HK_A: [string, string, string][] = [['ka', 'Κ.Άδ.', 'Κανονικές άδειες / ΑΜΔ / ΥΕΘΑ'], ['an', 'Αναρ.', 'Αναρρωτικές άδειες'], ['eid', 'Ειδ.', 'Ειδικές άδειες'], ['nos', 'Νοσ.', 'Νοσοκομείο / 401 ΓΣΝΑ'], ['prat', 'Πρατ.', 'Πρατήριο'], ['adik', 'Αδικ.', 'Αγνοούμενοι / Αδικαιολογήτως'], ['fp', 'Φ.Πορ.', 'Φύλλα πορείας - μεταβάσεως'], ['fyl', 'Φυλ.', 'Φυλάκια'], ['apal', 'Απαλ.', 'Απαλλαγή'], ['ekp', 'Εκπ.', 'Αποσπασμένοι σε εκπαίδευση'], ['allh', 'Άλλη Μ.', 'Αποσπασμένοι σε άλλη μονάδα']];
export const HK_OFFICERS = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ'];
export const HK_NCO = ['Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες', 'Δεκανείς', 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης', 'Στρατιώτες'];
// Βαθμός προσώπου → γραμμή της ΗΚΑΙ
export function hkRankOf(rank: string): string {
  const r = rank.toUpperCase().replace(/\./g, '');
  if (/ΑΡΧΙΛΧ|ΑΡΧΙΛΟΧ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛΧ|ΕΠΙΛΟΧ/.test(r)) return 'Επιλοχίες';
  if (/ΛΧΙΑΣ|ΛΟΧΙΑΣ/.test(r)) return 'Λοχίες';
  if (/ΔΝΕΑΣ|ΔΕΚΑΝ/.test(r)) return 'Δεκανείς';
  if (/ΕΠΟΠ/.test(r)) return 'ΕΠΟΠ Στρατιώτης';
  if (/ΟΒΑ/.test(r)) return 'ΟΒΑ Στρατιώτης';
  return 'Στρατιώτες';
}
export interface HkaiRow { n: number; attached: number; c: Record<string, number> }   // c.ab = μισθοτροφοδοτηθέντες (μόνο με το χέρι)
// Στήλες της ΗΚΑΙ που δεν βγαίνουν από την εφαρμογή και γράφονται με το χέρι
export const HK_MANUAL: [string, string][] = [['sid', 'Σιδ.'], ['kin', 'Κίν.'], ['eid', 'Ειδ.άδ.'], ['prat', 'Πρατ.'], ['adik', 'Αδικ.'], ['fp', 'Φ.Πορ.'], ['fyl', 'Φυλ.'], ['apal', 'Απαλ.'], ['ekp', 'Εκπ.'], ['allh', 'Άλλη Μ.'], ['ab', 'Μισθοτρ.']];
export interface Hkai { cols: Record<string, Person[]>; rank: Record<string, HkaiRow>; kol: number; apo: number; total: number; avail: number; guardsN: number }
export function hkaiCounts(s: AppState, date: ISODate): Hkai {
  const g = s.guards[date] || {};
  const onDuty = new Map<number, DutyKind>();
  for (const k in g) { const p = postBy(s, k); if (p) onDuty.set(g[k], p.kind); }
  const cols: Record<string, Person[]> = {};
  [...HK_K, ...HK_A].forEach(([k]) => (cols[k] = []));
  const rank: Record<string, HkaiRow> = {};
  // στελέχη: από τη λίστα με ονόματα αν υπάρχει, αλλιώς οι αριθμοί των Ρυθμίσεων
  const cl = (s.cadreList || []).filter(c => c.active);
  [...HK_OFFICERS, ...HK_NCO].forEach(r => (rank[r] = { n: cl.length ? 0 : s.settings.cadre[r] || 0, attached: 0, c: {} }));
  let cadreAway = 0;
  for (const c of cl) {
    const r = rank[c.hk] ? c.hk : 'Λοχίες'; rank[r].n++;
    const a = (s.cadreAbs || []).find(x => x.cid === c.id && x.from <= date && date <= x.to);
    const col = a && CADRE_ABS.find(k => k[0] === a.kind)?.[2];
    if (col) { rank[r].c[col] = (rank[r].c[col] || 0) + 1; cadreAway++; }
  }
  let soldiers = 0;
  for (const p of activePeople(s)) {
    soldiers++;
    const r = hkRankOf(p.rank); rank[r].n++; if (p.attached) rank[r].attached++;
    const ss = statusesOn(s.statuses, p.id, date);
    const abs = ss.find(x => TYPES[x.type].away && TYPES[x.type].hkai);
    const duty = onDuty.get(p.id);
    const col = abs ? TYPES[abs.type].hkai! : duty ? (duty === 'mg' ? 'mag' : 'yp') : ss.find(x => x.type === 'EY') ? 'ey' : ss.find(x => x.type === 'PUN') ? 'tim' : p.post ? 'os' : null;
    if (col) { cols[col].push(p); rank[r].c[col] = (rank[r].c[col] || 0) + 1; }
  }
  let kol = HK_K.reduce((a, [k]) => a + cols[k].length, 0), apo = HK_A.reduce((a, [k]) => a + cols[k].length, 0) + cadreAway;
  // ό,τι γράφει ο χρήστης με το χέρι (σιδηρουργείο, πρατήριο, φυλάκια, αποσπασμένοι…, μισθοτροφοδοτηθέντες «ab»)
  const man = s.hkaiManual?.[date]?.cells || {};
  for (const r of Object.keys(man)) {
    if (!rank[r]) continue;
    for (const [k, v] of Object.entries(man[r])) {
      if (!v) continue;
      rank[r].c[k] = (rank[r].c[k] || 0) + v;
      if (HK_K.some(x => x[0] === k)) kol += v; else if (HK_A.some(x => x[0] === k)) apo += v;
    }
  }
  const cadre = cl.length || Object.values(s.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  return { cols, rank, kol, apo, total: soldiers + cadre, avail: soldiers + cadre - apo, guardsN: Object.keys(g).length };
}
