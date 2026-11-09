// Small document-related settings types: current ΕΣΣΟ, signatures, paper layout moves, the prevented-calendar settings
// and the «Ημερήσια Διαταγή» document.
//
// Purpose: `Esso`, `Sig`/`SigForm`, `Move`/`Moves`/`Layout`/`LayoutForm`, `ImerSettings` (+ parts), `HdDoc`.
// Does NOT: parse ΕΣΣΟ text, choose signatures, apply moves or build the order (src/shared/esso.ts, sigs.ts, layout.ts,
//   imer.ts, hd.ts keep the functions and re-export these types).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: Settings and AppState hold these shapes; defining them below both removes their import of the feature modules.
// Covering tests: test/esso.test.ts, test/sigs.test.ts, test/imer.test.ts, test/hd.test.ts.
import type { ISODate } from '../lib/dates';

export type EssoSeries = 'Α' | 'Β' | 'Γ' | 'Δ';
// from: when it started in the app («Νέα ΕΣΣΟ»)
export interface Esso {
  s: EssoSeries;
  y: number;
  from?: ISODate;
}
// art: the word above («Ο», «Η», «ΤΟ» or empty) · title: the post («ΑΛΧΙΑΣ ΙΛΗΣ») · name: name under the signature
// (optional)
export interface Sig {
  art: string;
  title: string;
  name?: string;
}
export type SigForm = 'hkai' | 'froura' | 'outs' | 'check' | 'roster' | 'cadre' | 'weapons' | 'imer' | 'hd' | 'reports';
export type Move = [number, number]; // [rows down, columns right]; negative = up, left
export type Moves = Record<string, Move>; // per part: 'head', 'date', 'title', 's0', 's1', …
// Every form except «Έντυπα» (there the positions are per form, Report.layout)
export type LayoutForm = Exclude<SigForm, 'reports'>;
export type Layout = Record<string, Moves>; // per sheet (key)
export type Count = 'P' | 'A';
export type ImerTitle = 'imer' | 'ekp';
export type ImerSheets = 'unit' | 'all' | 'both';
export interface ImerCodeSet {
  code?: string;
  count?: Count;
}
export interface ImerSettings {
  title?: ImerTitle;
  sheets?: ImerSheets;
  codes?: Record<string, ImerCodeSet>;
}
// ax: officers' changes 1–5, op: enlisted changes 1–5 (text lines); the 3 of the officers and the 1–4 of the enlisted
// come from the data
export interface HdDoc {
  aydm: string;
  dn: string;
  ilxos: string;
  ax: string[][];
  op: string[][];
  t2: string;
  t3: string;
}
