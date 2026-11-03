// Στελέχη σε δικό τους Excel (Michael, 3/11): τα στοιχεία τους (φύλλο ΣΤΕΛΕΧΗ) και οι καταστάσεις τους (φύλλο ΚΑΤΑΣΤΑΣΕΙΣ) στο
// ίδιο αρχείο, χωριστά από το Δυναμολόγιο των οπλιτών. Εγγραφή και ανάγνωση με τους ίδιους κανόνες που έχουν τα άλλα Αρχεία Excel:
// η εφαρμογή γράφει στο κελί μόνο ό,τι άλλαξε εκείνη από την τελευταία ανάγνωση/εγγραφή (base), και διαβάζει ό,τι άλλαξε το Excel.
// Ποιο στέλεχος είναι ποιο: πρώτα ΑΜ, μετά επώνυμο και όνομα. Όλα καθαρές συναρτήσεις (τις τρέχουν και το UI και ο main).
import type { ISODate } from './dates';
import { normGreek, upper } from './text';
import type { AppState, Cadre, CadreAbs } from './domain';
import { cadreAbsOf, guessHk, hkCadreRows, rankTxt } from './ranks';
import { hkRowLabel, hkRowNames } from './unit';
import { orderedCadre, cadreStatusOf, colShort } from './cadre';
import { PKEYS, normPersonal, personalFromCell, type PKey } from './personal';
import { cellText, num, noRoomTxt, parseDate, sideBy, tableRows, type SourceBinding, type SourcePlan, type WVal } from './sources';
import type { CellValue, RawSheet } from './roster';

// Στήλες που μπαίνουν στο τέλος του πίνακα μόνο όταν κάποιο στέλεχος έχει τιμή (όπως οι ώρες στις άδειες)
export const CADRE_OPT = ['monthMax', 'weapon', 'wtype', 'rack', 'wpos', 'iban', 'amka', 'afm'] as const;
export const CADRE_KEYS = ['rank', 'origin', 'spec', 'last', 'first', 'am', 'phone', 'role', 'hk', 'active', ...CADRE_OPT] as const;
type Meta = { keys?: string[]; base?: Record<string, string> };
export type CadrePlan = SourcePlan & { base: Record<string, string> };
type Cfg = Pick<AppState, 'settings'>;
const LABEL: Record<string, string> = { rank: 'βαθμός', origin: 'προέλευση', spec: 'Ο/Σ', last: 'επώνυμο', first: 'όνομα', am: 'ΑΜ', phone: 'τηλέφωνο', role: 'θέση', hk: 'γραμμή ΗΚΑΙ', active: 'σε δύναμη', monthMax: 'όριο υπηρεσιών', weapon: 'όπλο', wtype: 'τύπος όπλου', rack: 'οπλοβάστης', wpos: 'θέση όπλου', iban: 'IBAN', amka: 'ΑΜΚΑ', afm: 'ΑΦΜ' };

