// Άδειες και απαλλαγές στελεχών (Michael, 17/11, πρόταση λοχία): πόσες μέρες άδειας μένουν σε κάθε στέλεχος τη χρονιά (Κανονική 30,
// Άδεια μικρής διάρκειας 10, και ό,τι άλλο όρισες: Γονική…) και η Καρτέλα απαλλαγών (κάθε υπηρεσία δίνει μία, κάθε «Απαλλαγή»
// στις καταστάσεις αφαιρεί μία). Καθαρή λογική: ίδια για την οθόνη, τη λίστα και το Excel. Τίποτα εδώ δεν μπλοκάρει· οι οθόνες
// προειδοποιούν. Δεν αγγίζει τον υπολογισμό υπηρεσιών και δικαιοσύνης των στρατιωτών.
import { addDays, dmy, type ISODate } from './dates';
import { rankTxt, cadreAbsOf, itemKey } from './ranks';
import { KIND_NAME, type AppState, type Cadre, type CadreAbs, type CadreGrant, type CadreLeaveCfg, type LeaveQuota, type Settings } from './domain';
import { dutyStats, isHol, postBy } from './rules';
import { orderedCadre } from './cadre';
import { upper } from './text';
import type { RosterSheet } from './rosterLists';

// Οι προεπιλογές (ό,τι λείπει από τις Ρυθμίσεις): 30 + 10 μέρες τη χρονιά για όλους, ημερολογιακές μέρες, μία απαλλαγή ανά υπηρεσία
export const DEFAULT_QUOTAS: LeaveQuota[] = [
  { id: 'ka', name: 'Κανονική άδεια', perYear: 30, kinds: ['ka'], all: true },
  { id: 'amd', name: 'Άδεια μικρής διάρκειας', perYear: 10, kinds: ['amd'], all: true }
];
export const DEFAULT_LEAVE: CadreLeaveCfg = { quotas: DEFAULT_QUOTAS, count: 'calendar', apalPerDuty: 1, apalHolExtra: 0, apalExpire: 'never' };
export const APAL = 'apal';   // το «είδος» των αρχικών απαλλαγών στα CadreGrant.quota
const cfgIdx = new WeakMap<object, CadreLeaveCfg>();
const NO_CFG = {};
export function leaveCfgOf(st: Pick<Settings, 'cadreLeave'>): CadreLeaveCfg {
  const raw = st.cadreLeave; if (!raw) return DEFAULT_LEAVE;
  let c = cfgIdx.get(raw); if (c) return c;
  const n = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  c = {
    quotas: Array.isArray(raw.quotas) ? raw.quotas.filter(q => q && q.id).map(q => ({ id: String(q.id), name: String(q.name || q.id), perYear: n(q.perYear, 0), kinds: Array.isArray(q.kinds) ? q.kinds : [], all: q.all !== false })) : DEFAULT_QUOTAS,
    count: raw.count === 'working' ? 'working' : 'calendar', apalPerDuty: n(raw.apalPerDuty, 1), apalHolExtra: n(raw.apalHolExtra, 0), apalExpire: raw.apalExpire === 'year' ? 'year' : 'never'
  };
  cfgIdx.set(raw, c); void NO_CFG;
  return c;
}
export const newQuotaId = (quotas: LeaveQuota[]): string => { let i = quotas.length + 1; while (quotas.some(q => q.id === 'q' + i)) i++; return 'q' + i; };

// ---- ευρετήρια (ανά πίνακα, ξαναχτίζονται μόνο όταν αλλάξει ο πίνακας) ----
const absIdx = new WeakMap<CadreAbs[], Map<string, CadreAbs[]>>();
const NONE: CadreAbs[] = [];
function absOf(s: Pick<AppState, 'cadreAbs'>, cid: string): CadreAbs[] {
  const all = s.cadreAbs || NONE; let m = absIdx.get(all);
  if (!m) { m = new Map(); for (const a of all) { const l = m.get(a.cid); if (l) l.push(a); else m.set(a.cid, [a]); } absIdx.set(all, m); }
  return m.get(cid) || NONE;
}
const grantIdx = new WeakMap<CadreGrant[], Map<string, CadreGrant[]>>();
const NO_GRANTS: CadreGrant[] = [];
function grantsOf(s: Pick<AppState, 'cadreGrants'>, cid: string): CadreGrant[] {
  const all = s.cadreGrants || NO_GRANTS; let m = grantIdx.get(all);
  if (!m) { m = new Map(); for (const g of all) { const l = m.get(g.cid); if (l) l.push(g); else m.set(g.cid, [g]); } grantIdx.set(all, m); }
  return m.get(cid) || NO_GRANTS;
}

