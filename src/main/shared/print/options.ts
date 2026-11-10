// The options of the "Εκτύπωση" window and of one render.
//
// Purpose: the types `RenderOpts`, `PrintOpts`, `PrintSort`, the defaults `PRINT_DEFAULT`, `cleanOpts` (checks what
//   comes from IPC or saved settings), `rememberedSheets`, `hasBreaks`, `printKey` and `printDefaults`.
// Does NOT: plan pages (planFit.ts) or build the window (window.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the settings are saved per form and travel through IPC, so every field is checked in one place. `RenderOpts`
//   lives here so that render.ts and draw.ts do not import each other (Phase 4.8a, verbatim).
// Covering test: test/print-layout.test.ts and test/print-sheets.test.ts.
import { sortKey } from './sortKey';

/**
 * `refs`: every cell carries `data-a="B4"` (preview of the forms, where a cell is picked with a click). `maxPages`:
 * only the first pages. `layout`: the layout of the "Εκτύπωση" window (pages, orientation, margins...) instead of the
 * page setup of the file.
 */
export interface RenderOpts {
  file: string;
  sheets?: string[];
  refs?: boolean;
  maxPages?: number;
  layout?: PrintOpts;
}

/**
 * The options of the "Εκτύπωση" window: always all columns across the page width, and the rows in as many pages as the
 * user chose, with the biggest letters that fit. The same scale on all pages of a sheet (and, with `same`, on all
 * sheets), so e.g. Arial 12 comes out the same size on page 1 and 2, front and back.
 * @decision Michael 20/10: all columns always fit the page width; only the rows take the pages the user chose.
 */
export interface PrintOpts {
  pages: number | 'auto'; // pages per sheet; 'auto' = as many as needed with letters of `size` pt
  size: number;
  or: 'auto' | 'p' | 'l';
  paper: 'A4' | 'A3';
  m: 'narrow' | 'normal' | 'wide';
  sp: 'top' | 'center' | 'fill'; // what is left at the bottom: on top, centred, taller rows
  stretch: boolean; // few columns are widened up to the page width
  repeat: boolean; // the title rows (Print_Titles) on every page
  keep: boolean; // a block (room, table) is not cut in the middle
  pno: boolean; // "Σελίδα 1 από 2" at the bottom, when there is more than one page
  side: 'new' | 'back'; // the next page on the back side or on a new sheet
  same: boolean; // the same letters on all sheets of the Excel
  breaks?: Record<string, number[]>; // per sheet: the Excel rows where a new page starts (click in the preview)
  sort?: PrintSort[]; // sorting of the rows of every table: 1st, 2nd, 3rd column
  sheets?: string[]; // the sheets chosen in the preview, remembered per form (rememberedSheets)
}

/** `c`: the column heading as a key (sortKey), `l`: as written, `d`: descending (Ω→Α, 9→1, lower ranks first). */
export interface PrintSort {
  c: string;
  l?: string;
  d?: boolean;
}

/** The settings of the window when nothing was saved: 1 page, 12 pt, A4, normal margins. */
export const PRINT_DEFAULT: PrintOpts = {
  pages: 1,
  size: 12,
  or: 'auto',
  paper: 'A4',
  m: 'normal',
  sp: 'top',
  stretch: true,
  repeat: true,
  keep: true,
  pno: true,
  side: 'new',
  same: true,
};

/** Print margins of the window in cm: narrow, normal and wide. */
export const MARGIN = { narrow: 0.5, normal: 1.2, wide: 2.5 }; // cm

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/**
 * What comes from the window (IPC) or from the saved settings, cleaned: every field is checked and clamped, missing
 * ones come from `base`.
 */
