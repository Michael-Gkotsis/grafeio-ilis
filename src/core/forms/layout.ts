// Positions on the paper. @decision Michael 20/10: the signatures, the header and the place/date go where you drag
// them.
//
// Purpose: the sheets of each form that can be dragged (`LAYOUT_SHEETS`), the paper blocks (`Block`, `LayoutSheet`),
//   their labels and the cleaning of saved moves (`cleanLayout`, `dropSigMoves`).
// Does NOT: apply a move to a file (src/main/exports.ts does) or hold the move types (core/model/documents.ts does;
//   they are re-exported here).
// Owner layer: core/forms (pure: no fs, no Electron, no React); imports core/model, core/forms/sigs.
// Why: what is kept is how far each block moved from its place on the form (rows down, columns right), not the cell,
//   so it stays right when the form gets longer (e.g. more outs push the signatures further down).
// Covering tests: test/layout.test.ts, test/layout-fit.test.ts.
import type { Sig } from './sigs';
import type { Move, Layout, LayoutForm } from '../model/documents';
export type { Layout, LayoutForm, Moves, Move } from '../model/documents';

/**
 * The sheets of each form, each with its own positions. Sheets of the same shape (one per filter) share one `key`,
 * and whatever is moved goes to all of them.
 */
export const LAYOUT_SHEETS: Record<LayoutForm, { key: string; label: string }[]> = {
  hkai: [
    { key: 'front', label: 'Μπροστινό' },
    { key: 'back', label: 'Πίσω' },
  ],
  froura: [{ key: 'main', label: 'ΦΡΟΥΡΑ' }],
  outs: [
    { key: 'outs', label: 'Εξοδούχοι' },
    { key: 'stay', label: 'Παραμένοντες / Δύναμη' },
  ],
  check: [{ key: 'main', label: 'Έλεγχος υπηρεσιών' }],
  roster: [
    { key: 'print', label: 'Συνολικό (εκτύπωση)' },
    { key: 'lists', label: 'Φύλλα του Excel' },
  ],
  cadre: [{ key: 'main', label: 'Στελέχη' }],
  weapons: [
    { key: 'main', label: 'Κατάσταση οπλισμού' },
    { key: 'rest', label: 'Τα άλλα φύλλα' },
  ],
  imer: [{ key: 'main', label: 'Ημερολόγιο κωλυομένων' }],
  hd: [{ key: 'main', label: 'Ημερήσια Διαταγή' }],
};

/** One piece of the paper: rows `r1`..`r2`, columns `c1`..`c2` (both counted from 1). */
export interface Block {
  id: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}
/** The blocks of one sheet as they came out, for moving them with the mouse. */
export interface LayoutSheet {
  key: string;
  sheet: string;
  blocks: Block[];
}

/** The label of a block id: `head`, `date`, `title` or `s<n>` (signature n+1, with its post when known). */
export const blockLabel = (id: string, sigs?: Sig[]) => {
  if (id === 'head') return 'Κεφαλίδα';
  if (id === 'date') return 'Τόπος και ημερομηνία';
  if (id === 'title') return 'Τίτλος';
  const i = Number(id.slice(1));
  const x = sigs?.[i];
  return 'Υπογραφή ' + (i + 1) + (x?.title ? ': ' + x.title : '');
};
/** True when a move is not (0, 0). */
export const moved = (m?: Move) => !!m && (m[0] !== 0 || m[1] !== 0);
/** Without zero moves and empty sheets (for saving); `undefined` when nothing is left. */
export function cleanLayout(l: Layout): Layout | undefined {
  const out: Layout = {};
  for (const [k, ms] of Object.entries(l || {})) {
    const x = Object.fromEntries(Object.entries(ms || {}).filter(([, m]) => moved(m)));
    if (Object.keys(x).length) out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}
/** The number of signatures changed: their old positions no longer fit (the header and the date stay). */
export function dropSigMoves(l: Layout | undefined): Layout | undefined {
  if (!l) return l;
  return cleanLayout(
    Object.fromEntries(
      Object.entries(l).map(([k, ms]) => [
        k,
        Object.fromEntries(Object.entries(ms).filter(([id]) => !/^s\d+$/.test(id))),
      ]),
    ),
  );
}
