// The error of a template that cannot be used.
//
// Purpose: the class `TemplateError`.
// Does NOT: say what is wrong: the message of the thrower is Greek and goes to the user as it is.
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: the services, the worker and the IPC test for it with `instanceof` to tell a bad template from a bug; it keeps
//   its own file so that every importer gets the one class (Phase 4.9a, verbatim).
// Covering test: test/template-fuzz.test.ts and test/hkai.test.ts.

/**
 * A template that cannot be used (e.g. the ΗΚΑΙ has lost its formulas). The message is Greek and is shown to the user.
 */
export class TemplateError extends Error {}
