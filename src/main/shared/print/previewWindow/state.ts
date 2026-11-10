// Shared state and small helpers of the print preview window script.
//
// Purpose: the window's `window.printer` bridge, the DOM elements it uses, the one mutable state object (`st`) and the
//   text helpers (`fmt`, `plural`, `esc`, `say`).
// Does NOT: lay out pages (the app does, via `print:layout`) or register any listener.
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the old script kept all of this in one closure; the modules of the window now share it through `st`, which is
//   read at event time (never copied across an `await`), exactly like the closure variables were.
// Covering test: test/print-window-gen.test.ts and test/print-layout.test.ts.
import type { Printer } from '../../../../shared/ipc/print';
import type { Info, InitData, Opts } from './types';

/** The bridge from `src/preload/print.ts`. */
export const api = (window as unknown as { printer: Printer }).printer;

/** `document.getElementById`, typed. The ids come from `previewHtml`; a missing one fails at first use, as before. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const readInit = (): InitData => {
  try {
    return JSON.parse(document.body.getAttribute('data-init') || '{}') as InitData;
  } catch {
    return {};
  }
};
const init = readInit();

/** The mutable state of the window: settings, the layout info, the chosen sheets and the pending timers. */
export const st = {
  opts: init.opts || ({} as Opts),
  info: init.info || ({ sheets: [], all: [], total: 0 } as Info),
  remember: init.remember !== false,
  duplex: !!init.duplex,
  /** The sheets ticked in the top bar; `null` = the ones the app chose. */
  sel: null as string[] | null,
  /** Sequence guard: only the reply of the latest layout request is used. */
  seq: 0,
  timer: 0,
  slow: 0,
  /** CSS selector of the sort control that gets the focus after the next render. */
  want: null as string | null,
  /** The open column menu and the sort row it belongs to (`at` = -1: a new sort). */
  menuAt: null as { btn: HTMLElement; at: number } | null,
  /** Resolver of the «Γύρισε τα φύλλα» question while it is open. */
  flipNext: null as ((ok: boolean) => void) | null,
};

export const pagesEl = $('pages');
export const view = $('view');
export const msg = $('msg');
export const go = $<HTMLButtonElement>('go');
export const dlg = $<HTMLButtonElement>('dlg');
export const pdf = $<HTMLButtonElement>('pdf');
export const prn = $<HTMLSelectElement>('prn');
export const copies = $<HTMLInputElement>('copies');
export const menu = $('menu');

/** Points rounded to the half, with a decimal comma: `fmt(10.5)` = "10,5". */
export const fmt = (n: number): string => String(Math.round(n * 2) / 2).replace('.', ',');
/** `plural(2, 'φύλλο', 'φύλλα')` = "2 φύλλα". */
export const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many);
/** HTML-escapes a text for `innerHTML` and attribute values. */
export const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** True when the user clicked page breaks by hand (the settings are then in `opts.breaks`). */
export const hasBreaks = (): boolean => {
  const breaks = st.opts.breaks;
  return !!breaks && Object.keys(breaks).some((k) => breaks[k].length > 0);
};
/** The message line of the settings column; `ok` = green. */
export const say = (text?: string, ok?: boolean): void => {
  msg.textContent = text || '';
  msg.className = 'msg' + (ok ? ' ok' : '');
};
/** `[0, 1, ... n-1]`. */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
/** The preview pages (`.pg`) in document order. */
export const pages = (): HTMLElement[] => [...pagesEl.querySelectorAll<HTMLElement>('.pg')];
/** True when every sheet prints landscape (and there is at least one). */
export const allLandscape = (info: Info): boolean => info.sheets.length > 0 && info.sheets.every((s) => s.landscape);
