// Καθαρές συναρτήσεις κανόνων: ίδιες στο main process και στο UI (09 §2, shared/rules)
import { addDays, dm, isWeekend, parseD, type ISODate } from './dates';
import { collator } from './text';
import {
  TYPES, TYPE_KEYS, RECORD_CATS, CAP_KINDS, CAP_ACC, buildPosts, postTxt, shortName,
  type AppState, type Person, type Post, type Status, type TypeKey, type DutyKind, type Guards, type Settings, type Rules
} from './domain';

// --------------------------- ευρετήρια (cache ανά αντικείμενο) ---------------------------
const peopleIdx = new WeakMap<Person[], Map<number, Person>>();
export function personMap(people: Person[]): Map<number, Person> {
  let m = peopleIdx.get(people);
  if (!m) { m = new Map(people.map(p => [p.id, p])); peopleIdx.set(people, m); }
  return m;
}
export const activePeople = (s: AppState) => s.people.filter(p => p.active);

const postsIdx = new WeakMap<Settings['blocks'], Post[]>();
export function postsOf(settings: Settings): Post[] {
  let p = postsIdx.get(settings.blocks);
  if (!p) { p = buildPosts(settings.blocks); postsIdx.set(settings.blocks, p); }
  return p;
}
export const postBy = (s: AppState, k: string): Post | undefined => postsOf(s.settings).find(p => p.k === k);

// --------------------------- αργίες ---------------------------
export const isHol = (settings: Settings, d: ISODate) => isWeekend(d) || !!settings.holidays[d];
export const holName = (settings: Settings, d: ISODate) => settings.holidays[d] || (isWeekend(d) ? 'ΣΚ' : '');

// --------------------------- καταστάσεις ---------------------------
const ORDER = (k: TypeKey) => TYPE_KEYS.indexOf(k);
// Όλες οι ενεργές καταστάσεις ενός ατόμου μια μέρα. Πρώτα οι απουσίες. Οι ποινές που αιτούνται δεν μετράνε (Κ-19).
export const statusesOn = (statuses: Status[], pid: number, date: ISODate): Status[] =>
  statuses.filter(s => s.pid === pid && !s.pending && s.from <= date && date <= s.to)
    .sort((a, b) => (Number(!!TYPES[b.type].away) - Number(!!TYPES[a.type].away)) || ORDER(a.type) - ORDER(b.type));
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
  if (p.post) return { th: 'Πόστο: ' + p.post, op: 'Πόστο: ' + p.post, mg: 'Πόστο: ' + p.post, sk: 'Πόστο: ' + p.post };
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
export function dutyBlock(statuses: Status[], date: ISODate, pid: number, post?: { armed: boolean } | null): string | null {
  for (const s of statusesOn(statuses, pid, date)) {
    const t = TYPES[s.type];
    if (t.noDuty) return t.label + untilTxt(s, date);
    if (t.noArmed && (!post || post.armed)) return 'Άοπλος: ' + t.label + untilTxt(s, date);
  }
  return null;
}
export const postOf = (s: AppState, date: ISODate, pid: number, exceptKey?: string): Post | undefined =>
  postsOf(s.settings).find(x => x.k !== exceptKey && (s.guards[date] || {})[x.k] === pid);

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
export function ruleBlock(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): string | null {
  const r = s.rules;
  const ds = (idx || dutyIndex(s.guards)).get(pid);
  if (!ds) return null;
  for (let i = 1; i <= r.restDays; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d)) return 'Υπηρεσία ' + dm(d) + ' (ανάπαυση)';
  if (r.noConsecHol && isHol(s.settings, date))
    for (let i = 3; i <= 9; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d) && isHol(s.settings, d)) return 'Έκανε αργία ' + holName(s.settings, d) + ' ' + dm(d);
  return null;
}
export function guardUnavailable(s: AppState, date: ISODate, pid: number, k: string | null, idx?: Map<number, Set<ISODate>>): string | null {
  const post = k ? postBy(s, k) : null;
  const r = dutyBlock(s.statuses, date, pid, post) || capBlock(s, pid, post);
  if (r) return r;
  const o = postOf(s, date, pid, k || undefined);
  if (o) return 'Ήδη ' + postTxt(o);
  return ruleBlock(s, date, pid, idx);
}
// Κ-06, Κ-07, Κ-08: γιατί κάποιος ΔΕΝ βγαίνει έξοδο (null = βγαίνει)
export function outBlock(s: AppState, date: ISODate, pid: number): string | null {
  const o = postOf(s, date, pid);
  if (o) return 'Έχει υπηρεσία: ' + o.label;
  const st = statusesOn(s.statuses, pid, date).find(x => TYPES[x.type].noOut);
  return st ? (st.type === 'PUN' && st.kind ? st.kind : TYPES[st.type].label) + untilTxt(st, date) : null;
}
export const outRoomsOn = (rules: Rules, d: ISODate): number[] | null => rules.outRooms[parseD(d).getDay()] || null;

