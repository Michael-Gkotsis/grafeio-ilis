// The template profile engine: what was learned about one unit's template file, recognised again in a new copy of the file.
//   profileOf        shape detected in a file (+ what the user accepted or set) -> TplProfile
//   fingerprintOf    the file's header/label words and shape (never the path, never values that change daily)
//   matchFingerprint tolerant comparison: a moved table, added/removed rows, a renamed sheet or extra columns still match; another template does not
//   applyProfile     re-locates every element in a new copy; whatever is not found again is reported, never guessed
//   learnedNames     the unit's own words as lexicon «learned» names: sure for this unit only
// Types and the settings loader are in tplStore.ts. Pure functions over the sheet model, no file access.
import type { SheetModel } from './sheetModel';
import { buildLexicon, phraseKey, type Lexicon, type Match } from './lexicon';
import { detectBook, type BookShape, type ColInfo, type Region, type SheetShape } from './shape';
import { PROFILE_VERSION, type ElType, type Fingerprint, type Found, type IgnoreMark, type ProfileKind, type RegionSig, type SheetPrint, type TplElement, type TplProfile } from './tplStore';
export * from './tplStore';

export const MATCH_MIN = 0.72;       // below this score a file is not the profile's template
const REGION_MIN = 0.5;              // a region needs this share of the profile region's words to be the same region

// ------------------------------------------------------------------ fingerprint
const colsOf = (x: Region): ColInfo[] => (x.type === 'grid' ? [...x.left, ...x.right] : x.cols);
const topOf = (x: Region) => (x.type === 'grid' ? x.headerRow : x.headerRows[0]);
const leftOf = (x: Region) => (x.type === 'matrix' ? x.labelCol : x.c1);
// A word of the template: the concept when the lexicon knows the text (so «ΕΠΩΝΥΜΟ» and «Επίθετο» are the same word), else the text itself
const tok = (m: Match, text: string): string => (m.concept && m.confidence !== 'unknown' ? m.concept : text.trim() ? 'T:' + phraseKey(text).slice(0, 40) : '');
function regionTokens(x: Region): string[] {
  const out = new Set<string>();
  for (const c of colsOf(x)) { const t = tok(c.match, c.leaf || c.text); if (t) out.add(t); }
  if (x.type === 'matrix') for (const r of x.rows) { const t = tok(r.match, r.text); if (t) out.add(t); }
  return [...out].sort();
}
export function fingerprintOf(shape: BookShape): Fingerprint {
  const sheets: SheetPrint[] = []; const regions: RegionSig[] = [];
  for (const s of shape.sheets) {
    const toks = new Set<string>();
    s.regions.forEach((x, index) => { const tokens = regionTokens(x); tokens.forEach(t => toks.add(t)); regions.push({ sheet: s.name, index, type: x.type, tokens, r1: topOf(x), c1: leftOf(x) }); });
    for (const l of s.labels) if (l.match.concept && l.match.confidence !== 'unknown') toks.add(l.match.concept);
    if (toks.size || s.regions.length) sheets.push({ name: s.name, roles: s.roles, tokens: [...toks].sort() });
  }
  return { sheets, regions };
}

