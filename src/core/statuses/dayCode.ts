// The code of the day of a soldier: one short code for his status on day `d`.
//
// Purpose: `codeOfStatus` (the code of one status), `dayStatus` (the status that wins on the day) and `dayCode` (the
//   code of the day, with ΑΟΠΛΟΣ).
// Does NOT: write the Ημερολόγιο or the Δυναμολόγιο (src/main does), or decide the counts Π/Α (imer.ts does).
// Owner layer: core/statuses (no fs, no Electron, no React); imports core/weapons (weaponInfo) and core/duty.
// Why: Michael, 3/11: the «Δυναμολόγιο αξιολόγησης» and (later) the Ημερολόγιο show one short code per soldier and
//   day. Priority: leave/hospital, ΣΤΕΠ, medical (Ε.Υ, Ε.Α…), ΑΟΠΛΟΣ; empty = normal. The codes are those of
//   TYPES (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, Ε.Α) or the name (the user's own leave/medical kinds, Τ.Α = honorary, ΝΟΣ, ΣΤΕΠ).
// Covering tests: test/axiologisi.test.ts, test/imer.test.ts, test/note-only.test.ts.
import type { ISODate } from '../lib/dates';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { statusesOn } from '../duty/statuses';
import { live, statusLbl } from '../people/kinds';
import { weaponInfo } from '../weapons/weaponInfo';
import { upper } from '../lib/text';

const NAMES: Partial<Record<string, string>> = { NOS: 'ΝΟΣ', HON: 'Τ.Α', STEP: 'ΣΤΕΠ' };
/** The code of a status: the code of the kind, otherwise its name; the user's own leave/medical kind by its name. */
export function codeOfStatus(
  st: Pick<Status, 'type' | 'kind' | 'note'>,
  lists?: AppState['settings']['lists'],
): string {
  const lbl = statusLbl(st, lists);
  const t = TYPES[st.type];
  if (lbl !== t.label) return upper(lbl);
  return upper(NAMES[st.type] || t.code || lbl);
}
// The unarmed depend only on the people and the Ρυθμίσεις (Σ.Ι. × duties): once per state, not once per row
const UNARMED = new WeakMap<object, WeakMap<object, Set<number>>>();
const unarmedOf = (s: AppState, d: ISODate): Set<number> => {
  let m = UNARMED.get(s.people);
  if (!m) {
    m = new WeakMap();
    UNARMED.set(s.people, m);
  }
  let u = m.get(s.settings);
  if (!u) {
    u = weaponInfo(s, d).unarmed;
    m.set(s.settings, u);
  }
  return u;
};
const RANK = (st: Status): number =>
  TYPES[st.type].cat === 'abs' || st.type === 'NOS' ? 0 : st.type === 'STEP' ? 1 : TYPES[st.type].cat === 'med' ? 2 : 9;
/**
 * The status that wins on day `d` (leave/hospital, ΣΤΕΠ, medical) or undefined. The Ημερολόγιο κωλυομένων (imer.ts)
 * uses it without the ΑΟΠΛΟΣ.
 */
export function dayStatus(s: AppState, p: Person, d: ISODate): Status | undefined {
  return statusesOn(live(s), p.id, d)
    .filter((x) => RANK(x) < 9)
    .sort((a, b) => RANK(a) - RANK(b))[0];
}
/** The code of the day: the code of the winning status, otherwise «ΑΟΠΛΟΣ» for the unarmed, otherwise empty. */
export function dayCode(s: AppState, p: Person, d: ISODate): string {
  const st = dayStatus(s, p, d);
  if (st) return codeOfStatus(st, s.settings.lists);
  return unarmedOf(s, d).has(p.id) ? 'ΑΟΠΛΟΣ' : '';
}
