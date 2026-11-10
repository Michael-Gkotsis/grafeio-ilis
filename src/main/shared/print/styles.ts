// Cell styles of the print engine (`styles.xml`).
//
// Purpose: the types `Font`, `Side`, `Xf`, `Styles` and `parseStyles` (fonts, fills, borders, cell formats), with the
//   tables `BORDER`, `DENSITY` and `mix`.
// Does NOT: format numbers (numfmt.ts) or turn styles into CSS (css.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the sheet geometry and the page drawing both need the parsed styles; kept as one owner file (Phase 4.8a,
//   verbatim).
// Covering test: test/print.test.ts (borders, fills and fonts of rendered pages).
import { color } from './colors';
import { attr, block, items, num, on } from './xml';

/** A font of `styles.xml`, reduced to what the print page needs (`sz` in pt, `serif` from `<family val="1">`). */
export interface Font {
  name: string;
  sz: number;
  b: boolean;
  i: boolean;
  u: string | null;
  strike: boolean;
  color: string | null;
  serif: boolean;
}

/** One border side: width in px, CSS line style and colour. */
export interface Side {
  w: number;
  style: string;
  color: string;
}

/** A cell format (`<xf>`): font index, fill colour, border sides, number format id and alignment. */
export interface Xf {
  font: number;
  fill: string | null;
  border: { l?: Side; r?: Side; t?: Side; b?: Side };
  fmt: number;
  h: string;
  v: string;
  wrap: boolean;
  indent: number;
  rot: number;
}

/** Parsed `styles.xml`: fonts, cell formats and the custom number format codes by id. */
export interface Styles {
  fonts: Font[];
  xfs: Xf[];
  codes: Map<number, string>;
}

const BORDER: Record<string, [number, string]> = {
  thin: [1, 'solid'],
  hair: [1, 'dotted'],
  dotted: [1, 'dotted'],
  dashed: [1, 'dashed'],
  dashDot: [1, 'dashed'],
  dashDotDot: [1, 'dashed'],
  medium: [2, 'solid'],
  mediumDashed: [2, 'dashed'],
  mediumDashDot: [2, 'dashed'],
  mediumDashDotDot: [2, 'dashed'],
  slantDashDot: [2, 'dashed'],
  thick: [3, 'solid'],
  double: [3, 'double'],
};

const DENSITY: Record<string, number> = {
  darkGray: 0.75,
  mediumGray: 0.5,
  lightGray: 0.25,
  gray125: 0.125,
  gray0625: 0.0625,
};

const mix = (a: string, b: string, k: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/**
 * Parses `styles.xml` (`theme` = the theme colours): fonts, fills (patterns are mixed into one colour), borders and
 * cell formats.
 */
export function parseStyles(xml: string, theme: string[]): Styles {
  const codes = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) codes.set(num(m[0], 'numFmtId', 0), attr(m[0], 'formatCode') || '');
  const fonts = items(block(xml, 'fonts'), 'font').map((f): Font => {
    const u = /<u\b([^>]*)\/?>/.exec(f);
    return {
      name: attr(/<name\b[^>]*>/.exec(f)?.[0] || '', 'val') || 'Calibri',
      sz: num(/<sz\b[^>]*>/.exec(f)?.[0] || '', 'val', 11),
      b: on(f, 'b'),
      i: on(f, 'i'),
      u: u ? attr(u[1], 'val') || 'single' : null,
      strike: on(f, 'strike'),
      color: color(/<color\b[^>]*>/.exec(f)?.[0], theme),
      serif: attr(/<family\b[^>]*>/.exec(f)?.[0] || '', 'val') === '1',
    };
  });
  const fills = items(block(xml, 'fills'), 'fill').map((f) => {
    const p = /<patternFill\b([^>]*)>?/.exec(f);
    const type = p ? attr(p[1], 'patternType') || 'none' : 'none';
    if (/<gradientFill/.test(f)) return color(/<color\b[^>]*>/.exec(f)?.[0], theme);
    if (type === 'none') return null;
    const fg = color(/<fgColor\b[^>]*>/.exec(f)?.[0], theme) || '#000000';
    if (type === 'solid') return fg;
    const bg = color(/<bgColor\b[^>]*>/.exec(f)?.[0], theme) || '#FFFFFF';
    return mix(fg, bg, DENSITY[type] ?? 0.5);
  });
  const borders = items(block(xml, 'borders'), 'border').map((b) => {
    const side = (n: string): Side | undefined => {
      const m = new RegExp('<' + n + '\\b([^>]*?)(?:/>|>([\\s\\S]*?)</' + n + '>)').exec(b);
      const st = m && attr(m[1], 'style');
      if (!st || st === 'none' || !BORDER[st]) return undefined;
      return {
        w: BORDER[st][0],
        style: BORDER[st][1],
        color: color(/<color\b[^>]*>/.exec(m[2] || '')?.[0], theme) || (st === 'hair' ? '#808080' : '#000000'),
      };
    };
    return { l: side('left') || side('start'), r: side('right') || side('end'), t: side('top'), b: side('bottom') };
  });
  const xfs = items(block(xml, 'cellXfs'), 'xf').map((x): Xf => {
    const head = x.slice(0, x.indexOf('>') + 1);
    const al = /<alignment\b[^>]*>/.exec(x)?.[0] || '';
    return {
      font: num(head, 'fontId', 0),
      fill: fills[num(head, 'fillId', 0)] ?? null,
      border: borders[num(head, 'borderId', 0)] || {},
      fmt: num(head, 'numFmtId', 0),
      h: attr(al, 'horizontal') || 'general',
      v: attr(al, 'vertical') || 'bottom',
      wrap: attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true',
      indent: num(al, 'indent', 0),
      rot: num(al, 'textRotation', 0),
    };
  });
  if (!fonts.length)
    fonts.push({ name: 'Calibri', sz: 11, b: false, i: false, u: null, strike: false, color: null, serif: false });
  if (!xfs.length)
    xfs.push({ font: 0, fill: null, border: {}, fmt: 0, h: 'general', v: 'bottom', wrap: false, indent: 0, rot: 0 });
  return { fonts, xfs, codes };
}