export interface SheetPair { from: string; to: string | null; score: number }
export interface MatchResult { score: number; ok: boolean; sheets: SheetPair[]; missing: string[]; extra: string[]; renamed: string[] }
const kinds = (roles: string[]) => new Set(roles.map(r => r.split(':')[0]));
function sheetScore(p: SheetPrint, q: SheetPrint): number {
  if (!p.tokens.length || !q.tokens.length) return 0;
  const qs = new Set(q.tokens); const hit = p.tokens.filter(t => qs.has(t)).length;
  let s = 0.5 * (hit / p.tokens.length) + 0.5 * (hit / q.tokens.length);
  const a = kinds(p.roles), b = kinds(q.roles);
  if (a.size !== b.size || [...a].some(k => !b.has(k))) s *= 0.7;     // not the same kinds of tables
  return s;
}
// profile -> file. The same template with a few rows more or less, a moved table, a renamed sheet or extra columns scores high; another template low.
export function matchFingerprint(a: Fingerprint, b: Fingerprint): MatchResult {
  const pairs: { i: number; j: number; s: number }[] = [];
  a.sheets.forEach((p, i) => b.sheets.forEach((q, j) => { const s = sheetScore(p, q) + (p.name === q.name ? 0.001 : 0); if (s > 0) pairs.push({ i, j, s }); }));
  pairs.sort((x, y) => y.s - x.s);
  const to = new Map<number, { j: number; s: number }>(); const usedJ = new Set<number>();
  for (const p of pairs) if (!to.has(p.i) && !usedJ.has(p.j) && p.s >= 0.3) { to.set(p.i, { j: p.j, s: Math.min(1, p.s) }); usedJ.add(p.j); }
  let num = 0, den = 0; const sheets: SheetPair[] = []; const missing = new Set<string>(); const extra = new Set<string>(); const renamed: string[] = [];
  a.sheets.forEach((p, i) => {
    const w = p.tokens.length; const m = to.get(i);
    sheets.push({ from: p.name, to: m ? b.sheets[m.j].name : null, score: m ? m.s : 0 });
    if (m && b.sheets[m.j].name !== p.name) renamed.push(p.name + ' → ' + b.sheets[m.j].name);
    if (!w) return;
    num += w * (m ? m.s : 0); den += w;
    const qs = new Set(m ? b.sheets[m.j].tokens : []); const ps = new Set(p.tokens);
    for (const t of p.tokens) if (!qs.has(t)) missing.add(t);
    if (m) for (const t of b.sheets[m.j].tokens) if (!ps.has(t)) extra.add(t);
  });
  const score = den ? Math.round((num / den) * 1000) / 1000 : 0;
  return { score, ok: score >= MATCH_MIN, sheets, missing: [...missing].slice(0, 40), extra: [...extra].slice(0, 40), renamed };
}

// ------------------------------------------------------------------ building a profile
export interface UserSet { sheet: string; type: 'col' | 'row'; c?: number; r?: number; concept: string }
export interface ProfileOpts {
  id?: string; name?: string;
  // which SUGGESTED answers the user accepted (a SURE one is always taken); default: none
  accept?: (e: { sheet: string; type: ElType; concept: string; r?: number; c?: number; text: string }) => boolean;
}
export function profileOf(shape: BookShape, kind: ProfileKind, o: ProfileOpts = {}): TplProfile {
  const elements: TplElement[] = [];
  const add = (sheet: string, region: number, type: ElType, m: Match, text: string, r?: number, c?: number) => {
    if (!m.concept || m.confidence === 'unknown') return;
    const e = { sheet, type, concept: m.concept, r, c, text };
    let how: Found | null = null;
    if (m.confidence === 'sure') how = 'auto-sure'; else if (o.accept?.(e)) how = 'auto-suggest';
    if (how) elements.push({ concept: m.concept, type, sheet, region, ...(r != null ? { r } : {}), ...(c != null ? { c } : {}), text, how });
  };
  for (const s of shape.sheets) {
    s.regions.forEach((x, i) => {
      for (const c of colsOf(x)) add(s.name, i, 'col', c.match, c.leaf || c.text, undefined, c.c);
      if (x.type === 'matrix') for (const r of x.rows) add(s.name, i, 'row', r.match, r.text, r.r);
    });
    for (const l of s.labels) add(s.name, -1, 'label', l.match, l.text, l.r, l.c);
  }
  return { v: PROFILE_VERSION, id: o.id || kind + '-1', kind, ...(o.name ? { name: o.name } : {}), fp: fingerprintOf(shape), elements, words: {}, ignore: [] };
}
const sheetOf = (shape: BookShape, name: string): SheetShape | undefined => shape.sheets.find(s => s.name === name);
// The unit's own word for a concept («Στήλη Χ» = ΤΗΛΕΦΩΝΟ): from now on it is SURE for this unit
export function teach(p: TplProfile, word: string, concept: string): TplProfile {
  const k = phraseKey(word); if (!k) return p;
  return { ...p, words: { ...p.words, [k]: concept } };
}
// The user says «this column/row is that concept» (also a header the lexicon does not know): the element is stored and the word taught
export function setByUser(p: TplProfile, shape: BookShape, u: UserSet): TplProfile {
  const sh = sheetOf(shape, u.sheet); if (!sh) return p;
  for (let i = 0; i < sh.regions.length; i++) {
    const x = sh.regions[i]; let text: string | null = null;
    if (u.type === 'col' && u.c != null) text = colsOf(x).find(c => c.c === u.c)?.leaf ?? null;
    if (u.type === 'row' && u.r != null && x.type === 'matrix') text = x.rows.find(r => r.r === u.r)?.text ?? null;
    if (text == null) continue;
    const el: TplElement = { concept: u.concept, type: u.type, sheet: u.sheet, region: i, ...(u.r != null ? { r: u.r } : {}), ...(u.c != null ? { c: u.c } : {}), text, how: 'user' };
    const elements = [...p.elements.filter(e => !(e.sheet === u.sheet && e.region === i && e.type === u.type && e.r === u.r && e.c === u.c)), el];
    return teach({ ...p, elements }, text, u.concept);
  }
  return p;
}
export function ignoreMark(p: TplProfile, shape: BookShape, sheet: string, type: 'col' | 'row', at: number): TplProfile {
  const sh = sheetOf(shape, sheet); if (!sh) return p;
  for (let i = 0; i < sh.regions.length; i++) {
    const x = sh.regions[i];
    const text = type === 'col' ? colsOf(x).find(c => c.c === at)?.leaf : x.type === 'matrix' ? x.rows.find(r => r.r === at)?.text : undefined;
    if (text) return { ...p, ignore: [...p.ignore, { type, sheet, region: i, text, ...(type === 'col' ? { c: at } : { r: at }) }] };
  }
  return p;
}
// The unit's words as lexicon «learned» names: { conceptId: [words] } (LexiconOpts.learned)
export function learnedNames(...ps: TplProfile[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of ps) for (const [w, id] of Object.entries(p.words)) (out[id] ||= []).includes(w) || out[id].push(w);
  return out;
}
export const lexiconFor = (...ps: TplProfile[]): Lexicon => buildLexicon(ps.some(p => Object.keys(p.words).length) ? { learned: learnedNames(...ps) } : undefined);

