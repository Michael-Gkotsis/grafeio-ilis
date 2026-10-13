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

// Μετακίνηση αναφοράς γραμμής: κάθε γραμμή > after πηγαίνει +n. Με n < 0 (σβήνονται οι γραμμές μετά την after) η αρχή μιας
// περιοχής που ήταν στη γραμμή που σβήστηκε μένει εκεί (δείχνει πια την επόμενη) και το τέλος ανεβαίνει, όπως στο Excel.
const shiftRange = (a: string, b: string | undefined, after: number, n: number) => {
  const at = (x: string, th: number) => { const m = /^(\$?[A-Z]+\$?)(\d+)$/.exec(x); if (!m) return { s: x, r: 0 }; const r = Number(m[2]) > th ? Number(m[2]) + n : Number(m[2]); return { s: m[1] + r, r, c: m[1] }; };
  if (b == null) return at(a, after).s;
  const x = at(a, n < 0 ? after - n : after), y = at(b, after);
  return x.s + ':' + (y.r < x.r && y.c ? y.c + x.r : y.s);
};
const shiftRef = (ref: string, after: number, n: number) => ref.replace(/(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/g, (_m, a: string, b: string | undefined) => shiftRange(a, b, after, n));

// Το ίδιο μέσα σε τύπο: μόνο οι αναφορές στο φύλλο που άλλαξε. Στο ίδιο του το φύλλο (own) μετρούν και όσες δεν
// γράφουν φύλλο· στα άλλα φύλλα μόνο όσες γράφουν το όνομά του. Κείμενα σε εισαγωγικά και ονόματα συναρτήσεων μένουν όπως είναι.
const REF_RE = /(?<![\p{L}\p{N}_.$])((?:'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![\p{L}\p{N}_(!])/gu;
const sheetOf = (q: string) => (q.startsWith("'") ? q.slice(1, -2).replace(/''/g, "'") : q.slice(0, -1)).toLowerCase();
export function shiftFormula(f: string, sheet: string, own: boolean, after: number, n: number): string {
  const name = sheet.toLowerCase();
  const plain = unesc(f);
  const out = plain.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part : part.replace(REF_RE, (m, q: string | undefined, a: string, b: string | undefined) => {
    if (q ? sheetOf(q) !== name : !own) return m;
    return (q || '') + shiftRange(a, b, after, n);
  })).join('');
  return out === plain ? f : out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Νέες γραμμές ακριβώς κάτω από το τέλος μιας λίστας: οι περιοχές που ξεκινούν από την αρχή της (γραμμή from ή from+1)
// και σταματούν στη γραμμή last φτάνουν ως τη γραμμή to, π.χ. COUNTIF(I4:I158, "1") → COUNTIF(I4:I159, "1")
export function growFormula(f: string, sheet: string, own: boolean, from: number, last: number, to: number): string {
  const name = sheet.toLowerCase();
  const plain = unesc(f);
  const out = plain.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part : part.replace(REF_RE, (m, q: string | undefined, a: string, b: string | undefined) => {
    if (!b || (q ? sheetOf(q) !== name : !own)) return m;
    const ra = splitRef(a).r, rb = splitRef(b).r;
    return ra >= from && ra <= from + 1 && rb === last ? (q || '') + a + ':' + b.replace(/\d+$/, String(to)) : m;
  })).join('');
  return out === plain ? f : out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Οι τύποι ενός κελιού (και η περιοχή των κοινών τύπων/πινάκων τύπων, ref="…")
const shiftCellFormulas = (inner: string, sheet: string, own: boolean, after: number, n: number) =>
  inner.replace(/<f(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/f>)/g, (_m, fa = '', body: string | undefined) => {
    const a = own ? fa.replace(/\sref="([^"]+)"/, (_x: string, r: string) => ` ref="${shiftRef(r, after, n)}"`) : fa;
    return body == null ? `<f${a}/>` : `<f${a}>${shiftFormula(body, sheet, own, after, n)}</f>`;
  });

// Σειρά των στοιχείων μετά το <sheetData> (το Excel δεν ανοίγει φύλλο με άλλη σειρά)
const TAIL_ORDER = ['sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations',
  'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
function tailInsert(tail: string, name: string, xml: string): string {
  let at = tail.lastIndexOf('</worksheet>');
  for (const el of TAIL_ORDER.slice(TAIL_ORDER.indexOf(name) + 1)) { const i = tail.search(new RegExp('<' + el + '[\\s/>]')); if (i >= 0 && i < at) at = i; }
  return tail.slice(0, at) + xml + tail.slice(at);
}

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
  // Κείμενο με μορφή ανά κομμάτι (π.χ. υπογραμμισμένη διάρκεια ποινής): runs έτοιμα <r>…</r>. Κρατά το στυλ του κελιού.
  setRuns(ref: string, runs: string): this {
    const x = this.cell(ref)!;
    if (x.inner.includes('<f')) throw new Error(`Το κελί ${this.name}!${ref} έχει τύπο και δεν αλλάζει`);
    x.attrs = setAttr(x.attrs, 't', 'inlineStr'); x.inner = `<is>${runs}</is>`; x.selfClose = false; return this;
  }
  // Συγχώνευση που ξεκινά από το κελί (π.χ. G11:K11)
  mergeAt(ref: string): { c1: number; r1: number; c2: number; r2: number } | null {
    const { c, r } = splitRef(ref);
    for (const m of this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)) {
      const [a, b] = m[1].split(':'); const A = splitRef(a), B = splitRef(b || a);
      if (A.c === c && A.r === r) return { c1: A.c, r1: A.r, c2: B.c, r2: B.r };
    }
    return null;
  }
  // Όλες οι συγχωνεύσεις του φύλλου
  merges(): { c1: number; r1: number; c2: number; r2: number }[] {
    return [...this.tail.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map(m => { const [a, b] = m[1].split(':'); const A = splitRef(a), B = splitRef(b || a); return { c1: A.c, r1: A.r, c2: B.c, r2: B.r }; });
  }
  // Νέα συγχώνευση (π.χ. τίτλος A1:K1)
  addMerge(ref: string): this {
    if (/<mergeCells\b[^>]*>/.test(this.tail)) {
      this.tail = this.tail.replace(/<mergeCells\b([^>]*)>/, (_m, a: string) => `<mergeCells${setAttr(a, 'count', String(this.merges().length + 1))}>`).replace('</mergeCells>', `<mergeCell ref="${ref}"/></mergeCells>`);
    } else this.tail = tailInsert(this.tail, 'mergeCells', `<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`);
    return this;
  }
  // Υπάρχει ήδη έλεγχος δεδομένων (λίστα κ.λπ.) σε κάποιο κελί της στήλης c μεταξύ των γραμμών r1–r2;
  hasValidation(c: number, r1: number, r2: number): boolean {
    const refs = [...this.tail.matchAll(/<(?:x14:)?dataValidation\b[^>]*?\ssqref="([^"]+)"/g), ...this.tail.matchAll(/<xm:sqref>([^<]+)<\/xm:sqref>/g)].flatMap(m => m[1].split(/\s+/));
    return refs.some(ref => { const [a, b] = ref.split(':'); try { const A = splitRef(a), B = splitRef(b || a); return A.c <= c && c <= B.c && A.r <= r2 && r1 <= B.r; } catch { return false; } });
  }
  // Λίστα επιλογής (dropdown) που δέχεται και ό,τι άλλο γράψει ο χρήστης (χωρίς μήνυμα λάθους)
  addListValidation(sqref: string, items: string[]): this {
    const dv = `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${sqref}"><formula1>${esc('"' + items.join(',') + '"')}</formula1></dataValidation>`;
    if (/<dataValidations\b[^>]*>/.test(this.tail)) {
      const n = (this.tail.match(/<dataValidation\b/g) || []).length + 1;
      this.tail = this.tail.replace(/<dataValidations\b([^>]*)>/, (_m, a: string) => `<dataValidations${setAttr(a, 'count', String(n))}>`).replace('</dataValidations>', dv + '</dataValidations>');
    } else this.tail = tailInsert(this.tail, 'dataValidations', `<dataValidations count="1">${dv}</dataValidations>`);
    return this;
  }
  // Πλάτη στηλών για καινούργιο φύλλο (μόνο αν το φύλλο δεν έχει ήδη δικά του)
  setColWidths(widths: Record<number, number>): this {
    if (/<cols\b/.test(this.head)) return this;
    const cols = Object.entries(widths).sort((a, b) => +a[0] - +b[0]).map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`).join('');
    if (cols) this.head = this.head.replace(/<sheetData\b[^>]*>$/, m => `<cols>${cols}</cols>` + m);
    return this;
  }
  // Πλάτος στήλης σε χαρακτήρες του Excel (<cols>, αλλιώς το προεπιλεγμένο του φύλλου)
  colWidth(c: number): number {
    for (const m of this.head.matchAll(/<col\b[^>]*>/g)) {
      const min = Number(attr(m[0], 'min')), max = Number(attr(m[0], 'max')), w = attr(m[0], 'width');
      if (c >= min && c <= max && w != null) return attr(m[0], 'hidden') === '1' ? 0 : Number(w);
    }
    const f = /<sheetFormatPr\b[^>]*>/.exec(this.head)?.[0] || '';
    return Number(attr(f, 'defaultColWidth') || 8.43);
  }
  rowHeight(r: number): number {
    const ht = attr(this.row(r, false)?.attrs || '', 'ht');
    return Number(ht ?? attr(/<sheetFormatPr\b[^>]*>/.exec(this.head)?.[0] || '', 'defaultRowHeight') ?? 15);
  }
  setRowHeight(r: number, ht: number): this { const x = this.row(r)!; x.attrs = setAttr(setAttr(x.attrs, 'ht', String(ht)), 'customHeight', '1'); return this; }

  // Αναγνώσιμη τιμή (για τεστ): inline string ή αριθμός
  get(ref: string): string | null {
    const x = this.cell(ref, false); if (!x || !x.inner) return null;
    if (x.inner.startsWith('<is>')) return texts(x.inner);
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
        if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, this.name, true, after, n);
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
    wb.shiftForeign(this, after, n);
    wb.shiftTables(this, after, n);
  }
  // Σβήνει τη γραμμή at (από 1) και ανεβάζει μία ό,τι είναι από κάτω. Οι αναφορές στη γραμμή που σβήστηκε δείχνουν πια τη
  // γραμμή από πάνω, οπότε το τέλος μιας περιοχής μικραίνει (COUNTIF(I4:I159) → I4:I158). Για να φύγει ξανά μια γραμμή
  // που είχε βάλει η εφαρμογή (αναίρεση)· όχι σε φύλλο με πίνακα του Excel (false: δεν σβήστηκε).
  deleteRow(at: number, wb: Workbook): boolean {
    if (/<tableParts\b/.test(this.tail)) return false;
    const after = at - 1, n = -1;
    this.rows = this.rows.filter(r => r.r !== at);
    for (const row of this.rows) {
      const moved = row.r > at;
      if (moved) { row.r += n; row.attrs = setAttr(row.attrs, 'r', String(row.r)); }
      for (const c of row.cells) {
        if (moved) c.attrs = setAttr(c.attrs, 'r', colName(c.col) + row.r);
        if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, this.name, true, after, n);
      }
    }
    let gone = 0;
    this.tail = this.tail.replace(/<mergeCell ref="([^"]+)"\/>/g, (_m, ref: string) => {
      const [a, b] = ref.split(':'); if (splitRef(a).r === at && splitRef(b || a).r === at) { gone++; return ''; }
      return `<mergeCell ref="${shiftRef(ref, after, n)}"/>`;
    });
    if (gone) this.tail = this.tail.replace(/<mergeCells count="(\d+)">/, (_m, c) => `<mergeCells count="${Number(c) - gone}">`).replace(/<mergeCells count="0"><\/mergeCells>/, '');
    this.head = this.shiftXmlRefs(this.head, after, n);
    this.tail = this.shiftXmlRefs(this.tail, after, n);
    wb.shiftNames(this.name, after, n);
    wb.shiftForeign(this, after, n);
    return true;
  }
  // Περιοχές τύπων προς το φύλλο sheet που μεγαλώνουν (growFormula)
  growFormulas(sheet: string, from: number, last: number, to: number): number {
    let n = 0;
    for (const row of this.rows) for (const c of row.cells) {
      if (!c.inner.includes('<f')) continue;
      const inner = c.inner.replace(/(<f(?:\s[^>]*)?>)([\s\S]*?)(<\/f>)/g, (_m, o: string, body: string, e: string) => o + growFormula(body, sheet, sheet === this.name, from, last, to) + e);
      if (inner !== c.inner) { c.inner = inner; n++; }   // η τιμή ξαναϋπολογίζεται στο άνοιγμα (fullCalcOnLoad)
    }
    return n;
  }
  // Τύποι σε αυτό το φύλλο που δείχνουν σε γραμμές ενός άλλου φύλλου που μετακινήθηκαν
  shiftForeign(sheet: string, after: number, n: number) {
    for (const row of this.rows) for (const c of row.cells) if (c.inner.includes('<f')) c.inner = shiftCellFormulas(c.inner, sheet, false, after, n);
  }
  private shiftXmlRefs(xml: string, after: number, n: number) {
    return xml
      .replace(/<dimension ref="([^"]+)"/, (_m, r) => `<dimension ref="${shiftRef(r, after, n)}"`)
      .replace(/(<conditionalFormatting[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<dataValidation[^>]*sqref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<hyperlink\b[^>]*\sref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
      .replace(/(<autoFilter\b[^>]*\sref=")([^"]+)"/g, (_m, p, r) => p + shiftRef(r, after, n) + '"')
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
export const unesc = (t: string) => t.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const texts = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unesc(m[1] || '')).join('');
export type XlValue = string | number | boolean | Date | null;
// Σειρά των ιδιοτήτων μέσα στο <rPr>, όπως τις γράφει ο Excel
const RPR_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'rFont', 'family', 'charset', 'scheme'];
const FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];
// Το <xf> με αλλαγμένη στοίχιση (set), ή με νέα στοίχιση set+fresh αν δεν είχε καθόλου
function withAlign(x: string, set: Record<string, string>, fresh: Record<string, string> = {}): string {
  const open = x.slice(0, x.indexOf('>') + 1).replace(/\/>$/, '>');
  const body = x.endsWith('/>') ? '' : x.slice(x.indexOf('>') + 1, x.lastIndexOf('</xf>'));
  const al = /<alignment\b[^>]*?\/?>(?:<\/alignment>)?/.exec(body)?.[0];
  const fixed = Object.entries(al ? set : { ...set, ...fresh }).reduce((a, [k, v]) => setAttr(a, k, v), al ? al.replace(/\/?>(<\/alignment>)?$/, '') : '<alignment') + '/>';
  return setAttr(open.slice(0, -1), 'applyAlignment', '1') + '>' + (al ? body.replace(al, fixed) : fixed + body) + '</xf>';
}

export class Workbook {
  private sheets = new Map<string, Sheet>();
  private names: { name: string; path: string }[] = [];
  private sst: string[] | null = null;
  private styles: { xml: string; fmt: number[]; codes: Map<number, string>; dirty: boolean; made: Map<number, number>; wrapped: Map<number, number>; centered: Map<number, number> } | null = null;
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
    if (!s) {
      s = new Sheet(e.name, e.path, await this.zip.file(e.path)!.async('string')); this.sheets.set(e.path, s);
      for (const x of this.moved) if (x.sheet !== e.name) s.shiftForeign(x.sheet, x.after, x.n);
    }
    return s;
  }
  // Γραμμές που μπήκαν σε φύλλα: οι τύποι των άλλων φύλλων που δείχνουν εκεί ακολουθούν (και όσων φορτωθούν αργότερα)
  private moved: { sheet: string; after: number; n: number }[] = [];
  shiftForeign(from: Sheet, after: number, n: number) {
    this.moved.push({ sheet: from.name, after, n });
    for (const s of this.sheets.values()) if (s !== from) s.shiftForeign(from.name, after, n);
  }
  // Νέες γραμμές στο τέλος της λίστας του φύλλου ws: οι τύποι (σε αυτό και στα άλλα φύλλα) που μετράνε ως τον
  // τελευταίο της λίστας μετράνε και τους νέους. Πόσοι τύποι άλλαξαν.
  async growRanges(ws: Sheet, from: number, last: number, to: number): Promise<number> {
    let n = ws.growFormulas(ws.name, from, last, to);
    for (const e of this.names) {
      if (e.name === ws.name) continue;
      if (!this.sheets.has(e.path)) {
        const xml = await this.zip.file(e.path)?.async('string'); if (!xml || !xml.includes('<f')) continue;
        const plain = unesc(xml); if (!plain.includes(ws.name + '!') && !plain.includes(ws.name.replace(/'/g, "''") + "'!")) continue;
      }
      n += (await this.sheet(e.name)).growFormulas(ws.name, from, last, to);
    }
    return n;
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
    this.styles = { xml, fmt, codes, dirty: false, made: new Map(), wrapped: new Map(), centered: new Map() };
    return this.styles;
  }
  async isDateStyle(s: number | null): Promise<boolean> {
    if (s == null) return false;
    const st = await this.loadStyles(); const id = st.fmt[s];
    if (id == null) return false;
    return DATE_IDS.has(id) || (st.codes.has(id) && isDateCode(st.codes.get(id)!));
  }
  // Στυλ με μορφή ημερομηνίας ημέρα/μήνας/έτος που κρατά πλαίσια και γραμματοσειρά του κελιού. Η «σύντομη ημερομηνία
  // των Windows» (numFmtId 14) δεν αρκεί: σε Windows με αγγλικές ρυθμίσεις φαίνεται μήνας/ημέρα. Δική σου άλλη μορφή
  // ημερομηνίας στο κελί (π.χ. «d/m/yy») μένει όπως είναι.
  async dateStyle(base: number | null): Promise<number> {
    const b = base ?? 0;
    const st = await this.loadStyles();
    if (await this.isDateStyle(b) && st.fmt[b] !== 14) return b;
    const id = String(this.dmyFmt());
    return this.xfLike(b, st.made, src => {
      const open = src.slice(0, src.indexOf('>') + 1).replace(/\/>$/, '>').replace(/>$/, '');
      const rest = src.endsWith('/>') ? '/>' : src.slice(src.indexOf('>'));
      return setAttr(setAttr(open, 'numFmtId', id), 'applyNumberFormat', '1') + rest;
    });
  }
  // Η μορφή «dd/mm/yyyy» στο styles.xml: η υπάρχουσα αν την έχει ήδη το βιβλίο, αλλιώς νέα (από 164, όπως ο Excel)
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
    st.codes.set(id, 'dd/mm/yyyy'); st.dirty = true;
    return id;
  }
  private xfList(xml: string): string[] {
    const m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    return m ? [...m[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(x => x[0]) : [];
  }
  // Στυλ όπως το b με μία αλλαγή (edit)· cache: ήδη φτιαγμένα ανά b
  private async xfLike(b: number, cache: Map<number, number>, edit: (xf: string) => string): Promise<number> {
    const st = await this.loadStyles();
    if (cache.has(b)) return cache.get(b)!;
    const m = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st.xml);
    if (!m) return b;
    const all = this.xfList(st.xml);
    const idx = this.addXf(edit(all[b] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'));
    cache.set(b, idx); return idx;
  }
  // Το στυλ στο cellXfs: το ίδιο αν υπάρχει ήδη (αλλιώς το styles.xml μεγάλωνε σε κάθε εγγραφή), αλλιώς νέο στο τέλος
  private addXf(xf: string): number {
    const st = this.styles!; const m = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st.xml);
    if (!m) return 0;
    const all = this.xfList(st.xml); const had = all.indexOf(xf);
    if (had >= 0) return had;
    const idx = all.length;
    st.xml = st.xml.replace(m[0], setAttr(m[1].slice(0, -1), 'count', String(idx + 1)) + '>' + m[2] + xf + m[3]);
    st.fmt.push(Number(attr(xf.slice(0, xf.indexOf('>') + 1), 'numFmtId') || 0)); st.dirty = true;
    return idx;
  }
  // Στοιχεία ενός πίνακα του styles.xml (fonts, borders…): η λίστα και πού βρίσκεται
  private part(tag: 'fonts' | 'borders'): { items: string[]; add: (x: string) => number } {
    const st = this.styles!; const one = tag.slice(0, -1);
    const m = new RegExp('(<' + tag + '\\b[^>]*>)([\\s\\S]*?)(</' + tag + '>)').exec(st.xml);
    const items = m ? [...m[2].matchAll(new RegExp('<' + one + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + one + '>)', 'g'))].map(x => x[0]) : [];
    return { items, add: (x: string) => {
      const had = items.indexOf(x); if (had >= 0) return had;
      if (!m) { st.xml = st.xml.replace(/(<styleSheet\b[^>]*>(?:<numFmts\b[\s\S]*?<\/numFmts>)?)/, `$1<${tag} count="1">${x}</${tag}>`); st.dirty = true; return 0; }
      st.xml = st.xml.replace(m[0], setAttr(m[1].slice(0, -1), 'count', String(items.length + 1)) + '>' + m[2] + x + m[3]); st.dirty = true;
      return items.length;
    } };
  }
  // Γραμματοσειρά όπως η βασική του βιβλίου, έντονη και (προαιρετικά) σε άλλο μέγεθος
  private boldFont(sz?: number): number {
    const fonts = this.part('fonts'); const base = fonts.items[0] || '<font><sz val="11"/><name val="Calibri"/></font>';
    const parts = new Map<string, string>();
    for (const m of base.replace(/^<font\b[^>]*>/, '').matchAll(/<(\w+)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g)) parts.set(m[1], m[0]);
    parts.set('b', '<b/>'); if (sz) parts.set('sz', `<sz val="${sz}"/>`);
    return fonts.add('<font>' + FONT_ORDER.map(k => parts.get(k) || '').join('') + '</font>');
  }
  // Λεπτό πλαίσιο γύρω από το κελί
  private thinBorder(): number {
    const b = this.part('borders');
    const i = b.items.findIndex(x => ['left', 'right', 'top', 'bottom'].every(s => new RegExp('<' + s + ' style="thin"').test(x)) && !/<diagonal style=/.test(x));
    return i >= 0 ? i : b.add('<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>');
  }
  // Στυλ για πίνακα που φτιάχνει η εφαρμογή (νέο αρχείο ή νέο φύλλο): τίτλος έντονος και μεγάλος, επικεφαλίδες έντονες
  // με πλαίσιο, τιμές με πλαίσιο. Όλα στο κέντρο, όπως τα φύλλα του Δυναμολογίου.
  async tableStyle(kind: 'title' | 'head' | 'data'): Promise<number> {
    await this.loadStyles();
    const font = kind === 'data' ? 0 : this.boldFont(kind === 'title' ? 14 : undefined);
    const border = kind === 'title' ? 0 : this.thinBorder();
    return this.addXf(`<xf numFmtId="0" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"${kind === 'head' ? ' wrapText="1"' : ''}/></xf>`);
  }
  // Στυλ όπως το base, στο κέντρο (οριζόντια): για τίτλο που συγχωνεύεται πάνω από τον πίνακα
  async centered(base: number | null): Promise<number> {
    const st = await this.loadStyles();
    return this.xfLike(base ?? 0, st.centered, x => withAlign(x, { horizontal: 'center', vertical: 'center' }));
  }

  // Κείμενο σε γραμμές με υπογραμμισμένα κομμάτια (ΗΚΑΙ: 4. ΠΟΙΝΕΣ, 5. ΑΙΤΗΣΕΙΣ). Κρατά πλαίσιο και γραμματοσειρά του κελιού:
  // κάθε κομμάτι παίρνει τη γραμματοσειρά του κελιού (αλλιώς ο Excel βάζει την προεπιλεγμένη του βιβλίου), αναδιπλώνεται,
  // και η γραμμή ψηλώνει όσο χρειάζεται (ο Excel δεν το κάνει μόνος του σε συγχωνευμένα κελιά). Άδειο = σβήνει το κελί.
  async setRich(ws: Sheet, ref: string, lines: { t: string; u?: boolean }[][]): Promise<void> {
    lines = lines.filter(l => l.some(r => r.t));
    if (!lines.length) { ws.set(ref, null); return; }
    const st = await this.loadStyles();
    const base = ws.style(ref) ?? 0;
    const xfs = this.xfList(st.xml); const src = xfs[base] || '';
    const fonts = [.../<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(st.xml)?.[1].matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g) || []].map(x => x[0]);
    const font = fonts[Number(attr(src.slice(0, src.indexOf('>') + 1), 'fontId') || 0)] || '';
    const parts = new Map<string, string>();
    for (const m of font.replace(/^<font\b[^>]*>/, '').matchAll(/<(\w+)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g)) parts.set(m[1], m[0]);
    if (parts.has('name')) parts.set('rFont', parts.get('name')!.replace(/^<name\b/, '<rFont'));
    const sz = Number(attr(parts.get('sz') || '', 'val') || 11);
    const rPr = (u?: boolean) => '<rPr>' + RPR_ORDER.map(k => (k === 'u' && u && !parts.has('u') ? '<u/>' : parts.get(k) || '')).join('') + '</rPr>';
    const runs = lines.flatMap((l, i) => l.filter(r => r.t).map((r, j) => ({ t: (i && !j ? '\n' : '') + r.t, u: r.u })))
      .map(r => `<r>${rPr(r.u)}<t xml:space="preserve">${esc(clean(r.t))}</t></r>`).join('');
    ws.setRuns(ref, runs);
    if (!/<alignment\b[^>]*wrapText="(1|true)"/.test(src)) ws.setStyle(ref, await this.xfLike(base, st.wrapped, x => withAlign(x, { wrapText: '1' }, { vertical: 'top' })));
    // πόσες γραμμές πιάνει στο χαρτί: πλάτος της συγχώνευσης σε χαρακτήρες (≈7px το καθένα) προς το πλάτος ενός γράμματος της γραμματοσειράς
    const { c, r } = splitRef(ref); const mg = ws.mergeAt(ref) || { c1: c, r1: r, c2: c, r2: r };
    let w = 0; for (let k = mg.c1; k <= mg.c2; k++) w += ws.colWidth(k);
    const perLine = Math.max(10, Math.floor((w * 7) / (sz * (96 / 72) * 0.6)));
    const n = lines.reduce((a, l) => a + Math.max(1, Math.ceil(l.map(x => x.t).join('').length / perLine)), 0);
    let have = 0; for (let k = mg.r1; k <= mg.r2; k++) have += ws.rowHeight(k);
    const need = Math.ceil(n * sz * 1.35 * 10) / 10;
    if (need > have) ws.setRowHeight(mg.r1, Math.round((ws.rowHeight(mg.r1) + need - have) * 10) / 10);   // ποτέ δεν μικραίνει
  }

  // Οι τιμές του φύλλου ως πίνακας [γραμμή][στήλη] από 0: κείμενο, αριθμός, ημερομηνία (UTC) ή κενό. Οι τύποι δίνουν το αποτέλεσμά τους.
  // fx: εδώ μπαίνουν τα κελιά με τύπο («γραμμή:στήλη» από 0)
  async values(nameOrIndex: string | number, maxRows = 2000, maxCols = 40, fx?: Set<string>): Promise<XlValue[][]> {
    const ws = await this.sheet(nameOrIndex); const sst = await this.sharedStrings(); await this.loadStyles();
    const y1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(this.workbookXml);
    const out: XlValue[][] = [];
    for (const x of ws.cells()) {
      if (x.r > maxRows || x.c > maxCols || !x.inner) continue;
      if (fx && x.inner.includes('<f')) fx.add((x.r - 1) + ':' + (x.c - 1));
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
    z.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    z.file('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>');
    return Workbook.open(await z.generateAsync({ type: 'nodebuffer' }));
  }

  // Περιοχή εκτύπωσης και άλλα ονόματα του φύλλου
  shiftNames(sheet: string, after: number, n: number) {
    this.workbookXml = this.workbookXml.replace(/(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g, (_m, a, body: string, c) => {
      const plain = body.replace(/&apos;/g, "'");
      if (!plain.includes(sheet + '!') && !plain.includes(sheet.replace(/'/g, "''") + "'!")) return a + body + c;
      return a + shiftFormula(body, sheet, false, after, n).replace(/'/g, '&apos;') + c;
    });
  }
  // Πίνακες του Excel (ListObject) στο φύλλο
  private tableEdits: { path: string; after: number; n: number }[] = [];
  shiftTables(sheet: Sheet, after: number, n: number) { this.tableEdits.push({ path: sheet.path, after, n }); }

  async save(): Promise<Buffer> {
    // φύλλα που δεν άνοιξαν αλλά έχουν τύπους προς φύλλο όπου μπήκαν γραμμές
    if (this.moved.length) for (const e of this.names) {
      if (this.sheets.has(e.path)) continue;
      const xml = await this.zip.file(e.path)?.async('string'); if (!xml || !xml.includes('<f')) continue;
      const plain = unesc(xml);
      if (this.moved.some(x => plain.includes(x.sheet + '!') || plain.includes(x.sheet.replace(/'/g, "''") + "'!"))) await this.sheet(e.name);
    }
    for (const [path, s] of this.sheets) this.zip.file(path, s.toXml());
    if (this.styles?.dirty) this.zip.file('xl/styles.xml', this.styles.xml);
    // πίνακες: όσοι περιέχουν τη γραμμή μεγαλώνουν, όσοι είναι πιο κάτω κατεβαίνουν ολόκληροι
    for (const ed of this.tableEdits) {
      const relPath = ed.path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rel = this.zip.file(relPath); if (!rel) continue;
      for (const m of (await rel.async('string')).matchAll(/Target="(?:\.\.\/|\/xl\/)tables\/([^"]+)"/g)) {
        const tp = 'xl/tables/' + m[1]; const f = this.zip.file(tp); if (!f) continue;
        const x = (await f.async('string')).replace(/\sref="([^"]+)"/g, (_m2, r: string) => {
          const [a, b] = r.split(':'); if (!b) return _m2;
          const ra = splitRef(a).r, rb = splitRef(b).r;
          return ` ref="${a.replace(/\d+$/, String(ra > ed.after ? ra + ed.n : ra))}:${b.replace(/\d+$/, String(rb >= ed.after ? rb + ed.n : rb))}"`;
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
// pick: όνομα του φύλλου που κρατιέται (όταν το έντυπο δεν είναι το πρώτο φύλλο του template)
export async function mergeFirstSheets(bufs: Buffer[], names: string[], pick?: string): Promise<Buffer> {
  const sheetTag = (x: string) => [...x.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]).find(t => pick && attr(t, 'name')!.replace(/&amp;/g, '&') === pick) || /<sheet\b[^>]*>/.exec(x)![0];
  const xmlName = (n: string) => esc(n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  const base = await JSZip.loadAsync(bufs[0]);
  let wbx = await base.file('xl/workbook.xml')!.async('string');
  let rels = await base.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ct = await base.file('[Content_Types].xml')!.async('string');
  const firstSheet = sheetTag(wbx);
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
    const rid = attr(sheetTag(zw), 'r:id')!;
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
