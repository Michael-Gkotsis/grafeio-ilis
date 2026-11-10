// Types of the print preview window script (browser code).
//
// Purpose: the shapes the window script reads loosely from the app: the settings, the layout reply, the printer list.
// Does NOT: contain code, and does NOT run in Node: the script is bundled into windowScript.gen.ts and runs in the
//   print window only.
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the old script was untyped ES5; its loose reads (`r.ok`, `info.sheets`) are typed here once, with the types
//   the main side already owns (type-only imports are erased from the bundle).
// Covering test: test/print-window-gen.test.ts (bundle is fresh) and test/print-layout.test.ts.
import type { PrintOpts, PrintSort } from '../options';
import type { PrintInfo } from '../window';
import type { SortCol } from '../types';

/** The settings of the window (`window.printer.layout({ opts })`). */
export type Opts = PrintOpts;
/** One sort key of the settings column. */
export type SortKey = PrintSort;
/** The data of the settings column; `cols` is missing until the first layout reply when `data-init` has no `info`. */
export type Info = Omit<PrintInfo, 'cols'> & { cols?: SortCol[] };

/** The JSON in `<body data-init>`, written by `previewHtml`. Every field may be missing. */
export interface InitData {
  opts?: Opts;
  info?: Info;
  remember?: boolean;
  duplex?: boolean;
}

/** What `print:layout` answers: the page HTML and CSS, or `{ ok: false, error }`. */
export interface LayoutReply {
  ok: boolean;
  error?: string;
  css: string;
  html: string;
  info: Info;
}

/** One entry of `print:printers`. */
export interface PrinterEntry {
  name: string;
  label: string;
  def?: boolean;
}

/** What `print:go` and `print:pdf` answer. */
export interface JobReply {
  ok: boolean;
  error?: string;
  name?: string;
}
