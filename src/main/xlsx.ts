// Συμπλήρωση των «ιερών» templates σε επίπεδο XML (06 §2): αλλάζουμε μόνο τις τιμές των κελιών,
// κρατάμε στυλ, συγχωνεύσεις, διάταξη σελίδας και τύπους όπως τα έφτιαξε ο λοχίας στο Excel.
// Δεν γράφουμε ποτέ πάνω σε κελί με τύπο. Για λίστες που ξεπερνούν τις γραμμές του εντύπου,
// αντιγράφουμε μια γραμμή-πρότυπο και σπρώχνουμε ό,τι είναι από κάτω (υπογραφές κ.λπ.).
import JSZip from 'jszip';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Χαρακτήρες που δεν επιτρέπει το XML (π.χ. από επικόλληση)
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export const colNum = (c: string) => c.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const splitRef = (ref: string) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); if (!m) throw new Error('Λάθος κελί: ' + ref); return { c: colNum(m[1]), r: Number(m[2]) }; };

interface Cell { col: number; attrs: string; inner: string; selfClose: boolean }
interface Row { r: number; attrs: string; cells: Cell[] }

const attr = (attrs: string, name: string) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(attrs); return m ? m[1] : null; };
const setAttr = (attrs: string, name: string, v: string | null) => {
  const re = new RegExp('\\s' + name + '="[^"]*"');
  if (v == null) return attrs.replace(re, '');
  return re.test(attrs) ? attrs.replace(re, ` ${name}="${v}"`) : attrs + ` ${name}="${v}"`;
};

// Μετακίνηση αναφοράς γραμμής: κάθε γραμμή > after πηγαίνει +n
const shiftRef = (ref: string, after: number, n: number) => ref.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_m, d1, c, d2, r) => d1 + c + d2 + (Number(r) > after ? Number(r) + n : Number(r)));

export class Sheet {
  private head = ''; private tail = ''; private rows: Row[] = [];
  constructor(public name: string, public path: string, xml: string) {
    const a = xml.indexOf('<sheetData'); const b = xml.indexOf('</sheetData>');
    if (a < 0) throw new Error('Το φύλλο ' + name + ' δεν έχει δεδομένα');
    if (b < 0) { // <sheetData/>
      const e = xml.indexOf('/>', a) + 2; this.head = xml.slice(0, a) + '<sheetData>'; this.tail = '</sheetData>' + xml.slice(e); return;
    }
    const open = xml.indexOf('>', a) + 1;
    this.head = xml.slice(0, open); this.tail = xml.slice(b);
    const body = xml.slice(open, b);
    const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g; let m: RegExpExecArray | null;
    while ((m = rowRe.exec(body))) {
      const r = Number(attr(m[1], 'r'));
      const cells: Cell[] = [];
      const cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g; let k: RegExpExecArray | null;
      const inner = m[3] || '';
      while ((k = cellRe.exec(inner))) cells.push({ col: splitRef(attr(k[1], 'r')!).c, attrs: k[1], inner: k[3] || '', selfClose: k[2] === '/>' });
      this.rows.push({ r, attrs: m[1], cells });
    }
  }

  private row(r: number, create = true): Row | undefined {
    let x = this.rows.find(y => y.r === r);
    if (!x && create) { x = { r, attrs: ` r="${r}"`, cells: [] }; this.rows.push(x); this.rows.sort((a, b) => a.r - b.r); }
    return x;
  }
  private cell(ref: string, create = true): Cell | undefined {
    const { c, r } = splitRef(ref); const row = this.row(r, create); if (!row) return;
    let x = row.cells.find(y => y.col === c);
    if (!x && create) {
      // στυλ: από τη στήλη ή τη γραμμή αν υπάρχει, αλλιώς κανένα
      const s = attr(row.attrs, 's'); x = { col: c, attrs: ` r="${ref}"` + (s && attr(row.attrs, 'customFormat') === '1' ? ` s="${s}"` : ''), inner: '', selfClose: true };
      row.cells.push(x); row.cells.sort((a, b) => a.col - b.col);
    }
    return x;
  }
  hasFormula(ref: string) { return !!this.cell(ref, false)?.inner.includes('<f'); }
  style(ref: string): number | null { const x = this.cell(ref, false); const v = x && attr(x.attrs, 's'); return v == null ? null : Number(v); }
  setStyle(ref: string, style: number): this { const x = this.cell(ref)!; x.attrs = setAttr(x.attrs, 's', String(style)); return this; }
  // Αριθμός με συγκεκριμένο στυλ (π.χ. ημερομηνία ως αριθμός του Excel με μορφή ημερομηνίας)
  setNumber(ref: string, n: number, style?: number | null): this {
    this.set(ref, n);
    if (style != null) { const x = this.cell(ref)!; x.attrs = setAttr(x.attrs, 's', String(style)); }
    return this;
  }
  // Κάθε κελί που υπάρχει στο XML (για ανάγνωση τιμών): γραμμή και στήλη από 1
  *cells(): Generator<{ r: number; c: number; t: string | null; s: number | null; inner: string }> {
    for (const row of this.rows) for (const c of row.cells) {
      const s = attr(c.attrs, 's');
      yield { r: row.r, c: c.col, t: attr(c.attrs, 't'), s: s == null ? null : Number(s), inner: c.inner };
    }
  }

