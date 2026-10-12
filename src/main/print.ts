// Εκτύπωση των Excel χωρίς Excel (Michael, 11/10): το αρχείο γίνεται σελίδες HTML με τη διάταξη σελίδας του
// (χαρτί, προσανατολισμός, περιθώρια, κλίμακα ή «προσαρμογή σε σελίδες», περιοχή εκτύπωσης, αλλαγές σελίδας,
// γραμμές τίτλων, κεφαλίδα/υποσέλιδο) και τυπώνεται από το Chromium του Electron με τον διάλογο εκτυπωτή των Windows.
// Κρατά γραμματοσειρές, πλαίσια, χρώματα, στοίχιση, συγχωνεύσεις και υπολογίζει ξανά τους απλούς τύπους
// (SUM, ROW()-6, E17-Z17…), γιατί τα αρχεία που γράφει η εφαρμογή έχουν τις παλιές τιμές μέχρι να τα ανοίξει ο Excel.
import JSZip from 'jszip';
import { colName, colNum, texts, unesc } from './xlsx';

const attr = (s: string, n: string) => { const m = new RegExp('\\s' + n + '="([^"]*)"').exec(s); return m ? unesc(m[1]) : null; };
const num = (s: string, n: string, d: number) => { const v = attr(s, n); return v == null || v === '' || isNaN(+v) ? d : +v; };
const on = (s: string, tag: string) => { const m = new RegExp('<' + tag + '\\b([^>]*)/?>').exec(s); return !!m && !/val="(0|false)"/.test(m[1]); };
const block = (xml: string, tag: string) => new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml)?.[1] || '';
const items = (xml: string, tag: string) => [...xml.matchAll(new RegExp('<' + tag + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + tag + '>)', 'g'))].map(m => m[0]);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const key = (r: number, c: number) => r * 16384 + c;

