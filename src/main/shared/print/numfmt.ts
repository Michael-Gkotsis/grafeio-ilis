// Number and date formats of the print engine (Excel format codes in the Greek style).
//
// Purpose: `formatValue` (a cell value shown with its number format id), with `BUILTIN` (the built-in codes),
//   `isDateFmt` and `general`.
// Does NOT: read the format codes (styles.ts reads them) or decide what a cell is (sheet.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the printed pages must show numbers and dates as Excel does on a Greek Windows (decimal comma, thousands dot,
//   Greek month and day names); the month and day names are kept exactly as they were (Phase 4.8a, verbatim).
// Covering test: test/datefmt.test.ts.

/** Excel built-in number format codes by id (the ids not listed here mean General). */
export const BUILTIN: Record<number, string> = {
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'd/m/yyyy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'd/m/yyyy h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
  49: '@',
};

const MON = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

const MONTH = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

const DAY = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'],
  DAYL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];

// Greek Windows settings: comma for decimals, dot for thousands
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * True when a number format code is a date/time format (it has a d, m, y, h or s outside quotes, escapes and brackets).
 */
export const isDateFmt = (code: string) =>
  /[dmyhs]/i.test(
    code
      .replace(/"[^"]*"/g, '')
      .replace(/\\./g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/General/i, ''),
  );

/** Excel "General" format for a number, in the Greek style (decimal comma, at most 10 significant digits). */
export function general(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
  let s =
    Math.abs(n) >= 1e11 || (Math.abs(n) < 1e-9 && n !== 0)
      ? n
          .toExponential(5)
          .replace(/\.?0+e/, 'E')
          .replace(/E\+?/, 'E+')
          .replace('E+-', 'E-')
      : String(+n.toPrecision(10));
  return s.replace('.', ',');
}

function fmtDate(n: number, code: string, y1904: boolean): string {
  const ms = Math.round(((y1904 ? n + 1462 : n) - 25569) * 86400000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return general(n);
  const ampm = /AM\/PM|A\/P/i.test(code);
  const parts =
    code
      .replace(/\[[^\]]*\]/g, '')
      .match(/"[^"]*"|\\.|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+|./gi) || [];
  const out: string[] = [];
  let prevH = false;
  parts.forEach((p, i) => {
    const l = p.toLowerCase();
    const H = d.getUTCHours();
    if (p.startsWith('"')) out.push(p.slice(1, -1));
    else if (p.startsWith('\\')) out.push(p.slice(1));
    else if (l === 'yyyy') out.push(String(d.getUTCFullYear()));
    else if (l === 'yy') out.push(String(d.getUTCFullYear()).slice(2));
    else if (l === 'mmmmm') out.push(MONTH[d.getUTCMonth()][0]);
    else if (l === 'mmmm') out.push(MONTH[d.getUTCMonth()]);
    else if (l === 'mmm') out.push(MON[d.getUTCMonth()]);
    else if (l === 'mm' || l === 'm') {
      // minutes if an hour precedes or seconds follow
      const next = parts.slice(i + 1).find((x) => /^[a-z]/i.test(x) && !/^(am\/pm|a\/p)$/i.test(x));
      const minute = prevH || (!!next && /^s/i.test(next));
      const v = minute ? d.getUTCMinutes() : d.getUTCMonth() + 1;
      out.push(l === 'mm' ? String(v).padStart(2, '0') : String(v));
    } else if (l === 'dddd') out.push(DAYL[d.getUTCDay()]);
    else if (l === 'ddd') out.push(DAY[d.getUTCDay()]);
    else if (l === 'dd') out.push(String(d.getUTCDate()).padStart(2, '0'));
    else if (l === 'd') out.push(String(d.getUTCDate()));
    else if (l === 'hh' || l === 'h') {
      const h = ampm ? H % 12 || 12 : H;
      out.push(l === 'hh' ? String(h).padStart(2, '0') : String(h));
    } else if (l === 'ss' || l === 's')
      out.push(l === 'ss' ? String(d.getUTCSeconds()).padStart(2, '0') : String(d.getUTCSeconds()));
    else if (l === 'am/pm') out.push(H < 12 ? 'πμ' : 'μμ');
    else if (l === 'a/p') out.push(H < 12 ? 'π' : 'μ');
    else if (p.startsWith('.0'))
      out.push(
        ',' +
          String(d.getUTCMilliseconds())
            .padStart(3, '0')
            .slice(0, p.length - 1),
      );
    else out.push(p);
    if (/^h/i.test(p)) prevH = true;
    else if (/^[a-z]/i.test(p) && !/^m/i.test(p)) prevH = false;
  });
  return out.join('');
}

