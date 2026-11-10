// Formula evaluator of the print engine: parser and value conversions.
//
// Purpose: the tokenizer and parser (`parseFormula`), the value types (`Val`, `Arg`, `Node`, `XErr`, `Unsupported`) and
//   the conversions `toNum`, `toStr`, `toBool` and `crit`. What the evaluator does not understand keeps the value the
//   file holds.
// Does NOT: evaluate a node (the class Book in book.ts does, it needs the sheets).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the files the app writes keep old values until Excel opens them, so the print recalculates the simple formulas
//   (SUM, ROW()-6, E17-Z17...); the module-level `TOK` regex is one instance (Phase 4.8a, verbatim).
// Covering test: test/print.test.ts (formulas in rendered cells).
import { colNum } from '../excel/xlsx';
import { general } from './numfmt';

/** An Excel error value (`#REF!`, `#DIV/0!`, ...) travelling through the evaluator as a value. */
export class XErr {
  constructor(public code: string) {}
  toString() {
    return this.code;
  }
}

/** The value of a cell or of a calculation step. */
export type Val = number | string | boolean | null | XErr;

/** An argument of a function: a value or a whole range (values row by row, with the first cell position). */
export type Arg = Val | { range: Val[]; r: number; c: number };

/** A parsed formula: a literal, a reference (cell or area), a function call or an operator. */
export type Node =
  | { t: 'v'; v: Val }
  | { t: 'ref'; sheet: string | null; r1: number; c1: number; r2: number; c2: number; area: boolean }
  | { t: 'fn'; name: string; args: Node[] }
  | { t: 'op'; op: string; a: Node; b?: Node };

/** Thrown for any formula the evaluator does not understand; the cell then keeps the value the file holds. */
export class Unsupported extends Error {}

const TOK =
  /\s+|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[^\s'!:(),;"+\-*/^&=<>%]+)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+)(?![\w(])|(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|([A-Z_][A-Z0-9_.]*)\(|(TRUE|FALSE)(?![\w(])|(<>|<=|>=|[-+*/^&=<>(),;%])/giy;

/** Splits a formula (without `=`) into tokens: strings, references, numbers, function names, booleans, operators. */
function tokenize(f: string) {
  const out: { k: string; v: string; sheet?: string }[] = [];
  TOK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOK.lastIndex < f.length) {
    const at = TOK.lastIndex;
    m = TOK.exec(f);
    if (!m || TOK.lastIndex === at) throw new Unsupported(f);
    if (m[1]) out.push({ k: 'str', v: m[1].slice(1, -1).replace(/""/g, '"') });
    else if (m[3])
      out.push({
        k: 'ref',
        v: m[3].toUpperCase(),
        sheet: m[2] ? m[2].slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : undefined,
      });
    else if (m[4]) out.push({ k: 'num', v: m[4] });
    else if (m[5]) out.push({ k: 'fn', v: m[5].toUpperCase().replace(/^_XLFN\./, '') });
    else if (m[6]) out.push({ k: 'bool', v: m[6].toUpperCase() });
    else if (m[7]) out.push({ k: 'op', v: m[7] === ';' ? ',' : m[7] });
  }
  return out;
}

const MAXR = 1048576,
  MAXC = 16384;

/** Turns a cell, area, whole-column or whole-row reference into a `ref` node (`sheet` null = the same sheet). */
function parseRef(v: string, sheet: string | null): Node {
  const [a, b] = v.split(':');
  const one = (x: string) => {
    const m = /^\$?([A-Z]+)?\$?(\d+)?$/.exec(x)!;
    return { c: m[1] ? colNum(m[1]) : 0, r: m[2] ? +m[2] : 0 };
  };
  const p = one(a),
    q = one(b || a);
  const area = !!b;
  return {
    t: 'ref',
    sheet,
    r1: p.r || 1,
    c1: p.c || 1,
    r2: q.r || (p.r ? q.r : MAXR),
    c2: q.c || (p.c ? q.c : MAXC),
    area,
  };
}

/**
 * Parses a formula (leading `=` optional) by precedence climbing: comparison, `&`, `+ -`, `* /`, `^`, unary minus, `%`.
 */