// --------------------------- Έλεγχος υπηρεσιών (από το ημερολόγιο υπηρεσιών) ---------------------------
export interface DutyStat { byKind: Record<string, number>; total: number; hol: number; last: ISODate | null; lastHol: ISODate | null; log: { d: ISODate; k: string; h: boolean }[] }
const statsCache = new WeakMap<Guards, Map<number, DutyStat>>();
export const emptyStat = (): DutyStat => ({ byKind: {}, total: 0, hol: 0, last: null, lastHol: null, log: [] });
export function dutyStats(s: AppState): Map<number, DutyStat> {
  let st = statsCache.get(s.guards);
  if (st) return st;
  st = new Map();
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
  statsCache.set(s.guards, st);
  return st;
}
export const statOf = (s: AppState, pid: number) => dutyStats(s).get(pid) || emptyStat();

// --------------------------- Αυτόματη συμπλήρωση ---------------------------
// Μόνο όσοι επιτρέπονται, λιγότερες υπηρεσίες πρώτα. Στις αργίες πρώτα λιγότερες αργίες.
// Στις άοπλες θέσεις προτιμά όσους δεν μπορούν σε ένοπλη, ώστε να μένουν ένοπλοι για τις ένοπλες.
export function fillDay(s: AppState, date: ISODate): { guards: Guards; n: number } {
  const g: Record<string, number> = { ...(s.guards[date] || {}) };
  let work: AppState = { ...s, guards: { ...s.guards, [date]: g } };
  const st = dutyStats(s);
  const loc = new Map<number, { byKind: Record<string, number>; hol: number; total: number; last: string }>();
  const people = activePeople(s);
  people.forEach(p => { const x = st.get(p.id) || emptyStat(); loc.set(p.id, { byKind: { ...x.byKind }, hol: x.hol, total: x.total, last: x.last || '' }); });
  const idx = new Map<number, Set<ISODate>>();
  dutyIndex(s.guards).forEach((v, id) => idx.set(id, new Set(v)));
  const h = isHol(s.settings, date);
  let n = 0;
  for (const x of postsOf(s.settings)) {
    if (g[x.k]) continue;
    const unarmedOnly = (p: Person) => (!x.armed && statusesOn(s.statuses, p.id, date).some(t => TYPES[t.type].noArmed) ? 0 : 1);
    const cand = people.filter(p => !guardUnavailable(work, date, p.id, x.k, idx)).sort((p, q) => {
      const a = loc.get(p.id)!, b = loc.get(q.id)!;
      return unarmedOnly(p) - unarmedOnly(q) || (h ? a.hol - b.hol : 0) || (a.byKind[x.kind] || 0) - (b.byKind[x.kind] || 0) ||
        a.total - b.total || a.last.localeCompare(b.last) || collator.compare(p.last, q.last);
    })[0];
    if (cand) {
      g[x.k] = cand.id; n++;
      work = { ...work, guards: { ...work.guards, [date]: { ...g } } };
      const l = loc.get(cand.id)!; l.byKind[x.kind] = (l.byKind[x.kind] || 0) + 1; l.total++; if (h) l.hol++; if (date > l.last) l.last = date;
      if (!idx.has(cand.id)) idx.set(cand.id, new Set()); idx.get(cand.id)!.add(date);
    }
  }
  return { guards: { ...s.guards, [date]: g }, n };
}

