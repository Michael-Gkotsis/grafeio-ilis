// A tiny formula evaluator for what the ΗΚΑΙ/ΗΚΑΛ templates use: numbers, + - * /, parentheses, SUM / COUNT / COUNTA / MIN / MAX over ranges,
// COUNTIF / COUNTIFS with exact words and the wildcards * ? (and ~ to escape), references to other sheets, whole-column ranges.
// Used after a fill to compare the template's own formulas with the numbers the engine expects. Anything else (IF, lookups…) gives
// "unsupported": a cell that cannot be evaluated is never reported as wrong. Pure functions over the sheet model.
import { key, colIndex, type SheetModel } from './sheetModel';
import type { CellValue } from './roster';

export type Val = number | string | boolean | null;
export const UNSUPPORTED = Symbol('unsupported');
type Rng = { sheet: SheetModel; r1: number; c1: number; r2: number; c2: number };
type V = Val | Rng | typeof UNSUPPORTED;

// the comparison key of a word: case-insensitive, accents kept (as Excel and LibreOffice compare)
const fold = (s: string) => s.replace(/\s+$/, '').toLowerCase();
export function critMatcher(crit: Val): (v: CellValue) => boolean {
  if (typeof crit === 'number') return v => typeof v === 'number' && v === crit;
  if (crit == null) return v => v == null || v === '';
  const t = String(crit);
  const op = /^(<>|>=|<=|=|<|>)(.*)$/.exec(t);
  if (op && op[2] !== '' && !Number.isNaN(Number(op[2]))) { const n = Number(op[2]); return v => { const x = typeof v === 'number' ? v : NaN; if (Number.isNaN(x)) return op[1] === '<>'; return op[1] === '<>' ? x !== n : op[1] === '=' ? x === n : op[1] === '>' ? x > n : op[1] === '<' ? x < n : op[1] === '>=' ? x >= n : x <= n; }; }
  const body = op ? op[2] : t; const neg = op?.[1] === '<>';
  if (!/[*?~]/.test(body)) { const f = fold(body); const test = (v: CellValue) => (v == null || v === '' ? f === '' : fold(String(v instanceof Date ? v.toISOString().slice(0, 10) : v)) === f); return neg ? v => !test(v) : test; }
  let re = ''; for (let i = 0; i < body.length; i++) { const ch = body[i]; if (ch === '~' && i + 1 < body.length) { re += body[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } else if (ch === '*') re += '[\\s\\S]*'; else if (ch === '?') re += '[\\s\\S]'; else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  const rx = new RegExp('^' + re + '$', 'i'); const test = (v: CellValue) => rx.test(v == null ? '' : String(v));
  return neg ? v => !test(v) : test;
}
// does the pattern (with wildcards) match this word? (used to check the words the engine writes)
export const critMatches = (pattern: string, word: string) => critMatcher(pattern)(word);

// ------------------------------------------------------------------ parser
type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'ref'; sheet: string | null; a: string; b: string }
  | { k: 'bin'; op: string; l: Node; r: Node } | { k: 'neg'; e: Node } | { k: 'fn'; name: string; args: Node[] };
const TOK = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|"((?:[^"]|"")*)"|((?:'(?:[^']|'')+'|[A-Za-z_Ͱ-Ͽ][\w.Ͱ-Ͽ]*)!)?(\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3}(?=:\$?[A-Za-z]{1,3}(?![\w(]))|\$?\d+(?=:\$?\d+))(?::(\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3}|\$?\d+))?|([A-Za-z][\w.]*)\s*\(|([-+*/(),;]))/y;
function parse(f: string): Node | null {
  const toks: { t: 'num' | 'str' | 'ref' | 'fn' | 'op'; v: string; sheet?: string | null; b?: string }[] = []; TOK.lastIndex = 0; let pos = 0;
  while (pos < f.length) {
    TOK.lastIndex = pos; const m = TOK.exec(f); if (!m) { if (/^\s*$/.test(f.slice(pos))) break; return null; }
    pos = TOK.lastIndex;
    if (m[1] != null) toks.push({ t: 'num', v: m[1] }); else if (m[2] != null) toks.push({ t: 'str', v: m[2].replace(/""/g, '"') });
    else if (m[4] != null) { const sh = m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : null; toks.push({ t: 'ref', v: m[4], sheet: sh, b: m[5] }); }
    else if (m[6] != null) toks.push({ t: 'fn', v: m[6].toUpperCase() }); else toks.push({ t: 'op', v: m[7] });
  }
  let i = 0;
  const peek = () => toks[i];
  const expr = (): Node | null => { let l = term(); while (l && peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = toks[i++].v; const r = term(); if (!r) return null; l = { k: 'bin', op, l, r }; } return l; };
  const term = (): Node | null => { let l = unary(); while (l && peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const op = toks[i++].v; const r = unary(); if (!r) return null; l = { k: 'bin', op, l, r }; } return l; };
  const unary = (): Node | null => { const p = peek(); if (p && p.t === 'op' && (p.v === '-' || p.v === '+')) { i++; const e = unary(); return e ? (p.v === '-' ? { k: 'neg', e } : e) : null; } return primary(); };
  const primary = (): Node | null => {
    const p = toks[i++]; if (!p) return null;
    if (p.t === 'num') return { k: 'num', v: Number(p.v) };
    if (p.t === 'str') return { k: 'str', v: p.v };
    if (p.t === 'ref') return { k: 'ref', sheet: p.sheet ?? null, a: p.v.replace(/\$/g, '').toUpperCase(), b: (p.b ?? p.v).replace(/\$/g, '').toUpperCase() };
    if (p.t === 'fn') {
      const args: Node[] = [];
      if (peek() && peek().t === 'op' && peek().v === ')') { i++; return { k: 'fn', name: p.v, args }; }
      for (;;) { const a = expr(); if (!a) return null; args.push(a); const n = toks[i++]; if (!n || n.t !== 'op') return null; if (n.v === ')') break; if (n.v !== ',' && n.v !== ';') return null; }
      return { k: 'fn', name: p.v, args };
    }
    if (p.v === '(') { const e = expr(); const n = toks[i++]; return e && n && n.t === 'op' && n.v === ')' ? e : null; }
    return null;
  };
  const e = expr(); return e && i === toks.length ? e : null;
}
const parsed = new Map<string, Node | null>();
const parseCached = (f: string) => { let n = parsed.get(f); if (n === undefined) { n = parse(f); if (parsed.size > 5000) parsed.clear(); parsed.set(f, n); } return n; };