  // Γράφει τιμή κρατώντας το στυλ (s="…"). null = άδειασμα.
  set(ref: string, v: string | number | null | undefined): this {
    const x = this.cell(ref)!;
    if (x.inner.includes('<f')) throw new Error(`Το κελί ${this.name}!${ref} έχει τύπο και δεν αλλάζει`);
    let a = setAttr(x.attrs, 't', null);
    if (v == null || v === '') { x.attrs = a; x.inner = ''; x.selfClose = true; return this; }
    if (typeof v === 'number') { x.attrs = a; x.inner = `<v>${v}</v>`; }
    else { x.attrs = setAttr(a, 't', 'inlineStr'); x.inner = `<is><t xml:space="preserve">${esc(clean(v))}</t></is>`; }
    x.selfClose = false; return this;
  }
  // Αναγνώσιμη τιμή (για τεστ): inline string ή αριθμός
  get(ref: string): string | null {
    const x = this.cell(ref, false); if (!x || !x.inner) return null;
    const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(x.inner) || /<v>([\s\S]*?)<\/v>/.exec(x.inner);
    return t ? t[1].replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
  }
  // Όλα τα μη κενά κελιά (τύποι με «=») και τα merges: για τα golden-file τεστ
  dump(): { cells: Record<string, string>; merges: string[]; print: string } {
    const cells: Record<string, string> = {};
    for (const row of this.rows) for (const c of row.cells) {
      const ref = colName(c.col) + row.r; const f = this.formula(ref); const v = f != null ? '=' + f : this.get(ref);
      if (v != null && v !== '') cells[ref] = v;
    }
    const merges = [...this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map(m => m[1]);
    const print = (/<pageSetup\b[^>]*>/.exec(this.tail) || [''])[0].replace(/ r:id="[^"]*"/, '');
    return { cells, merges, print };
  }
  formula(ref: string): string | null { const x = this.cell(ref, false); const f = x && /<f[^>]*>([\s\S]*?)<\/f>/.exec(x.inner); return f ? f[1] : null; }

  // Βάζει n αντίγραφα της γραμμής tpl αμέσως μετά τη γραμμή after (ό,τι είναι κάτω κατεβαίνει n γραμμές).
  insertRows(after: number, n: number, tpl: number, wb: Workbook): void {
    if (n <= 0) return;
    const src = this.row(tpl, false);
    for (const row of this.rows) {
      const moved = row.r > after;
      if (moved) { row.r += n; row.attrs = setAttr(row.attrs, 'r', String(row.r)); }
      for (const c of row.cells) {
        if (moved) c.attrs = setAttr(c.attrs, 'r', colName(c.col) + row.r);
        c.inner = c.inner.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_m, fa, f) => `<f${fa}>${shiftRef(f, after, n)}</f>`);
      }
    }
    const fresh: Row[] = [];
    for (let i = 1; i <= n; i++) {
      const r = after + i;
      const cells = (src?.cells || []).map(c => ({ col: c.col, attrs: setAttr(setAttr(c.attrs, 'r', colName(c.col) + r), 't', null), inner: '', selfClose: true }));
      // ο τύπος =ROW()-6 της αρίθμησης αντιγράφεται όπως είναι (δεν έχει αναφορές)
      src?.cells.forEach((c, j) => { if (/<f>ROW\(\)[^<]*<\/f>/.test(c.inner)) { cells[j].inner = c.inner.replace(/<v>[^<]*<\/v>/, ''); cells[j].selfClose = false; } });
      fresh.push({ r, attrs: setAttr(src ? src.attrs : '', 'r', String(r)), cells });
    }
    this.rows.push(...fresh); this.rows.sort((a, b) => a.r - b.r);
    // συγχωνεύσεις: όσες είναι κάτω κατεβαίνουν, όσες είναι μέσα στη γραμμή-πρότυπο αντιγράφονται
    const tplMerges: string[] = [];
    this.head = this.shiftXmlRefs(this.head, after, n);
    this.tail = this.tail.replace(/<mergeCell ref="([^"]+)"\/>/g, (_m, ref: string) => {
      const [a, b] = ref.split(':'); const ra = splitRef(a).r, rb = splitRef(b || a).r;
      if (ra === tpl && rb === tpl) tplMerges.push(ref);
      return `<mergeCell ref="${shiftRef(ref, after, n)}"/>`;
    });
    if (tplMerges.length) {
      const extra = []; for (let i = 1; i <= n; i++) for (const ref of tplMerges) extra.push(`<mergeCell ref="${ref.replace(/\d+/g, String(after + i))}"/>`);
      this.tail = this.tail.replace(/<mergeCells count="(\d+)">/, (_m, c) => `<mergeCells count="${Number(c) + extra.length}">`).replace('</mergeCells>', extra.join('') + '</mergeCells>');
    }
    this.tail = this.shiftXmlRefs(this.tail, after, n);
    wb.shiftNames(this.name, after, n);
    wb.shiftTables(this, after, n);
  }
  private shiftXmlRefs(xml: string, after: number, n: number) {
    return xml
      .replace(/<dimension ref="([^"]+)"/, (_m, r) => `<dimension ref="${shiftRef(r, after, n)}"`)
      .replace(/(<conditionalFormatting[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<dataValidation[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/<brk id="(\d+)"/g, (_m, r) => `<brk id="${Number(r) > after ? Number(r) + n : r}"`);
  }

  toXml(): string {
    const rows = this.rows.map(r => {
      if (!r.cells.length) return `<row${r.attrs}/>`;
      return `<row${r.attrs}>` + r.cells.map(c => (c.selfClose && !c.inner ? `<c${c.attrs}/>` : `<c${c.attrs}>${c.inner}</c>`)).join('') + '</row>';
    }).join('');
    return this.head + rows + this.tail;
  }
}

// Ημερομηνίες: αριθμός ημερών από 30/12/1899 (ή 1/1/1904 σε παλιά αρχεία Mac)
const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30), EPOCH_1904 = Date.UTC(1904, 0, 1);
export const toSerial = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY); };
// Ενσωματωμένες μορφές ημερομηνίας του Excel και δικές μας με d/y μέσα (όχι μόνο ώρα)
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateCode = (code: string) => /[dy]/i.test(code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, ''));
const unesc = (t: string) => t.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const texts = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unesc(m[1] || '')).join('');
export type XlValue = string | number | boolean | Date | null;

