// A workbook (xlsx zip) edited at XML level: sheets, styles, names, tables, save.
//
// Purpose: class `Workbook`: open a template or build a new file, hand out Sheets, add styles / fonts / number
//   formats, defined names (print areas, titles, marks), copy / import / remove sheets, fit text to cells
//   (`fitSheet`) and `save`.
// Does NOT: edit cell values (Sheet does), merge several files (merge.ts) or decide what the Έντυπα contain.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: was the second half of src/main/xlsx.ts. The class moves WHOLE (Phase 4.7): splitting it would be a logic
//   refactor. Known follow-up: this file, `fitSheet` and `save` stay oversize (see test/architecture/baseline.json).
//   `WIDE_MAX` and `ZIP_DATE` are used only here, so they live here as single instances.
// Covering test: test/excel-misc.test.ts, test/new-files.test.ts, test/auto-cols.test.ts, test/format.test.ts,
//   test/datefmt.test.ts, test/insert-rows.test.ts and the golden hashes of `npm run bench:golden`.
import JSZip from 'jszip';
import { digitPx, fitText, minSize, textPx, type Box, type Fit, type FontSpec } from '../../../textfit';
import { tablePart, type XlLook, type XlPart } from '../../../../shared/xlLook';
import { DATE_IDS, DAY, EPOCH, EPOCH_1904, isDateCode } from './dates';
import { FIXED_MARK, REPORT_MARK, sheetSafe } from './marks';
import { attr, colName, colNum, setAttr, shiftFormula, shiftRef, splitRef } from './refs';
import { Sheet } from './sheet';
import { FONT_ORDER, RPR_ORDER, withAlign } from './styles';
import { esc, text, texts, unesc } from './text';
import type { XlValue } from './types';

const WIDE_MAX = 60; // characters: a table column widens up to here to fit what was written (fitSheet)
const ZIP_DATE = new Date(2020, 0, 1); // see save()

/**
 * One xlsx file in memory (zip + parsed parts). Create it with `Workbook.open(buf)` (a template or an existing file)
 * or `Workbook.blank(sheetName)`, edit through Sheets, then `save()` returns the bytes; saving is deterministic
 * (fixed zip time).
 */
export class Workbook {
  private sheets = new Map<string, Sheet>();
  private names: { name: string; path: string }[] = [];
  private sst: string[] | null = null;
  private styles: {
    xml: string;
    fmt: number[];
    codes: Map<number, string>;
    dirty: boolean;
    made: Map<number, number>;
    wrapped: Map<number, number>;
    centered: Map<number, number>;
    grayed?: Map<number, number>;
    fitted?: Map<string, number>;
    parted?: Map<string, number>;
  } | null = null;
  // Table columns widen as needed on save (fitSheet): in the files the app creates and in those where the caller asks
  // for it. Not in the ΗΚΑΙ: the form's layout is fixed and its columns are shared by many tables.
  widen = false;
  // form with «Σταθερό μέγεθος γραμμάτων» (fixed letter size): what is written does not shrink (fitText keep), wraps
  // and the row grows taller
  keepSize = false;
  private constructor(
    private zip: JSZip,
    private workbookXml: string,
  ) {}

