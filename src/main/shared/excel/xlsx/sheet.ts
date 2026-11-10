// One worksheet of a workbook, edited at XML level.
//
// Purpose: class `Sheet`: cell values with the style kept, merges, validations, print setup, column widths, row
//   insert/delete and the shifting of formulas that follow them. Fills the «sacred» templates changing only cell
//   values (06 §2).
// Does NOT: own the zip, styles.xml, defined names or fonts (Workbook does), and never writes over a cell that has a
//   formula.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: was the first half of src/main/xlsx.ts. The class moves WHOLE (Phase 4.7): splitting it into functions would
//   be a logic refactor. Known follow-up: this file and the class stay oversize (see
//   test/architecture/baseline.json). `Workbook` is named only as the narrow type `SheetHost`, so the two files never
//   import each other.
// Covering test: test/insert-rows.test.ts, test/excel-misc.test.ts, test/new-files.test.ts and
//   test/excel-caps.test.ts.
import { upper } from '../../../../shared/text';
import { attr, colName, growFormula, setAttr, shiftCellFormulas, shiftRef, splitRef } from './refs';
import { tailInsert } from './tail';
import { clean, esc, text, unesc, texts } from './text';
import type { Cell, Row } from './types';

/**
 * What a Sheet needs from its Workbook when rows are inserted or deleted: the book keeps the defined names, the
 * formulas of other sheets and the Excel tables in step. `Workbook` implements it; naming this narrow type instead
 * of
 * the class keeps sheet.ts from importing workbook.ts (an import cycle). Type only: no runtime effect.
 */
export interface SheetHost {
  shiftNames(sheet: string, after: number, n: number): void;
  shiftForeign(from: Sheet, after: number, n: number): void;
  shiftTables(sheet: Sheet, after: number, n: number): void;
}

/**
 * One worksheet: its XML split into head (before `<sheetData>`), rows and tail (after it).
 * Created by Workbook; every write keeps the style of the cell (`s="…"`).
 */
