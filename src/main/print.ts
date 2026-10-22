// Εκτύπωση των Excel χωρίς Excel (Michael, 11/10): το αρχείο γίνεται σελίδες HTML με τη διάταξη σελίδας του
// (χαρτί, προσανατολισμός, περιθώρια, κλίμακα ή «προσαρμογή σε σελίδες», περιοχή εκτύπωσης, αλλαγές σελίδας,
// γραμμές τίτλων, κεφαλίδα/υποσέλιδο) και τυπώνεται από το Chromium του Electron με τον διάλογο εκτυπωτή των Windows.
// Κρατά γραμματοσειρές, πλαίσια, χρώματα, στοίχιση, συγχωνεύσεις και υπολογίζει ξανά τους απλούς τύπους
// (SUM, ROW()-6, E17-Z17…), γιατί τα αρχεία που γράφει η εφαρμογή έχουν τις παλιές τιμές μέχρι να τα ανοίξει ο Excel.
import crypto from 'crypto';
import JSZip from 'jszip';
import { FIXED_MARK, colName, colNum, texts, unesc } from './xlsx';

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
// rich: κείμενο με μορφή ανά κομμάτι (π.χ. η υπογραμμισμένη διάρκεια ποινής στην ΗΚΑΙ)
interface XCell { v: Val; f?: string; s: number | null; rich?: Rich }
type Rich = { t: string; u: boolean; b: boolean; i: boolean }[];
// Τα κομμάτια <r> ενός κειμένου· null αν δεν έχει (απλό κείμενο)
function richOf(xml: string): Rich | null {
  if (!xml.includes('<r>') && !xml.includes('<r ')) return null;
  const out: Rich = [];
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<r\b[^>]*>([\s\S]*?)<\/r>/g)) {
    const pr = /<rPr\b[^>]*>([\s\S]*?)<\/rPr>/.exec(m[1])?.[1] || '';
    const u = /<u\b([^>]*)\/?>/.exec(pr);
    out.push({ t: texts(m[1]), u: !!u && !/val="none"/.test(u[1]), b: on(pr, 'b'), i: on(pr, 'i') });
  }
  return out.some(r => r.u || r.b || r.i) ? out : null;
}
const richHtml = (r: Rich) => r.map(x => { let h = esc(x.t); if (x.u) h = '<u>' + h + '</u>'; if (x.b) h = '<b>' + h + '</b>'; if (x.i) h = '<i>' + h + '</i>'; return h; }).join('');
interface ParsedSheet {
  name: string; cells: Map<number, XCell>; rows: Map<number, { ht?: number; hidden: boolean; s?: number }>; cols: { min: number; max: number; w?: number; hidden: boolean; s?: number }[];
  merges: { r1: number; c1: number; r2: number; c2: number }[]; maxR: number; maxC: number; xml: string; defH: number; defW: number;
}
const colPx = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
const ptPx = (pt: number) => (pt * 96) / 72;