// ---- άδειες ----
// η κατάσταση (abs) καταναλώνει το είδος q; με τον κωδικό της κατάστασης, ή το όνομα (δικές σου καταστάσεις)
export function usesQuota(q: LeaveQuota, kind: string, lists: Settings['lists']): boolean {
  if (q.kinds.includes(kind)) return true;
  const k = cadreAbsOf(kind, lists); if (!k) return false;
  return q.kinds.includes(k[0]) || q.kinds.some(x => itemKey(x) === itemKey(k[1]));
}
// μέρες μιας κατάστασης μέσα στη χρονιά: ημερολογιακές ή, με 'working', όσες δεν είναι ΣΚ/αργία
export function daysInYear(a: Pick<CadreAbs, 'from' | 'to'>, year: number, count: CadreLeaveCfg['count'], settings: Settings): number {
  const lo = a.from > year + '-01-01' ? a.from : year + '-01-01', hi = a.to < year + '-12-31' ? a.to : year + '-12-31';
  if (hi < lo) return 0;
  let n = 0;
  if (count === 'calendar') { for (let d = lo; d <= hi; d = addDays(d, 1)) n++; return n; }
  for (let d = lo; d <= hi; d = addDays(d, 1)) if (!isHol(settings, d)) n++;
  return n;
}
export interface QuotaBal { quota: LeaveQuota; base: number; extra: number; carry: number; entitled: number; used: number; left: number }
// Ποια είδη ισχύουν για το στέλεχος τη χρονιά (όσα είναι για όλους, και όσα του δόθηκαν) και πόσες μέρες μένουν. extraAbs: υποθετικές καταστάσεις (προειδοποίηση)
export function quotaBalances(s: Pick<AppState, 'cadreAbs' | 'cadreGrants' | 'settings'>, cid: string, year: number, abs: CadreAbs[] = absOf(s, cid)): QuotaBal[] {
  const cfg = leaveCfgOf(s.settings); const gr = grantsOf(s, cid).filter(g => g.year === year && g.quota !== APAL);
  const out: QuotaBal[] = [];
  for (const q of cfg.quotas) {
    const mine = gr.filter(g => g.quota === q.id);
    if (!q.all && !mine.length) continue;
    const base = q.all ? q.perYear : 0;
    const extra = mine.filter(g => g.kind === 'extra').reduce((a, g) => a + g.days, 0), carry = mine.filter(g => g.kind === 'carry').reduce((a, g) => a + g.days, 0);
    let used = 0; for (const a of abs) if (usesQuota(q, a.kind, s.settings.lists)) used += daysInYear(a, year, cfg.count, s.settings);
    const entitled = base + extra + carry;
    out.push({ quota: q, base, extra, carry, entitled, used, left: entitled - used });
  }
  return out;
}
// Προειδοποίηση για μια κατάσταση που γράφεται (ή αλλάζει): ποια είδη θα πάνε κάτω από 0 (δεν μπλοκάρει). Οι παλιές που πέφτουν στις ίδιες μέρες φεύγουν
export function leaveOverdraft(s: Pick<AppState, 'cadreAbs' | 'cadreGrants' | 'settings'>, cid: string, cand: { id?: string; kind: string; from: ISODate; to: ISODate }): { name: string; year: number; left: number }[] {
  if (cand.to < cand.from) return [];
  const rest = absOf(s, cid).filter(a => a.id !== cand.id && !(a.from <= cand.to && cand.from <= a.to));
  const abs: CadreAbs[] = [...rest, { id: '', cid, kind: cand.kind, from: cand.from, to: cand.to }];
  const out: { name: string; year: number; left: number }[] = [];
  for (let y = +cand.from.slice(0, 4); y <= +cand.to.slice(0, 4); y++)
    for (const b of quotaBalances(s, cid, y, abs)) if (b.left < 0 && usesQuota(b.quota, cand.kind, s.settings.lists)) out.push({ name: b.quota.name, year: y, left: b.left });
  return out;
}