  static async open(buf: Buffer | Uint8Array): Promise<Workbook> {
    const zip = await JSZip.loadAsync(buf);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const wb = new Workbook(zip, wbXml);
    const relMap = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], 'Id'),
        target = attr(m[0], 'Target');
      if (id && target) relMap.set(id, target.startsWith('/') ? target.slice(1) : 'xl/' + target);
    }
    for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
      const name = attr(m[0], 'name')!.replace(/&amp;/g, '&');
      const rid = attr(m[0], 'r:id')!;
      wb.names.push({ name, path: relMap.get(rid)! });
    }
    return wb;
  }

  async sheet(nameOrIndex: string | number): Promise<Sheet> {
    const e =
      typeof nameOrIndex === 'number' ? this.names[nameOrIndex] : this.names.find((x) => x.name === nameOrIndex);
    if (!e) throw new Error('Δεν υπάρχει φύλλο ' + nameOrIndex + ' στο template');
    let s = this.sheets.get(e.path);
    if (!s) {
      s = new Sheet(e.name, e.path, await this.zip.file(e.path)!.async('string'));
      s.sst = await this.sharedStrings();
      this.sheets.set(e.path, s);
      for (const x of this.moved) if (x.sheet !== e.name) s.shiftForeign(x.sheet, x.after, x.n);
    }
    return s;
  }
  // Rows that went into sheets: the formulas of other sheets that point there follow (and of those loaded later)
  private moved: { sheet: string; after: number; n: number }[] = [];
  shiftForeign(from: Sheet, after: number, n: number) {
    this.moved.push({ sheet: from.name, after, n });
    for (const s of this.sheets.values()) if (s !== from) s.shiftForeign(from.name, after, n);
  }
  // New rows at the end of the list of sheet ws: the formulas (in this and in other sheets) that count up to the last
  // row of the list now count the new ones too. Returns how many formulas changed.
  async growRanges(ws: Sheet, from: number, last: number, to: number): Promise<number> {
    let n = ws.growFormulas(ws.name, from, last, to);
    for (const e of this.names) {
      if (e.name === ws.name) continue;
      if (!this.sheets.has(e.path)) {
        const xml = await this.zip.file(e.path)?.async('string');
        if (!xml || !xml.includes('<f')) continue;
        const plain = unesc(xml);
        if (!plain.includes(ws.name + '!') && !plain.includes(ws.name.replace(/'/g, "''") + "'!")) continue;
      }
      n += (await this.sheet(e.name)).growFormulas(ws.name, from, last, to);
    }
    return n;
  }
  // Texts of the template that change (e.g. the unit words: «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ»): only these are rewritten,
  // with the rules of every written cell (capitals, must fit). Formulas and numbers stay. Returns how many cells
  // changed.
  async mapTexts(fn: (s: string) => string): Promise<number> {
    const sst = await this.sharedStrings();
    let n = 0;
    for (const e of this.names) {
      const ws = await this.sheet(e.name);
      const todo: [string, string][] = [];
      for (const c of ws.cells()) {
        if (c.inner.includes('<f')) continue;
        const v =
          c.t === 's'
            ? sst[Number(/<v>(\d+)<\/v>/.exec(c.inner)?.[1] ?? -1)]
            : c.t === 'inlineStr'
              ? texts(c.inner)
              : null;
        if (!v) continue;
        const w = fn(v);
        if (w !== v) todo.push([colName(c.c) + c.r, w]);
      }
      for (const [ref, w] of todo) ws.set(ref, w);
      n += todo.length;
    }
    return n;
  }
  sheetNames() {
    return this.names.map((x) => x.name);
  }
  get date1904() {
    return /<workbookPr\b[^>]*date1904="(1|true)"/.test(this.workbookXml);
  }
  hasSheet(name: string) {
    return this.names.some((x) => x.name === name);
  }

  private async sharedStrings(): Promise<string[]> {
    if (this.sst) return this.sst;
    const f = this.zip.file('xl/sharedStrings.xml') || this.zip.file(/sharedStrings\.xml$/i)[0];
    const xml = f ? await f.async('string') : '';
    this.sst = [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => texts(m[1] || ''));
    return this.sst;
  }
  private async loadStyles() {
    if (this.styles) return this.styles;
    const f = this.zip.file('xl/styles.xml');
    const xml = f ? await f.async('string') : '';
    const codes = new Map<number, string>();
    for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
      const id = attr(m[0], 'numFmtId'),
        code = attr(m[0], 'formatCode');
      if (id) codes.set(Number(id), unesc(code || ''));
    }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] || '';
    const fmt = [...xfs.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) =>
      Number(attr(m[0].slice(0, m[0].indexOf('>') + 1), 'numFmtId') || 0),
    );
    this.styles = { xml, fmt, codes, dirty: false, made: new Map(), wrapped: new Map(), centered: new Map() };
    return this.styles;
  }
  async isDateStyle(s: number | null): Promise<boolean> {
    if (s == null) return false;
    const st = await this.loadStyles();
    const id = st.fmt[s];
    if (id == null) return false;
    return DATE_IDS.has(id) || (st.codes.has(id) && isDateCode(st.codes.get(id)!));
  }
  // Style with a day/month/year date format that keeps the borders and font of the cell. The «short date of Windows»
  // (numFmtId 14) is not enough: on Windows with English settings it shows month/day. Another date format of yours
  // in the cell (e.g. «d/m/yy») stays as it is.
  async dateStyle(base: number | null): Promise<number> {
    const b = base ?? 0;
    const st = await this.loadStyles();
    if ((await this.isDateStyle(b)) && st.fmt[b] !== 14) return b;
    const id = String(this.dmyFmt());
    return this.xfLike(b, st.made, (src) => {
      const open = src
        .slice(0, src.indexOf('>') + 1)
        .replace(/\/>$/, '>')
        .replace(/>$/, '');
      const rest = src.endsWith('/>') ? '/>' : src.slice(src.indexOf('>'));
      return setAttr(setAttr(open, 'numFmtId', id), 'applyNumberFormat', '1') + rest;
    });
  }
  // The «dd/mm/yyyy» format in styles.xml: the existing one if the book already has it, otherwise a new one (from 164,
  // as Excel does)
  private dmyFmt(): number {
    const st = this.styles!;
    for (const [id, code] of st.codes) if (/^dd\/mm\/yyyy(;@)?$/i.test(code)) return id;
    const id = Math.max(163, ...st.codes.keys()) + 1;
    const nf = '<numFmt numFmtId="' + id + '" formatCode="dd/mm/yyyy"/>';
    const m = /<numFmts\b[^>]*?(\/>|>)/.exec(st.xml);
    if (m) {
      const n = (st.xml.match(/<numFmt\b/g) || []).length + 1;
      const open = setAttr(m[0].replace(/\/?>$/, ''), 'count', String(n)) + '>';
      st.xml = st.xml.replace(m[0], m[1] === '/>' ? open + nf + '</numFmts>' : open + nf);
    } else st.xml = st.xml.replace(/(<styleSheet\b[^>]*>)/, '$1<numFmts count="1">' + nf + '</numFmts>');
    st.codes.set(id, 'dd/mm/yyyy');
    st.dirty = true;
    return id;
  }
  private xfList(xml: string): string[] {
    const m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    return m ? [...m[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((x) => x[0]) : [];
  }
  // Style like b with one change (edit); cache: those already made, per b
  private async xfLike(b: number, cache: Map<number, number>, edit: (xf: string) => string): Promise<number> {
    const st = await this.loadStyles();
    if (cache.has(b)) return cache.get(b)!;
    const m = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st.xml);
    if (!m) return b;
    const all = this.xfList(st.xml);
    const idx = this.addXf(edit(all[b] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'));
    cache.set(b, idx);
    return idx;
  }
  // The style in cellXfs: the same one if it already exists (otherwise styles.xml grew on every write), otherwise a
  // new one at the end
  private addXf(xf: string): number {
    const st = this.styles!;
    const m = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st.xml);
    if (!m) return 0;
    const all = this.xfList(st.xml);
    const had = all.indexOf(xf);
    if (had >= 0) return had;
    const idx = all.length;
    st.xml = st.xml.replace(m[0], setAttr(m[1].slice(0, -1), 'count', String(idx + 1)) + '>' + m[2] + xf + m[3]);
    st.fmt.push(Number(attr(xf.slice(0, xf.indexOf('>') + 1), 'numFmtId') || 0));
    st.dirty = true;
    return idx;
  }
  // Items of a styles.xml table (fonts, borders…): the list and where it is
  private part(tag: 'fonts' | 'fills' | 'borders'): { items: string[]; add: (x: string) => number } {
    const st = this.styles!;
    const one = tag.slice(0, -1);
    const m = new RegExp('(<' + tag + '\\b[^>]*>)([\\s\\S]*?)(</' + tag + '>)').exec(st.xml);
    const items = m
      ? [...m[2].matchAll(new RegExp('<' + one + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + one + '>)', 'g'))].map((x) => x[0])
      : [];
    return {
      items,
      add: (x: string) => {
        const had = items.indexOf(x);
        if (had >= 0) return had;
        if (!m) {
          st.xml = st.xml.replace(
            /(<styleSheet\b[^>]*>(?:<numFmts\b[\s\S]*?<\/numFmts>)?)/,
            `$1<${tag} count="1">${x}</${tag}>`,
          );
          st.dirty = true;
          return 0;
        }
        st.xml = st.xml.replace(
          m[0],
          setAttr(m[1].slice(0, -1), 'count', String(items.length + 1)) + '>' + m[2] + x + m[3],
        );
        st.dirty = true;
        return items.length;
      },
    };
  }
  // Font like id (or the base of the book) with changes: another name, size, bold, italic, underline
  private fontLike(id: number, o: { name?: string; sz?: number; b?: boolean; i?: boolean; u?: boolean }): number {
    const fonts = this.part('fonts');
    const base = fonts.items[id] || fonts.items[0] || '<font><sz val="11"/><name val="Calibri"/></font>';
    const parts = new Map<string, string>();
    for (const m of base.replace(/^<font\b[^>]*>/, '').matchAll(/<(\w+)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g))
      parts.set(m[1], m[0]);
    // another font: without the family and theme of the old one (with scheme Excel shows the font of the theme)
    if (o.name) {
      parts.set('name', `<name val="${esc(o.name)}"/>`);
      parts.delete('family');
      parts.delete('scheme');
    }
    if (o.b) parts.set('b', '<b/>');
    else if (o.b === false) parts.delete('b');
    if (o.i) parts.set('i', '<i/>');
    else if (o.i === false) parts.delete('i');
    if (o.u) parts.set('u', '<u/>');
    else if (o.u === false) parts.delete('u');
    if (o.sz) parts.set('sz', `<sz val="${o.sz}"/>`);
    return fonts.add('<font>' + FONT_ORDER.map((k) => parts.get(k) || '').join('') + '</font>');
  }
  // Thin border around the cell
  private thinBorder(): number {
    const b = this.part('borders');
    const i = b.items.findIndex(
      (x) =>
        ['left', 'right', 'top', 'bottom'].every((s) => new RegExp('<' + s + ' style="thin"').test(x)) &&
        !/<diagonal style=/.test(x),
    );
    return i >= 0
      ? i
      : b.add(
          '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>',
        );
  }
  // Style for a table the app creates (new file or new sheet): title bold and 2 sizes larger, centered, headers bold
  // with border, values with border. Letters and alignment from Ρυθμίσεις › Γράμματα Excel: size, bold, italic and
  // underline per piece (tablePart).
  async tableStyle(kind: 'title' | 'head' | 'data', look: XlLook): Promise<number> {
    await this.loadStyles();
    const font = this.fontLike(0, { name: look.font, ...tablePart(look, kind) });
    const border = kind === 'title' ? 0 : this.thinBorder();
    return this.addXf(
      `<xf numFmtId="0" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${kind === 'title' ? 'center' : look.h}" vertical="${look.v}"${kind === 'head' ? ' wrapText="1"' : ''}/></xf>`,
    );
  }
  // Style like base with another size, bold, italic or underline (header and signatures of the forms: Ρυθμίσεις ›
  // Γράμματα Excel). Keeps the font, borders, alignment and fill of the cell.
  async partStyle(base: number | null, o: XlPart): Promise<number> {
    const st = await this.loadStyles();
    st.parted = st.parted || new Map();
    const b = base ?? 0;
    const key = b + ':' + JSON.stringify([o.sz, o.b, o.i, o.u]);
    if (st.parted.has(key)) return st.parted.get(key)!;
    let x = this.xfList(st.xml)[b] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    const fid = this.fontLike(Number(attr(x.slice(0, x.indexOf('>') + 1), 'fontId') || 0), {
      sz: o.sz,
      b: o.b,
      i: o.i,
      u: o.u,
    });
    x = x.replace(/^<xf\b[^>]*?(?=\/?>)/, (a) => setAttr(setAttr(a, 'fontId', String(fid)), 'applyFont', '1'));
    const idx = this.addXf(x);
    st.parted.set(key, idx);
    return idx;
  }
  // Style like base, with gray background (weekends and holidays in the duty check)
  async grayed(base: number): Promise<number> {
    const st = await this.loadStyles();
    const fill = this.part('fills').add(
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>',
    );
    st.grayed = st.grayed || new Map();
    return this.xfLike(base, st.grayed, (x) =>
      x.replace(/^<xf\b[^>]*?(?=\/?>)/, (a) => setAttr(setAttr(a, 'fillId', String(fill)), 'applyFill', '1')),
    );
  }
  // Style like base, centered (horizontally): for a title merged above the table
  async centered(base: number | null): Promise<number> {
    const st = await this.loadStyles();
    return this.xfLike(base ?? 0, st.centered, (x) => withAlign(x, { horizontal: 'center', vertical: 'center' }));
  }

  // Style like base with another alignment, bold or number format («0%», «0.0%»): the value tables of the Έντυπα take
  // the format of the cells of the table
  async like(
    base: number | null,
    o: { h?: 'left' | 'center' | 'right'; b?: boolean; fmt?: string; wrap?: boolean },
  ): Promise<number> {
    const st = await this.loadStyles();
    let x = this.xfList(st.xml)[base ?? 0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    const open = (a: (head: string) => string) => {
      x = x.replace(/^<xf\b[^>]*?(?=\/?>)/, a);
    };
    if (o.b != null) {
      const fid = this.fontLike(Number(attr(x.slice(0, x.indexOf('>') + 1), 'fontId') || 0), { b: o.b });
      open((a) => setAttr(setAttr(a, 'fontId', String(fid)), 'applyFont', '1'));
    }
    if (o.fmt) {
      const id = o.fmt === '0%' ? 9 : this.fmtFor(o.fmt);
      open((a) => setAttr(setAttr(a, 'numFmtId', String(id)), 'applyNumberFormat', '1'));
    }
    if (o.h || o.wrap)
      x = withAlign(
        x,
        { ...(o.h ? { horizontal: o.h } : {}), ...(o.wrap ? { wrapText: '1' } : {}) },
        { vertical: 'center' },
      );
    return this.addXf(x);
  }
  // Style from simple choices, for templates the app creates (Έντυπα › «Φτιάξ' το εδώ»): font of the base of the book
  // at size sz (bold, italic, underlined), fill (rgb without #), thin border and alignment. Same choices → same style.
  async style(o: {
    font?: string;
    sz?: number;
    b?: boolean;
    i?: boolean;
    u?: boolean;
    fill?: string;
    border?: boolean;
    h?: 'left' | 'center' | 'right';
    v?: 'top' | 'center' | 'bottom';
    wrap?: boolean;
  }): Promise<number> {
    await this.loadStyles();
    const font = this.fontLike(0, { name: o.font, sz: o.sz, b: o.b, i: o.i, u: o.u });
    const fill = o.fill
      ? this.part('fills').add(
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const border = o.border ? this.thinBorder() : 0;
    const al = [o.h && `horizontal="${o.h}"`, `vertical="${o.v || 'center'}"`, o.wrap && 'wrapText="1"']
      .filter(Boolean)
      .join(' ');
    return this.addXf(
      `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''} applyAlignment="1"><alignment ${al}/></xf>`,
    );
  }
  // Rows repeated on every printed page (Print_Titles), if the sheet does not have them yet; false: it had them
  setPrintTitles(sheet: string, r1: number, r2: number): boolean {
    const i = this.names.findIndex((x) => x.name === sheet);
    if (i < 0) return false;
    if (
      [...this.workbookXml.matchAll(/<definedName\b([^>]*)>/g)].some(
        (m) => attr(m[1], 'name') === '_xlnm.Print_Titles' && attr(m[1], 'localSheetId') === String(i),
      )
    )
      return false;
    const dn = `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(sheet).replace(/'/g, '&apos;&apos;')}'!$${r1}:$${r2}</definedName>`;
    if (/<definedNames>/.test(this.workbookXml))
      this.workbookXml = this.workbookXml.replace('<definedNames>', '<definedNames>' + dn);
    else this.workbookXml = this.workbookXml.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
    return true;
  }
  // Removes the title rows (Print_Titles) of the sheet when they are only row r (e.g. a header that was hidden)
  dropPrintTitles(sheet: string, r: number): boolean {
    const i = this.names.findIndex((x) => x.name === sheet);
    if (i < 0) return false;
    let gone = false;
    this.workbookXml = this.workbookXml.replace(
      /<definedName\b([^>]*)>([^<]*)<\/definedName>/g,
      (m, a: string, b: string) => {
        if (
          attr(a, 'name') !== '_xlnm.Print_Titles' ||
          attr(a, 'localSheetId') !== String(i) ||
          !new RegExp('!\\$' + r + ':\\$' + r + '$').test(unesc(b))
        )
          return m;
        gone = true;
        return '';
      },
    );
    return gone;
  }
  // Style like base with another letter size and/or wrapping (keeps borders, alignment, fill, number format)
  private fitStyle(base: number, fontId: number, sz: number | null, wrap: boolean): number {
    const st = this.styles!;
    st.fitted = st.fitted || new Map();
    const key = base + ':' + sz + ':' + wrap;
    if (st.fitted.has(key)) return st.fitted.get(key)!;
    let x = this.xfList(st.xml)[base] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    if (sz != null) {
      const fid = this.fontLike(fontId, { sz });
      x = x.replace(/^<xf\b[^>]*?(?=\/?>)/, (a) => setAttr(setAttr(a, 'fontId', String(fid)), 'applyFont', '1'));
    }
    if (wrap) x = withAlign(x, { wrapText: '1' });
    const idx = this.addXf(x);
    st.fitted.set(key, idx);
    return idx;
  }
  // Last column of the print area of the sheet (Infinity if it has none)
  printLastCol(sheet: string): number {
    const i = this.names.findIndex((x) => x.name === sheet);
    const m = [...this.workbookXml.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)].find(
      (x) => attr(x[1], 'name') === '_xlnm.Print_Area' && attr(x[1], 'localSheetId') === String(i),
    );
    if (!m) return Infinity;
    const cols = [...unesc(m[2]).matchAll(/!\$?([A-Z]+)\$?\d+(?::\$?([A-Z]+)\$?\d+)?/g)].map((x) =>
      colNum(x[2] || x[1]),
    );
    return cols.length ? Math.max(...cols) : Infinity;
  }
  // What the app wrote must show whole inside its cell (or merge), without being cut, running over other cells or
  // borders, or going outside the print area (Michael, 18/10). The layout of the form stays the same: slightly smaller
  // letters or wrapping within the height it has, and only if that is not enough the row grows taller (fitText).
  // Text without a border aligned left spreads, as in Excel, over the empty cells to its right up to the print edge.
  private async fitSheet(ws: Sheet, refs: Iterable<string>): Promise<void> {
    const st = await this.loadStyles();
    const xfs = this.xfList(st.xml);
    const fonts = this.part('fonts').items;
    const borders = this.part('borders').items;
    // once per style (fontOf: a copy, because rich-text cells change the size)
    const fontMemo = new Map<number, FontSpec>(),
      infoMemo = new Map<number, ReturnType<typeof info0>>();
    const fontOf = (i: number): FontSpec => {
      let f = fontMemo.get(i);
      if (!f) {
        f = fontOf0(i);
        fontMemo.set(i, f);
      }
      return { ...f };
    };
    const info = (s: number | null) => {
      const k = s ?? 0;
      let x = infoMemo.get(k);
      if (!x) {
        x = info0(k);
        infoMemo.set(k, x);
      }
      return x;
    };
    const fontOf0 = (i: number): FontSpec => {
      const f = fonts[i] ?? fonts[0] ?? '';
      return {
        name: attr(/<name\b[^>]*>/.exec(f)?.[0] || '', 'val') || 'Calibri',
        sz: Number(attr(/<sz\b[^>]*>/.exec(f)?.[0] || '', 'val') || 11),
        b: /<b\/>|<b val="(1|true)"\/>/.test(f),
      };
    };
    const info0 = (s: number | null) => {
      const x = xfs[s ?? 0] || '';
      const open = x.slice(0, x.indexOf('>') + 1);
      const al = /<alignment\b[^>]*>/.exec(x)?.[0] || '';
      const bd = borders[Number(attr(open, 'borderId') || 0)] || '';
      return {
        fontId: Number(attr(open, 'fontId') || 0),
        h: attr(al, 'horizontal') || 'general',
        wrap: /^(1|true)$/.test(attr(al, 'wrapText') || ''),
        rot: Number(attr(al, 'textRotation') || 0),
        l: /<(left|start)\b[^>]*\sstyle="/.test(bd),
        r: /<(right|end)\b[^>]*\sstyle="/.test(bd),
      };
    };
    const mdw = digitPx(fontOf(0));
    const colPx = (c: number) => Math.floor(ws.colWidth(c) * mdw);
    const merges = ws.merges();
    const top = new Map<string, (typeof merges)[number]>();
    const inside = new Set<string>();
    for (const m of merges)
      for (let r = m.r1; r <= m.r2; r++)
        for (let c = m.c1; c <= m.c2; c++)
          r === m.r1 && c === m.c1 ? top.set(colName(c) + r, m) : inside.add(colName(c) + r);
    const last = Math.min(this.printLastCol(ws.name), ws.lastCol());
    const sst = await this.sharedStrings();
    const textOf = async (x: {
      t: string | null;
      s: number | null;
      inner: string;
    }): Promise<{ t: string; num: boolean } | null> => {
      if (x.t === 'inlineStr') return { t: texts(x.inner), num: false };
      if (x.t === 's') return { t: sst[Number(/<v>([^<]*)<\/v>/.exec(x.inner)?.[1])] ?? '', num: false };
      if (x.t == null || x.t === 'n') {
        const v = /<v>([^<]*)<\/v>/.exec(x.inner)?.[1];
        if (v == null || v === '') return null;
        return { t: (await this.isDateStyle(x.s)) ? '00/00/0000' : String(Number(v)), num: true };
      }
      return null;
    };
    const list = [...refs];
    // Table columns as wide as needed (Michael, 20/10: «να φαίνεται πλήρως και το όνομα της στήλης και οι τιμές όλων»):
    // a cell with a border → its column grows so that the header and the values fit on one line, up to WIDE_MAX
    // characters. It never narrows. What exceeds the limit shrinks a little or wraps, as before.
    if (this.widen) {
      const need = new Map<number, number>();
      const wide: { c1: number; c2: number; px: number }[] = [];
      for (const ref of list) {
        if (inside.has(ref)) continue;
        const x = ws.raw(ref);
        if (!x || x.inner.includes('<f')) continue;
        const k = info(x.s);
        if (k.rot || !(k.l || k.r)) continue;
        const v = await textOf(x);
        if (!v || !v.t.trim()) continue;
        const { c, r } = splitRef(ref);
        if (ws.rowHidden(r)) continue;
        const font = fontOf(k.fontId);
        if (x.t === 'inlineStr' && x.inner.includes('<r>')) {
          const sz = Number(/<sz val="([^"]*)"\/>/.exec(x.inner)?.[1]);
          if (sz > 0) font.sz = sz;
        }
        const px = Math.max(...v.t.split('\n').map((l) => textPx(l, font))) + 8;
        // a merge only downwards (ΦΡΟΥΡΑ names over 3 rows) is one cell of the column; across the width: below
        const mg = top.get(ref);
        if (mg && mg.c2 > mg.c1) wide.push({ c1: mg.c1, c2: mg.c2, px });
        else need.set(c, Math.max(need.get(c) || 0, px));
      }
      const grow = (c: number, px: number) => {
        const cur = ws.colWidth(c);
        if (cur <= 0) return;
        const w = Math.min(WIDE_MAX, Math.ceil((px / mdw + 0.2) * 10) / 10);
        if (w > cur + 0.05) ws.setColWidth(c, w);
      };
      for (const [c, px] of need) grow(c, px);
      // merged across the width (e.g. kitchen names F:H): what is missing goes to the widest column of the merge
      for (const m of wide) {
        let have = 0,
          at = m.c1;
        for (let i = m.c1; i <= m.c2; i++) {
          have += colPx(i);
          if (ws.colWidth(i) > ws.colWidth(at)) at = i;
        }
        if (m.px > have) grow(at, colPx(at) + m.px - have);
      }
    }
    type Item = {
      ref: string;
      t: string;
      num: boolean;
      rich: boolean;
      s: number;
      k: ReturnType<typeof info>;
      font: FontSpec;
      box: Box;
      own: number;
      r2: number;
      base: number;
      key: string;
      r: number;
      fit: Fit | null;
    };
    const items: Item[] = [];
    const fitOf = (t: string, font: FontSpec, box: Box, own: number, min?: number) => {
      const fit = fitText(t, font, box, min, this.keepSize);
      // with wrapping the text no longer spreads over the neighbouring cells: the lines count in its own width
      return fit?.wrap && !box.wrap && box.w > own - 6
        ? fitText(t, font, { ...box, w: own - 6 }, min, this.keepSize)
        : fit;
    };
    for (const ref of list) {
      const x = ws.raw(ref);
      if (!x || x.inner.includes('<f') || inside.has(ref)) continue;
      const rich = x.t === 'inlineStr' && x.inner.includes('<r>');
      const v = await textOf(x);
      if (!v) continue;
      const { t, num } = v;
      if (!t.trim()) continue;
      const k = info(x.s);
      if (k.rot) continue;
      const { c, r } = splitRef(ref);
      const m = top.get(ref) || { c1: c, r1: r, c2: c, r2: r };
      let w = 0,
        h = 0,
        hidden = false;
      for (let i = m.c1; i <= m.c2; i++) w += colPx(i);
      const own = w;
      for (let i = m.r1; i <= m.r2; i++) {
        if (ws.rowHidden(i)) hidden = true;
        h += ws.rowHeight(i);
      }
      if (hidden || w <= 0) continue;
      // spread over empty neighbouring cells (only text in a single cell, without wrapping)
      if (!top.has(ref) && !k.wrap && !num) {
        const side = (dir: 1 | -1) => {
          let px = 0;
          let prev = k;
          for (let i = c + dir; i >= 1 && i <= last; i += dir) {
            const nr = colName(i) + r;
            if (ws.raw(nr) || top.has(nr) || inside.has(nr)) break;
            const nk = info(ws.style(nr));
            if (dir > 0 ? prev.r || nk.l : prev.l || nk.r) break;
            px += colPx(i);
            prev = nk;
          }
          return px;
        };
        if (k.h === 'general' || k.h === 'left') w += side(1);
        else if (k.h === 'right') w += side(-1);
        else if (k.h === 'center') w += 2 * Math.min(side(1), side(-1));
      }
      const font = fontOf(k.fontId);
      if (rich) {
        const sz = Number(/<sz val="([^"]*)"\/>/.exec(x.inner)?.[1]);
        if (sz > 0) font.sz = sz;
      }
      const box: Box = { w: w - 6, h, wrap: k.wrap, num };
      items.push({
        ref,
        t,
        num,
        rich,
        s: x.s ?? 0,
        k,
        font,
        box,
        own,
        r2: m.r2,
        base: ws.rowHeight(m.r2),
        key: [c, m.c2 - m.c1, m.r2 - m.r1, x.s, rich].join(':'),
        r,
        fit: fitOf(t, font, box, own),
      });
    }
    // Cells of the same column with the same style, one below the other (names of a list, barracks guards per 3 rows):
    // all with the same letter size, so that they line up: the largest that fits all of them without making the row
    // taller. Those that do not fit even at minSize wrap at that size and only their own row grows taller.
    const groups = new Map<string, Item[]>();
    for (const it of items) groups.set(it.key, [...(groups.get(it.key) || []), it]);
    for (const list of groups.values()) {
      list.sort((a, b) => a.r - b.r);
      const runs: Item[][] = [];
      for (const it of list) {
        const run = runs[runs.length - 1];
        if (run && it.r - run[run.length - 1].r <= 3) run.push(it);
        else runs.push([it]);
      }
      for (const run of runs) {
        if (run.length < 2 || run[0].num || this.keepSize) continue;
        const floor = minSize(run[0].font.sz);
        const ok = run.filter((it) => !it.fit || (!it.fit.grow && it.fit.sz >= floor));
        if (!ok.length) continue;
        const g = Math.min(...ok.map((it) => (it.fit ? it.fit.sz : it.font.sz)));
        for (const it of run) {
          const was = it.fit ? it.fit.sz : it.font.sz;
          if (was === g) continue;
          const f = fitOf(it.t, { ...it.font, sz: g }, it.box, it.own, g);
          it.fit = f || { sz: g, wrap: it.fit?.wrap ?? it.k.wrap, grow: 0 };
        }
      }
    }
    for (const it of items) {
      const fit = it.fit;
      if (!fit) continue;
      const sz = fit.sz !== it.font.sz ? fit.sz : null;
      if (sz != null || fit.wrap !== it.k.wrap)
        ws.setStyle(it.ref, this.fitStyle(it.s, it.k.fontId, it.rich ? null : sz, fit.wrap));
      if (it.rich && sz != null) ws.sizeRuns(it.ref, sz);
      const want = Math.round((it.base + fit.grow) * 100) / 100;
      if (fit.grow > 0 && want > ws.rowHeight(it.r2)) ws.setRowHeight(it.r2, want);
    }
  }

  // Text in rows with underlined pieces (ΗΚΑΙ: 4. ΠΟΙΝΕΣ, 5. ΑΙΤΗΣΕΙΣ). Keeps the border and font of the cell: every
  // piece gets the font of the cell (otherwise Excel puts the default of the book), wraps, and the row grows as needed
  // (Excel does not do that itself in merged cells). Empty = clears the cell.
  async setRich(ws: Sheet, ref: string, lines: { t: string; u?: boolean }[][]): Promise<void> {
    lines = lines.filter((l) => l.some((r) => r.t));
    if (!lines.length) {
      ws.set(ref, null);
      return;
    }
    const st = await this.loadStyles();
    const base = ws.style(ref) ?? 0;
    const xfs = this.xfList(st.xml);
    const src = xfs[base] || '';
    const fonts = [
      ...(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(st.xml)?.[1].matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g) ||
        []),
    ].map((x) => x[0]);
    const font = fonts[Number(attr(src.slice(0, src.indexOf('>') + 1), 'fontId') || 0)] || '';
    const parts = new Map<string, string>();
    for (const m of font.replace(/^<font\b[^>]*>/, '').matchAll(/<(\w+)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g))
      parts.set(m[1], m[0]);
    if (parts.has('name')) parts.set('rFont', parts.get('name')!.replace(/^<name\b/, '<rFont'));
    const sz = Number(attr(parts.get('sz') || '', 'val') || 11);
    const rPr = (u?: boolean) =>
      '<rPr>' +
      RPR_ORDER.map((k) => (k === 'u' && u && !parts.has('u') ? '<u/>' : parts.get(k) || '')).join('') +
      '</rPr>';
    const runs = lines
      .flatMap((l, i) => l.filter((r) => r.t).map((r, j) => ({ t: (i && !j ? '\n' : '') + r.t, u: r.u })))
      .map((r) => `<r>${rPr(r.u)}<t xml:space="preserve">${esc(text(r.t))}</t></r>`)
      .join('');
    ws.setRuns(ref, runs);
    if (!/<alignment\b[^>]*wrapText="(1|true)"/.test(src))
      ws.setStyle(
        ref,
        await this.xfLike(base, st.wrapped, (x) => withAlign(x, { wrapText: '1' }, { vertical: 'top' })),
      );
    // how many lines it takes on paper: width of the merge in characters (≈7px each) over the width of one letter of
    // the font
    const { c, r } = splitRef(ref);
    const mg = ws.mergeAt(ref) || { c1: c, r1: r, c2: c, r2: r };
    let w = 0;
    for (let k = mg.c1; k <= mg.c2; k++) w += ws.colWidth(k);
    const perLine = Math.max(10, Math.floor((w * 7) / (sz * (96 / 72) * 0.6)));
    const n = lines.reduce((a, l) => a + Math.max(1, Math.ceil(l.map((x) => x.t).join('').length / perLine)), 0);
    let have = 0;
    for (let k = mg.r1; k <= mg.r2; k++) have += ws.rowHeight(k);
    const need = Math.ceil(n * sz * 1.35 * 10) / 10;
    if (need > have) ws.setRowHeight(mg.r1, Math.round((ws.rowHeight(mg.r1) + need - have) * 10) / 10); // never shrinks
  }

  // The values of the sheet as a [row][column] array from 0: text, number, date (UTC) or empty. Formulas give their
  // result. fx: the cells with a formula go here («row:column» from 0)
  async values(nameOrIndex: string | number, maxRows = 2000, maxCols = 40, fx?: Set<string>): Promise<XlValue[][]> {
    const ws = await this.sheet(nameOrIndex);
    const sst = await this.sharedStrings();
    await this.loadStyles();
    const y1904 = this.date1904;
    const out: XlValue[][] = [];
    for (const x of ws.cells()) {
      if (x.r > maxRows || x.c > maxCols || !x.inner) continue;
      if (fx && x.inner.includes('<f')) fx.add(x.r - 1 + ':' + (x.c - 1));
      let v: XlValue = null;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(x.inner)?.[1];
      if (x.t === 's') v = raw != null ? (sst[Number(raw)] ?? null) : null;
      else if (x.t === 'inlineStr') v = texts(x.inner);
      else if (x.t === 'str') v = raw != null ? unesc(raw) : null;
      else if (x.t === 'b') v = raw === '1';
      else if (x.t === 'e') v = null;
      else if (raw != null && raw !== '') {
        const n = Number(raw);
        v =
          Number.isFinite(n) && (await this.isDateStyle(x.s))
            ? new Date(Math.round((y1904 ? EPOCH_1904 : EPOCH) + n * DAY))
            : n;
      }
      if (v === '' || v == null) continue;
      (out[x.r - 1] ||= [])[x.c - 1] = v;
    }
    for (let i = 0; i < out.length; i++) out[i] ||= [];
    return out;
  }

  // New empty sheet at the end (e.g. «ΤΙΜΩΡΗΜΕΝΟΙ» inside the Δυναμολόγιο). Macros and the other sheets stay as they
  // were.
  async addSheet(name: string): Promise<Sheet> {
    const safe = sheetSafe(name);
    if (this.hasSheet(safe)) return this.sheet(safe);
    return this.newSheet(
      safe,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>',
    );
  }
  private async newSheet(safe: string, xml: string): Promise<Sheet> {
    let n = this.names.length + 1;
    while (this.zip.file(`xl/worksheets/sheet_a${n}.xml`)) n++;
    const path = `xl/worksheets/sheet_a${n}.xml`;
    this.zip.file(path, xml);
    const rp = 'xl/_rels/workbook.xml.rels';
    let rels = await this.zip.file(rp)!.async('string');
    const rid = 'rId' + (Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1);
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}"/></Relationships>`,
    );
    this.zip.file(rp, rels);
    const ct = await this.zip.file('[Content_Types].xml')!.async('string');
    this.zip.file(
      '[Content_Types].xml',
      ct.replace(
        '</Types>',
        `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ),
    );
    const id = Math.max(0, ...[...this.workbookXml.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1])) + 1;
    const ns = /xmlns:r=/.test(
      this.workbookXml.slice(0, this.workbookXml.indexOf('>', this.workbookXml.indexOf('<workbook'))),
    )
      ? ''
      : ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    this.workbookXml = this.workbookXml.replace(
      '</sheets>',
      `<sheet name="${esc(safe)}" sheetId="${id}"${ns} r:id="${rid}"/></sheets>`,
    );
    this.names.push({ name: safe, path });
    return this.sheet(safe);
  }
  // The XML of a sheet as it is now (with what was written), without what points to other parts of the file (drawings,
  // images, tables, comments, printer settings): for a copy of the sheet in the same or in another book
  private async bareXml(name: string): Promise<string> {
    const ws = await this.sheet(name);
    return ws
      .toXml()
      .replace(/<drawing\b[^>]*\/>|<legacyDrawing\b[^>]*\/>|<legacyDrawingHF\b[^>]*\/>|<picture\b[^>]*\/>/g, '')
      .replace(/<tableParts\b[\s\S]*?<\/tableParts>|<tableParts\b[^>]*\/>|<hyperlinks>[\s\S]*?<\/hyperlinks>/g, '')
      .replace(/\sr:id="[^"]*"/g, '')
      .replace(/\stabSelected="1"/g, '');
  }
  sheetIndex(name: string) {
    return this.names.findIndex((x) => x.name === name);
  }
  // The print names (area, rows on every page) of a sheet, with another sheet name inside them
  private localNames(i: number, sheet: string): string[] {
    const q = (n: string) => "'" + n.replace(/'/g, "''") + "'!";
    return [...this.workbookXml.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)]
      .filter(
        (m) =>
          attr(m[1], 'localSheetId') === String(i) && /^_xlnm\.Print_(Area|Titles)$/.test(attr(m[1], 'name') || ''),
      )
      .map((m) => ({
        name: attr(m[1], 'name')!,
        body: unesc(m[2])
          .split(',')
          .map((x) => q(sheet) + x.replace(/^.*!/, ''))
          .join(','),
      }))
      .map(
        (x) => `<definedName name="${x.name}" localSheetId="__">${esc(x.body).replace(/'/g, '&apos;')}</definedName>`,
      );
  }
  private setLocalNames(i: number, dns: string[]) {
    this.workbookXml = this.workbookXml.replace(/<definedName\b([^>]*)>[^<]*<\/definedName>/g, (m, a: string) =>
      attr(a, 'localSheetId') === String(i) && /^_xlnm\.Print_(Area|Titles)$/.test(attr(a, 'name') || '') ? '' : m,
    );
    const add = dns.map((d) => d.replace('localSheetId="__"', `localSheetId="${i}"`)).join('');
    if (!add) return;
    if (/<definedNames>/.test(this.workbookXml))
      this.workbookXml = this.workbookXml.replace('<definedNames>', '<definedNames>' + add);
    else this.workbookXml = this.workbookXml.replace('</sheets>', '</sheets><definedNames>' + add + '</definedNames>');
  }
  // Copy of a sheet in the same book (same styles and texts), at the end, with its print settings (Έντυπα: one sheet
  // per room)
  async cloneSheet(from: string, name: string): Promise<Sheet> {
    const safe = sheetSafe(name);
    if (this.hasSheet(safe)) throw new Error('Υπάρχει ήδη φύλλο ' + safe);
    const dns = this.localNames(this.sheetIndex(from), safe);
    const ws = await this.newSheet(safe, await this.bareXml(from));
    this.setLocalNames(this.sheetIndex(safe), dns);
    return ws;
  }
  // New sheet name (also in the print areas that mention it)
  renameSheet(from: string, to: string): string {
    const safe = sheetSafe(to);
    const e = this.names.find((x) => x.name === from);
    if (!e || from === safe) return from;
    this.workbookXml = this.workbookXml.replace(/<sheet\b[^>]*>/g, (t) =>
      attr(t, 'name')?.replace(/&amp;/g, '&') === from ? setAttr(t, 'name', esc(safe)) : t,
    );
    // the name inside the definedName is written 'NAME'! or &apos;NAME&apos;! (our template has the first) or without
    // quotes
    const a = esc(from),
      b = "'" + esc(safe).replace(/'/g, "''") + "'!";
    this.workbookXml = this.workbookXml.replace(
      /(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g,
      (m, x, body: string, y) => {
        const plain = body.replace(/&apos;/g, "'"),
          out = plain
            .split("'" + a.replace(/'/g, "''") + "'!")
            .join(b)
            .split(a + '!')
            .join(b);
        return out === plain ? m : x + out.replace(/'/g, '&apos;') + y;
      },
    );
    e.name = safe;
    const ws = this.sheets.get(e.path);
    if (ws) ws.name = safe;
    return safe;
  }
  // Sheet from another book (Έντυπα › «Φύλλο στο Δυναμολόγιο»): its styles are carried over (same → same style), the
  // shared texts become texts inside the cell, and whatever points to other parts of its file (drawings, tables)
  // stays behind. If a sheet with that name already exists, it is written over it in the same position; the other
  // sheets do not change.
  async importSheet(src: Workbook, from: string, name: string): Promise<Sheet> {
    const safe = sheetSafe(name);
    let xml = await src.bareXml(from);
    // conditional formatting and lists from other sheets point at things of the other book
    xml = xml
      .replace(/<conditionalFormatting\b[\s\S]*?<\/conditionalFormatting>|<extLst>[\s\S]*?<\/extLst>/g, '')
      .replace(
        /<dataValidation\b[^>]*>(?:(?!<\/dataValidation>)[\s\S])*!(?:(?!<\/dataValidation>)[\s\S])*<\/dataValidation>/g,
        '',
      );
    xml = xml.replace(/<dataValidations\b[^>]*count="\d+"[^>]*>\s*<\/dataValidations>/g, '');
    // shared texts → inside the cell
    const f = src.zip.file('xl/sharedStrings.xml') || src.zip.file(/sharedStrings\.xml$/i)[0];
    const sis = f
      ? [...(await f.async('string')).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) =>
          (m[1] || '').replace(/<rPh\b[\s\S]*?<\/rPh>|<phoneticPr\b[^>]*\/>/g, ''),
        )
      : [];
    xml = xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, a: string, inner?: string) => {
      if (attr(a, 't') !== 's' || inner == null) return m;
      const v = /<v>(\d+)<\/v>/.exec(inner);
      const si = v ? (sis[+v[1]] ?? '') : '';
      return `<c${setAttr(a, 't', 'inlineStr')}><is>${si || '<t></t>'}</is></c>`;
    });
    // styles: those the sheet uses, with their fonts, fills, borders and number formats
    const ids = new Set<number>();
    for (const m of xml.matchAll(/<(?:c|row)\b[^>]*?\ss="(\d+)"/g)) ids.add(+m[1]);
    for (const m of xml.matchAll(/<col\b[^>]*?\sstyle="(\d+)"/g)) ids.add(+m[1]);
    const map = await this.adoptStyles(src, ids);
    const re = (n: string) => String(map.get(+n) ?? 0);
    xml = xml
      .replace(/<(c|row)\b[^>]*?>/g, (t) => t.replace(/(\ss=")(\d+)(")/, (_m, a, n, b) => a + re(n) + b))
      .replace(/<col\b[^>]*?>/g, (t) => t.replace(/(\sstyle=")(\d+)(")/, (_m, a, n, b) => a + re(n) + b));
    const dns = src.localNames(src.sheetIndex(from), safe);
    let ws: Sheet;
    if (this.hasSheet(safe)) {
      const e = this.names.find((x) => x.name === safe)!;
      this.zip.file(e.path, xml);
      ws = new Sheet(safe, e.path, xml);
      this.sheets.set(e.path, ws);
    } else ws = await this.newSheet(safe, xml);
    this.setLocalNames(this.sheetIndex(safe), dns);
    return ws;
  }
  // Sheets that the Έντυπα wrote: a mark inside the file (hidden name of the sheet), so that any part of the app that
  // looks for sheets by their name (e.g. «ΘΑΛΑΜΟΙ» for the new soldiers) does not run into them
  markReport(name: string) {
    const i = this.sheetIndex(name);
    if (i < 0 || this.reportSheets().has(name)) return;
    const dn = `<definedName name="${REPORT_MARK}" localSheetId="${i}" hidden="1">TRUE</definedName>`;
    if (/<definedNames>/.test(this.workbookXml))
      this.workbookXml = this.workbookXml.replace('</definedNames>', dn + '</definedNames>');
    else this.workbookXml = this.workbookXml.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
  }
  // Header, date, title and signatures keep their size when printing shrinks or enlarges the table (Michael, 22/10):
  // a hidden name of the sheet with their areas, which the printing of the app reads (print.ts)
  markFixed(name: string, areas: { r1: number; c1: number; r2: number; c2: number }[]) {
    this.markAreas(name, FIXED_MARK, areas, false);
  }
  // add: the areas are added to those the name already has (otherwise they replace them)
  markAreas(name: string, mark: string, areas: { r1: number; c1: number; r2: number; c2: number }[], add: boolean) {
    const i = this.sheetIndex(name);
    if (i < 0) return;
    let old = '';
    this.workbookXml = this.workbookXml.replace(
      /<definedName\b([^>]*)>([^<]*)<\/definedName>/g,
      (m, a: string, b: string) => {
        if (attr(a, 'name') === mark && attr(a, 'localSheetId') === String(i)) {
          old = b;
          return '';
        }
        return m;
      },
    );
    if (!areas.length && !(add && old)) return;
    const q = "'" + name.replace(/'/g, "''") + "'!";
    const body = [
      ...(add && old ? [unesc(old)] : []),
      ...areas.map((b) => q + '$' + colName(b.c1) + '$' + b.r1 + ':$' + colName(b.c2) + '$' + b.r2),
    ].join(',');
    const dn = `<definedName name="${mark}" localSheetId="${i}" hidden="1">${esc(body).replace(/'/g, '&apos;')}</definedName>`;
    if (/<definedNames>/.test(this.workbookXml))
      this.workbookXml = this.workbookXml.replace('</definedNames>', dn + '</definedNames>');
    else this.workbookXml = this.workbookXml.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
  }
  reportSheets(): Set<string> {
    const out = new Set<string>();
    for (const m of this.workbookXml.matchAll(/<definedName\b([^>]*)>/g))
      if (attr(m[1], 'name') === REPORT_MARK) {
        const n = this.names[Number(attr(m[1], 'localSheetId'))];
        if (n) out.add(n.name);
      }
    return out;
  }
  private async adoptStyles(src: Workbook, ids: Set<number>): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (!ids.size) return out;
    await this.loadStyles();
    const sst = await src.loadStyles();
    const xfs = src.xfList(sst.xml);
    const sp = { fonts: src.part('fonts').items, fills: src.part('fills').items, borders: src.part('borders').items };
    for (const id of ids) {
      const xf = xfs[id];
      if (!xf) {
        out.set(id, 0);
        continue;
      }
      const open = xf.slice(0, xf.indexOf('>') + 1);
      let a = open;
      const font = sp.fonts[Number(attr(open, 'fontId') || 0)],
        fill = sp.fills[Number(attr(open, 'fillId') || 0)],
        border = sp.borders[Number(attr(open, 'borderId') || 0)];
      if (font) a = setAttr(a, 'fontId', String(this.part('fonts').add(font)));
      if (fill) a = setAttr(a, 'fillId', String(this.part('fills').add(fill)));
      if (border) a = setAttr(a, 'borderId', String(this.part('borders').add(border)));
      const nf = Number(attr(open, 'numFmtId') || 0);
      if (nf >= 164 && sst.codes.has(nf)) a = setAttr(a, 'numFmtId', String(this.fmtFor(sst.codes.get(nf)!)));
      a = setAttr(a, 'xfId', '0');
      out.set(id, this.addXf(a + xf.slice(open.length)));
    }
    return out;
  }
  // Number format with this code: the existing one of the book, otherwise a new one
  private fmtFor(code: string): number {
    const st = this.styles!;
    for (const [id, c] of st.codes) if (c === code) return id;
    const id = Math.max(163, ...st.codes.keys()) + 1;
    const nf = '<numFmt numFmtId="' + id + '" formatCode="' + esc(code) + '"/>';
    const m = /<numFmts\b[^>]*?(\/>|>)/.exec(st.xml);
    if (m) {
      const n = (st.xml.match(/<numFmt\b/g) || []).length + 1;
      const open = setAttr(m[0].replace(/\/?>$/, ''), 'count', String(n)) + '>';
      st.xml = st.xml.replace(m[0], m[1] === '/>' ? open + nf + '</numFmts>' : open + nf);
    } else st.xml = st.xml.replace(/(<styleSheet\b[^>]*>)/, '$1<numFmts count="1">' + nf + '</numFmts>');
    st.codes.set(id, code);
    st.dirty = true;
    return id;
  }

  // New file with one sheet (style 1 = bold with border for headers, 2 = border, 3 = date with border)
  static async blank(sheetName: string): Promise<Workbook> {
    const z = new JSZip();
    const name = esc(sheetName.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    z.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    );
    z.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    );
    z.file(
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    z.file(
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    );
    z.file(
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    );
    z.file(
      'xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>',
    );
    const wb = await Workbook.open(await z.generateAsync({ type: 'nodebuffer' }));
    wb.widen = true;
    return wb;
  }

  // Print area and other names of the sheet
  shiftNames(sheet: string, after: number, n: number) {
    this.workbookXml = this.workbookXml.replace(
      /(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g,
      (_m, a, body: string, c) => {
        const plain = body.replace(/&apos;/g, "'");
        if (!plain.includes(sheet + '!') && !plain.includes(sheet.replace(/'/g, "''") + "'!")) return a + body + c;
        return a + shiftFormula(body, sheet, false, after, n).replace(/'/g, '&apos;') + c;
      },
    );
  }
  // The print area of the sheet reaches at least row `row` (e.g. a name below a signature); without an area, nothing
  // Last row of the print area (null if it has none)
  printLastRow(sheet: string): number | null {
    const i = this.names.findIndex((x) => x.name === sheet);
    const m = [...this.workbookXml.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)].find(
      (x) => attr(x[1], 'name') === '_xlnm.Print_Area' && attr(x[1], 'localSheetId') === String(i),
    );
    const r = m && /:\$?[A-Z]+\$?(\d+)(?:$|,)/.exec(unesc(m[2]));
    return r ? Number(r[1]) : null;
  }
  // The print area of the sheet reaches at least column col (from 1)
  printWidenTo(sheet: string, col: number) {
    const i = this.names.findIndex((x) => x.name === sheet);
    if (i < 0) return;
    this.workbookXml = this.workbookXml.replace(
      /(<definedName\b([^>]*)>)([^<]*)(<\/definedName>)/g,
      (m, a: string, at: string, body: string, c: string) => {
        if (attr(at, 'name') !== '_xlnm.Print_Area' || attr(at, 'localSheetId') !== String(i)) return m;
        return (
          a +
          body.replace(/(:\$?)([A-Z]+)(?=\$?\d+(?:$|,))/, (x, p: string, cl: string) =>
            colNum(cl) < col ? p + colName(col) : x,
          ) +
          c
        );
      },
    );
  }
  // Removes a sheet from the book (and the print names it had); false if it is the only one or does not exist
  async dropSheet(name: string): Promise<boolean> {
    const i = this.names.findIndex((x) => x.name === name);
    if (i < 0 || this.names.length < 2) return false;
    const e = this.names[i];
    const tag = [...this.workbookXml.matchAll(/<sheet\b[^>]*>/g)].find(
      (m) => attr(m[0], 'name')?.replace(/&amp;/g, '&') === name,
    )?.[0];
    if (!tag) return false;
    const rid = attr(tag, 'r:id');
    this.workbookXml = this.workbookXml.replace(tag, '');
    // the local names of the sheets after this one move up one position; those of the sheet that leaves are deleted
    this.workbookXml = this.workbookXml.replace(/<definedName\b([^>]*)>[^<]*<\/definedName>/g, (m, a: string) => {
      const l = attr(a, 'localSheetId');
      if (l == null) return m;
      if (Number(l) === i) return '';
      return Number(l) > i ? m.replace(`localSheetId="${l}"`, `localSheetId="${Number(l) - 1}"`) : m;
    });
    this.workbookXml = this.workbookXml.replace(/<workbookView\b[^>]*>/, (v) =>
      setAttr(setAttr(v, 'activeTab', '0'), 'firstSheet', '0'),
    );
    const rp = 'xl/_rels/workbook.xml.rels';
    const rels = await this.zip.file(rp)!.async('string');
    this.zip.file(rp, rid ? rels.replace(new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*/>'), '') : rels);
    const ct = await this.zip.file('[Content_Types].xml')!.async('string');
    this.zip.file(
      '[Content_Types].xml',
      ct.replace(
        new RegExp('<Override\\b[^>]*PartName="/' + e.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>'),
        '',
      ),
    );
    // whatever the sheet points to (tables, comments, drawings) leaves with it
    const sr = this.zip.file(e.path.replace(/([^/]+)$/, '_rels/$1.rels'));
    let ct2 = await this.zip.file('[Content_Types].xml')!.async('string');
    if (sr)
      for (const m of (await sr.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
        const target = attr(m[0], 'Target') || '';
        if (!/\/(table|comments|vmlDrawing|drawing)$/.test(attr(m[0], 'Type') || '')) continue;
        const part = (target.startsWith('/') ? target.slice(1) : e.path.replace(/[^/]+$/, '') + target)
          .split('/')
          .reduce((a: string[], x) => (x === '..' ? a.slice(0, -1) : x === '.' ? a : [...a, x]), [])
          .join('/');
        this.zip.remove(part);
        this.zip.remove(part.replace(/([^/]+)$/, '_rels/$1.rels'));
        ct2 = ct2.replace(
          new RegExp('<Override\\b[^>]*PartName="/' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>'),
          '',
        );
      }
    this.zip.file('[Content_Types].xml', ct2);
    this.zip.remove(e.path);
    this.zip.remove(e.path.replace(/([^/]+)$/, '_rels/$1.rels'));
    this.sheets.delete(e.path);
    this.names.splice(i, 1);
    return true;
  }
  printDownTo(sheet: string, row: number) {
    const i = this.names.findIndex((x) => x.name === sheet);
    if (i < 0) return;
    this.workbookXml = this.workbookXml.replace(
      /(<definedName\b([^>]*)>)([^<]*)(<\/definedName>)/g,
      (m, a: string, at: string, body: string, c: string) => {
        if (attr(at, 'name') !== '_xlnm.Print_Area' || attr(at, 'localSheetId') !== String(i)) return m;
        return (
          a +
          body.replace(/(:\$?[A-Z]+\$?)(\d+)(?=$|,)/, (x, p: string, n: string) => (Number(n) < row ? p + row : x)) +
          c
        );
      },
    );
  }
  // Excel tables (ListObject) in the sheet
  private tableEdits: { path: string; after: number; n: number }[] = [];
  // The Excel tables of the sheet do not reach below row last (e.g. «Όλη η δύναμη»: the table of the template is only
  // the first, the others have merged titles that Excel does not accept inside a table)
  private tableLimits: { path: string; last: number }[] = [];
  limitTables(sheet: Sheet, last: number) {
    this.tableLimits.push({ path: sheet.path, last });
  }
  shiftTables(sheet: Sheet, after: number, n: number) {
    this.tableEdits.push({ path: sheet.path, after, n });
  }

  async save(): Promise<Buffer> {
    // sheets that were not opened but have formulas toward a sheet where rows went in
    if (this.moved.length)
      for (const e of this.names) {
        if (this.sheets.has(e.path)) continue;
        const xml = await this.zip.file(e.path)?.async('string');
        if (!xml || !xml.includes('<f')) continue;
        const plain = unesc(xml);
        if (this.moved.some((x) => plain.includes(x.sheet + '!') || plain.includes(x.sheet.replace(/'/g, "''") + "'!")))
          await this.sheet(e.name);
      }
    for (const s of this.sheets.values())
      if (s.wrote.size) {
        await this.fitSheet(s, s.wrote);
        s.wrote.clear();
      }
    for (const [path, s] of this.sheets) this.zip.file(path, s.toXml());
    if (this.styles?.dirty) this.zip.file('xl/styles.xml', this.styles.xml);
    // tables: those that contain the row grow, those that are lower move down whole
    for (const ed of this.tableEdits) {
      const relPath = ed.path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rel = this.zip.file(relPath);
      if (!rel) continue;
      const relXml = await rel.async('string');
      // comments (and their box in the VML) and images/drawings below the new rows move down with them
      // (in the VML and in drawings rows count from 0)
      const down = (r0: number) => (r0 >= ed.after ? r0 + ed.n : r0);
      for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
        const target = attr(m[0], 'Target') || '';
        const type = attr(m[0], 'Type') || '';
        const p = target.startsWith('/') ? target.slice(1) : ed.path.replace(/[^/]+$/, '') + target;
        const part = p
          .split('/')
          .reduce((a: string[], x) => (x === '..' ? a.slice(0, -1) : x === '.' ? a : [...a, x]), [])
          .join('/');
        const f = this.zip.file(part);
        if (!f) continue;
        if (/\/comments$/.test(type))
          this.zip.file(
            part,
            (await f.async('string')).replace(
              /(<comment\b[^>]*\sref=")([^"]+)"/g,
              (_x, a: string, r: string) => a + shiftRef(r, ed.after, ed.n) + '"',
            ),
          );
        else if (/\/vmlDrawing$/.test(type))
          this.zip.file(
            part,
            (await f.async('string'))
              .replace(/(<x:Row>)(\d+)(<\/x:Row>)/g, (_x, a: string, r: string, b: string) => a + down(+r) + b)
              .replace(
                /(<x:Anchor>)([^<]*)(<\/x:Anchor>)/g,
                (_x, a: string, l: string, b: string) =>
                  a +
                  l
                    .split(',')
                    .map((v, i) => (i === 2 || i === 6 ? ' '.repeat(i ? 1 : 0) + down(+v) : v))
                    .join(',') +
                  b,
              ),
          );
        else if (/\/drawing$/.test(type))
          this.zip.file(
            part,
            (await f.async('string')).replace(
              /(<xdr:row>)(\d+)(<\/xdr:row>)/g,
              (_x, a: string, r: string, b: string) => a + down(+r) + b,
            ),
          );
      }
      for (const m of relXml.matchAll(/Target="(?:\.\.\/|\/xl\/)tables\/([^"]+)"/g)) {
        const tp = 'xl/tables/' + m[1];
        const f = this.zip.file(tp);
        if (!f) continue;
        const x = (await f.async('string'))
          .replace(/\sref="([^"]+)"/g, (_m2, r: string) => {
            const [a, b] = r.split(':');
            if (!b) return _m2;
            const ra = splitRef(a).r,
              rb = splitRef(b).r;
            return ` ref="${a.replace(/\d+$/, String(ra > ed.after ? ra + ed.n : ra))}:${b.replace(/\d+$/, String(rb >= ed.after ? rb + ed.n : rb))}"`;
          })
          .replace(/<sortState[\s\S]*?<\/sortState>/, '');
        this.zip.file(tp, x);
      }
    }
    for (const lim of this.tableLimits) {
      const rel = this.zip.file(lim.path.replace(/([^/]+)$/, '_rels/$1.rels'));
      if (!rel) continue;
      for (const m of (await rel.async('string')).matchAll(/Target="(?:\.\.\/|\/xl\/)tables\/([^"]+)"/g)) {
        const tp = 'xl/tables/' + m[1];
        const f = this.zip.file(tp);
        if (!f) continue;
        this.zip.file(
          tp,
          (await f.async('string')).replace(/\sref="([^"]+)"/g, (x, r: string) => {
            const [a, b] = r.split(':');
            return b
              ? ` ref="${a}:${b.replace(/\d+$/, (v) => String(Math.max(splitRef(a).r, Math.min(+v, lim.last))))}"`
              : x;
          }),
        );
      }
    }
    // Excel recalculates all formulas on open; the calcChain would now be wrong
    if (this.zip.file('xl/calcChain.xml')) {
      this.zip.remove('xl/calcChain.xml');
      const ct = await this.zip.file('[Content_Types].xml')!.async('string');
      this.zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
      const rp = 'xl/_rels/workbook.xml.rels';
      const rels = await this.zip.file(rp)!.async('string');
      this.zip.file(rp, rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
    }
    let wbx = this.workbookXml;
    if (/<calcPr\b/.test(wbx))
      wbx = wbx.replace(/<calcPr\b([^>]*?)\/?>/, (_m, a: string) => `<calcPr${setAttr(a, 'fullCalcOnLoad', '1')}/>`);
    else wbx = wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    this.zip.file('xl/workbook.xml', wbx);
    // fixed time on the zip parts: the same book comes out byte for byte identical whenever it is saved
    // (otherwise the save time goes into the file and two identical forms differ)
    this.zip.forEach((_p, f) => {
      f.date = ZIP_DATE;
    });
    return this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
}
