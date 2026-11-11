// Small texts shared by the weapon move dialogs and pop-ups.
// Purpose: `reasonLbl`, `stayTxt`, `namesOf` and `when` build the strings that appear in toasts, chips and descriptions.
// Does NOT: read the store or draw anything.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts, test/screens-dialogs-forms.test.ts (weaponMoves-*).
import { shortName, type Person } from '../../../../shared/domain';
import { dm } from '../../../../shared/dates';
import { AUTO_KEY } from '../../../../shared/weapons';

/**
 * A reason as the strip and the filter show it: as written, and «Υπηρεσία (αυτόματα)» for the armed duties
 * (not the same as the hand-typed reason ΥΠΗΡΕΣΙΑ).
 */
export const reasonLbl = (r: string) => (r === AUTO_KEY ? 'Υπηρεσία (αυτόματα)' : r);

/** « · Μένει ΕΚΤΟΣ λόγω υπηρεσίας …» at the end of the undo toast, when there is something to say. */
export const stayTxt = (l: string[]) => (l.length ? ' · ' + l.join(' · ') : '');

/** The first `n` short names, then «και N ακόμα». */
export const namesOf = (ps: Person[], n = 6) =>
  ps.slice(0, n).map(shortName).join(', ') + (ps.length > n ? ' και ' + (ps.length - n) + ' ακόμα' : '');

/**
 * Day and time in a toast or a pop-up: the day is left out when it is today.
 * @param day - ISODate, local time
 * @param time - `ΩΩ:ΛΛ`
 * @param today - ISODate, local time
 */
export const when = (day: string, time: string, today: string) => (day === today ? '' : dm(day) + ' ') + time;