export class Book {
  private parsed = new Map<string, ParsedSheet>();
  private memo = new Map<string, Map<number, Val>>();
  private busy = new Set<string>();
  sst: string[] = []; sstRich: (Rich | null)[] = []; styles!: Styles; y1904 = false;
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
    if (sst) { const si = [...(await sst.async('string')).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map(m => m[1] || ''); b.sst = si.map(texts); b.sstRich = si.map(richOf); }
    const th = zip.file(/theme\d*\.xml$/i)[0];
    b.styles = parseStyles((await zip.file('xl/styles.xml')?.async('string')) || '', themeColors(th ? await th.async('string') : ''));
    return b;
  }
  async load(name: string): Promise<ParsedSheet | null> {
    if (this.parsed.has(name)) return this.parsed.get(name)!;
    const e = this.sheets.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!e) return null;
    const xml = await this.zip.file(e.path)!.async('string');
    const sh = parseSheet(e.name, xml, this.sst, this.sstRich);
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

function parseSheet(name: string, xml: string, sst: string[], sstRich: (Rich | null)[] = []): ParsedSheet {
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
      let v: Val = null; let rich: Rich | null = null;
      if (t === 's') { v = raw != null ? sst[+raw] ?? null : null; rich = raw != null ? sstRich[+raw] ?? null : null; }
      else if (t === 'inlineStr') { v = texts(inner); rich = richOf(inner); }
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
      cells.set(key(r, c), rich && !f ? { v, f, s, rich } : { v, f, s });
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
// pt: το μέγεθος στο χαρτί της γραμματοσειράς των περισσότερων κελιών (font, size στο Excel)· titles: έχει γραμμές τίτλων
export interface PrintSheet { name: string; paper: string; landscape: boolean; pages: number; scale: number; html: string; pt: number; font: string; size: number; titles: boolean }
// total: όλες οι σελίδες· sug: σε πόσες σελίδες τα γράμματα βγαίνουν καθαρά (όταν είναι μικρά)
// cols: οι στήλες των πινάκων που ταξινομούνται (για το «Ταξινόμηση» του παραθύρου)
export interface PrintDoc { sheets: PrintSheet[]; all: string[]; css: string; total: number; sug?: { n: number; pt: number }; cols?: SortCol[] }

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
// όλες οι περιοχές ενός ονόματος (π.χ. τα σταθερά κομμάτια: κεφαλίδα, ημερομηνία, υπογραφές)
function areasOf(body: string | null): { r1: number; c1: number; r2: number; c2: number }[] {
  if (!body) return [];
  return body.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(areaOf).filter((a): a is NonNullable<typeof a> => !!a);
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
// Το όνομα γραμματοσειράς έρχεται από το αρχείο: μόνο γράμματα, αριθμοί, κενά και . , _ - (αλλιώς θα μπορούσε να κλείσει
// το <style> και να βάλει δικό του script στη σελίδα)
function fontCss(f: Font): string {
  const name = f.name.replace(/[^\p{L}\p{N} _.,-]/gu, '').trim() || 'Calibri';
  const fam = FONT_FALLBACK[name.toLowerCase()] || `"${name}",${f.serif ? 'serif' : 'sans-serif'}`;
  return `font:${f.i ? 'italic ' : ''}${f.b ? '700 ' : ''}${f.sz}pt ${fam};` + (f.color ? `color:${f.color};` : '') + (f.u || f.strike ? `text-decoration:${f.u ? 'underline' + (/double/.test(f.u) ? ' double' : '') : ''}${f.strike ? ' line-through' : ''};` : '');
}
const sideCss = (s?: Side) => (s ? `${s.w}px ${s.style} ${s.color}` : '0');

// refs: κάθε κελί με data-a="B4" (προεπισκόπηση των Εντύπων, όπου διαλέγεις κελί με κλικ)· maxPages: μόνο οι πρώτες σελίδες·
// layout: η διάταξη του παραθύρου «Εκτύπωση» (σελίδες, προσανατολισμός, περιθώρια…) αντί για τη διάταξη σελίδας του αρχείου
export interface RenderOpts { file: string; sheets?: string[]; refs?: boolean; maxPages?: number; layout?: PrintOpts }
export async function renderBook(buf: Buffer | Uint8Array, opts: RenderOpts): Promise<PrintDoc> {
  return renderOpen(await Book.open(buf), opts);
}
export async function openBook(buf: Buffer | Uint8Array): Promise<Book> { return Book.open(buf); }
export const bookSheets = (book: Book) => book.sheets.filter(x => !x.hidden).map(x => x.name);
export async function renderOpen(book: Book, opts: RenderOpts): Promise<PrintDoc> {
  const visible = book.sheets.filter(x => !x.hidden);
  const all = visible.map(x => x.name);
  let want = opts.sheets?.filter(n => all.includes(n)) || [];
  // χωρίς επιλογή (ή φύλλο που δεν υπάρχει πια): όλα τα φύλλα αν είναι λίγα (έντυπα), αλλιώς το ενεργό φύλλο του βιβλίου.
  // Άδεια λίστα = ο χρήστης ξετσέκαρε όλα τα φύλλα.
  if (!want.length && !(opts.sheets && !opts.sheets.length)) want = all.length <= 4 ? all : [book.sheets[book.activeTab] && !book.sheets[book.activeTab].hidden ? book.sheets[book.activeTab].name : all[0]];
  const geos: Geo[] = []; const cols: SortCol[] = [];
  for (const name of want) {
    const g = await geoOf(book, name, book.sheets.findIndex(x => x.name === name));
    for (const t of g.tables) for (const c of t.cols) if (!cols.some(x => x.k === c.k)) cols.push({ k: c.k, label: c.label, kind: c.kind });
    geos.push(opts.layout?.sort?.length ? sortedGeo(book, g, opts.layout.sort) : g);
  }
  const used = new Set<number>();
  let plans: Plan[]; let sug: { n: number; pt: number } | undefined;
  if (opts.layout) {
    const o = opts.layout;
    plans = planDoc(geos, o);
    // μικρά γράμματα: σε πόσες σελίδες διαβάζεται καθαρά (10 pt)
    const pt = Math.min(...plans.map(p => p.pt));
    if (plans.length && pt < 9.75 && typeof o.pages === 'number' && !hasBreaks(o)) {
      // η πρώτη που φτάνει τα 10 pt, αλλιώς αυτή με τα μεγαλύτερα γράμματα (αν κερδίζει τουλάχιστον 1 pt)
      let best: { n: number; pt: number } | undefined;
      for (let n = o.pages + 1; n <= 8; n++) {
        const tp = Math.min(...planDoc(geos, { ...o, pages: n }).map(p => p.pt));
        if (tp >= 9.75) { best = { n, pt: tp }; break; }
        if (!best || tp > best.pt + 0.25) best = { n, pt: tp };
      }
      if (best && best.pt >= pt + 1) sug = { n: best.n, pt: Math.round(best.pt * 2) / 2 };
    }
  } else plans = geos.map(g => planFile(g));
  const total = plans.reduce((a, p) => a + p.order.length, 0);
  let at = 0;
  const sheets: PrintSheet[] = geos.map((g, i) => {
    const p = plans[i]; const s = drawSheet(book, g, p, opts.file, used, opts, at, total); at += p.order.length; return s;
  });
  const css = [...used].map(i => { const x = book.styles.xfs[i] || book.styles.xfs[0]; return `.s${i}{${fontCss(book.styles.fonts[x.font] || book.styles.fonts[0])}${x.fill ? 'background:' + x.fill + ';' : ''}}`; }).join('\n');
  return { sheets, all, css, total, sug, cols };
}

// ------------------------------------------------------------------ το φύλλο: περιοχή, γραμμές, στήλες, τίτλοι
interface Geo {
  sh: ParsedSheet; idx: number; ps: string; pm: string; po: string;
  rowsAll: number[]; colsAll: number[]; rowH: (r: number) => number; colW: (c: number) => number; W: number;
  titles: [number, number] | null; titleList: number[]; titleH: number;
  oddH?: string; oddF?: string; firstNo: number; grid: boolean;
  dom: { name: string; sz: number };      // η γραμματοσειρά των περισσότερων κελιών (για «Arial 12 → 10 pt»)
  units: number[][][];                    // μπλοκ (θάλαμος, πίνακας ανάμεσα σε κενές γραμμές) από ενότητες (γραμμές με κάθετη συγχώνευση)
  framed: Set<number>;                    // γραμμές με πλαίσιο (μόνο αυτές ψηλώνουν στο «Ψηλότερες γραμμές»)
  tables: Table[];                        // πίνακες με γραμμή επικεφαλίδων, που ταξινομούνται στην εκτύπωση
  regroup: (rows: number[]) => number[][][];
  fix?: Map<number, number>;              // ταξινομημένο: κελί του Α/Α (key) → η γραμμή που είχε αυτή τη θέση (το Α/Α μένει 1, 2, 3…)
  // Έντυπα (Michael, 22/10): κεφαλίδα, ημερομηνία, τίτλος, υπογραφές (FIXED_MARK) τυπώνονται στο μέγεθός τους, όποια κι αν
  // είναι η κλίμακα του πίνακα· fixC: τα κελιά τους, fixR: οι γραμμές που έχουν μόνο αυτά (ψηλώνουν/κονταίνουν μαζί τους)
  fixC?: Set<number>; fixR?: Set<number>;
}
// πόσο μεγαλώνει ένα σταθερό κομμάτι μέσα σε φύλλο με κλίμακα s, ώστε να βγει στο μέγεθός του (με όρια, για τα άκρα)
const fixK = (s: number) => Math.min(6, Math.max(0.4, 1 / s));
const rowAt = (g: Geo, r: number, s: number) => g.rowH(r) * (g.fixR?.has(r) ? fixK(s) : 1);
// Ένας πίνακας του φύλλου: η γραμμή επικεφαλίδων, οι γραμμές του από κάτω (ως τα σύνολα ή το πρώτο κελί χωρίς πλαίσιο),
// οι στήλες που ταξινομούνται (με το κλειδί της επικεφαλίδας: «Ο/Σ» → «ΟΣ») και οι στήλες Α/Α που μένουν στη θέση τους
export type SortKind = 'text' | 'num' | 'date' | 'rank';
export interface SortCol { k: string; label: string; kind: SortKind }
interface Table { head: number; rows: number[]; cols: (SortCol & { c: number })[]; fixed: number[] }
const geoCache = new WeakMap<Book, Map<string, Geo>>();
const normHead = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-ZΑ-Ω]/g, '');
async function geoOf(book: Book, name: string, idx: number): Promise<Geo> {
  let m = geoCache.get(book); if (!m) { m = new Map(); geoCache.set(book, m); }
  const hit = m.get(name); if (hit) return hit;
  const sh = (await book.load(name))!; await book.loadRefs(sh);
  const x = sh.xml; const st = book.styles;
  const ps = /<pageSetup\b[^>]*>/.exec(x)?.[0] || '', pm = /<pageMargins\b[^>]*>/.exec(x)?.[0] || '', po = /<printOptions\b[^>]*>/.exec(x)?.[0] || '';
  // περιοχή εκτύπωσης: ορισμένη, αλλιώς ό,τι έχει τιμή, πλαίσιο ή γέμισμα
  let area = areaOf(definedName(book.wbXml, '_xlnm.Print_Area', idx));
  if (!area) {
    let r2 = sh.maxR, c2 = sh.maxC;
    for (const [k, c] of sh.cells) { if (c.s == null) continue; const xf = st.xfs[c.s]; if (!xf || (!xf.fill && !xf.border.l && !xf.border.r && !xf.border.t && !xf.border.b)) continue; const r = Math.floor(k / 16384), cc = k % 16384; if (r > r2) r2 = r; if (cc > c2) c2 = cc; }
    for (const mg of sh.merges) { if (mg.r2 > r2 && sh.cells.has(key(mg.r1, mg.c1))) r2 = mg.r2; if (mg.c2 > c2 && sh.cells.has(key(mg.r1, mg.c1))) c2 = mg.c2; }
    area = { r1: 1, c1: 1, r2: Math.max(1, r2), c2: Math.max(1, c2) };
  }
  const colInfo = (c: number) => sh.cols.find(k => c >= k.min && c <= k.max);
  const colW = (c: number) => { const k = colInfo(c); return k?.hidden ? 0 : k?.w ?? sh.defW; };
  const rowH = (r: number) => { const k = sh.rows.get(r); return k?.hidden ? 0 : ptPx(k?.ht ?? sh.defH); };
  const rowsAll: number[] = [], colsAll: number[] = [];
  for (let r = area.r1; r <= area.r2; r++) if (rowH(r) > 0) rowsAll.push(r);
  for (let c = area.c1; c <= area.c2; c++) if (colW(c) > 0) colsAll.push(c);
  const titles = titleRows(definedName(book.wbXml, '_xlnm.Print_Titles', idx));
  const titleList = titles ? Array.from({ length: titles[1] - titles[0] + 1 }, (_, i) => titles[0] + i).filter(r => rowH(r) > 0) : [];
  const hdr = /<headerFooter\b[^>]*>([\s\S]*?)<\/headerFooter>/.exec(x)?.[1] || '';
  const oddH = /<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(hdr)?.[1], oddF = /<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(hdr)?.[1];

  // κελιά: τιμή, πλαίσιο, γραμματοσειρά (για τις ενότητες, τα μπλοκ και το «κυρίαρχο» μέγεθος γραμμάτων)
  const styleOf = (r: number, c: number) => { const k = sh.cells.get(key(r, c)); if (k?.s != null) return k.s; const rw = sh.rows.get(r); if (rw?.s != null) return rw.s; return colInfo(c)?.s ?? 0; };
  const shown = (r: number, c: number) => { const k = sh.cells.get(key(r, c)); if (!k) return ''; const v = k.f ? book.value(sh.name, r, c) : k.v; return v == null ? '' : v instanceof XErr ? v.code : String(v); };
  const sizes = new Map<string, number>(); const framed = new Set<number>(); const blank = new Set<number>(); const usedC = new Set<number>();
  const painted = (f: string | null) => !!f && !/^#?F{6}$/i.test(f);   // λευκό γέμισμα = κενό
  for (const r of rowsAll) {
    let any = false;
    for (const c of colsAll) {
      const xf = st.xfs[styleOf(r, c)] || st.xfs[0]; const v = shown(r, c);
      if (xf.border.l || xf.border.r || xf.border.t || xf.border.b) { framed.add(r); any = true; usedC.add(c); }
      if (painted(xf.fill)) { any = true; usedC.add(c); }
      if (v !== '') { any = true; usedC.add(c); const f = st.fonts[xf.font] || st.fonts[0]; const k = f.name + '|' + f.sz; sizes.set(k, (sizes.get(k) || 0) + 1); }
    }
    if (!any) blank.add(r);
  }
  for (const mg of sh.merges) if ((mg.r1 !== mg.r2 || mg.c1 !== mg.c2) && shown(mg.r1, mg.c1) !== '') { for (let r = mg.r1; r <= mg.r2; r++) blank.delete(r); for (let c = mg.c1; c <= mg.c2; c++) usedC.add(c); }
  // κενές γραμμές και στήλες στο τέλος (τύποι που βγάζουν "", περιοχή εκτύπωσης μεγαλύτερη από τον πίνακα) δεν τυπώνονται,
  // αλλιώς μικραίνουν τα γράμματα για να χωρέσει χαρτί που μένει άγραφο
  while (rowsAll.length > 1 && blank.has(rowsAll[rowsAll.length - 1])) rowsAll.pop();
  while (colsAll.length > 1 && !usedC.has(colsAll[colsAll.length - 1])) colsAll.pop();
  const W = colsAll.reduce((a, c) => a + colW(c), 0);
  const top = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || (st.fonts[0].name + '|' + st.fonts[0].sz);
  const dom = { name: top.split('|')[0], sz: +top.split('|')[1] || 11 };

  // ενότητες: γραμμές που ενώνει κάθετη συγχώνευση δεν χωρίζονται ποτέ
  const unitsOf = (list: number[]) => {
    const at = new Map(list.map((r, i) => [r, i])); const link = new Array(list.length).fill(false);
    for (const mg of sh.merges) if (mg.r2 > mg.r1) for (let r = mg.r1; r < mg.r2; r++) { const i = at.get(r); if (i != null) link[i] = true; }
    const out: number[][] = [];
    list.forEach((r, i) => { if (i && link[i - 1]) out[out.length - 1].push(r); else out.push([r]); });
    return out;
  };
  // μπλοκ: ανάμεσα σε κενές γραμμές (πίνακες της ΦΡΟΥΡΑΣ) ή όπου αλλάζει ο θάλαμος/ουλαμός (στήλη στη γραμμή τίτλων)
  const groupCol = titleList.length ? colsAll.find(c => titleList.some(r => /^(ΘΑΛΑΜΟΣ|ΘΑΛ|ΟΥΛΑΜΟΣ)$/.test(normHead(shown(r, c))))) : undefined;
  const after = titles ? titles[1] : 0;
  const regroup = (list: number[]) => {
    const units: number[][][] = []; let cur: number[][] = []; let prevG: string | null = null; let prevBlank = false;
    for (const u of unitsOf(list)) {
      const r = u[0]; const isBlank = u.every(y => blank.has(y));
      const g = groupCol != null && r > after ? shown(r, groupCol) : null;
      const brk = cur.length && ((prevBlank && !isBlank) || (g != null && prevG != null && g !== prevG));
      if (brk) { units.push(cur); cur = []; }
      cur.push(u); prevBlank = isBlank; if (g != null) prevG = g;
    }
    if (cur.length) units.push(cur);
    // υπογραφές: το τελευταίο μπλοκ χωρίς πλαίσια μένει μαζί με τις 2 τελευταίες γραμμές του πίνακα από πάνω
    if (units.length > 1) {
      const last = units[units.length - 1]; const rows = last.flat();
      if (rows.length <= 12 && !rows.some(r => framed.has(r))) {
        const prev = units[units.length - 2]; let n = 0; const glue: number[][] = [];
        while (prev.length && n < 2) { const u = prev.pop()!; glue.unshift(u); if (!u.every(y => blank.has(y))) n++; }
        if (!prev.length) units.splice(units.length - 2, 1);
        units[units.length - 1] = [[...glue.flat(), ...rows]];
      }
    }
    return units;
  };
  const g: Geo = { sh, idx, ps, pm, po, rowsAll, colsAll, rowH, colW, W, titles, titleList, titleH: titleList.reduce((a, r) => a + rowH(r), 0),
    oddH, oddF, firstNo: /useFirstPageNumber="(1|true)"/.test(ps) ? num(ps, 'firstPageNumber', 1) : 1,
    grid: attr(po, 'gridLines') === '1' || attr(po, 'gridLines') === 'true', dom, units: regroup(rowsAll), framed,
    tables: tablesOf(book, sh, unitsOf(rowsAll), colsAll, framed), regroup };
  const fixed = areasOf(definedName(book.wbXml, FIXED_MARK, idx));
  if (fixed.length) {
    const fixC = new Set<number>(), near = new Set<number>();
    for (const a of fixed) for (let r = a.r1; r <= a.r2; r++) { near.add(r); for (let c = a.c1; c <= a.c2; c++) fixC.add(key(r, c)); }
    // γραμμή μόνο με σταθερά κομμάτια (και κενά): χωρίς πλαίσιο και χωρίς τίποτα άλλο γραμμένο
    const fixR = new Set([...near].filter(r => rowH(r) > 0 && !framed.has(r) && colsAll.every(c => fixC.has(key(r, c)) || shown(r, c) === '')));
    g.fixC = fixC; g.fixR = fixR;
  }
  m.set(name, g);
  return g;
}

// ------------------------------------------------------------------ ταξινόμηση στην εκτύπωση (Michael, 22/10)
// «Πρώτα θάλαμος, μετά αλφαβητικά…»: ταξινομούνται μόνο οι γραμμές κάθε πίνακα. Κεφαλίδα, τίτλοι, σύνολα και υπογραφές
// μένουν στη θέση τους, και το Α/Α (1, 2, 3… ή 1ο, 2ο…) μένει στη σειρά. Πίνακες με γραμμές που ενώνει κάθετη συγχώνευση
// (ΦΡΟΥΡΑ) ή με δύο πίνακες δίπλα-δίπλα (ίδια επικεφαλίδα δύο φορές) δεν ταξινομούνται.
export const sortKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g, '');
// βαθμοί από τον ανώτερο στον κατώτερο: «Ανώτεροι πρώτα»
const RANKS = ['ΤΧΗΣ', 'ΕΠΛΧΟΣ', 'ΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΑΝΘΛΓΟΣ', 'ΙΛΧΟΣ', 'ΥΠΛΧΟΣ', 'ΑΝΘΛΧΟΣ', 'ΔΕΑ', 'ΑΝΘΣΤΗΣ', 'ΑΛΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΛΧΙΑΣ', 'ΔΝΕΑΣ', 'ΥΔΝΕΑΣ', 'ΣΤΡ'];
const NUMERIC = /^[-+]?\d+(?:[.,]\d+)?$/, DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/;
const SEQ = /^(\d+)\s*(?:ο|η|\.|\))?$/i;
const greekOrder = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });
function tablesOf(book: Book, sh: ParsedSheet, units: number[][], cols: number[], framed: Set<number>): Table[] {
  const raw = (r: number, c: number): Val => { const k = sh.cells.get(key(r, c)); if (!k) return null; const v = k.f ? book.value(sh.name, r, c) : k.v; return v instanceof XErr ? null : v; };
  const text = (r: number, c: number) => { const v = raw(r, c); return v == null ? '' : String(v).trim(); };
  const dateFmt = (r: number, c: number) => { const k = sh.cells.get(key(r, c)); const xf = k?.s != null ? book.styles.xfs[k.s] : null; if (!xf || !xf.fmt) return false; const code = book.styles.codes.get(xf.fmt) ?? BUILTIN[xf.fmt] ?? ''; return isDateFmt(code); };
  const out: Table[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (u.length !== 1 || !framed.has(u[0])) continue;
    const h = u[0];
    const heads = cols.map(c => ({ c, t: text(h, c) })).filter(x => /\p{L}/u.test(x.t));
    if (heads.length < 2) continue;
    const keys = heads.map(x => sortKey(x.t));
    // κάθε επικεφαλίδα μία φορά (όχι πίνακες δίπλα-δίπλα, όχι γραμμή με 0 | 0 | 0 όπως οι βαθμοί της ΗΚΑΙ)
    const all = cols.map(c => text(h, c)).filter(Boolean);
    if (new Set(keys).size !== keys.length || new Set(all).size !== all.length || keys.some(k => !k || /^ΣΥΝΟΛ/.test(k))) continue;
    // τίτλοι πινάκων πάνω από τις επικεφαλίδες («ΤΙΜΩΡΗΜΕΝΟΙ», «ΑΠΟΝΤΕΣ» σε συγχωνευμένα κελιά): όχι επικεφαλίδα
    if (heads.filter(x => sh.merges.some(m => m.r1 === h && m.c1 === x.c && m.c2 > m.c1)).length * 2 >= heads.length) continue;
    const rows: number[] = []; let multi = false; let j = i + 1;
    for (; j < units.length; j++) {
      const v = units[j]; if (!v.every(r => framed.has(r))) break;
      if (cols.some(c => /^ΣΥΝΟΛ/.test(sortKey(text(v[0], c))))) break;
      if (v.length > 1) multi = true;
      rows.push(...v);
    }
    if (multi || rows.length < 2) { i = j - 1; continue; }
    const list: (SortCol & { c: number })[] = []; const fixed: number[] = [];
    heads.forEach((x, n) => {
      const k = keys[n]; const full = rows.filter(r => raw(r, x.c) != null && raw(r, x.c) !== ''); const vals = full.map(r => raw(r, x.c));
      // Α/Α: η επικεφαλίδα, ή αριθμοί που ανεβαίνουν ένα-ένα από πάνω προς τα κάτω
      const seq = rows.map(r => SEQ.exec(text(r, x.c))?.[1]);
      if (/^(ΑΑ|ΑΡ|ΑΡΙΘ|NO|ΝΟ)$/.test(k) || (seq.length >= 2 && seq.every((v, m) => v != null && +v === +seq[0]! + m))) { fixed.push(x.c); return; }
      if (/^\d+$/.test(k) || !vals.length) return;   // στήλες-μέρες του Ελέγχου (1, 2… 31) και άδειες στήλες (ΥΠΟΓΡΑΦΗ)
      const kind: SortKind = /^ΒΑΘΜ/.test(k) ? 'rank'
        : vals.length && full.every((r, m) => (typeof vals[m] === 'string' && DATE.test(String(vals[m]).trim())) || (typeof vals[m] === 'number' && dateFmt(r, x.c))) ? 'date'
        : vals.length && vals.every(v => typeof v === 'number' || NUMERIC.test(String(v).trim())) ? 'num' : 'text';
      list.push({ c: x.c, k, label: x.t.replace(/\s+/g, ' '), kind });
    });
    if (list.length) out.push({ head: h, rows, cols: list, fixed });
    i = j - 1;
  }
  return out;
}
// τιμή για σύγκριση: αριθμός (και «12/10/2026» → 20261012, βαθμός → θέση στη λίστα) ή κείμενο· κενό = null (πάντα στο τέλος)
function sortVal(v: Val, kind: SortKind): number | string | null {
  if (v == null || v === '' || v instanceof XErr) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = v.trim(); if (!s) return null;
  if (kind === 'rank') { const i = RANKS.indexOf(sortKey(s.split(/[\s(]/)[0])); if (i >= 0) return i; }
  if (NUMERIC.test(s)) return +s.replace(',', '.');
  const d = DATE.exec(s); if (d) { const y = +d[3] < 100 ? 2000 + +d[3] : +d[3]; return y * 10000 + +d[2] * 100 + +d[1]; }
  return s;
}
const cmpVal = (a: number | string, b: number | string) => (typeof a === 'number' ? (typeof b === 'number' ? a - b : -1) : typeof b === 'number' ? 1 : greekOrder.compare(a, b));
// το φύλλο με τις γραμμές των πινάκων στη νέα σειρά (οι στήλες που δεν έχει ο πίνακας δεν μετράνε)
const sortCache = new WeakMap<Geo, Map<string, Geo>>();
function sortedGeo(book: Book, g: Geo, sort: PrintSort[]): Geo {
  const sig = sort.map(x => x.c + (x.d ? '-' : '+')).join('|');
  let m = sortCache.get(g); if (!m) { m = new Map(); sortCache.set(g, m); }
  const hit = m.get(sig); if (hit) return hit;
  const out = sortRows(book, g, sort); m.set(sig, out); return out;
}
function sortRows(book: Book, g: Geo, sort: PrintSort[]): Geo {
  const rowsAll = g.rowsAll.slice(); const fix = new Map<number, number>(); let moved = false;
  for (const t of g.tables) {
    const lv = sort.map(s => ({ s, col: t.cols.find(c => c.k === s.c) })).filter(x => x.col) as { s: PrintSort; col: SortCol & { c: number } }[];
    if (!lv.length) continue;
    const vals = new Map(t.rows.map(r => [r, lv.map(x => { const k = g.sh.cells.get(key(r, x.col.c)); const v = k ? (k.f ? book.value(g.sh.name, r, x.col.c) : k.v) : null; return sortVal(v, x.col.kind); })]));
    const sorted = t.rows.slice().sort((a, b) => {
      const A = vals.get(a)!, B = vals.get(b)!;
      for (let i = 0; i < lv.length; i++) {
        if (A[i] == null || B[i] == null) { if (A[i] == null && B[i] == null) continue; return A[i] == null ? 1 : -1; }
        const d = cmpVal(A[i]!, B[i]!); if (d) return lv[i].s.d ? -d : d;
      }
      return 0;
    });
    if (sorted.every((r, i) => r === t.rows[i])) continue;
    moved = true;
    const at = rowsAll.indexOf(t.rows[0]); rowsAll.splice(at, sorted.length, ...sorted);
    sorted.forEach((r, i) => { for (const c of t.fixed) if (r !== t.rows[i]) fix.set(key(r, c), t.rows[i]); });
  }
  return moved ? { ...g, rowsAll, units: g.regroup(rowsAll), fix } : g;
}

// ------------------------------------------------------------------ το σχέδιο: χαρτί, κλίμακα, ποιες γραμμές σε κάθε σελίδα
interface Plan {
  paper: { name: string; w: number; h: number }; landscape: boolean; pw: number; ph: number;
  M: { l: number; r: number; t: number; b: number; h: number; f: number }; availW: number; availH: number;
  scale: number; maxScale: number; pt: number; cs: number; f: number; centerH: boolean; centerV: boolean; pno: boolean; repeat: boolean;
  order: [number[], number[]][];
}
const geomOf = (paper: { w: number; h: number }, landscape: boolean) => ({ pw: ((landscape ? paper.h : paper.w) / 25.4) * 96, ph: ((landscape ? paper.w : paper.h) / 25.4) * 96 });
// η διάταξη σελίδας του ίδιου του αρχείου (Excel): ποσοστό ή «προσαρμογή σε Χ × Υ σελίδες», αλλαγές σελίδας, στήλες σε σελίδες
function planFile(g: Geo): Plan {
  const x = g.sh.xml, ps = g.ps, pm = g.pm;
  const paper = PAPER[num(ps, 'paperSize', 9)] || PAPER[9];
  const landscape = attr(ps, 'orientation') === 'landscape';
  const { pw, ph } = geomOf(paper, landscape);
  const M = { l: num(pm, 'left', 0.7) * 96, r: num(pm, 'right', 0.7) * 96, t: num(pm, 'top', 0.75) * 96, b: num(pm, 'bottom', 0.75) * 96, h: num(pm, 'header', 0.3) * 96, f: num(pm, 'footer', 0.3) * 96 };
  const availW = Math.max(50, pw - M.l - M.r), availH = Math.max(50, ph - M.t - M.b);
  const H = g.rowsAll.reduce((a, r) => a + g.rowH(r), 0);
  const fit = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(x);
  let scale = num(ps, 'scale', 100) / 100;
  if (fit) {
    const fw = num(ps, 'fitToWidth', 1), fh = num(ps, 'fitToHeight', 1); scale = 1;
    if (fw > 0 && g.W > 0) scale = Math.min(scale, (availW * fw) / g.W);
    if (fh > 0 && H > 0) scale = Math.min(scale, (availH * fh) / H);
    scale = Math.floor(scale * 100) / 100;
  }
  scale = Math.min(4, Math.max(0.1, scale));
  // σελίδες: χειροκίνητες αλλαγές και ό,τι δεν χωρά, με τις γραμμές τίτλων σε κάθε σελίδα
  const brk = (tag: string) => new Set([...block(x, tag).matchAll(/<brk\b[^>]*>/g)].map(m => num(m[0], 'id', 0)));
  const rowBrk = brk('rowBreaks'), colBrk = brk('colBreaks');
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
  const withT = (first: number) => !!g.titles && first > g.titles[1];
  const rowPages = split(g.rowsAll, r => rowAt(g, r, scale), f => availH / scale - (withT(f) ? g.titleH : 0), rowBrk);
  const colPages = split(g.colsAll, g.colW, () => availW / scale, colBrk);
  const order: [number[], number[]][] = [];
  if (attr(ps, 'pageOrder') === 'overThenDown') rowPages.forEach(rp => colPages.forEach(cp => order.push([rp, cp])));
  else colPages.forEach(cp => rowPages.forEach(rp => order.push([rp, cp])));
  const on1 = (n: string) => attr(g.po, n) === '1' || attr(g.po, n) === 'true';
  return { paper, landscape, pw, ph, M, availW, availH, scale, maxScale: scale, pt: g.dom.sz * scale, cs: 1, f: 1, centerH: on1('horizontalCentered'), centerV: on1('verticalCentered'), pno: false, repeat: true, order };
}

// Οι επιλογές του παραθύρου «Εκτύπωση» (Michael, 20/10): πάντα όλες οι στήλες στο πλάτος της σελίδας, και οι γραμμές σε όσες
// σελίδες διαλέξει, με τα μεγαλύτερα γράμματα που χωράνε. Ίδια κλίμακα σε όλες τις σελίδες ενός φύλλου (και, με same, σε όλα τα
// φύλλα), ώστε π.χ. Arial 12 να βγαίνει ίδιο μέγεθος στη σελίδα 1 και 2, μπρος και πίσω.
export interface PrintOpts {
  pages: number | 'auto';                // σελίδες ανά φύλλο· 'auto' = όσες χρειάζονται με γράμματα size pt
  size: number;
  or: 'auto' | 'p' | 'l';
  paper: 'A4' | 'A3';
  m: 'narrow' | 'normal' | 'wide';
  sp: 'top' | 'center' | 'fill';          // ό,τι περισσεύει από κάτω: πάνω, στο κέντρο, ψηλότερες γραμμές
  stretch: boolean;                       // λίγες στήλες φαρδαίνουν ως το πλάτος της σελίδας
  repeat: boolean;                        // οι γραμμές τίτλων (Print_Titles) σε κάθε σελίδα
  keep: boolean;                          // δεν κόβεται μπλοκ (θάλαμος, πίνακας) στη μέση
  pno: boolean;                           // «Σελίδα 1 από 2» κάτω, όταν είναι πάνω από μία
  side: 'new' | 'back';                   // η επόμενη σελίδα στην πίσω όψη ή σε νέο φύλλο
  same: boolean;                          // ίδια γράμματα σε όλα τα φύλλα του Excel
  breaks?: Record<string, number[]>;      // ανά φύλλο: γραμμές του Excel από όπου ξεκινά νέα σελίδα (κλικ στην προεπισκόπηση)
  sort?: PrintSort[];                     // ταξινόμηση των γραμμών κάθε πίνακα: 1η, 2η, 3η στήλη
}
// c: η επικεφαλίδα της στήλης ως κλειδί (sortKey), l: όπως γράφεται, d: φθίνουσα (Ω→Α, 9→1, κατώτεροι πρώτα)
export interface PrintSort { c: string; l?: string; d?: boolean }
export const PRINT_DEFAULT: PrintOpts = { pages: 1, size: 12, or: 'auto', paper: 'A4', m: 'normal', sp: 'top', stretch: true, repeat: true, keep: true, pno: true, side: 'new', same: true };
const MARGIN = { narrow: 0.5, normal: 1.2, wide: 2.5 };   // εκ.
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
// ό,τι έρχεται από το παράθυρο (IPC) ή από τις αποθηκευμένες ρυθμίσεις, καθαρισμένο
export function cleanOpts(x: unknown, base: PrintOpts = PRINT_DEFAULT): PrintOpts {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bool = (k: keyof PrintOpts) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (base[k] as boolean));
  const pages = o.pages === 'auto' ? 'auto' : Number.isInteger(o.pages) && (o.pages as number) >= 1 && (o.pages as number) <= 20 ? (o.pages as number) : base.pages;
  const size = typeof o.size === 'number' && o.size >= 5 && o.size <= 24 ? Math.round(o.size * 2) / 2 : base.size;
  let breaks: Record<string, number[]> | undefined;
  if (o.breaks && typeof o.breaks === 'object') {
    breaks = {};
    for (const [k, v] of Object.entries(o.breaks as Record<string, unknown>).slice(0, 50)) if (Array.isArray(v)) breaks[String(k)] = [...new Set(v.filter(n => Number.isInteger(n) && n > 0 && n < 1048577) as number[])].sort((a, b) => a - b).slice(0, 500);
  }
  const sort = Array.isArray(o.sort) ? o.sort : base.sort;
  const sorts: PrintSort[] = [];
  for (const x of (sort || []).slice(0, 3)) {
    if (!x || typeof x !== 'object') continue; const c = sortKey(String((x as PrintSort).c ?? '')).slice(0, 60);
    if (!c || sorts.some(y => y.c === c)) continue;
    const l = typeof (x as PrintSort).l === 'string' ? (x as PrintSort).l!.slice(0, 60) : '';
    sorts.push({ c, ...(l ? { l } : {}), ...((x as PrintSort).d === true ? { d: true } : {}) });
  }
  return {
    pages, size, or: pick(o.or, ['auto', 'p', 'l'] as const, base.or), paper: pick(o.paper, ['A4', 'A3'] as const, base.paper), m: pick(o.m, ['narrow', 'normal', 'wide'] as const, base.m),
    sp: pick(o.sp, ['top', 'center', 'fill'] as const, base.sp), stretch: bool('stretch'), repeat: bool('repeat'), keep: bool('keep'), pno: bool('pno'),
    side: pick(o.side, ['new', 'back'] as const, base.side), same: bool('same'), ...(breaks ? { breaks } : {}), ...(sorts.length ? { sort: sorts } : {})
  };
}
const hasBreaks = (o: PrintOpts) => !!o.breaks && Object.values(o.breaks).some(b => b.length);
const PAPERS = { A4: PAPER[9], A3: PAPER[8] };

