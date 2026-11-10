// Finding a measure of the catalogue by id, by label or by group.
//
// Purpose: `metricOf`, `metricLabel`, `metricByTag` and `metricGroups`, with the maps built once per catalogue.
// Does NOT: define the measures (metrics.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/reports/metricDefs,
//   core/reports/metrics, core/reports/valueTags.
// Why: the lookups are asked for every term of every row, so the maps are WeakMaps keyed by the catalogue array: one
//   instance each, here, and dropped with the settings.
// Covering tests: test/values.test.ts, test/report-blank-tags.test.ts.
import type { AppState } from '../model/state';
import type { Metric } from './metricDefs';
import { metricsOf } from './metrics';
import { tagId } from './valueTags';

const BY_ID = new WeakMap<Metric[], Map<string, Metric>>();
/** The measure with this id, or undefined (found in a map built once per catalogue). */
export function metricOf(s: AppState, id: string): Metric | undefined {
  const l = metricsOf(s);
  let m = BY_ID.get(l);
  if (!m) {
    m = new Map(l.map((x) => [x.id, x]));
    BY_ID.set(l, m);
  }
  return m.get(id);
}
/** The name of a measure, or «(δεν υπάρχει πια)» when it was removed. */
export const metricLabel = (s: AppState, id: string) => metricOf(s, id)?.label || '(δεν υπάρχει πια)';
// label → measure, built once per catalogue
const BY_TAG = new WeakMap<Metric[], Map<string, Metric>>();
/**
 * The measure whose label is `tag`: the `tagText` of its label, e.g. «Παρόντες» → {ΠΑΡΟΝΤΕΣ}. If two measures have the
 * same label (or the same first 40 letters), the first of the catalogue counts.
 * @decision Michael 29/10: a «κενός πίνακας» with numbers from the app, without a values table.
 */
export function metricByTag(s: AppState, tag: unknown): Metric | undefined {
  const l = metricsOf(s);
  let m = BY_TAG.get(l);
  if (!m) {
    m = new Map();
    for (const x of l) {
      const id = tagId(x.label);
      if (id && !m.has(id)) m.set(id, x);
    }
    BY_TAG.set(l, m);
  }
  return m.get(tagId(tag));
}
/** The groups in the order they appear in the catalogue. */
export function metricGroups(s: AppState): { group: string; items: Metric[] }[] {
  const out = new Map<string, Metric[]>();
  for (const m of metricsOf(s)) {
    const l = out.get(m.group);
    if (l) l.push(m);
    else out.set(m.group, [m]);
  }
  return [...out].map(([group, items]) => ({ group, items }));
}