// ------------------------------------------------------------------ re-locating
export interface Located { el: TplElement; sheet: string; region: number; r?: number; c?: number; value?: { r: number; c: number }; via: 'text' | 'concept'; dr: number; dc: number }
export interface Applied {
  match: MatchResult;
  found: Located[];
  missing: TplElement[];          // not found again: the user must say where they are now
  ambiguous: TplElement[];        // more than one place fits and nothing tells them apart: not guessed
  ignored: { mark: IgnoreMark; r?: number; c?: number }[];
  ignoredMissing: IgnoreMark[];
  shape: BookShape;
}
export interface ApplyOpts { lexicon?: Lexicon; shape?: BookShape; force?: boolean }

type Pick<T> = { hit: T } | { ambiguous: true } | null;
// the one candidate nearest (by relative place) to where the element was; a tie between different places is ambiguous
function nearest<T extends { at: number }>(cands: T[], rel: number, base: number): Pick<T> {
  if (!cands.length) return null;
  if (cands.length === 1) return { hit: cands[0] };
  const d = (x: T) => Math.abs(x.at - base - rel);
  const s = [...cands].sort((a, b) => d(a) - d(b));
  return d(s[0]) === d(s[1]) ? { ambiguous: true } : { hit: s[0] };
}
export function applyProfile(sheets: SheetModel[], p: TplProfile, o: ApplyOpts = {}): Applied {
  const lex = o.lexicon || lexiconFor(p);
  const shape = o.shape || detectBook({ sheets }, { lexicon: lex });
  const match = matchFingerprint(p.fp, fingerprintOf(shape));
  const empty: Applied = { match, found: [], missing: [...p.elements], ambiguous: [], ignored: [], ignoredMissing: [...p.ignore], shape };
  if (!match.ok && !o.force) return empty;
  const toSheet = new Map(match.sheets.filter(x => x.to).map(x => [x.from, x.to!]));
  // the profile's region (sheet, index) -> the file's region
  const regionMap = new Map<string, number>();
  const regionOf = (sheet: string, index: number): { sh: SheetShape; i: number } | null => {
    const to = toSheet.get(sheet); const sh = to ? sheetOf(shape, to) : undefined; if (!sh) return null;
    const k = sheet + '#' + index;
    if (!regionMap.has(k)) {
      const sig = p.fp.regions.find(x => x.sheet === sheet && x.index === index);
      let best = -1, bs = REGION_MIN - 1e-9;
      if (sig && sig.tokens.length) {
        const ps = new Set(sig.tokens);
        sh.regions.forEach((x, i) => {
          if (x.type !== sig.type) return;
          const toks = regionTokens(x); const hit = toks.filter(t => ps.has(t)).length; const s = hit / sig.tokens.length - Math.abs(i - index) * 1e-4;
          if (s > bs) { bs = s; best = i; }
        });
      }
      regionMap.set(k, best);
    }
    const i = regionMap.get(k)!; return i < 0 ? null : { sh, i };
  };
  const sigOf = (sheet: string, index: number) => p.fp.regions.find(x => x.sheet === sheet && x.index === index);
  type Res = { r?: number; c?: number; value?: { r: number; c: number }; via: 'text' | 'concept'; region: number; sheet: string } | 'ambiguous' | null;
  const locate = (e: { sheet: string; region: number; type: ElType | 'col' | 'row'; text: string; concept?: string; r?: number; c?: number }): Res => {
    const tk = phraseKey(e.text);
    if (e.type === 'label') {
      const to = toSheet.get(e.sheet); const sh = to ? sheetOf(shape, to) : undefined; if (!sh) return null;
      const byText = sh.labels.filter(l => phraseKey(l.text) === tk);
      const byConcept = e.concept ? sh.labels.filter(l => l.match.concept === e.concept && l.match.confidence === 'sure') : [];
      const one = (ls: typeof sh.labels, via: 'text' | 'concept'): Res => (ls.length === 1 ? { r: ls[0].r, c: ls[0].c, value: ls[0].value || undefined, via, region: -1, sheet: sh.name } : ls.length > 1 ? 'ambiguous' : null);
      return one(byText, 'text') || one(byConcept, 'concept');
    }
    const rg = regionOf(e.sheet, e.region); if (!rg) return null;
    const x = rg.sh.regions[rg.i]; const sig = sigOf(e.sheet, e.region);
    if (e.type === 'col') {
      const cs = colsOf(x).map(c => ({ c, at: c.c }));
      const base = leftOf(x), rel = (e.c ?? 0) - (sig?.c1 ?? 0);
      const t = nearest(cs.filter(y => phraseKey(y.c.leaf || y.c.text) === tk), rel, base);
      if (t) return 'hit' in t ? { c: t.hit.at, via: 'text', region: rg.i, sheet: rg.sh.name } : 'ambiguous';
      const k = e.concept ? nearest(cs.filter(y => y.c.match.concept === e.concept && y.c.match.confidence === 'sure'), rel, base) : null;
      if (k) return 'hit' in k ? { c: k.hit.at, via: 'concept', region: rg.i, sheet: rg.sh.name } : 'ambiguous';
      return null;
    }
    if (x.type !== 'matrix') return null;
    const rs = x.rows.map(r => ({ r, at: r.r }));
    // rows are compared by their distance from the header top (the signature holds it)
    const rel = (e.r ?? 0) - (sig ? sig.r1 : 0); const hdr = topOf(x);
    const t = nearest(rs.filter(y => phraseKey(y.r.text) === tk), rel, hdr);
    if (t) return 'hit' in t ? { r: t.hit.at, via: 'text', region: rg.i, sheet: rg.sh.name } : 'ambiguous';
    const k = e.concept ? nearest(rs.filter(y => y.r.match.concept === e.concept && y.r.match.confidence === 'sure'), rel, hdr) : null;
    if (k) return 'hit' in k ? { r: k.hit.at, via: 'concept', region: rg.i, sheet: rg.sh.name } : 'ambiguous';
    return null;
  };
  const found: Located[] = [], missing: TplElement[] = [], ambiguous: TplElement[] = [];
  for (const el of p.elements) {
    const r = locate(el);
    if (r === 'ambiguous') ambiguous.push(el); else if (!r) missing.push(el);
    else found.push({ el, sheet: r.sheet, region: r.region, ...(r.r != null ? { r: r.r } : {}), ...(r.c != null ? { c: r.c } : {}), ...(r.value ? { value: r.value } : {}), via: r.via, dr: r.r != null && el.r != null ? r.r - el.r : 0, dc: r.c != null && el.c != null ? r.c - el.c : 0 });
  }
  const ignored: Applied['ignored'] = [], ignoredMissing: IgnoreMark[] = [];
  for (const m of p.ignore) { const r = locate(m); if (r && r !== 'ambiguous') ignored.push({ mark: m, ...(r.r != null ? { r: r.r } : {}), ...(r.c != null ? { c: r.c } : {}) }); else ignoredMissing.push(m); }
  return { match, found, missing, ambiguous, ignored, ignoredMissing, shape };
}

// One line for people (logs, tests)
export const describeApplied = (a: Applied): string =>
  'score ' + a.match.score + (a.match.ok ? ' ok' : ' NO MATCH') + ' · found ' + a.found.length + ' · missing ' + a.missing.length + ' · ambiguous ' + a.ambiguous.length
  + (a.match.renamed.length ? ' · renamed ' + a.match.renamed.join(', ') : '');