// ---- απαλλαγές ----
export interface ApalRow { d: ISODate; what: string; gain: number; take: number; left: number; kind: 'duty' | 'apal' | 'start' | 'reset'; id?: string }
// Όλη η καρτέλα του στελέχους με ημερομηνίες: +apalPerDuty (και apalHolExtra σε ΣΚ/αργία) για κάθε υπηρεσία του, −1 για κάθε μέρα με
// κατάσταση «Απαλλαγή», και το αρχικό υπόλοιπο. today: οι υπηρεσίες που δεν έγιναν ακόμα δεν δίνουν απαλλαγή (οι απαλλαγές που πήρε μετρούν πάντα)
export function apalLedger(s: AppState, c: Cadre, today?: ISODate): ApalRow[] {
  const cfg = leaveCfgOf(s.settings); const lists = s.settings.lists;
  type Ev = { d: ISODate; ord: number; what: string; gain: number; take: number; kind: ApalRow['kind']; id?: string };
  const ev: Ev[] = [];
  if (c.pid != null && cfg.apalPerDuty + cfg.apalHolExtra > 0) {
    for (const e of dutyStats(s).get(c.pid)?.log || NONE_LOG) {
      if (today && e.d > today) continue;
      const g = cfg.apalPerDuty + (e.h ? cfg.apalHolExtra : 0); if (g <= 0) continue;
      const post = e.k ? postBy(s, e.k) : undefined;
      ev.push({ d: e.d, ord: 1, what: 'Υπηρεσία ' + (post?.label || (KIND_NAME as Record<string, string>)[e.kind] || e.kind) + (e.h ? ' (ΣΚ/αργία)' : ''), gain: g, take: 0, kind: 'duty' });
    }
  }
  // υπηρεσίες του προγράμματος στελεχών (cadreDuty.ts): δίνουν απαλλαγή όπως οι υπηρεσίες στις θέσεις, με το όνομα της υπηρεσίας
  if (cfg.apalPerDuty + cfg.apalHolExtra > 0 && s.cadreDuties?.length) {
    const names = new Map<string, string>(); for (const g of s.settings.cadreDuty?.groups || []) for (const v of g.services || []) names.set(v.id, v.name);   // χωρίς import του cadreDuty.ts (κυκλική εξάρτηση)
    for (const x of s.cadreDuties) {
      if (x.cid !== c.id || (today && x.date > today)) continue;
      const h = isHol(s.settings, x.date); const g = cfg.apalPerDuty + (h ? cfg.apalHolExtra : 0); if (g <= 0) continue;
      ev.push({ d: x.date, ord: 1, what: 'Υπηρεσία ' + (names.get(x.svc) || x.svc) + (h ? ' (ΣΚ/αργία)' : ''), gain: g, take: 0, kind: 'duty' });
    }
  }
  for (const a of absOf(s, c.id)) {
    const k = cadreAbsOf(a.kind, lists); if (a.kind !== APAL && k?.[0] !== APAL) continue;
    for (let d = a.from, n = 0; d <= a.to && n < 400; d = addDays(d, 1), n++) ev.push({ d, ord: 2, what: 'Απαλλαγή (κατάσταση στα Στελέχη)' + (a.note ? ' · ' + a.note : ''), gain: 0, take: 1, kind: 'apal', id: a.id });
  }
  for (const g of grantsOf(s, c.id)) if (g.quota === APAL) ev.push({ d: g.year + '-01-01', ord: 0, what: 'Αρχικό υπόλοιπο' + (g.note ? ' · ' + g.note : ''), gain: Math.max(0, g.days), take: Math.max(0, -g.days), kind: 'start', id: g.id });
  ev.sort((a, b) => a.d.localeCompare(b.d) || a.ord - b.ord);
  const rows: ApalRow[] = []; let bal = 0; let year = ev.length ? +ev[0].d.slice(0, 4) : 0;
  for (const e of ev) {
    const y = +e.d.slice(0, 4);
    // με λήξη στο τέλος της χρονιάς: ό,τι δεν πήρε σβήνεται την 1/1 κάθε χρονιάς
    if (cfg.apalExpire === 'year' && y > year) { if (bal > 0) { rows.push({ d: y + '-01-01', what: 'Λήγουν οι απαλλαγές του ' + year, gain: 0, take: bal, left: 0, kind: 'reset' }); } bal = 0; }
    year = y; bal += e.gain - e.take;
    rows.push({ d: e.d, what: e.what, gain: e.gain, take: e.take, left: bal, kind: e.kind, ...(e.id ? { id: e.id } : {}) });
  }
  return rows;
}
const NONE_LOG: { d: ISODate; k: string; h: boolean; kind: any }[] = [];
export interface ApalCard { opening: number; rows: ApalRow[]; left: number; earned: number; taken: number }
// η καρτέλα μιας χρονιάς: υπόλοιπο στην αρχή της, οι γραμμές της και το υπόλοιπο στο τέλος της. Με λήξη στο τέλος της χρονιάς (expire 'year')
// ξεκινά από 0 και δεν δείχνει τη γραμμή λήξης της προηγούμενης· χρονιά χωρίς γραμμές μένει στο 0
export function apalCard(rows: ApalRow[], year: number, expire: CadreLeaveCfg['apalExpire'] = 'never'): ApalCard {
  const y = String(year); let opening = 0; const mine: ApalRow[] = []; let left = 0;
  for (const r of rows) {
    const ry = r.d.slice(0, 4);
    if (ry < y) { if (expire === 'never') { opening = r.left; left = r.left; } }
    else if (ry === y && !(expire === 'year' && r.kind === 'reset')) { mine.push(r); left = r.left; }
  }
  return { opening, rows: mine, left, earned: mine.reduce((a, r) => a + r.gain, 0), taken: mine.reduce((a, r) => a + r.take, 0) };
}
export const apalLeft = (s: AppState, c: Cadre, year: number, today?: ISODate): number => apalCard(apalLedger(s, c, today), year, leaveCfgOf(s.settings).apalExpire).left;