// ------------------------------------------------------------------ τιμές
const sq = (t: string) => normGreek(t).replace(/\s+/g, '');
const YES = /^(ΝΑΙ|ΕΝΕΡΓΟΣ|ΕΝΕΡΓΗ|1|TRUE|YES|Ν)$/, NO = /^(ΟΧΙ|ΕΚΤΟΣ|ΕΚΤΟΣΔΥΝΑΜΗΣ|0|FALSE|NO|Ο)$/;
export const parseActive = (t: string): boolean | null => { const k = sq(t); return YES.test(k) ? true : NO.test(k) ? false : null; };
// Γραμμή ΗΚΑΙ από το κείμενο του κελιού: με το κλειδί, το όνομα στον τύπο της μονάδας ή το δικό σου όνομα
export function hkKeyOf(t: string, s: Cfg): string | null {
  const k = sq(t); if (!k) return null;
  for (const key of hkCadreRows(s.settings.lists)) if ([key, ...hkRowNames(key), hkRowLabel(key, s.settings)].some(n => sq(n) === k)) return key;
  return null;
}
// Η τιμή ενός πεδίου του στελέχους ως κείμενο (όπως θα φαινόταν στο Excel)
export function cadreStr(c: Cadre, k: string, s: Cfg, hasOrigin = true): string {
  switch (k) {
    case 'rank': return (hasOrigin ? c.rank : rankTxt(c)) || '';
    case 'hk': return hkRowLabel(c.hk, s.settings);
    case 'active': return c.active ? 'ΝΑΙ' : 'ΟΧΙ';
    case 'monthMax': return c.monthMax ? String(c.monthMax) : '';
    default: return String((c as unknown as Record<string, unknown>)[k] ?? '');
  }
}
// Για σύγκριση κελιού με εφαρμογή: ίδια τιμή ακόμα κι αν γράφεται αλλιώς (κεφαλαία, τόνοι, κενά, ΝΑΙ/1, IBAN με κενά)
export function cmpKey(k: string, t: string, s: Cfg): string {
  if (PKEYS.includes(k as PKey)) return normPersonal(k as PKey, t);
  if (k === 'active') { const a = parseActive(t); return a == null ? sq(t) : a ? 'ΝΑΙ' : 'ΟΧΙ'; }
  if (k === 'hk') return hkKeyOf(t, s) ?? sq(t);
  if (k === 'monthMax') { const n = Math.floor(Number(t.replace(',', '.'))); return n > 0 ? String(n) : ''; }
  return sq(t);
}
const cadreCell = (k: string, c: Cadre, s: Cfg, hasO: boolean): WVal => {
  const v = cadreStr(c, k, s, hasO); if (v === '') return null;
  if (k === 'am' || k === 'phone') return num(v);
  if (k === 'monthMax') return c.monthMax || null;
  return v;
};
const vals = (c: Cadre, s: Cfg, hasO: boolean): Record<string, string> => Object.fromEntries(CADRE_KEYS.map(k => [k, cadreStr(c, k, s, hasO)]));
const parse = (t?: string): Record<string, string> | null => { try { const o = t ? JSON.parse(t) : null; return o && typeof o === 'object' ? o : null; } catch { return null; } };
const nameOf = (c: { last: string; first: string; rank?: string; origin?: string }) => [rankTxt(c), c.last, c.first].filter(Boolean).join(' ');

// ------------------------------------------------------------------ ποιο στέλεχος είναι ποιο
interface Ident { id: string; last: string; first: string; am?: string }
type Found = { id: string | null; alts?: string[] };
const nk = (a: string, b: string) => normGreek(a).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(b).replace(/[^Α-ΩA-Z0-9]/g, '');
function cadreMatcher(list: Ident[]): (v: Record<string, CellValue>) => Found {
  const by = (f: (x: Ident) => string[]) => { const m = new Map<string, string[]>(); for (const x of list) for (const k of f(x)) if (k) m.set(k, [...(m.get(k) || []), x.id]); return m; };
  const byAm = by(x => [sq(x.am || '')]), byName = by(x => [nk(x.last, x.first), nk(x.first, x.last)]), byLast = by(x => [nk(x.last, '')]);
  return v => {
    const am = sq(cellText(v.am)); const a = am ? byAm.get(am) : undefined;
    if (a?.length === 1) return { id: a[0] };
    const last = cellText(v.last), first = v.first != null ? cellText(v.first) : '';
    if (!last) return { id: null };
    const l = first ? byName.get(nk(last, first)) || [] : byLast.get(nk(last, '')) || [];
    if (l.length === 1) return { id: l[0] };
    return l.length > 1 ? { id: null, alts: l } : { id: null };
  };
}
const identsOf = (list: Cadre[]): Ident[] => list.map(c => ({ id: c.id, last: c.last, first: c.first, am: c.am }));

