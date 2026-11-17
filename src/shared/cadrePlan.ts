// Πρόγραμμα αδειών στελεχών (Michael, 17/11, πρόταση λοχία): πλέγμα στελέχη × μέρες του μήνα με την κατάσταση κάθε μέρας, και
// «Δεν θέλει υπηρεσία» (CadreNoDuty: ΟΧΙ κατάσταση, δεν μπαίνει σε ΗΚΑΙ, Δύναμη, ΣΤΕΛΕΧΗ.xlsx). Καθαρή λογική: ίδια για την οθόνη
// και το Excel. Οι καταστάσεις γράφονται ως συνηθισμένα CadreAbs (εντολή addCadreAbs), άρα η ΗΚΑΙ τις βλέπει όπως πάντα.
// Τίποτα εδώ δεν μπλοκάρει· οι οθόνες προειδοποιούν. Δεν αγγίζει τον υπολογισμό υπηρεσιών των στρατιωτών.
import { MONTHS, addDays, dmy, weekday, type ISODate } from './dates';
import { cadreAbsOf, hkRowsOf, rankTxt } from './ranks';
import type { AppState, Cadre, CadreAbs, CadreNoDuty, Settings } from './domain';
import { holOf } from './rules';
import { orderedCadre } from './cadre';
import { leaveCfgOf, quotaBalances, usesQuota, type QuotaBal } from './cadreBalance';
import { upper } from './text';

