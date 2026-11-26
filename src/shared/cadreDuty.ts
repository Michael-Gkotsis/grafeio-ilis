// Υπηρεσίες στελεχών (Michael, 17/11, πρόταση λοχία): δικό τους πρόγραμμα μήνα με ομάδες και υπηρεσίες που ορίζει ο χρήστης (ΑΥΔΜ, Πύλη,
// Φυλάκιο…), όρια ανά μήνα με μεταφορά, ανάπαυση μετά από 24ωρη και περιορισμοί ανά άτομο (ελαφράς, μητέρα, μέρες που δεν θέλει).
// Μετρούν ΜΑΖΙ με όσες υπηρεσίες κάνει το στέλεχος με το χέρι στις θέσεις των στρατιωτών (rules.ts, dutyStats). Καθαρή λογική: ίδια για
// την οθόνη και το Excel. Τίποτα εδώ δεν μπλοκάρει· ό,τι δεν ταιριάζει γυρνά ως «λόγοι» και η οθόνη ζητά αιτία. Δεν αγγίζει την
// αυτόματη συμπλήρωση και τη σειρά δικαιοσύνης των στρατιωτών (rules.ts).
import { MONTHS, addDays, dm, dmy, weekday, type ISODate } from './dates';
import { KIND_NAME, type AppState, type Cadre, type Person, type CadreDuty, type CadreDutyCfg, type CadreDutyGroup, type CadreDutyPerson, type CadreService, type Settings } from './domain';
import { hkRowsOf, rankTxt } from './ranks';
import { cadreStatusOn, orderedCadre } from './cadre';
import { PROV, cadreOf, cadreSeat, cadreOnlyAll, cadreOnlyOf, dutyStats, nextCadrePid, isHol, postBy, setCadreFiller, type CadreOnly, type CadreSeatFill, type DutyStat } from './rules';
import { daysOfMonth, monthIndex, monthOf, planDays, shiftMonth, type MonthIndex, type PlanCell, type PlanDay } from './cadrePlan';
import { upper } from './text';
import { countOf, onceKeyOfCadre } from './dutyOnce';

// ---- ρυθμίσεις ----
export const DEFAULT_DUTY: CadreDutyCfg = { groups: [], limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true };
const cfgIdx = new WeakMap<object, CadreDutyCfg>();
const nn = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
const cleanDays = (v: unknown): number[] | undefined => { const a = Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : []; return a.length ? a : undefined; };
export function dutyCfgOf(st: Pick<Settings, 'cadreDuty'>): CadreDutyCfg {
  const raw = st.cadreDuty; if (!raw) return DEFAULT_DUTY;
  let c = cfgIdx.get(raw); if (c) return c;
  const lim = (k: 'off' | 'nco') => ({ base: nn(raw.limits?.[k]?.base, DEFAULT_DUTY.limits[k].base), extra: nn(raw.limits?.[k]?.extra, DEFAULT_DUTY.limits[k].extra) });
  const groups: CadreDutyGroup[] = Array.isArray(raw.groups) ? raw.groups.filter(g => g && g.id).map(g => ({
    id: String(g.id), name: String(g.name || g.id),
    services: (Array.isArray(g.services) ? g.services : []).filter(v => v && v.id).map((v): CadreService => ({
      id: String(v.id), name: String(v.name || v.id), short: String(v.short || v.name || v.id), perDay: Math.max(1, Math.floor(nn(v.perDay, 1))), h24: v.h24 !== false, hkCol: String(v.hkCol || ''),
      ...(v.offOnly ? { offOnly: true } : {}), ...(cleanDays(v.days) ? { days: cleanDays(v.days) } : {})
    }))
  })) : [];
  c = { groups, limits: { off: lim('off'), nco: lim('nco') }, rest: Math.floor(nn(raw.rest, 1)), carry: raw.carry !== false, fairHol: raw.fairHol !== false };
  cfgIdx.set(raw, c); return c;
}
const svcIdx = new WeakMap<CadreDutyCfg, Map<string, { svc: CadreService; group: CadreDutyGroup }>>();
export function serviceOf(cfg: CadreDutyCfg, id: string): { svc: CadreService; group: CadreDutyGroup } | undefined {
  let m = svcIdx.get(cfg); if (!m) { m = new Map(); for (const g of cfg.groups) for (const v of g.services) if (!m.has(v.id)) m.set(v.id, { svc: v, group: g }); svcIdx.set(cfg, m); }
  return m.get(id);
}
export const newDutyId = (used: string[], p: string): string => { let i = used.length + 1; while (used.includes(p + i)) i++; return p + i; };
export const runsOn = (v: CadreService, d: ISODate) => !v.days?.length || v.days.includes(weekday(d));

// ---- ανά άτομο ----
const NO_PERSON: CadreDutyPerson = {};
export const personOf = (s: Pick<AppState, 'cadreDutyOf'>, cid: string): CadreDutyPerson => s.cadreDutyOf?.[cid] || NO_PERSON;
export const isOff = (s: Pick<AppState, 'settings'>, c: Cadre) => hkRowsOf(s.settings.lists).off.includes(c.hk);
export const catOf = (s: Pick<AppState, 'settings'>, c: Cadre): 'off' | 'nco' => (isOff(s, c) ? 'off' : 'nco');
// ισχύει ακόμα μια ρύθμιση με «ως τη μέρα» την ημέρα d;
const live = (u: { until?: ISODate }, d: ISODate) => !u.until || d <= u.until;
export function cleanPerson(p: CadreDutyPerson): CadreDutyPerson | null {
  const o: CadreDutyPerson = {};
  if (p.group) o.group = p.group;
  if (typeof p.limit === 'number' && isFinite(p.limit) && p.limit >= 0) o.limit = Math.floor(p.limit);
  if (p.none) o.none = p.none.until ? { until: p.none.until } : {};
  if (p.only && p.only.services?.length) o.only = { services: [...p.only.services], ...(p.only.until ? { until: p.only.until } : {}) };
  if (p.no24) o.no24 = { ...(p.no24.until ? { until: p.no24.until } : {}), ...(p.no24.why?.trim() ? { why: p.no24.why.trim() } : {}) };
  const dw = cleanDays(p.noDow); if (dw) o.noDow = dw;
  return Object.keys(o).length ? o : null;
}
// υπάρχει περιορισμός που ισχύει κάποια μέρα του μήνα;
export function restrictedIn(p: CadreDutyPerson, ym: string): boolean {
  const lo = ym + '-01';
  return !!((p.none && live(p.none, ym + '-' + String(daysOfMonth(ym)).padStart(2, '0')) && (!p.none.until || p.none.until >= lo)) || (p.only && (!p.only.until || p.only.until >= lo)) || (p.no24 && (!p.no24.until || p.no24.until >= lo)));
}