// ------------------------------------------------------------------ εγγραφή: στοιχεία στελεχών
const clearRow = (plan: SourcePlan, sheet: RawSheet, scan: ReturnType<typeof tableRows>, b: SourceBinding, r: number) => {
  const row = sheet.rows[r] || [];
  for (let c = scan.width[0]; c <= scan.width[1]; c++) if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
};
// Νέες γραμμές: πρώτα οι ελεύθερες, μετά κάτω από τον πίνακα (όπως στα πόστα και τις δυνατότητες)
function addRows<T>(plan: SourcePlan, sheet: RawSheet, b: SourceBinding, scan: ReturnType<typeof tableRows>, free: number[], n0: number, items: T[], put: (r: number, x: T) => void, label: (x: T) => string): T[] {
  free.sort((a, c) => a - c);
  const rows = sheet.rows; let n = n0; let i = 0;
  const aa = (r: number) => { if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: ++n }); else n++; };
  for (; i < items.length && i < free.length; i++) { put(free[i], items[i]); aa(free[i]); }
  const rest = items.slice(i); const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after)) { plan.warn = [noRoomTxt(b.sheet, rest.map(label))]; plan.added = i; return items.slice(0, i); }
  if (rest.length) {
    const tpl = scan.records.length ? scan.records[scan.records.length - 1].r : scan.free.length ? scan.free[0] : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((x, j) => { const r = after + 1 + j; put(r, x); if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n }); });
  }
  plan.added = items.length; return items;
}
export function planCadresWrite(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadrePlan {
  const plan: CadrePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [], base: {} };
  const list = s.cadreList || []; const hasO = b.cols.origin != null; const byId = new Map(list.map(c => [c.id, c]));
  plan.base = Object.fromEntries(list.map(c => [c.id, JSON.stringify(vals(c, s, hasO))]));
  const scan = tableRows(sheet, b.header, b.cols); const match = cadreMatcher(identsOf(list));
  // όσα είχε δει το Excel και η εφαρμογή τα έσβησε: η γραμμή τους φεύγει
  const gone = (meta?.keys || []).filter(id => !byId.has(id)).map((id): Ident | null => { const o = parse(meta?.base?.[id]); return o?.last ? { id, last: o.last, first: o.first || '', am: o.am } : null; }).filter((x): x is Ident => !!x);
  const matchGone = cadreMatcher(gone);
  const placed = new Set<string>(); const free = [...scan.free]; let n = 0;
  for (const { r, v } of scan.records) {
    if (!cellText(v.last)) continue;
    n++;
    const m = match(v);
    if (m.alts) { m.alts.forEach(id => placed.add(id)); (plan.ambiguous = plan.ambiguous || []).push(r); continue; }
    if (m.id == null) {
      const g = matchGone(v);
      if (g.id) { clearRow(plan, sheet, scan, b, r); free.push(r); plan.cleared++; n--; } else plan.foreign++;
      continue;
    }
    if (placed.has(m.id)) { plan.foreign++; continue; }
    placed.add(m.id);
    const c = byId.get(m.id)!; const bv = parse(meta?.base?.[c.id]); const now = vals(c, s, hasO);
    let ch = false;
    for (const k of CADRE_KEYS) {
      const col = b.cols[k]; if (col == null) continue;
      const cell = cellText(v[k]);
      if (cmpKey(k, now[k], s) === cmpKey(k, cell, s)) continue;
      // το άλλαξε η εφαρμογή από την τελευταία ανάγνωση/εγγραφή (χωρίς προηγούμενη: μόνο αν το κελί είναι κενό)
      if (bv ? cmpKey(k, bv[k] ?? '', s) === cmpKey(k, now[k], s) : cell !== '') continue;
      plan.sets.push({ r, c: col, v: cadreCell(k, c, s, hasO) }); ch = true;
    }
    if (ch) plan.changed++;
  }
  const fresh = orderedCadre(list).filter(c => !placed.has(c.id));
  const put = (r: number, c: Cadre) => { for (const [k, col] of Object.entries(b.cols)) { if (!(CADRE_KEYS as readonly string[]).includes(k)) continue; const val = cadreCell(k, c, s, hasO); if (val != null) plan.sets.push({ r, c: col, v: val }); } };
  const added = addRows(plan, sheet, b, scan, free, n, fresh, put, c => nameOf(c));
  plan.keys = list.filter(c => placed.has(c.id) || added.includes(c)).map(c => c.id);
  return plan;
}

