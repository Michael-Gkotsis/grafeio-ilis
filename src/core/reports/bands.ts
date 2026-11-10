// The positions of the tables of a form on the sheet: bands.
//
// Purpose: `bandsOf` (the bands that hold for these tables), `put` / `step` / `canStep` / `dropAt` (move a table),
//   `isDefault` / `keepBands` / `hasBeside` and `whereText`. Re-exports the type `Bands`.
// Does NOT: draw anything or know what a table contains (only the ids).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: «Έντυπα» phase 3 (Michael, 24/10): every table, also the 1st, goes above, below or beside another. The tables
//   (the 1st = 'main', tables 2, 3… and the values tables by id) go into bands: a band is a row of tables from left
//   to right and the bands go one under the other. A band is as tall as its tallest table, so when one table grows
//   its neighbour is not torn. Pure logic, no screen and no Node, for «Φτιάξ' το εδώ», the filling and the screen.
// Covering tests: test/report-bands.test.ts.
import type { Bands } from '../model/reportTypes';
export type { Bands } from '../model/reportTypes';

/** The id of the 1st table of a form in the bands; tables 2, 3… and the values tables use their own ids. */
export const MAIN = 'main';
/**
 * The bands as they hold for these tables: whatever no longer exists (a deleted table) goes, and a new table gets a
 * band of its own at the end. Without saved bands: one under the other in the order of the ids (as before phase 3).
 */
export function bandsOf(ids: string[], saved?: Bands): Bands {
  const have = new Set(ids),
    seen = new Set<string>();
  const out: Bands = [];
  for (const b of saved || []) {
    const c = b.filter((x) => have.has(x) && !seen.has(x) && !!seen.add(x));
    if (c.length) out.push(c);
  }
  for (const x of ids) if (!seen.has(x)) out.push([x]);
  return out;
}
/** The default layout: all one under the other in the order of the ids. */
export const isDefault = (ids: string[], bands: Bands): boolean =>
  bands.length === ids.length && bands.every((b, i) => b.length === 1 && b[0] === ids[i]);
/** True when some band holds more than one table (tables side by side). */
export const hasBeside = (bands: Bands): boolean => bands.some((b) => b.length > 1);
/** For saving: the default layout is not saved (the form stays as it was). */
export const keepBands = (ids: string[], bands: Bands): Bands | undefined =>
  isDefault(ids, bands) ? undefined : bands;
/** The index of the band that holds table `id`, or -1. */
export const bandIndex = (bands: Bands, id: string): number => bands.findIndex((b) => b.includes(id));
/** Where to put a table: first on the sheet, or relative to another table. */
export type Put = { first: true } | { id: string; how: 'below' | 'above' | 'beside' | 'left' };
/**
 * Puts table `id` first on the sheet, or below / above / right of / left of table `to.id` (and in the same band as
 * it).
 */
export function put(bands: Bands, id: string, to: Put): Bands {
  const rest = bands.map((b) => b.filter((x) => x !== id)).filter((b) => b.length);
  if ('first' in to) return [[id], ...rest];
  const i = rest.findIndex((b) => b.includes(to.id));
  if (i < 0 || to.id === id) return bands;
  if (to.how === 'below') rest.splice(i + 1, 0, [id]);
  else if (to.how === 'above') rest.splice(i, 0, [id]);
  else {
    const j = rest[i].indexOf(to.id);
    rest[i].splice(to.how === 'left' ? j : j + 1, 0, id);
  }
  return rest;
}
/** A move of a table by an arrow key. */
export type Step = 'up' | 'down' | 'left' | 'right';
/**
 * Arrows: ←/→ swap places with the neighbour inside the band; ↑/↓ from a band with several tables take the table out
 * above or below them, otherwise move the whole band up or down.
 */
export function step(bands: Bands, id: string, dir: Step): Bands {
  const bi = bandIndex(bands, id);
  if (bi < 0) return bands;
  const b = bands[bi];
  const j = b.indexOf(id);
  if (dir === 'left' || dir === 'right') {
    const k = dir === 'left' ? j - 1 : j + 1;
    if (k < 0 || k >= b.length) return bands;
    const nb = b.slice();
    [nb[j], nb[k]] = [nb[k], nb[j]];
    return bands.map((x, i) => (i === bi ? nb : x));
  }
  if (b.length > 1) {
    const rest = b.filter((x) => x !== id);
    const out = bands.map((x, i) => (i === bi ? rest : x));
    out.splice(dir === 'up' ? bi : bi + 1, 0, [id]);
    return out;
  }
  const k = dir === 'up' ? bi - 1 : bi + 1;
  if (k < 0 || k >= bands.length) return bands;
  const out = bands.slice();
  [out[bi], out[k]] = [out[k], out[bi]];
  return out;
}
/** True when the arrow would change something. */
export const canStep = (bands: Bands, id: string, dir: Step): boolean => step(bands, id, dir) !== bands;
/** Dragging over a box: which zone of the box (x, y from 0 to 1 inside it) says where the dragged table goes. */
export function dropAt(x: number, y: number): 'left' | 'beside' | 'above' | 'below' {
  if (x < 0.28) return 'left';
  if (x > 0.72) return 'beside';
  return y < 0.5 ? 'above' : 'below';
}
/** Where table `id` is relative to the others, in words: «πρώτος», «κάτω από Χ», «δίπλα σε Χ». */
export function whereText(bands: Bands, id: string, name: (id: string) => string): string {
  const bi = bandIndex(bands, id);
  if (bi < 0) return '';
  const b = bands[bi];
  if (b.length > 1) {
    const j = b.indexOf(id);
    return 'δίπλα σε ' + name(b[j ? j - 1 : 1]);
  }
  return bi ? 'κάτω από ' + name(bands[bi - 1][0]) : 'πρώτος';
}