// ------------------------------------------------------------------ evaluation
const cellPos = (a: string): { r: number; c: number } | null => { const m = /^([A-Z]{1,3})(\d+)$/.exec(a); return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null; };
export class Evaluator {
  private by = new Map<string, SheetModel>();
  private memo = new Map<string, Val | typeof UNSUPPORTED>(); private busy = new Set<string>();
  constructor(readonly sheets: SheetModel[]) { for (const s of sheets) this.by.set(s.name.toLowerCase(), s); }
  // the value of a cell (formulas are evaluated again from their text, never read from the cached result)
  cell(sh: SheetModel, r: number, c: number): Val | typeof UNSUPPORTED {
    const k = sh.name + '|' + key(r, c);
    if (sh.formulas.has(key(r, c))) {
      if (this.memo.has(k)) return this.memo.get(k)!;
      if (this.busy.has(k)) return UNSUPPORTED;
      this.busy.add(k); const v = this.formula(sh, sh.formulas.get(key(r, c))!); this.busy.delete(k); this.memo.set(k, v); return v;
    }
    if (sh.fx.has(key(r, c))) return UNSUPPORTED;     // a formula without text: cannot be recomputed
    return plain(sh.rows[r]?.[c]);
  }
  formula(sh: SheetModel, f: string): Val | typeof UNSUPPORTED {
    const n = parseCached(f.replace(/^=/, '')); if (!n) return UNSUPPORTED;
    const v = this.ev(n, sh); return v === UNSUPPORTED ? UNSUPPORTED : typeof v === 'object' && v !== null ? UNSUPPORTED : v;
  }
  private rng(n: Extract<Node, { k: 'ref' }>, here: SheetModel): Rng | null {
    const sh = n.sheet ? this.by.get(n.sheet.toLowerCase()) : here; if (!sh) return null;
    const mk = (x: string) => { const cr = cellPos(x); if (cr) return cr; if (/^[A-Z]{1,3}$/.test(x)) return { c: colIndex(x), r: -1 }; if (/^\d+$/.test(x)) return { c: -1, r: Number(x) - 1 }; return null; };
    const a = mk(n.a), b = mk(n.b); if (!a || !b) return null;
    const last = Math.max(sh.rows.length - 1, 0); const wide = sh.rows.reduce((w, row) => Math.max(w, row ? row.length : 0), 0);
    return { sheet: sh, r1: a.r < 0 ? 0 : Math.min(a.r, b.r < 0 ? a.r : b.r), r2: a.r < 0 || b.r < 0 ? last : Math.max(a.r, b.r), c1: a.c < 0 ? 0 : Math.min(a.c, b.c < 0 ? a.c : b.c), c2: a.c < 0 || b.c < 0 ? Math.max(wide - 1, 0) : Math.max(a.c, b.c) };
  }
  private ev(n: Node, here: SheetModel): V {
    switch (n.k) {
      case 'num': return n.v; case 'str': return n.v;
      case 'ref': { const g = this.rng(n, here); if (!g) return UNSUPPORTED; if (g.r1 === g.r2 && g.c1 === g.c2 && n.a === n.b) { const v = this.cell(g.sheet, g.r1, g.c1); return v; } return g; }
      case 'neg': { const v = this.num(this.ev(n.e, here)); return v === UNSUPPORTED ? UNSUPPORTED : -v; }
      case 'bin': { const a = this.num(this.ev(n.l, here)), b = this.num(this.ev(n.r, here)); if (a === UNSUPPORTED || b === UNSUPPORTED) return UNSUPPORTED; return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : b === 0 ? UNSUPPORTED : a / b; }
      case 'fn': return this.fn(n.name, n.args, here);
    }
  }
  private num(v: V): number | typeof UNSUPPORTED { if (v === UNSUPPORTED) return UNSUPPORTED; if (v == null || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v); return UNSUPPORTED; }
  private cells(g: Rng, f: (v: Val, r: number, c: number) => void): boolean {
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = this.cell(g.sheet, r, c); if (v === UNSUPPORTED) return false; f(v, r, c); }
    return true;
  }
  private fn(name: string, args: Node[], here: SheetModel): V {
    const vals = args.map(a => this.ev(a, here)); if (vals.some(v => v === UNSUPPORTED)) return UNSUPPORTED;
    switch (name) {
      case 'SUM': case 'MIN': case 'MAX': case 'COUNT': case 'COUNTA': {
        const nums: number[] = []; let any = 0;
        for (const v of vals) {
          if (isRng(v)) { if (!this.cells(v, x => { if (typeof x === 'number') nums.push(x); if (x != null && x !== '') any++; })) return UNSUPPORTED; }
          else if (name === 'SUM' || name === 'MIN' || name === 'MAX') { const x = this.num(v); if (x === UNSUPPORTED) return UNSUPPORTED; nums.push(x); any++; } else { if (typeof v === 'number') nums.push(v); if (v != null && v !== '') any++; }
        }
        return name === 'SUM' ? nums.reduce((a, b) => a + b, 0) : name === 'COUNT' ? nums.length : name === 'COUNTA' ? any : nums.length ? (name === 'MIN' ? Math.min(...nums) : Math.max(...nums)) : 0;
      }
      case 'COUNTIF': case 'COUNTIFS': {
        if (vals.length < 2 || vals.length % 2) return UNSUPPORTED; if (name === 'COUNTIF' && vals.length !== 2) return UNSUPPORTED;
        const conds: { g: Rng; m: (v: CellValue) => boolean }[] = [];
        for (let i = 0; i < vals.length; i += 2) { const g = vals[i], c = vals[i + 1]; if (!isRng(g) || isRng(c)) return UNSUPPORTED; conds.push({ g, m: critMatcher(c as Val) }); }
        const h = conds[0].g.r2 - conds[0].g.r1, w = conds[0].g.c2 - conds[0].g.c1;
        if (conds.some(c => c.g.r2 - c.g.r1 !== h || c.g.c2 - c.g.c1 !== w)) return UNSUPPORTED;
        let n = 0;
        for (let dr = 0; dr <= h; dr++) for (let dc = 0; dc <= w; dc++) {
          let ok = true;
          for (const c of conds) { const v = this.cell(c.g.sheet, c.g.r1 + dr, c.g.c1 + dc); if (v === UNSUPPORTED) return UNSUPPORTED; if (!c.m(v as CellValue)) { ok = false; break; } }
          if (ok) n++;
        }
        return n;
      }
    }
    return UNSUPPORTED;
  }
}
const isRng = (v: V): v is Rng => typeof v === 'object' && v !== null && 'sheet' in v;
function plain(v: CellValue): Val { if (v == null) return null; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v; return String(v); }
export const evalCell = (sheets: SheetModel[], sheet: string, r: number, c: number): Val | typeof UNSUPPORTED => {
  const sh = sheets.find(s => s.name === sheet); return sh ? new Evaluator(sheets).cell(sh, r, c) : UNSUPPORTED;
};