function fmtNumber(n: number, code: string): string {
  const neg = n < 0;
  let x = Math.abs(n);
  let lit = '';
  const tokens = code.match(/"[^"]*"|\\.|_.|\*.|[0#?.,%Ee+\-]|./g) || [];
  const body = tokens.filter((t) => /^[0#?.,%]$/.test(t)).join('');
  const pct = (body.match(/%/g) || []).length;
  x *= Math.pow(100, pct);
  const dot = body.indexOf('.');
  const dec = dot < 0 ? 0 : (body.slice(dot + 1).match(/[0#?]/g) || []).length;
  const minDec = dot < 0 ? 0 : (body.slice(dot + 1).match(/0/g) || []).length;
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const thousands = /[0#?],[0#?]/.test(intPart);
  const scale = intPart.match(/,+$/)?.[0].length || 0;
  x /= Math.pow(1000, scale);
  let [ip, fp = ''] = x.toFixed(dec).split('.');
  fp = fp.replace(/0+$/, '');
  while (fp.length < minDec) fp += '0';
  const minInt = (intPart.match(/0/g) || []).length;
  if (ip === '0' && minInt === 0) ip = '';
  while (ip.length < minInt) ip = '0' + ip;
  if (thousands) ip = group(ip);
  const numStr = ip + (fp ? ',' + fp : '');
  let placed = false;
  for (const t of tokens) {
    if (/^[0#?.,%]$/.test(t)) {
      if (!placed) {
        lit += numStr;
        placed = true;
      }
      if (t === '%') lit += '%';
      continue;
    }
    if (t.startsWith('"')) lit += t.slice(1, -1);
    else if (t.startsWith('\\')) lit += t.slice(1);
    else if (t.startsWith('_')) lit += ' ';
    else if (t.startsWith('*')) continue;
    else lit += t;
  }
  if (!placed) lit += numStr;
  return (neg ? '-' : '') + lit;
}

/**
 * Shows a cell value the way Excel would with number format `fmtId` (custom codes in `codes`, 1900 or 1904 dates). Text
 * and booleans pass through; negative/zero sections, colours and currency brackets of the code are honoured.
 * @see test/datefmt.test.ts
 */
export function formatValue(v: unknown, fmtId: number, codes: Map<number, string>, y1904 = false): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  const raw = codes.get(fmtId) ?? BUILTIN[fmtId] ?? 'General';
  const secs = raw.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let code = secs[0];
  let n = v;
  if (v < 0 && secs.length > 1 && secs[1] !== '') {
    code = secs[1];
    n = -v;
  } else if (v === 0 && secs.length > 2 && secs[2] !== '') code = secs[2];
  code = code
    .replace(/\[(Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color\s*\d+|[<>=][^\]]*)\]/gi, '')
    .replace(/\[\$([^-\]]*)-[0-9A-F]+\]/gi, '$1')
    .trim();
  if (!code || /^General$/i.test(code)) return general(n === v ? v : -n);
  if (code === '@') return general(v);
  if (isDateFmt(code)) return fmtDate(v, code, y1904);
  const s = fmtNumber(n, code);
  return n !== v ? s.replace(/^-/, '') : s;
}