// ---- ευρετήριο: οι υπηρεσίες κάθε στελέχους ανά μέρα (πρόγραμμα + θέσεις στρατιωτών) ----
// seat.svc: η υπηρεσία του προγράμματος στελεχών που μετρά η θέση, όταν η θέση είναι «μόνο για στελέχη» (Michael, 24/11: μετρά και φαίνεται ως η υπηρεσία του, π.χ. ΑΥΔΜ, όχι ως «Σ»)
export interface DayDuty { roster: CadreDuty[]; seat: { k: string; label: string; svc?: CadreService }[] }
const idxCache = new WeakMap<Map<number, DutyStat>, { duties?: CadreDuty[]; cl: Cadre[]; set: Settings; idx: Map<string, Map<ISODate, DayDuty>> }>();
const NO_DUTIES: CadreDuty[] = [];
const NO_ABS: object = [];
export function dutyIndex(s: AppState): Map<string, Map<ISODate, DayDuty>> {
  const st = dutyStats(s); const hit = idxCache.get(st);
  if (hit && hit.duties === s.cadreDuties && hit.cl === s.cadreList && hit.set === s.settings) return hit.idx;
  const idx = new Map<string, Map<ISODate, DayDuty>>();
  const day = (cid: string, d: ISODate) => { let m = idx.get(cid); if (!m) { m = new Map(); idx.set(cid, m); } let x = m.get(d); if (!x) { x = { roster: [], seat: [] }; m.set(d, x); } return x; };
  const svcOf = (k: string) => linkedSvc(s.settings, k);
  for (const x of s.cadreDuties || NO_DUTIES) day(x.cid, x.date).roster.push(x);
  for (const c of s.cadreList || []) {
    if (c.pid == null) continue;
    for (const e of st.get(c.pid)?.log || []) { const v = svcOf(e.k); if (v && day(c.id, e.d).roster.some(r => r.via === e.k)) continue; day(c.id, e.d).seat.push({ k: e.k, label: (e.k && postBy(s, e.k)?.label) || (KIND_NAME as Record<string, string>)[e.kind] || e.kind, ...(v ? { svc: v } : {}) }); }
  }
  idxCache.set(st, { duties: s.cadreDuties, cl: s.cadreList, set: s.settings, idx });
  return idx;
}
// ---- «Μόνο στελέχη» ↔ υπηρεσία στελεχών (Michael, 24/11): αμφίδρομη σχέση ----
// Η θέση «μόνο για στελέχη» μετρά ως μία υπηρεσία του προγράμματος στελεχών (BlockDef.cadreAs, αλλιώς η πρώτη της ομάδας). Όταν βάλεις στέλεχος στη θέση,
// μπαίνει και στο πρόγραμμα στελεχών ως αυτή η υπηρεσία· όταν βάλεις την υπηρεσία στο πρόγραμμα, γεμίζει η κενή θέση· και τα δύο σβήνουν μαζί.
// Στο πρόγραμμα (cadreDuties) η εγγραφή έχει via = κλειδί της θέσης· οι υπόλοιποι υπολογισμοί (ΗΔ, ΗΚΑΙ, απαλλαγές) διαβάζουν μόνο το πρόγραμμα.
// Και για θέση ανενεργή ή άλλου εντύπου (cadreOnlyAll, έλεγχος 25/11): οι υπηρεσίες που έγιναν εκεί μένουν ως η υπηρεσία του προγράμματος
export function linkedSvc(st: Settings, k: string): CadreService | undefined {
  const o = k ? cadreOnlyAll(st).get(k) : undefined; if (!o) return undefined;
  const g = dutyCfgOf(st).groups.find(x => x.id === o.group); return g?.services.find(x => x.id === o.as) || g?.services[0];
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function syncLinked(prev: AppState, next: AppState, newId: () => string): AppState {
  // coAll: όλες οι θέσεις «Μόνο στελέχη» (και ανενεργές/άλλου εντύπου) για ό,τι έγινε· co: μόνο όσες γεμίζουν σήμερα, για το «η εγγραφή γεμίζει τη θέση»
  const co = cadreOnlyOf(next.settings); const coAll = cadreOnlyAll(next.settings); const was0 = prev.cadreDuties || NO_DUTIES; const list0 = next.cadreDuties || NO_DUTIES;
  if (!coAll.size && !list0.some(x => x.via)) return next;
  if (prev.guards === next.guards && was0 === list0 && prev.settings === next.settings) return next;
  let guards = next.guards, cadreList = next.cadreList; let list = list0;
  const was = new Set(was0); const have = new Set(list0.map(x => x.id));
  const cadreAt = (g: typeof guards, d: ISODate, k: string) => { const pid = g[d]?.[k]; return pid != null && pid < 0 ? cadreOf({ cadreList }, pid) : undefined; };
  const setList = (f: (x: CadreDuty) => CadreDuty | null) => { const a: CadreDuty[] = []; let ch = false; for (const x of list) { const y = f(x); if (y !== x) ch = true; if (y) a.push(y); } if (ch) list = a; };
  const full = prev.settings !== next.settings;
  // 1) εγγραφή του προγράμματος με via που σβήστηκε → φεύγει και το στέλεχος από τη θέση
  for (const x of was0) {
    if (!x.via || have.has(x.id) || cadreAt(guards, x.date, x.via)?.id !== x.cid) continue;
    const g = { ...(guards[x.date] || {}) }; delete g[x.via]; guards = { ...guards, [x.date]: g };
  }
  // 2) θέση που άλλαξε → ίδια αλλαγή στο πρόγραμμα
  const dates = new Set<ISODate>();
  for (const d of Object.keys(guards)) if (full || guards[d] !== prev.guards[d]) dates.add(d);
  for (const d of Object.keys(prev.guards)) if (!guards[d]) dates.add(d);
  for (const d of dates) for (const k of coAll.keys()) {
    const v = linkedSvc(next.settings, k); const c = v ? cadreAt(guards, d, k) : undefined;
    const pb = prev.guards[d]?.[k]; const before = pb != null && pb < 0 ? cadreOf({ cadreList: prev.cadreList }, pb) : undefined;
    if (before && (!c || c.id !== before.id)) setList(x => (x.date === d && x.cid === before.id && x.via === k ? null : x));
    if (!v || !c) continue;
    const hit = list.find(x => x.date === d && x.cid === c.id && x.svc === v.id);
    if (!hit) list = [...list, { id: 'd' + newId(), date: d, svc: v.id, cid: c.id, via: k }];
    else if (hit.via !== k) setList(x => (x === hit ? { ...x, via: k } : x));
  }
  // μετά από αλλαγή ρυθμίσεων: εγγραφές που δεν έχουν πια θέση (άλλαξε η υπηρεσία της θέσης, έπαψε να είναι «μόνο στελέχη»)
  if (full) setList(x => (x.via && (linkedSvc(next.settings, x.via)?.id !== x.svc || cadreAt(guards, x.date, x.via)?.id !== x.cid) ? null : x));
  // 3) εγγραφή που μπήκε στο πρόγραμμα για υπηρεσία δεμένη με θέση → γεμίζει η θέση (πρώτη κενή, αλλιώς μένει μόνο στο πρόγραμμα)
  const posts = new Map<string, string[]>(); for (const k of co.keys()) { const v = linkedSvc(next.settings, k); if (v) posts.set(v.id, [...(posts.get(v.id) || []), k]); }
  for (const x of [...list]) {
    if (x.via || was.has(x) || !posts.has(x.svc) || !ISO.test(x.date)) continue;
    const ks = posts.get(x.svc)!; const mine = ks.find(k => cadreAt(guards, x.date, k)?.id === x.cid);
    const k = mine || ks.find(q => guards[x.date]?.[q] == null); if (!k) continue;
    if (!mine) {
      const cd = cadreList.find(y => y.id === x.cid); if (!cd) continue;
      let pid = cd.pid; if (pid == null) { pid = nextCadrePid(cadreList); cadreList = cadreList.map(y => (y === cd ? { ...cd, pid } : y)); }
      guards = { ...guards, [x.date]: { ...(guards[x.date] || {}), [k]: pid } };
    }
    setList(y => (y === x ? { ...y, via: k } : y));
  }
  if (guards === next.guards && cadreList === next.cadreList && list === list0) return next;
  return { ...next, ...(guards !== next.guards ? { guards } : {}), ...(cadreList !== next.cadreList ? { cadreList } : {}), ...(list !== list0 ? { cadreDuties: list } : {}) };
}
export const dayOf = (s: AppState, cid: string, d: ISODate): DayDuty | undefined => dutyIndex(s).get(cid)?.get(d);

// ---- μήνας: πόσες έκανε, όριο, μεταφορά ----
export interface MonthCount { done: number; roster: number; seat: number; hol: number }
export function monthCount(s: AppState, cid: string, ym: string, exclude?: string): MonthCount {
  const m = dutyIndex(s).get(cid); const out: MonthCount = { done: 0, roster: 0, seat: 0, hol: 0 };
  if (!m) return out;
  const N = daysOfMonth(ym);
  for (let i = 1; i <= N; i++) {
    const d = ym + '-' + String(i).padStart(2, '0'); const x = m.get(d); if (!x) continue;
    const r = exclude ? x.roster.filter(y => y.id !== exclude).length : x.roster.length; const n = r + x.seat.length;
    if (!n) continue;
    // «Μετρά για 1» (Michael, 26/11): μέρα με 2+ υπηρεσίες μετρά μία στα όρια και στα σύνολα· roster και seat μένουν όπως έγιναν
    const k = s.dutyOnce ? countOf(s.dutyOnce, d, onceKeyOfCadre(cid), n) : n;
    out.roster += r; out.seat += x.seat.length; out.done += k; if (isHol(s.settings, d)) out.hol += k;
  }
  return out;
}
const plannedIdx = new WeakMap<CadreDuty[], Set<string>>();
// μήνες που έχουν κάποια υπηρεσία στο πρόγραμμα: μόνο από αυτούς μεταφέρεται υπόλοιπο (αλλιώς ο πρώτος μήνας θα έπαιρνε +όριο)
export function plannedMonths(s: Pick<AppState, 'cadreDuties'>): Set<string> {
  const all = s.cadreDuties || NO_DUTIES; let m = plannedIdx.get(all);
  if (!m) { m = new Set(all.map(x => monthOf(x.date))); plannedIdx.set(all, m); }
  return m;
}
export interface MonthLimit extends MonthCount { cat: 'off' | 'nco'; base: number; effBase: number; extra: number; carry: number; nextCarry: number }
const baseOf = (s: AppState, c: Cadre): { base: number; extra: number } => {
  const cfg = dutyCfgOf(s.settings); const cat = catOf(s, c); const p = personOf(s, c.id); const l = cfg.limits[cat];
  return p.limit != null ? { base: p.limit, extra: l.extra } : c.monthMax ? { base: c.monthMax, extra: 0 } : { base: l.base, extra: l.extra };
};
// συμμετέχει το στέλεχος στο πρόγραμμα τον μήνα; (ομάδα, ή υπηρεσία του προγράμματος αυτόν τον μήνα) και χωρίς «ελαφράς καμία»
const inPlan = (s: AppState, c: Cadre, ym: string, roster: number) => { const p = personOf(s, c.id); return (!!p.group || roster > 0) && !(p.none && (!p.none.until || p.none.until >= ym + '-01')); };
// πόσο του μήνα μπορούσε να κάνει υπηρεσία: μέρες χωρίς κατάσταση (εκτός «Υπηρεσία»), χωρίς «δεν θέλει», μέρα εβδομάδας που δεν θέλει, και με κάποια υπηρεσία της ομάδας του
// που δεν αποκλείεται από περιορισμό (καμία / μόνο / όχι 24ωρες). Από εδώ κόβεται η ΘΕΤΙΚΗ μεταφορά: όποιος δεν μπορούσε δεν «χρωστά» υπηρεσίες. Η αρνητική μένει.
const availCache = new WeakMap<object, { nd: unknown; of: unknown; st: unknown; idx: Map<string, MonthIndex>; m: Map<string, number> }>();
export function availShare(s: AppState, c: Cadre, ym: string): number {
  const key = s.cadreAbs || NO_ABS; let e = availCache.get(key);
  if (!e || e.nd !== s.cadreNoDuty || e.of !== s.cadreDutyOf || e.st !== s.settings) { e = { nd: s.cadreNoDuty, of: s.cadreDutyOf, st: s.settings, idx: new Map(), m: new Map() }; availCache.set(key, e); }
  const k = c.id + '|' + ym; const hit = e.m.get(k); if (hit !== undefined) return hit;
  let index = e.idx.get(ym); if (!index) { index = monthIndex(s, ym); e.idx.set(ym, index); }
  const cfg = dutyCfgOf(s.settings); const p = personOf(s, c.id); const g = cfg.groups.find(x => x.id === p.group);
  const cells = index.cells.get(c.id), nd = index.noDuty.get(c.id); const N = index.days.length; let n = 0;
  if (g) for (let i = 0; i < N; i++) {
    const d = index.days[i].d;
    if (nd?.[i] || p.noDow?.includes(weekday(d)) || (p.none && live(p.none, d))) continue;
    if (cells?.[i]) { const sa = cadreStatusOn(s, c.id, d); if (sa && sa.col !== 'yp') continue; }
    const off = isOff(s, c);
    if (g.services.some(v => runsOn(v, d) && !(v.offOnly && !off) && !(p.only && live(p.only, d) && !p.only.services.includes(v.id)) && !(p.no24 && live(p.no24, d) && v.h24))) n++;
  }
  const r = N ? n / N : 0; e.m.set(k, r); return r;
}
// μεταφορά από έναν μήνα: αρνητική (έκανε πάνω από το όριο) όπως είναι· θετική μόνο ως προς το κομμάτι του μήνα που μπορούσε να κάνει
const carryOf = (s: AppState, c: Cadre, ym: string, base: number, done: number): number => {
  const raw = base - done; if (raw <= 0) return raw;
  return Math.max(0, Math.floor(base * availShare(s, c, ym) + 1e-9) - done);
};
export function monthLimit(s: AppState, c: Cadre, ym: string, exclude?: string): MonthLimit {
  const cfg = dutyCfgOf(s.settings); const cnt = monthCount(s, c.id, ym, exclude); const { base, extra } = baseOf(s, c);
  const planned = plannedMonths(s); let carry = 0;
  if (cfg.carry) {
    const pm = shiftMonth(ym, -1);
    if (planned.has(pm)) { const prev = monthCount(s, c.id, pm); if (inPlan(s, c, pm, prev.roster)) carry = carryOf(s, c, pm, base, prev.done); }
  }
  const nextCarry = cfg.carry && planned.has(ym) && inPlan(s, c, ym, cnt.roster) ? carryOf(s, c, ym, base, cnt.done) : 0;
  return { ...cnt, cat: catOf(s, c), base, effBase: Math.max(0, base + carry), extra, carry, nextCarry };
}

// ---- ποιος μπορεί σε ποια υπηρεσία: λόγοι (ποτέ μπλοκάρισμα) ----
export type ReasonCode = 'inactive' | 'group' | 'state' | 'noduty' | 'dow' | 'none' | 'only' | 'no24' | 'offonly' | 'days' | 'rest' | 'same' | 'seat' | 'full' | 'over' | 'over2';
export interface Reason { code: ReasonCode; text: string; strong?: boolean }
// όσοι λόγοι είναι «περιορισμοί» (στον Έλεγχο μήνα), σε αντίθεση με όριο και ανάπαυση
export const RESTRICTION_CODES: ReasonCode[] = ['inactive', 'group', 'state', 'noduty', 'dow', 'none', 'only', 'no24', 'offonly', 'days'];
const DOW_NAME = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];       // Δευ … Κυρ, για τα κουμπιά
export const DOW_INI: Record<number, string> = { 0: 'Κ', 1: 'Δ', 2: 'Τ', 3: 'Τ', 4: 'Π', 5: 'Π', 6: 'Σ' };
export function eligibility(s: AppState, c: Cadre, date: ISODate, svc?: CadreService, opt: { ignore?: string } = {}): Reason[] {
  const cfg = dutyCfgOf(s.settings); const p = personOf(s, c.id); const out: Reason[] = []; const ym = monthOf(date);
  if (!c.active) out.push({ code: 'inactive', text: 'Εκτός δύναμης' });
  if (svc) {
    const sg = cfg.groups.find(g => g.services.some(v => v.id === svc.id));
    if (p.group && sg && sg.id !== p.group) out.push({ code: 'group', text: 'Είναι στην ομάδα «' + (cfg.groups.find(g => g.id === p.group)?.name || '?') + '», όχι «' + sg.name + '»' });
    if (svc.offOnly && !isOff(s, c)) out.push({ code: 'offonly', text: 'Η υπηρεσία «' + svc.name + '» είναι μόνο για αξιωματικούς' });
    if (!runsOn(svc, date)) out.push({ code: 'days', text: 'Η υπηρεσία «' + svc.name + '» δεν γίνεται ' + DOW_NAME[weekday(date)].toLowerCase() });
  }
  const st = cadreStatusOn(s, c.id, date);
  if (st && st.col !== 'yp') out.push({ code: 'state', text: 'Έχει ' + st.label.toLowerCase() + ' ' + dm(st.abs.from) + (st.abs.to !== st.abs.from ? '–' + dm(st.abs.to) : '') });
  const nd = (s.cadreNoDuty || []).find(x => x.cid === c.id && x.from <= date && date <= x.to);
  if (nd) out.push({ code: 'noduty', text: 'Δεν θέλει υπηρεσία' + (nd.note ? ' (' + nd.note + ')' : '') });
  if (p.noDow?.includes(weekday(date))) out.push({ code: 'dow', text: 'Δεν θέλει ' + DOW_NAME[weekday(date)].toLowerCase() });
  if (p.none && live(p.none, date)) out.push({ code: 'none', text: 'Ελαφράς: καμία υπηρεσία' + (p.none.until ? ' ως ' + dmy(p.none.until) : '') });
  if (p.only && live(p.only, date) && svc && !p.only.services.includes(svc.id)) out.push({ code: 'only', text: 'Ελαφράς: μόνο ' + p.only.services.map(id => serviceOf(cfg, id)?.svc.short || id).join(', ') + (p.only.until ? ' ως ' + dmy(p.only.until) : '') });
  if (p.no24 && live(p.no24, date) && svc?.h24) out.push({ code: 'no24', text: 'Όχι 24ωρες' + (p.no24.why ? ' (' + p.no24.why + ')' : '') + (p.no24.until ? ' ως ' + dmy(p.no24.until) : '') });
  // ανάπαυση και διπλή υπηρεσία: από το ευρετήριο (πρόγραμμα και θέσεις στρατιωτών μαζί)
  const mine = dutyIndex(s).get(c.id);
  if (mine) {
    const others = (d: ISODate) => { const x = mine.get(d); return x ? { r: x.roster.filter(y => y.id !== opt.ignore), seat: x.seat } : undefined; };
    const same = others(date);
    if (same?.r.length) out.push({ code: 'same', text: 'Έχει ήδη υπηρεσία ' + same.r.map(y => serviceOf(cfg, y.svc)?.svc.name || y.svc).join(', ') + ' αυτή τη μέρα' });
    if (same?.seat.length) out.push({ code: 'seat', text: 'Έχει και υπηρεσία στρατιωτών (' + same.seat.map(y => y.label).join(', ') + ')' });
    outer: for (let k = 1; k <= cfg.rest; k++) for (const d of [addDays(date, -k), addDays(date, k)]) {
      const x = others(d); if (x && (x.r.length || x.seat.length)) { out.push({ code: 'rest', text: 'Ανάπαυση: έχει υπηρεσία ' + dm(d) }); break outer; }
    }
  }
  if (svc) {
    const full = (s.cadreDuties || []).filter(x => x.date === date && x.svc === svc.id && x.id !== opt.ignore && x.cid !== c.id).length;
    if (full >= svc.perDay) out.push({ code: 'full', text: 'Η υπηρεσία «' + svc.name + '» έχει ήδη ' + full + (full === 1 ? ' άτομο' : ' άτομα') + ' αυτή τη μέρα' });
  }
  const lim = monthLimit(s, c, ym, opt.ignore); const after = lim.done + (mine?.get(date)?.roster.some(y => y.id !== opt.ignore && svc && y.svc === svc.id) ? 0 : 1);
  if (after > lim.effBase + lim.extra) out.push({ code: 'over2', strong: true, text: 'Πάνω από το όριο και το έξτρα: ' + after + ' από ' + lim.effBase + '+' + lim.extra });
  else if (after > lim.effBase) out.push({ code: 'over', text: 'Πάνω από το όριο: ' + after + ' από ' + lim.effBase + (lim.extra ? ' (+' + lim.extra + ' αν χρειαστεί)' : '') });
  return out;
}

