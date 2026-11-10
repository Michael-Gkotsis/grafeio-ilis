// How many times each person came out of a random report («τυχαίοι»).
//
// Purpose: `repTimes` (the counts of one report) and `countTimes` (add one output), kept in `meta.json` `repTimes`
//   under the ΕΣΣΟ key they were counted in.
// Does NOT: pick the people (the renderer and `shared/reports` do), write a report, or reset anything by itself.
// Owner layer: main (architecture), `features/reports`. Imports app/*.
// Why: moved verbatim from main.ts (Phase 4.4). `meta.json` is a frozen data file (CLAUDE.md rule 3).
// Covering test: test/reports*.test.ts; the Electron comparison in the PR description.
import { readMeta, writeMeta } from '../../app/meta';
import { store } from '../../app/state';

// random picks: how many times each one came out in this report (a new ΕΣΣΟ changes settings.essos, so it starts over)
const essoKey = () => JSON.stringify(store.state.settings.essos || null);
/** How many times each person came out of a random report: person id (string) to count; empty after a new ΕΣΣΟ. */
export function repTimes(id: string): Record<string, number> {
  const t = readMeta().repTimes?.[id];
  return t && t.essos === essoKey() ? t.n : {};
}
/** Counts one more output for each of `ids` in the random report `id` (under the current ΕΣΣΟ key). */
export function countTimes(id: string, ids: (number | string)[]) {
  const n = { ...repTimes(id) };
  for (const x of ids) n[String(x)] = (n[String(x)] || 0) + 1;
  writeMeta({ repTimes: { ...(readMeta().repTimes || {}), [id]: { essos: essoKey(), n } } });
}