// ------------------------------------------------------------------ χρώματα
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333', '000000', 'FFFFFF'];
function tint(hex: string, t: number): string {
  if (!t) return hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; let l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const f = (p: number, q: number, x: number) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const out = s === 0 ? [l, l, l] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return out.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// <color rgb|theme|indexed|auto …/> → #RRGGBB (null = προεπιλογή)
function color(tag: string | undefined, theme: string[]): string | null {
  if (!tag || attr(tag, 'auto') === '1') return null;
  let hex: string | null = null;
  const rgb = attr(tag, 'rgb'), th = attr(tag, 'theme'), ix = attr(tag, 'indexed');
  if (rgb) hex = rgb.slice(-6); else if (th != null) hex = theme[+th] || null; else if (ix != null) hex = INDEXED[+ix] || null;
  if (!hex) return null;
  return '#' + tint(hex.toUpperCase(), num(tag, 'tint', 0));
}
function themeColors(xml: string): string[] {
  const sch = block(xml, 'a:clrScheme'); const get = (n: string) => { const b = block(sch, 'a:' + n); return attr(b, 'lastClr') || attr(b, 'val') || '000000'; };
  // σειρά του Excel: lt1, dk1, lt2, dk2, accent1…6, hlink, folHlink
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(get).map(x => (/^[0-9a-f]{6}$/i.test(x) ? x : x === 'window' ? 'FFFFFF' : '000000'));
}

// ------------------------------------------------------------------ στυλ
interface Font { name: string; sz: number; b: boolean; i: boolean; u: string | null; strike: boolean; color: string | null; serif: boolean }
interface Side { w: number; style: string; color: string }
interface Xf { font: number; fill: string | null; border: { l?: Side; r?: Side; t?: Side; b?: Side }; fmt: number; h: string; v: string; wrap: boolean; indent: number; rot: number }
interface Styles { fonts: Font[]; xfs: Xf[]; codes: Map<number, string> }
const BORDER: Record<string, [number, string]> = { thin: [1, 'solid'], hair: [1, 'dotted'], dotted: [1, 'dotted'], dashed: [1, 'dashed'], dashDot: [1, 'dashed'], dashDotDot: [1, 'dashed'],
  medium: [2, 'solid'], mediumDashed: [2, 'dashed'], mediumDashDot: [2, 'dashed'], mediumDashDotDot: [2, 'dashed'], slantDashDot: [2, 'dashed'], thick: [3, 'solid'], double: [3, 'double'] };
const DENSITY: Record<string, number> = { darkGray: 0.75, mediumGray: 0.5, lightGray: 0.25, gray125: 0.125, gray0625: 0.0625 };
const mix = (a: string, b: string, k: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
function parseStyles(xml: string, theme: string[]): Styles {
  const codes = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) codes.set(num(m[0], 'numFmtId', 0), attr(m[0], 'formatCode') || '');
  const fonts = items(block(xml, 'fonts'), 'font').map((f): Font => {
    const u = /<u\b([^>]*)\/?>/.exec(f);
    return { name: attr(/<name\b[^>]*>/.exec(f)?.[0] || '', 'val') || 'Calibri', sz: num(/<sz\b[^>]*>/.exec(f)?.[0] || '', 'val', 11), b: on(f, 'b'), i: on(f, 'i'),
      u: u ? (attr(u[1], 'val') || 'single') : null, strike: on(f, 'strike'), color: color(/<color\b[^>]*>/.exec(f)?.[0], theme), serif: attr(/<family\b[^>]*>/.exec(f)?.[0] || '', 'val') === '1' };
  });
  const fills = items(block(xml, 'fills'), 'fill').map(f => {
    const p = /<patternFill\b([^>]*)>?/.exec(f); const type = p ? attr(p[1], 'patternType') || 'none' : 'none';
    if (/<gradientFill/.test(f)) return color(/<color\b[^>]*>/.exec(f)?.[0], theme);
    if (type === 'none') return null;
    const fg = color(/<fgColor\b[^>]*>/.exec(f)?.[0], theme) || '#000000';
    if (type === 'solid') return fg;
    const bg = color(/<bgColor\b[^>]*>/.exec(f)?.[0], theme) || '#FFFFFF';
    return mix(fg, bg, DENSITY[type] ?? 0.5);
  });
  const borders = items(block(xml, 'borders'), 'border').map(b => {
    const side = (n: string): Side | undefined => {
      const m = new RegExp('<' + n + '\\b([^>]*?)(?:/>|>([\\s\\S]*?)</' + n + '>)').exec(b); const st = m && attr(m[1], 'style');
      if (!st || st === 'none' || !BORDER[st]) return undefined;
      return { w: BORDER[st][0], style: BORDER[st][1], color: color(/<color\b[^>]*>/.exec(m[2] || '')?.[0], theme) || (st === 'hair' ? '#808080' : '#000000') };
    };
    return { l: side('left') || side('start'), r: side('right') || side('end'), t: side('top'), b: side('bottom') };
  });
  const xfs = items(block(xml, 'cellXfs'), 'xf').map((x): Xf => {
    const head = x.slice(0, x.indexOf('>') + 1); const al = /<alignment\b[^>]*>/.exec(x)?.[0] || '';
    return { font: num(head, 'fontId', 0), fill: fills[num(head, 'fillId', 0)] ?? null, border: borders[num(head, 'borderId', 0)] || {}, fmt: num(head, 'numFmtId', 0),
      h: attr(al, 'horizontal') || 'general', v: attr(al, 'vertical') || 'bottom', wrap: attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true', indent: num(al, 'indent', 0), rot: num(al, 'textRotation', 0) };
  });
  if (!fonts.length) fonts.push({ name: 'Calibri', sz: 11, b: false, i: false, u: null, strike: false, color: null, serif: false });
  if (!xfs.length) xfs.push({ font: 0, fill: null, border: {}, fmt: 0, h: 'general', v: 'bottom', wrap: false, indent: 0, rot: 0 });
  return { fonts, xfs, codes };
}

// ------------------------------------------------------------------ μορφές αριθμών και ημερομηνιών
const BUILTIN: Record<number, string> = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'd/m/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'd/m/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
const MON = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MONTH = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const DAY = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'], DAYL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
// ελληνικές ρυθμίσεις των Windows: κόμμα για δεκαδικά, τελεία για χιλιάδες
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const isDateFmt = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/General/i, ''));
function general(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
  let s = Math.abs(n) >= 1e11 || (Math.abs(n) < 1e-9 && n !== 0) ? n.toExponential(5).replace(/\.?0+e/, 'E').replace(/E\+?/, 'E+').replace('E+-', 'E-') : String(+n.toPrecision(10));
  return s.replace('.', ',');
}
function fmtDate(n: number, code: string, y1904: boolean): string {
  const ms = Math.round(((y1904 ? n + 1462 : n) - 25569) * 86400000); const d = new Date(ms);
  if (isNaN(d.getTime())) return general(n);
  const ampm = /AM\/PM|A\/P/i.test(code);
  const parts = code.replace(/\[[^\]]*\]/g, '').match(/"[^"]*"|\\.|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+|./gi) || [];
  const out: string[] = []; let prevH = false;
  parts.forEach((p, i) => {
    const l = p.toLowerCase(); const H = d.getUTCHours();
    if (p.startsWith('"')) out.push(p.slice(1, -1));
    else if (p.startsWith('\\')) out.push(p.slice(1));
    else if (l === 'yyyy') out.push(String(d.getUTCFullYear()));
    else if (l === 'yy') out.push(String(d.getUTCFullYear()).slice(2));
    else if (l === 'mmmmm') out.push(MONTH[d.getUTCMonth()][0]);
    else if (l === 'mmmm') out.push(MONTH[d.getUTCMonth()]);
    else if (l === 'mmm') out.push(MON[d.getUTCMonth()]);
    else if (l === 'mm' || l === 'm') {
      // λεπτά αν ακολουθεί ώρα ή ακολουθούν δευτερόλεπτα
      const next = parts.slice(i + 1).find(x => /^[a-z]/i.test(x) && !/^(am\/pm|a\/p)$/i.test(x));
      const minute = prevH || (!!next && /^s/i.test(next));
      const v = minute ? d.getUTCMinutes() : d.getUTCMonth() + 1; out.push(l === 'mm' ? String(v).padStart(2, '0') : String(v));
    } else if (l === 'dddd') out.push(DAYL[d.getUTCDay()]);
    else if (l === 'ddd') out.push(DAY[d.getUTCDay()]);
    else if (l === 'dd') out.push(String(d.getUTCDate()).padStart(2, '0'));
    else if (l === 'd') out.push(String(d.getUTCDate()));
    else if (l === 'hh' || l === 'h') { const h = ampm ? (H % 12 || 12) : H; out.push(l === 'hh' ? String(h).padStart(2, '0') : String(h)); }
    else if (l === 'ss' || l === 's') out.push(l === 'ss' ? String(d.getUTCSeconds()).padStart(2, '0') : String(d.getUTCSeconds()));
    else if (l === 'am/pm') out.push(H < 12 ? 'πμ' : 'μμ');
    else if (l === 'a/p') out.push(H < 12 ? 'π' : 'μ');
    else if (p.startsWith('.0')) out.push(',' + String(d.getUTCMilliseconds()).padStart(3, '0').slice(0, p.length - 1));
    else out.push(p);
    if (/^h/i.test(p)) prevH = true; else if (/^[a-z]/i.test(p) && !/^m/i.test(p)) prevH = false;
  });
  return out.join('');
}
function fmtNumber(n: number, code: string): string {
  const neg = n < 0; let x = Math.abs(n);
  let lit = ''; const tokens = code.match(/"[^"]*"|\\.|_.|\*.|[0#?.,%Ee+\-]|./g) || [];
  const body = tokens.filter(t => /^[0#?.,%]$/.test(t)).join('');
  const pct = (body.match(/%/g) || []).length; x *= Math.pow(100, pct);
  const dot = body.indexOf('.'); const dec = dot < 0 ? 0 : (body.slice(dot + 1).match(/[0#?]/g) || []).length;
  const minDec = dot < 0 ? 0 : (body.slice(dot + 1).match(/0/g) || []).length;
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const thousands = /[0#?],[0#?]/.test(intPart); const scale = (intPart.match(/,+$/)?.[0].length || 0); x /= Math.pow(1000, scale);
  let [ip, fp = ''] = x.toFixed(dec).split('.');
  fp = fp.replace(/0+$/, ''); while (fp.length < minDec) fp += '0';
  const minInt = (intPart.match(/0/g) || []).length; if (ip === '0' && minInt === 0) ip = ''; while (ip.length < minInt) ip = '0' + ip;
  if (thousands) ip = group(ip);
  const numStr = ip + (fp ? ',' + fp : '');
  let placed = false;
  for (const t of tokens) {
    if (/^[0#?.,%]$/.test(t)) { if (!placed) { lit += numStr; placed = true; } if (t === '%') lit += '%'; continue; }
    if (t.startsWith('"')) lit += t.slice(1, -1); else if (t.startsWith('\\')) lit += t.slice(1); else if (t.startsWith('_')) lit += ' '; else if (t.startsWith('*')) continue; else lit += t;
  }
  if (!placed) lit += numStr;
  return (neg ? '-' : '') + lit;
}
export function formatValue(v: unknown, fmtId: number, codes: Map<number, string>, y1904 = false): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  const raw = codes.get(fmtId) ?? BUILTIN[fmtId] ?? 'General';
  const secs = raw.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let code = secs[0]; let n = v;
  if (v < 0 && secs.length > 1 && secs[1] !== '') { code = secs[1]; n = -v; } else if (v === 0 && secs.length > 2 && secs[2] !== '') code = secs[2];
  code = code.replace(/\[(Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color\s*\d+|[<>=][^\]]*)\]/gi, '').replace(/\[\$([^-\]]*)-[0-9A-F]+\]/gi, '$1').trim();
  if (!code || /^General$/i.test(code)) return general(n === v ? v : -n);
  if (code === '@') return general(v);
  if (isDateFmt(code)) return fmtDate(v, code, y1904);
  const s = fmtNumber(n, code);
  return n !== v ? s.replace(/^-/, '') : s;
}

// ------------------------------------------------------------------ τύποι: υπολογισμός των απλών (ό,τι δεν καταλαβαίνουμε κρατά την τιμή που έχει το αρχείο)
class XErr { constructor(public code: string) {} toString() { return this.code; } }
type Val = number | string | boolean | null | XErr;
type Arg = Val | { range: Val[]; r: number; c: number };
type Node = { t: 'v'; v: Val } | { t: 'ref'; sheet: string | null; r1: number; c1: number; r2: number; c2: number; area: boolean } | { t: 'fn'; name: string; args: Node[] } | { t: 'op'; op: string; a: Node; b?: Node };
class Unsupported extends Error {}
const TOK = /\s+|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[^\s'!:(),;"+\-*/^&=<>%]+)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+)(?![\w(])|(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|([A-Z_][A-Z0-9_.]*)\(|(TRUE|FALSE)(?![\w(])|(<>|<=|>=|[-+*/^&=<>(),;%])/giy;
function tokenize(f: string) {
  const out: { k: string; v: string; sheet?: string }[] = []; TOK.lastIndex = 0; let m: RegExpExecArray | null;
  while (TOK.lastIndex < f.length) {
    const at = TOK.lastIndex; m = TOK.exec(f);
    if (!m || TOK.lastIndex === at) throw new Unsupported(f);
    if (m[1]) out.push({ k: 'str', v: m[1].slice(1, -1).replace(/""/g, '"') });
    else if (m[3]) out.push({ k: 'ref', v: m[3].toUpperCase(), sheet: m[2] ? m[2].slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : undefined });
    else if (m[4]) out.push({ k: 'num', v: m[4] });
    else if (m[5]) out.push({ k: 'fn', v: m[5].toUpperCase().replace(/^_XLFN\./, '') });
    else if (m[6]) out.push({ k: 'bool', v: m[6].toUpperCase() });
    else if (m[7]) out.push({ k: 'op', v: m[7] === ';' ? ',' : m[7] });
  }
  return out;
}
const MAXR = 1048576, MAXC = 16384;
function parseRef(v: string, sheet: string | null): Node {
  const [a, b] = v.split(':');
  const one = (x: string) => { const m = /^\$?([A-Z]+)?\$?(\d+)?$/.exec(x)!; return { c: m[1] ? colNum(m[1]) : 0, r: m[2] ? +m[2] : 0 }; };
  const p = one(a), q = one(b || a);
  const area = !!b;
  return { t: 'ref', sheet, r1: p.r || 1, c1: p.c || 1, r2: q.r || (p.r ? q.r : MAXR), c2: q.c || (p.c ? q.c : MAXC), area };
}
function parseFormula(f: string): Node {
  const tk = tokenize(f.replace(/^=/, '')); let i = 0;
  const peek = () => tk[i]; const isOp = (...o: string[]) => tk[i]?.k === 'op' && o.includes(tk[i].v);
  const expr = (): Node => { let a = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = tk[i++].v; a = { t: 'op', op, a, b: cat() }; } return a; };
  const cat = (): Node => { let a = add(); while (isOp('&')) { i++; a = { t: 'op', op: '&', a, b: add() }; } return a; };
  const add = (): Node => { let a = mul(); while (isOp('+', '-')) { const op = tk[i++].v; a = { t: 'op', op, a, b: mul() }; } return a; };
  const mul = (): Node => { let a = pow(); while (isOp('*', '/')) { const op = tk[i++].v; a = { t: 'op', op, a, b: pow() }; } return a; };
  const pow = (): Node => { let a = unary(); while (isOp('^')) { i++; a = { t: 'op', op: '^', a, b: unary() }; } return a; };
  const unary = (): Node => { if (isOp('-', '+')) { const op = tk[i++].v; const a = unary(); return op === '-' ? { t: 'op', op: 'neg', a } : a; } return post(); };
  const post = (): Node => { let a = prim(); while (isOp('%')) { i++; a = { t: 'op', op: '%', a }; } return a; };
  const prim = (): Node => {
    const x = peek(); if (!x) throw new Unsupported(f);
    i++;
    if (x.k === 'num') return { t: 'v', v: +x.v };
    if (x.k === 'str') return { t: 'v', v: x.v };
    if (x.k === 'bool') return { t: 'v', v: x.v === 'TRUE' };
    if (x.k === 'ref') return parseRef(x.v, x.sheet ?? null);
    if (x.k === 'fn') {
      const args: Node[] = [];
      if (!isOp(')')) { do { if (isOp(',') || isOp(')')) args.push({ t: 'v', v: null }); else args.push(expr()); } while (isOp(',') && ++i); }
      if (!isOp(')')) throw new Unsupported(f); i++;
      return { t: 'fn', name: x.v, args };
    }
    if (x.k === 'op' && x.v === '(') { const e = expr(); if (!isOp(')')) throw new Unsupported(f); i++; return e; }
    throw new Unsupported(f);
  };
  const n = expr(); if (i !== tk.length) throw new Unsupported(f);
  return n;
}
const toNum = (v: Val): number | XErr => { if (v instanceof XErr) return v; if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return v; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? new XErr('#VALUE!') : n; };
const toStr = (v: Val) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? general(v) : String(v));
const toBool = (v: Val): boolean | XErr => { if (v instanceof XErr) return v; if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return new XErr('#VALUE!'); } const n = toNum(v); return n instanceof XErr ? n : n !== 0; };
function crit(c: Val): (v: Val) => boolean {
  const s = typeof c === 'string' ? c : null;
  const m = s ? /^(<>|<=|>=|=|<|>)?([\s\S]*)$/.exec(s)! : null;
  const op = m?.[1] || '=', rhs = m ? m[2] : c;
  const rn = typeof rhs === 'number' ? rhs : rhs != null && rhs !== '' && !isNaN(Number(rhs)) ? Number(rhs) : null;
  return v => {
    if (rn != null && typeof v === 'number') { const d = v - rn; return op === '=' ? d === 0 : op === '<>' ? d !== 0 : op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0; }
    const a = toStr(v).toLowerCase(), b = toStr(rhs as Val).toLowerCase();
    if (op === '=') return b.includes('*') || b.includes('?') ? new RegExp('^' + b.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(a) : a === b;
    if (op === '<>') return a !== b;
    return false;
  };
}

// ------------------------------------------------------------------ φύλλα
interface XCell { v: Val; f?: string; s: number | null }
interface ParsedSheet {
  name: string; cells: Map<number, XCell>; rows: Map<number, { ht?: number; hidden: boolean; s?: number }>; cols: { min: number; max: number; w?: number; hidden: boolean; s?: number }[];
  merges: { r1: number; c1: number; r2: number; c2: number }[]; maxR: number; maxC: number; xml: string; defH: number; defW: number;
}
const colPx = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
const ptPx = (pt: number) => (pt * 96) / 72;

class Book {
  private parsed = new Map<string, ParsedSheet>();
  private memo = new Map<string, Map<number, Val>>();
  private busy = new Set<string>();
  sst: string[] = []; styles!: Styles; y1904 = false;
  sheets: { name: string; path: string; hidden: boolean }[] = []; wbXml = ''; activeTab = 0;
  constructor(private zip: JSZip) {}
  static async open(buf: Buffer | Uint8Array): Promise<Book> {
    const zip = await JSZip.loadAsync(buf); const b = new Book(zip);
    const wbx = await zip.file('xl/workbook.xml')?.async('string');
    if (!wbx) throw new Error('Το αρχείο δεν είναι Excel (.xlsx)');
    b.wbXml = wbx; b.y1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wbx); b.activeTab = num(/<workbookView\b[^>]*>/.exec(wbx)?.[0] || '', 'activeTab', 0);
    const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
    const rel = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'), t = attr(m[0], 'Target'); if (id && t) rel.set(id, t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '')); }
    for (const m of wbx.matchAll(/<sheet\b[^>]*>/g)) { const p = rel.get(attr(m[0], 'r:id') || ''); if (p && zip.file(p)) b.sheets.push({ name: attr(m[0], 'name') || '', path: p, hidden: /state="(hidden|veryHidden)"/.test(m[0]) }); }
    const sst = zip.file('xl/sharedStrings.xml') || zip.file(/sharedStrings\.xml$/i)[0];
    if (sst) b.sst = [...(await sst.async('string')).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map(m => texts(m[1] || ''));
    const th = zip.file(/theme\d*\.xml$/i)[0];
    b.styles = parseStyles((await zip.file('xl/styles.xml')?.async('string')) || '', themeColors(th ? await th.async('string') : ''));
    return b;
  }
  async load(name: string): Promise<ParsedSheet | null> {
    if (this.parsed.has(name)) return this.parsed.get(name)!;
    const e = this.sheets.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!e) return null;
    const xml = await this.zip.file(e.path)!.async('string');
    const sh = parseSheet(e.name, xml, this.sst);
    this.parsed.set(e.name, sh); if (e.name !== name) this.parsed.set(name, sh);
    return sh;
  }
  // όλα τα φύλλα στα οποία αναφέρονται οι τύποι, πριν τον (σύγχρονο) υπολογισμό
  async loadRefs(sh: ParsedSheet) {
    const seen = new Set<string>([sh.name]); const todo = [sh];
    while (todo.length) {
      const x = todo.pop()!;
      for (const c of x.cells.values()) if (c.f) for (const m of c.f.matchAll(/(?:'((?:[^']|'')+)'|([^\s'!:(),;"+\-*/^&=<>%]+))!/g)) {
        const n = (m[1] || m[2]).replace(/''/g, "'"); if (seen.has(n)) continue; seen.add(n);
        const y = await this.load(n); if (y) todo.push(y);
      }
    }
  }
  value(sheet: string, r: number, c: number): Val {
    const sh = this.parsed.get(sheet); if (!sh) return new XErr('#REF!');
    const cell = sh.cells.get(key(r, c)); if (!cell) return null;
    if (!cell.f) return cell.v;
    let m = this.memo.get(sh.name); if (!m) { m = new Map(); this.memo.set(sh.name, m); }
    const k = key(r, c); if (m.has(k)) return m.get(k)!;
    const id = sh.name + '!' + k;
    if (this.busy.has(id)) return cell.v;   // κυκλική αναφορά: η τιμή του αρχείου
    this.busy.add(id);
    let v: Val;
    try { v = this.evalNode(parseFormula(cell.f), sh.name, r, c); if (v === null) v = 0; }
    catch { v = cell.v; }
    finally { this.busy.delete(id); }
    m.set(k, v);
    return v;
  }
  private range(n: Extract<Node, { t: 'ref' }>, sheet: string): Val[] {
    const sh = this.parsed.get(n.sheet || sheet); if (!sh) return [new XErr('#REF!')];
    const r2 = Math.min(n.r2, sh.maxR), c2 = Math.min(n.c2, sh.maxC); const out: Val[] = [];
    for (let r = n.r1; r <= r2; r++) for (let c = n.c1; c <= c2; c++) out.push(this.value(sh.name, r, c));
    return out;
  }
  private evalNode(n: Node, sheet: string, r: number, c: number): Val {
    const ev = (x: Node) => { const a = this.evalArg(x, sheet, r, c); return isRange(a) ? (a.range.length === 1 ? a.range[0] : new XErr('#VALUE!')) : a; };
    if (n.t === 'v') return n.v;
    if (n.t === 'ref') return ev(n);
    if (n.t === 'op') {
      if (n.op === 'neg') { const a = toNum(ev(n.a)); return a instanceof XErr ? a : -a; }
      if (n.op === '%') { const a = toNum(ev(n.a)); return a instanceof XErr ? a : a / 100; }
      const A = ev(n.a), B = ev(n.b!);
      if (A instanceof XErr) return A; if (B instanceof XErr) return B;
      if (n.op === '&') return toStr(A) + toStr(B);
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
        const cmp = typeof A === 'number' && typeof B === 'number' ? A - B : typeof A === 'string' || typeof B === 'string' ? toStr(A).toLowerCase().localeCompare(toStr(B).toLowerCase()) : (toNum(A) as number) - (toNum(B) as number);
        return n.op === '=' ? cmp === 0 : n.op === '<>' ? cmp !== 0 : n.op === '<' ? cmp < 0 : n.op === '>' ? cmp > 0 : n.op === '<=' ? cmp <= 0 : cmp >= 0;
      }
      const a = toNum(A), b = toNum(B); if (a instanceof XErr) return a; if (b instanceof XErr) return b;
      if (n.op === '+') return a + b; if (n.op === '-') return a - b; if (n.op === '*') return a * b;
      if (n.op === '/') return b === 0 ? new XErr('#DIV/0!') : a / b;
      if (n.op === '^') return Math.pow(a, b);
      throw new Unsupported(n.op);
    }
    return this.fn(n.name, n.args, sheet, r, c, ev);
  }
  private evalArg(n: Node, sheet: string, r: number, c: number): Arg {
    if (n.t === 'ref') {
      if (n.r1 === n.r2 && n.c1 === n.c2) return this.parsed.has(n.sheet || sheet) ? this.value(this.parsed.get(n.sheet || sheet)!.name, n.r1, n.c1) : new XErr('#REF!');
      return { range: this.range(n, sheet), r: n.r1, c: n.c1 };
    }
    return this.evalNode(n, sheet, r, c);
  }
  private fn(name: string, args: Node[], sheet: string, r: number, c: number, ev: (x: Node) => Val): Val {
    const all = () => { const out: { v: Val; direct: boolean }[] = []; for (const a of args) { const x = this.evalArg(a, sheet, r, c); if (isRange(x)) x.range.forEach(v => out.push({ v, direct: false })); else out.push({ v: x, direct: true }); } return out; };
    const nums = () => { const out: number[] = []; for (const { v, direct } of all()) { if (v instanceof XErr) throw v; if (typeof v === 'number') out.push(v); else if (direct && v != null) { const n = toNum(v); if (n instanceof XErr) throw n; out.push(n); } } return out; };
    try {
      switch (name) {
        case 'SUM': return nums().reduce((a, b) => a + b, 0);
        case 'AVERAGE': { const n = nums(); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : new XErr('#DIV/0!'); }
        case 'MIN': { const n = nums(); return n.length ? Math.min(...n) : 0; }
        case 'MAX': { const n = nums(); return n.length ? Math.max(...n) : 0; }
        case 'PRODUCT': return nums().reduce((a, b) => a * b, 1);
        case 'COUNT': return all().filter(x => typeof x.v === 'number').length;
        case 'COUNTA': return all().filter(x => x.v != null && x.v !== '').length;
        case 'COUNTBLANK': return all().filter(x => x.v == null || x.v === '').length;
        case 'COUNTIF': case 'SUMIF': {
          const rg = this.evalArg(args[0], sheet, r, c); const list = isRange(rg) ? rg.range : [rg as Val]; const ok = crit(ev(args[1]));
          if (name === 'COUNTIF') return list.filter(ok).length;
          const sr = args[2] ? this.evalArg(args[2], sheet, r, c) : rg; const sl = isRange(sr) ? sr.range : [sr as Val];
          return list.reduce((a: number, v, i) => a + (ok(v) && typeof sl[i] === 'number' ? (sl[i] as number) : 0), 0);
        }
        case 'ROW': case 'COLUMN': { if (!args.length) return name === 'ROW' ? r : c; const x = args[0]; if (x.t !== 'ref') throw new Unsupported(name); return name === 'ROW' ? x.r1 : x.c1; }
        case 'IF': { const t = toBool(ev(args[0])); if (t instanceof XErr) return t; return t ? (args[1] ? ev(args[1]) : true) : args[2] ? ev(args[2]) : false; }
        case 'IFERROR': { const v = ev(args[0]); return v instanceof XErr ? ev(args[1]) : v; }
        case 'AND': case 'OR': { const bs = all().filter(x => x.v != null).map(x => toBool(x.v)); const e = bs.find(b => b instanceof XErr); if (e) return e as XErr; return name === 'AND' ? bs.every(Boolean) : bs.some(Boolean); }
        case 'NOT': { const b = toBool(ev(args[0])); return b instanceof XErr ? b : !b; }
        case 'ABS': case 'INT': { const n = toNum(ev(args[0])); if (n instanceof XErr) return n; return name === 'ABS' ? Math.abs(n) : Math.floor(n); }
        case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
          const n = toNum(ev(args[0])), d = args[1] ? toNum(ev(args[1])) : 0; if (n instanceof XErr) return n; if (d instanceof XErr) return d;
          const k = Math.pow(10, d); const x = n * k; const f = name === 'ROUND' ? Math.round(Math.abs(x)) : name === 'ROUNDUP' ? Math.ceil(Math.abs(x) - 1e-9) : Math.floor(Math.abs(x) + 1e-9);
          return (Math.sign(x) * f) / k;
        }
        case 'MOD': { const a = toNum(ev(args[0])), b = toNum(ev(args[1])); if (a instanceof XErr) return a; if (b instanceof XErr) return b; return b === 0 ? new XErr('#DIV/0!') : a - b * Math.floor(a / b); }
        case 'CONCATENATE': case 'CONCAT': return all().map(x => toStr(x.v)).join('');
        case 'LEN': return toStr(ev(args[0])).length;
        case 'UPPER': return toStr(ev(args[0])).toUpperCase();
        case 'LOWER': return toStr(ev(args[0])).toLowerCase();
        case 'TRIM': return toStr(ev(args[0])).trim().replace(/\s+/g, ' ');
        case 'LEFT': case 'RIGHT': { const s = toStr(ev(args[0])); const n = args[1] ? toNum(ev(args[1])) : 1; if (n instanceof XErr) return n; return name === 'LEFT' ? s.slice(0, n) : n ? s.slice(-n) : ''; }
        case 'MID': { const s = toStr(ev(args[0])); const a = toNum(ev(args[1])), b = toNum(ev(args[2])); if (a instanceof XErr) return a; if (b instanceof XErr) return b; return s.substr(a - 1, b); }
        case 'TODAY': { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }
      }
    } catch (e) { if (e instanceof XErr) return e; throw e; }
    throw new Unsupported(name);
  }
}
const isRange = (a: Arg): a is { range: Val[]; r: number; c: number } => !!a && typeof a === 'object' && 'range' in a;

