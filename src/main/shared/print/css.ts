// CSS pieces of the print page: fonts and borders.
//
// Purpose: `fontCss` (one Excel font as CSS), `sideCss` (one border side) and the font stack table `FONT_FALLBACK`.
// Does NOT: decide which styles are used (draw.ts and render.ts collect them).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the page CSS must be safe against a hostile font name and look the same on a machine without Office fonts (Phase
//   4.8a, verbatim).
// Covering test: test/print-safety.test.ts (font names) and test/print.test.ts.
import type { Font, Side } from './styles';

/**
 * Font stacks of the common Office fonts with their free metric-compatible look-alikes (the machine may not have Office
 * fonts).
 */
const FONT_FALLBACK: Record<string, string> = {
  calibri: '"Calibri","Carlito",Arial,sans-serif',
  cambria: '"Cambria","Caladea",serif',
  arial: 'Arial,"Liberation Sans",sans-serif',
  'times new roman': '"Times New Roman","Liberation Serif",serif',
  'book antiqua': '"Book Antiqua","Palatino Linotype",Palatino,serif',
};

/**
 * The font CSS of an Excel font. The name comes from the file: only letters, numbers, spaces and `. , _ -` pass
 * (otherwise it could close the `<style>` and put its own script in the page).
 */
export function fontCss(f: Font): string {
  const name = f.name.replace(/[^\p{L}\p{N} _.,-]/gu, '').trim() || 'Calibri';
  const fam = FONT_FALLBACK[name.toLowerCase()] || `"${name}",${f.serif ? 'serif' : 'sans-serif'}`;
  return (
    `font:${f.i ? 'italic ' : ''}${f.b ? '700 ' : ''}${f.sz}pt ${fam};` +
    (f.color ? `color:${f.color};` : '') +
    (f.u || f.strike
      ? `text-decoration:${f.u ? 'underline' + (/double/.test(f.u) ? ' double' : '') : ''}${f.strike ? ' line-through' : ''};`
      : '')
  );
}

/** CSS `border-*` value of one side (`0` when it has none). */
export const sideCss = (s?: Side) => (s ? `${s.w}px ${s.style} ${s.color}` : '0');
