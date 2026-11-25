// The rule model of the adaptive ΗΚΑΙ/ΗΚΑΛ: which people a template ROW counts and which state a template COLUMN counts.
// The bundled form's rows (HK_RANKS) and columns (HK_COLS) are the DEFAULT rules, not hard-coded positions. The counting itself is NOT
// re-implemented here: hkaiClassify (rules.ts) says who is in which row and which column at 08:00, hkaiCounts and this engine both read it.
//   RowRule  keys (ΗΚΑΙ row keys, own rows included) · origins (ΕΠΟΠ, ΟΒΑ, ΕΜΘ… concept ids) · ranks (rank concepts, to split a shared row) · who (cadre|soldier)
//   ColRule  state (the column keys hkaiCounts produces) · placed / attached / force · avail · prov · sum of other rules
// A unit's own column or row (a named outpost, «Σιτιστές - Γραφείς - Μάγειρες») is a rule stored in the profile (TplProfile.rules);
// until the user maps it, it is a warning and is never written. Pure functions, no file access.
import { hkRowLabel, hkRowNames } from './unit';
import { hkRowOfRankId, phraseKey, type Lexicon, type Match } from './lexicon';
import type { BookShape, ColInfo, MatrixRegion, SheetShape } from './shape';
import type { SheetModel } from './sheetModel';
import { key as cellKey, valueText } from './sheetModel';
import type { TplProfile } from './tplStore';
import type { HkClass, HkWho } from './rules';
import { HK_A, HK_COL_KEY, HK_K, hkColsOf, type HkColDef } from './ranks';

export type ColRule =
  | { t: 'state'; keys: string[] }
  | { t: 'placed' } | { t: 'attached' } | { t: 'force' } | { t: 'avail' } | { t: 'prov' }
  | { t: 'post'; posts: string[] }     // the unit's own column for people with a post («Σιτιστές - Γραφείς - Μάγειρες»): present people (no other state) whose post is one of these (phraseKey)
  | { t: 'sum'; of: ColRule[] };
export interface RowRule { keys: string[]; origins?: string[]; ranks?: string[]; who?: 'cadre' | 'soldier' }

export const KOL_KEYS = HK_K.map(x => x[0]);
export const ABS_KEYS = HK_A.map(x => x[0]);
// the officer ranks that share one ΗΚΑΙ row: a template with a row for each splits the row by rank
const SPLIT_ROW: Record<string, string> = { 'rank:ΥΠΟΛΟΧΑΓΟΣ': 'Ανθυπίλαρχοι-Ανθλγοι', 'rank:ΑΝΘΥΠΟΛΟΧΑΓΟΣ': 'Ανθυπίλαρχοι-Ανθλγοι' };

// ------------------------------------------------------------------ defaults
export const DERIVED_COLS = ['sum', 'sumK', 'sumA', 'avail'] as const;
export type Derived = typeof DERIVED_COLS[number];
// own: the unit's own columns (UserLists.hkCols): a template column named like one counts that state, and the totals count the own columns of their group
export function defaultColRule(k: string, own: HkColDef[] = []): ColRule | null {
  switch (k) {
    case 'placed': return { t: 'placed' };
    case 'attached': return { t: 'attached' };
    case 'sum': return { t: 'force' };
    case 'prov': return { t: 'prov' };
    case 'avail': return { t: 'avail' };
    case 'sumK': return { t: 'state', keys: [...KOL_KEYS, ...own.filter(x => x.grp === 'kol').map(x => x.key)] };
    case 'sumA': return { t: 'state', keys: [...ABS_KEYS, ...own.filter(x => x.grp === 'abs').map(x => x.key)] };
    case 'bl': return null;
    default: return /^[a-zA-Z]+$/.test(k) || (HK_COL_KEY.test(k) && own.some(x => x.key === k)) ? { t: 'state', keys: [k] } : null;
  }
}
export const defaultRowRule = (key: string): RowRule => ({ keys: [key] });