// ---- κελιά του πλέγματος ----
export interface DutyCell { roster: { svc: CadreService | undefined; id: string; duty: CadreDuty }[]; seat: { label: string; svc?: CadreService }[]; state?: PlanCell; noDuty: boolean }
export function personCells(s: AppState, c: Cadre, index: MonthIndex): DutyCell[] {
  const cfg = dutyCfgOf(s.settings); const m = dutyIndex(s).get(c.id); const cs = index.cells.get(c.id), nd = index.noDuty.get(c.id);
  return index.days.map((d, i) => {
    const x = m?.get(d.d);
    return { roster: (x?.roster || []).map(r => ({ svc: serviceOf(cfg, r.svc)?.svc, id: r.svc, duty: r })), seat: (x?.seat || []).map(y => ({ label: y.label, ...(y.svc ? { svc: y.svc } : {}) })), ...(cs?.[i] ? { state: cs[i] } : {}), noDuty: !!nd?.[i] };
  });
}
// θέση «μόνο για στελέχη»: ο κωδικός της υπηρεσίας που μετρά (ΑΥΔΜ)· κάθε άλλη θέση στρατιωτών: ένα «Σ»
const seatCodes = (x: DutyCell): string[] => { const l = x.seat.filter(y => y.svc).map(y => y.svc!.short); return x.seat.some(y => !y.svc) ? [...l, 'Σ'] : l; };
export const cellCode = (x: DutyCell): string => (x.roster.length || x.seat.length ? [...x.roster.map(r => r.svc?.short || '?'), ...seatCodes(x)].join('/') : x.state?.code || '');

