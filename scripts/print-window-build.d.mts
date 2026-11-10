// Types of scripts/print-window-build.mjs, for test/print-window-gen.test.ts.
//
// Purpose: gives the three exports their types so the test needs no `@ts-ignore`.
// Does NOT: contain code.
// Owner layer: build tooling (architecture).
/** Repo-relative path of the generated module. */
export const GENERATED_FILE: string;
/** The bundled print window script, exactly what the page inlines and the CSP hash covers. */
export function buildPreviewScript(): Promise<string>;
/** The text of the generated TypeScript module for `script`. */
export function generatedModuleText(script: string): string;