// ---- σύνοψη για τη λίστα και το Excel ----
export interface CadreSummary { cid: string; quotas: QuotaBal[]; leaveLeft: number; leaveEntitled: number; apal: number }
export function cadreSummary(s: AppState, c: Cadre, year: number, today?: ISODate): CadreSummary {
  const quotas = quotaBalances(s, c.id, year);
  return { cid: c.id, quotas, leaveLeft: quotas.reduce((a, b) => a + b.left, 0), leaveEntitled: quotas.reduce((a, b) => a + b.entitled, 0), apal: apalLeft(s, c, year, today) };
}
export function summaries(s: AppState, year: number, today?: ISODate): Map<string, CadreSummary> {
  return new Map((s.cadreList || []).map(c => [c.id, cadreSummary(s, c, year, today)]));
}

// ---- Excel «ΑΔΕΙΕΣ-ΑΠΑΛΛΑΓΕΣ ΣΤΕΛΕΧΩΝ»: νέο αρχείο, χωριστό από το ΣΤΕΛΕΧΗ.xlsx. Κεφαλαία τα βάζει το excel.ts ----
export const LEAVE_SHEET_NAMES = { all: 'ΥΠΟΛΟΙΠΑ', apal: 'ΚΑΡΤΕΛΑ ΑΠΑΛΛΑΓΩΝ', one: 'ΑΔΕΙΕΣ ΣΤΕΛΕΧΟΥΣ' };
export function leaveSheets(s: AppState, year: number, today: ISODate, cid?: string): RosterSheet[] {
  const cfg = leaveCfgOf(s.settings); const act = orderedCadre(s.cadreList || []).filter(c => c.active);
  const sums = new Map(act.map(c => [c.id, cadreSummary(s, c, year, today)]));
  const qs = cfg.quotas.filter(q => q.all || act.some(c => sums.get(c.id)!.quotas.some(b => b.quota.id === q.id)));
  const up = upper;
  const head = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', ...qs.flatMap((q): string[] => [up(q.name) + ': ΔΙΚΑΙΟΥΤΑΙ', up(q.name) + ': ΕΧΕΙ ΠΑΡΕΙ', up(q.name) + ': ΜΕΝΟΥΝ']), 'ΑΠΑΛΛΑΓΕΣ: ΜΕΝΟΥΝ'];
  const rows: (string | number)[][] = act.map((c, i) => {
    const sm = sums.get(c.id)!;
    return [i + 1, rankTxt(c), c.spec || '', c.last, c.first, ...qs.flatMap((q): (string | number)[] => { const b = sm.quotas.find(x => x.quota.id === q.id); return b ? [b.entitled, b.used, b.left] : ['', '', '']; }), sm.apal];
  });
  const out: RosterSheet[] = [{ name: LEAVE_SHEET_NAMES.all, title: 'ΑΔΕΙΕΣ ΚΑΙ ΑΠΑΛΛΑΓΕΣ ΣΤΕΛΕΧΩΝ ' + year, head, rows }];
  const c = cid ? (s.cadreList || []).find(x => x.id === cid) : undefined;
  if (c) {
    const who = [rankTxt(c), c.last, c.first].filter(Boolean).join(' ');
    const card = apalCard(apalLedger(s, c, today), year, cfg.apalExpire);
    out.push({ name: LEAVE_SHEET_NAMES.one, title: 'ΑΔΕΙΕΣ ' + year + ' · ' + who, head: ['ΕΙΔΟΣ', 'ΔΙΚΑΙΟΥΤΑΙ', 'ΕΧΕΙ ΠΑΡΕΙ', 'ΜΕΝΟΥΝ'], rows: quotaBalances(s, c.id, year).map(b => [b.quota.name, b.entitled, b.used, b.left]) });
    const lines: (string | number)[][] = [];
    if (card.opening) lines.push(['', 'ΥΠΟΛΟΙΠΟ ΑΠΟ ΠΕΡΣΙ', '', '', card.opening]);
    for (const r of card.rows) lines.push([dmy(r.d), r.what, r.gain || '', r.take || '', r.left]);
    out.push({ name: LEAVE_SHEET_NAMES.apal, title: 'ΚΑΡΤΕΛΑ ΑΠΑΛΛΑΓΩΝ ' + year + ' · ' + who, head: ['ΜΕΡΑ', 'ΤΙ ΕΓΙΝΕ', 'ΚΕΡΔΙΣΕ', 'ΠΗΡΕ', 'ΜΕΝΟΥΝ'], rows: lines });
  }
  return out;
}