// ------------------------------------------------------------------ validating stored rules (they come from JSON)
const strs = (x: unknown): string[] | null => (Array.isArray(x) && x.every(y => typeof y === 'string') ? (x as string[]) : null);
export function asColRule(x: unknown, depth = 0): ColRule | null {
  if (!x || typeof x !== 'object' || depth > 3) return null;
  const o = x as Record<string, unknown>;
  if (o.t === 'state') { const k = strs(o.keys); return k && k.length ? { t: 'state', keys: k } : null; }
  if (o.t === 'placed' || o.t === 'attached' || o.t === 'force' || o.t === 'avail' || o.t === 'prov') return { t: o.t };
  if (o.t === 'post') { const k = strs(o.posts); return k && k.length ? { t: 'post', posts: k } : null; }
  if (o.t === 'sum' && Array.isArray(o.of)) { const of = o.of.map(y => asColRule(y, depth + 1)); return of.length && of.every(Boolean) ? { t: 'sum', of: of as ColRule[] } : null; }
  return null;
}
export function asRowRule(x: unknown): RowRule | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>; const keys = strs(o.keys); if (!keys || !keys.length) return null;
  const origins = o.origins == null ? undefined : strs(o.origins); const ranks = o.ranks == null ? undefined : strs(o.ranks);
  if (origins === null || ranks === null) return null;
  const who = o.who === 'cadre' || o.who === 'soldier' ? o.who : undefined;
  return { keys, ...(origins ? { origins } : {}), ...(ranks ? { ranks } : {}), ...(who ? { who } : {}) };
}

// «(Μ)» = μόνιμοι: η λίστα προελεύσεων της εφαρμογής δεν έχει «Μόνιμος»· μόνιμο είναι το στέλεχος χωρίς προέλευση ή με ΣΜΥ/ΣΣΕ (ποτέ στρατιώτης)
const MONIMOS = 'origin:ΜΟΝΙΜΟΣ';
const isMonimos = (w: HkWho, o: string | null) => w.kind === 'cadre' && (o == null ? !(w.origin || '').trim() : o === 'origin:ΣΜΥ' || o === 'origin:ΣΣΕ');
// ------------------------------------------------------------------ the engine: counts over the shared classification
export class HkEngine {
  private oc = new Map<string, string | null>(); private rc = new Map<string, string | null>();
  constructor(readonly cls: HkClass, readonly lex: Lexicon, readonly prov: Record<string, number> = {}) {}
  originOf(w: HkWho): string | null {
    const o = w.origin; if (!o) return null; let v = this.oc.get(o);
    if (v === undefined) { const m = this.lex.match(o, { kinds: ['origin'] }); v = m.concept && m.confidence !== 'unknown' ? m.concept : null; this.oc.set(o, v); }
    return v;
  }
  rankOf(w: HkWho): string | null {
    const o = w.rank; if (!o) return null; let v = this.rc.get(o);
    if (v === undefined) { const m = this.lex.match(o, { kinds: ['rank'] }); v = m.concept && m.confidence === 'sure' ? m.concept : null; this.rc.set(o, v); }
    return v;
  }
  matches(row: RowRule, w: HkWho): boolean {
    if (!row.keys.includes(w.row)) return false;
    if (row.who && w.kind !== row.who) return false;
    if (row.origins) { const o = this.originOf(w); if (!(o && row.origins.includes(o)) && !(row.origins.includes(MONIMOS) && isMonimos(w, o))) return false; }
    if (row.ranks) { const r = this.rankOf(w); if (!r || !row.ranks.includes(r)) return false; }
    return true;
  }
  people(row: RowRule): HkWho[] { return this.cls.who.filter(w => this.matches(row, w)); }
  // numbers that come from settings and the hand-written cells, not from a person: only an unrestricted row can show them
  private plain = (row: RowRule) => !row.origins && !row.ranks && !row.who;
  count(row: RowRule, col: ColRule, ppl: HkWho[] = this.people(row)): number {
    switch (col.t) {
      case 'state': {
        let n = ppl.filter(w => w.col != null && col.keys.includes(w.col)).length;
        if (this.plain(row)) for (const r of row.keys) for (const k of col.keys) n += this.cls.manual[r]?.[k] || 0;
        return n;
      }
      case 'attached': return ppl.filter(w => w.attached).length;
      case 'force': return ppl.length + (this.plain(row) ? row.keys.reduce((a, r) => a + (this.cls.fixed[r] || 0), 0) : 0);
      case 'placed': return this.count(row, { t: 'force' }, ppl) - this.count(row, { t: 'attached' }, ppl);
      case 'avail': return this.count(row, { t: 'force' }, ppl) - this.count(row, { t: 'state', keys: this.cls.absKeys }, ppl);
      case 'prov': return this.plain(row) ? row.keys.reduce((a, r) => a + (this.prov[r] || 0), 0) : 0;
      case 'post': return ppl.filter(w => w.kind === 'soldier' && w.col == null && !!w.p?.post && col.posts.includes(phraseKey(w.p.post))).length;
      case 'sum': return col.of.reduce((a, c) => a + this.count(row, c, ppl), 0);
    }
  }
}
// two rows can both count the same person
export function rowsOverlap(a: RowRule, b: RowRule): boolean {
  if (!a.keys.some(k => b.keys.includes(k))) return false;
  const meet = <T>(x?: T[], y?: T[]) => !x || !y || x.some(v => y.includes(v));
  return meet(a.origins, b.origins) && meet(a.ranks, b.ranks) && (!a.who || !b.who || a.who === b.who);
}

