// Υπηρεσίες στελεχών (Michael, 17/11, πρόταση λοχία): δικό τους πρόγραμμα μήνα με ομάδες και υπηρεσίες που ορίζει ο χρήστης (ΑΥΔΜ, Πύλη,
// Φυλάκιο…), όρια ανά μήνα με μεταφορά, ανάπαυση μετά από 24ωρη και περιορισμοί ανά άτομο (ελαφράς, μητέρα, μέρες που δεν θέλει).
// Μετρούν ΜΑΖΙ με όσες υπηρεσίες κάνει το στέλεχος με το χέρι στις θέσεις των στρατιωτών (rules.ts, dutyStats). Καθαρή λογική: ίδια για
// την οθόνη και το Excel. Τίποτα εδώ δεν μπλοκάρει· ό,τι δεν ταιριάζει γυρνά ως «λόγοι» και η οθόνη ζητά αιτία. Δεν αγγίζει την
// αυτόματη συμπλήρωση και τη σειρά δικαιοσύνης των στρατιωτών (rules.ts).
import { MONTHS, addDays, dm, dmy, weekday, type ISODate } from './dates';
import { KIND_NAME, type AppState, type Cadre, type CadreDuty, type CadreDutyCfg, type CadreDutyGroup, type CadreDutyPerson, type CadreService, type Settings } from './domain';
import { hkRowsOf, rankTxt } from './ranks';
import { cadreStatusOn, orderedCadre } from './cadre';
import { dutyStats, isHol, postBy, type DutyStat } from './rules';
import { daysOfMonth, monthIndex, monthOf, planDays, shiftMonth, type MonthIndex, type PlanCell, type PlanDay } from './cadrePlan';
import { upper } from './text';

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
export interface DayDuty { roster: CadreDuty[]; seat: { k: string; label: string }[] }
const idxCache = new WeakMap<Map<number, DutyStat>, { duties?: CadreDuty[]; cl: Cadre[]; idx: Map<string, Map<ISODate, DayDuty>> }>();
const NO_DUTIES: CadreDuty[] = [];
export function dutyIndex(s: AppState): Map<string, Map<ISODate, DayDuty>> {
  const st = dutyStats(s); const hit = idxCache.get(st);
  if (hit && hit.duties === s.cadreDuties && hit.cl === s.cadreList) return hit.idx;
  const idx = new Map<string, Map<ISODate, DayDuty>>();
  const day = (cid: string, d: ISODate) => { let m = idx.get(cid); if (!m) { m = new Map(); idx.set(cid, m); } let x = m.get(d); if (!x) { x = { roster: [], seat: [] }; m.set(d, x); } return x; };
  for (const c of s.cadreList || []) {
    if (c.pid == null) continue;
    for (const e of st.get(c.pid)?.log || []) day(c.id, e.d).seat.push({ k: e.k, label: (e.k && postBy(s, e.k)?.label) || (KIND_NAME as Record<string, string>)[e.kind] || e.kind });
  }
  for (const x of s.cadreDuties || NO_DUTIES) day(x.cid, x.date).roster.push(x);
  idxCache.set(st, { duties: s.cadreDuties, cl: s.cadreList, idx });
  return idx;
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
    out.roster += r; out.seat += x.seat.length; out.done += n; if (isHol(s.settings, d)) out.hol += n;
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
export function monthLimit(s: AppState, c: Cadre, ym: string, exclude?: string): MonthLimit {
  const cfg = dutyCfgOf(s.settings); const cnt = monthCount(s, c.id, ym, exclude); const { base, extra } = baseOf(s, c);
  const planned = plannedMonths(s); let carry = 0;
  if (cfg.carry) {
    const pm = shiftMonth(ym, -1);
    if (planned.has(pm)) { const prev = monthCount(s, c.id, pm); if (inPlan(s, c, pm, prev.roster)) carry = base - prev.done; }
  }
  const nextCarry = cfg.carry && planned.has(ym) && inPlan(s, c, ym, cnt.roster) ? base - cnt.done : 0;
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
export interface DutyCell { roster: { svc: CadreService | undefined; id: string; duty: CadreDuty }[]; seat: { label: string }[]; state?: PlanCell; noDuty: boolean }
export function personCells(s: AppState, c: Cadre, index: MonthIndex): DutyCell[] {
  const cfg = dutyCfgOf(s.settings); const m = dutyIndex(s).get(c.id); const cs = index.cells.get(c.id), nd = index.noDuty.get(c.id);
  return index.days.map((d, i) => {
    const x = m?.get(d.d);
    return { roster: (x?.roster || []).map(r => ({ svc: serviceOf(cfg, r.svc)?.svc, id: r.svc, duty: r })), seat: (x?.seat || []).map(y => ({ label: y.label })), ...(cs?.[i] ? { state: cs[i] } : {}), noDuty: !!nd?.[i] };
  });
}
export const cellCode = (x: DutyCell): string => (x.roster.length ? x.roster.map(r => r.svc?.short || '?').join('/') + (x.seat.length ? '/Σ' : '') : x.seat.length ? 'Σ' : x.state?.code || '');

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