// ------------------------------------------------------------------ καταστάσεις στελεχών
export const absCode = (kind: string, s: Cfg) => cadreAbsOf(kind, s.settings.lists)?.[0] ?? kind;
const absKey = (cid: string, from: string, to: string, code: string) => [cid, from, to, code].join('|');
const keyOf = (a: CadreAbs, s: Cfg) => absKey(a.cid, a.from, a.to, absCode(a.kind, s));
const absNote = (v: CellValue) => cellText(v).trim();
const where = (a: CadreAbs, s: Cfg) => { const st = cadreStatusOf(a, s.settings.lists); return st.group === 'list' ? 'ΜΟΝΟ ΣΤΗ ΛΙΣΤΑ' : (st.group === 'kol' ? 'ΚΩΛΥΟΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ') + ' · ' + colShort(st.col); };
const absLabel = (a: CadreAbs, s: Cfg) => upper(cadreAbsOf(a.kind, s.settings.lists)?.[1] || a.kind);
const absIdent = (code: string, from: string, to: string, last: string, first: string) => [code, from, to, nk(last, first)].join('|');
// Οι εγγραφές που κρατά το base (για να βρεθεί η γραμμή ακόμα κι αν άλλαξε το όνομα του στελέχους ή σβήστηκε)
const absBaseOf = (want: CadreAbs[], byId: Map<string, Cadre>, s: Cfg): Record<string, string> =>
  Object.fromEntries(want.map(a => [keyOf(a, s), JSON.stringify({ n: a.note || '', last: byId.get(a.cid)?.last || '', first: byId.get(a.cid)?.first || '' })]));