// ---- γραμμές: ομάδες, χωρίς ομάδα, περιορισμοί ----
export interface DutySection { id: string; name: string; kind: 'group' | 'free' | 'restr'; people: Cadre[] }
export function dutySections(s: AppState, ym: string, index: MonthIndex = monthIndex(s, ym)): DutySection[] {
  const cfg = dutyCfgOf(s.settings); const all = orderedCadre(s.cadreList || []).filter(c => c.active);
  const mem = new Map<string, Cadre[]>(); const free: Cadre[] = []; const restr: Cadre[] = [];
  const idx = dutyIndex(s);
  const hasRoster = (c: Cadre) => { const m = idx.get(c.id); if (!m) return false; const N = daysOfMonth(ym); for (let i = 1; i <= N; i++) if (m.get(ym + '-' + String(i).padStart(2, '0'))?.roster.length) return true; return false; };
  for (const c of all) {
    const p = personOf(s, c.id); const g = p.group && cfg.groups.some(x => x.id === p.group) ? p.group : '';
    const r = restrictedIn(p, ym) && !hasRoster(c);
    if (r && (p.none || p.only || p.no24)) restr.push(c);
    else if (g) { const l = mem.get(g); if (l) l.push(c); else mem.set(g, [c]); }
    else { const cnt = monthCount(s, c.id, ym); if (cnt.done) free.push(c); }
  }
  void index;
  const out: DutySection[] = cfg.groups.map(g => ({ id: g.id, name: g.name, kind: 'group' as const, people: mem.get(g.id) || [] }));
  if (free.length) out.push({ id: '_free', name: 'Χωρίς ομάδα (υπηρεσίες στρατιωτών)', kind: 'free', people: free });
  if (restr.length) out.push({ id: '_restr', name: 'Περιορισμοί', kind: 'restr', people: restr });
  return out;
}
// το «Όριο» της γραμμής: «3+1», ή ο περιορισμός
export function limitText(s: AppState, c: Cadre, ym: string, lim: MonthLimit): string {
  const p = personOf(s, c.id); const cfg = dutyCfgOf(s.settings);
  if (p.none && restrictedIn({ none: p.none }, ym)) return 'καμία';
  if (p.only && restrictedIn({ only: p.only }, ym)) return 'μόνο ' + p.only.services.map(id => serviceOf(cfg, id)?.svc.short || id).join(', ');
  if (p.no24 && restrictedIn({ no24: p.no24 }, ym) && !lim.roster) return 'όχι 24ωρες';
  return lim.effBase + (lim.extra ? '+' + lim.extra : '');
}
export const monthShort = (ym: string) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3);
// «−1 Ιαν»: ό,τι μεταφέρεται στον επόμενο μήνα
export const carryText = (ym: string, n: number) => (n ? (n > 0 ? '+' : '−') + Math.abs(n) + ' ' + monthShort(shiftMonth(ym, 1)) : '—');