// ------------------------------------------------------------------ resolving template words into rules
export interface RuleCtx {
  lex: Lexicon;
  rows: string[];                                   // the ΗΚΑΙ row keys of this unit (own rows included)
  settings?: Parameters<typeof hkRowLabel>[1];      // for the unit's own row names (hkNames) and the unit kind
  profile?: TplProfile | null;
}
const acceptedConcept = (p: TplProfile | null | undefined, type: 'col' | 'row', text: string): string | null => {
  if (!p) return null; const k = phraseKey(text);
  return p.elements.find(e => e.type === type && (e.how === 'user' || e.how === 'auto-suggest') && phraseKey(e.text) === k)?.concept ?? null;
};
const BRACKET = /\([^)]*\)/g;
export type TotalKind = 'officers' | 'nco' | 'soldiers' | 'sum' | 'grand';
export interface RowRes { rule: RowRule | null; total?: TotalKind; why: string }
export function resolveRow(text: string, match: Match | undefined, ctx: RuleCtx): RowRes {
  const raw = text.replace(/\s+/g, ' ').trim(); const kq = phraseKey(raw);
  if (!raw) return { rule: null, why: 'κενή ετικέτα' };
  const user = ctx.profile?.rules?.rows?.[kq]; if (user) { const r = asRowRule(user); if (r) return { rule: r, why: 'κανόνας του χρήστη' }; }
  if (match && match.concept?.startsWith('total:') && match.confidence === 'sure') {
    const t = match.concept.slice(6); const kind: TotalKind = t === 'officers' || t === 'nco' || t === 'soldiers' || t === 'grand' ? t : 'sum';
    return { rule: null, total: kind, why: 'σύνολο' };
  }
  // a qualifier in brackets narrows the row by origin: «Λχίες (ΕΠΟΠ)», «Δεκανείς (ΕΠΟΠ/ΕΦ)»
  const base = raw.replace(BRACKET, ' ').replace(/\s+/g, ' ').trim(); const quals = [...raw.matchAll(BRACKET)].map(m => m[0].slice(1, -1).trim()).filter(Boolean);
  let origins: string[] | undefined;
  if (quals.length) {
    const toks = quals.flatMap(q => q.split(/[\s/,+&-]+/)).filter(Boolean); const ids: string[] = [];
    for (const t of toks) { const m = ctx.lex.match(t, { kinds: ['origin'] }); if (m.concept && m.confidence === 'sure') ids.push(m.concept); else return { rule: null, why: 'άγνωστος όρος «' + t + '» στην παρένθεση' }; }
    origins = [...new Set(ids)];
  }
  const keyOf = (): { keys: string[]; ranks?: string[]; why: string } | null => {
    // the unit's own row names first (own rows, «Άλλο όνομα», the Λόχος names)
    const kb = phraseKey(base);
    for (const k of ctx.rows) { const names = [k, hkRowLabel(k, ctx.settings ?? null), ...hkRowNames(k)]; if (names.some(n => phraseKey(n) === kb)) return { keys: [k], why: 'γραμμή «' + k + '»' }; }
    const m = ctx.lex.match(base, { kinds: ['hkrow'] });
    const acc = m.confidence === 'sure' ? m.concept : acceptedConcept(ctx.profile, 'row', raw) ?? acceptedConcept(ctx.profile, 'row', base);
    if (acc?.startsWith('hkrow:') && ctx.rows.includes(acc.slice(6))) return { keys: [acc.slice(6)], why: 'λεξικό: ' + acc };
    // two officer ranks that share one row: this template has a row for each
    const rk = ctx.lex.match(base, { kinds: ['rank'] });
    if (rk.confidence === 'sure' && rk.concept && SPLIT_ROW[rk.concept] && ctx.rows.includes(SPLIT_ROW[rk.concept])) return { keys: [SPLIT_ROW[rk.concept]], ranks: [rk.concept], why: 'βαθμός ' + rk.concept };
    if (rk.confidence === 'sure' && rk.concept) { const row = hkRowOfRankId(rk.concept); if (row && ctx.rows.includes(row)) return { keys: [row], why: 'βαθμός ' + rk.concept }; }
    return null;
  };
  const k = keyOf(); if (!k) return { rule: null, why: 'δεν αναγνωρίζεται γραμμή ΗΚΑΙ' };
  return { rule: { keys: k.keys, ...(origins ? { origins } : {}), ...(k.ranks ? { ranks: k.ranks } : {}) }, why: k.why + (origins ? ' · προέλευση ' + origins.join('/') : '') };
}
export interface ColRes { rule: ColRule | null; concept: string | null; derived?: Derived; why: string }
export function resolveCol(ci: ColInfo, ctx: RuleCtx): ColRes {
  const user = ctx.profile?.rules?.cols?.[phraseKey(ci.leaf || ci.text)]; if (user) { const r = asColRule(user); if (r) return { rule: r, concept: null, why: 'κανόνας του χρήστη' }; }
  const m = ci.match; let concept = m.confidence === 'sure' ? m.concept : null;
  if (!concept) { const a = acceptedConcept(ctx.profile, 'col', ci.leaf || ci.text); if (a) concept = a; }
  if (!concept || !concept.startsWith('hkcol:')) return { rule: null, concept: concept || m.concept, why: concept ? 'η έννοια «' + concept + '» δεν είναι στήλη του ΗΚΑΙ' : m.confidence === 'suggest' ? 'μόνο πρόταση: «' + (m.concept || '?') + '»' : 'άγνωστη στήλη' };
  const k = concept.slice(6); const rule = defaultColRule(k, typeof ctx.settings === 'object' && ctx.settings ? hkColsOf(ctx.settings.lists) : []);
  return { rule, concept, ...((DERIVED_COLS as readonly string[]).includes(k) ? { derived: k as Derived } : {}), why: rule ? 'στήλη «' + k + '»' : 'χωρίς κανόνα' };
}

