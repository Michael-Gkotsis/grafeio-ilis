// Ημερήσια Διαταγή σε Word (Michael, 3/11): το έτοιμο πρότυπο .docx φτιάχνεται εδώ (μία σελίδα όπως το δικό του έγγραφο: A3, Arial 12,
// πίνακας με στήλη «ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ») με ετικέτες {…}, και το ίδιο γέμισμα ισχύει και για το δικό σου πρότυπο.
// Οι ετικέτες που κόβει το Word σε κομμάτια (runs) ενώνονται πρώτα μέσα στην παράγραφο. Τιμή με πολλές γραμμές = πολλές παράγραφοι
// με την ίδια μορφή (αν η ετικέτα είναι μόνη της στην παράγραφο), αλλιώς αλλαγές γραμμής.
import JSZip from 'jszip';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TAG_RE = /\{([^{}\s]+)\}/g;

// μία παράγραφος: ενώνει τα runs όταν έχει ετικέτα και την αντικαθιστά
export function fillParagraph(p: string, tags: Record<string, string>): string {
  const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unesc(m[1])).join('');
  if (!/\{[^{}\s]+\}/.test(text)) return p;
  if (![...text.matchAll(TAG_RE)].some((m) => m[1] in tags)) return p;
  const open = /^<w:p(?:\s[^>]*)?>/.exec(p)![0];
  const ppr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] || '';
  // η μορφή του πρώτου run με κείμενο
  const run = [...p.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].find((m) => /<w:t[ >]/.test(m[1]));
  const rpr = run ? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run[1])?.[0] || '' : '';
  const only = /^\{[^{}\s]+\}$/.exec(text.trim()) && text.trim().match(TAG_RE)?.length === 1;
  const sub = (s: string) => s.replace(TAG_RE, (m, k) => (k in tags ? tags[k] : m));
  const mk = (t: string) => `<w:r>${rpr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (inner: string) => open + ppr + inner + '</w:p>';
  if (only && text.trim().slice(1, -1) in tags)
    return tags[text.trim().slice(1, -1)]
      .split('\n')
      .map((l) => para(mk(l)))
      .join('');
  const lines = sub(text).split('\n');
  return para(lines.map((l, i) => (i ? `<w:r>${rpr}<w:br/></w:r>` : '') + mk(l)).join(''));
}
export async function fillDocx(buf: Buffer, tags: Record<string, string>): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    zip.file(
      name,
      xml.replace(P_RE, (p) => fillParagraph(p, tags)),
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
// ο έλεγχος ενός δικού σου προτύπου: ζιπ με word/document.xml και τουλάχιστον μία ετικέτα
export async function checkTemplate(buf: Buffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file('word/document.xml');
    if (!f) return 'Δεν είναι αρχείο Word (.docx).';
    const xml = await f.async('string');
    const text = [...xml.replace(P_RE, (p) => p + '\n').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|\n/g)]
      .map((m) => (m[1] === undefined ? '\n' : unesc(m[1])))
      .join('');
    return /\{(ΗΜΕΡΟΜΗΝΙΑ|ΑΥΔΜ|ΔΝ|ΙΛΧΟΣ|ΑΞ\d|ΟΠ\d|ΤΜΗΜΑ[23]|ΥΠΟΓΡΑΦΗ)\}/.test(text)
      ? null
      : 'Το αρχείο δεν έχει καμία ετικέτα, π.χ. {ΗΜΕΡΟΜΗΝΙΑ} ή {ΟΠ3}.';
  } catch {
    return 'Δεν διαβάζεται ως αρχείο Word (.docx).';
  }
}

// ------------------------------------------------------------------ το έτοιμο πρότυπο
const W = [1668, 2600, 300, 8670]; // ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ | ετικέτα | : | τιμή (συνολικά 13238, όσο η σελίδα A3 με περιθώρια 1800)
const bd = (top: string, bottom: string) =>
  `<w:tcBorders><w:top w:val="${top}" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="${bottom}" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>`;
const rpr = (o: { b?: boolean; u?: boolean; sz?: number } = {}) =>
  `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.b ? '<w:b/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/></w:rPr>`;
