// One worksheet of the print engine, read from its XML.
//
// Purpose: the type `ParsedSheet`, `parseSheet` (cells with their shared formulas, rows, columns, merges) and the unit
//   helpers `colPx`, `ptPx`, `cellRef`, `shiftFormula`.
// Does NOT: calculate formulas (Book in book.ts) or measure a sheet for printing (sheetGeo.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: book loads sheets lazily and the geometry reads their cells; the parse is a pure function of the XML (Phase
//   4.8a, verbatim). Note that `shiftFormula` here is a private one, different from the one of the xlsx engine.
// Covering test: test/print.test.ts and test/perf.test.ts.
import { colName, colNum, texts, unesc } from '../excel/xlsx';
import { XErr, type Val } from './formula';
import { richOf, type Rich, type XCell } from './richtext';
import { attr, block, key, num } from './xml';

/** One worksheet as read from its XML: cells by `key(r, c)`, row and column properties, merges and the used size. */
export interface ParsedSheet {
  name: string;
  cells: Map<number, XCell>;
  rows: Map<number, { ht?: number; hidden: boolean; s?: number }>;
  cols: { min: number; max: number; w?: number; hidden: boolean; s?: number }[];
  merges: { r1: number; c1: number; r2: number; c2: number }[];
  maxR: number;
  maxC: number;
  xml: string;
  defH: number;
  defW: number;
}

const colPx = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);

/** Points to CSS pixels (96 dpi). */
export const ptPx = (pt: number) => (pt * 96) / 72;

/**
 * Reads one worksheet XML (`sst` = shared strings, `sstRich` = their runs) into a `ParsedSheet`, shared formulas
 * included.
 */
export function parseSheet(name: string, xml: string, sst: string[], sstRich: (Rich | null)[] = []): ParsedSheet {
  const cells = new Map<number, XCell>();
  const rows = new Map<number, { ht?: number; hidden: boolean; s?: number }>();
  const fmt = /<sheetFormatPr\b[^>]*>/.exec(xml)?.[0] || '';
  const defH = num(fmt, 'defaultRowHeight', 15);
  const defW =
    attr(fmt, 'defaultColWidth') != null
      ? colPx(num(fmt, 'defaultColWidth', 8.43))
      : Math.ceil((num(fmt, 'baseColWidth', 8) * 7 + 5) / 8) * 8;
  const cols = [...block(xml, 'cols').matchAll(/<col\b[^>]*>/g)].map((m) => ({
    min: num(m[0], 'min', 1),
    max: num(m[0], 'max', 1),
    w: attr(m[0], 'width') != null ? colPx(num(m[0], 'width', 0)) : undefined,
    hidden: attr(m[0], 'hidden') === '1' || attr(m[0], 'hidden') === 'true',
    s: attr(m[0], 'style') != null ? num(m[0], 'style', 0) : undefined,
  }));
  const shared = new Map<string, { f: string; r: number; c: number }>();
  let maxR = 0,
    maxC = 0,
    lastR = 0;
  const data = /<sheetData\b[^>]*\/>/.test(xml) ? '' : block(xml, 'sheetData');
  for (const m of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(m[1], 'r') ? num(m[1], 'r', 0) : lastR + 1;
    lastR = r;
    rows.set(r, {
      ht: attr(m[1], 'ht') != null ? num(m[1], 'ht', defH) : undefined,
      hidden: attr(m[1], 'hidden') === '1' || attr(m[1], 'hidden') === 'true',
      s: attr(m[1], 'customFormat') === '1' ? num(m[1], 's', 0) : undefined,
    });
    let lastC = 0;
    for (const k of (m[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(k[1], 'r');
      const c = ref ? colNum(ref.replace(/\d+/g, '')) : lastC + 1;
      lastC = c;
      const t = attr(k[1], 't');
      const inner = k[2] || '';
      const s = attr(k[1], 's') != null ? num(k[1], 's', 0) : null;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let v: Val = null;
      let rich: Rich | null = null;
      if (t === 's') {
        v = raw != null ? (sst[+raw] ?? null) : null;
        rich = raw != null ? (sstRich[+raw] ?? null) : null;
      } else if (t === 'inlineStr') {
        v = texts(inner);
        rich = richOf(inner);
      } else if (t === 'str') v = raw != null ? unesc(raw) : null;
      else if (t === 'b') v = raw === '1';
      else if (t === 'e') v = raw ? new XErr(unesc(raw)) : null;
      else if (t === 'd') {
        const d = raw ? Date.parse(unesc(raw)) : NaN;
        v = isNaN(d) ? null : (d - Date.UTC(1899, 11, 30)) / 86400000;
      } else if (raw != null && raw !== '') v = isNaN(+raw) ? unesc(raw) : +raw;
      // formulas: shared ones too, with the relative references shifted
      let f: string | undefined;
      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      if (fm) {
        const si = attr(fm[1], 'si');
        const body = fm[2] != null ? unesc(fm[2]) : '';
        if (attr(fm[1], 't') === 'shared' && si != null) {
          if (body) shared.set(si, { f: body, r, c });
          else {
            const base = shared.get(si);
            if (base) f = shiftFormula(base.f, r - base.r, c - base.c);
          }
        }
        if (body && attr(fm[1], 't') !== 'array') f = body;
      }
      if (v === null && !f && s == null) continue;
      cells.set(key(r, c), rich && !f ? { v, f, s, rich } : { v, f, s });
      if (v !== null || f) {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }
  const merges = [...xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)].map((m) => {
    const [a, b] = m[1].split(':');
    const A = cellRef(a),
      B = cellRef(b || a);
    return { r1: A.r, c1: A.c, r2: B.r, c2: B.c };
  });
  return { name, cells, rows, cols, merges, maxR, maxC, xml, defH, defW };
}

const cellRef = (x: string) => {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(x)!;
  return { c: colNum(m[1].toUpperCase()), r: +m[2] };
};

function shiftFormula(f: string, dr: number, dc: number): string {
  return f.replace(/"(?:[^"]|"")*"|(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g, (m, d1, col, d2, row) => {
    if (m.startsWith('"')) return m;
    return (d1 ? d1 + col : colName(colNum(col) + dc)) + (d2 ? d2 + row : String(+row + dr));
  });
}