function planFit(g: Geo, o: PrintOpts, landscape: boolean, sFix?: number): Plan {
  const paper = PAPERS[o.paper]; const { pw, ph } = geomOf(paper, landscape);
  const m = (MARGIN[o.m] / 2.54) * 96;
  // κεφαλίδα/υποσέλιδο του αρχείου: χώρος στο περιθώριο
  const M = { l: m, r: m, t: g.oddH ? Math.max(m, 38) : m, b: g.oddF ? Math.max(m, 38) : m, h: 12, f: 12 };
  const availW = Math.max(50, pw - M.l - M.r), availH = Math.max(50, ph - M.t - M.b);
  const maxScale = Math.min(availW / Math.max(1, g.W), 2, 16 / g.dom.sz);
  const repeat = o.repeat && !!g.titles;
  const tH = (first: number) => (repeat && g.titles && first > g.titles[1] ? g.titleH : 0);
  // ύψος γραμμών με κλίμακα s (τα σταθερά κομμάτια πιάνουν πάντα τον ίδιο χώρο στο χαρτί)
  const hOf = (rows: number[], s: number) => rows.reduce((a, r) => a + rowAt(g, r, s), 0);
  const blocks = o.keep ? g.units : g.units.flat().map(u => [u]);
  // γεμίζει σελίδες με τη σειρά· limit = μέγιστο ύψος ανά σελίδα (για ισόποσο μοίρασμα)
  const split = (s: number, limit: number): number[][] => {
    const cap = availH / s; const pages: number[][] = []; let cur: number[] = []; let h = 0;
    const room = (first: number) => Math.min(limit, cap - tH(first));
    const put = (u: number[]) => { const uh = hOf(u, s); if (cur.length && h + uh > room(cur[0]) + 0.5) { pages.push(cur); cur = []; h = 0; } cur.push(...u); h += uh; };
    for (const b of blocks) {
      const bh = b.reduce((a, u) => a + hOf(u, s), 0);
      if (cur.length && h + bh > room(cur[0]) + 0.5 && bh <= room(b[0][0]) + 0.5) { pages.push(cur); cur = []; h = 0; }
      b.forEach(put);
    }
    if (cur.length || !pages.length) pages.push(cur);
    return pages;
  };
  const fitsAll = (s: number, pages: number[][]) => pages.every(p => tH(p[0] ?? 0) + hOf(p, s) <= availH / s + 0.5);
  let s: number; let pages: number[][];
  const br = (o.breaks?.[g.sh.name] || []).filter(r => r > g.rowsAll[0] && g.rowsAll.includes(r));
  if (br.length) {
    pages = []; let cur: number[] = [];
    for (const r of g.rowsAll) { if (cur.length && br.includes(r)) { pages.push(cur); cur = []; } cur.push(r); }
    pages.push(cur);
    // η μεγαλύτερη κλίμακα που χωρά κάθε σελίδα (με σταθερά κομμάτια το ύψος δεν είναι ανάλογο της κλίμακας: ψάξιμο)
    const fitOne = (p: number[]) => {
      if (!g.fixR?.size) return availH / Math.max(1, tH(p[0]) + hOf(p, 1));
      let lo = 0.02, hi = maxScale;
      if (hi * (tH(p[0]) + hOf(p, hi)) <= availH) return hi;
      for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (mid * (tH(p[0]) + hOf(p, mid)) <= availH) lo = mid; else hi = mid; }
      return lo;
    };
    s = Math.min(maxScale, ...pages.map(fitOne));
    if (sFix) s = Math.min(s, sFix);
  } else if (o.pages === 'auto') {
    s = Math.min(maxScale, o.size / g.dom.sz); if (sFix) s = Math.min(s, sFix);
    pages = split(s, Infinity);
  } else {
    const N = o.pages;
    if (sFix) s = Math.min(sFix, maxScale);
    else if (split(maxScale, Infinity).length <= N) s = maxScale;
    else {
      let lo = 0.02, hi = maxScale;
      for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (split(mid, Infinity).length <= N) lo = mid; else hi = mid; }
      s = lo;
    }
    s = Math.max(0.02, Math.floor(s * 1000) / 1000);
    // ισόποσο μοίρασμα: το μικρότερο όριο ανά σελίδα που κρατά τις ίδιες σελίδες
    const need = split(s, Infinity).length; const total = hOf(g.rowsAll, s);
    let a = total / Math.max(1, need), b = availH / s;
    for (let i = 0; i < 22; i++) { const L = (a + b) / 2; if (split(s, L).length <= need) b = L; else a = L; }
    pages = split(s, b + 0.5);
    if (pages.length > need || !fitsAll(s, pages)) pages = split(s, Infinity);
  }
  s = Math.max(0.02, Math.floor(s * 1000) / 1000);
  // λίγες στήλες: φαρδαίνουν ώστε ο πίνακας να πιάσει το πλάτος (τα γράμματα μένουν ίδια)
  const cs = o.stretch && g.W * s < availW - 1 ? availW / (g.W * s) : 1;
  // περισσεύει χώρος: οι γραμμές του πίνακα ψηλώνουν (ίδιο ύψος σε όλες τις σελίδες· η τελευταία, μισή, δεν μετρά)
  let f = 1;
  if (o.sp === 'fill') {
    f = 1.9;
    pages.forEach((p, i) => {
      if (pages.length > 1 && i === pages.length - 1) return;
      const grow = p.filter(r => g.framed.has(r)); const gh = hOf(grow, s); if (!gh) return;
      f = Math.min(f, (availH / s - tH(p[0]) - (hOf(p, s) - gh)) / gh);
    });
    f = Math.max(1, Math.floor(f * 100) / 100);
  }
  return { paper, landscape, pw, ph, M, availW, availH, scale: s, maxScale, pt: g.dom.sz * s, cs, f, centerH: true, centerV: o.sp === 'center', pno: o.pno, repeat, order: pages.map(p => [p, g.colsAll]) };
}
// όλα τα φύλλα: προσανατολισμός (αυτόματα: όποιος βγάζει μεγαλύτερα γράμματα· με μπρος-πίσω ίδιος για όλα) και κοινή κλίμακα
function planDoc(geos: Geo[], o: PrintOpts): Plan[] {
  if (!geos.length) return [];
  const better = (a: Plan[], b: Plan[]) => {   // true αν το b είναι καλύτερο: μεγαλύτερα γράμματα, και με ίδια γράμματα λιγότερες σελίδες
    const sa = Math.min(...a.map(p => p.scale)), sb = Math.min(...b.map(p => p.scale));
    if (Math.abs(sa - sb) > 0.005) return sb > sa;
    return b.reduce((x, p) => x + p.order.length, 0) < a.reduce((x, p) => x + p.order.length, 0);
  };
  let lands: boolean[];
  if (o.or !== 'auto') lands = geos.map(() => o.or === 'l');
  else if (o.side === 'back' || o.same) {
    const P = geos.map(g => planFit(g, o, false)), L = geos.map(g => planFit(g, o, true));
    const same = (ps: Plan[]) => (o.same && ps.length > 1 ? geos.map((g, i) => planFit(g, o, ps[i].landscape, Math.min(...ps.map(p => p.scale)))) : ps);
    lands = geos.map(() => better(same(P), same(L)));
  } else lands = geos.map(g => better([planFit(g, o, false)], [planFit(g, o, true)]));
  let plans = geos.map((g, i) => planFit(g, o, lands[i]));
  if (o.same && plans.length > 1) { const s = Math.min(...plans.map(p => p.scale)); plans = geos.map((g, i) => planFit(g, o, lands[i], s)); }
  return plans;
}