export function cleanOpts(x: unknown, base: PrintOpts = PRINT_DEFAULT): PrintOpts {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bool = (k: keyof PrintOpts) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (base[k] as boolean));
  const pages =
    o.pages === 'auto'
      ? 'auto'
      : Number.isInteger(o.pages) && (o.pages as number) >= 1 && (o.pages as number) <= 20
        ? (o.pages as number)
        : base.pages;
  const size = typeof o.size === 'number' && o.size >= 5 && o.size <= 24 ? Math.round(o.size * 2) / 2 : base.size;
  let breaks: Record<string, number[]> | undefined;
  if (o.breaks && typeof o.breaks === 'object') {
    breaks = {};
    for (const [k, v] of Object.entries(o.breaks as Record<string, unknown>).slice(0, 50))
      if (Array.isArray(v))
        breaks[String(k)] = [...new Set(v.filter((n) => Number.isInteger(n) && n > 0 && n < 1048577) as number[])]
          .sort((a, b) => a - b)
          .slice(0, 500);
  }
  const sort = Array.isArray(o.sort) ? o.sort : base.sort;
  const sorts: PrintSort[] = [];
  for (const x of (sort || []).slice(0, 3)) {
    if (!x || typeof x !== 'object') continue;
    const c = sortKey(String((x as PrintSort).c ?? '')).slice(0, 60);
    if (!c || sorts.some((y) => y.c === c)) continue;
    const l = typeof (x as PrintSort).l === 'string' ? (x as PrintSort).l!.slice(0, 60) : '';
    sorts.push({ c, ...(l ? { l } : {}), ...((x as PrintSort).d === true ? { d: true } : {}) });
  }
  const sheets = Array.isArray(o.sheets)
    ? o.sheets
        .filter((n): n is string => typeof n === 'string' && !!n)
        .map((n) => n.slice(0, 40))
        .slice(0, 50)
    : undefined;
  return {
    pages,
    size,
    or: pick(o.or, ['auto', 'p', 'l'] as const, base.or),
    paper: pick(o.paper, ['A4', 'A3'] as const, base.paper),
    m: pick(o.m, ['narrow', 'normal', 'wide'] as const, base.m),
    sp: pick(o.sp, ['top', 'center', 'fill'] as const, base.sp),
    stretch: bool('stretch'),
    repeat: bool('repeat'),
    keep: bool('keep'),
    pno: bool('pno'),
    side: pick(o.side, ['new', 'back'] as const, base.side),
    same: bool('same'),
    ...(breaks ? { breaks } : {}),
    ...(sorts.length ? { sort: sorts } : {}),
    ...(sheets?.length ? { sheets } : {}),
  };
}

/**
 * The sheets chosen last time (e.g. "only ΕΞΟΔΟΥΧΟΙ"); if even one is missing from the file, the initial choice applies
 * (undefined).
 */
export function rememberedSheets(saved: string[] | undefined, visible: string[]): string[] | undefined {
  if (!saved?.length || !saved.every((n) => visible.includes(n))) return undefined;
  return visible.filter((n) => saved.includes(n));
}

/** True when the user set manual page breaks (clicks in the preview) on any sheet. */
export const hasBreaks = (o: PrintOpts) => !!o.breaks && Object.values(o.breaks).some((b) => b.length);

/** The Greek month names in capitals, removed from a form file name by `printKey`. */
const GR_MONTHS =
  /(ΙΑΝΟΥΑΡΙΟΣ|ΦΕΒΡΟΥΑΡΙΟΣ|ΜΑΡΤΙΟΣ|ΑΠΡΙΛΙΟΣ|ΜΑΙΟΣ|ΙΟΥΝΙΟΣ|ΙΟΥΛΙΟΣ|ΑΥΓΟΥΣΤΟΣ|ΣΕΠΤΕΜΒΡΙΟΣ|ΟΚΤΩΒΡΙΟΣ|ΝΟΕΜΒΡΙΟΣ|ΔΕΚΕΜΒΡΙΟΣ)/g;

/**
 * The key of the print settings of a form: the file name without dates, numbers and extension ("ΗΚΑΙ 2Η ΕΠΧΙΑ
 * 21.10.26.xlsx" and "… 22.10.26.xlsx" give the same key), so the same form remembers its settings every day.
 */
export function printKey(file: string): string {
  const base = file.split(/[\\/]/).pop() || file;
  const k = base
    .replace(/\.xls[xm]?$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(GR_MONTHS, ' ')
    .replace(/\d{1,4}([-./]\d{1,4})+/g, ' ')
    .replace(/\(\d+\)/g, ' ')
    .replace(/\b(ΕΩΣ)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[-_.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return k.slice(0, 80) || 'ΑΡΧΕΙΟ';
}

/**
 * Initial settings per form: ΗΚΑΙ front and back, narrow margins, centred; ΦΡΟΥΡΑ narrow (the template had zero
 * margins).
 */
export function printDefaults(key: string, sheets: string[]): PrintOpts {
  const low = sheets.map((s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (low.includes('μπροστινο') && low.includes('πισω'))
    return { ...PRINT_DEFAULT, side: 'back', m: 'narrow', sp: 'center', pno: false };
  if (/^ΦΡΟΥΡΑ/.test(key)) return { ...PRINT_DEFAULT, m: 'narrow' };
  return { ...PRINT_DEFAULT };
}