// ---- ανά υπηρεσία ----
export const duByDay = (s: Pick<AppState, 'cadreDuties'>, ym: string): Map<string, CadreDuty[]> => {
  const m = new Map<string, CadreDuty[]>();
  for (const x of s.cadreDuties || NO_DUTIES) if (x.date.startsWith(ym)) { const k = x.date + '|' + x.svc; const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); }
  return m;
};
export const nameOf = (c: Cadre | undefined) => (c ? [rankTxt(c), c.last, c.first].filter(Boolean).join(' ') : '?');
export const threeOf = (c: Cadre | undefined) => (c ? upper(c.last).slice(0, 3) : '?');

// ---- Έλεγχος μήνα ----
export interface MonthCheck {
  empty: { svc: CadreService; group: string; days: ISODate[]; missing: number }[];
  over: { c: Cadre; lim: MonthLimit }[];
  under: { c: Cadre; lim: MonthLimit }[];
  double: { c: Cadre; d: ISODate; what: string }[];
  broken: { c: Cadre; d: ISODate; svc: string; reasons: Reason[] }[];
}
export function monthCheck(s: AppState, ym: string): MonthCheck {
  const cfg = dutyCfgOf(s.settings); const days = planDays(s.settings, ym); const by = duByDay(s, ym);
  const empty: MonthCheck['empty'] = [];
  for (const g of cfg.groups) for (const v of g.services) {
    const ds: ISODate[] = []; let missing = 0;
    for (const d of days) if (runsOn(v, d.d)) { const n = by.get(d.d + '|' + v.id)?.length || 0; if (n < v.perDay) { ds.push(d.d); missing += v.perDay - n; } }
    if (ds.length) empty.push({ svc: v, group: g.name, days: ds, missing });
  }
  const people = orderedCadre(s.cadreList || []).filter(c => c.active); const byId = new Map(people.map(c => [c.id, c]));
  const over: MonthCheck['over'] = [], under: MonthCheck['under'] = [], double: MonthCheck['double'] = [];
  const idx = dutyIndex(s);
  for (const c of people) {
    const lim = monthLimit(s, c, ym); const p = personOf(s, c.id);
    if (lim.done > lim.effBase) over.push({ c, lim });
    else if (p.group && lim.done < lim.effBase && !restrictedIn({ none: p.none }, ym)) under.push({ c, lim });
    const m = idx.get(c.id);
    if (m) for (const d of days) { const x = m.get(d.d); if (x && x.roster.length + x.seat.length > 1) double.push({ c, d: d.d, what: [...x.roster.map(r => serviceOf(cfg, r.svc)?.svc.short || r.svc), ...x.seat.map(() => 'Σ')].join(' + ') }); }
  }
  const broken: MonthCheck['broken'] = [];
  for (const x of s.cadreDuties || NO_DUTIES) {
    if (!x.date.startsWith(ym)) continue;
    const c = byId.get(x.cid) || (s.cadreList || []).find(y => y.id === x.cid); if (!c) continue;
    const sv = serviceOf(cfg, x.svc);
    const reasons = eligibility(s, c, x.date, sv?.svc, { ignore: x.id }).filter(r => RESTRICTION_CODES.includes(r.code));
    if (reasons.length) broken.push({ c, d: x.date, svc: sv?.svc.short || x.svc, reasons });
  }
  broken.sort((a, b) => a.d.localeCompare(b.d));
  return { empty, over, under, double, broken };
}