// ---- κωδικοί και χρώματα ----
// οικογένεια: ΚΑ (μπλε), ΑΜΔ (πράσινο), άλλο είδος άδειας με υπόλοιπο (τιρκουάζ), απαλλαγή (πορτοκαλί), οτιδήποτε άλλο (ουδέτερο)
export type PlanFam = 'ka' | 'amd' | 'leave' | 'apal' | 'other';
export interface PlanCode { code: string; fam: PlanFam; name: string }
// σύντομος κωδικός ανά κωδικό κατάστασης στελέχους (CADRE_ABS)
const SHORT: Record<string, string> = {
  yp: 'ΥΠ', ey: 'ΕΥ', tim: 'ΤΙΜ', os: 'Ο/Σ', mag: 'ΜΑΓ', sid: 'ΣΙΔ', kin: 'ΚΙΝ', ka: 'ΚΑ', amd: 'ΑΜΔ', an: 'ΑΝ', eid: 'ΕΙΔ', nos: 'ΝΟΣ',
  prat: 'ΠΡΑΤ', adik: 'ΑΔΙΚ', fp: 'ΦΠ', fyl: 'ΦΥΛ', apal: 'ΑΠ', ekp: 'ΕΚΠ', allh: 'ΑΠΟΣ', other: 'ΑΛΛ'
};
// σύντομη μορφή δικού σου ονόματος: μία λέξη → τα 3 πρώτα γράμματα, περισσότερες → τα αρχικά (ως 3)
export function shortOf(name: string): string {
  const w = upper(name).replace(/[^A-ZΑ-Ω0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return w.length === 1 ? w[0].slice(0, 3) : w.slice(0, 3).map(x => x[0]).join('');
}
export function planCode(kind: string, settings: Pick<Settings, 'lists' | 'cadreLeave'>): PlanCode {
  const k = cadreAbsOf(kind, settings.lists); const base = k?.[0] || '';
  const name = k?.[1] || kind;
  const code = SHORT[base] || shortOf(name);
  const fam: PlanFam = base === 'ka' ? 'ka' : base === 'amd' ? 'amd' : base === 'apal' ? 'apal'
    : leaveCfgOf(settings).quotas.some(q => usesQuota(q, kind, settings.lists)) ? 'leave' : 'other';
  return { code, fam, name };
}
// κωδικός ενός είδους άδειας (Κανονική → ΚΑ, ΑΜΔ → ΑΜΔ, δικό σου → σύντομο όνομα)
export const quotaShort = (q: QuotaBal['quota']): string => SHORT[q.kinds[0]] || shortOf(q.name);

// ---- ημέρες του μήνα ----
export interface PlanDay { d: ISODate; n: number; dow: string; we: boolean; hol?: string }
const DOW_INI = ['Κ', 'Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ'];   // Κυρ … Σαβ (σειρά του weekday())
export const monthOf = (d: ISODate) => d.slice(0, 7);
export const shiftMonth = (ym: string, n: number): string => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'); };
export const monthLabel = (ym: string) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
export const daysOfMonth = (ym: string): number => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
// we: Σάββατο/Κυριακή· hol: όνομα αργίας (επίσημες και δικές σου από τις Ρυθμίσεις), ακόμα και αν πέφτει σε ΣΚ
export function planDays(settings: Settings, ym: string): PlanDay[] {
  return Array.from({ length: daysOfMonth(ym) }, (_, i) => {
    const d = ym + '-' + String(i + 1).padStart(2, '0'); const w = weekday(d); const h = holOf(settings, d);
    return { d, n: i + 1, dow: DOW_INI[w], we: w === 0 || w === 6, ...(h ? { hol: h } : {}) };
  });
}

// ---- ευρετήριο του μήνα: μία φορά ανά μήνα, όχι cadreAbsOn σε κάθε κελί ----
export interface PlanCell extends PlanCode { id: string; kind: string; from: ISODate; to: ISODate; note?: string }
export interface MonthIndex {
  ym: string; days: PlanDay[];
  cells: Map<string, (PlanCell | undefined)[]>;      // cid → κατάσταση ανά μέρα (θέση n-1)· ίδιο αποτέλεσμα με το cadreAbsOn (νικά η πρώτη)
  noDuty: Map<string, (CadreNoDuty | undefined)[]>;  // cid → «Δεν θέλει υπηρεσία» ανά μέρα
}
export function monthIndex(s: Pick<AppState, 'cadreAbs' | 'cadreNoDuty' | 'settings'>, ym: string): MonthIndex {
  const days = planDays(s.settings, ym); const N = days.length; const lo = days[0].d, hi = days[N - 1].d;
  const cells = new Map<string, (PlanCell | undefined)[]>(); const noDuty = new Map<string, (CadreNoDuty | undefined)[]>();
  const codes = new Map<string, PlanCode>();
  for (const a of s.cadreAbs || []) {
    if (a.to < lo || a.from > hi) continue;
    let arr = cells.get(a.cid); if (!arr) { arr = new Array(N); cells.set(a.cid, arr); }
    let pc = codes.get(a.kind); if (!pc) { pc = planCode(a.kind, s.settings); codes.set(a.kind, pc); }
    const i0 = a.from < lo ? 0 : +a.from.slice(8, 10) - 1, i1 = a.to > hi ? N - 1 : +a.to.slice(8, 10) - 1;
    for (let i = i0; i <= i1; i++) if (!arr[i]) arr[i] = { ...pc, id: a.id, kind: a.kind, from: a.from, to: a.to, ...(a.note ? { note: a.note } : {}) };
  }
  for (const x of s.cadreNoDuty || []) {
    if (x.to < lo || x.from > hi) continue;
    let arr = noDuty.get(x.cid); if (!arr) { arr = new Array(N); noDuty.set(x.cid, arr); }
    const i0 = x.from < lo ? 0 : +x.from.slice(8, 10) - 1, i1 = x.to > hi ? N - 1 : +x.to.slice(8, 10) - 1;
    for (let i = i0; i <= i1; i++) if (!arr[i]) arr[i] = x;
  }
  return { ym, days, cells, noDuty };
}

// ---- φίλτρα γραμμών (η φάση 3 προσθέτει εδώ τις ομάδες υπηρεσιών στελεχών) ----
export interface PlanFilterCtx { s: Pick<AppState, 'settings'>; index: MonthIndex }
export interface PlanFilter { id: string; label: string; match: (c: Cadre, x: PlanFilterCtx) => boolean }
const hasLeave = (c: Cadre, x: PlanFilterCtx) => (x.index.cells.get(c.id) || []).some(v => v && (v.fam === 'ka' || v.fam === 'amd' || v.fam === 'leave'));
export function planFilters(): PlanFilter[] {
  return [
    { id: 'all', label: 'Όλοι', match: () => true },
    { id: 'off', label: 'Αξιωματικοί', match: (c, x) => hkRowsOf(x.s.settings.lists).off.includes(c.hk) },
    { id: 'nco', label: 'Υπαξιωματικοί', match: (c, x) => hkRowsOf(x.s.settings.lists).nco.includes(c.hk) },
    { id: 'leave', label: 'Με άδεια τον μήνα', match: hasLeave }
  ];
}
// οι γραμμές του πλέγματος: ενεργά στελέχη με τη σειρά τους, μετά το φίλτρο
export function planRows(s: Pick<AppState, 'cadreList' | 'settings'>, index: MonthIndex, filter: string, filters: PlanFilter[] = planFilters()): Cadre[] {
  const f = filters.find(x => x.id === filter) || filters[0]; const ctx: PlanFilterCtx = { s, index };
  return orderedCadre(s.cadreList || []).filter(c => c.active && f.match(c, ctx));
}

// ---- υπόλοιπο αδειών της χρονιάς, συμπαγές («ΚΑ 10 · ΑΜΔ 3») ----
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
export function leaveLeftText(s: Pick<AppState, 'cadreAbs' | 'cadreGrants' | 'settings'>, cid: string, year: number): { text: string; neg: boolean; tip: string } {
  const b = quotaBalances(s, cid, year);
  return { text: b.map(x => quotaShort(x.quota) + ' ' + num(x.left)).join(' · '), neg: b.some(x => x.left < 0), tip: b.map(x => x.quota.name + ': μένουν ' + num(x.left) + ' από ' + num(x.entitled)).join('\n') };
}

// ---- γράψιμο διαστήματος ----
// Κόβει από τη λίστα τις εγγραφές (που περνούν από pick) στις μέρες from–to: κρατά ό,τι είναι έξω, χωρίζει ό,τι περνά και από τις δύο πλευρές
// (το αριστερό κομμάτι κρατά το id, το δεξί παίρνει νέο· αν μένει μόνο ένα κομμάτι, κρατά το id)
export function cutRange<T extends { id: string; from: ISODate; to: ISODate }>(list: T[], pick: (x: T) => boolean, from: ISODate, to: ISODate, newId: () => string): T[] {
  const out: T[] = [];
  for (const a of list) {
    if (!pick(a) || a.to < from || a.from > to) { out.push(a); continue; }
    const parts: T[] = [];
    if (a.from < from) parts.push({ ...a, to: addDays(from, -1) });
    if (a.to > to) parts.push({ ...a, id: parts.length ? newId() : a.id, from: addDays(to, 1) });
    out.push(...parts);
  }
  return out;
}
// «Δεν θέλει υπηρεσία» για from–to: κόβει ό,τι υπάρχει στις ίδιες μέρες και ενώνει τη νέα με γειτονικές/ίδιες εγγραφές με την ίδια παρατήρηση
export function setNoDuty(list: CadreNoDuty[], cid: string, from: ISODate, to: ISODate, note: string | undefined, newId: () => string): CadreNoDuty[] {
  const n = note?.trim() || undefined;
  let out = cutRange(list, x => x.cid === cid, from, to, newId);
  let lo = from, hi = to; let keepId: string | undefined;
  // ενώνεται με γειτονικές εγγραφές της ίδιας παρατήρησης (5–9 και 10–11 γίνονται 5–11)
  for (let again = true; again;) {
    again = false;
    const m = out.find(x => x.cid === cid && (x.note?.trim() || undefined) === n && (x.to === addDays(lo, -1) || x.from === addDays(hi, 1)));
    if (m) { lo = m.from < lo ? m.from : lo; hi = m.to > hi ? m.to : hi; keepId = keepId || m.id; out = out.filter(x => x !== m); again = true; }
  }
  return [...out, { id: keepId || newId(), cid, from: lo, to: hi, ...(n ? { note: n } : {}) }];
}
// «Σβήσε»: οι καταστάσεις και οι μέρες «δεν θέλει υπηρεσία» του στελέχους στο διάστημα (ό,τι περνά έξω από αυτό μένει)
export function clearRange(s: Pick<AppState, 'cadreAbs' | 'cadreNoDuty'>, cid: string, from: ISODate, to: ISODate, newId: () => string): { cadreAbs: CadreAbs[]; cadreNoDuty: CadreNoDuty[] | undefined; changedAbs: boolean; changedNoDuty: boolean } {
  const abs = cutRange(s.cadreAbs || [], a => a.cid === cid, from, to, newId);
  const nd = s.cadreNoDuty ? cutRange(s.cadreNoDuty, a => a.cid === cid, from, to, newId) : undefined;
  const same = (a: { id: string; from: string; to: string }[], b: { id: string; from: string; to: string }[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return { cadreAbs: abs, cadreNoDuty: nd, changedAbs: !same(abs, s.cadreAbs || []), changedNoDuty: !!nd && !same(nd, s.cadreNoDuty!) };
}
export const noDutyOf = (s: Pick<AppState, 'cadreNoDuty'>, cid: string): CadreNoDuty[] => (s.cadreNoDuty || []).filter(x => x.cid === cid).sort((a, b) => a.from.localeCompare(b.from));
export const rangeTxt = (a: { from: ISODate; to: ISODate }) => (a.from === a.to ? dmy(a.from) : dmy(a.from) + '–' + dmy(a.to));

// ---- Excel «ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ»: νέο αρχείο, ένα φύλλο για τον μήνα. Όλα με κεφαλαία ----
export const PLAN_X = 'X';   // «Δεν θέλει υπηρεσία» (λατινικό Χ: υπάρχει σε κάθε γραμματοσειρά)
export interface PlanSheet {
  name: string; title: string; days: PlanDay[];
  rows: { rank: string; name: string; cells: string[]; left: string }[];
  legend: { code: string; name: string }[];       // όσα εμφανίζονται στον μήνα
  shade: ('we' | 'hol' | '')[];                    // ανά μέρα: ΣΚ, αργία (νικά το ΣΚ) ή τίποτα
}
export function planSheet(s: AppState, ym: string, filter = 'all'): PlanSheet {
  const index = monthIndex(s, ym); const year = +ym.slice(0, 4);
  const rows = planRows(s, index, filter).map(c => {
    const cs = index.cells.get(c.id) || [], nd = index.noDuty.get(c.id) || [];
    const cells = index.days.map((_, i) => upper((cs[i]?.code || '') + (nd[i] ? (cs[i] ? '/' : '') + PLAN_X : '')));
    return { rank: upper(rankTxt(c)), name: upper([c.last, c.first].filter(Boolean).join(' ')), cells, left: upper(leaveLeftText(s, c.id, year).text) };
  });
  // υπόμνημα: όσα εμφανίζονται στον μήνα, με σειρά ΚΑ, ΑΜΔ, άλλες άδειες, απαλλαγή, υπόλοιπα
  const seen = new Map<string, { name: string; fam: PlanFam }>(); let anyNo = false;
  for (const c of rows.length ? planRows(s, index, filter) : []) {
    (index.cells.get(c.id) || []).forEach(v => { if (v && !seen.has(v.code)) seen.set(v.code, { name: upper(v.name), fam: v.fam }); });
    if ((index.noDuty.get(c.id) || []).some(Boolean)) anyNo = true;
  }
  const FAM: PlanFam[] = ['ka', 'amd', 'leave', 'apal', 'other'];
  const legend = [...seen].sort((a, b) => FAM.indexOf(a[1].fam) - FAM.indexOf(b[1].fam) || a[0].localeCompare(b[0])).map(([code, v]) => ({ code: upper(code), name: v.name }));
  if (anyNo) legend.push({ code: PLAN_X, name: 'ΔΕΝ ΘΕΛΕΙ ΥΠΗΡΕΣΙΑ' });
  return {
    name: 'ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ', title: upper('ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ ΣΤΕΛΕΧΩΝ ' + MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4)), days: index.days, rows, legend,
    shade: index.days.map(d => (d.hol ? 'hol' : d.we ? 'we' : ''))
  };
}
