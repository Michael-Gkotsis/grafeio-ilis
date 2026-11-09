// The architecture rules as pure functions over `ArchFile[]` and a baseline: they return messages, they never throw.
//
// Purpose: (1) import cycles, (2) process boundaries, (3) FSD layering of the future renderer, (4) size limits,
//   (5) style counts (`.forEach(`, `any`). Rules 1, 4 and 5 are ratchets: today's violations are in
//   test/architecture/baseline.json and may only shrink.
// Does NOT: read files (arch-scan.ts), read or write the baseline file (arch-baseline.ts), or run under vitest itself.
// Owner layer: test support only.
// Why: the same functions run on the real tree and on tiny hand-made graphs, which proves each rule bites even when
//   the folders it protects (src/core, renderer/pages...) do not exist yet.
// Covering test: test/architecture.test.ts.
import path from 'path';
import {
  FSD_LAYERS, SLICED_LAYERS,
  type ArchFile, type Counts, type FsdLayer, type ImportKind,
} from './arch-model';
import { isNodeBuiltin } from './arch-scan';

export interface Violation { key: string; message: string }

// ---------------------------------------------------------------------------------------------------------------
// 1. Import cycles
// ---------------------------------------------------------------------------------------------------------------

/**
 * Cycles (strongly connected components of 2+ files, or a file importing itself) over the given import kinds.
 * Tarjan, iterative so a deep chain cannot overflow the stack. Dynamic imports are never edges: a lazy `import()` is
 * exactly how a cycle is cut at load time.
 * @returns each cycle as a sorted list of paths, the list sorted too (stable for the baseline file)
 */
export function findCycles(files: ArchFile[], kinds: ImportKind[]): string[][] {
  const known = new Set(files.map(file => file.path));
  const edges = new Map(files.map(file => [
    file.path,
    [...new Set(file.imports.filter(imp => kinds.includes(imp.kind) && imp.target && known.has(imp.target))
      .map(imp => imp.target as string))],
  ]));
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const open = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const start = (root: string): void => {
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    order.set(root, order.size);
    low.set(root, order.get(root) as number);
    stack.push(root);
    open.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const out = edges.get(frame.node) ?? [];
      if (frame.next < out.length) {
        const to = out[frame.next++];
        if (!order.has(to)) {
          order.set(to, order.size);
          low.set(to, order.get(to) as number);
          stack.push(to);
          open.add(to);
          work.push({ node: to, next: 0 });
        } else if (open.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node) as number, order.get(to) as number));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node) as number, low.get(frame.node) as number));
      if (low.get(frame.node) !== order.get(frame.node)) continue;
      const members: string[] = [];
      for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
        open.delete(member);
        members.push(member);
        if (member === frame.node) break;
      }
      if (members.length > 1 || (edges.get(frame.node) ?? []).includes(frame.node)) cycles.push(members.sort());
    }
  };
  files.map(file => file.path).filter(name => !order.has(name)).map(start);
  return cycles.sort((a, b) => a.join('\n').localeCompare(b.join('\n')));
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every(item => b.includes(item));
const subsetOf = (a: string[], b: string[]): boolean => a.every(item => b.includes(item));
const shortList = (items: string[]): string =>
  (items.length > 12 ? `${items.slice(0, 12).join(', ')}, ... (+${items.length - 12})` : items.join(', '));

/**
 * Compare today's cycles with the baseline. A cycle that is new, or that gained members, is a violation; a cycle that
 * disappeared or shrank is also a violation, so the baseline tightens ("remove from baseline").
 * @param label `value` (runtime edges) or `with type imports`
 */