export class Workbook {
  private sheets = new Map<string, Sheet>();
  private names: { name: string; path: string }[] = [];
  private sst: string[] | null = null;
  private styles: { xml: string; fmt: number[]; codes: Map<number, string>; dirty: boolean; made: Map<number, number> } | null = null;
  private constructor(private zip: JSZip, private workbookXml: string) {}

  static async open(buf: Buffer | Uint8Array): Promise<Workbook> {
    const zip = await JSZip.loadAsync(buf);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const wb = new Workbook(zip, wbXml);
    const relMap = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], 'Id'), target = attr(m[0], 'Target');
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
    const e = typeof nameOrIndex === 'number' ? this.names[nameOrIndex] : this.names.find(x => x.name === nameOrIndex);
    if (!e) throw new Error('Δεν υπάρχει φύλλο ' + nameOrIndex + ' στο template');
    let s = this.sheets.get(e.path);
    if (!s) { s = new Sheet(e.name, e.path, await this.zip.file(e.path)!.async('string')); this.sheets.set(e.path, s); }
    return s;
  }
  sheetNames() { return this.names.map(x => x.name); }
  hasSheet(name: string) { return this.names.some(x => x.name === name); }

  private async sharedStrings(): Promise<string[]> {
    if (this.sst) return this.sst;
    const f = this.zip.file('xl/sharedStrings.xml') || this.zip.file(/sharedStrings\.xml$/i)[0];
    const xml = f ? await f.async('string') : '';
    this.sst = [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map(m => texts(m[1] || ''));
    return this.sst;
  }
  private async loadStyles() {
    if (this.styles) return this.styles;
    const f = this.zip.file('xl/styles.xml');
    const xml = f ? await f.async('string') : '';
    const codes = new Map<number, string>();
    for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) { const id = attr(m[0], 'numFmtId'), code = attr(m[0], 'formatCode'); if (id) codes.set(Number(id), unesc(code || '')); }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] || '';
    const fmt = [...xfs.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(m => Number(attr(m[0].slice(0, m[0].indexOf('>') + 1), 'numFmtId') || 0));
    this.styles = { xml, fmt, codes, dirty: false, made: new Map() };
    return this.styles;
  }
  async isDateStyle(s: number | null): Promise<boolean> {
    if (s == null) return false;
    const st = await this.loadStyles(); const id = st.fmt[s];
    if (id == null) return false;
    return DATE_IDS.has(id) || (st.codes.has(id) && isDateCode(st.codes.get(id)!));
  }
  // Στυλ με μορφή ημερομηνίας που κρατά πλαίσια και γραμματοσειρά του κελιού (νέο xf με numFmtId 14 = σύντομη ημερομηνία των Windows)
  async dateStyle(base: number | null): Promise<number> {
    const b = base ?? 0;
    if (await this.isDateStyle(b)) return b;
    const st = await this.loadStyles();
    if (st.made.has(b)) return st.made.get(b)!;
    const m = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st.xml);
    if (!m) return b;
    const all = [...m[2].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(x => x[0]);
    const src = all[b] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    const open = src.slice(0, src.indexOf('>') + 1).replace(/\/>$/, '>').replace(/>$/, '');
    const rest = src.endsWith('/>') ? '/>' : src.slice(src.indexOf('>'));
    const xf = setAttr(setAttr(open, 'numFmtId', '14'), 'applyNumberFormat', '1') + rest;
    const idx = all.length;
    st.xml = st.xml.replace(m[0], setAttr(m[1].slice(0, -1), 'count', String(idx + 1)) + '>' + m[2] + xf + m[3]);
    st.fmt.push(14); st.made.set(b, idx); st.dirty = true;
    return idx;
  }

  // Οι τιμές του φύλλου ως πίνακας [γραμμή][στήλη] από 0: κείμενο, αριθμός, ημερομηνία (UTC) ή κενό. Οι τύποι δίνουν το αποτέλεσμά τους.
  async values(nameOrIndex: string | number, maxRows = 2000, maxCols = 40): Promise<XlValue[][]> {
    const ws = await this.sheet(nameOrIndex); const sst = await this.sharedStrings(); await this.loadStyles();
    const y1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(this.workbookXml);
    const out: XlValue[][] = [];
    for (const x of ws.cells()) {
      if (x.r > maxRows || x.c > maxCols || !x.inner) continue;
      let v: XlValue = null;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(x.inner)?.[1];
      if (x.t === 's') v = raw != null ? sst[Number(raw)] ?? null : null;
      else if (x.t === 'inlineStr') v = texts(x.inner);
      else if (x.t === 'str') v = raw != null ? unesc(raw) : null;
      else if (x.t === 'b') v = raw === '1';
      else if (x.t === 'e') v = null;
      else if (raw != null && raw !== '') {
        const n = Number(raw);
        v = Number.isFinite(n) && (await this.isDateStyle(x.s)) ? new Date(Math.round((y1904 ? EPOCH_1904 : EPOCH) + n * DAY)) : n;
      }
      if (v === '' || v == null) continue;
      (out[x.r - 1] ||= [])[x.c - 1] = v;
    }
    for (let i = 0; i < out.length; i++) out[i] ||= [];
    return out;
  }

  // Νέο κενό φύλλο στο τέλος (π.χ. «ΤΙΜΩΡΗΜΕΝΟΙ» μέσα στο Δυναμολόγιο). Οι μακροεντολές και τα άλλα φύλλα μένουν όπως ήταν.
  async addSheet(name: string): Promise<Sheet> {
    const safe = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    if (this.hasSheet(safe)) return this.sheet(safe);
    let n = this.names.length + 1; while (this.zip.file(`xl/worksheets/sheet_a${n}.xml`)) n++;
    const path = `xl/worksheets/sheet_a${n}.xml`;
    this.zip.file(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>');
    const rp = 'xl/_rels/workbook.xml.rels'; let rels = await this.zip.file(rp)!.async('string');
    const rid = 'rId' + (Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1])) + 1);
    rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}"/></Relationships>`);
    this.zip.file(rp, rels);
    const ct = await this.zip.file('[Content_Types].xml')!.async('string');
    this.zip.file('[Content_Types].xml', ct.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`));
    const id = Math.max(0, ...[...this.workbookXml.matchAll(/sheetId="(\d+)"/g)].map(m => +m[1])) + 1;
    const ns = /xmlns:r=/.test(this.workbookXml.slice(0, this.workbookXml.indexOf('>', this.workbookXml.indexOf('<workbook')))) ? '' : ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    this.workbookXml = this.workbookXml.replace('</sheets>', `<sheet name="${esc(safe)}" sheetId="${id}"${ns} r:id="${rid}"/></sheets>`);
    this.names.push({ name: safe, path });
    return this.sheet(safe);
  }

  // Καινούργιο αρχείο με ένα φύλλο (στυλ 1 = έντονα με πλαίσιο για επικεφαλίδες, 2 = πλαίσιο, 3 = ημερομηνία με πλαίσιο)
  static async blank(sheetName: string): Promise<Workbook> {
    const z = new JSZip(); const name = esc(sheetName.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    z.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    z.file('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>');
    return Workbook.open(await z.generateAsync({ type: 'nodebuffer' }));
  }

  // Περιοχή εκτύπωσης και άλλα ονόματα του φύλλου
  shiftNames(sheet: string, after: number, n: number) {
    this.workbookXml = this.workbookXml.replace(/(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g, (_m, a, body: string, c) => {
      const plain = body.replace(/&apos;/g, "'");
      if (!plain.includes(sheet + '!') && !plain.includes("'" + sheet + "'!")) return a + body + c;
      return a + shiftRef(body, after, n) + c;
    });
  }
  // Πίνακες του Excel (ListObject) στο φύλλο
  private tableEdits: { path: string; after: number; n: number }[] = [];
  shiftTables(sheet: Sheet, after: number, n: number) { this.tableEdits.push({ path: sheet.path, after, n }); }

  async save(): Promise<Buffer> {
    for (const [path, s] of this.sheets) this.zip.file(path, s.toXml());
    if (this.styles?.dirty) this.zip.file('xl/styles.xml', this.styles.xml);
    // πίνακες: η περιοχή τους μεγαλώνει
    for (const ed of this.tableEdits) {
      const relPath = ed.path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rel = this.zip.file(relPath); if (!rel) continue;
      for (const m of (await rel.async('string')).matchAll(/Target="(?:\.\.\/|\/xl\/)tables\/([^"]+)"/g)) {
        const tp = 'xl/tables/' + m[1]; const f = this.zip.file(tp); if (!f) continue;
        const x = (await f.async('string')).replace(/\sref="([^"]+)"/g, (_m2, r: string) => {
          const [a, b] = r.split(':'); const rb = splitRef(b).r;
          return ` ref="${a}:${b.replace(/\d+$/, String(rb >= ed.after ? rb + ed.n : rb))}"`;
        }).replace(/<sortState[\s\S]*?<\/sortState>/, '');
        this.zip.file(tp, x);
      }
    }
    // Ο Excel ξαναϋπολογίζει όλους τους τύπους στο άνοιγμα· το calcChain θα ήταν πλέον λάθος
    if (this.zip.file('xl/calcChain.xml')) {
      this.zip.remove('xl/calcChain.xml');
      const ct = await this.zip.file('[Content_Types].xml')!.async('string');
      this.zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
      const rp = 'xl/_rels/workbook.xml.rels'; const rels = await this.zip.file(rp)!.async('string');
      this.zip.file(rp, rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
    }
    let wbx = this.workbookXml;
    if (/<calcPr\b/.test(wbx)) wbx = wbx.replace(/<calcPr\b([^>]*?)\/?>/, (_m, a: string) => `<calcPr${setAttr(a, 'fullCalcOnLoad', '1')}/>`);
    else wbx = wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    this.zip.file('xl/workbook.xml', wbx);
    return this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
}

// Ένα αρχείο με πολλά φύλλα από ήδη συμπληρωμένα αρχεία του ίδιου template (π.χ. ΦΡΟΥΡΑ ΠΣΚ: ένα φύλλο ανά ημέρα).
// Παίρνει το πρώτο φύλλο κάθε αρχείου· στυλ και κοινές συμβολοσειρές είναι ίδια, αφού βγήκαν από το ίδιο template.
export async function mergeFirstSheets(bufs: Buffer[], names: string[]): Promise<Buffer> {
  const xmlName = (n: string) => esc(n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  const base = await JSZip.loadAsync(bufs[0]);
  let wbx = await base.file('xl/workbook.xml')!.async('string');
  let rels = await base.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ct = await base.file('[Content_Types].xml')!.async('string');
  const firstSheet = /<sheet\b[^>]*>/.exec(wbx)![0];
  const oldName = attr(firstSheet, 'name')!;
  const printArea = (x: string) => /<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>([^<]*)<\/definedName>/.exec(x)?.[1] || null;
  const areaFor = (body: string | null, name: string) => (body ? body.replace(/^.*!/, "'" + xmlName(name).replace(/'/g, "''") + "'!") : null);
  // πρώτο φύλλο: νέο όνομα και περιοχή εκτύπωσης
  wbx = wbx.replace(firstSheet, setAttr(firstSheet, 'name', xmlName(names[0])));
  const areas: (string | null)[] = [areaFor(printArea(wbx), names[0])];
  let maxId = Math.max(...[...wbx.matchAll(/sheetId="(\d+)"/g)].map(m => +m[1]));
  let maxRid = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1]));
  const newSheets: string[] = [];
  for (let i = 1; i < bufs.length; i++) {
    const z = await JSZip.loadAsync(bufs[i]);
    const zw = await z.file('xl/workbook.xml')!.async('string');
    const zr = await z.file('xl/_rels/workbook.xml.rels')!.async('string');
    const rid = attr(/<sheet\b[^>]*>/.exec(zw)![0], 'r:id')!;
    const target = attr([...zr.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => attr(r, 'Id') === rid)!, 'Target')!;
    const src = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    // αντίγραφο φύλλου χωρίς δικές του σχέσεις (εκτυπωτής, σχέδια): αλλιώς θα έμεναν αναφορές που δεν υπάρχουν
    let x = (await z.file(src)!.async('string'))
      .replace(/<drawing\b[^>]*\/>|<legacyDrawing\b[^>]*\/>/g, '').replace(/\sr:id="[^"]*"/g, '').replace(/\stabSelected="1"/g, '');
    const path = `xl/worksheets/sheet_m${i + 1}.xml`;
    base.file(path, x);
    maxId++; maxRid++;
    newSheets.push(`<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${xmlName(names[i])}" sheetId="${maxId}" state="visible" r:id="rId${maxRid}"/>`);
    rels = rels.replace('</Relationships>', `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}" Id="rId${maxRid}"/></Relationships>`);
    ct = ct.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    areas.push(areaFor(printArea(zw), names[i]));
  }
  wbx = wbx.replace('</sheets>', newSheets.join('') + '</sheets>');
  // περιοχές εκτύπωσης όλων των φύλλων
  const dn = areas.map((a, i) => (a ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${a}</definedName>` : '')).join('');
  wbx = wbx.replace(/<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[^<]*<\/definedName>/g, '');
  if (/<definedNames>/.test(wbx)) wbx = wbx.replace('<definedNames>', '<definedNames>' + dn);
  else if (dn) wbx = wbx.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
  wbx = wbx.replace(/<definedNames><\/definedNames>/, '');
  // άλλα ονόματα που έδειχναν στο παλιό όνομα του πρώτου φύλλου
  const on = oldName.replace(/&amp;/g, '&'); const nn = "'" + xmlName(names[0]).replace(/'/g, "''") + "'!";
  wbx = wbx.replace(/(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g, (_m, a, b: string, c) => a + b.split("'" + on + "'!").join(nn).split(on + '!').join(nn) + c);
  base.file('xl/workbook.xml', wbx); base.file('xl/_rels/workbook.xml.rels', rels); base.file('[Content_Types].xml', ct);
  return base.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