function parseSheet(name: string, xml: string, sst: string[]): ParsedSheet {
  const cells = new Map<number, XCell>(); const rows = new Map<number, { ht?: number; hidden: boolean; s?: number }>();
  const fmt = /<sheetFormatPr\b[^>]*>/.exec(xml)?.[0] || '';
  const defH = num(fmt, 'defaultRowHeight', 15);
  const defW = attr(fmt, 'defaultColWidth') != null ? colPx(num(fmt, 'defaultColWidth', 8.43)) : Math.ceil((num(fmt, 'baseColWidth', 8) * 7 + 5) / 8) * 8;
  const cols = [...(block(xml, 'cols').matchAll(/<col\b[^>]*>/g))].map(m => ({ min: num(m[0], 'min', 1), max: num(m[0], 'max', 1), w: attr(m[0], 'width') != null ? colPx(num(m[0], 'width', 0)) : undefined, hidden: attr(m[0], 'hidden') === '1' || attr(m[0], 'hidden') === 'true', s: attr(m[0], 'style') != null ? num(m[0], 'style', 0) : undefined }));
  const shared = new Map<string, { f: string; r: number; c: number }>();
  let maxR = 0, maxC = 0, lastR = 0;
  const data = /<sheetData\b[^>]*\/>/.test(xml) ? '' : block(xml, 'sheetData');
  for (const m of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(m[1], 'r') ? num(m[1], 'r', 0) : lastR + 1; lastR = r;
    rows.set(r, { ht: attr(m[1], 'ht') != null ? num(m[1], 'ht', defH) : undefined, hidden: attr(m[1], 'hidden') === '1' || attr(m[1], 'hidden') === 'true', s: attr(m[1], 'customFormat') === '1' ? num(m[1], 's', 0) : undefined });
    let lastC = 0;
    for (const k of (m[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(k[1], 'r'); const c = ref ? colNum(ref.replace(/\d+/g, '')) : lastC + 1; lastC = c;
      const t = attr(k[1], 't'); const inner = k[2] || ''; const s = attr(k[1], 's') != null ? num(k[1], 's', 0) : null;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let v: Val = null;
      if (t === 's') v = raw != null ? sst[+raw] ?? null : null;
      else if (t === 'inlineStr') v = texts(inner);
      else if (t === 'str') v = raw != null ? unesc(raw) : null;
      else if (t === 'b') v = raw === '1';
      else if (t === 'e') v = raw ? new XErr(unesc(raw)) : null;
      else if (t === 'd') { const d = raw ? Date.parse(unesc(raw)) : NaN; v = isNaN(d) ? null : (d - Date.UTC(1899, 11, 30)) / 86400000; }
      else if (raw != null && raw !== '') v = isNaN(+raw) ? unesc(raw) : +raw;
      // τύποι: και οι «κοινοί» (shared) με μετακίνηση των σχετικών αναφορών
      let f: string | undefined;
      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      if (fm) {
        const si = attr(fm[1], 'si'); const body = fm[2] != null ? unesc(fm[2]) : '';
        if (attr(fm[1], 't') === 'shared' && si != null) {
          if (body) shared.set(si, { f: body, r, c }); else { const base = shared.get(si); if (base) f = shiftFormula(base.f, r - base.r, c - base.c); }
        }
        if (body && attr(fm[1], 't') !== 'array') f = body;
      }
      if (v === null && !f && s == null) continue;
      cells.set(key(r, c), { v, f, s });
      if (v !== null || f) { if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
    }
  }
  const merges = [...xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)].map(m => { const [a, b] = m[1].split(':'); const A = cellRef(a), B = cellRef(b || a); return { r1: A.r, c1: A.c, r2: B.r, c2: B.c }; });
  return { name, cells, rows, cols, merges, maxR, maxC, xml, defH, defW };
}
const cellRef = (x: string) => { const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(x)!; return { c: colNum(m[1].toUpperCase()), r: +m[2] }; };
function shiftFormula(f: string, dr: number, dc: number): string {
  return f.replace(/"(?:[^"]|"")*"|(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g, (m, d1, col, d2, row) => {
    if (m.startsWith('"')) return m;
    return (d1 ? d1 + col : colName(colNum(col) + dc)) + (d2 ? d2 + row : String(+row + dr));
  });
}