interface AbsRow { r: number; v: Record<string, CellValue>; key: string | null; cid: string | null; code: string | null; from: ISODate | null; to: ISODate | null; why: string; who: string; renamed: boolean }
function absRows(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): AbsRow[] {
  const list = s.cadreList || []; const match = cadreMatcher(identsOf(list));
  // όσες γραμμές ξέρουμε από το προηγούμενο συγχρονισμό, με το όνομα που είχαν
  const ident = new Map<string, string>();
  for (const key of meta?.keys || []) { const o = parse(meta?.base?.[key]); const [cid, from, to, ...code] = key.split('|'); if (o?.last) ident.set(absIdent(code.join('|'), from, to, o.last, o.first || ''), cid); }
  const out: AbsRow[] = [];
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    if (!cellText(v.last)) continue;
    const who = [cellText(v.rank), cellText(v.last), cellText(v.first)].filter(Boolean).join(' ');
    const kindText = cellText(v.kind); const code = kindText ? cadreAbsOf(kindText, s.settings.lists)?.[0] ?? null : null;
    const from = parseDate(v.from), to = parseDate(v.to);
    const m = match(v); let cid = m.id; let renamed = false;
    if (!cid && !m.alts && code && from && to) { const x = ident.get(absIdent(code, from, to, cellText(v.last), cellText(v.first))); if (x && list.some(c => c.id === x)) { cid = x; renamed = true; } }
    const why = m.alts ? 'ίδιο ονοματεπώνυμο με άλλο στέλεχος' : !cid ? 'δεν ταιριάζει με στέλεχος' : !kindText ? 'λείπει η κατάσταση' : !code ? 'άγνωστη κατάσταση «' + kindText + '»' : !from ? 'λείπει ή δεν διαβάζεται το «από»' : !to ? 'λείπει ή δεν διαβάζεται το «έως»' : to < from ? 'το «έως» είναι πριν από το «από»' : '';
    out.push({ r, v, key: why ? null : absKey(cid!, from!, to!, code!), cid, code, from, to, why, who, renamed });
  }
  return out;
}
export function planCadreAbsWrite(sheet: RawSheet, b: SourceBinding, s: AppState, meta: Meta | undefined, today: ISODate): CadrePlan {
  const plan: CadrePlan = { sets: [], insert: null, header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [], base: {} };
  const list = s.cadreList || []; const byId = new Map(list.map(c => [c.id, c])); const hasO = false;
  const want = (s.cadreAbs || []).filter(a => byId.has(a.cid) && (b.scope !== 'active' || a.to >= today));
  const wantBy = new Map(want.map(a => [keyOf(a, s), a])); plan.base = absBaseOf(want, byId, s);
  const known = new Set(meta?.keys || []); const scan = tableRows(sheet, b.header, b.cols);
  const free = [...scan.free]; const seen = new Set<string>(); let n = 0;
  // γράφει το κελί μόνο αν η τιμή είναι άλλη από αυτή που έχει ήδη
  const set = (r: number, k: string, val: WVal, cell: CellValue) => {
    const col = b.cols[k]; if (col == null) return false;
    const t = cellText(cell);
    if (val != null && typeof val === 'object' ? parseDate(cell) === val.date : val == null ? t === '' : cmpKey(k, t, s) === cmpKey(k, String(val), s)) return false;
    plan.sets.push({ r, c: col, v: val }); return true;
  };
  for (const e of absRows(sheet, b, s, meta)) {
    n++;
    if (e.key && wantBy.has(e.key) && !seen.has(e.key)) {
      seen.add(e.key);
      const a = wantBy.get(e.key)!; const c = byId.get(a.cid)!; const bv = parse(meta?.base?.[e.key]); let ch = false;
      // βαθμός, Ο/Σ, όνομα: ακολουθούν το στέλεχος (αλλαγή βαθμού, μετονομασία)
      for (const k of ['rank', 'spec', 'last', 'first']) { const val = cadreCell(k, c, s, hasO); if (val != null && set(e.r, k, val, e.v[k])) ch = true; }
      if (b.cols.hkcol != null && set(e.r, 'hkcol', where(a, s), e.v.hkcol)) ch = true;
      // η παρατήρηση: όποιος την άλλαξε τελευταίος (η εφαρμογή γράφει μόνο ό,τι άλλαξε εκείνη)
      if (b.cols.note != null) { const app = a.note || '', cell = absNote(e.v.note); if (sq(app) !== sq(cell) && (bv ? sq(bv.n ?? '') !== sq(app) : cell === '')) { plan.sets.push({ r: e.r, c: b.cols.note, v: app || null }); ch = true; } }
      if (ch) plan.changed++;
    } else if (e.key && wantBy.has(e.key)) plan.foreign++;
    else if (e.key && known.has(e.key)) { clearRow(plan, sheet, scan, b, e.r); free.push(e.r); plan.cleared++; n--; }
    else if (!e.cid && (e.code && e.from && e.to) && [...known].some(k => k.endsWith('|' + e.code) && k.includes('|' + e.from + '|' + e.to + '|') && !wantBy.has(k) && sq(parse(meta?.base?.[k])?.last || '') === sq(cellText(e.v.last)))) { clearRow(plan, sheet, scan, b, e.r); free.push(e.r); plan.cleared++; n--; }
    else plan.foreign++;
  }
  const order = new Map(orderedCadre(list).map((c, i) => [c.id, i]));
  const fresh = want.filter(a => !seen.has(keyOf(a, s))).sort((x, y) => x.from.localeCompare(y.from) || (order.get(x.cid) ?? 0) - (order.get(y.cid) ?? 0) || x.to.localeCompare(y.to));
  const put = (r: number, a: CadreAbs) => {
    const c = byId.get(a.cid)!;
    for (const k of ['rank', 'spec', 'last', 'first']) { const col = b.cols[k], val = cadreCell(k, c, s, hasO); if (col != null && val != null) plan.sets.push({ r, c: col, v: val }); }
    if (b.cols.kind != null) plan.sets.push({ r, c: b.cols.kind, v: absLabel(a, s) });
    if (b.cols.hkcol != null) plan.sets.push({ r, c: b.cols.hkcol, v: where(a, s) });
    if (b.cols.from != null) plan.sets.push({ r, c: b.cols.from, v: { date: a.from } });
    if (b.cols.to != null) plan.sets.push({ r, c: b.cols.to, v: { date: a.to } });
    if (b.cols.note != null && a.note) plan.sets.push({ r, c: b.cols.note, v: a.note });
  };
  const added = addRows(plan, sheet, b, scan, free, n, fresh, put, a => nameOf(byId.get(a.cid)!));
  plan.keys = want.filter(a => seen.has(keyOf(a, s)) || added.includes(a)).map(a => keyOf(a, s));
  return plan;
}

