// Parses the source tree for the architecture test with the TypeScript compiler API (no regexes over code).
//
// Purpose: turn every file under src/ into an `ArchFile` (imports with resolved targets, named-function sizes,
//   `.forEach(` and `any` counts, line count).
// Does NOT: judge anything (see arch-rules.ts), follow path aliases (the repo has none), or read files outside src/.
// Owner layer: test support only.
// Why: text greps miss multi-line imports, `import type`, `export ... from`, `import('x')` and comments that look like
//   code; the AST does not. One walk per file keeps the whole test far under 10 s.
// Covering test: test/architecture.test.ts (section "scanner").
import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import ts from 'typescript';
import {
  ARCH_SOURCE_EXTS, FUNCTION_LINE_LIMIT, SCREEN_FUNCTION_LINE_LIMIT,
  type ArchFile, type ArchFunction, type ArchImport, type ImportKind,
} from './arch-model';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BUILTINS = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/** Repo-relative POSIX paths of every parsed source file under `src/`, sorted. */
export function listSourcePaths(root: string = REPO_ROOT): string[] {
  return walk(path.join(root, 'src'))
    .filter(file => ARCH_SOURCE_EXTS.includes(path.extname(file)) && !file.endsWith('.d.ts'))
    .map(file => path.relative(root, file).split(path.sep).join('/'))
    .sort();
}

/** `fs`, `node:fs/promises` -> `fs`; `@scope/pkg/deep` -> `@scope/pkg`; `react-dom/client` -> `react-dom`. */
export function externalName(spec: string): string {
  const bare = spec.replace(/^node:/, '');
  const parts = bare.split('/');
  return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** True for a Node built-in module name (`fs`, `path`, `crypto`...). */
export const isNodeBuiltin = (name: string): boolean => BUILTINS.has(name);

const scriptKind = (file: string): ts.ScriptKind => {
  const ext = path.extname(file);
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ext === '.mjs' || ext === '.cjs' ? ts.ScriptKind.JS : ts.ScriptKind.TS;
};

const lineOf = (sf: ts.SourceFile, pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
const stringArg = (node: ts.Expression | undefined): string | null =>
  node && ts.isStringLiteralLike(node) ? node.text : null;

/** `import type X`, `import { type A, type B }` (no default, no value specifier) and `export type {...}` are erased. */
const isTypeOnlyClause = (clause: ts.ImportClause | undefined): boolean => {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const named = clause.namedBindings;
  return !clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 &&
    named.elements.every(el => el.isTypeOnly);
};

type RawImport = Pick<ArchImport, 'spec' | 'kind' | 'line'>;

const rawImportOf = (sf: ts.SourceFile, node: ts.Node): RawImport | null => {
  const at = (spec: string | null, kind: ImportKind): RawImport | null =>
    spec === null ? null : { spec, kind, line: lineOf(sf, node.getStart(sf)) };
  if (ts.isImportDeclaration(node)) {
    return at(stringArg(node.moduleSpecifier), isTypeOnlyClause(node.importClause) ? 'type' : 'value');
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
    const exportsOnlyTypes = node.isTypeOnly ||
      (!!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every(el => el.isTypeOnly));
    return at(stringArg(node.moduleSpecifier), exportsOnlyTypes ? 'type' : 'value');
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return at(stringArg(node.moduleReference.expression), node.isTypeOnly ? 'type' : 'value');
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return at(ts.isStringLiteral(node.argument.literal) ? node.argument.literal.text : null, 'type');
  }
  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return at(stringArg(node.arguments[0]), 'dynamic');
    if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      return at(stringArg(node.arguments[0]), 'value');
    }
  }
  return null;
};

const FUNCTION_LIKE = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) ||
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

const propertyKey = (name: ts.PropertyName | undefined, sf: ts.SourceFile): string | null => {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sf).slice(0, 40);
};

/** Climb out of `(x)`, `x as T`, `x satisfies T` so `const f = (() => {}) as F` still names the function `f`. */
const outerOf = (node: ts.Node): ts.Node => {
  let up = node;
  while (up.parent && (ts.isParenthesizedExpression(up.parent) || ts.isAsExpression(up.parent) ||
    ts.isSatisfiesExpression(up.parent) || ts.isNonNullExpression(up.parent))) up = up.parent;
  return up;
};

