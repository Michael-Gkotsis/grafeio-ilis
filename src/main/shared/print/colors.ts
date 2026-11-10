// Colours of the print engine: indexed palette, tint and theme.
//
// Purpose: `<color>` tags to `#RRGGBB` (`color`), the theme colour list (`themeColors`), the legacy palette `INDEXED`
//   and `tint`.
// Does NOT: read styles.xml (styles.ts does).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: colours are needed by the fonts, fills and borders; one owner file keeps the palette table in one place (Phase
//   4.8a).
// Covering test: test/print.test.ts (colours of the rendered cells).
import { attr, block, num } from './xml';

/** The 64 colours of the legacy `indexed` palette of Excel (RRGGBB, no `#`). */
const INDEXED = [
  '000000',
  'FFFFFF',
  'FF0000',
  '00FF00',
  '0000FF',
  'FFFF00',
  'FF00FF',
  '00FFFF',
  '000000',
  'FFFFFF',
  'FF0000',
  '00FF00',
  '0000FF',
  'FFFF00',
  'FF00FF',
  '00FFFF',
  '800000',
  '008000',
  '000080',
  '808000',
  '800080',
  '008080',
  'C0C0C0',
  '808080',
  '9999FF',
  '993366',
  'FFFFCC',
  'CCFFFF',
  '660066',
  'FF8080',
  '0066CC',
  'CCCCFF',
  '000080',
  'FF00FF',
  'FFFF00',
  '00FFFF',
  '800080',
  '800000',
  '008080',
  '0000FF',
  '00CCFF',
  'CCFFFF',
  'CCFFCC',
  'FFFF99',
  '99CCFF',
  'FF99CC',
  'CC99FF',
  'FFCC99',
  '3366FF',
  '33CCCC',
  '99CC00',
  'FFCC00',
  'FF9900',
  'FF6600',
  '666699',
  '969696',
  '003366',
  '339966',
  '003300',
  '333300',
  '993300',
  '993366',
  '333399',
  '333333',
  '000000',
  'FFFFFF',
];

/**
 * Lightens (t > 0) or darkens (t < 0) an `RRGGBB` colour the way Excel applies `tint`, by working on its HSL lightness.
 */
function tint(hex: string, t: number): string {
  if (!t) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  let h = 0,
    s = 0;
  let l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const f = (p: number, q: number, x: number) => {
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const out = s === 0 ? [l, l, l] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return out
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}

/** Reads a `<color rgb|theme|indexed|auto .../>` tag into `#RRGGBB`; null means the default colour. */
export function color(tag: string | undefined, theme: string[]): string | null {
  if (!tag || attr(tag, 'auto') === '1') return null;
  let hex: string | null = null;
  const rgb = attr(tag, 'rgb'),
    th = attr(tag, 'theme'),
    ix = attr(tag, 'indexed');
  if (rgb) hex = rgb.slice(-6);
  else if (th != null) hex = theme[+th] || null;
  else if (ix != null) hex = INDEXED[+ix] || null;
  if (!hex) return null;
  return '#' + tint(hex.toUpperCase(), num(tag, 'tint', 0));
}

/**
 * The 12 theme colours of `theme1.xml` as `RRGGBB`, in the order Excel numbers them (`theme="n"` indexes this list).
 */
export function themeColors(xml: string): string[] {
  const sch = block(xml, 'a:clrScheme');
  const get = (n: string) => {
    const b = block(sch, 'a:' + n);
    return attr(b, 'lastClr') || attr(b, 'val') || '000000';
  };
  // Excel's order: lt1, dk1, lt2, dk2, accent1...6, hlink, folHlink
  return [
    'lt1',
    'dk1',
    'lt2',
    'dk2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink',
  ]
    .map(get)
    .map((x) => (/^[0-9a-f]{6}$/i.test(x) ? x : x === 'window' ? 'FFFFFF' : '000000'));
}
