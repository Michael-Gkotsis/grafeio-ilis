// Public face of the form engine (fills the Excel forms of the Ίλη).
//
// Purpose: the exports the old src/main/exports.ts had, with the same names and nothing more; helpers shared between
//   the files of this folder (refOf, headCells, restyle, ...) are imported from their own file and are not part of the
//   public face.
// Does NOT: contain code (re-exports only) or change what the forms contain: files stay byte for byte as before (Phase
//   4.9a).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: src/main/exports.ts re-exports this folder so the importers do not change; they move here later. The old file
//   was "Filling the forms of the Ίλη from the state of the app (06, 11)": every function takes the empty template and
//   returns the filled file (ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι, and the "Όλη η δύναμη" format), plus the signatures and moves for
//   every form.
// Covering test: test/exports.test.ts, test/hkai.test.ts, test/outs-snapshot.test.ts and the golden hashes of `npm run
//   bench:golden`.
export { FROURA_FORMS } from '../../../shared/froura';
export { byRoom, outsAndStay } from '../../../shared/outsStay';
export { unitWords, who } from './common';
export { fillFroura, absentOn, punishedOn } from './froura';
export { fillHkai } from './hkai';
export { allLines } from './outsAllLines';
export { fillOuts } from './outs';
export { outsNote } from './outsNote';
export { signMade, signSheets, sigsOf } from './sign';
export { TemplateError } from './templateError';
export type { ExportResult, MadeMark, SheetPart } from './types';