/**
 * The name a function is measured under, or null for an anonymous callback (which belongs to its parent function).
 * `const View = memo(() => ...)` and `forwardRef(function ...)` take the variable's name, because a wrapped component
 * is still a component.
 */
function functionName(node: ts.FunctionLikeDeclaration, sf: ts.SourceFile): string | null {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? 'default';
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return propertyKey(node.name, sf);
  }
  if (ts.isFunctionExpression(node) && node.name) return node.name.text;
  let holder = outerOf(node).parent;
  if (holder && ts.isCallExpression(holder) && holder.arguments.some(arg => outerOf(arg) === outerOf(node))) {
    holder = outerOf(holder).parent;
  }
  if (holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) return holder.name.text;
  if (holder && (ts.isPropertyAssignment(holder) || ts.isPropertyDeclaration(holder))) {
    return propertyKey(holder.name, sf);
  }
  if (holder && ts.isExportAssignment(holder)) return 'default';
  return null;
}

const isScreenFile = (file: string): boolean => /^src\/renderer\/(screens|pages)\//.test(file);

const limitFor = (file: string, leafName: string): number =>
  isScreenFile(file) && /^[A-Z]/.test(leafName) ? SCREEN_FUNCTION_LINE_LIMIT : FUNCTION_LINE_LIMIT;

interface Walk { imports: RawImport[]; functions: ArchFunction[]; forEach: number; anyCount: number }

/**
 * Parse one file. `file` is the repo-relative POSIX path (it decides the screen limit and the script kind).
 * Imports come back unresolved (`target` and `external` filled later by `resolveImports`).
 */
export function scanSource(file: string, text: string): ArchFile {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, scriptKind(file));
  const found: Walk = { imports: [], functions: [], forEach: 0, anyCount: 0 };
  const seen = new Map<string, number>();
  const visit = (node: ts.Node, scope: string[]): void => {
    const imported = rawImportOf(sf, node);
    if (imported) found.imports.push(imported);
    if (node.kind === ts.SyntaxKind.AnyKeyword) found.anyCount += 1;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'forEach') found.forEach += 1;
    let inner = scope;
    const name = FUNCTION_LIKE(node) ? functionName(node, sf) : null;
    if (name !== null && FUNCTION_LIKE(node)) {
      const qualified = [...scope, name].join('>');
      const times = (seen.get(qualified) ?? 0) + 1;
      seen.set(qualified, times);
      found.functions.push({
        name: times > 1 ? `${qualified}#${times}` : qualified,
        lines: lineOf(sf, node.getEnd()) - lineOf(sf, node.getStart(sf)) + 1,
        limit: limitFor(file, name),
      });
      inner = [...scope, name];
    }
    ts.forEachChild(node, child => { visit(child, inner); });
  };
  visit(sf, []);
  const lineCount = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  return {
    path: file, lines: lineCount, forEach: found.forEach, anyCount: found.anyCount, functions: found.functions,
    imports: found.imports.map(raw => ({ ...raw, target: null, external: null })),
  };
}

/** Candidate file names for a relative specifier, in the order bundlers try them. */
const candidates = (base: string): string[] => {
  const stripped = base.replace(/\.(js|mjs|cjs)$/, '');
  return [
    base, ...ARCH_SOURCE_EXTS.map(ext => base + ext), ...ARCH_SOURCE_EXTS.map(ext => `${base}/index${ext}`),
    ...ARCH_SOURCE_EXTS.map(ext => stripped + ext),
  ];
};

/** Fill `target` (relative specifiers that hit a scanned file) and `external` (bare ones). Pure; returns new files. */
export function resolveImports(files: ArchFile[]): ArchFile[] {
  const known = new Set(files.map(file => file.path));
  return files.map(file => ({
    ...file,
    imports: file.imports.map(imp => {
      if (imp.spec.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), imp.spec));
        return { ...imp, target: candidates(base).find(name => known.has(name)) ?? null, external: null };
      }
      return { ...imp, target: null, external: externalName(imp.spec) };
    }),
  }));
}

/** Scan the real tree. Reads ~125 files; takes well under a second. */
export function scanTree(root: string = REPO_ROOT): ArchFile[] {
  const parsed = listSourcePaths(root).map(rel => scanSource(rel, fs.readFileSync(path.join(root, rel), 'utf8')));
  return resolveImports(parsed);
}