// ------------------------------------------------------------------ οι σελίδες σε HTML
function drawSheet(book: Book, g: Geo, P: Plan, file: string, used: Set<number>, opt: RenderOpts, pageAt: number, pageTotal: number): PrintSheet {
  const sh = g.sh; const st = book.styles; const fit = !!opt.layout;
  const { pw, ph, M, availW, availH, scale } = P;
  const mergeAt = new Map<number, { r1: number; c1: number; r2: number; c2: number }>();
  for (const m of sh.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeAt.set(key(r, c), m);
  const colInfo = (c: number) => sh.cols.find(k => c >= k.min && c <= k.max);
  const cellOf = (r: number, c: number) => sh.cells.get(key(r, c));
  const styleOf = (r: number, c: number) => { const k = cellOf(r, c); if (k?.s != null) return k.s; const rw = sh.rows.get(r); if (rw?.s != null) return rw.s; return colInfo(c)?.s ?? 0; };
  // ταξινομημένο: το Α/Α δείχνει τον αριθμό της θέσης (της γραμμής που ήταν εκεί πριν)
  const shown = (r0: number, c: number) => { const r = g.fix?.get(key(r0, c)) ?? r0; const k = cellOf(r, c); if (!k) return ''; const v = k.f ? book.value(sh.name, r, c) : k.v; return v instanceof XErr ? v.code : v; };
  const fk = fixK(scale);   // σταθερά κομμάτια: όσο μίκρυνε ο πίνακας, τόσο μεγαλώνουν μέσα του
  const rowH = (r: number) => rowAt(g, r, scale) * (P.f !== 1 && g.framed.has(r) ? P.f : 1);
  const colW = (c: number) => g.colW(c) * P.cs;
  const withTitles = (first: number) => P.repeat && !!g.titles && first > g.titles[1];

  const pages = (opt.maxPages ? P.order.slice(0, opt.maxPages) : P.order).map(([rp, cp], pi) => {
    const rep = new Set(withTitles(rp[0]) ? g.titleList : []);   // οι γραμμές τίτλων που επαναλαμβάνονται (δεν είναι για κλικ)
    const rows = rep.size ? [...rep, ...rp] : rp;
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
          let k = rowIx.get(r)!; while (k + 1 < rows.length && rows[k + 1] <= m.r2 && rows[k + 1] === rows[k] + 1 + countHidden(rows[k], rows[k + 1], g.rowH)) { k++; rs++; }
          let j = colIx.get(c)!; while (j + 1 < cp.length && cp[j + 1] <= m.c2) { j++; cs++; }
          ar = m.r1; ac = m.c1; isAnchor = r === m.r1 && c === m.c1;
        }
        const s = styleOf(ar, ac); used.add(s);
        const xf = st.xfs[s] || st.xfs[0];
        const v = isAnchor ? shown(ar, ac) : '';
        const rich = isAnchor ? cellOf(ar, ac)?.rich : undefined;
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
          // σταθερό κομμάτι: στο μέγεθός του, και ό,τι δεν χωρά στο (μικρότερο πια) κελί του φαίνεται δίπλα
          const fx = g.fixC?.has(key(ar, ac)) && Math.abs(fk - 1) > 0.005;
          inner = `<div class="x${xf.wrap ? ' w' : ''}${spill || fx ? ' o' : ''}" style="height:${Math.max(1, h - 1).toFixed(2)}px;justify-content:${just};align-items:${val};${pad}${xf.wrap ? 'text-align:' + hal + ';' : ''}${rot}"><span${fx ? ` style="font-size:${fk.toFixed(3)}em"` : ''}>${rich ? richHtml(rich) : esc(txt)}</span></div>`;
        }
        tr += `<td class="s${s}"${opt.refs ? ` data-a="${colName(ac)}${ar}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${style ? ` style="${style}"` : ''}>${inner}</td>`;
      }
      body += `<tr${fit ? ` data-r="${r}"${rep.has(r) ? ' data-t="1"' : ''}` : ''} style="height:${rowH(r).toFixed(2)}px">${tr}</tr>`;
    }
    const cg = '<colgroup>' + cp.map(c => `<col style="width:${colW(c).toFixed(2)}px">`).join('') + '</colgroup>';
    const left = M.l + (P.centerH ? Math.max(0, (availW - tw * scale) / 2) : 0), top = M.t + (P.centerV ? Math.max(0, (availH - th * scale) / 2) : 0);
    const no = pageAt + pi + 1;
    const ctx = { page: fit ? no : g.firstNo + pi, pages: fit ? pageTotal : P.order.length, sheet: sh.name, file };
    const hf = (src: string | undefined, isHead: boolean) => { const p = headerFooter(src ? unesc(src) : null, ctx); return p ? `<div class="hf" style="${isHead ? 'top' : 'bottom'}:${(isHead ? M.h : M.f).toFixed(1)}px;left:${M.l.toFixed(1)}px;right:${M.r.toFixed(1)}px"><span>${esc(p[0])}</span><span>${esc(p[1])}</span><span>${esc(p[2])}</span></div>` : ''; };
    const pno = P.pno && pageTotal > 1 && !g.oddF ? `<div class="pno" style="bottom:${Math.max(3, M.b / 2 - 7).toFixed(1)}px">Σελίδα ${no} από ${pageTotal}</div>` : '';
    const data = fit ? ` data-n="${no}" data-sheet="${esc(sh.name)}" data-first="${rp[0] ?? 0}" data-land="${P.landscape ? 1 : 0}" data-paper="${P.paper.name}"` : '';
    return `<div class="pg"${data} style="width:${pw.toFixed(2)}px;height:${ph.toFixed(2)}px">${hf(g.oddH, true)}<div class="ar" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;transform:scale(${scale})"><table class="${g.grid ? 'grid' : ''}" style="width:${tw.toFixed(2)}px">${cg}<tbody>${body}</tbody></table></div>${hf(g.oddF, false)}${pno}</div>`;
  });
  return { name: sh.name, paper: P.paper.name, landscape: P.landscape, pages: P.order.length, scale, html: pages.join(''), pt: Math.round(P.pt * 2) / 2, font: g.dom.name, size: g.dom.sz, titles: !!g.titles };
}
// κρυφές γραμμές ανάμεσα σε δύο ορατές (για να συνεχίζει η συγχώνευση από πάνω τους)
const countHidden = (a: number, b: number, rowH: (r: number) => number) => { let n = 0; for (let r = a + 1; r < b; r++) if (rowH(r) === 0) n++; return n; };

