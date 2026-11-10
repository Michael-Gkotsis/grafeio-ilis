// Names for the history text of a command.
//
// Purpose: `who` (one name or «N άτομα») and `whoNames` (a group of weapon moves: the first names and «και N ακόμα»).
// Does NOT: build the whole history text.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: The history shows who a group action was for (Michael, 24/10).
// Covering tests: test/weapons.test.ts.
import { shortName } from '../model/person';
import type { AppState } from '../model/state';
import { personMap } from '../duty/indexes';

/** One short name, or «N άτομα», for the history text. */
export const who = (s: AppState, pids: number[]) => {
  const pm = personMap(s.people);
  return pids.length === 1 ? shortName(pm.get(pids[0])!) : pids.length + ' άτομα';
};
/** Group weapon moves: «10 άτομα (Α, Β… και 4 ακόμα)», so that the History shows who they were (Michael, 24/10). */
export const whoNames = (s: AppState, pids: number[]) => {
  if (pids.length === 1) return who(s, pids);
  const pm = personMap(s.people);
  const ns = pids
    .map((id) => pm.get(id))
    .filter(Boolean)
    .map((p) => shortName(p!));
  return (
    pids.length +
    ' άτομα (' +
    ns.slice(0, 6).join(', ') +
    (ns.length > 6 ? ' και ' + (ns.length - 6) + ' ακόμα' : '') +
    ')'
  );
};
