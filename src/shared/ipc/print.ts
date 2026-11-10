// The IPC contract of the print window (`window.printer`): its channels, argument counts and the `Printer` type.
//
// Purpose: `PRINT` (renderer of the print window -> main) as one table, and the `Printer` interface it must match.
// Does NOT: contain the print logic (src/main/print.ts) or the pagination; it only names the 7 `print:*` channels.
// Owner layer: shared/ipc (architecture). The print window markup itself is UI work.
// Why: src/preload/print.ts and the handlers in main used to repeat the channel strings by hand.
// Covering test: test/ipc-contract.test.ts.
import type { InvokeSpec } from './spec';

/** Options of one print job, as the print window sends them. */
export interface PrintJob {
  landscape: boolean;
  pageSize: string;
  part: string;
  device?: string;
  copies?: number;
  duplex?: string;
}
/** Request to lay a form out (and optionally save the layout). */
export interface PrintLayoutReq {
  opts: unknown;
  sheets: string[] | null;
  save: boolean;
}
/** What the print window sees as `window.printer`. Results are untyped on purpose: the page script reads them loosely. */
export interface Printer {
  print(job: PrintJob): Promise<unknown>;
  printers(): Promise<unknown>;
  layout(req: PrintLayoutReq): Promise<unknown>;
  forget(): Promise<unknown>;
  duplex(on: boolean): Promise<unknown>;
  pdf(): Promise<unknown>;
  close(): Promise<unknown>;
}
/** Method names of `Printer`. */
export type PrintMethod = keyof Printer;

/** Shape of one PRINT entry: `n` is the exact parameter count of the method. */
export interface PrintEntry<K extends PrintMethod> extends InvokeSpec {
  readonly n: Required<Parameters<Printer[K]>>['length'];
}

/** Print window -> main. Key = method of `Printer`; `channel` = the string on the wire. */
export const PRINT = {
  print: { channel: 'print:go', n: 1 },
  printers: { channel: 'print:printers', n: 0 },
  layout: { channel: 'print:layout', n: 1 },
  forget: { channel: 'print:forget', n: 0 },
  duplex: { channel: 'print:duplex', n: 1 },
  pdf: { channel: 'print:pdf', n: 0 },
  close: { channel: 'print:close', n: 0 },
} as const satisfies { readonly [K in PrintMethod]: PrintEntry<K> };
