// Outs and stayers of a day (sample 10, Excel «Εξοδούχοι / Παραμένοντες»).
//
// Purpose: `outsAndStay` (who is out and who stays in on day `d`), `stayNote` (what keeps a stayer in), the leave
//   shown for the outs (`awayIn`, `awayAtOut`, `awayName`, `awayNote`) and the order by room (`byRoom`).
// Does NOT: write the Excel file (src/main/exports.ts does), save anything, or group the whole force (outsDay.ts does).
// Owner layer: core/outs (no fs, no Electron, no React); imports core/hkai (byName), core/people, core/duty.
// Why: in the Δύναμη of the forms (shared/values.ts) the same people count. Out time: whoever came back by then counts
//   as if he was inside.
// Covering tests: test/outs-combos.test.ts, test/one-exit-time.test.ts, test/outs-screen-leave.test.ts,
//   test/values.test.ts.
import type { ISODate } from '../lib/dates';
import { TYPES, coversDay, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { activePeople } from '../duty/indexes';
import { outMinOn } from '../duty/presence';
import { postOf } from '../duty/posts';
import { statusesFrom } from '../duty/statuses';
import { byName } from '../hkai/hkaiText';
import { live, isAway, leavePhrase, statusLbl } from '../people/kinds';
import type { UserLists } from '../model/lists';
import { norm } from '../lib/text';
import { outNoteOf, withNote } from './weekend';
import { stillOut, retFor } from './returns';
import { dm, dow } from '../lib/dates';
import { hasTimes } from '../statuses/hours';

/** Order by room, then by name (people without a room go last). */
export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);
/**
 * What keeps a stayer in (duty, ΣΤΕΠ, penalty, medical, post) and the note of the day: the Παραμένοντες and the Γ of
 * the «Όλη η δύναμη». `ss`: his statuses from the out time; `hours`: the duty with its hours («Λ/Υ 14:00 → 14:00»).
 */
export function stayNote(s: AppState, d: ISODate, p: Person, ss: Status[], hours = false): string {
  const post = postOf(s, d, p.id);
  // a penalty that is still asked for keeps him in too (clerk, 10/10)
  const pend = s.statuses.filter((x) => x.pid === p.id && x.type === 'PUN' && x.pending && coversDay(x, d));
  // two statuses of the same kind on the same day: once («ΣΤΕΠ», not «ΣΤΕΠ, ΣΤΕΠ»)
  const note = [
    ...new Set(
      [
        ...ss.map((x) => statusLbl(x, s.settings.lists)),
        ...pend.map((x) => statusLbl(x, s.settings.lists)),
        post ? post.label + (hours && post.hrs ? ' ' + post.hrs : '') : '',
        p.post || '',
      ].filter(Boolean),
    ),
  ].join(', ');
  return norm(withNote(note, outNoteOf(s, d, p.id)));
}
/**
 * On leave / in hospital at the out time: neither out nor stayer. `ss`: his statuses from the out time
 * (`statusesFrom`); the hospital is preferred.
 */
export const awayIn = (ss: Status[], lists?: UserLists): Status | null => {
  const a = ss.filter((x) => isAway(x, lists) && TYPES[x.type].cat !== 'out' && !x.pending);
  return a.find((x) => x.type === 'NOS') || a[0] || null;
};
/** The leave / hospital status of `pid` at the out time of day `d`, or null. */
export const awayAtOut = (s: AppState, d: ISODate, pid: number): Status | null =>
  awayIn(statusesFrom(live(s), pid, d, outMinOn(s, d)), s.settings.lists);
/** The first button of the Εξοδούχοι for whoever is on leave: in the place of «Μένει». */
export const awayName = (st: Pick<Status, 'type'>) => (st.type === 'NOS' ? 'Νοσοκομείο' : 'Σε άδεια');
/** «Κανονική άδεια ως 05/11 · γυρνά Πέμ 06/11 πρωί»: a neutral note on his row (not a warning). */
export function awayNote(s: AppState, d: ISODate, pid: number, st: Status): string {
  // leave: named with its kind, not «ΚΑ»
  const lbl = statusLbl(st, s.settings.lists),
    long = st.type === 'LEAVE' ? leavePhrase(st) : lbl === TYPES[st.type].label ? TYPES[st.type].long : lbl;
  const r = retFor(s, pid, d);
  const until = st.open ? 'χωρίς λήξη' : st.to !== d && !(st.toTime && hasTimes(st.type)) ? 'ως ' + dm(st.to) : '';
  const back =
    !r || r.open || r.pending
      ? ''
      : 'γυρνά ' + dow(r.day) + ' ' + dm(r.day) + ' ' + (r.time || 'πρωί') + (r.duty ? ' για υπηρεσία' : '');
  return [long + (until ? ' ' + until : ''), back].filter(Boolean).join(' · ');
}
/** The outs and the stayers of day `d`, each by room. People on leave / in hospital at the out time are in neither. */
export function outsAndStay(
  s: AppState,
  d: ISODate,
): { outs: { p: Person; st: Status }[]; stay: { p: Person; note: string }[] } {
  const outs: { p: Person; st: Status }[] = [];
  const stay: { p: Person; note: string }[] = [];
  for (const p of activePeople(s)) {
    // came back by the out time: counts as if he was inside (out or stayer)
    const ss = statusesFrom(live(s), p.id, d, outMinOn(s, d));
    const o = ss.find((x) => TYPES[x.type].cat === 'out');
    if (o) {
      outs.push({ p, st: o });
      continue;
    }
    // still out from an out/ΔΝ of an earlier day (correction «returns later», «does not return»): not a stayer
    const held = stillOut(s, p.id, d);
    if (held) {
      outs.push({ p, st: held.st });
      continue;
    }
    if (awayIn(ss, s.settings.lists)) continue; // on leave / in hospital: neither out nor stayer
    stay.push({ p, note: stayNote(s, d, p, ss) });
  }
  // by room, as the papers come (clerk, 10/10)
  outs.sort((a, b) => byRoom(a.p, b.p));
  stay.sort((a, b) => byRoom(a.p, b.p));
  return { outs, stay };
}