// ------------------------------------------------------------------ ανάγνωση: στοιχεία στελεχών
export type CadreNew = Omit<Cadre, 'id' | 'active'> & { active?: boolean };
export interface CadresRead {
  adds: { r: number; who: string; cadre: CadreNew }[];
  updates: { id: string; r: number; who: string; patch: Partial<Cadre>; what: string[]; conflict: boolean }[];
  same: number; listed: number; amb: { r: number; who: string }[]; skipped: { r: number; who: string; why: string }[];
  appOnly: string[]; warn: string[];
}
export function planCadres(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadresRead {
  const out: CadresRead = { adds: [], updates: [], same: 0, listed: 0, amb: [], skipped: [], appOnly: [], warn: [] };
  const list = s.cadreList || []; const hasO = b.cols.origin != null; const byId = new Map(list.map(c => [c.id, c]));
  const match = cadreMatcher(identsOf(list)); const seen = new Set<string>(); const newKeys = new Set<string>(); const hkBad = new Set<string>();
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    const last = cellText(v.last).trim(); const who = [cellText(v.rank), last, cellText(v.first)].filter(Boolean).join(' ');
    if (!last) continue;
    if (b.cols.first != null && !cellText(v.first).trim()) { out.skipped.push({ r, who, why: 'λείπει το όνομα' }); continue; }
    out.listed++;
    const m = match(v);
    if (m.alts) { out.amb.push({ r, who }); continue; }
    if (m.id == null) {
      // νέο στέλεχος: ό,τι έχει η γραμμή, και γραμμή ΗΚΑΙ από τη στήλη ή από τον βαθμό
      const nk2 = nk(last, cellText(v.first)); if (newKeys.has(nk2)) { out.skipped.push({ r, who, why: 'διπλή γραμμή' }); continue; }
      newKeys.add(nk2);
      const o: Record<string, unknown> = { last, first: cellText(v.first).trim() };
      for (const k of CADRE_KEYS) {
        const col = b.cols[k]; if (col == null || k === 'last' || k === 'first') continue;
        const t = cellText(v[k]).trim(); if (!t) continue;
        const pv = readVal(k, v[k], s); if (pv.skip) { if (pv.warn) out.warn.push('Γραμμή ' + (r + 1) + ' ' + who + ': ' + pv.warn); continue; }
        o[k] = pv.value;
      }
      if (o.hk == null) { const g = guessHk(String(o.rank || ''), s.settings.lists, o.origin as string | undefined); o.hk = g; if (b.cols.hk != null && cellText(v.hk).trim()) hkBad.add(cellText(v.hk).trim()); }
      if (o.rank == null) o.rank = '';
      out.adds.push({ r, who, cadre: o as unknown as CadreNew }); continue;
    }
    if (seen.has(m.id)) { out.skipped.push({ r, who, why: 'διπλή γραμμή (κρατήθηκε η πρώτη)' }); continue; }
    seen.add(m.id);
    const c = byId.get(m.id)!; const now = vals(c, s, hasO); const bv = parse(meta?.base?.[c.id]);
    const patch: Record<string, unknown> = {}; const what: string[] = []; let conflict = false;
    for (const k of CADRE_KEYS) {
      const col = b.cols[k]; if (col == null) continue;
      const cell = cellText(v[k]).trim();
      if (cmpKey(k, now[k], s) === cmpKey(k, cell, s)) continue;
      // το Excel έχει ό,τι είχε στην προηγούμενη ανάγνωση/εγγραφή και άλλαξε μόνο η εφαρμογή: μένει της εφαρμογής (γράφεται στο Excel)
      if (bv && cmpKey(k, bv[k] ?? '', s) === cmpKey(k, cell, s)) continue;
      // κενό κελί δεν σβήνει ό,τι ορίζει το ίδιο το στέλεχος (όνομα, βαθμό, γραμμή ΗΚΑΙ, σε δύναμη)
      if (!cell && ['rank', 'last', 'first', 'hk', 'active'].includes(k)) continue;
      const pv = readVal(k, v[k], s); if (pv.skip) { if (pv.warn) out.warn.push('Γραμμή ' + (r + 1) + ' ' + who + ': ' + pv.warn); continue; }
      patch[k] = pv.value; what.push(LABEL[k] + ': ' + (now[k] || '(κενό)') + ' → ' + (cell || '(κενό)'));
      if (bv && cmpKey(k, bv[k] ?? '', s) !== cmpKey(k, now[k], s)) conflict = true;
    }
    if (what.length) out.updates.push({ id: c.id, r, who: nameOf(c), patch: patch as Partial<Cadre>, what, conflict }); else out.same++;
  }
  out.appOnly = list.filter(c => !seen.has(c.id)).map(nameOf);
  if (hkBad.size) out.warn.push('Δεν αναγνωρίστηκε γραμμή ΗΚΑΙ «' + [...hkBad].slice(0, 4).join('», «') + '»: βάλθηκε από τον βαθμό. Άλλαξέ την από την καρτέλα του στελέχους.');
  return out;
}
// Η τιμή ενός κελιού όπως μπαίνει στο στέλεχος (skip: δεν περνά)
function readVal(k: string, raw: CellValue, s: Cfg): { skip: false; value: string | number | boolean } | { skip: true; warn?: string } {
  const t = cellText(raw).trim();
  if (k === 'active') { const a = parseActive(t); return a == null ? { skip: true, warn: 'το «σε δύναμη» γράφει «' + t + '» (ΝΑΙ ή ΟΧΙ)' } : { skip: false, value: a }; }
  if (k === 'hk') { const h = hkKeyOf(t, s); return h ? { skip: false, value: h } : { skip: true }; }
  if (k === 'monthMax') { const n = Math.floor(Number(t.replace(',', '.'))); return Number.isFinite(n) ? { skip: false, value: n > 0 ? n : 0 } : { skip: true, warn: 'το όριο υπηρεσιών δεν είναι αριθμός: «' + t + '»' }; }
  if (PKEYS.includes(k as PKey)) return { skip: false, value: personalFromCell(k as PKey, raw) };
  return { skip: false, value: t };
}