// ---- Excel «ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ»: νέο αρχείο, δύο φύλλα. Όλα με κεφαλαία ----
export interface DutySheet {
  title: string; days: PlanDay[]; shade: ('we' | 'hol' | '')[];
  byPerson: { rank: string; name: string; group: string; cells: string[]; sum: number; limit: string }[];
  byDay: { date: string; dow: string; svc: string; who: string; shade: 'we' | 'hol' | '' }[];
  legend: string;
}
const DOW_SHORT = ['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'];
export function dutySheet(s: AppState, ym: string): DutySheet {
  const cfg = dutyCfgOf(s.settings); const index = monthIndex(s, ym); const days = index.days; const secs = dutySections(s, ym, index);
  const shade = days.map(d => (d.hol ? 'hol' as const : d.we ? 'we' as const : ''));
  const byPerson: DutySheet['byPerson'] = [];
  for (const sec of secs) for (const c of sec.people) {
    const cells = personCells(s, c, index); const lim = monthLimit(s, c, ym);
    byPerson.push({ rank: upper(rankTxt(c)), name: upper([c.last, c.first].filter(Boolean).join(' ')), group: upper(sec.kind === 'group' ? sec.name : sec.kind === 'restr' ? (cfg.groups.find(g => g.id === personOf(s, c.id).group)?.name || sec.name) : ''), cells: cells.map(x => upper(cellCode(x) + (!x.roster.length && !x.seat.length && !x.state && x.noDuty ? 'X' : ''))), sum: lim.done, limit: upper(limitText(s, c, ym, lim)) });
  }
  const by = duByDay(s, ym); const pm = new Map((s.cadreList || []).map(c => [c.id, c]));
  const byDay: DutySheet['byDay'] = [];
  for (const d of days) for (const g of cfg.groups) for (const v of g.services) {
    if (!runsOn(v, d.d)) continue;
    const l = by.get(d.d + '|' + v.id) || [];
    byDay.push({ date: dmy(d.d), dow: DOW_SHORT[weekday(d.d)], svc: upper(v.name), who: l.length ? upper(l.map(x => nameOf(pm.get(x.cid))).join(', ')) : '—', shade: d.hol ? 'hol' : d.we ? 'we' : '' });
  }
  const legend = 'ΥΠΟΜΝΗΜΑ: ' + upper(cfg.groups.flatMap(g => g.services.map(v => v.short + ' = ' + v.name)).concat(['Σ = ΥΠΗΡΕΣΙΑ ΣΤΡΑΤΙΩΤΩΝ (ΜΕ ΤΟ ΧΕΡΙ)', 'X = ΔΕΝ ΘΕΛΕΙ ΥΠΗΡΕΣΙΑ']).join(' · '));
  return { title: upper('ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ ' + MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4)), days, shade, byPerson, byDay, legend };
}

