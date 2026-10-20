// Γράμματα και στοίχιση σε ό,τι φτιάχνει η εφαρμογή στο Excel (Michael, 20/10: Ρυθμίσεις › Γράμματα Excel). Προεπιλογή
// Arial 12, στο κέντρο οριζόντια και κάθετα. Μόνο γραμματοσειρές που ξέρει να μετρά το textfit.ts (για να μη κόβεται
// τίποτα, #88) και που υπάρχουν στα Windows 7.
export type XlH = 'left' | 'center' | 'right';
export type XlV = 'top' | 'center' | 'bottom';
export interface XlLook { font: string; sz: number; h: XlH; v: XlV }
export const XL_LOOK: XlLook = { font: 'Arial', sz: 12, h: 'center', v: 'center' };
export const XL_FONTS = ['Arial', 'Calibri', 'Times New Roman'];
export const XL_SIZES = [8, 9, 10, 11, 12, 13, 14, 16];
export const XL_H: { value: XlH; label: string }[] = [{ value: 'left', label: 'Αριστερά' }, { value: 'center', label: 'Κέντρο' }, { value: 'right', label: 'Δεξιά' }];
export const XL_V: { value: XlV; label: string }[] = [{ value: 'top', label: 'Πάνω' }, { value: 'center', label: 'Μέση' }, { value: 'bottom', label: 'Κάτω' }];
// Οι ρυθμίσεις (ό,τι λείπει ή δεν είναι έγκυρο: η προεπιλογή)
export function xlLook(st: { xl?: Partial<XlLook> } | undefined): XlLook {
  const x = st?.xl || {};
  return {
    font: XL_FONTS.includes(x.font as string) ? x.font! : XL_LOOK.font,
    sz: typeof x.sz === 'number' && x.sz >= 6 && x.sz <= 24 ? x.sz : XL_LOOK.sz,
    h: XL_H.some(o => o.value === x.h) ? x.h! : XL_LOOK.h,
    v: XL_V.some(o => o.value === x.v) ? x.v! : XL_LOOK.v
  };
}
export const sameLook = (a: XlLook, b: XlLook) => a.font === b.font && a.sz === b.sz && a.h === b.h && a.v === b.v;
