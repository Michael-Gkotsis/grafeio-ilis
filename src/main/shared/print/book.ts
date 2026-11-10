// The opened workbook of the print engine: sheets, shared strings, styles and the formula evaluator.
//
// Purpose: the class `Book` (whole, with its private evaluator methods and memo tables) and the `isRange` guard.
// Does NOT: draw pages or plan them (render.ts, plan.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: a class moves whole; its caches (`parsed`, `memo`, `busy`) are per instance. One `Book` is opened per file and
//   reused by every layout request (Phase 4.8a, verbatim).
// Covering test: test/print.test.ts, test/print-sheets.test.ts and test/perf.test.ts.
import JSZip from 'jszip';
import { texts } from '../excel/xlsx';
import { nowParts } from '../../../shared/dates';
import { themeColors } from './colors';
import { XErr, Unsupported, crit, parseFormula, toBool, toNum, toStr, type Arg, type Node, type Val } from './formula';
import { richOf, type Rich } from './richtext';
import { parseSheet, type ParsedSheet } from './sheet';
import { parseStyles, type Styles } from './styles';
import { attr, key, num } from './xml';

/**
 * The opened workbook: sheets by name, shared strings, styles, and cell values with the simple formulas recalculated.
 * Open it with `Book.open`; sheets are parsed on first use (`load`) and their formula values are memoized per
 * instance.
 */