// ------------------------------------------------------------------ ανάγνωση: καταστάσεις στελεχών
export interface AbsNew { cid: string; kind: string; from: ISODate; to: ISODate; note?: string }
export interface CadreAbsRead {
  adds: { r: number; who: string; abs: AbsNew; text: string }[];
  updates: { id: string; r: number; who: string; note: string; text: string }[];
  removed: { id: string; who: string; text: string }[];
  same: number; listed: number; skipped: { r: number; who: string; why: string }[]; appOnly: number;
}
export function planCadreAbs(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadreAbsRead {
  const out: CadreAbsRead = { adds: [], updates: [], removed: [], same: 0, listed: 0, skipped: [], appOnly: 0 };
  const byId = new Map((s.cadreList || []).map(c => [c.id, c])); const app = new Map((s.cadreAbs || []).filter(a => byId.has(a.cid)).map(a => [keyOf(a, s), a]));
  const known = new Set(meta?.keys || []); const seen = new Set<string>();
  const dm2 = (d: string) => d.slice(8) + '/' + d.slice(5, 7);
  for (const e of absRows(sheet, b, s, meta)) {
    out.listed++;
    if (!e.key) { out.skipped.push({ r: e.r, who: e.who, why: e.why }); continue; }
    if (seen.has(e.key)) { out.skipped.push({ r: e.r, who: e.who, why: 'διπλή γραμμή (κρατήθηκε η πρώτη)' }); continue; }
    seen.add(e.key);
    const a = app.get(e.key); const c = byId.get(e.cid!)!; const note = absNote(e.v.note);
    const label = upper(cadreAbsOf(e.code!, s.settings.lists)?.[1] || e.code!); const rng = dm2(e.from!) + '–' + dm2(e.to!);
    if (!a) { out.adds.push({ r: e.r, who: nameOf(c), abs: { cid: c.id, kind: e.code!, from: e.from!, to: e.to!, ...(note ? { note } : {}) }, text: label + ' ' + rng }); continue; }
    const bv = parse(meta?.base?.[e.key]);
    if (b.cols.note != null && sq(note) !== sq(a.note || '') && !(bv && sq(bv.n ?? '') === sq(note))) out.updates.push({ id: a.id, r: e.r, who: nameOf(c), note, text: label + ' ' + rng + ': παρατήρηση «' + (a.note || '') + '» → «' + note + '»' });
    else out.same++;
  }
  for (const [key, a] of app) if (!seen.has(key)) {
    if (known.has(key)) out.removed.push({ id: a.id, who: nameOf(byId.get(a.cid)!), text: upper(cadreAbsOf(a.kind, s.settings.lists)?.[1] || a.kind) + ' ' + dm2(a.from) + '–' + dm2(a.to) });
    else out.appOnly++;
  }
  return out;
}

// ------------------------------------------------------------------ τι ξέρει το Excel μετά από ανάγνωση (για την επόμενη εγγραφή)
// keys: ποια στελέχη/καταστάσεις είναι πια στο φύλλο· base: οι τιμές της εφαρμογής εκείνη τη στιγμή
export function cadreMeta(kind: 'cadres' | 'cadreAbs', sheet: RawSheet, b: SourceBinding, s: AppState, today: ISODate): { keys: string[]; base: Record<string, string> } {
  const list = s.cadreList || []; const byId = new Map(list.map(c => [c.id, c]));
  if (kind === 'cadres') {
    const hasO = b.cols.origin != null; const match = cadreMatcher(identsOf(list)); const on = new Set<string>();
    for (const { v } of tableRows(sheet, b.header, b.cols).records) { const m = match(v); if (m.id) on.add(m.id); else m.alts?.forEach(id => on.add(id)); }
    return { keys: list.filter(c => on.has(c.id)).map(c => c.id), base: Object.fromEntries(list.map(c => [c.id, JSON.stringify(vals(c, s, hasO))])) };
  }
  const want = (s.cadreAbs || []).filter(a => byId.has(a.cid)); const rows = new Set(absRows(sheet, b, s).map(e => e.key).filter(Boolean));
  return { keys: want.map(a => keyOf(a, s)).filter(k => rows.has(k)), base: absBaseOf(want, byId, s) };
}
