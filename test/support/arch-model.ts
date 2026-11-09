// Shared types and constants of the architecture test (test/architecture.test.ts).
//
// Purpose: one place for the data model (what the scanner produces, what the baseline stores) and the numeric limits.
// Does NOT: scan, judge or write anything; see arch-scan.ts (parse), arch-rules.ts (rules), arch-baseline.ts
//   (ratchet file).
// Owner layer: test support only.
// Why: the rules must run both on the real src/ tree and on small in-memory graphs (to prove they bite), so the model
//   is plain data that a test can build by hand.
// Covering test: test/architecture.test.ts.

/** `value`: a runtime edge. `type`: erased by TypeScript. `dynamic`: `import('x')`, loaded lazily (never in cycles). */
export type ImportKind = 'value' | 'type' | 'dynamic';

export interface ArchImport {
  /** The specifier exactly as written, e.g. `'../shared/dates'` or `'fs'`. */
  spec: string;
  kind: ImportKind;
  /** 1-based line of the import, for messages. */
  line: number;
  /** Repo-relative POSIX path of the resolved src file (`src/shared/dates.ts`), or null (package, asset, none). */
  target: string | null;
  /** Package or Node built-in name for a bare specifier (`node:fs/promises` -> `fs`, `@x/y/z` -> `@x/y`), else null. */
  external: string | null;
}

export interface ArchFunction {
  /** Qualified name inside the file: `Outer>inner`; a repeated name gets `#2`, `#3`. Never contains line numbers. */
  name: string;
  /** Physical lines from the first to the last line of the function (blank lines and comments included). */
  lines: number;
  /** Allowed lines: 80, or 150 for a screen component. */
  limit: number;
}

export interface ArchFile {
  /** Repo-relative POSIX path, e.g. `src/shared/dates.ts`. */
  path: string;
  /** Physical lines of the file (a final newline does not count as a line). */
  lines: number;
  imports: ArchImport[];
  /** Named functions only (declarations, methods, `const f = () =>`); anonymous callbacks belong to their parent. */
  functions: ArchFunction[];
  /** Calls written as `x.forEach(` or `x?.forEach(`. */
  forEach: number;
  /** `any` keywords in type positions (`: any`, `as any`, `any[]`, `Array<any>`). */
  anyCount: number;
}

/** A counted ratchet: key (file or `file::function`) -> number. Only non-zero / over-limit entries are stored. */
export type Counts = Record<string, number>;

export interface Baseline {
  _readme: string;
  cycles: { value: string[][]; withTypes: string[][] };
  /** Keys `file -> specifier` of boundary violations that exist today (empty when the structure is clean). */
  boundaries: string[];
  oversizeFiles: Counts;
  oversizeFunctions: Counts;
  forEach: Counts;
  any: Counts;
}

export const FILE_LINE_LIMIT = 400;
export const FUNCTION_LINE_LIMIT = 80;
/** Limit for a screen component (function in src/renderer/screens or pages whose name starts with a capital). */
export const SCREEN_FUNCTION_LINE_LIMIT = 150;
/** A scan that sees fewer files than this is a broken glob, not a clean tree (src/ has 120+ files today). */
export const MIN_SCANNED_FILES = 100;

/** Source extensions that are parsed. `.d.ts` files are skipped. */
export const ARCH_SOURCE_EXTS = ['.ts', '.tsx', '.jsx', '.mjs', '.cjs'];

/** FSD layers of the future renderer, highest first. A file may import only from a layer further down the list. */
export const FSD_LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'] as const;
export type FsdLayer = (typeof FSD_LAYERS)[number];
/** Layers whose second path segment is a slice with a public API (`index.ts`). `app` and `shared` have none. */
export const SLICED_LAYERS: readonly FsdLayer[] = ['pages', 'widgets', 'features', 'entities'];