const par = (t: string, o: { jc?: string; b?: boolean; u?: boolean; sz?: number; ind?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ''}<w:jc w:val="${o.jc || 'left'}"/>${rpr(o)}</w:pPr>${t ? `<w:r>${rpr(o)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : ''}</w:p>`;
const cell = (w: number, inner: string, o: { span?: number; top?: string; bottom?: string } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${bd(o.top || 'dotted', o.bottom || 'dotted')}<w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
const tr = (cells: string) => `<w:tr><w:trPr><w:trHeight w:val="454" w:hRule="atLeast"/></w:trPr>${cells}</w:tr>`;
const R = W[1] + W[2] + W[3];
const full = (p: string) => tr(cell(W[0], par('')) + cell(R, p, { span: 3 }));
const lab = (a: string, tag: string) =>
  tr(cell(W[0], par('')) + cell(W[1], par(a)) + cell(W[2], par(':', { jc: 'center' })) + cell(W[3], par(tag)));
export async function builtinTemplate(): Promise<Buffer> {
  const gap = full(par(''));
  const sec = (k: string) =>
    ['ΕΓΓΡΑΦΕΣ', 'ΔΙΑΓΡΑΦΕΣ', 'ΑΔΕΙΕΣ', 'ΠΟΙΝΕΣ', 'ΛΟΙΠΑ']
      .map((n, i) => lab(i + 1 + '. ' + n, '{' + k + (i + 1) + '}'))
      .join('');
  const head = tr(
    cell(W[0], par('ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { jc: 'center' }), { top: 'single', bottom: 'single' }) +
      cell(R, par('ΑΝΑΛΥΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { jc: 'center' }), { span: 3, top: 'single', bottom: 'single' }),
  );
  const U = (t: string, jc = 'center') => full(par(t, { jc, u: true }));
  const body =
    head +
    U('ΤΜΗΜΑ 1°') +
    U('1° ΓΡΑΦΕΙΟ - ΣΤΡΑΤΟΛΟΓΙΑ') +
    U('ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ', 'left') +
    lab('ΑΥΔΜ', '{ΑΥΔΜ}') +
    lab('Δ/Ν {ΙΛΗΣ}', '{ΔΝ}') +
    lab('ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ', '{ΙΛΧΟΣ}') +
    gap +
    U('ΜΕΤΑΒΟΛΕΣ ΑΞΙΩΜΑΤΙΚΩΝ', 'left') +
    sec('ΑΞ') +
    gap +
    U('ΜΕΤΑΒΟΛΕΣ ΟΠΛΙΤΩΝ', 'left') +
    sec('ΟΠ') +
    gap +
    U('ΤΜΗΜΑ 2°') +
    U('4° ΓΡΑΦΕΙΟ') +
    U('ΚΑΤΑΛΟΓΙΣΜΟΣ ΔΗΜΟΣΙΟΥ ΥΛΙΚΟΥ ΣΕ ΒΑΡΟΣ ΟΠΛΙΤΩΝ') +
    full(par('{ΤΜΗΜΑ2}', { jc: 'center' })) +
    gap +
    U('ΤΜΗΜΑ 3°') +
    U('ΔΙΟΙΚΗΤΙΚΗ ΜΕΡΙΜΝΑ – ΤΡΟΦΟΔΟΣΙΑ') +
    U('ΜΙΣΘΟΔΟΣΙΑ:', 'left') +
    full(par('{ΤΜΗΜΑ3}')) +
    gap +
    tr(
      cell(W[0], par(''), { bottom: 'single' }) +
        cell(R, par('{ΥΠΟΓΡΑΦΗ}', { jc: 'center', ind: 4500 }), { span: 3, bottom: 'single' }),
    );
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    par('ΜΟΝΑΔΑ: {ΜΟΝΑΔΑ}', { b: true }) +
    par('1ο ΕΓ/68/80', { b: true, jc: 'right', sz: 18 }) +
    par('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ {ΗΜΕΡΟΜΗΝΙΑ}', { b: true, jc: 'center' }) +
    `<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${body}</w:tbl>` +
    `<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="23811"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1000" w:left="1800" w:header="426" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file('word/document.xml', doc);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
