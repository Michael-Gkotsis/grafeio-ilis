// Ημερήσια Διαταγή σε Word (Michael, 3/11): το έτοιμο πρότυπο .docx φτιάχνεται εδώ (μία σελίδα όπως το δικό του έγγραφο: A3, Arial 12,
// πίνακας με στήλη «ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ») με ετικέτες {…}, και το ίδιο γέμισμα ισχύει και για το δικό σου πρότυπο.
// Οι ετικέτες που κόβει το Word σε κομμάτια (runs) ενώνονται πρώτα μέσα στην παράγραφο. Τιμή με πολλές γραμμές = πολλές παράγραφοι
// με την ίδια μορφή (αν η ετικέτα είναι μόνη της στην παράγραφο), αλλιώς αλλαγές γραμμής.
import JSZip from 'jszip';
import type { DocHead, HeadAl, HeadItem } from '../shared/docHead';
import { zonesOf } from '../shared/headLayout';
import { upperOrd } from '../shared/text';
import { loadHeadImage } from './headImages';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TAG_RE = /\{([^{}\s]+)\}/g;

// μία παράγραφος: ενώνει τα runs όταν έχει ετικέτα και την αντικαθιστά
export function fillParagraph(p: string, tags: Record<string, string>): string {
  const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => unesc(m[1])).join('');
  if (!/\{[^{}\s]+\}/.test(text)) return p;
  if (![...text.matchAll(TAG_RE)].some(m => m[1] in tags)) return p;
  const open = /^<w:p(?:\s[^>]*)?>/.exec(p)![0]; const ppr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] || '';
  // η μορφή του πρώτου run με κείμενο
  const run = [...p.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].find(m => /<w:t[ >]/.test(m[1]));
  const rpr = run ? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run[1])?.[0] || '' : '';
  const only = /^\{[^{}\s]+\}$/.exec(text.trim()) && text.trim().match(TAG_RE)?.length === 1;
  const sub = (s: string) => s.replace(TAG_RE, (m, k) => (k in tags ? tags[k] : m));
  const mk = (t: string) => `<w:r>${rpr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (inner: string) => open + ppr + inner + '</w:p>';
  if (only && text.trim().slice(1, -1) in tags) return tags[text.trim().slice(1, -1)].split('\n').map(l => para(mk(l))).join('');
  const lines = sub(text).split('\n');
  return para(lines.map((l, i) => (i ? `<w:r>${rpr}<w:br/></w:r>` : '') + mk(l)).join(''));
}
export async function fillDocx(buf: Buffer, tags: Record<string, string>): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    zip.file(name, xml.replace(P_RE, p => fillParagraph(p, tags)));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
// ο έλεγχος ενός δικού σου προτύπου: ζιπ με word/document.xml και τουλάχιστον μία ετικέτα
export async function checkTemplate(buf: Buffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(buf); const f = zip.file('word/document.xml');
    if (!f) return 'Δεν είναι αρχείο Word (.docx).';
    const xml = await f.async('string'); const text = [...xml.replace(P_RE, p => p + '\n').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|\n/g)].map(m => (m[1] === undefined ? '\n' : unesc(m[1]))).join('');
    return /\{(ΗΜΕΡΟΜΗΝΙΑ|ΑΥΔΜ|ΔΝ|ΙΛΧΟΣ|ΑΞ\d|ΟΠ\d|ΤΜΗΜΑ[23]|ΥΠΟΓΡΑΦΗ|ΚΕΦΑΛΙΔΑ)\}/.test(text) ? null : 'Το αρχείο δεν έχει καμία ετικέτα, π.χ. {ΗΜΕΡΟΜΗΝΙΑ} ή {ΟΠ3}.';
  } catch { return 'Δεν διαβάζεται ως αρχείο Word (.docx).'; }
}

// ------------------------------------------------------------------ το έτοιμο πρότυπο
const W = [1668, 2600, 300, 8670];   // ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ | ετικέτα | : | τιμή (συνολικά 13238, όσο η σελίδα A3 με περιθώρια 1800)
const bd = (top: string, bottom: string) => `<w:tcBorders><w:top w:val="${top}" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="${bottom}" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>`;
const rpr = (o: { b?: boolean; u?: boolean; sz?: number } = {}) => `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.b ? '<w:b/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/></w:rPr>`;
const par = (t: string, o: { jc?: string; b?: boolean; u?: boolean; sz?: number; ind?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ''}<w:jc w:val="${o.jc || 'left'}"/>${rpr(o)}</w:pPr>${t ? `<w:r>${rpr(o)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : ''}</w:p>`;
const cell = (w: number, inner: string, o: { span?: number; top?: string; bottom?: string } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${bd(o.top || 'dotted', o.bottom || 'dotted')}<w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
const tr = (cells: string) => `<w:tr><w:trPr><w:trHeight w:val="454" w:hRule="atLeast"/></w:trPr>${cells}</w:tr>`;
const R = W[1] + W[2] + W[3];
const full = (p: string) => tr(cell(W[0], par('')) + cell(R, p, { span: 3 }));
const lab = (a: string, tag: string) => tr(cell(W[0], par('')) + cell(W[1], par(a)) + cell(W[2], par(':', { jc: 'center' })) + cell(W[3], par(tag)));
export const HEAD_TAG = 'ΚΕΦΑΛΙΔΑ';
// designed: η γραμμή «ΜΟΝΑΔΑ: …» αντικαθίσταται από την ετικέτα {ΚΕΦΑΛΙΔΑ} (εκεί μπαίνει η επικεφαλίδα που σχεδίασες)· αλλιώς το έτοιμο πρότυπο μένει όπως ήταν
export async function builtinTemplate(designed = false): Promise<Buffer> {
  const gap = full(par(''));
  const sec = (k: string) => ['ΕΓΓΡΑΦΕΣ', 'ΔΙΑΓΡΑΦΕΣ', 'ΑΔΕΙΕΣ', 'ΠΟΙΝΕΣ', 'ΛΟΙΠΑ'].map((n, i) => lab((i + 1) + '. ' + n, '{' + k + (i + 1) + '}')).join('');
  const head = tr(cell(W[0], par('ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { jc: 'center' }), { top: 'single', bottom: 'single' }) + cell(R, par('ΑΝΑΛΥΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { jc: 'center' }), { span: 3, top: 'single', bottom: 'single' }));
  const U = (t: string, jc = 'center') => full(par(t, { jc, u: true }));
  const body = head + U('ΤΜΗΜΑ 1°') + U('1° ΓΡΑΦΕΙΟ - ΣΤΡΑΤΟΛΟΓΙΑ') + U('ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ', 'left')
    + lab('ΑΥΔΜ', '{ΑΥΔΜ}') + lab('Δ/Ν {ΙΛΗΣ}', '{ΔΝ}') + lab('ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ', '{ΙΛΧΟΣ}') + gap
    + U('ΜΕΤΑΒΟΛΕΣ ΑΞΙΩΜΑΤΙΚΩΝ', 'left') + sec('ΑΞ') + gap + U('ΜΕΤΑΒΟΛΕΣ ΟΠΛΙΤΩΝ', 'left') + sec('ΟΠ') + gap
    + U('ΤΜΗΜΑ 2°') + U('4° ΓΡΑΦΕΙΟ') + U('ΚΑΤΑΛΟΓΙΣΜΟΣ ΔΗΜΟΣΙΟΥ ΥΛΙΚΟΥ ΣΕ ΒΑΡΟΣ ΟΠΛΙΤΩΝ') + full(par('{ΤΜΗΜΑ2}', { jc: 'center' })) + gap
    + U('ΤΜΗΜΑ 3°') + U('ΔΙΟΙΚΗΤΙΚΗ ΜΕΡΙΜΝΑ – ΤΡΟΦΟΔΟΣΙΑ') + U('ΜΙΣΘΟΔΟΣΙΑ:', 'left') + full(par('{ΤΜΗΜΑ3}')) + gap
    + tr(cell(W[0], par(''), { bottom: 'single' }) + cell(R, par('{ΥΠΟΓΡΑΦΗ}', { jc: 'center', ind: 4500 }), { span: 3, bottom: 'single' }));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
    + (designed ? par('{' + HEAD_TAG + '}') : par('ΜΟΝΑΔΑ: {ΜΟΝΑΔΑ}', { b: true })) + par('1ο ΕΓ/68/80', { b: true, jc: 'right', sz: 18 }) + par('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ {ΗΜΕΡΟΜΗΝΙΑ}', { b: true, jc: 'center' })
    + `<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${body}</w:tbl>`
    + `<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="23811"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1000" w:left="1800" w:header="426" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', doc);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ------------------------------------------------------------------ η επικεφαλίδα που σχεδίασες (Ρυθμίσεις › Επικεφαλίδες εγγράφων)
// Πίνακας 3 στηλών χωρίς πλαίσια: πλάτη στηλών όπως στα Excel (zonesOf: κενό κουτί δανείζει το πλάτος του στα διπλανά), μία παράγραφος ανά
// κομμάτι, εικόνες inline (wp:inline) στο word/media. Μπαίνει στη θέση της παραγράφου με την ετικέτα {ΚΕΦΑΛΙΔΑ}, αλλιώς πρώτο στοιχείο του σώματος.
export const HEAD_MARK = '\u0001ΚΕΦΑΛΙΔΑ\u0001';
const EMU_CM = 360000;   // 1 εκ. σε EMU
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const JC: Record<HeadAl, string> = { l: 'left', c: 'center', r: 'right' };
export interface DocxHeadOpts { dateText: string; font?: string; sz?: number }   // sz: μέγεθος γραμμάτων σε στιγμές όταν το κομμάτι δεν έχει δικό του
export async function putDocxHead(buf: Buffer, head: DocHead, o: DocxHeadOpts): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf); const f = zip.file('word/document.xml'); if (!f) return buf;
  let xml = await f.async('string');
  const mi = xml.indexOf(HEAD_MARK);
  // η παράγραφος με την ετικέτα (ή οι αρχή του σώματος)
  let from = -1, to = -1;
  if (mi >= 0) { from = xml.lastIndexOf('<w:p', mi); while (from >= 0 && !/^<w:p[\s>]/.test(xml.slice(from, from + 6))) from = xml.lastIndexOf('<w:p', from - 1); to = xml.indexOf('</w:p>', mi) + 6; }
  const at = from >= 0 ? from : (() => { const b = /<w:body[^>]*>/.exec(xml); return b ? b.index + b[0].length : 0; })();
  // πλάτος: το κελί που είναι η ετικέτα, αλλιώς το πλάτος κειμένου της σελίδας
  let width = 0;
  if (from >= 0) { const open = xml.lastIndexOf('<w:tc>', from), close = xml.lastIndexOf('</w:tc>', from); if (open > close) width = Number(/<w:tcW[^>]*w:w="(\d+)"/.exec(xml.slice(open, from))?.[1]) || 0; }
  if (!width) {
    const pg = [...xml.matchAll(/<w:pgSz\b[^>]*w:w="(\d+)"/g)].pop()?.[1], mar = [...xml.matchAll(/<w:pgMar\b[^>]*>/g)].pop()?.[0] || '';
    const l = Number(/w:left="(\d+)"/.exec(mar)?.[1] ?? 1800), r = Number(/w:right="(\d+)"/.exec(mar)?.[1] ?? 1800);
    width = pg ? Number(pg) - l - r : 9000;
  }
  const font = o.font || 'Arial', defSz = o.sz || 12;
  const rels = await zip.file('word/_rels/document.xml.rels')?.async('string') || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let relsOut = rels; let ct = await zip.file('[Content_Types].xml')!.async('string'); let nImg = 0;
  const rpr = (it: { sz?: number; b?: boolean; u?: boolean; i?: boolean } | null) => { const sz = Math.round((it?.sz ?? defSz) * 2); return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${it?.b ? '<w:b/>' : ''}${it?.i ? '<w:i/>' : ''}${it?.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`; };
  const para = (inner: string, al: HeadAl, r = '') => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${JC[al]}"/>${r}</w:pPr>${inner}</w:p>`;
  const picture = (it: Extract<HeadItem, { k: 'img' }>, maxTw: number): { run: string; tw: number } | null => {
    const img = it.id ? loadHeadImage(it.id, !!it.gray) : null; if (!img) return null;
    let cy = it.h * EMU_CM, cx = (cy * img.w) / img.h; const maxEmu = Math.max(1, maxTw - 100) * 635;
    if (cx > maxEmu) { cx = maxEmu; cy = (cx * img.h) / img.w; }
    cx = Math.round(cx); cy = Math.round(cy); nImg++;
    const rid = 'rIdHead' + nImg, name = 'head' + nImg + '.' + img.ext;
    zip.file('word/media/' + name, img.bytes);
    relsOut = relsOut.replace('</Relationships>', `<Relationship Id="${rid}" Type="${NS_R}/image" Target="media/${name}"/></Relationships>`);
    if (!new RegExp('<Default\\b[^>]*Extension="' + img.ext + '"', 'i').test(ct)) ct = ct.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${img.ext}" ContentType="${img.mime}"/>`);
    const run = `<w:r><w:drawing><wp:inline xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + nImg}" name="Εικόνα ${nImg}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${nImg}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return { run, tw: Math.round(cx / 635) };
  };
  const text = (it: Extract<HeadItem, { k: 'text' }> | { k: 'date' }) => {
    const isDate = it.k === 'date'; const t = isDate ? o.dateText : it.t; const st = isDate ? { b: true } : it;
    return para(t ? `<w:r>${rpr(st)}<w:t xml:space="preserve">${esc(upperOrd(t))}</w:t></w:r>` : '', (isDate ? 'c' : it.al) || 'c', rpr(st));
  };
  const cellOf = (items: HeadItem[], w: number): string => {
    const side = items.filter((x): x is Extract<HeadItem, { k: 'img' }> => x.k === 'img' && !!x.side);
    const body = (list: HeadItem[], ww: number) => list.map(it => {
      if (it.k === 'gap') return para('', 'c', rpr(null));
      if (it.k === 'img') { const p = picture(it, ww); return p ? para(p.run, it.al || 'c') : ''; }
      return text(it);
    }).join('') || para('', 'c');
    if (!side.length) return body(items, w);
    // εικόνα δίπλα: μέσα στο κουτί ένας πίνακας δύο κελιών (εικόνα | κείμενο, ή κείμενο | εικόνα αν είναι δεξιά)
    const rest = items.filter(x => !(x.k === 'img' && x.side)); const right = side[0].al === 'r';
    const pics = side.map(it => picture(it, Math.round(w / 2))).filter((x): x is { run: string; tw: number } => !!x);
    if (!pics.length) return body(rest, w);
    const iw = Math.min(Math.round(w / 2), Math.max(...pics.map(p => p.tw)) + 100), tw = w - iw;
    const tc = (cw: number, inner: string) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
    const ic = tc(iw, pics.map(p => para(p.run, right ? 'r' : 'l')).join('')), xc = tc(tw, body(rest, tw));
    return `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${right ? tw : iw}"/><w:gridCol w:w="${right ? iw : tw}"/></w:tblGrid><w:tr>${right ? xc + ic : ic + xc}</w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>`;
  };
  // πλάτη: το zonesOf σε 60 ίσες στήλες (όριο στα 1/3 και 2/3, κενό κουτί δανείζει το πλάτος του)
  const N = 60; const used = [0, 1, 2].map(z => (head.z[z] || []).some(it => it.k === 'text' ? !!it.t : it.k === 'img' ? !!it.id : it.k === 'date'));
  const zs = zonesOf(Array.from({ length: N }, () => 10), used);
  const ws = zs.map(([a, b]) => Math.max(0, b - a + 1)); const tw = ws.map(n => Math.round((n * width) / N));
  const live = [0, 1, 2].filter(z => tw[z] > 0 && (head.z[z] || []).length);
  const grid = live.map(z => tw[z]);
  if (!grid.length) return buf;
  grid[grid.length - 1] += width - grid.reduce((a, b) => a + b, 0);
  const tbl = `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid><w:tr>${live.map((z, i) => `<w:tc><w:tcPr><w:tcW w:w="${grid[i]}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${cellOf(head.z[z], grid[i] - 120)}</w:tc>`).join('')}</w:tr></w:tbl>`;
  // ένα τελευταίο στοιχείο χωρίς παράγραφο μέσα σε κελί θέλει παράγραφο μετά τον πίνακα
  const after = from >= 0 && /^\s*<\/w:tc>/.test(xml.slice(to)) ? '<w:p/>' : '';
  xml = from >= 0 ? xml.slice(0, from) + tbl + after + xml.slice(to) : xml.slice(0, at) + tbl + '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>' + xml.slice(at);
  zip.file('word/document.xml', xml); zip.file('word/_rels/document.xml.rels', relsOut); zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Το Word της Ημερήσιας Διαταγής: δικό σου πρότυπο (own) ή το έτοιμο, γεμισμένο, και με την επικεφαλίδα που σχεδίασες (hd) αν υπάρχει
export async function makeHdDocx(own: Buffer | null, tags: Record<string, string>, hd: DocHead | null, o: DocxHeadOpts): Promise<Buffer> {
  const data = await fillDocx(own || await builtinTemplate(!!hd), hd ? { ...tags, [HEAD_TAG]: HEAD_MARK } : tags);
  return hd ? putDocxHead(data, hd, o) : data;
}
