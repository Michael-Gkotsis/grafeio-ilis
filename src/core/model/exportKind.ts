// The kinds of Excel/print export the office can ask for.
//
// Purpose: the `ExportKind` union (one value per form: ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι, the check sheet and the two ΠΣΚ
//   three-day variants).
// Does NOT: build or write any export (src/main/exports.ts does) or hold the other IPC types (src/shared/api.ts does
//   and re-exports this type).
// Owner layer: core/model (types only: no fs, no Electron, no React).
// Why: core/forms/sigs.ts and core/forms/preflight.ts choose by export kind; keeping the type here keeps the import
//   `forms -> api` out of core (api.ts re-exports the type, so importers keep working).
// Covering tests: test/sigs.test.ts, test/cases.test.ts.

/** The export a form belongs to; `frouraPsk` and `outsPsk` are the ΠΣΚ (three-day) variants of `froura` and `outs`. */
export type ExportKind = 'froura' | 'hkai' | 'outs' | 'check' | 'frouraPsk' | 'outsPsk';