// --------------------------- «Τι θα αλλάξει» για μια δήλωση (dry-run) ---------------------------
export interface StatusCmd { type: TypeKey; pids: number[]; from: ISODate; to: ISODate; kind?: string; note?: string }
export interface PlanFile { fn: string; desc: string; warn?: boolean }
export interface StatusPlan {
  files: PlanFile[];
  overlaps: { pid: number; status: Status }[];
  conflicts: { pid: number; date: ISODate; k: string }[];
  blocked: { pid: number; date: ISODate; reason: string }[];
  cancels: Status[];
}
const overlapsRange = (s: Status, from: ISODate, to: ISODate) => !(to < s.from || from > s.to);
export function planStatusChange(s: AppState, cmd: StatusCmd): StatusPlan {
  const t = TYPES[cmd.type];
  const n = cmd.pids.length;
  const pm = personMap(s.people);
  const files: PlanFile[] = [];
  const overlaps: StatusPlan['overlaps'] = [], conflicts: StatusPlan['conflicts'] = [], blocked: StatusPlan['blocked'] = [], cancels: Status[] = [];
  const dates = Object.keys(s.guards).filter(d => d >= cmd.from && d <= cmd.to).sort();
  const posts = postsOf(s.settings);
  for (const pid of cmd.pids) {
    const ov = s.statuses.find(x => x.pid === pid && overlapsRange(x, cmd.from, cmd.to) && (TYPES[x.type].cat === t.cat || (!!TYPES[x.type].away && !!t.away)));
    if (ov) overlaps.push({ pid, status: ov });
    if (t.cat === 'out') {
      for (let d = cmd.from; d <= cmd.to; d = addDays(d, 1)) { const r = outBlock(s, d, pid); if (r) { blocked.push({ pid, date: d, reason: r }); break; } }
    } else if (cmd.type !== 'PUN') {
      dates.forEach(date => posts.forEach(x => {
        if (s.guards[date][x.k] === pid && (t.noDuty || (t.noArmed && x.armed))) conflicts.push({ pid, date, k: x.k });
      }));
    }
    if (t.noOut && !t.away && cmd.type !== 'PUN')
      s.statuses.forEach(x => { if (x.pid === pid && TYPES[x.type].cat === 'out' && overlapsRange(x, cmd.from, cmd.to)) cancels.push(x); });
  }
  const rows = (k: number) => '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή');
  if (cmd.type === 'PUN') files.push({ fn: 'ΗΚΑΙ', desc: 'Αιτείται στις Αποφάσεις Διοικητή (4. Ποινές)· ισχύει όταν εγκριθεί' });
  else if (t.cat === 'med' || t.cat === 'other') files.push({ fn: 'Ιατρικά', desc: rows(n) + ' · αφαιρείται μόνο του όταν λήξει' });
  else if (t.cat === 'abs') files.push({ fn: 'ΗΚΑΙ', desc: 'Απόντες: ' + t.long + ' ' + rows(n) });
  if (t.hkai && cmd.type !== 'PUN' && t.cat !== 'abs') files.push({ fn: 'ΗΚΑΙ', desc: 'Κωλυόμενοι: ' + t.long + ' ' + rows(n) });
  if (cancels.length) files.push({ fn: 'Εξοδούχοι', warn: true, desc: 'Ακυρώνεται η έξοδος: ' + cancels.map(x => shortName(pm.get(x.pid)!) + ' (' + dm(x.from) + ')').join(', ') + '. ' + t.label + ' δεν βγαίνει έξοδο.' });
  dates.forEach(date => {
    const cs = conflicts.filter(x => x.date === date);
    if (!cs.length) return;
    files.push({ fn: 'Υπηρεσίες ' + dm(date), warn: true, desc: cs.map(x => shortName(pm.get(x.pid)!) + ' βγαίνει από ' + postTxt(posts.find(p => p.k === x.k)!)).join(' · ') + '. ' + (cs.length > 1 ? 'Οι θέσεις μένουν' : 'Η θέση μένει') + ' ΚΕΝΗ.' });
  });
  return { files, overlaps, conflicts, blocked, cancels };
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
export interface HkaiRow { n: number; attached: number; c: Record<string, number> }
export interface Hkai { cols: Record<string, Person[]>; rank: Record<string, HkaiRow>; kol: number; apo: number; total: number; avail: number; guardsN: number }
export function hkaiCounts(s: AppState, date: ISODate): Hkai {
  const g = s.guards[date] || {};
  const onDuty = new Map<number, DutyKind>();
  for (const k in g) { const p = postBy(s, k); if (p) onDuty.set(g[k], p.kind); }
  const cols: Record<string, Person[]> = {};
  [...HK_K, ...HK_A].forEach(([k]) => (cols[k] = []));
  const rank: Record<string, HkaiRow> = {};
  [...HK_OFFICERS, ...HK_NCO].forEach(r => (rank[r] = { n: s.settings.cadre[r] || 0, attached: 0, c: {} }));
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
  const kol = HK_K.reduce((a, [k]) => a + cols[k].length, 0), apo = HK_A.reduce((a, [k]) => a + cols[k].length, 0);
  const cadre = Object.values(s.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  return { cols, rank, kol, apo, total: soldiers + cadre, avail: soldiers + cadre - apo, guardsN: Object.keys(g).length };
}
