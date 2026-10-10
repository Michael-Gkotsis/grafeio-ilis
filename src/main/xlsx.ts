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

export class Workbook {
  private sheets = new Map<string, Sheet>();
  private names: { name: string; path: string }[] = [];
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