// ------------------------------------------------------------------ the mapped front matrix
export interface MapRow { r: number; text: string; rule: RowRule | null; total?: TotalKind; members?: number[]; unsafe?: string; hasData: boolean; why: string }
export interface MapCol { c: number; text: string; rule: ColRule | null; concept: string | null; derived?: Derived; hasData: boolean; why: string }
export interface FrontMap { sheet: string; region: MatrixRegion; rows: MapRow[]; cols: MapCol[]; warnings: string[] }
export function mapMatrix(sh: SheetModel, x: MatrixRegion, ctx: RuleCtx): FrontMap {
  const warnings: string[] = []; const has = (r: number, c: number) => valueText(sh.rows[r]?.[c]) !== '' || sh.fx.has(cellKey(r, c));
  const rows: MapRow[] = x.rows.map(ri => {
    const res = resolveRow(ri.text, ri.match, ctx);
    let hasData = false; for (let c = x.c1; c <= x.c2 && !hasData; c++) if (has(ri.r, c)) hasData = true;
    return { r: ri.r, text: ri.text, rule: res.rule, ...(res.total ? { total: res.total } : {}), hasData, why: res.why };
  });
  // «Υπολοχαγοί» and «Ανθυπολοχαγοί» as two rows of one template split the shared ΗΚΑΙ row by rank
  for (const key of new Set(Object.values(SPLIT_ROW))) {
    const split = rows.filter(r => r.rule?.keys.length === 1 && r.rule.keys[0] === key && r.rule.ranks);
    if (!split.length) continue;
    for (const r of rows) if (r.rule && r.rule.keys.length === 1 && r.rule.keys[0] === key && !r.rule.ranks && !r.rule.origins) {
      const rk = ctx.lex.match(r.text.replace(BRACKET, ' '), { kinds: ['rank'] });
      if (rk.confidence === 'sure' && rk.concept && SPLIT_ROW[rk.concept]) { r.rule = { ...r.rule, ranks: [rk.concept] }; r.why += ' · βαθμός ' + rk.concept; }
    }
  }
  // a row that two other rows both count is ambiguous: neither is written
  const dup = new Set<number>();
  rows.forEach((a, i) => rows.forEach((b, j) => { if (j > i && a.rule && b.rule && rowsOverlap(a.rule, b.rule)) { dup.add(a.r); dup.add(b.r); } }));
  for (const r of rows) if (dup.has(r.r)) { r.rule = null; r.why = 'δύο γραμμές μετρούν τα ίδια άτομα'; warnings.push('Οι γραμμές «' + rows.filter(y => dup.has(y.r)).map(y => y.text).join('», «') + '» μετρούν τα ίδια άτομα: δεν γράφτηκαν'); break; }
  // totals: the rows since the previous total (the officers' total sums the rows above it); the grand total sums every row
  let start = 0;
  rows.forEach((row, i) => {
    if (!row.total) return;
    const group = row.total === 'grand' ? rows.slice(0, i) : rows.slice(start, i);
    const members = group.filter(g => !g.total);
    row.members = members.map(g => g.r);
    const bad = members.find(g => !g.rule && g.hasData);
    if (bad) row.unsafe = 'η γραμμή «' + bad.text + '» δεν αναγνωρίζεται και έχει στοιχεία';
    if (row.total !== 'grand') start = i + 1;
  });
  const cols: MapCol[] = x.cols.map(ci => {
    const res = resolveCol(ci, ctx);
    let hasData = false; for (const ri of x.rows) if (!ri.total && has(ri.r, ci.c)) { hasData = true; break; }
    return { c: ci.c, text: ci.leaf || ci.text, rule: res.rule, concept: res.concept, ...(res.derived ? { derived: res.derived } : {}), hasData, why: res.why };
  });
  return { sheet: sh.name, region: x, rows, cols, warnings };
}

