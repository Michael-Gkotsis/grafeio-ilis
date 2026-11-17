// Reads a whole workbook into the engine's sheet model (src/shared/sheetModel.ts): every sheet with its state (visible, hidden,
// very hidden), values, formulas as text, merged ranges and data-validation lists. .xls files go through the converters first.
import fs from 'fs';
import path from 'path';
import { Workbook, colNum, splitRef, unesc } from './xlsx';
import { DEFAULT_CONVERTERS, convertXls, type XlsConverter } from './xlsConvert';
import { oldFormatError } from './sources';
import { key, type BookModel, type MergeRange, type SheetModel, type Validation } from '../shared/sheetModel';
import type { CellValue } from '../shared/roster';

export interface ModelOpts { maxRows?: number; maxCols?: number; converters?: XlsConverter[] }
export const MODEL_MAX_ROWS = 6000;
export const MODEL_MAX_COLS = 200;

// A shared formula child has no text: it is the master's text moved by the distance between the two cells
export function shiftFormulaRefs(f: string, dr: number, dc: number): string {
  if (!dr && !dc) return f;
  const colTo = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const mv = (part: string) => part.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)|(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![A-Z\d(])|(\$?)(\d+):(\$?)(\d+)(?![\d(])/g, (m, ca, cl, ra, rn, c1a, c1, c2a, c2, r1a, r1, r2a, r2) => {
    if (cl) { const nc = ca ? cl : colTo(Math.max(1, colNum(cl) + dc)); const nr = ra ? rn : String(Math.max(1, Number(rn) + dr)); return ca + nc + ra + nr; }
    if (c1) return c1a + (c1a ? c1 : colTo(Math.max(1, colNum(c1) + dc))) + ':' + c2a + (c2a ? c2 : colTo(Math.max(1, colNum(c2) + dc)));
    return r1a + (r1a ? r1 : String(Math.max(1, Number(r1) + dr))) + ':' + r2a + (r2a ? r2 : String(Math.max(1, Number(r2) + dr)));
  });
  // text in quotes stays as it is (criteria like "Α1"), and so do sheet names in '...'
  return f.split(/("(?:[^"]|"")*"|'(?:[^']|'')*'!)/).map((p, i) => (i % 2 ? p : mv(p))).join('');
}

function rangeOf(ref: string): { r1: number; c1: number; r2: number; c2: number } | null {
  try { const [a, b] = ref.replace(/\$/g, '').split(':'); const A = splitRef(a), B = splitRef(b || a); return { r1: A.r - 1, c1: A.c - 1, r2: B.r - 1, c2: B.c - 1 }; } catch { return null; }
}
const sheetRef = (f: string): { sheet: string | null; ref: string } => {
  const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(f.trim());
  return m ? { sheet: (m[1] ? m[1].replace(/''/g, "'") : m[2]), ref: m[3] } : { sheet: null, ref: f.trim() };
};

export async function modelOfBuffer(buf: Buffer | Uint8Array, opts: ModelOpts = {}): Promise<SheetModel[]> {
  const maxRows = opts.maxRows ?? MODEL_MAX_ROWS, maxCols = opts.maxCols ?? MODEL_MAX_COLS;
  const wb = await Workbook.open(buf);
  const states = wb.sheetStates(); const names = wb.definedNameMap();
  const sheets: SheetModel[] = [];
  for (const name of wb.sheetNames()) {
    const fx = new Set<string>(); const formulas = new Map<string, string>();
    let rows: CellValue[][] = []; let truncated = false; let merges: MergeRange[] = []; let dvs: { sqref: string; type: string; f1: string }[] = [];
    try {
      rows = await wb.values(name, maxRows, maxCols, fx) as CellValue[][];
      const ws = await wb.sheet(name);
      // formulas as text; shared formulas: children get the master's text moved
      const shared = new Map<string, { f: string; r: number; c: number }>();
      for (const x of ws.cells()) {
        if (x.r > maxRows) { truncated = true; continue; }
        if (x.c > maxCols) { truncated = true; continue; }
        if (!x.inner.includes('<f')) continue;
        const m = /<f([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(x.inner); if (!m) continue;
        const si = /\bt="shared"/.test(m[1]) ? /\bsi="(\d+)"/.exec(m[1])?.[1] : undefined;
        let text = m[2] != null ? unesc(m[2]) : '';
        if (si != null) {
          if (text) shared.set(si, { f: text, r: x.r, c: x.c });
          else { const b = shared.get(si); if (b) text = shiftFormulaRefs(b.f, x.r - b.r, x.c - b.c); }
        }
        const k = key(x.r - 1, x.c - 1);
        formulas.set(k, text); fx.add(k);
      }
      merges = ws.merges().map(m => ({ r1: m.r1 - 1, c1: m.c1 - 1, r2: m.r2 - 1, c2: m.c2 - 1 }));
      dvs = ws.validations();
    } catch { /* an unreadable sheet stays empty, like readBook */ }
    const validations: Validation[] = [];
    for (const d of dvs) for (const sq of d.sqref.split(/\s+/).filter(Boolean)) {
      const r = rangeOf(sq); if (!r) continue;
      const v: Validation = { ...r, type: d.type };
      if (d.type === 'list') { if (/^".*"$/.test(d.f1)) v.items = d.f1.slice(1, -1).split(',').map(x => x.trim()); else v.ref = d.f1; }
      validations.push(v);
    }
    sheets.push({ name, state: states[name] || 'visible', rows, fx, formulas, merges, validations, ...(truncated ? { truncated } : {}) });
  }
  // lists that point at cells (or at a name): the values they show, read from this or another sheet
  const by = new Map(sheets.map(s => [s.name, s]));
  for (const s of sheets) for (const v of s.validations) {
    if (!v.ref) continue;
    let { sheet, ref } = sheetRef(names[v.ref] ?? v.ref);
    if (/^#REF/i.test(ref)) { delete v.ref; continue; }
    const src = by.get(sheet || s.name); const r = rangeOf(ref); if (!src || !r) continue;
    const items: string[] = [];
    for (let y = r.r1; y <= Math.min(r.r2, r.r1 + 500); y++) for (let x = r.c1; x <= Math.min(r.c2, r.c1 + 50); x++) { const t = src.rows[y]?.[x]; if (t != null && String(t).trim() !== '') items.push(String(t).trim()); }
    v.items = items;
  }
  return sheets;
}

// A file (.xlsx/.xlsm, or .xls through the converters) as a sheet model. mtime/size are the original file's.
export async function readBookModel(file: string, opts: ModelOpts = {}): Promise<BookModel> {
  const st = fs.statSync(file);
  if (/\.xls$/i.test(file)) {
    const conv = await convertXls(file, opts.converters || DEFAULT_CONVERTERS);
    if (!conv) throw oldFormatError(file);
    try { return { sheets: await modelOfBuffer(await fs.promises.readFile(conv.file), opts), mtime: Math.round(st.mtimeMs), size: st.size, from: 'xls', converter: conv.converter }; } finally { conv.cleanup(); }
  }
  let sheets: SheetModel[];
  try { sheets = await modelOfBuffer(await fs.promises.readFile(file), opts); } catch { throw new Error('Το «' + path.basename(file) + '» δεν διαβάζεται ως Excel (.xlsx/.xlsm).'); }
  return { sheets, mtime: Math.round(st.mtimeMs), size: st.size, from: 'xlsx' };
}