export class Sheet {
  private head = '';
  private tail = '';
  private rows: Row[] = [];
  // Cells the app wrote: on save we check that their text fits (Workbook.fitSheet)
  readonly wrote = new Set<string>();
  // The shared texts of the book: get() returns the text, not its index (templates from Excel/LibreOffice)
  sst: string[] = [];
  constructor(
    public name: string,
    public path: string,
    xml: string,
  ) {
    const a = xml.indexOf('<sheetData');
    const b = xml.indexOf('</sheetData>');
    if (a < 0) throw new Error('Το φύλλο ' + name + ' δεν έχει δεδομένα');
    if (b < 0) {
      // <sheetData/>
      const e = xml.indexOf('/>', a) + 2;
      this.head = xml.slice(0, a) + '<sheetData>';
      this.tail = '</sheetData>' + xml.slice(e);
      return;
    }
    const open = xml.indexOf('>', a) + 1;
    this.head = xml.slice(0, open);
    this.tail = xml.slice(b);
    const body = xml.slice(open, b);
    const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(body))) {
      const r = Number(attr(m[1], 'r'));
      const cells: Cell[] = [];
      const cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
      let k: RegExpExecArray | null;
      const inner = m[3] || '';
      while ((k = cellRe.exec(inner)))
        cells.push({ col: splitRef(attr(k[1], 'r')!).c, attrs: k[1], inner: k[3] || '', selfClose: k[2] === '/>' });
      this.rows.push({ r, attrs: m[1], cells });
    }
  }

  private row(r: number, create = true): Row | undefined {
    let x = this.rows.find((y) => y.r === r);
    if (!x && create) {
      x = { r, attrs: ` r="${r}"`, cells: [] };
      this.rows.push(x);
      this.rows.sort((a, b) => a.r - b.r);
    }
    return x;
  }
  private cell(ref: string, create = true): Cell | undefined {
    const { c, r } = splitRef(ref);
    const row = this.row(r, create);
    if (!row) return;
    let x = row.cells.find((y) => y.col === c);
    if (!x && create) {
      // style: from the column or the row if there is one, otherwise none
      const s = attr(row.attrs, 's');
      x = {
        col: c,
        attrs: ` r="${ref}"` + (s && attr(row.attrs, 'customFormat') === '1' ? ` s="${s}"` : ''),
        inner: '',
        selfClose: true,
      };
      row.cells.push(x);
      row.cells.sort((a, b) => a.col - b.col);
    }
    return x;
  }
  hasFormula(ref: string) {
    return !!this.cell(ref, false)?.inner.includes('<f');
  }
  style(ref: string): number | null {
    const x = this.cell(ref, false);
    const v = x && attr(x.attrs, 's');
    return v == null ? null : Number(v);
  }
  setStyle(ref: string, style: number): this {
    const x = this.cell(ref)!;
    x.attrs = setAttr(x.attrs, 's', String(style));
    return this;
  }
  // Number with a given style (e.g. a date as an Excel number with a date format)
  setNumber(ref: string, n: number, style?: number | null): this {
    this.set(ref, n);
    if (style != null) {
      const x = this.cell(ref)!;
      x.attrs = setAttr(x.attrs, 's', String(style));
    }
    return this;
  }
  // Every cell that exists in the XML (for reading values): row and column from 1
  *cells(): Generator<{ r: number; c: number; t: string | null; s: number | null; inner: string }> {
    for (const row of this.rows)
      for (const c of row.cells) {
        const s = attr(c.attrs, 's');
        yield { r: row.r, c: c.col, t: attr(c.attrs, 't'), s: s == null ? null : Number(s), inner: c.inner };
      }
  }

  // Writes a value keeping the style (s="…"). null = empty the cell.
  set(ref: string, v: string | number | null | undefined, keepCase = false): this {
    const x = this.cell(ref)!;
    if (x.inner.includes('<f')) throw new Error(`Το κελί ${this.name}!${ref} έχει τύπο και δεν αλλάζει`);
    let a = setAttr(x.attrs, 't', null);
    if (v == null || v === '') {
      x.attrs = a;
      x.inner = '';
      x.selfClose = true;
      return this;
    }
    if (typeof v === 'number') {
      x.attrs = a;
      x.inner = `<v>${v}</v>`;
    } else {
      x.attrs = setAttr(a, 't', 'inlineStr');
      x.inner = `<is><t xml:space="preserve">${esc(keepCase ? clean(String(v)) : text(v))}</t></is>`;
    }
    x.selfClose = false;
    this.wrote.add(ref);
    return this;
  }
  // Formula in a new cell (without «=»): Excel computes it on open (fullCalcOnLoad in save)
  setFormula(ref: string, f: string): this {
    const x = this.cell(ref)!;
    x.attrs = setAttr(x.attrs, 't', null);
    x.inner = `<f>${esc(f)}</f>`;
    x.selfClose = false;
    return this;
  }
  // Rich text per piece (e.g. underlined penalty duration): ready-made runs <r>…</r>. Keeps the style of the cell.
  setRuns(ref: string, runs: string): this {
    const x = this.cell(ref)!;
    if (x.inner.includes('<f')) throw new Error(`Το κελί ${this.name}!${ref} έχει τύπο και δεν αλλάζει`);
    x.attrs = setAttr(x.attrs, 't', 'inlineStr');
    x.inner = `<is>${runs}</is>`;
    x.selfClose = false;
    this.wrote.add(ref);
    return this;
  }
  // Letter size in all pieces of a rich text (setRuns)
  sizeRuns(ref: string, sz: number): this {
    const x = this.cell(ref, false);
    if (x) x.inner = x.inner.replace(/<sz val="[^"]*"\/>/g, `<sz val="${sz}"/>`);
    return this;
  }
  // All cells with a value, to check capacity in a file that Sheet.set did not write (ExcelJS)
  markAll(): this {
    for (const row of this.rows) for (const c of row.cells) if (c.inner) this.wrote.add(colName(c.col) + row.r);
    return this;
  }
  // Value as it is in the XML: type (t), style and content; null for an empty cell
  raw(ref: string): { t: string | null; s: number | null; inner: string } | null {
    const x = this.cell(ref, false);
    if (!x || !x.inner || /^<v\/>$|^<is\/>$/.test(x.inner)) return null;
    const s = attr(x.attrs, 's');
    return { t: attr(x.attrs, 't'), s: s == null ? null : Number(s), inner: x.inner };
  }
  // Writes what raw gave (cell move, layout.ts); null = empty. Cells with a formula do not change.
  setRaw(ref: string, x: { t: string | null; inner: string } | null): this {
    const c = this.cell(ref)!;
    if (c.inner.includes('<f')) return this;
    c.attrs = setAttr(c.attrs, 't', x ? x.t : null);
    c.inner = x ? x.inner : '';
    c.selfClose = !c.inner;
    if (c.inner) this.wrote.add(ref);
    else this.wrote.delete(ref);
    return this;
  }
  // Deletes all cells of a row (and their styles): an empty row without borders
  dropCells(r: number): this {
    const x = this.row(r, false);
    if (x) x.cells = [];
    return this;
  }
  // The last row that has a cell
  lastRow(): number {
    return this.rows.reduce((a, r) => (r.cells.length && r.r > a ? r.r : a), 0);
  }
  // Last column that has a cell in some row (or a merge)
  lastCol(): number {
    let n = 0;
    for (const row of this.rows) for (const c of row.cells) if (c.col > n) n = c.col;
    for (const m of this.merges()) if (m.c2 > n) n = m.c2;
    return n;
  }
  rowHidden(r: number): boolean {
    return /^(1|true)$/.test(attr(this.row(r, false)?.attrs || '', 'hidden') || '');
  }
  // Merge that starts at the cell (e.g. G11:K11)
  mergeAt(ref: string): { c1: number; r1: number; c2: number; r2: number } | null {
    const { c, r } = splitRef(ref);
    for (const m of this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)) {
      const [a, b] = m[1].split(':');
      const A = splitRef(a),
        B = splitRef(b || a);
      if (A.c === c && A.r === r) return { c1: A.c, r1: A.r, c2: B.c, r2: B.r };
    }
    return null;
  }
  // All merges of the sheet
  merges(): { c1: number; r1: number; c2: number; r2: number }[] {
    return [...this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => {
      const [a, b] = m[1].split(':');
      const A = splitRef(a),
        B = splitRef(b || a);
      return { c1: A.c, r1: A.r, c2: B.c, r2: B.r };
    });
  }
  // New merge (e.g. title A1:K1)
  addMerge(ref: string): this {
    if (/<mergeCells\b[^>]*>/.test(this.tail)) {
      this.tail = this.tail
        .replace(
          /<mergeCells\b([^>]*)>/,
          (_m, a: string) => `<mergeCells${setAttr(a, 'count', String(this.merges().length + 1))}>`,
        )
        .replace('</mergeCells>', `<mergeCell ref="${ref}"/></mergeCells>`);
    } else
      this.tail = tailInsert(this.tail, 'mergeCells', `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`);
    return this;
  }
  // Removes a merge (e.g. when the signatures go to other positions)
  removeMerge(m: { c1: number; r1: number; c2: number; r2: number }): this {
    const a = colName(m.c1) + m.r1,
      b = colName(m.c2) + m.r2;
    const before = this.tail;
    this.tail = this.tail.replace(new RegExp('<mergeCell ref="' + a + '(?::' + b + ')?"/>'), '');
    if (this.tail === before) return this;
    const n = this.merges().length;
    this.tail = n
      ? this.tail.replace(/<mergeCells\b([^>]*)>/, (_m, x: string) => `<mergeCells${setAttr(x, 'count', String(n))}>`)
      : this.tail.replace(/<mergeCells\b[^>]*>\s*<\/mergeCells>/, '');
    return this;
  }
  // Empties a rectangle (columns c1–c2, rows r1–r2): values, format and the merges that are entirely inside it. For the
  // rows that the taller of two side-by-side tables added: the shorter one does not continue with empty bordered cells.
  clearBox(c1: number, c2: number, r1: number, r2: number): this {
    for (const row of this.rows)
      if (row.r >= r1 && row.r <= r2) row.cells = row.cells.filter((c) => c.col < c1 || c.col > c2);
    for (const m of this.merges()) if (m.c1 >= c1 && m.c2 <= c2 && m.r1 >= r1 && m.r2 <= r2) this.removeMerge(m);
    return this;
  }
  // Is there already data validation (list etc.) on some cell of column c between rows r1–r2?
  hasValidation(c: number, r1: number, r2: number): boolean {
    const refs = [
      ...this.tail.matchAll(/<(?:x14:)?dataValidation\b[^>]*?\ssqref="([^"]+)"/g),
      ...this.tail.matchAll(/<xm:sqref>([^<]+)<\/xm:sqref>/g),
    ].flatMap((m) => m[1].split(/\s+/));
    return refs.some((ref) => {
      const [a, b] = ref.split(':');
      try {
        const A = splitRef(a),
          B = splitRef(b || a);
        return A.c <= c && c <= B.c && A.r <= r2 && r1 <= B.r;
      } catch {
        return false;
      }
    });
  }
  // List that the app put on this column (plain values, no error message): its values, so that it can be completed
  // with whatever you added to the Lists. Your own list (with a cell range or an error message) is not returned.
  ownList(c: number, r1: number, r2: number): { sqref: string; items: string[] } | null {
    for (const m of this.tail.matchAll(
      /<dataValidation\b([^>]*)>\s*<formula1>([^<]*)<\/formula1>\s*<\/dataValidation>/g,
    )) {
      const a = m[1];
      const sq = /\ssqref="([^"]+)"/.exec(a)?.[1];
      if (!sq || !/\stype="list"/.test(a) || !/\sshowErrorMessage="0"/.test(a) || /\s/.test(sq)) continue;
      const [x, y] = sq.split(':');
      let A, B;
      try {
        A = splitRef(x);
        B = splitRef(y || x);
      } catch {
        continue;
      }
      if (A.c !== c || B.c !== c || A.r > r2 || r1 > B.r) continue;
      const f = unesc(m[2]);
      if (!/^"[^"]*"$/.test(f)) return null;
      return { sqref: sq, items: f.slice(1, -1).split(',') };
    }
    return null;
  }
  // New values in the list the app put (ownList)
  setListItems(sqref: string, items: string[]): this {
    const re = new RegExp(
      '(<dataValidation\\b[^>]*\\ssqref="' + sqref.replace(/[$]/g, '\\$&') + '"[^>]*>\\s*<formula1>)[^<]*(</formula1>)',
    );
    this.tail = this.tail.replace(
      re,
      (_m, p1: string, p2: string) => p1 + esc('"' + items.map(upper).join(',') + '"') + p2,
    );
    return this;
  }
  // Choice list (dropdown) that also accepts anything else the user writes (no error message)
  addListValidation(sqref: string, items: string[]): this {
    const dv = `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${sqref}"><formula1>${esc('"' + items.map(upper).join(',') + '"')}</formula1></dataValidation>`;
    if (/<dataValidations\b[^>]*>/.test(this.tail)) {
      const n = (this.tail.match(/<dataValidation\b/g) || []).length + 1;
      this.tail = this.tail
        .replace(/<dataValidations\b([^>]*)>/, (_m, a: string) => `<dataValidations${setAttr(a, 'count', String(n))}>`)
        .replace('</dataValidations>', dv + '</dataValidations>');
    } else this.tail = tailInsert(this.tail, 'dataValidations', `<dataValidations count="1">${dv}</dataValidations>`);
    return this;
  }
  // Print setup for a new sheet: A4, one page wide (as many pages tall as needed), landscape if wide.
  // A sheet that already has its own print settings does not change.
  setPrintFit(landscape: boolean): this {
    if (/<pageSetup\b/.test(this.tail) || /<sheetPr\b/.test(this.head)) return this;
    this.head = this.head.replace(/<worksheet\b[^>]*>/, (m) => m + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    this.tail = tailInsert(
      this.tail,
      'pageMargins',
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>',
    );
    this.tail = tailInsert(
      this.tail,
      'pageSetup',
      `<pageSetup paperSize="9" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`,
    );
    return this;
  }
  // The sheet that already has its own print settings (template with «Προσαρμογή σε μία σελίδα»): one page wide and
  // as many pages tall as needed
  fitTall(): this {
    this.tail = this.tail.replace(/<pageSetup\b[^>]*?(?=\/?>)/, (a) =>
      setAttr(setAttr(a, 'fitToHeight', '0'), 'scale', null),
    );
    return this;
  }
  // Footer on every page (e.g. «Σελίδα &P από &N» in the center), only if the sheet has none of its own
  setFooter(center: string): this {
    if (/<headerFooter\b/.test(this.tail)) return this;
    this.tail = tailInsert(
      this.tail,
      'headerFooter',
      `<headerFooter><oddFooter>&amp;C${esc(center)}</oddFooter></headerFooter>`,
    );
    return this;
  }
  // Fixed rows/columns (freeze panes) for a new sheet
  setFreeze(cols: number, rows: number): this {
    if (/<sheetViews\b/.test(this.head)) return this;
    const pane = `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${cols}" ySplit="${rows}" topLeftCell="${colName(cols + 1)}${rows + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`;
    this.head = this.head.replace(/(<sheetFormatPr\b|<cols>|<sheetData\b)/, (m) => pane + m);
    return this;
  }
  // Column widths for a new sheet (only if the sheet has none of its own)
  setColWidths(widths: Record<number, number>): this {
    if (/<cols\b/.test(this.head)) return this;
    const cols = Object.entries(widths)
      .sort((a, b) => +a[0] - +b[0])
      .map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`)
      .join('');
    if (cols) this.head = this.head.replace(/<sheetData\b[^>]*>$/, (m) => `<cols>${cols}</cols>` + m);
    return this;
  }
  // Width of one column (in characters): changes only this one, even if its <col> covers other columns (it is split)
  setColWidth(c: number, w: number): this {
    const cw = (a: string) => setAttr(setAttr(a, 'width', String(w)), 'customWidth', '1');
    const all = /<cols>([\s\S]*?)<\/cols>/.exec(this.head);
    if (!all) {
      this.head = this.head.replace(
        /<sheetData\b[^>]*>$/,
        (m) => `<cols><col min="${c}" max="${c}" width="${w}" customWidth="1"/></cols>` + m,
      );
      return this;
    }
    const list = [...all[1].matchAll(/<col\b[^>]*?\/?>(?:<\/col>)?/g)].map((m) => m[0].replace(/\/?>(<\/col>)?$/, ''));
    const out: string[] = [];
    let done = false;
    for (const a of list) {
      const min = Number(attr(a, 'min')),
        max = Number(attr(a, 'max'));
      if (c < min || c > max) {
        out.push(a);
        continue;
      }
      if (min < c) out.push(setAttr(a, 'max', String(c - 1)));
      out.push(cw(setAttr(setAttr(a, 'min', String(c)), 'max', String(c))));
      if (c < max) out.push(setAttr(a, 'min', String(c + 1)));
      done = true;
    }
    if (!done) out.push(`<col min="${c}" max="${c}" width="${w}" customWidth="1"`);
    out.sort((x, y) => Number(attr(x, 'min')) - Number(attr(y, 'min')));
    this.head = this.head.replace(all[0], '<cols>' + out.map((a) => a + '/>').join('') + '</cols>');
    return this;
  }
  // Column width in Excel characters (<cols>, otherwise the default of the sheet)
  // the widths are read once for each form of <cols> (fitSheet asks for every cell)
  private cwHead: string | null = null;
  private cw = new Map<number, number>();
  colWidth(c: number): number {
    if (this.cwHead !== this.head) {
      this.cwHead = this.head;
      this.cw.clear();
    }
    const hit = this.cw.get(c);
    if (hit != null) return hit;
    let out: number | null = null;
    for (const m of this.head.matchAll(/<col\b[^>]*>/g)) {
      const min = Number(attr(m[0], 'min')),
        max = Number(attr(m[0], 'max')),
        w = attr(m[0], 'width');
      if (c >= min && c <= max && w != null) {
        out = attr(m[0], 'hidden') === '1' ? 0 : Number(w);
        break;
      }
    }
    if (out == null) {
      const f = /<sheetFormatPr\b[^>]*>/.exec(this.head)?.[0] || '';
      out = Number(attr(f, 'defaultColWidth') || 8.43);
    }
    this.cw.set(c, out);
    return out;
  }
  rowHeight(r: number): number {
    const ht = attr(this.row(r, false)?.attrs || '', 'ht');
    return Number(ht ?? attr(/<sheetFormatPr\b[^>]*>/.exec(this.head)?.[0] || '', 'defaultRowHeight') ?? 15);
  }
  setRowHidden(r: number): this {
    const x = this.row(r)!;
    x.attrs = setAttr(x.attrs, 'hidden', '1');
    return this;
  }
  setRowHeight(r: number, ht: number): this {
    const x = this.row(r)!;
    x.attrs = setAttr(setAttr(x.attrs, 'ht', String(ht)), 'customHeight', '1');
    return this;
  }

  // Readable value (for tests): inline string or number
  get(ref: string): string | null {
    const x = this.cell(ref, false);
    if (!x || !x.inner) return null;
    if (x.inner.startsWith('<is>')) return texts(x.inner);
    if (attr(x.attrs, 't') === 's') {
      const v = /<v>([^<]*)<\/v>/.exec(x.inner)?.[1];
      return v == null ? null : (this.sst[Number(v)] ?? null);
    }
    const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(x.inner) || /<v>([\s\S]*?)<\/v>/.exec(x.inner);
    return t
      ? t[1]
          .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
          .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
      : null;
  }
  // All non-empty cells (formulas with «=») and the merges: for the golden-file tests
  dump(): { cells: Record<string, string>; merges: string[]; print: string } {
    const cells: Record<string, string> = {};
    for (const row of this.rows)
      for (const c of row.cells) {
        const ref = colName(c.col) + row.r;
        const f = this.formula(ref);
        const v = f != null ? '=' + f : this.get(ref);
        if (v != null && v !== '') cells[ref] = v;
      }
    const merges = [...this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]);
    const print = (/<pageSetup\b[^>]*>/.exec(this.tail) || [''])[0].replace(/ r:id="[^"]*"/, '');
    return { cells, merges, print };
  }
  formula(ref: string): string | null {
    const x = this.cell(ref, false);
    const f = x && /<f[^>]*>([\s\S]*?)<\/f>/.exec(x.inner);
    return f ? f[1] : null;
  }

  // Puts n copies of row tpl right after row after (whatever is below goes down n rows).
  insertRows(after: number, n: number, tpl: number, wb: SheetHost): void {
    if (n <= 0) return;
    const src = this.row(tpl, false);
    for (const row of this.rows) {
      const moved = row.r > after;
      if (moved) {
        row.r += n;
        row.attrs = setAttr(row.attrs, 'r', String(row.r));
      }
      for (const c of row.cells) {
        if (moved) c.attrs = setAttr(c.attrs, 'r', colName(c.col) + row.r);
        if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, this.name, true, after, n);
      }
    }
    const fresh: Row[] = [];
    for (let i = 1; i <= n; i++) {
      const r = after + i;
      const cells = (src?.cells || []).map((c) => ({
        col: c.col,
        attrs: setAttr(setAttr(c.attrs, 'r', colName(c.col) + r), 't', null),
        inner: '',
        selfClose: true,
      }));
      // the formula =ROW()-6 of the numbering is copied as it is (it has no references)
      src?.cells.forEach((c, j) => {
        if (/<f>ROW\(\)[^<]*<\/f>/.test(c.inner)) {
          cells[j].inner = c.inner.replace(/<v>[^<]*<\/v>/, '');
          cells[j].selfClose = false;
        }
      });
      fresh.push({ r, attrs: setAttr(src ? src.attrs : '', 'r', String(r)), cells });
    }
    this.rows.push(...fresh);
    this.rows.sort((a, b) => a.r - b.r);
    // merges: those below go down, those inside the template row are copied
    const tplMerges: string[] = [];
    this.head = this.shiftXmlRefs(this.head, after, n);
    this.tail = this.tail.replace(/<mergeCell ref="([^"]+)"\/>/g, (_m, ref: string) => {
      const [a, b] = ref.split(':');
      const ra = splitRef(a).r,
        rb = splitRef(b || a).r;
      if (ra === tpl && rb === tpl) tplMerges.push(ref);
      return `<mergeCell ref="${shiftRef(ref, after, n)}"/>`;
    });
    if (tplMerges.length) {
      const extra = [];
      for (let i = 1; i <= n; i++)
        for (const ref of tplMerges) extra.push(`<mergeCell ref="${ref.replace(/\d+/g, String(after + i))}"/>`);
      this.tail = this.tail
        .replace(/<mergeCells count="(\d+)">/, (_m, c) => `<mergeCells count="${Number(c) + extra.length}">`)
        .replace('</mergeCells>', extra.join('') + '</mergeCells>');
    }
    this.tail = this.shiftXmlRefs(this.tail, after, n);
    wb.shiftNames(this.name, after, n);
    wb.shiftForeign(this, after, n);
    wb.shiftTables(this, after, n);
  }
  // Α/Α (serial number) with a «previous + 1» formula (=A4+1, plain or shared formula from dragging) in column col
  // (from 1): the new rows after+1…after+n (from 1, after insertRows) join the chain and the first row below now
  // points at the last new one. Otherwise the new row would get a number and the one below would continue from the
  // one above (1, 2, 9, 3, 4).
  chainAa(col: number, after: number, n: number): boolean {
    const L = colName(col);
    const fOf = (r: number) => {
      const c = this.cell(L + r, false);
      return c && c.inner.includes('<f') ? /<f(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.inner) : null;
    };
    const prevPlus = (text: string | undefined, r: number) =>
      !!text && new RegExp('^\\$?' + L + '\\$?' + (r - 1) + '\\s*\\+\\s*1$').test(unesc(text).trim());
    // shared formula: the formula of the first cell (master) applies relatively to the others too
    const sharedOk = (attrs: string) => {
      const si = attr(attrs, 'si');
      if (si == null || attr(attrs, 't') !== 'shared') return false;
      for (const row of this.rows)
        for (const c of row.cells) {
          if (c.col !== col) continue;
          const m = /<f(\s[^>]*)>([\s\S]*?)<\/f>/.exec(c.inner);
          if (m && attr(m[1], 't') === 'shared' && attr(m[1], 'si') === si) return prevPlus(m[2], row.r);
        }
      return false;
    };
    const chain = (f: RegExpExecArray | null, r: number) =>
      !!f && (f[2] != null && f[2] !== '' ? prevPlus(f[2], r) : sharedOk(f[1] || ''));
    const below = fOf(after + n + 1),
      above = fOf(after);
    // still points at row after
    const belowOld = !!below && below[2] != null && below[2] !== '' && prevPlus(below[2], after + 1);
    if (!belowOld && !chain(below, after + n + 1) && !chain(above, after)) return false;
    for (let r = after + 1; r <= after + n; r++) this.setFormula(L + r, L + (r - 1) + '+1');
    if (belowOld) {
      const c = this.cell(L + (after + n + 1))!;
      c.inner = c.inner
        .replace(/(<f(?:\s[^>]*)?>)[\s\S]*?(<\/f>)/, '$1' + L + (after + n) + '+1$2')
        .replace(/<v>[^<]*<\/v>/, '');
    }
    return true;
  }
  // Deletes row at (from 1) and moves everything below up by one. References to the deleted row now point at the row
  // above, so the end of a range shrinks (COUNTIF(I4:I159) → I4:I158). To remove again a row that the app had added
  // (undo); not on a sheet with an Excel table (false: not deleted).
  deleteRow(at: number, wb: SheetHost): boolean {
    // tables, drawings, comments: only emptying
    if (/<tableParts\b|<drawing\b|<legacyDrawing\b/.test(this.tail)) return false;
    const after = at - 1,
      n = -1;
    this.rows = this.rows.filter((r) => r.r !== at);
    for (const row of this.rows) {
      const moved = row.r > at;
      if (moved) {
        row.r += n;
        row.attrs = setAttr(row.attrs, 'r', String(row.r));
      }
      for (const c of row.cells) {
        if (moved) c.attrs = setAttr(c.attrs, 'r', colName(c.col) + row.r);
        if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, this.name, true, after, n);
      }
    }
    let gone = 0;
    this.tail = this.tail.replace(/<mergeCell ref="([^"]+)"\/>/g, (_m, ref: string) => {
      const [a, b] = ref.split(':');
      if (splitRef(a).r === at && splitRef(b || a).r === at) {
        gone++;
        return '';
      }
      return `<mergeCell ref="${shiftRef(ref, after, n)}"/>`;
    });
    if (gone)
      this.tail = this.tail
        .replace(/<mergeCells count="(\d+)">/, (_m, c) => `<mergeCells count="${Number(c) - gone}">`)
        .replace(/<mergeCells count="0"><\/mergeCells>/, '');
    this.head = this.shiftXmlRefs(this.head, after, n);
    this.tail = this.shiftXmlRefs(this.tail, after, n);
    wb.shiftNames(this.name, after, n);
    wb.shiftForeign(this, after, n);
    return true;
  }
  // Formula ranges toward the sheet `sheet` that grow (growFormula)
  growFormulas(sheet: string, from: number, last: number, to: number): number {
    let n = 0;
    for (const row of this.rows)
      for (const c of row.cells) {
        if (!c.inner.includes('<f')) continue;
        const inner = c.inner.replace(
          /(<f(?:\s[^>]*)?>)([\s\S]*?)(<\/f>)/g,
          (_m, o: string, body: string, e: string) =>
            o + growFormula(body, sheet, sheet === this.name, from, last, to) + e,
        );
        if (inner !== c.inner) {
          c.inner = inner;
          n++;
        } // the value is recomputed on open (fullCalcOnLoad)
      }
    return n;
  }
  // Formulas in this sheet that point at rows of another sheet that moved
  shiftForeign(sheet: string, after: number, n: number) {
    for (const row of this.rows)
      for (const c of row.cells)
        if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, sheet, false, after, n);
  }
  private shiftXmlRefs(xml: string, after: number, n: number) {
    return xml
      .replace(/<dimension ref="([^"]+)"/, (_m, r) => `<dimension ref="${shiftRef(r, after, n)}"`)
      .replace(/(<conditionalFormatting[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<dataValidation[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<hyperlink\b[^>]*\sref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<autoFilter\b[^>]*\sref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<xm:sqref>)([^<]+)(<\/xm:sqref>)/g, (_m, a, r, b) => a + shiftRef(r, after, n) + b)
      .replace(/<brk id="(\d+)"/g, (_m, r) => `<brk id="${Number(r) > after ? Number(r) + n : r}"`);
  }

  toXml(): string {
    const rows = this.rows
      .map((r) => {
        if (!r.cells.length) return `<row${r.attrs}/>`;
        return (
          `<row${r.attrs}>` +
          r.cells.map((c) => (c.selfClose && !c.inner ? `<c${c.attrs}/>` : `<c${c.attrs}>${c.inner}</c>`)).join('') +
          '</row>'
        );
      })
      .join('');
    return this.head + rows + this.tail;
  }
}
