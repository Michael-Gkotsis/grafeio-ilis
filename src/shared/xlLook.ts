// Γράμματα και στοίχιση σε ό,τι φτιάχνει η εφαρμογή στο Excel (Michael, 20/10: Ρυθμίσεις › Γράμματα Excel). Προεπιλογή
// Arial 12, στο κέντρο οριζόντια και κάθετα. Μόνο γραμματοσειρές που ξέρει να μετρά το textfit.ts (για να μη κόβεται
// τίποτα, #88) και που υπάρχουν στα Windows 7.
export type XlH = 'left' | 'center' | 'right';
export type XlV = 'top' | 'center' | 'bottom';
// Κάθε κομμάτι με δικό του μέγεθος, έντονα, πλάγια και υπογράμμιση (Michael, 21/10: «ξεχωριστά για κεφαλίδες, υπογραφές
// και στήλες», «και bold επιλογή κτλπ»).
// Κενό = η προεπιλογή του κομματιού: τίτλος 2 μεγέθη πάνω από τις γραμμές, επικεφαλίδες όσο οι γραμμές, έντονα· η κεφαλίδα
// και οι υπογραφές όπως είναι στο έντυπο. Το μέγεθος των γραμμών του πίνακα είναι το sz.
export type XlPartKey = 'hdr' | 'title' | 'head' | 'data' | 'sig';
export interface XlPart { sz?: number; b?: boolean; i?: boolean; u?: boolean }
export const XL_STYLES = ['b', 'i', 'u'] as const;
export interface XlLook { font: string; sz: number; h: XlH; v: XlV; parts?: Partial<Record<XlPartKey, XlPart>> }
export const XL_LOOK: XlLook = { font: 'Arial', sz: 12, h: 'center', v: 'center' };
export const XL_FONTS = ['Arial', 'Calibri', 'Times New Roman'];
export const XL_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20];
export const XL_PARTS: XlPartKey[] = ['hdr', 'title', 'head', 'data', 'sig'];
const okSz = (n: unknown): n is number => typeof n === 'number' && n >= 6 && n <= 24;
export const XL_H: { value: XlH; label: string }[] = [{ value: 'left', label: 'Αριστερά' }, { value: 'center', label: 'Κέντρο' }, { value: 'right', label: 'Δεξιά' }];
export const XL_V: { value: XlV; label: string }[] = [{ value: 'top', label: 'Πάνω' }, { value: 'center', label: 'Μέση' }, { value: 'bottom', label: 'Κάτω' }];
// Οι ρυθμίσεις (ό,τι λείπει ή δεν είναι έγκυρο: η προεπιλογή)
export function xlLook(st: { xl?: Partial<XlLook> } | undefined): XlLook {
  const x = st?.xl || {};
  const parts: Partial<Record<XlPartKey, XlPart>> = {};
  for (const k of XL_PARTS) {
    const p = x.parts?.[k]; if (!p) continue;
    const q: XlPart = okSz(p.sz) && k !== 'data' ? { sz: p.sz } : {};
    for (const f of XL_STYLES) if (typeof p[f] === 'boolean') q[f] = p[f];
    if (Object.keys(q).length) parts[k] = q;
  }
  return {
    font: XL_FONTS.includes(x.font as string) ? x.font! : XL_LOOK.font,
    sz: okSz(x.sz) ? x.sz : XL_LOOK.sz,
    h: XL_H.some(o => o.value === x.h) ? x.h! : XL_LOOK.h,
    v: XL_V.some(o => o.value === x.v) ? x.v! : XL_LOOK.v,
    ...(Object.keys(parts).length ? { parts } : {})
  };
}
const partKey = (L: XlLook) => JSON.stringify(XL_PARTS.map(k => { const p = L.parts?.[k] || {}; return [p.sz, p.b, p.i, p.u]; }));
export const sameLook = (a: XlLook, b: XlLook) => a.font === b.font && a.sz === b.sz && a.h === b.h && a.v === b.v && partKey(a) === partKey(b);
// Γράμματα των κομματιών ενός πίνακα που φτιάχνει η εφαρμογή: τίτλος και επικεφαλίδες έντονα, τίποτα πλάγιο ή υπογραμμισμένο
// (base: το μέγεθος των γραμμών, αν δεν είναι το sz· def: άλλες προεπιλογές, π.χ. ο τίτλος των Εντύπων υπογραμμισμένος)
export function tablePart(L: XlLook, k: 'title' | 'head' | 'data', base = L.sz, def: XlPart = {}): Required<XlPart> {
  const p = L.parts?.[k] || {};
  return { sz: p.sz ?? (k === 'title' ? base + 2 : base), b: p.b ?? def.b ?? k !== 'data', i: p.i ?? def.i ?? false, u: p.u ?? def.u ?? false };
}
// Κεφαλίδα και υπογραφές των εντύπων: μόνο ό,τι άλλαξες (null: όπως είναι στο έντυπο)
export const formPart = (L: XlLook, k: 'hdr' | 'sig'): XlPart | null => L.parts?.[k] || null;