// the number the engine expects in every mapped cell (null = unsafe or unknown)
export function expectedCells(map: FrontMap, eng: HkEngine): Map<string, number | null> {
  const out = new Map<string, number | null>(); const byR = new Map(map.rows.map(r => [r.r, r]));
  for (const col of map.cols) {
    if (!col.rule) continue;
    for (const row of map.rows) {
      if (row.rule) { if (col.rule.t === 'prov' && !(eng.prov && Object.values(eng.prov).some(n => n > 0))) continue; out.set(row.r + ':' + col.c, eng.count(row.rule, col.rule)); }
      else if (row.total) {
        if (row.unsafe || !row.members) { out.set(row.r + ':' + col.c, null); continue; }
        let sum = 0, ok = true;
        for (const m of row.members) { const mr = byR.get(m)!; if (mr.rule) sum += eng.count(mr.rule, col.rule); else if (mr.hasData) ok = false; }
        out.set(row.r + ':' + col.c, ok ? sum : null);
      }
    }
  }
  return out;
}

// which people no template row counts, and which states no template column shows
export interface Unplaced { rows: { key: string; n: number }[]; states: { key: string; n: number }[] }
export function unplaced(map: FrontMap, eng: HkEngine): Unplaced {
  const rules = map.rows.filter(r => r.rule).map(r => r.rule!);
  const lost = new Map<string, number>();
  for (const w of eng.cls.who) if (!rules.some(r => eng.matches(r, w))) lost.set(w.row, (lost.get(w.row) || 0) + 1);
  const shown = new Set<string>(); for (const c of map.cols) if (c.rule?.t === 'state' && !c.derived) for (const k of c.rule.keys) shown.add(k);
  const st = new Map<string, number>();
  for (const w of eng.cls.who) if (w.col && !shown.has(w.col) && rules.some(r => eng.matches(r, w))) st.set(w.col, (st.get(w.col) || 0) + 1);
  return { rows: [...lost].map(([key, n]) => ({ key, n })), states: [...st].map(([key, n]) => ({ key, n })) };
}

// ------------------------------------------------------------------ choosing the front table
// The ΗΚΑΙ/ΗΚΑΛ table of a book: the matrix with the most ΗΚΑΙ rows (at least 3) on a visible sheet (or on the named sheet)
const hkRowCount = (x: MatrixRegion) => new Set(x.rows.filter(r => /^hkrow:/.test(r.match.concept || '') && r.match.confidence !== 'unknown').map(r => r.match.concept)).size;
export function pickFront(shape: BookShape, sheet?: string): { sh: SheetShape; region: MatrixRegion } | null {
  let best: { sh: SheetShape; region: MatrixRegion; n: number } | null = null;
  for (const sh of shape.sheets) {
    if (sheet && sh.name !== sheet) continue;
    if (sh.state !== 'visible' && !sheet) continue;
    for (const r of sh.regions) if (r.type === 'matrix') { const n = hkRowCount(r) * 100 + r.cols.length; if (hkRowCount(r) >= 3 && (!best || n > best.n)) best = { sh, region: r, n }; }
  }
  return best && { sh: best.sh, region: best.region };
}
