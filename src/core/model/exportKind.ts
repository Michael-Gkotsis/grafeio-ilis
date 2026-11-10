// The kinds of Excel/print export the office can ask for.
//
// Purpose: the `ExportKind` union and its value list `EXPORT_KINDS` (one value per form: ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι,
//   the check sheet and the two ΠΣΚ three-day variants).
// Does NOT: build or write any export (src/main/exports.ts does) or hold the other IPC types (src/shared/api.ts does
//   and re-exports this type).
// Owner layer: core/model (a type and one constant list: no fs, no Electron, no React).
// Why: core/forms/sigs.ts and core/forms/preflight.ts choose by export kind; keeping the type here keeps the import
//   `forms -> api` out of core (api.ts re-exports the type, so importers keep working).
// Covering tests: test/sigs.test.ts, test/cases.test.ts, test/ipc-guards.test.ts (the list).

/** Every `ExportKind`: the one list the type is derived from (main uses it to reject an unknown kind at the IPC). */
export const EXPORT_KINDS = ['froura', 'hkai', 'outs', 'check', 'frouraPsk', 'outsPsk'] as const;

/** The export a form belongs to; `frouraPsk` and `outsPsk` are the ΠΣΚ (three-day) variants of `froura` and `outs`. */
export type ExportKind = (typeof EXPORT_KINDS)[number];