// ---- Αυτόματη συμπλήρωση μήνα (φάση 3β) ----
// Γεμίζει ΜΟΝΟ τις κενές θέσεις υπηρεσιών του μήνα, μέρα με τη μέρα· κρατά ό,τι υπάρχει (με το χέρι ή αυτόματο) και δεν αγγίζει τις υπηρεσίες των
// στρατιωτών (rules.ts). Υποψήφιος = μέλος της ομάδας που περνά ΟΛΟΥΣ τους περιορισμούς (ίδιοι κανόνες με το eligibility, χωρίς σκληρούς λόγους).
// 1ο πέρασμα: μόνο όσοι είναι κάτω από το όριό τους (με μεταφορά)· 2ο: ως όριο+έξτρα («+1 αν χρειαστεί»)· αλλιώς μένει κενή και αναφέρεται.
// Σειρά επιλογής: λιγότερες υπηρεσίες τον μήνα (και θέσεις στρατιωτών) → σε ΣΚ/αργία: λιγότερες ΣΚ/αργίες 3 μηνών και όχι όποιος έκανε
// ΣΚ/αργία την προηγούμενη εβδομάδα → περισσότερος καιρός από την τελευταία υπηρεσία → σειρά ιεραρχίας. Σε ΣΚ/αργία (sweep 17/11) διαλέγει ανάμεσα σε
// όσους είναι ως +1 υπηρεσία από τον λιγότερο φορτωμένο, με πρώτο κριτήριο τα ΣΚ/αργίες 3 μηνών. Ντετερμινιστικό· ευρετήρια μία φορά ανά εκτέλεση.
// Θέσεις μόνο για στελέχη (Michael, 24/11, BlockDef.who = 'cadre'): μπαίνουν στην ίδια συμπλήρωση με τις υπηρεσίες της ομάδας τους, ίδια δικαιοσύνη, όρια και
// ανάπαυση, μαζί (χωρίς διπλή υπηρεσία την ίδια μέρα). Γράφονται στο guards όπως οι θέσεις που διαλέγεις με το χέρι: seats = [μέρα, θέση, στέλεχος]
export interface SeatFill { date: ISODate; k: string; cid: string }
export interface AutoFillResult { add: Omit<CadreDuty, 'id'>[]; empty: { date: ISODate; svc: string }[]; extra: { cid: string; date: ISODate }[]; seats?: SeatFill[]; seatEmpty?: { date: ISODate; k: string }[]; seatExtra?: SeatFill[] }
// η υπηρεσία του προγράμματος στελεχών που μετρά η θέση: cadreAs, αλλιώς η πρώτη της ομάδας· χωρίς μέρες και χωρίς όριο ατόμων (τα κρίνει η ίδια η θέση)
export function seatService(cfg: CadreDutyCfg, co: CadreOnly): CadreService {
  const g = cfg.groups.find(x => x.id === co.group); const v = g?.services.find(x => x.id === co.as) || g?.services[0];
  return v ? { ...v, perDay: 1e6, days: undefined } : { id: '_seat', name: co.label, short: co.label, perDay: 1e6, h24: true, hkCol: '' };
}
export function autoFill(s: AppState, ym: string, opts: { fairHol?: boolean; only?: ISODate; seatsOnly?: boolean } = {}): AutoFillResult {
  const cfg = dutyCfgOf(s.settings); const fairHol = opts.fairHol ?? cfg.fairHol;
  const add: AutoFillResult['add'] = [], empty: AutoFillResult['empty'] = [], extra: AutoFillResult['extra'] = [];
  const seats: SeatFill[] = [], seatEmpty: { date: ISODate; k: string }[] = [], seatExtra: SeatFill[] = [];
  const co = cadreOnlyOf(s.settings); const seatsBy = new Map<string, { k: string; svc: CadreService }[]>();
  const linkedBy = new Map<string, string[]>(); for (const k of co.keys()) { const sv = linkedSvc(s.settings, k); if (sv) linkedBy.set(sv.id, [...(linkedBy.get(sv.id) || []), k]); }
  for (const [k, v] of co) { const l = seatsBy.get(v.group); const x = { k, svc: seatService(cfg, v) }; if (l) l.push(x); else seatsBy.set(v.group, [x]); }
  const people = orderedCadre(s.cadreList || []).filter(c => c.active);
  const ord = new Map(people.map((c, i) => [c.id, i]));
  const idx = dutyIndex(s); const by = duByDay(s, ym); const index = monthIndex(s, ym); const N = index.days.length;
  const picked = new Map<string, Set<ISODate>>();
  const busy = (cid: string, d: ISODate) => { const x = idx.get(cid)?.get(d); return !!(x && (x.roster.length || x.seat.length)) || !!picked.get(cid)?.has(d); };
  const holMemo = new Map<ISODate, boolean>();
  const hol = (d: ISODate) => { let v = holMemo.get(d); if (v === undefined) { v = isHol(s.settings, d); holMemo.set(d, v); } return v; };
  interface St { c: Cadre; p: CadreDutyPerson; off: boolean; done: number; hol: number; hol3: number | null; lim: number; extra: number; last: ISODate | '' }
  const st = new Map<string, St>();
  let cur: ISODate = ym + '-01';
  const stOf = (c: Cadre): St => {
    let x = st.get(c.id); if (x) return x;
    const l = monthLimit(s, c, ym); let last: ISODate | '' = '';
    for (let k = 1; k <= 60 && !last; k++) if (busy(c.id, addDays(cur, -k))) last = addDays(cur, -k);
    x = { c, p: personOf(s, c.id), off: isOff(s, c), done: l.done, hol: l.hol, hol3: null, lim: l.effBase, extra: l.extra, last };
    st.set(c.id, x); return x;
  };
  const hol3Of = (x: St) => {
    if (x.hol3 == null) {
      let n = 0; const m = idx.get(x.c.id);
      if (m) for (let k = 1; k <= 3; k++) { const pm = shiftMonth(ym, -k); for (let i = 1; i <= daysOfMonth(pm); i++) { const d = pm + '-' + String(i).padStart(2, '0'); const e = m.get(d); if (e && hol(d)) n += e.roster.length + e.seat.length; } }
      x.hol3 = n;
    }
    return x.hol3 + x.hol;
  };
  const recentHol = (cid: string, d: ISODate) => { for (let k = 1; k <= 7; k++) { const e = addDays(d, -k); if (hol(e) && busy(cid, e)) return true; } return false; };
  const members = new Map<string, Cadre[]>();
  for (const c of people) { const g = personOf(s, c.id).group; if (g) { const l = members.get(g); if (l) l.push(c); else members.set(g, [c]); } }
  const pad = (i: number) => ym + '-' + String(i).padStart(2, '0');
  const cmp = (a: St, b: St, h: boolean, d: ISODate) => {
    if (a.done !== b.done) return a.done - b.done;
    if (h) { const x = hol3Of(a), y = hol3Of(b); if (x !== y) return x - y; const r = recentHol(a.c.id, d), q = recentHol(b.c.id, d); if (r !== q) return r ? 1 : -1; }
    if (a.last !== b.last) return a.last < b.last ? -1 : 1;
    return ord.get(a.c.id)! - ord.get(b.c.id)!;
  };
  for (let i = opts.only ? +opts.only.slice(8) : 1; i <= (opts.only ? +opts.only.slice(8) : N); i++) {
    const d = pad(i); const h = fairHol && hol(d); const dow = weekday(d);
    if (i > 1) { const pd = pad(i - 1); for (const x of st.values()) if (busy(x.c.id, pd)) x.last = pd; }
    cur = d;
    // ο καλύτερος υποψήφιος μιας υπηρεσίας (ή θέσης) αυτή τη μέρα: undefined = κανείς· extra = μπήκε ως «+1 αν χρειαστεί»
    const pick = (v: CadreService, mem: Cadre[]): { best: St | undefined; isExtra: boolean } => {
      const ok: St[] = [];
      for (const c of mem) {
        if (v.offOnly && !isOff(s, c)) continue;
        const x = stOf(c); const p = x.p;
        if (p.noDow?.includes(dow) || (p.none && live(p.none, d)) || (p.only && live(p.only, d) && !p.only.services.includes(v.id)) || (p.no24 && live(p.no24, d) && v.h24)) continue;
        if (index.noDuty.get(c.id)?.[i - 1]) continue;
        if (index.cells.get(c.id)?.[i - 1]) { const sa = cadreStatusOn(s, c.id, d); if (sa && sa.col !== 'yp') continue; }
        if (busy(c.id, d)) continue;
        let rest = false;
        for (let k = 1; k <= cfg.rest && !rest; k++) if (busy(c.id, addDays(d, -k)) || busy(c.id, addDays(d, k))) rest = true;
        if (rest) continue;
        ok.push(x);
      }
      let best: St | undefined, isExtra = false;
      // ΣΚ/αργία (sweep 17/11): με «λιγότερες υπηρεσίες πρώτα» η σειρά κλείδωνε σε κύκλο και 2 από τους 7 έκαναν και τα 8 ΣΚ του Φεβρουαρίου.
      // Τώρα μπαίνουν στη ζυγαριά όσοι είναι ως +1 από τον λιγότερο φορτωμένο, και από αυτούς νικά όποιος έχει λιγότερα ΣΚ/αργίες
      const pool = (cap: (x: St) => number) => { const l = ok.filter(x => x.done < cap(x)); if (!h || !l.length) return l; const m = Math.min(...l.map(x => x.done)); return l.filter(x => x.done <= m + 1); };
      const holCmp = (a: St, b: St) => { const x = hol3Of(a), y = hol3Of(b); return x !== y ? x - y : cmp(a, b, h, d); };
      for (const x of pool(x => x.lim)) if (!best || (h ? holCmp(x, best) : cmp(x, best, h, d)) < 0) best = x;
      if (!best) { isExtra = true; for (const x of pool(x => x.lim + x.extra)) if (!best || (h ? holCmp(x, best) : cmp(x, best, h, d)) < 0) best = x; }
      return { best, isExtra };
    };
    const take = (best: St) => {
      best.done++; if (hol(d)) best.hol++;
      let ps = picked.get(best.c.id); if (!ps) { ps = new Set(); picked.set(best.c.id, ps); } ps.add(d);
    };
    for (const g of cfg.groups) {
      const mem = members.get(g.id) || [];
      if (!opts.seatsOnly) for (const v of g.services) {
        if (!runsOn(v, d)) continue;
        // θέση «μόνο στελέχη» δεμένη με αυτή την υπηρεσία = ένα από τα άτομά της (γεμίζει από το πέρασμα των θέσεων παρακάτω)· όσες θέσεις έχουν ήδη εγγραφή (via) μετρούν ήδη
        const have = by.get(d + '|' + v.id) || []; const lk = (linkedBy.get(v.id) || []).filter(k => !have.some(x => x.via === k)).length;
        const missing = v.perDay - have.length - lk;
        for (let slot = 0; slot < missing; slot++) {
          const { best, isExtra } = pick(v, mem);
          if (!best) { empty.push({ date: d, svc: v.id }); continue; }
          add.push({ date: d, svc: v.id, cid: best.c.id, auto: true });
          if (isExtra) extra.push({ cid: best.c.id, date: d });
          take(best);
        }
      }
      for (const sp of seatsBy.get(g.id) || []) {
        if (s.guards[d]?.[sp.k]) continue;
        const { best, isExtra } = pick(sp.svc, mem);
        if (!best) { seatEmpty.push({ date: d, k: sp.k }); continue; }
        seats.push({ date: d, k: sp.k, cid: best.c.id });
        if (isExtra) seatExtra.push({ date: d, k: sp.k, cid: best.c.id });
        take(best);
      }
    }
    // θέση με ομάδα που δεν υπάρχει πια: μένει κενή
    for (const [k, v] of co) if (!cfg.groups.some(x => x.id === v.group) && !s.guards[d]?.[k]) seatEmpty.push({ date: d, k });
  }
  return { add, empty, extra, ...(co.size ? { seats, seatEmpty, seatExtra } : {}) };
}
// Η συμπλήρωση των θέσεων στελεχών μιας μέρας για την αυτόματη συμπλήρωση υπηρεσιών (rules.ts fillDay): μόνο οι κενές θέσεις μόνο-για-στελέχη
function fillSeats(s: AppState, date: ISODate): CadreSeatFill {
  const r = autoFill(s, monthOf(date), { only: date, seatsOnly: true });
  return { put: (r.seats || []).map(x => ({ k: x.k, cid: x.cid })), empty: (r.seatEmpty || []).map(x => ({ k: x.k, group: cadreOnlyOf(s.settings).get(x.k)?.group || '' })), extra: (r.seatExtra || []).map(x => ({ k: x.k, cid: x.cid })) };
}
setCadreFiller(fillSeats);

