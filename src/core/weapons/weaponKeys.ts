// Weapons: the normal forms and the comparison keys of the weapon number, the rack and the seat in the rack.
//
// Purpose: how a weapon number, a rack («Οπλοβ.») and a seat («Θέση») are written (`normWeapon`, `normRack`,
//   `normPos`),
//   how they are compared (`weaponKey`, `rackKey`, `posKey`, `seatKey`), the text of a seat (`seatTxt`), the sort by
//   seat (`bySeat`) and the warning «Χωρίς θέση» (`noSeat`).
// Does NOT: know about duties, moves or the state of the force; save anything; or block anything (same number for two
//   people, a seat taken twice and the like are warnings and filters).
// Owner layer: core/weapons (no fs, no Electron, no React); imports core/lib only.
// Why: Michael, 17/10: the weapon number came out of the card of the soldier and went to its own card. One number
//   per person (`Person.weapon`), written on the duty form next to the Λ/Υ and the Δ/Υ (core/duty/froura.ts), with the
//   type of the weapon (list «Τύποι όπλων») and the seat in the rack (e.g. Ε6). Every screen and Excel must compare
//   them in the same way.
// Covering tests: test/weapons.test.ts.
import { normGreek, upper } from '../lib/text';
import type { Person } from '../model/person';

/** As written in the Excel files: capitals, one space at most. */
export const normWeapon = (v: unknown) =>
  upper(
    String(v ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
/** For comparison: without spaces, dashes, dots and slashes («12 345», «12-345» and «12345» are the same weapon). */
export const weaponKey = (v: unknown) => normWeapon(v).replace(/[\s.\-/]/g, '');

/** Rack: capitals without spaces («ε 6» → «Ε6»); Latin lookalikes are compared in `rackKey`. */
export const normRack = (v: unknown) =>
  upper(
    String(v ?? '')
      .replace(/\s+/g, '')
      .trim(),
  );
/** «Θέση» of a weapon: free text, in capitals. */
export const normPos = (v: unknown) =>
  upper(
    String(v ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
/** The rack for comparison: no accents, dots, dashes or slashes; Latin lookalikes equal Greek letters («E6» = «Ε6»). */
export const rackKey = (v: unknown) => normGreek(normRack(v)).replace(/[.\-/]/g, '');
/**
 * The seat of the pair (Michael, 24/10): Οπλοβ. + Θέση together, «Ε 23» like «Ε23» (the same normalisation for both
 * parts). Ε+22 and Ε+23 are other seats; the same seat only when both are equal. Empty when the rack or the Θέση is
 * missing: a rack without a Θέση gets only the «Χωρίς θέση», never the «Ίδια θέση» (Michael, 24/10, also for old data
 * like «Ε6» on two people).
 * @decision Michael 24/10: a seat is the pair rack + Θέση.
 */
export const posKey = (v: unknown) => rackKey(v);
/** The key of a seat (rack + Θέση), empty when one of the two is missing. */
export const seatKey = (rack: unknown, wpos: unknown) => {
  const r = rackKey(rack),
    p = posKey(wpos);
  return r && p ? r + '|' + p : '';
};
/** «Ε 23» (or «Ε» when the Θέση is missing), for messages. */
export const seatTxt = (rack: unknown, wpos: unknown) => [normRack(rack), normPos(wpos)].filter(Boolean).join(' ');
const seatCollator = new Intl.Collator('el', { sensitivity: 'base', numeric: true });
/** Sort «Οπλοβ.»: rack, then seat by number (Ε 2 before Ε 10); without a rack at the end. */
export const bySeat = (a: Pick<Person, 'rack' | 'wpos'>, b: Pick<Person, 'rack' | 'wpos'>) =>
  (rackKey(a.rack) ? 0 : 1) - (rackKey(b.rack) ? 0 : 1) ||
  seatCollator.compare(rackKey(a.rack), rackKey(b.rack)) ||
  seatCollator.compare(posKey(a.wpos), posKey(b.wpos));
/** A rack without a Θέση, in force and with a weapon: the warning «Χωρίς θέση». */
export const noSeat = (p: Pick<Person, 'active' | 'weapon' | 'rack' | 'wpos'>) =>
  !!p.active && !!weaponKey(p.weapon) && !!rackKey(p.rack) && !posKey(p.wpos);
