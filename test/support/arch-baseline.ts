// The baseline file of the architecture test (test/architecture/baseline.json) and the only code allowed to rewrite it.
//
// Purpose: compute "today's state" from a scan, read/write it as JSON, and decide whether a rewrite is an improvement.
// Does NOT: judge the rules (arch-rules.ts) or scan (arch-scan.ts).
// Owner layer: test support only.
// Why: a ratchet is only a ratchet if the escape hatch cannot quietly raise the bar. `planUpdate` refuses any rewrite
//   that makes a number bigger, adds an entry the old baseline could not pay for, or runs on CI.
// Covering test: test/architecture.test.ts (section "baseline update guard").
import fs from 'fs';
import path from 'path';
import {
  FILE_LINE_LIMIT, type ArchFile, type Baseline, type Counts,
} from './arch-model';
import {
  checkBoundaries, findCycles, oversizeFiles, oversizeFunctions, perFileCounts,
} from './arch-rules';

export const BASELINE_PATH = path.resolve(__dirname, '..', 'architecture', 'baseline.json');

export const README =
  'Ratchet baseline of test/architecture.test.ts. These are the structure problems that existed when the test was ' +
  'added. Entries may only be REMOVED or LOWERED (fix the code, then run ARCH_UPDATE=1 npx vitest run ' +
  'test/architecture.test.ts). Adding an entry or raising a number is forbidden in review. A pure file move may ' +
  'rename a key with the same or a smaller number. cycles: sets of files that import each other; boundaries: ' +
  'file -> import that crosses a process boundary; oversizeFiles/oversizeFunctions: physical lines; forEach/any: ' +
  'count per file.';

/** The state of a scanned tree in baseline shape: exactly what an update would write. */
export function currentState(files: ArchFile[]): Baseline {
  return {
    _readme: README,
    cycles: { value: findCycles(files, ['value']), withTypes: findCycles(files, ['value', 'type']) },
    boundaries: checkBoundaries(files).map(violation => violation.key).sort(),
    oversizeFiles: oversizeFiles(files, FILE_LINE_LIMIT),
    oversizeFunctions: oversizeFunctions(files),
    forEach: perFileCounts(files, file => file.forEach),
    any: perFileCounts(files, file => file.anyCount),
  };
}

const sortedCounts = (counts: Counts): Counts =>
  Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Stable text of a baseline: sorted keys, 2-space indent, trailing newline (so diffs show only real changes). */
export function serializeBaseline(baseline: Baseline): string {
  const stable: Baseline = {
    ...baseline,
    boundaries: [...baseline.boundaries].sort(),
    oversizeFiles: sortedCounts(baseline.oversizeFiles),
    oversizeFunctions: sortedCounts(baseline.oversizeFunctions),
    forEach: sortedCounts(baseline.forEach),
    any: sortedCounts(baseline.any),
  };
  return `${JSON.stringify(stable, null, 2)}\n`;
}

/** The committed baseline, or null when the file does not exist yet (first run of the update path). */
export function loadBaseline(file: string = BASELINE_PATH): Baseline | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Baseline) : null;
}

export function writeBaseline(baseline: Baseline, file: string = BASELINE_PATH): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeBaseline(baseline));
}

/** Every category as `key -> weight`, so one rule can guard all of them. */
export function flatten(baseline: Baseline): Record<string, Counts> {
  const cycleCounts = (cycles: string[][]): Counts =>
    Object.fromEntries(cycles.map(cycle => [cycle.join(','), cycle.length]));
  return {
    'cycles (value)': cycleCounts(baseline.cycles.value),
    'cycles (with types)': cycleCounts(baseline.cycles.withTypes),
    boundaries: Object.fromEntries(baseline.boundaries.map(key => [key, 1])),
    oversizeFiles: baseline.oversizeFiles,
    oversizeFunctions: baseline.oversizeFunctions,
    forEach: baseline.forEach,
    any: baseline.any,
  };
}

const total = (counts: Counts): number => Object.values(counts).reduce((sum, value) => sum + value, 0);

export type UpdatePlan = { ok: true } | { ok: false; errors: string[] };

/**
 * May `next` replace `previous`? Only when nothing got worse: no existing number rose, and everything added (a moved
 * file under a new name, a cycle that split) is paid for by what was removed in the same category (total weight of the
 * added entries <= total weight of the removed ones). With no previous baseline anything is accepted (first run).
 */
export function planUpdate(
  previous: Baseline | null, next: Baseline, env: Record<string, string | undefined> = process.env,
): UpdatePlan {
  if (env.CI) {
    return {
      ok: false, errors: ['ARCH_UPDATE is refused when CI is set: the baseline is updated by a person, in a PR.'],
    };
  }
  if (!previous) return { ok: true };
  const before = flatten(previous);
  const after = flatten(next);
  const errors = Object.entries(after).flatMap(([category, counts]) => {
    const old = before[category];
    const grown = Object.entries(counts).filter(([key, value]) => old[key] !== undefined && value > old[key])
      .map(([key, value]) => `${category}: ${key} would grow from ${old[key]} to ${value}`);
    const added = Object.fromEntries(Object.entries(counts).filter(([key]) => old[key] === undefined));
    const removed = Object.fromEntries(Object.entries(old).filter(([key]) => counts[key] === undefined));
    const unpaid = total(added) > total(removed)
      ? [`${category}: ${Object.keys(added).length} new entr${Object.keys(added).length === 1 ? 'y' : 'ies'} ` +
        `(weight ${total(added)}) not paid for by removed ones (weight ${total(removed)}): ` +
        Object.keys(added).slice(0, 5).join(' | ')]
      : [];
    return [...grown, ...unpaid];
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
