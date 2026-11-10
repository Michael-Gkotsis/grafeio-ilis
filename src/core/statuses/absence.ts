// Absence of a soldier or a cadre member on a day: ΑΠΩΝ, ΑΙΤΙΑ ΑΠΟΥΣΙΑΣ, ΗΜ/ΝΙΑ ΕΠΙΣΤΡΟΦΗΣ.
//
// Purpose: `absenceOfPerson` and `absenceOfCadre` (the `Absence` of one person for one day), and `reasonOf` (the text
//   of the reason).
// Does NOT: write the Έντυπα or the Δυναμολόγιο-Παρουσιολόγιο στελεχών (src/main does), or decide the strength.
// Owner layer: core/statuses (no fs, no Electron, no React); imports core/cadre, core/people and core/duty. It is in
//   statuses and not in cadre because it serves soldiers and cadre alike.
// Why: absent = leave, hospital, ΣΤΕΠ or a declared blocked person (like the absent and the blocked of the Δύναμη);
//   the outs (εξοδούχος, ΔΝ) do not count. Return: the day after the «Έως», or the «Έως» itself if the status has a
//   return time; without an end = empty.
// Covering tests: test/stelexi.test.ts, test/note-only.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import type { Person } from '../model/person';
import { cadreAbsOn } from '../duty/indexes';
import { statusesOn } from '../duty/statuses';
import { live, isAway, leaveMode, statusLbl } from '../people/kinds';
import { cadreStatusOf } from '../cadre/cadre';
import { upper } from '../lib/text';

/** The absence of one person on one day: whether absent, the reason, and the day of the return ('' = no end). */
export interface Absence {
  absent: boolean;
  reason: string;
  ret: ISODate | '';
}
const NONE: Absence = { absent: false, reason: '', ret: '' };
const isAbsent = (st: Status, lists?: AppState['settings']['lists']): boolean => {
  const t = TYPES[st.type];
  if (t.cat === 'out') return false;
  return (
    isAway(st, lists) ||
    st.type === 'KOL' ||
    st.type === 'STEP' ||
    (st.type === 'LEAVE' && leaveMode(st, lists) === 'kol')
  );
};
/** ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ, ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ, ΕΙΣΑΓΩΓΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ… (the user's own leave kind: its name). */
export function reasonOf(st: Pick<Status, 'type' | 'kind' | 'note'>, lists?: AppState['settings']['lists']): string {
  const lbl = statusLbl(st, lists);
  const t = TYPES[st.type];
  if (st.type === 'KOL') return upper(st.note?.trim() || t.long);
  return upper(lbl !== t.label ? lbl : t.long);
}
/** The absence of a soldier on day `d` (away statuses win over the blocked ones). */
export function absenceOfPerson(s: AppState, p: Person, d: ISODate): Absence {
  const lists = s.settings.lists;
  const st = statusesOn(live(s), p.id, d)
    .filter((x) => isAbsent(x, lists))
    .sort((a, b) => Number(isAway(b, lists)) - Number(isAway(a, lists)))[0];
  if (!st) return NONE;
  const timed = !!st.toTime && !st.open;
  return { absent: true, reason: reasonOf(st, lists), ret: st.open ? '' : timed ? st.to : addDays(st.to, 1) };
}
/** The absence of a cadre member on day `d`. */
export function absenceOfCadre(s: AppState, c: Cadre, d: ISODate): Absence {
  const a = cadreAbsOn(s, c.id, d);
  if (!a) return NONE;
  // only what makes him absent or blocked on the ΗΚΑΙ; a kind without a ΗΚΑΙ column («Πουθενά») = present
  const st = cadreStatusOf(a, s.settings.lists);
  if (st.group === 'list') return NONE;
  return { absent: true, reason: upper(st.label), ret: addDays(a.to, 1) };
}