// ---- Έλεγχος υπηρεσιών (Excel και οθόνη, Michael 26/11): και οι υπηρεσίες του προγράμματος στελεχών ----
// Οι υπηρεσίες του προγράμματος που δεν είναι ήδη θέση (χωρίς via: τη θέση την δείχνει ήδη το ημερολόγιο υπηρεσιών) ενός μήνα:
// cid → μέρα → κωδικοί (short της υπηρεσίας: ΑΥΔΜ, ΕΕΑΣ), με τη σειρά του προγράμματος
export function rosterCodes(s: Pick<AppState, 'cadreDuties' | 'settings'>, ym: string): Map<string, Map<ISODate, string[]>> {
  const out = new Map<string, Map<ISODate, string[]>>(); const cfg = dutyCfgOf(s.settings);
  for (const x of s.cadreDuties || NO_DUTIES) {
    if (x.via || x.date.slice(0, 7) !== ym) continue;
    let m = out.get(x.cid); if (!m) { m = new Map(); out.set(x.cid, m); }
    const l = m.get(x.date); const code = serviceOf(cfg, x.svc)?.svc.short || '?';
    if (l) l.push(code); else m.set(x.date, [code]);
  }
  return out;
}
// Τα στελέχη του Ελέγχου υπηρεσιών, με τη σειρά της λίστας στελεχών: όσα έχουν θέση τον μήνα (seated: ο αριθμός θέσης έχει υπηρεσία) ή υπηρεσία στο πρόγραμμα.
// Όσα δεν έχουν ακόμα αριθμό θέσης παίρνουν προσωρινό (PROV - θέση στη λίστα), όπως στην επιλογή θέσης· ο κωδικός τους έρχεται από το rosterCodes με το cid.
export function checkCadres(s: AppState, roster: Map<string, unknown>, seated: (pid: number) => boolean): Person[] {
  return (s.cadreList || []).flatMap((c, i) => (c.pid != null ? seated(c.pid) || roster.has(c.id) : roster.has(c.id)) ? [cadreSeat(c, c.pid ?? PROV - i)] : []);
}
// Πόσες υπηρεσίες μετρά ένα στέλεχος στη λίστα του Ελέγχου υπηρεσιών (θέσεις και πρόγραμμα, με το «μετρά για 1»): ym κενό = όλες
export function cadreCheckTotal(s: AppState, c: Cadre, ym?: string): number {
  const m = dutyIndex(s).get(c.id); if (!m) return 0;
  let n = 0;
  for (const [d, x] of m) { if (ym && d.slice(0, 7) !== ym) continue; n += countOf(s.dutyOnce, d, onceKeyOfCadre(c.id), x.roster.length + x.seat.length); }
  return n;
}
