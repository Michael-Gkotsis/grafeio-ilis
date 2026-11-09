// Excel font and alignment settings: the shape of Settings.xl and the helpers that read it.
//
// Purpose: defaults, allowed fonts and sizes, per-part overrides (header, title, headings, rows, signatures).
// Does NOT: measure text (src/main/textfit.ts) or write any Excel (src/main/xlsx.ts).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: a setting that every Excel and print writer reads must be one pure function of Settings.
// Covering test: test/xl-look.test.ts.
// Fonts and alignment of everything the app writes into Excel (Michael, 20/10: Settings › «Γράμματα Excel»). Default
// Arial 12, centred horizontally and vertically. Only fonts that textfit.ts can measure (so nothing is cut off, #88)
// and that exist on Windows 7.
export type XlH = 'left' | 'center' | 'right';
export type XlV = 'top' | 'center' | 'bottom';
// Each part has its own size, bold, italic and underline (Michael, 21/10: «ξεχωριστά για κεφαλίδες, υπογραφές
// και στήλες», «και bold επιλογή κτλπ»).
// Empty = the part's default: title 2 sizes above the rows, headings as large as the rows, bold; the header
// and the signatures as in the form. The size of the table rows is sz.
export type XlPartKey = 'hdr' | 'title' | 'head' | 'data' | 'sig';
export interface XlPart {
  sz?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}
export const XL_STYLES = ['b', 'i', 'u'] as const;
export interface XlLook {
  font: string;
  sz: number;
  h: XlH;
  v: XlV;
  parts?: Partial<Record<XlPartKey, XlPart>>;
}
export const XL_LOOK: XlLook = { font: 'Arial', sz: 12, h: 'center', v: 'center' };
export const XL_FONTS = ['Arial', 'Calibri', 'Times New Roman'];
export const XL_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20];
export const XL_PARTS: XlPartKey[] = ['hdr', 'title', 'head', 'data', 'sig'];
const okSz = (n: unknown): n is number => typeof n === 'number' && n >= 6 && n <= 24;
export const XL_H: { value: XlH; label: string }[] = [
  { value: 'left', label: 'Αριστερά' },
  { value: 'center', label: 'Κέντρο' },
  { value: 'right', label: 'Δεξιά' },
];
export const XL_V: { value: XlV; label: string }[] = [
  { value: 'top', label: 'Πάνω' },
  { value: 'center', label: 'Μέση' },
  { value: 'bottom', label: 'Κάτω' },
];
/** The effective look from settings; whatever is missing or invalid falls back to the default. */
export function xlLook(st: { xl?: Partial<XlLook> } | undefined): XlLook {
  const x = st?.xl || {};
  const parts: Partial<Record<XlPartKey, XlPart>> = {};
  for (const k of XL_PARTS) {
    const p = x.parts?.[k];
    if (!p) continue;
    const q: XlPart = okSz(p.sz) && k !== 'data' ? { sz: p.sz } : {};
    for (const f of XL_STYLES) if (typeof p[f] === 'boolean') q[f] = p[f];
    if (Object.keys(q).length) parts[k] = q;
  }
  return {
    font: XL_FONTS.includes(x.font as string) ? x.font! : XL_LOOK.font,
    sz: okSz(x.sz) ? x.sz : XL_LOOK.sz,
    h: XL_H.some((o) => o.value === x.h) ? x.h! : XL_LOOK.h,
    v: XL_V.some((o) => o.value === x.v) ? x.v! : XL_LOOK.v,
    ...(Object.keys(parts).length ? { parts } : {}),
  };
}
const partKey = (L: XlLook) =>
  JSON.stringify(
    XL_PARTS.map((k) => {
      const p = L.parts?.[k] || {};
      return [p.sz, p.b, p.i, p.u];
    }),
  );
export const sameLook = (a: XlLook, b: XlLook) =>
  a.font === b.font && a.sz === b.sz && a.h === b.h && a.v === b.v && partKey(a) === partKey(b);
/**
 * Fonts of the parts of a table the app builds: title and headings bold, nothing italic or underlined.
 * base: the row size when it is not sz. def: other defaults, e.g. the «Έντυπα» title underlined.
 */
export function tablePart(L: XlLook, k: 'title' | 'head' | 'data', base = L.sz, def: XlPart = {}): Required<XlPart> {
  const p = L.parts?.[k] || {};
  return {
    sz: p.sz ?? (k === 'title' ? base + 2 : base),
    b: p.b ?? def.b ?? k !== 'data',
    i: p.i ?? def.i ?? false,
    u: p.u ?? def.u ?? false,
  };
}
/** Header and signatures of the forms: only what the user changed (null: as in the form). */
export const formPart = (L: XlLook, k: 'hdr' | 'sig'): XlPart | null => L.parts?.[k] || null;