// Το κλειδί των ρυθμίσεων εκτύπωσης ενός εντύπου: το όνομα του αρχείου χωρίς ημερομηνίες, αριθμούς και κατάληξη
// («ΗΚΑΙ 2Η ΕΠΧΙΑ 21.10.26.xlsx» και «… 22.10.26.xlsx» → ίδιο κλειδί), ώστε να θυμάται το ίδιο έντυπο κάθε μέρα
const GR_MONTHS = /(ΙΑΝΟΥΑΡΙΟΣ|ΦΕΒΡΟΥΑΡΙΟΣ|ΜΑΡΤΙΟΣ|ΑΠΡΙΛΙΟΣ|ΜΑΙΟΣ|ΙΟΥΝΙΟΣ|ΙΟΥΛΙΟΣ|ΑΥΓΟΥΣΤΟΣ|ΣΕΠΤΕΜΒΡΙΟΣ|ΟΚΤΩΒΡΙΟΣ|ΝΟΕΜΒΡΙΟΣ|ΔΕΚΕΜΒΡΙΟΣ)/g;
export function printKey(file: string): string {
  const base = file.split(/[\\/]/).pop() || file;
  const k = base.replace(/\.xls[xm]?$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(GR_MONTHS, ' ').replace(/\d{1,4}([-./]\d{1,4})+/g, ' ').replace(/\(\d+\)/g, ' ').replace(/\b(ΕΩΣ)\b/g, ' ').replace(/\b\d+\b/g, ' ')
    .replace(/[-_.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return k.slice(0, 80) || 'ΑΡΧΕΙΟ';
}
// αρχικές ρυθμίσεις ανά έντυπο: ΗΚΑΙ μπρος-πίσω, στενά περιθώρια, στο κέντρο· ΦΡΟΥΡΑ στενά (το template είχε μηδενικά)
export function printDefaults(key: string, sheets: string[]): PrintOpts {
  const low = sheets.map(s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (low.includes('μπροστινο') && low.includes('πισω')) return { ...PRINT_DEFAULT, side: 'back', m: 'narrow', sp: 'center', pno: false };
  if (/^ΦΡΟΥΡΑ/.test(key)) return { ...PRINT_DEFAULT, m: 'narrow' };
  return { ...PRINT_DEFAULT };
}

// ------------------------------------------------------------------ το παράθυρο «Εκτύπωση»
// Τα στοιχεία που χρειάζεται η στήλη ρυθμίσεων: σελίδες, προσανατολισμός και γράμματα κάθε φύλλου
export interface PrintInfo { sheets: { name: string; pages: number; landscape: boolean; pt: number; font: string; size: number; titles: boolean; scale: number }[]; all: string[]; total: number; sug?: { n: number; pt: number }; cols: SortCol[] }
export const infoOf = (doc: PrintDoc): PrintInfo => ({ sheets: doc.sheets.map(s => ({ name: s.name, pages: s.pages, landscape: s.landscape, pt: s.pt, font: s.font, size: s.size, titles: s.titles, scale: s.scale })), all: doc.all, total: doc.total, ...(doc.sug ? { sug: doc.sug } : {}), cols: doc.cols || [] });
export const sectionsHtml = (doc: PrintDoc) => doc.sheets.map((s, i) => `<section data-i="${i}" aria-label="${esc(s.name)}">${doc.sheets.length > 1 ? `<h2>${esc(s.name)}</h2>` : ''}${s.html}</section>`).join('') || '<p class="empty">Δεν διαλέχτηκε φύλλο για εκτύπωση.</p>';

// Το script της προεπισκόπησης. Είναι το μόνο που επιτρέπει το CSP (με το hash του), ώστε ό,τι άλλο βρεθεί μέσα στη σελίδα
// από το αρχείο να μην τρέχει. Κάθε αλλαγή ρύθμισης ζητά από την εφαρμογή νέα διάταξη (το Excel έχει ήδη διαβαστεί μία φορά).
const PREVIEW_SCRIPT = `
(function(){
  'use strict';
  var api = window.printer, $ = function(id){ return document.getElementById(id); };
  var init = {}; try { init = JSON.parse(document.body.getAttribute('data-init') || '{}'); } catch (e) {}
  var o = init.opts || {}, info = init.info || { sheets: [], all: [], total: 0 }, remember = init.remember !== false, duplex = !!init.duplex, sel = null;
  var pagesEl = $('pages'), view = $('view'), msg = $('msg'), go = $('go'), dlg = $('dlg'), pdf = $('pdf'), prn = $('prn'), copies = $('copies');
  var seq = 0, timer = 0, slow = 0;
  var fmt = function(n){ return String(Math.round(n * 2) / 2).replace('.', ','); };
  var plural = function(n, a, b){ return n + ' ' + (n === 1 ? a : b); };
  var hasBreaks = function(){ return !!o.breaks && Object.keys(o.breaks).some(function(k){ return o.breaks[k].length; }); };
  function say(t, ok){ msg.textContent = t || ''; msg.className = 'msg' + (ok ? ' ok' : ''); }

  // ---------------------------------------------------------------- νέα διάταξη από την εφαρμογή
  function request(save){
    clearTimeout(timer);
    timer = setTimeout(function(){
      var my = ++seq; clearTimeout(slow); slow = setTimeout(function(){ document.body.classList.add('busy'); }, 200);
      api.layout({ opts: o, sheets: sel, save: !!save && remember }).then(function(r){
        if (my !== seq) return;
        clearTimeout(slow); document.body.classList.remove('busy');
        if (!r || !r.ok) { say((r && r.error) || 'Δεν έγινε η διάταξη.'); return; }
        $('cells').textContent = r.css; pagesEl.innerHTML = r.html; info = r.info; say('');
        render();
      });
    }, 40);
  }
  function set(k, v, save){ o[k] = v; if (k === 'pages' || k === 'sort') delete o.breaks; request(save !== false); }

  // ---------------------------------------------------------------- στήλη ρυθμίσεων
  function radios(name, val){ [].forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function(i){ i.checked = !hasBreaks() || name !== 'pages' ? i.value === String(val) : false; }); }
  function panel(){
    var manual = hasBreaks(), multi = info.sheets.length > 1, land = info.sheets.length && info.sheets.every(function(s){ return s.landscape; }), port = info.sheets.every(function(s){ return !s.landscape; });
    radios('pages', o.pages); radios('or', o.or); radios('sp', o.sp); radios('m', o.m); radios('pa', o.paper); radios('side', o.side);
    ['stretch','repeat','keep','pno','same'].forEach(function(k){ $(k).checked = !!o[k]; });
    $('duplex').checked = duplex; $('remember').checked = remember;
    $('manual').hidden = !manual; $('mcount').textContent = info.total;
    $('sizeGrp').hidden = manual || o.pages !== 'auto'; $('size').value = o.size; $('sizeOut').textContent = fmt(o.size) + ' pt';
    $('oaText').textContent = o.or === 'auto' && info.sheets.length ? 'Αυτόματα (' + (land ? 'οριζ.' : port ? 'κατακ.' : 'μικτά') + ')' : 'Αυτόματα';
    $('duplexRow').hidden = o.side !== 'back';
    $('sideHelp').textContent = o.side === 'back'
      ? (duplex ? 'Γυρίζει στην ' + (land ? 'κοντή' : 'μακριά') + ' πλευρά, ώστε η πίσω όψη να μη βγαίνει ανάποδα.' : 'Τυπώνει πρώτα τις μπροστινές. Μετά σου λέει να ξαναβάλεις τα φύλλα στον δίσκο και τυπώνει τις πίσω.')
      : 'Κάθε σελίδα σε δικό της χαρτί.';
    $('sameGrp').hidden = !multi;
    $('repeatRow').hidden = !info.sheets.some(function(s){ return s.titles; });
    $('pagesHelp').textContent = manual ? 'Οι σελίδες αλλάζουν εκεί που έκανες κλικ. Τα γράμματα βγαίνουν όσο μεγάλα χωράνε.'
      : o.pages === 'auto' ? 'Διαλέγεις μέγεθος γραμμάτων και βγαίνουν όσες σελίδες χρειαστούν.'
      : 'Τα γράμματα βγαίνουν όσο μεγάλα χωράνε σε ' + (o.pages === 1 ? '1 σελίδα' : o.pages + ' σελίδες, με ίσες γραμμές') + (multi ? ' για κάθε φύλλο.' : '.');
    // πόσο καθαρά θα διαβάζεται, και ότι Arial 12 βγαίνει ίδιο σε όλες τις σελίδες
    var lg = $('legible');
    if (!info.sheets.length) { lg.hidden = true; } else {
      lg.hidden = false;
      var min = Math.min.apply(null, info.sheets.map(function(s){ return s.pt; }));
      var cls = min >= 10 ? 'ok' : min >= 8 ? 'warn' : 'bad';
      lg.className = 'legible ' + cls;
      var one = info.sheets.every(function(s){ var a = info.sheets[0]; return s.font === a.font && s.size === a.size && s.pt === a.pt; });
      var first = info.sheets[0];
      var head = one ? first.font + ' ' + fmt(first.size) + ' του Excel → <b>' + fmt(first.pt) + ' pt</b> στο χαρτί'
        : info.sheets.map(function(s){ return esc(s.name) + ': ' + esc(s.font) + ' ' + fmt(s.size) + ' → <b>' + fmt(s.pt) + ' pt</b>'; }).join('<br>');
      var word = cls === 'ok' ? 'Διαβάζεται καθαρά.' : cls === 'warn' ? 'Μικρά γράμματα, διαβάζονται.' : 'Πολύ μικρά γράμματα.';
      var scales = info.sheets.map(function(s){ return s.scale; }), oneScale = scales.every(function(x){ return Math.abs(x - scales[0]) < 0.002; });
      var same = info.total < 2 ? '' : one ? ' Ίδιο μέγεθος σε όλες τις σελίδες' + (multi && o.side === 'back' ? ', μπρος και πίσω.' : '.')
        : oneScale ? ' Ίδια κλίμακα σε όλα: ' + esc(first.font) + ' 12 βγαίνει ' + fmt(12 * scales[0]) + ' pt παντού.' : '';
      lg.innerHTML = '<span>' + head + '</span><span>' + word + same + '</span>' + (info.sug ? '<button type="button" class="sm" data-sug="' + info.sug.n + '">Σε ' + info.sug.n + ' σελίδες: ' + fmt(info.sug.pt) + ' pt</button>' : '');
    }
    // φύλλα του Excel
    var chips = $('sheets'); chips.hidden = info.all.length < 2;
    chips.innerHTML = info.all.map(function(n){ var s = info.sheets.filter(function(x){ return x.name === n; })[0]; return '<label><input type="checkbox" value="' + esc(n) + '"' + (s ? ' checked' : '') + '> ' + esc(n) + (s ? ' <small>' + s.pages + '</small>' : '') + '</label>'; }).join('');
    var sheetsOf = o.side === 'back' ? Math.ceil(info.total / 2) : info.total;
    $('meta').textContent = info.total ? plural(info.total, 'σελίδα', 'σελίδες') + ' σε ' + plural(sheetsOf, 'φύλλο', 'φύλλα') + ' χαρτί' + (o.side === 'back' && info.total > 1 ? ' (μπρος-πίσω)' : '') + ' · ' + o.paper + ' ' + (land ? 'οριζόντια' : port ? 'κατακόρυφα' : 'κατακόρυφα και οριζόντια') : '';
    go.disabled = dlg.disabled = pdf.disabled = !info.total;
    sorts();
  }
  function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---------------------------------------------------------------- ταξινόμηση: 1η, 2η, 3η στήλη (κουμπί με λίστα, όχι το select των Windows)
  var DIR = { text: ['Α → Ω', 'Ω → Α'], num: ['1 → 9', '9 → 1'], date: ['Παλιά πρώτα', 'Νέα πρώτα'], rank: ['Ανώτεροι πρώτα', 'Κατώτεροι πρώτα'] };
  var menu = $('menu'), menuAt = null, want = null;
  function colOf(k){ return (info.cols || []).filter(function(c){ return c.k === k; })[0]; }
  function sorts(){
    var list = o.sort || [], cols = info.cols || [], a = document.activeElement, keep = want;
    // το πλήκτρο που είχε την εστίαση μένει με την εστίαση και μετά τη νέα διάταξη
    if (!keep && a && $('sorts').contains(a)) ['data-i', 'data-d', 'data-x'].forEach(function(n){ if (a.hasAttribute(n)) keep = '#sorts [' + n + '="' + a.getAttribute(n) + '"]'; });
    want = null;
    $('sortGrp').hidden = !cols.length && !list.length;
    $('sorts').innerHTML = list.map(function(s, i){
      var c = colOf(s.c), kind = c ? c.kind : 'text';
      return '<div class="srt"><span class="no">' + (i + 1) + 'η</span><button type="button" class="dd" data-i="' + i + '" aria-haspopup="listbox" aria-label="' + (i + 1) + 'η ταξινόμηση: ' + esc(c ? c.label : s.l || s.c) + '"' + (c ? '' : ' title="Δεν υπάρχει αυτή η στήλη σε αυτό το έντυπο"') + '><span>' + esc(c ? c.label : s.l || s.c) + '</span></button>'
        + '<button type="button" class="sm dir" data-d="' + i + '" title="Αλλαγή φοράς">' + DIR[kind][s.d ? 1 : 0] + '</button>'
        + '<button type="button" class="sm x" data-x="' + i + '" aria-label="Χωρίς την ' + (i + 1) + 'η ταξινόμηση" title="Βγάλε την">✕</button></div>';
    }).join('');
    var free = cols.filter(function(c){ return !list.some(function(s){ return s.c === c.k; }); });
    $('sortAdd').hidden = list.length >= 3 || !free.length;
    $('sortAdd').textContent = list.length ? '+ Μετά κατά…' : '+ Ταξινόμηση κατά…';
    if (keep) { var f = document.querySelector(keep); if (!f || f.hidden) f = document.querySelector('#sorts .dd') || $('sortAdd'); if (f && !f.hidden) f.focus(); }
    $('sortHelp').textContent = list.length ? 'Αλλάζει μόνο η σειρά των γραμμών του πίνακα. Κεφαλίδα, σύνολα και υπογραφές μένουν στη θέση τους, και το Α/Α μετράει ξανά από το 1.' : 'Όπως είναι στο Excel. Διάλεξε στήλη, π.χ. πρώτα θάλαμος και μετά επίθετο.';
  }
  function putSort(list){ set('sort', list); }
  function closeMenu(focus){ if (menu.hidden) return; menu.hidden = true; var b = menuAt && menuAt.btn; menuAt = null; if (focus && b && document.body.contains(b)) b.focus(); }
  function openMenu(btn, at){
    var list = o.sort || [], cur = at >= 0 ? list[at].c : null;
    var opts = (info.cols || []).filter(function(c){ return c.k === cur || !list.some(function(s){ return s.c === c.k; }); });
    if (!opts.length) return;
    menu.innerHTML = opts.map(function(c){ return '<button type="button" role="option" data-k="' + esc(c.k) + '" aria-selected="' + (c.k === cur) + '">' + esc(c.label) + '</button>'; }).join('');
    menu.hidden = false; menuAt = { btn: btn, at: at };
    var r = btn.getBoundingClientRect(), h = menu.offsetHeight, w = Math.max(r.width, menu.offsetWidth);
    menu.style.minWidth = r.width + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + h + 8 > window.innerHeight && r.top - h - 2 > 8 ? r.top - h - 2 : r.bottom + 2) + 'px';
    (menu.querySelector('[aria-selected="true"]') || menu.firstChild).focus();
  }
  function pickCol(k){
    var at = menuAt ? menuAt.at : -1, c = colOf(k), list = (o.sort || []).slice(); closeMenu(false);
    if (!c) return;
    if (at >= 0) list[at] = { c: k, l: c.label, d: list[at].d && list[at].c === k ? true : undefined };
    else list.push({ c: k, l: c.label });
    want = '#sorts [data-i="' + (at >= 0 ? at : list.length - 1) + '"]'; putSort(list);
  }
  $('sortAdd').addEventListener('click', function(){ openMenu($('sortAdd'), -1); });
  $('sorts').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    var list = (o.sort || []).slice();
    if (b.hasAttribute('data-i')) openMenu(b, +b.getAttribute('data-i'));
    else if (b.hasAttribute('data-d')) { var i = +b.getAttribute('data-d'); list[i] = { c: list[i].c, l: list[i].l, d: !list[i].d || undefined }; putSort(list); }
    else if (b.hasAttribute('data-x')) { list.splice(+b.getAttribute('data-x'), 1); want = '#sortAdd'; putSort(list.length ? list : undefined); }
  });
  menu.addEventListener('click', function(e){ var b = e.target.closest('[data-k]'); if (b) pickCol(b.getAttribute('data-k')); });
  menu.addEventListener('keydown', function(e){
    var items = [].slice.call(menu.querySelectorAll('[data-k]')), i = items.indexOf(document.activeElement);
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
    else if (e.key.length === 1 && e.key !== ' ') {
      // πληκτρολογείς το πρώτο γράμμα: πάει στην επόμενη στήλη που ξεκινά από αυτό (χωρίς τόνους)
      var plain = function(t){ return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }, ch = plain(e.key);
      for (var n = 1; n <= items.length; n++) { var x = items[(i + n) % items.length]; if (plain(x.textContent).indexOf(ch) === 0) { x.focus(); break; } }
    }
  });
  document.addEventListener('mousedown', function(e){ if (!menu.hidden && !menu.contains(e.target) && (!menuAt || !menuAt.btn.contains(e.target))) closeMenu(false); });
  view.addEventListener('scroll', function(){ closeMenu(false); });

  // ---------------------------------------------------------------- σελίδες: με λεζάντα, ανά δύο σε «φύλλο» στο μπρος-πίσω
  function pages(){ return [].slice.call(pagesEl.querySelectorAll('.pg')); }
  function render(){
    panel();
    var list = pages(), back = o.side === 'back' && list.length > 1;
    list.forEach(function(p, i){
      var box = document.createElement('div'); box.className = 'pbox';
      p.parentNode.insertBefore(box, p); box.appendChild(p);
      var cap = document.createElement('small');
      cap.textContent = 'Σελίδα ' + (i + 1) + ' από ' + list.length + (back ? ' · ' + (i % 2 ? 'πίσω' : 'μπρος') : '');
      box.appendChild(cap);
    });
    if (back) {
      var boxes = list.map(function(p){ return p.parentNode; }), wrap = document.createDocumentFragment();
      for (var i = 0; i < boxes.length; i += 2) {
        var sh = document.createElement('div'); sh.className = 'sheet';
        var t = document.createElement('b'); t.textContent = 'Φύλλο ' + (i / 2 + 1) + (boxes[i + 1] ? ' · μπρος και πίσω' : ' · μόνο μπρος'); sh.appendChild(t);
        var pair = document.createElement('div'); pair.className = 'pair'; pair.appendChild(boxes[i]); if (boxes[i + 1]) pair.appendChild(boxes[i + 1]); sh.appendChild(pair);
        wrap.appendChild(sh);
      }
      pagesEl.innerHTML = ''; pagesEl.appendChild(wrap);
    }
    zoom();
  }
  // οι σελίδες χωράνε στο πλάτος της προεπισκόπησης (μόνο στην οθόνη· στο χαρτί τυπώνονται στο πραγματικό μέγεθος)
  function zoom(){
    var list = pages(); if (!list.length) return;
    var back = o.side === 'back' && list.length > 1, w = 0, room = view.clientWidth - 48;
    list.forEach(function(p){ w = Math.max(w, parseFloat(p.style.width) || 0); });
    // μπρος-πίσω: δίπλα-δίπλα αν χωράνε σε τουλάχιστον μισό μέγεθος, αλλιώς το ένα κάτω από το άλλο
    var side = back && room / (w * 2 + 48) >= 0.5;
    [].forEach.call(pagesEl.querySelectorAll('.pair'), function(x){ x.classList.toggle('stack', !side); });
    pagesEl.style.zoom = Math.min(1, Math.max(0.2, room / ((side ? w * 2 + 24 : w) + 24)));
  }
  window.addEventListener('resize', function(){ clearTimeout(zoom.t); zoom.t = setTimeout(zoom, 80); });

  // ---------------------------------------------------------------- κλικ σε γραμμή: η σελίδα αλλάζει από εκεί
  view.addEventListener('click', function(e){
    var tr = e.target.closest && e.target.closest('tr[data-r]'), pg = tr && tr.closest('.pg'); if (!pg) return;
    var r = +tr.getAttribute('data-r'), sheet = pg.getAttribute('data-sheet');
    var ofSheet = pages().filter(function(p){ return p.getAttribute('data-sheet') === sheet; });
    if (tr.hasAttribute('data-t') || r <= +ofSheet[0].getAttribute('data-first')) return;   // γραμμή τίτλων που επαναλαμβάνεται, ή η πρώτη γραμμή
    // η σειρά των γραμμών όπως τυπώνονται (με ταξινόμηση δεν είναι η σειρά του Excel)
    var order = []; ofSheet.forEach(function(p){ [].forEach.call(p.querySelectorAll('tr[data-r]:not([data-t])'), function(t){ order.push(+t.getAttribute('data-r')); }); });
    var pos = function(x){ return order.indexOf(x); };
    var had = hasBreaks();
    if (!had) { o.breaks = {}; info.sheets.forEach(function(s){ o.breaks[s.name] = pages().filter(function(p){ return p.getAttribute('data-sheet') === s.name; }).slice(1).map(function(p){ return +p.getAttribute('data-first'); }); }); }
    var starts = (o.breaks[sheet] || []).slice(), at = starts.indexOf(r);
    if (at >= 0) starts.splice(at, 1);                                          // πρώτη γραμμή σελίδας: ενώνεται με την προηγούμενη
    else if (!had && o.pages !== 'auto' && starts.length) {                      // 2 ή 3 σελίδες: μετακινείται η πιο κοντινή αλλαγή
      var best = 0; starts.forEach(function(s, i){ if (Math.abs(pos(s) - pos(r)) < Math.abs(pos(starts[best]) - pos(r))) best = i; }); starts[best] = r;
    } else starts.push(r);
    o.breaks[sheet] = starts.filter(function(v, i, a){ return a.indexOf(v) === i; }).sort(function(a, b){ return pos(a) - pos(b); });
    request(false);
  });

  // ---------------------------------------------------------------- χειρισμοί
  [['pages','pages'],['or','or'],['sp','sp'],['m','m'],['pa','paper'],['side','side']].forEach(function(x){
    [].forEach.call(document.querySelectorAll('input[name="' + x[0] + '"]'), function(i){ i.addEventListener('change', function(){ set(x[1], x[0] === 'pages' && i.value !== 'auto' ? +i.value : i.value); }); });
  });
  ['stretch','repeat','keep','pno','same'].forEach(function(k){ $(k).addEventListener('change', function(){ set(k, $(k).checked); }); });
  $('size').addEventListener('input', function(){ $('sizeOut').textContent = fmt(+$('size').value) + ' pt'; set('size', +$('size').value); });
  $('mreset').addEventListener('click', function(){ delete o.breaks; request(false); });
  $('legible').addEventListener('click', function(e){ var b = e.target.closest('[data-sug]'); if (b) set('pages', +b.getAttribute('data-sug')); });
  $('sheets').addEventListener('change', function(){ sel = [].slice.call(document.querySelectorAll('#sheets input:checked')).map(function(x){ return x.value; }); delete o.breaks; request(false); });
  $('duplex').addEventListener('change', function(){ duplex = $('duplex').checked; api.duplex(duplex); panel(); });
  $('remember').addEventListener('change', function(){ remember = $('remember').checked; if (remember) request(true); else api.forget(); });
  $('reset').addEventListener('click', function(){ api.forget().then(function(d){ o = d; request(remember); say('Επανήλθαν οι αρχικές ρυθμίσεις.', true); }); });
  $('close').addEventListener('click', function(){ api.close(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { if (!$('flip').hidden) { flipDone(false); return; } if (!menu.hidden) { closeMenu(true); return; } api.close(); return; }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 'π' || e.key === 'Π')) { e.preventDefault(); if (!go.disabled) go.click(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'radio' && e.target.type !== 'checkbox')) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') set('pages', +e.key);
    else if (/^[oOοΟ]$/.test(e.key)) set('or', info.sheets.length && info.sheets.every(function(s){ return s.landscape; }) ? 'p' : 'l');
  });

  // ---------------------------------------------------------------- εκτύπωση
  // εκτυπωτές για εκτύπωση χωρίς τον διάλογο των Windows (κρατά χαρτί και προσανατολισμό)· χωρίς λίστα: ο διάλογος
  if (api && api.printers) api.printers().then(function(list){
    if (!list || !list.length) return;
    list.forEach(function(p){ var x = document.createElement('option'); x.value = p.name; x.textContent = p.label; if (p.def) x.selected = true; prn.appendChild(x); });
    [].forEach.call(document.querySelectorAll('.prn'), function(l){ l.hidden = false; });
    go.textContent = 'Εκτύπωση'; dlg.hidden = false;
  });
  function blank(like){ var b = document.createElement('div'); b.className = 'pg'; b.style.width = like.style.width; b.style.height = like.style.height; b.setAttribute('data-land', like.getAttribute('data-land')); b.setAttribute('data-paper', like.getAttribute('data-paper')); return b; }
  // η σελίδα για το χαρτί: λίγο πιο κοντή από το φύλλο, ώστε η στρογγυλοποίηση (και η κλίμακα των Windows) να μη σπρώχνει
  // ένα κομματάκι της σε δεύτερο, κενό φύλλο
  function sheetOf(p){ var x = p.cloneNode(true); x.style.height = Math.max(1, parseFloat(p.style.height) - 4) + 'px'; return x; }
  // μία «δουλειά» ανά χαρτί και προσανατολισμό: οι σελίδες αντιγράφονται στο #out, που είναι το μόνο που φαίνεται στο χαρτί
  async function send(list, useDialog, n, two){
    var groups = [];
    list.forEach(function(p){ var k = p.getAttribute('data-paper') + '|' + p.getAttribute('data-land'), g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k: k, list: [] }); g.list.push(p); });
    var device = useDialog || !prn.value ? '' : prn.value, out = $('out'), r = { ok: true };
    try {
      for (var i = 0; i < groups.length && r.ok; i++) {
        var g = groups[i], land = g.list[0].getAttribute('data-land') === '1', paper = g.list[0].getAttribute('data-paper') || 'A4';
        out.innerHTML = ''; g.list.forEach(function(p){ out.appendChild(sheetOf(p)); });
        $('page').textContent = '@page{size:' + paper + ' ' + (land ? 'landscape' : 'portrait') + ';margin:0}';
        r = await api.print({ landscape: land, pageSize: paper, part: groups.length > 1 ? (i + 1) + '/' + groups.length : '', device: device, copies: n, duplex: two ? (land ? 'shortEdge' : 'longEdge') : 'simplex' });
      }
    } finally { out.innerHTML = ''; }
    return r;
  }
  var flipNext = null;
  function flipDone(ok){ $('flip').hidden = true; var f = flipNext; flipNext = null; if (f) f(ok); }
  $('flipGo').addEventListener('click', function(){ flipDone(true); });
  $('flipNo').addEventListener('click', function(){ flipDone(false); });
  async function printAll(useDialog){
    var list = pages(); if (!list.length) return;
    var n = Math.min(99, Math.max(1, +copies.value || 1)), back = o.side === 'back' && list.length > 1, r;
    go.disabled = dlg.disabled = pdf.disabled = true; say('');
    try {
      if (back && !duplex) {
        // χωρίς διπλή όψη στον εκτυπωτή: πρώτα οι μπροστινές, μετά (αφού ξαναμπούν τα φύλλα) οι πίσω
        var front = [], rear = [];
        for (var c = 0; c < n; c++) list.forEach(function(p, i){ (i % 2 ? rear : front).push(p); });
        if (list.length % 2) for (var k = 0; k < n; k++) rear.splice((k + 1) * Math.ceil(list.length / 2) - 1, 0, blank(list[0]));
        r = await send(front, useDialog, 1, false);
        if (!r.ok) { if (r.error) say(r.error); return; }
        $('flipCount').textContent = plural(front.length, 'φύλλο', 'φύλλα');
        var go2 = await new Promise(function(res){ flipNext = res; $('flip').hidden = false; $('flipGo').focus(); });
        if (!go2) { say('Τυπώθηκαν μόνο οι μπροστινές.'); return; }
        var rev = $('flipRev').checked; try { localStorage.setItem('flipRev', rev ? '1' : ''); } catch (e) {}
        r = await send(rev ? rear.slice().reverse() : rear, useDialog, 1, false);
      } else r = await send(list, useDialog, n, back);
      if (!r.ok) { if (r.error) say(r.error); return; }
      if (prn.value && !useDialog) say('Στάλθηκε στον εκτυπωτή ' + prn.options[prn.selectedIndex].text + '.', true);
    } finally { go.disabled = dlg.disabled = pdf.disabled = !pages().length; }
  }
  try { $('flipRev').checked = localStorage.getItem('flipRev') === '1'; } catch (e) {}
  go.addEventListener('click', function(){ printAll(false); });
  dlg.addEventListener('click', function(){ printAll(true); });
  pdf.addEventListener('click', async function(){
    var list = pages(); if (!list.length) return; var out = $('out');
    out.innerHTML = ''; list.forEach(function(p){ var x = sheetOf(p); x.style.page = p.getAttribute('data-land') === '1' ? 'land' : 'port'; out.appendChild(x); });
    var paper = list[0].getAttribute('data-paper') || 'A4', land = list[0].getAttribute('data-land') === '1';
    $('page').textContent = '@page{size:' + paper + ' ' + (land ? 'landscape' : 'portrait') + ';margin:0}@page land{size:' + paper + ' landscape;margin:0}@page port{size:' + paper + ' portrait;margin:0}';
    pdf.disabled = true;
    try { var r = await api.pdf(); if (r && r.ok) say('Σώθηκε το ' + r.name + '.', true); else if (r && r.error) say(r.error); }
    finally { out.innerHTML = ''; pdf.disabled = !pages().length; }
  });
  render();
})();
`;
const SCRIPT_HASH = crypto.createHash('sha256').update(PREVIEW_SCRIPT).digest('base64');
const seg = (name: string, label: string, opts: [string, string, string?][]) =>
  `<div class="grp"><span class="lbl" id="l-${name}">${label}</span><div class="seg" role="radiogroup" aria-labelledby="l-${name}">${opts.map(([v, t, id]) => `<label><input type="radio" name="${name}" value="${v}"><span${id ? ` id="${id}"` : ''}>${t}</span></label>`).join('')}</div>`;
// Η σελίδα της προεπισκόπησης: αριστερά οι σελίδες όπως θα τυπωθούν, δεξιά οι ρυθμίσεις (σελίδες, όψεις, προσανατολισμός…)
export function previewHtml(doc: PrintDoc, file: string, init: { opts?: PrintOpts; remember?: boolean; duplex?: boolean } = {}): string {
  const one = doc.sheets[0];
  const data = { opts: init.opts || PRINT_DEFAULT, info: infoOf(doc), remember: init.remember !== false, duplex: !!init.duplex };
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${SCRIPT_HASH}'">
<title>Εκτύπωση · ${esc(file)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:#5c6152;font:14px "Segoe UI",Tahoma,Arial,sans-serif;color:#1b1f16;display:flex;flex-direction:column}
[hidden]{display:none!important}
.bar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:9px 16px;background:#4b5320;color:#fff}
.bar b{font-size:15px}.bar .meta{color:#d6dbbf}
.sheets{display:flex;flex-wrap:wrap;gap:6px}.sheets label{display:inline-flex;gap:5px;align-items:center;padding:2px 9px;border:1px solid #727c45;border-radius:14px;cursor:pointer}
.sheets small{color:#d6dbbf}.sheets input{accent-color:#d8b23a}
.wrap{flex:1;display:flex;min-height:0}
#view{flex:1;overflow:auto;padding:18px 0 30px;min-width:0}
#pages{display:flex;flex-direction:column;align-items:center;gap:18px}
section{display:flex;flex-direction:column;align-items:center;gap:18px}
section h2{margin:0;color:#e9ecdf;font-size:13px;font-weight:600}
.pbox{display:flex;flex-direction:column;align-items:center;gap:5px}.pbox>small{color:#e9ecdf;font-size:12px}
.sheet{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px;border:1px dashed rgba(233,236,223,.45);border-radius:10px}
.sheet>b{color:#e9ecdf;font-size:13px;font-weight:600}.pair{display:flex;gap:24px;align-items:flex-start}.pair.stack{flex-direction:column;gap:14px}
.hint{color:#e9ecdf;font-size:12.5px;text-align:center;margin:16px auto 0;max-width:60ch}
.empty{color:#fff;text-align:center}
body.busy #pages{opacity:.55;transition:opacity .15s}
.pg{position:relative;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45);overflow:hidden;flex:none}
.ar{position:absolute;transform-origin:0 0}
#view tr[data-r]{cursor:pointer}#view tr[data-r]:hover td{background-color:#fff6c9!important}
table{border-collapse:collapse;table-layout:fixed;color:#000}
td{padding:0;overflow:visible;vertical-align:bottom;font:11pt Calibri,Carlito,Arial,sans-serif}
table.grid td{outline:0.5px solid #bbb}
.x{display:flex;padding:0 2px;white-space:pre;overflow:hidden;line-height:1.15}
.x.o{overflow:visible}
.x.w{white-space:pre-wrap;word-wrap:break-word}.x.w span{width:100%}
.hf{position:absolute;display:flex;justify-content:space-between;font:10pt Calibri,Carlito,Arial,sans-serif}.hf span{flex:1}.hf span:nth-child(2){text-align:center}.hf span:nth-child(3){text-align:right}
.pno{position:absolute;left:0;right:0;text-align:center;font:9pt Arial,sans-serif;color:#333}
.side{width:336px;flex:none;background:#fff;display:flex;flex-direction:column;border-left:1px solid #dadecf;min-height:0}
.scroll{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:14px}
.grp{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#596050}
.seg{display:flex;border:1px solid #c2c8b5;border-radius:7px;overflow:hidden}
.seg label{flex:1;position:relative;min-width:0}
.seg input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.seg span{display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:5px 3px;border-left:1px solid #c2c8b5;font-size:12.5px;line-height:1.2;cursor:pointer}
.seg label:first-child span{border-left:0}
.seg input:checked+span{background:#4b5320;color:#fff;font-weight:600}
.seg input:focus-visible+span{outline:2px solid #5b7a2b;outline-offset:-3px}
.help{font-size:12px;color:#596050;margin:0}
.chk{display:flex;gap:7px;align-items:flex-start;font-size:13px;cursor:pointer}.chk input{margin-top:3px;accent-color:#4b5320}
.legible{display:flex;flex-direction:column;gap:5px;padding:9px 11px;border-radius:8px;font-size:13px}
.legible.ok{background:#ddf0e2;color:#1e6b34}.legible.warn{background:#fbedd2;color:#7a4700}.legible.bad{background:#fadfdc;color:#8a1c12}
.legible b{font-size:14px}
.manual{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#e3e7d8;padding:5px 9px;border-radius:7px;font-size:12.5px}
.range{display:flex;gap:8px;align-items:center}.range input{flex:1;accent-color:#4b5320}.range output{min-width:46px;text-align:right;font-weight:600}
.foot{border-top:1px solid #dadecf;padding:10px 14px;display:flex;flex-direction:column;gap:8px;background:#f3f4ef}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.prn{display:inline-flex;gap:6px;align-items:center;color:#596050;font-size:13px}.prn select,.prn input{font:inherit;padding:4px 6px;border:1px solid #c2c8b5;border-radius:6px;background:#fff;color:#1b1f16}.prn select{max-width:200px}.prn input{width:56px}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #c2c8b5;background:#fff;cursor:pointer;color:#1b1f16}
button.sm{padding:3px 9px;font-size:12.5px;align-self:flex-start}
button.pri{background:#4b5320;border-color:#4b5320;color:#fff;font-weight:600}button:disabled{opacity:.6;cursor:default}
button:focus-visible,.sheets label:focus-within{outline:2px solid #5b7a2b;outline-offset:2px}
.msg{color:#b3261e;font-size:13px}.msg.ok{color:#1e6b34}.msg:empty{display:none}
.flip{position:fixed;inset:0;background:rgba(15,18,10,.45);display:flex;align-items:center;justify-content:center;z-index:5}
.flip>div{background:#fff;border-radius:12px;padding:18px 20px;max-width:440px;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 40px rgba(0,0,0,.3)}
.flip h3{margin:0;font-size:16px}.flip p{margin:0}
#out{display:none}
.sorts{display:flex;flex-direction:column;gap:5px}.sorts:empty{display:none}
.srt{display:flex;gap:5px;align-items:center}.srt .no{font-size:12px;color:#596050;min-width:20px}
.srt .dd{flex:1;min-width:0;display:flex;justify-content:space-between;gap:6px;padding:4px 8px;text-align:left}.srt .dd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srt .dd::after{content:"▾";color:#596050}.srt .sm{align-self:auto;white-space:nowrap}.srt .x{padding:3px 7px}
.menu{position:fixed;z-index:6;background:#fff;border:1px solid #c2c8b5;border-radius:7px;box-shadow:0 8px 22px rgba(0,0,0,.25);max-height:min(320px,70vh);overflow:auto;padding:3px;display:flex;flex-direction:column}
.menu button{border:0;border-radius:5px;text-align:left;padding:5px 10px;font-size:13px}.menu button:hover,.menu button:focus{background:#e3e7d8;outline:none}.menu button[aria-selected="true"]{font-weight:700}
${doc.css}
@media print{html,body{height:auto;background:#fff}body{display:block}.bar,.wrap,.flip,.menu{display:none!important}#out{display:block}#out .pg{margin:0;box-shadow:none;break-after:page;contain:strict}#out .pg:last-child{break-after:auto}}
</style><style id="cells"></style><style id="page">${one ? `@page{size:${one.paper} ${one.landscape ? 'landscape' : 'portrait'};margin:0}` : ''}</style></head><body data-init="${esc(JSON.stringify(data))}">
<div class="bar"><b>${esc(file)}</b><span class="meta" id="meta"></span><div class="sheets" id="sheets" role="group" aria-label="Φύλλα"></div></div>
<div class="wrap">
<div id="view"><div id="pages">${sectionsHtml(doc)}</div><p class="hint">Κλικ σε μια γραμμή: η νέα σελίδα ξεκινά από εκεί. Κλικ στην πρώτη γραμμή μιας σελίδας: ενώνεται με την προηγούμενη.</p></div>
<aside class="side" aria-label="Ρυθμίσεις εκτύπωσης"><div class="scroll">
${seg('pages', 'Σε πόσες σελίδες', [['1', '1'], ['2', '2'], ['3', '3'], ['auto', 'Όσες χρειάζονται']])}
<div class="manual" id="manual" hidden><span>Χειροκίνητα: <b id="mcount"></b> σελίδες</span><button type="button" class="sm" id="mreset">Αρχικό</button></div>
<p class="help" id="pagesHelp"></p></div>
<div class="legible" id="legible" role="status"></div>
<div class="grp" id="sizeGrp" hidden><span class="lbl" id="l-size">Μέγεθος γραμμάτων</span><div class="range"><input type="range" id="size" min="6" max="16" step="0.5" aria-labelledby="l-size"><output id="sizeOut" for="size"></output></div><p class="help">Οι στήλες χωράνε πάντα στο πλάτος: αν δεν χωράει, σταματά στο μέγιστο που χωράει.</p></div>
<div class="grp" id="sortGrp" hidden><span class="lbl">Ταξινόμηση</span><div id="sorts" class="sorts"></div><button type="button" class="sm" id="sortAdd" aria-haspopup="listbox"></button><p class="help" id="sortHelp"></p></div>
${seg('side', 'Η σελίδα 2 τυπώνεται', [['back', 'Στην πίσω όψη'], ['new', 'Σε νέο φύλλο']])}
<label class="chk" id="duplexRow"><input type="checkbox" id="duplex"> <span>Ο εκτυπωτής γυρίζει μόνος του το χαρτί</span></label>
<p class="help" id="sideHelp"></p></div>
<div class="grp" id="sameGrp"><label class="chk"><input type="checkbox" id="same"> <span>Ίδια γράμματα σε όλα τα φύλλα (μπρος και πίσω)</span></label><p class="help">Αν ένα φύλλο του Excel χρειάζεται μικρότερα γράμματα, μικραίνουν και τα άλλα, ώστε π.χ. Arial 12 να βγαίνει ίδιο παντού.</p></div>
${seg('or', 'Προσανατολισμός', [['auto', 'Αυτόματα', 'oaText'], ['p', 'Κατακόρυφα'], ['l', 'Οριζόντια']])}<p class="help">«Αυτόματα» διαλέγει όποιον βγάζει τα μεγαλύτερα γράμματα.</p></div>
${seg('sp', 'Αν περισσεύει χώρος από κάτω', [['top', 'Πάνω'], ['center', 'Στο κέντρο'], ['fill', 'Ψηλότερες γραμμές']])}<p class="help">«Ψηλότερες γραμμές» αφήνει χώρο για υπογραφή με το χέρι.</p></div>
${seg('m', 'Περιθώρια', [['narrow', 'Στενά'], ['normal', 'Κανονικά'], ['wide', 'Φαρδιά']])}</div>
${seg('pa', 'Χαρτί', [['A4', 'A4'], ['A3', 'A3']])}</div>
<div class="grp"><span class="lbl">Σε κάθε σελίδα</span>
<label class="chk"><input type="checkbox" id="stretch"> <span>Οι στήλες πιάνουν όλο το πλάτος</span></label>
<label class="chk" id="repeatRow"><input type="checkbox" id="repeat"> <span>Η κεφαλίδα του πίνακα ξανά πάνω</span></label>
<label class="chk"><input type="checkbox" id="keep"> <span>Δεν κόβεται θάλαμος ή πίνακας στη μέση</span></label>
<label class="chk"><input type="checkbox" id="pno"> <span>«Σελίδα 1 από 2» κάτω</span></label></div>
</div><div class="foot">
<label class="chk"><input type="checkbox" id="remember"> <span>Να θυμάται τις ρυθμίσεις για αυτό το έντυπο</span></label>
<div class="row"><label class="prn" hidden>Εκτυπωτής <select id="prn"></select></label><label class="prn" hidden>Αντίτυπα <input id="copies" type="number" min="1" max="99" value="1"></label></div>
<div class="row"><button type="button" class="pri" id="go" autofocus>Εκτύπωση…</button><button type="button" id="pdf">PDF…</button><button type="button" id="dlg" hidden title="Ο διάλογος των Windows παίρνει τον προσανατολισμό του εκτυπωτή: διάλεξε εκεί «Οριζόντιο» για τα οριζόντια φύλλα">Διάλογος των Windows…</button></div>
<div class="row"><button type="button" id="reset">Αρχικές ρυθμίσεις</button><button type="button" id="close">Κλείσιμο</button></div>
<div class="msg" id="msg" role="status"></div></div></aside>
</div>
<div class="flip" id="flip" hidden role="dialog" aria-modal="true" aria-labelledby="flipT"><div><h3 id="flipT">Γύρισε τα φύλλα</h3>
<p>Τυπώθηκαν οι μπροστινές σελίδες (<span id="flipCount"></span>). Πάρε τα φύλλα όπως βγήκαν και βάλ' τα ξανά στον δίσκο του εκτυπωτή με την τυπωμένη πλευρά από την άλλη μεριά. Μετά πάτα «Τύπωσε τις πίσω».</p>
<label class="chk"><input type="checkbox" id="flipRev"> <span>Αντίστροφη σειρά (αν την προηγούμενη φορά βγήκαν ανακατεμένες)</span></label>
<div class="row"><button type="button" class="pri" id="flipGo">Τύπωσε τις πίσω</button><button type="button" id="flipNo">Άκυρο</button></div></div></div>
<div class="menu" id="menu" role="listbox" aria-label="Στήλες" hidden></div>
<div id="out"></div>
<script>${PREVIEW_SCRIPT}</script></body></html>`;
}