// ------------------------------------------------------------------ διάταξη σελίδας
const PAPER: Record<number, { name: string; w: number; h: number }> = {
  1: { name: 'Letter', w: 215.9, h: 279.4 }, 5: { name: 'Legal', w: 215.9, h: 355.6 }, 8: { name: 'A3', w: 297, h: 420 }, 9: { name: 'A4', w: 210, h: 297 }, 11: { name: 'A5', w: 148, h: 210 }
};
export interface PrintSheet { name: string; paper: string; landscape: boolean; pages: number; scale: number; html: string }
export interface PrintDoc { sheets: PrintSheet[]; all: string[]; css: string }

function definedName(wbx: string, name: string, idx: number): string | null {
  for (const m of wbx.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)) if (attr(m[1], 'name') === name && attr(m[1], 'localSheetId') === String(idx)) return unesc(m[2]);
  return null;
}
// 'Φύλλο'!$A$1:$M$46 (ή πολλές περιοχές με κόμμα: κρατάμε την πρώτη)
function areaOf(body: string | null): { r1: number; c1: number; r2: number; c2: number } | null {
  if (!body) return null;
  const first = body.split(/,(?=(?:[^']*'[^']*')*[^']*$)/)[0].replace(/^.*!/, '').replace(/\$/g, '');
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(first); if (!m) return null;
  return { c1: colNum(m[1].toUpperCase()), r1: +m[2], c2: colNum((m[3] || m[1]).toUpperCase()), r2: +(m[4] || m[2]) };
}
function titleRows(body: string | null): [number, number] | null {
  if (!body) return null;
  for (const part of body.split(',')) { const m = /!?\$?(\d+):\$?(\d+)$/.exec(part.trim()); if (m) return [+m[1], +m[2]]; }
  return null;
}
// &L &C &R κεφαλίδας/υποσέλιδου, με σελίδα, σύνολο σελίδων, ημερομηνία, όνομα φύλλου και αρχείου
function headerFooter(src: string | null, ctx: { page: number; pages: number; sheet: string; file: string }): [string, string, string] | null {
  if (!src) return null;
  const out: [string, string, string] = ['', '', '']; let sec = 1; const d = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
  const s = src.replace(/&"[^"]*"/g, '').replace(/&K[0-9A-F]{6}/gi, '').replace(/&\d+/g, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '&') { out[sec] += s[i]; continue; }
    const k = s[++i]?.toUpperCase();
    if (k === 'L') sec = 0; else if (k === 'C') sec = 1; else if (k === 'R') sec = 2;
    else if (k === 'P') out[sec] += String(ctx.page); else if (k === 'N') out[sec] += String(ctx.pages);
    else if (k === 'D') out[sec] += p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear();
    else if (k === 'T') out[sec] += p2(d.getHours()) + ':' + p2(d.getMinutes());
    else if (k === 'A') out[sec] += ctx.sheet; else if (k === 'F') out[sec] += ctx.file; else if (k === 'Z') out[sec] += '';
    else if (k === '&') out[sec] += '&';
  }
  return out.some(Boolean) ? out : null;
}

const FONT_FALLBACK: Record<string, string> = { calibri: '"Calibri","Carlito",Arial,sans-serif', cambria: '"Cambria","Caladea",serif', arial: 'Arial,"Liberation Sans",sans-serif', 'times new roman': '"Times New Roman","Liberation Serif",serif', 'book antiqua': '"Book Antiqua","Palatino Linotype",Palatino,serif' };
function fontCss(f: Font): string {
  const fam = FONT_FALLBACK[f.name.toLowerCase()] || `"${f.name.replace(/"/g, '')}",${f.serif ? 'serif' : 'sans-serif'}`;
  return `font:${f.i ? 'italic ' : ''}${f.b ? '700 ' : ''}${f.sz}pt ${fam};` + (f.color ? `color:${f.color};` : '') + (f.u || f.strike ? `text-decoration:${f.u ? 'underline' + (/double/.test(f.u) ? ' double' : '') : ''}${f.strike ? ' line-through' : ''};` : '');
}
const sideCss = (s?: Side) => (s ? `${s.w}px ${s.style} ${s.color}` : '0');

export async function renderBook(buf: Buffer | Uint8Array, opts: { file: string; sheets?: string[] }): Promise<PrintDoc> {
  const book = await Book.open(buf);
  const visible = book.sheets.filter(x => !x.hidden);
  const all = visible.map(x => x.name);
  let want = opts.sheets?.filter(n => all.includes(n)) || [];
  // χωρίς επιλογή (ή φύλλο που δεν υπάρχει πια): όλα τα φύλλα αν είναι λίγα (έντυπα), αλλιώς το ενεργό φύλλο του βιβλίου.
  // Άδεια λίστα = ο χρήστης ξετσέκαρε όλα τα φύλλα.
  if (!want.length && !(opts.sheets && !opts.sheets.length)) want = all.length <= 4 ? all : [book.sheets[book.activeTab] && !book.sheets[book.activeTab].hidden ? book.sheets[book.activeTab].name : all[0]];
  const used = new Set<number>();
  const sheets: PrintSheet[] = [];
  for (const name of want) {
    const sh = (await book.load(name))!; await book.loadRefs(sh);
    sheets.push(renderSheet(book, sh, book.sheets.findIndex(x => x.name === name), opts.file, used));
  }
  const css = [...used].map(i => { const x = book.styles.xfs[i] || book.styles.xfs[0]; return `.s${i}{${fontCss(book.styles.fonts[x.font] || book.styles.fonts[0])}${x.fill ? 'background:' + x.fill + ';' : ''}}`; }).join('\n');
  return { sheets, all, css };
}

function renderSheet(book: Book, sh: ParsedSheet, idx: number, file: string, used: Set<number>): PrintSheet {
  const x = sh.xml; const st = book.styles;
  const ps = /<pageSetup\b[^>]*>/.exec(x)?.[0] || ''; const pm = /<pageMargins\b[^>]*>/.exec(x)?.[0] || '';
  const paper = PAPER[num(ps, 'paperSize', 9)] || PAPER[9];
  const landscape = attr(ps, 'orientation') === 'landscape';
  const pw = ((landscape ? paper.h : paper.w) / 25.4) * 96, ph = ((landscape ? paper.w : paper.h) / 25.4) * 96;
  const M = { l: num(pm, 'left', 0.7) * 96, r: num(pm, 'right', 0.7) * 96, t: num(pm, 'top', 0.75) * 96, b: num(pm, 'bottom', 0.75) * 96, h: num(pm, 'header', 0.3) * 96, f: num(pm, 'footer', 0.3) * 96 };
  const availW = Math.max(50, pw - M.l - M.r), availH = Math.max(50, ph - M.t - M.b);
  const po = /<printOptions\b[^>]*>/.exec(x)?.[0] || '';
  const centerH = attr(po, 'horizontalCentered') === '1' || attr(po, 'horizontalCentered') === 'true';
  const centerV = attr(po, 'verticalCentered') === '1' || attr(po, 'verticalCentered') === 'true';
  const grid = attr(po, 'gridLines') === '1' || attr(po, 'gridLines') === 'true';

  // περιοχή εκτύπωσης: ορισμένη, αλλιώς ό,τι έχει τιμή, πλαίσιο ή γέμισμα
  let area = areaOf(definedName(book.wbXml, '_xlnm.Print_Area', idx));
  if (!area) {
    let r2 = sh.maxR, c2 = sh.maxC;
    for (const [k, c] of sh.cells) { if (c.s == null) continue; const xf = st.xfs[c.s]; if (!xf || (!xf.fill && !xf.border.l && !xf.border.r && !xf.border.t && !xf.border.b)) continue; const r = Math.floor(k / 16384), cc = k % 16384; if (r > r2) r2 = r; if (cc > c2) c2 = cc; }
    for (const m of sh.merges) { if (m.r2 > r2 && sh.cells.has(key(m.r1, m.c1))) r2 = m.r2; if (m.c2 > c2 && sh.cells.has(key(m.r1, m.c1))) c2 = m.c2; }
    area = { r1: 1, c1: 1, r2: Math.max(1, r2), c2: Math.max(1, c2) };
  }
  const colInfo = (c: number) => sh.cols.find(k => c >= k.min && c <= k.max);
  const colW = (c: number) => { const k = colInfo(c); return k?.hidden ? 0 : k?.w ?? sh.defW; };
  const rowH = (r: number) => { const k = sh.rows.get(r); return k?.hidden ? 0 : ptPx(k?.ht ?? sh.defH); };
  const rowsAll: number[] = [], colsAll: number[] = [];
  for (let r = area.r1; r <= area.r2; r++) if (rowH(r) > 0) rowsAll.push(r);
  for (let c = area.c1; c <= area.c2; c++) if (colW(c) > 0) colsAll.push(c);
  const W = colsAll.reduce((a, c) => a + colW(c), 0), H = rowsAll.reduce((a, r) => a + rowH(r), 0);

  // κλίμακα: «προσαρμογή σε Χ σελίδες πλάτος × Υ ύψος» ή ποσοστό
  const fit = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(x);
  let scale = num(ps, 'scale', 100) / 100;
  if (fit) {
    const fw = num(ps, 'fitToWidth', 1), fh = num(ps, 'fitToHeight', 1); scale = 1;
    if (fw > 0 && W > 0) scale = Math.min(scale, (availW * fw) / W);
    if (fh > 0 && H > 0) scale = Math.min(scale, (availH * fh) / H);
    scale = Math.floor(scale * 100) / 100;
  }
  scale = Math.min(4, Math.max(0.1, scale));

  // σελίδες: χειροκίνητες αλλαγές και ό,τι δεν χωρά, με τις γραμμές τίτλων σε κάθε σελίδα
  const brk = (tag: string) => new Set([...block(x, tag).matchAll(/<brk\b[^>]*>/g)].map(m => num(m[0], 'id', 0)));
  const rowBrk = brk('rowBreaks'), colBrk = brk('colBreaks');
  const titles = titleRows(definedName(book.wbXml, '_xlnm.Print_Titles', idx));
  const titleList = titles ? Array.from({ length: titles[1] - titles[0] + 1 }, (_, i) => titles[0] + i).filter(r => rowH(r) > 0) : [];
  const titleH = titleList.reduce((a, r) => a + rowH(r), 0);
  const split = (list: number[], size: (n: number) => number, room: (first: number) => number, breaks: Set<number>) => {
    const out: number[][] = []; let cur: number[] = []; let acc = 0;
    for (const n of list) {
      const s = size(n);
      if (cur.length && (acc + s > room(cur[0]) + 0.5 || breaks.has(n - 1))) { out.push(cur); cur = []; acc = 0; }
      cur.push(n); acc += s;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const withTitles = (first: number) => !!titles && first > titles[1];
  const rowPages = split(rowsAll, rowH, f => availH / scale - (withTitles(f) ? titleH : 0), rowBrk);
  const colPages = split(colsAll, colW, () => availW / scale, colBrk);
  const order: [number[], number[]][] = [];
  if (attr(ps, 'pageOrder') === 'overThenDown') rowPages.forEach(rp => colPages.forEach(cp => order.push([rp, cp])));
  else colPages.forEach(cp => rowPages.forEach(rp => order.push([rp, cp])));

  const mergeAt = new Map<number, { r1: number; c1: number; r2: number; c2: number }>();
  for (const m of sh.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeAt.set(key(r, c), m);
  const cellOf = (r: number, c: number) => sh.cells.get(key(r, c));
  const styleOf = (r: number, c: number) => { const k = cellOf(r, c); if (k?.s != null) return k.s; const rw = sh.rows.get(r); if (rw?.s != null) return rw.s; return colInfo(c)?.s ?? 0; };
  const shown = (r: number, c: number) => { const k = cellOf(r, c); if (!k) return ''; const v = k.f ? book.value(sh.name, r, c) : k.v; return v instanceof XErr ? v.code : v; };
  const hdr = /<headerFooter\b[^>]*>([\s\S]*?)<\/headerFooter>/.exec(x)?.[1] || '';
  const oddH = /<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(hdr)?.[1], oddF = /<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(hdr)?.[1];
  const firstNo = /useFirstPageNumber="(1|true)"/.test(ps) ? num(ps, 'firstPageNumber', 1) : 1;

  const pages = order.map(([rp, cp], pi) => {
    const rows = withTitles(rp[0]) ? [...titleList, ...rp] : rp;
    const rowIx = new Map(rows.map((r, i) => [r, i])); const colIx = new Map(cp.map((c, i) => [c, i]));
    const tw = cp.reduce((a, c) => a + colW(c), 0), th = rows.reduce((a, r) => a + rowH(r), 0);
    let body = '';
    for (const r of rows) {
      let tr = '';
      for (const c of cp) {
        const m = mergeAt.get(key(r, c));
        let rs = 1, cs = 1, ar = r, ac = c, isAnchor = true;
        if (m) {
          // το κομμάτι της συγχώνευσης που πέφτει σε αυτή τη σελίδα· η τιμή μόνο εκεί που είναι το πάνω-αριστερό κελί
          const vr = rows.filter(y => y >= m.r1 && y <= m.r2), vc = cp.filter(y => y >= m.c1 && y <= m.c2);
          if (vr[0] !== r || vc[0] !== c) continue;
          let k = rowIx.get(r)!; while (k + 1 < rows.length && rows[k + 1] <= m.r2 && rows[k + 1] === rows[k] + 1 + countHidden(rows[k], rows[k + 1], rowH)) { k++; rs++; }
          let j = colIx.get(c)!; while (j + 1 < cp.length && cp[j + 1] <= m.c2) { j++; cs++; }
          ar = m.r1; ac = m.c1; isAnchor = r === m.r1 && c === m.c1;
        }
        const s = styleOf(ar, ac); used.add(s);
        const xf = st.xfs[s] || st.xfs[0];
        const v = isAnchor ? shown(ar, ac) : '';
        const txt = typeof v === 'number' ? formatValue(v, xf.fmt, st.codes, book.y1904) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v == null ? '' : String(v);
        // πλαίσια: από τις άκρες της συγχώνευσης
        const lastR = rs > 1 ? rows[rowIx.get(r)! + rs - 1] : r, lastC = cs > 1 ? cp[colIx.get(c)! + cs - 1] : c;
        const bT = xf.border.t, bL = xf.border.l;
        const bR = (cs > 1 ? (st.xfs[styleOf(r, lastC)] || xf) : xf).border.r, bB = (rs > 1 ? (st.xfs[styleOf(lastR, c)] || xf) : xf).border.b;
        let style = '';
        if (bT || bL || bR || bB) style += `border-top:${sideCss(bT)};border-left:${sideCss(bL)};border-right:${sideCss(bR)};border-bottom:${sideCss(bB)};`;
        const h = rows.slice(rowIx.get(r)!, rowIx.get(r)! + rs).reduce((a, y) => a + rowH(y), 0);
        let inner = '';
        if (txt !== '') {
          const hal = xf.h === 'general' ? (typeof v === 'number' ? 'right' : typeof v === 'boolean' ? 'center' : 'left') : xf.h === 'centerContinuous' || xf.h === 'distributed' ? 'center' : xf.h === 'justify' || xf.h === 'fill' ? 'left' : xf.h;
          const val = xf.v === 'center' || xf.v === 'distributed' || xf.v === 'justify' ? 'center' : xf.v === 'top' ? 'flex-start' : 'flex-end';
          // κείμενο χωρίς αναδίπλωση συνεχίζει στα διπλανά άδεια κελιά (όπως στον Excel), αλλιώς κόβεται
          const nextEmpty = (dc: number) => { const y = cp[colIx.get(c)! + (dc > 0 ? cs : -1)]; if (y == null || mergeAt.get(key(r, y))) return false; const w = shown(r, y); return w == null || w === ''; };
          const spill = !xf.wrap && !m && typeof v !== 'number' && (hal === 'left' ? nextEmpty(1) : hal === 'right' ? nextEmpty(-1) : nextEmpty(1) && nextEmpty(-1));
          const just = hal === 'left' ? 'flex-start' : hal === 'right' ? 'flex-end' : 'center';
          const pad = xf.indent ? `padding-${hal === 'right' ? 'right' : 'left'}:${xf.indent * 9 + 2}px;` : '';
          const rot = xf.rot === 90 || xf.rot === 180 || xf.rot === 255 ? 'writing-mode:vertical-rl;' + (xf.rot === 90 ? 'transform:rotate(180deg);' : '') : '';
          inner = `<div class="x${xf.wrap ? ' w' : ''}${spill ? ' o' : ''}" style="height:${Math.max(1, h - 1).toFixed(2)}px;justify-content:${just};align-items:${val};${pad}${xf.wrap ? 'text-align:' + hal + ';' : ''}${rot}"><span>${esc(txt)}</span></div>`;
        }
        tr += `<td class="s${s}"${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${style ? ` style="${style}"` : ''}>${inner}</td>`;
      }
      body += `<tr style="height:${rowH(r).toFixed(2)}px">${tr}</tr>`;
    }
    const cg = '<colgroup>' + cp.map(c => `<col style="width:${colW(c)}px">`).join('') + '</colgroup>';
    const left = M.l + (centerH ? Math.max(0, (availW - tw * scale) / 2) : 0), top = M.t + (centerV ? Math.max(0, (availH - th * scale) / 2) : 0);
    const ctx = { page: firstNo + pi, pages: order.length, sheet: sh.name, file };
    const hf = (src: string | undefined, isHead: boolean) => { const p = headerFooter(src ? unesc(src) : null, ctx); return p ? `<div class="hf" style="${isHead ? 'top' : 'bottom'}:${(isHead ? M.h : M.f).toFixed(1)}px;left:${M.l.toFixed(1)}px;right:${M.r.toFixed(1)}px"><span>${esc(p[0])}</span><span>${esc(p[1])}</span><span>${esc(p[2])}</span></div>` : ''; };
    return `<div class="pg" style="width:${pw.toFixed(2)}px;height:${ph.toFixed(2)}px">${hf(oddH, true)}<div class="ar" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;transform:scale(${scale})"><table class="${grid ? 'grid' : ''}" style="width:${tw}px">${cg}<tbody>${body}</tbody></table></div>${hf(oddF, false)}</div>`;
  });
  return { name: sh.name, paper: paper.name, landscape, pages: pages.length, scale, html: pages.join('') };
}
// κρυφές γραμμές ανάμεσα σε δύο ορατές (για να συνεχίζει η συγχώνευση από πάνω τους)
const countHidden = (a: number, b: number, rowH: (r: number) => number) => { let n = 0; for (let r = a + 1; r < b; r++) if (rowH(r) === 0) n++; return n; };

// Η σελίδα της προεπισκόπησης: σελίδες όπως θα τυπωθούν, και πάνω μπάρα με τα φύλλα και το κουμπί «Εκτύπωση…»
export function previewHtml(doc: PrintDoc, file: string): string {
  const pages = doc.sheets.reduce((a, s) => a + s.pages, 0);
  const chips = doc.all.length > 1 ? `<div class="sheets" role="group" aria-label="Φύλλα">${doc.all.map(n => { const s = doc.sheets.find(x => x.name === n); return `<label><input type="checkbox" value="${esc(n)}"${s ? ' checked' : ''}> ${esc(n)}${s ? ` <small>${s.pages}</small>` : ''}</label>`; }).join('')}</div>` : '';
  const sections = doc.sheets.map((s, i) => `<section data-i="${i}" data-paper="${s.paper}" data-land="${s.landscape ? 1 : 0}" aria-label="${esc(s.name)}">${doc.sheets.length > 1 ? `<h2>${esc(s.name)} · ${s.pages} ${s.pages === 1 ? 'σελίδα' : 'σελίδες'} · ${s.paper} ${s.landscape ? 'οριζόντια' : 'κατακόρυφα'} · ${Math.round(s.scale * 100)}%</h2>` : ''}${s.html}</section>`).join('');
  const one = doc.sheets[0];
  const info = doc.sheets.length === 1 && one ? ` · ${one.paper} ${one.landscape ? 'οριζόντια' : 'κατακόρυφα'} · κλίμακα ${Math.round(one.scale * 100)}%` : '';
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Εκτύπωση · ${esc(file)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0}
body{background:#5f6368;font:14px "Segoe UI",Tahoma,Arial,sans-serif;color:#202124}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #ccc;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.bar b{font-size:15px}.bar .meta{color:#5f6368}
.sheets{display:flex;flex-wrap:wrap;gap:6px}.sheets label{display:inline-flex;gap:5px;align-items:center;padding:3px 9px;border:1px solid #c4c7c5;border-radius:14px;cursor:pointer}
.sheets small{color:#5f6368}.sheets input:checked+*{font-weight:600}
.acts{margin-left:auto;display:flex;gap:8px}
button{font:inherit;padding:7px 16px;border-radius:6px;border:1px solid #c4c7c5;background:#fff;cursor:pointer}
button.pri{background:#2e5e3a;border-color:#2e5e3a;color:#fff;font-weight:600}button:disabled{opacity:.6;cursor:default}
button:focus-visible,.sheets label:focus-within{outline:2px solid #1a73e8;outline-offset:2px}
.msg{width:100%;color:#b3261e}.msg:empty{display:none}
main{padding:20px 0 40px}
section h2{margin:8px auto;color:#fff;font-size:13px;font-weight:600;text-align:center}
.pg{position:relative;margin:0 auto 20px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45);overflow:hidden}
.ar{position:absolute;transform-origin:0 0}
table{border-collapse:collapse;table-layout:fixed;color:#000}
td{padding:0;overflow:visible;vertical-align:bottom;font:11pt Calibri,Carlito,Arial,sans-serif}
table.grid td{outline:0.5px solid #bbb}
.x{display:flex;padding:0 2px;white-space:pre;overflow:hidden;line-height:1.15}
.x.o{overflow:visible}
.x.w{white-space:pre-wrap;word-wrap:break-word}.x.w span{width:100%}
.hf{position:absolute;display:flex;justify-content:space-between;font:10pt Calibri,Carlito,Arial,sans-serif}.hf span{flex:1}.hf span:nth-child(2){text-align:center}.hf span:nth-child(3){text-align:right}
${doc.css}
@media print{body{background:none}.bar,section h2{display:none}main{padding:0}.pg{margin:0;box-shadow:none;break-after:page}section.skip{display:none}}
</style><style id="page">${one ? `@page{size:${one.paper} ${one.landscape ? 'landscape' : 'portrait'};margin:0}` : ''}</style></head><body>
<div class="bar"><b>${esc(file)}</b><span class="meta">${pages} ${pages === 1 ? 'σελίδα' : 'σελίδες'}${info}</span>${chips}
<span class="acts"><button type="button" class="pri" id="go" autofocus>Εκτύπωση…</button><button type="button" id="close">Κλείσιμο</button></span><div class="msg" id="msg" role="status"></div></div>
<main>${sections || '<p style="color:#fff;text-align:center">Δεν διαλέχτηκε φύλλο για εκτύπωση.</p>'}</main>
<script>
(function(){
  var api = window.printer, go = document.getElementById('go'), msg = document.getElementById('msg'), pageCss = document.getElementById('page');
  var secs = [].slice.call(document.querySelectorAll('main section'));
  if (!secs.length) go.disabled = true;
  document.getElementById('close').onclick = function(){ api && api.close(); };
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') api && api.close(); if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); go.click(); } });
  [].forEach.call(document.querySelectorAll('.sheets input'), function(i){ i.onchange = function(){
    var names = [].slice.call(document.querySelectorAll('.sheets input:checked')).map(function(x){ return x.value; });
    msg.textContent = 'Ετοιμάζεται…'; api && api.sheets(names);
  }; });
  // ένα «τύπωμα» για κάθε συνδυασμό χαρτιού και προσανατολισμού (ο διάλογος των Windows έχει έναν για όλη τη δουλειά)
  go.onclick = async function(){
    var groups = [];
    secs.forEach(function(s){ var k = s.dataset.paper + '|' + s.dataset.land; var g = groups.filter(function(x){ return x.k === k; })[0]; if (!g) groups.push(g = { k: k, paper: s.dataset.paper, land: s.dataset.land === '1', list: [] }); g.list.push(s); });
    go.disabled = true; msg.textContent = '';
    try {
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        secs.forEach(function(s){ s.classList.toggle('skip', g.list.indexOf(s) < 0); });
        pageCss.textContent = '@page{size:' + g.paper + ' ' + (g.land ? 'landscape' : 'portrait') + ';margin:0}';
        var r = await api.print({ landscape: g.land, pageSize: g.paper, part: groups.length > 1 ? (i + 1) + '/' + groups.length : '' });
        if (!r.ok) { if (r.error) msg.textContent = r.error; break; }
      }
    } finally { secs.forEach(function(s){ s.classList.remove('skip'); }); go.disabled = false; }
  };
})();
</script></body></html>`;
}