export function parseFormula(f: string): Node {
  const tk = tokenize(f.replace(/^=/, ''));
  let i = 0;
  const peek = () => tk[i];
  const isOp = (...o: string[]) => tk[i]?.k === 'op' && o.includes(tk[i].v);
  const expr = (): Node => {
    let a = cat();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = tk[i++].v;
      a = { t: 'op', op, a, b: cat() };
    }
    return a;
  };
  const cat = (): Node => {
    let a = add();
    while (isOp('&')) {
      i++;
      a = { t: 'op', op: '&', a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (isOp('+', '-')) {
      const op = tk[i++].v;
      a = { t: 'op', op, a, b: mul() };
    }
    return a;
  };
  const mul = (): Node => {
    let a = pow();
    while (isOp('*', '/')) {
      const op = tk[i++].v;
      a = { t: 'op', op, a, b: pow() };
    }
    return a;
  };
  const pow = (): Node => {
    let a = unary();
    while (isOp('^')) {
      i++;
      a = { t: 'op', op: '^', a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp('-', '+')) {
      const op = tk[i++].v;
      const a = unary();
      return op === '-' ? { t: 'op', op: 'neg', a } : a;
    }
    return post();
  };
  const post = (): Node => {
    let a = prim();
    while (isOp('%')) {
      i++;
      a = { t: 'op', op: '%', a };
    }
    return a;
  };
  const prim = (): Node => {
    const x = peek();
    if (!x) throw new Unsupported(f);
    i++;
    if (x.k === 'num') return { t: 'v', v: +x.v };
    if (x.k === 'str') return { t: 'v', v: x.v };
    if (x.k === 'bool') return { t: 'v', v: x.v === 'TRUE' };
    if (x.k === 'ref') return parseRef(x.v, x.sheet ?? null);
    if (x.k === 'fn') {
      const args: Node[] = [];
      if (!isOp(')')) {
        do {
          if (isOp(',') || isOp(')')) args.push({ t: 'v', v: null });
          else args.push(expr());
        } while (isOp(',') && ++i);
      }
      if (!isOp(')')) throw new Unsupported(f);
      i++;
      return { t: 'fn', name: x.v, args };
    }
    if (x.k === 'op' && x.v === '(') {
      const e = expr();
      if (!isOp(')')) throw new Unsupported(f);
      i++;
      return e;
    }
    throw new Unsupported(f);
  };
  const n = expr();
  if (i !== tk.length) throw new Unsupported(f);
  return n;
}

/** Number conversion as Excel does it: empty is 0, booleans 0/1, text with a decimal comma or dot, else `#VALUE!`. */
export const toNum = (v: Val): number | XErr => {
  if (v instanceof XErr) return v;
  if (v == null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? new XErr('#VALUE!') : n;
};

/** Text conversion as Excel does it (numbers in the Greek General format). */
export const toStr = (v: Val) =>
  v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? general(v) : String(v);

/** Boolean conversion: numbers by `!== 0`, the texts TRUE/FALSE, else `#VALUE!`. */
export const toBool = (v: Val): boolean | XErr => {
  if (v instanceof XErr) return v;
  if (typeof v === 'string') {
    const u = v.toUpperCase();
    if (u === 'TRUE') return true;
    if (u === 'FALSE') return false;
    return new XErr('#VALUE!');
  }
  const n = toNum(v);
  return n instanceof XErr ? n : n !== 0;
};

/**
 * The test behind COUNTIF and SUMIF: a criterion such as `">5"`, `"<>x"` or `"a*"` (wildcards) as a predicate on
 * values.
 */
export function crit(c: Val): (v: Val) => boolean {
  const s = typeof c === 'string' ? c : null;
  const m = s ? /^(<>|<=|>=|=|<|>)?([\s\S]*)$/.exec(s)! : null;
  const op = m?.[1] || '=',
    rhs = m ? m[2] : c;
  const rn = typeof rhs === 'number' ? rhs : rhs != null && rhs !== '' && !isNaN(Number(rhs)) ? Number(rhs) : null;
  return (v) => {
    if (rn != null && typeof v === 'number') {
      const d = v - rn;
      return op === '='
        ? d === 0
        : op === '<>'
          ? d !== 0
          : op === '<'
            ? d < 0
            : op === '>'
              ? d > 0
              : op === '<='
                ? d <= 0
                : d >= 0;
    }
    const a = toStr(v).toLowerCase(),
      b = toStr(rhs as Val).toLowerCase();
    if (op === '=')
      return b.includes('*') || b.includes('?')
        ? new RegExp(
            '^' +
              b
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.') +
              '$',
          ).test(a)
        : a === b;
    if (op === '<>') return a !== b;
    return false;
  };
}