export class Book {
  private parsed = new Map<string, ParsedSheet>();
  private memo = new Map<string, Map<number, Val>>();
  private busy = new Set<string>();
  sst: string[] = [];
  sstRich: (Rich | null)[] = [];
  styles!: Styles;
  y1904 = false;
  sheets: { name: string; path: string; hidden: boolean }[] = [];
  wbXml = '';
  activeTab = 0;
  constructor(private zip: JSZip) {}
  static async open(buf: Buffer | Uint8Array): Promise<Book> {
    const zip = await JSZip.loadAsync(buf);
    const b = new Book(zip);
    const wbx = await zip.file('xl/workbook.xml')?.async('string');
    if (!wbx) throw new Error('Το αρχείο δεν είναι Excel (.xlsx)');
    b.wbXml = wbx;
    b.y1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wbx);
    b.activeTab = num(/<workbookView\b[^>]*>/.exec(wbx)?.[0] || '', 'activeTab', 0);
    const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
    const rel = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], 'Id'),
        t = attr(m[0], 'Target');
      if (id && t) rel.set(id, t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''));
    }
    for (const m of wbx.matchAll(/<sheet\b[^>]*>/g)) {
      const p = rel.get(attr(m[0], 'r:id') || '');
      if (p && zip.file(p))
        b.sheets.push({ name: attr(m[0], 'name') || '', path: p, hidden: /state="(hidden|veryHidden)"/.test(m[0]) });
    }
    const sst = zip.file('xl/sharedStrings.xml') || zip.file(/sharedStrings\.xml$/i)[0];
    if (sst) {
      const si = [...(await sst.async('string')).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => m[1] || '');
      b.sst = si.map(texts);
      b.sstRich = si.map(richOf);
    }
    const th = zip.file(/theme\d*\.xml$/i)[0];
    b.styles = parseStyles(
      (await zip.file('xl/styles.xml')?.async('string')) || '',
      themeColors(th ? await th.async('string') : ''),
    );
    return b;
  }
  async load(name: string): Promise<ParsedSheet | null> {
    if (this.parsed.has(name)) return this.parsed.get(name)!;
    const e = this.sheets.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!e) return null;
    const xml = await this.zip.file(e.path)!.async('string');
    const sh = parseSheet(e.name, xml, this.sst, this.sstRich);
    this.parsed.set(e.name, sh);
    if (e.name !== name) this.parsed.set(name, sh);
    return sh;
  }
  // all sheets the formulas refer to, before the (synchronous) calculation
  async loadRefs(sh: ParsedSheet) {
    const seen = new Set<string>([sh.name]);
    const todo = [sh];
    while (todo.length) {
      const x = todo.pop()!;
      for (const c of x.cells.values())
        if (c.f)
          for (const m of c.f.matchAll(/(?:'((?:[^']|'')+)'|([^\s'!:(),;"+\-*/^&=<>%]+))!/g)) {
            const n = (m[1] || m[2]).replace(/''/g, "'");
            if (seen.has(n)) continue;
            seen.add(n);
            const y = await this.load(n);
            if (y) todo.push(y);
          }
    }
  }
  value(sheet: string, r: number, c: number): Val {
    const sh = this.parsed.get(sheet);
    if (!sh) return new XErr('#REF!');
    const cell = sh.cells.get(key(r, c));
    if (!cell) return null;
    if (!cell.f) return cell.v;
    let m = this.memo.get(sh.name);
    if (!m) {
      m = new Map();
      this.memo.set(sh.name, m);
    }
    const k = key(r, c);
    if (m.has(k)) return m.get(k)!;
    const id = sh.name + '!' + k;
    if (this.busy.has(id)) return cell.v; // circular reference: the value the file holds
    this.busy.add(id);
    let v: Val;
    try {
      v = this.evalNode(parseFormula(cell.f), sh.name, r, c);
      if (v === null) v = 0;
    } catch {
      v = cell.v;
    } finally {
      this.busy.delete(id);
    }
    m.set(k, v);
    return v;
  }
  private range(n: Extract<Node, { t: 'ref' }>, sheet: string): Val[] {
    const sh = this.parsed.get(n.sheet || sheet);
    if (!sh) return [new XErr('#REF!')];
    const r2 = Math.min(n.r2, sh.maxR),
      c2 = Math.min(n.c2, sh.maxC);
    const out: Val[] = [];
    for (let r = n.r1; r <= r2; r++) for (let c = n.c1; c <= c2; c++) out.push(this.value(sh.name, r, c));
    return out;
  }
  private evalNode(n: Node, sheet: string, r: number, c: number): Val {
    const ev = (x: Node) => {
      const a = this.evalArg(x, sheet, r, c);
      return isRange(a) ? (a.range.length === 1 ? a.range[0] : new XErr('#VALUE!')) : a;
    };
    if (n.t === 'v') return n.v;
    if (n.t === 'ref') return ev(n);
    if (n.t === 'op') {
      if (n.op === 'neg') {
        const a = toNum(ev(n.a));
        return a instanceof XErr ? a : -a;
      }
      if (n.op === '%') {
        const a = toNum(ev(n.a));
        return a instanceof XErr ? a : a / 100;
      }
      const A = ev(n.a),
        B = ev(n.b!);
      if (A instanceof XErr) return A;
      if (B instanceof XErr) return B;
      if (n.op === '&') return toStr(A) + toStr(B);
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
        const cmp =
          typeof A === 'number' && typeof B === 'number'
            ? A - B
            : typeof A === 'string' || typeof B === 'string'
              ? toStr(A).toLowerCase().localeCompare(toStr(B).toLowerCase())
              : (toNum(A) as number) - (toNum(B) as number);
        return n.op === '='
          ? cmp === 0
          : n.op === '<>'
            ? cmp !== 0
            : n.op === '<'
              ? cmp < 0
              : n.op === '>'
                ? cmp > 0
                : n.op === '<='
                  ? cmp <= 0
                  : cmp >= 0;
      }
      const a = toNum(A),
        b = toNum(B);
      if (a instanceof XErr) return a;
      if (b instanceof XErr) return b;
      if (n.op === '+') return a + b;
      if (n.op === '-') return a - b;
      if (n.op === '*') return a * b;
      if (n.op === '/') return b === 0 ? new XErr('#DIV/0!') : a / b;
      if (n.op === '^') return Math.pow(a, b);
      throw new Unsupported(n.op);
    }
    return this.fn(n.name, n.args, sheet, r, c, ev);
  }
  private evalArg(n: Node, sheet: string, r: number, c: number): Arg {
    if (n.t === 'ref') {
      if (n.r1 === n.r2 && n.c1 === n.c2)
        return this.parsed.has(n.sheet || sheet)
          ? this.value(this.parsed.get(n.sheet || sheet)!.name, n.r1, n.c1)
          : new XErr('#REF!');
      return { range: this.range(n, sheet), r: n.r1, c: n.c1 };
    }
    return this.evalNode(n, sheet, r, c);
  }
  private fn(name: string, args: Node[], sheet: string, r: number, c: number, ev: (x: Node) => Val): Val {
    const all = () => {
      const out: { v: Val; direct: boolean }[] = [];
      for (const a of args) {
        const x = this.evalArg(a, sheet, r, c);
        if (isRange(x)) x.range.forEach((v) => out.push({ v, direct: false }));
        else out.push({ v: x, direct: true });
      }
      return out;
    };
    const nums = () => {
      const out: number[] = [];
      for (const { v, direct } of all()) {
        if (v instanceof XErr) throw v;
        if (typeof v === 'number') out.push(v);
        else if (direct && v != null) {
          const n = toNum(v);
          if (n instanceof XErr) throw n;
          out.push(n);
        }
      }
      return out;
    };
    try {
      switch (name) {
        case 'SUM':
          return nums().reduce((a, b) => a + b, 0);
        case 'AVERAGE': {
          const n = nums();
          return n.length ? n.reduce((a, b) => a + b, 0) / n.length : new XErr('#DIV/0!');
        }
        case 'MIN': {
          const n = nums();
          return n.length ? Math.min(...n) : 0;
        }
        case 'MAX': {
          const n = nums();
          return n.length ? Math.max(...n) : 0;
        }
        case 'PRODUCT':
          return nums().reduce((a, b) => a * b, 1);
        case 'COUNT':
          return all().filter((x) => typeof x.v === 'number').length;
        case 'COUNTA':
          return all().filter((x) => x.v != null && x.v !== '').length;
        case 'COUNTBLANK':
          return all().filter((x) => x.v == null || x.v === '').length;
        case 'COUNTIF':
        case 'SUMIF': {
          const rg = this.evalArg(args[0], sheet, r, c);
          const list = isRange(rg) ? rg.range : [rg as Val];
          const ok = crit(ev(args[1]));
          if (name === 'COUNTIF') return list.filter(ok).length;
          const sr = args[2] ? this.evalArg(args[2], sheet, r, c) : rg;
          const sl = isRange(sr) ? sr.range : [sr as Val];
          return list.reduce((a: number, v, i) => a + (ok(v) && typeof sl[i] === 'number' ? (sl[i] as number) : 0), 0);
        }
        case 'ROW':
        case 'COLUMN': {
          if (!args.length) return name === 'ROW' ? r : c;
          const x = args[0];
          if (x.t !== 'ref') throw new Unsupported(name);
          return name === 'ROW' ? x.r1 : x.c1;
        }
        case 'IF': {
          const t = toBool(ev(args[0]));
          if (t instanceof XErr) return t;
          return t ? (args[1] ? ev(args[1]) : true) : args[2] ? ev(args[2]) : false;
        }
        case 'IFERROR': {
          const v = ev(args[0]);
          return v instanceof XErr ? ev(args[1]) : v;
        }
        case 'AND':
        case 'OR': {
          const bs = all()
            .filter((x) => x.v != null)
            .map((x) => toBool(x.v));
          const e = bs.find((b) => b instanceof XErr);
          if (e) return e as XErr;
          return name === 'AND' ? bs.every(Boolean) : bs.some(Boolean);
        }
        case 'NOT': {
          const b = toBool(ev(args[0]));
          return b instanceof XErr ? b : !b;
        }
        case 'ABS':
        case 'INT': {
          const n = toNum(ev(args[0]));
          if (n instanceof XErr) return n;
          return name === 'ABS' ? Math.abs(n) : Math.floor(n);
        }
        case 'ROUND':
        case 'ROUNDUP':
        case 'ROUNDDOWN': {
          const n = toNum(ev(args[0])),
            d = args[1] ? toNum(ev(args[1])) : 0;
          if (n instanceof XErr) return n;
          if (d instanceof XErr) return d;
          const k = Math.pow(10, d);
          const x = n * k;
          const f =
            name === 'ROUND'
              ? Math.round(Math.abs(x))
              : name === 'ROUNDUP'
                ? Math.ceil(Math.abs(x) - 1e-9)
                : Math.floor(Math.abs(x) + 1e-9);
          return (Math.sign(x) * f) / k;
        }
        case 'MOD': {
          const a = toNum(ev(args[0])),
            b = toNum(ev(args[1]));
          if (a instanceof XErr) return a;
          if (b instanceof XErr) return b;
          return b === 0 ? new XErr('#DIV/0!') : a - b * Math.floor(a / b);
        }
        case 'CONCATENATE':
        case 'CONCAT':
          return all()
            .map((x) => toStr(x.v))
            .join('');
        case 'LEN':
          return toStr(ev(args[0])).length;
        case 'UPPER':
          return toStr(ev(args[0])).toUpperCase();
        case 'LOWER':
          return toStr(ev(args[0])).toLowerCase();
        case 'TRIM':
          return toStr(ev(args[0])).trim().replace(/\s+/g, ' ');
        case 'LEFT':
        case 'RIGHT': {
          const s = toStr(ev(args[0]));
          const n = args[1] ? toNum(ev(args[1])) : 1;
          if (n instanceof XErr) return n;
          return name === 'LEFT' ? s.slice(0, n) : n ? s.slice(-n) : '';
        }
        case 'MID': {
          const s = toStr(ev(args[0]));
          const a = toNum(ev(args[1])),
            b = toNum(ev(args[2]));
          if (a instanceof XErr) return a;
          if (b instanceof XErr) return b;
          return s.substr(a - 1, b);
        }
        case 'TODAY': {
          const d = nowParts();
          return Math.floor((Date.UTC(d.y, d.mo - 1, d.d) - Date.UTC(1899, 11, 30)) / 86400000);
        }
      }
    } catch (e) {
      if (e instanceof XErr) return e;
      throw e;
    }
    throw new Unsupported(name);
  }
}

export const isRange = (a: Arg): a is { range: Val[]; r: number; c: number } =>
  !!a && typeof a === 'object' && 'range' in a;