export function checkCycles(label: string, current: string[][], baseline: string[][]): string[] {
  const grew = current.filter(cycle => !baseline.some(old => sameSet(old, cycle))).map(cycle => {
    const parent = baseline.find(old => subsetOf(old, cycle));
    const bigger = baseline.find(old => subsetOf(cycle, old));
    if (bigger) {
      return `Import cycle (${label}) got smaller: ${cycle.length} files now, baseline has ${bigger.length}. ` +
        `Remove from baseline: run ARCH_UPDATE=1 npx vitest run test/architecture.test.ts to record it.`;
    }
    const extra = parent ? cycle.filter(member => !parent.includes(member)) : cycle;
    return parent
      ? `Import cycle (${label}) gained members: ${shortList(extra)} joined an existing cycle. ` +
        `Fix: remove the import that closes the loop (move the shared piece into a lower module, or use import type).`
      : `New import cycle (${label}) among ${cycle.length} files: ${shortList(cycle)}. ` +
        `Fix: break the loop (move the shared piece into a lower module, or use import type); ` +
        `cycles are not allowed to grow.`;
  });
  const gone = baseline.filter(old => !current.some(cycle => subsetOf(cycle, old))).map(old =>
    `Import cycle (${label}) no longer exists: ${shortList(old)}. ` +
    `Remove from baseline: run ARCH_UPDATE=1 npx vitest run test/architecture.test.ts (ratchet tightens).`);
  return [...new Set([...grew, ...gone])];
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Process boundaries
// ---------------------------------------------------------------------------------------------------------------

const CORE_PREFIXES = ['src/shared/', 'src/core/'];
const FORBIDDEN_IN_CORE_PACKAGES = new Set(['electron', 'react', 'react-dom', 'htm']);
const inDir = (file: string, dir: string): boolean => file.startsWith(`${dir}/`);

/**
 * Process boundaries. `src/shared` and `src/core` are loaded by main, preload and renderer, so they may use no Node,
 * Electron or UI library and no process folder. The renderer may not touch main, Electron or Node. Main may not touch
 * the renderer. Preload may import only Electron and shared code (and its own files).
 * @returns one violation per offending import; `key` is `file -> specifier`
 */
export function checkBoundaries(files: ArchFile[]): Violation[] {
  return files.flatMap(file => file.imports.flatMap((imp): Violation[] => {
    const key = `${file.path} -> ${imp.spec}`;
    const target = imp.target;
    const pkg = imp.external;
    const bad = (rule: string, fix: string): Violation[] =>
      [{ key, message: `${file.path}:${imp.line} imports '${imp.spec}' (${rule}). Fix: ${fix}` }];
    const intoDir = (dir: string): boolean => !!target && inDir(target, dir);
    if (CORE_PREFIXES.some(prefix => file.path.startsWith(prefix))) {
      if (pkg && (isNodeBuiltin(pkg) || FORBIDDEN_IN_CORE_PACKAGES.has(pkg))) {
        return bad(
          'rule shared-pure: src/shared and src/core run in main, preload and renderer, ' +
          'so they may not use Node, Electron, React or htm',
          `keep this file pure; do the I/O in src/main (or the UI in src/renderer) and pass the data in as arguments`);
      }
      if (['src/main', 'src/renderer', 'src/preload'].some(intoDir)) {
        return bad('rule shared-pure: shared code may not import a process folder',
          `move the needed code down into src/shared (or src/core) and import it from there on both sides`);
      }
    } else if (inDir(file.path, 'src/renderer')) {
      if (pkg && (isNodeBuiltin(pkg) || pkg === 'electron')) {
        return bad('rule renderer-sandbox: the renderer cannot use Node or Electron directly',
          `go through window.api (src/shared/api.ts, implemented in src/main and exposed by src/preload)`);
      }
      if (intoDir('src/main')) {
        return bad('rule renderer-no-main: the renderer may not import src/main',
          `put the shared piece in src/shared, or call main through window.api`);
      }
    } else if (inDir(file.path, 'src/main')) {
      if (intoDir('src/renderer')) {
        return bad('rule main-no-renderer: main may not import src/renderer',
          `put the shared piece in src/shared and import it from there`);
      }
    } else if (inDir(file.path, 'src/preload')) {
      const allowedTarget = !target || inDir(target, 'src/preload') ||
        CORE_PREFIXES.some(prefix => target.startsWith(prefix));
      if ((pkg && pkg !== 'electron') || !allowedTarget) {
        return bad(
          'rule preload-minimal: preload may import only electron, src/shared (src/shared/ipc) and its own files',
          `move the logic into src/shared or src/main and keep preload a thin bridge`);
      }
    }
    return [];
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Feature-Sliced Design layering (src/renderer/{app,pages,widgets,features,entities,shared})
// ---------------------------------------------------------------------------------------------------------------

interface Place { layer: FsdLayer; slice: string | null; sliceDir: string }

/** Where a path sits in the FSD layout, or null for anything outside it (legacy renderer files, main, shared core). */
export function fsdPlace(file: string): Place | null {
  const parts = file.split('/');
  if (parts[0] !== 'src' || parts[1] !== 'renderer') return null;
  const layer = FSD_LAYERS.find(name => name === parts[2]);
  if (!layer || parts.length < 4) return null;
  const sliced = SLICED_LAYERS.includes(layer);
  const depth = sliced ? 4 : 3;
  return { layer, slice: sliced ? parts[3] : null, sliceDir: parts.slice(0, depth).join('/') };
}

const withoutExt = (file: string): string => file.replace(/\.(tsx?|jsx|mjs|cjs)$/, '');
const relativeSpec = (from: string, to: string): string => {
  const rel = path.posix.relative(path.posix.dirname(from), to);
  return rel.startsWith('.') ? rel : `./${rel}`;
};

/**
 * FSD rules for files under src/renderer/<layer>/. Layers, top to bottom: app, pages, widgets, features, entities,
 * shared. (a) import only from a lower layer (shared: only shared); (b) no import between two slices of one layer;
 * (c) another slice is imported through its index.ts only. Dynamic and type imports count too. Files outside the layer
 * folders are ignored, so this is quiet today and bites the moment the folders exist.
 */
export function checkFsd(files: ArchFile[]): Violation[] {
  return files.flatMap(file => {
    const from = fsdPlace(file.path);
    if (!from) return [];
    return file.imports.flatMap((imp): Violation[] => {
      const to = imp.target ? fsdPlace(imp.target) : null;
      if (!imp.target || !to) return [];
      const where = `${file.path}:${imp.line} imports '${imp.spec}'`;
      const rankFrom = FSD_LAYERS.indexOf(from.layer);
      const rankTo = FSD_LAYERS.indexOf(to.layer);
      const key = `${file.path} -> ${imp.spec}`;
      if (rankTo < rankFrom) {
        return [{ key, message: `${where}: layer '${from.layer}' may not import from higher layer ` +
          `'${to.layer}' (rule fsd-downward: app > pages > widgets > features > entities > shared). ` +
          `Fix: move the shared piece down to a layer both can import, ` +
          `or pass it in as a prop/callback.` }];
      }
      const sameSlice = rankTo === rankFrom && to.slice === from.slice;
      if (rankTo === rankFrom && !sameSlice) {
        return [{ key, message: `${where}: slice '${from.layer}/${from.slice}' imports slice ` +
          `'${to.layer}/${to.slice}' of the same layer ` +
          `(rule fsd-no-cross-slice). Fix: move the shared piece down one layer (e.g. to 'entities' or 'shared'), ` +
          `or compose the two slices in a higher layer.` }];
      }
      const slicedTarget = SLICED_LAYERS.includes(to.layer);
      const isPublicApi = withoutExt(imp.target) === `${to.sliceDir}/index`;
      if (slicedTarget && !sameSlice && !isPublicApi) {
        const fix = relativeSpec(file.path, to.sliceDir);
        return [{ key, message: `${where}: deep import into slice '${to.layer}/${to.slice}' (rule fsd-public-api). ` +
          `Fix: import from '${fix}' instead of '${imp.spec}', ` +
          `and export what you need from ${to.sliceDir}/index.ts.` }];
      }
      return [];
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 4. + 5. Counted ratchets (sizes, forEach, any) and boundary baseline
// ---------------------------------------------------------------------------------------------------------------

/** Files longer than `limit` physical lines, as `path -> lines`. */
export const oversizeFiles = (files: ArchFile[], limit: number): Counts =>
  Object.fromEntries(files.filter(file => file.lines > limit).map(file => [file.path, file.lines]));

/** Functions longer than their own limit (80, or 150 for a screen component), as `path::name -> lines`. */
export const oversizeFunctions = (files: ArchFile[]): Counts =>
  Object.fromEntries(files.flatMap(file => file.functions.filter(fn => fn.lines > fn.limit)
    .map(fn => [`${file.path}::${fn.name}`, fn.lines])));

/** Non-zero per-file counts of one metric. */
export const perFileCounts = (files: ArchFile[], pick: (file: ArchFile) => number): Counts =>
  Object.fromEntries(files.map(file => [file.path, pick(file)] as const).filter(([, count]) => count > 0));

export interface RatchetText {
  /** Message for a key that is not in the baseline at all. `now` is the current number. */
  added: (key: string, now: number) => string;
  /** Message for a key whose number went up. */
  grew: (key: string, now: number, was: number) => string;
  /** Message for a baseline key that no longer counts (fixed, deleted or moved). */
  gone: (key: string, was: number) => string;
}

const UPDATE_HINT = 'run ARCH_UPDATE=1 npx vitest run test/architecture.test.ts (it only records improvements)';

/**
 * Generic ratchet over `key -> number`: nothing new, nothing bigger; improvements must be written into the baseline
 * so they cannot be lost again.
 */
export function checkCounts(current: Counts, baseline: Counts, text: RatchetText): string[] {
  const forward = Object.entries(current).flatMap(([key, now]) => {
    const was = baseline[key];
    if (was === undefined) return [text.added(key, now)];
    if (now > was) return [text.grew(key, now, was)];
    if (now < was) return [`${key}: improved from ${was} to ${now}. Lower the baseline: ${UPDATE_HINT}.`];
    return [];
  });
  const backward = Object.entries(baseline).filter(([key]) => current[key] === undefined)
    .map(([key, was]) => text.gone(key, was));
  return [...forward, ...backward];
}

export const FILE_TEXT = (limit: number): RatchetText => ({
  added: (key, now) => `${key} has ${now} lines (limit ${limit}) and is not in the baseline (rule file-size). ` +
    `Fix: split it into files of at most ${limit} lines; the baseline only lists files that were already too long.`,
  grew: (key, now, was) => `${key} grew from ${was} to ${now} lines (rule file-size, limit ${limit}). ` +
    `Fix: move the new code into another file, an oversize file may only shrink.`,
  gone: (key, was) => `${key} (baseline ${was} lines) is now under the limit, moved or deleted. ` +
    `Remove from baseline: ${UPDATE_HINT}.`,
});

export const FUNCTION_TEXT: RatchetText = {
  added: (key, now) => `${key.replace('::', ' function ')} has ${now} lines and is over its limit ` +
    `(80; 150 for a screen component) ` +
    `and not in the baseline (rule function-size). Fix: extract helper functions (pure view logic goes to view.ts).`,
  grew: (key, now, was) => `${key.replace('::', ' function ')} grew from ${was} to ${now} lines ` +
    `(rule function-size). ` +
    `Fix: put the new code in a helper; an oversize function may only shrink.`,
  gone: (key, was) => `${key.replace('::', ' function ')} (baseline ${was} lines) is under its limit, ` +
    `renamed or deleted. ` +
    `Remove from baseline: ${UPDATE_HINT}.`,
};

export const styleText = (metric: 'forEach' | 'any'): RatchetText => {
  const what = metric === 'forEach'
    ? 'forEach( calls (rule no-forEach; use map/filter/reduce/some/every/find/flatMap, ' +
      'or for...of when you need break/await)'
    : "'any' type annotations (rule no-any; use a real type, unknown, or a generic)";
  return {
    added: (key, now) => `${key} has ${now} ${what}, and the file is not in the baseline. New code must have 0.`,
    grew: (key, now, was) => `${key} went from ${was} to ${now} ${what}. Counts may only go down.`,
    gone: (key, was) => `${key} (baseline ${was} ${metric}) has none now, moved or deleted. ` +
      `Remove from baseline: ${UPDATE_HINT}.`,
  };
};

/** Boundary violations that are not in the baseline, and baseline entries that no longer violate. */
export function checkBoundaryBaseline(current: Violation[], baseline: string[]): string[] {
  const added = current.filter(violation => !baseline.includes(violation.key)).map(violation => violation.message);
  const gone = baseline.filter(key => !current.some(violation => violation.key === key))
    .map(key => `Boundary exception '${key}' is fixed or gone. Remove from baseline: ${UPDATE_HINT}.`);
  return [...added, ...gone];
}
