// Texts of the duty Κανόνες (Υπηρεσίες › Κανόνες): one line of «what applies» and the description of «Αυστηρά Άοπλοι».
//
// Purpose: `RULE_TXT` (the line for the button, the History and the message after saving), `strictOrderTxt` and
//   `strictTxt` (the order and the description of «Αυστηρά Άοπλοι»), `numRotsTxt` (the numbers that repeat).
// Does NOT: show anything (the screen guard.ts does) or change a rule.
// Owner layer: core/duty (no fs, no Electron, no React); imports core/weapons (ARM_BEFORE, ARM_AFTER).
// Why: pure functions, so the texts can be tested without the screen.
// Covering tests: test/rules-text.test.ts.
import { DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER, type Rules } from '../model/dutyRules';
import type { Settings } from '../model/settings';
import { ARM_AFTER, ARM_BEFORE } from '../weapons/armed';
import { DEFAULT_HK_TIME } from './statuses';
import { strictKeyTxt, strictKeys } from './strictUnarmed';
import { HK } from '../model/unit';

/**
 * «3ο/4ο», «1ο/3ο/4ο»: the numbers with «again at the same number» (`rules.numRots`, default the 3rd and the 4th).
 */
export const numRotsTxt = (r: Pick<Rules, 'numRots'>) =>
  [...(r.numRots ?? DEFAULT_NUM_ROTS)]
    .sort((a, b) => a - b)
    .map((n) => n + 1 + 'ο')
    .join('/');
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * «Μαγειρεία → 2ο-3ο νούμερο → 1ο-4ο νούμερο»: the order of «Αυστηρά Άοπλοι». The user's own duties that were deleted
 * do not show.
 */
export function strictOrderTxt(r: Pick<Rules, 'strictOrder'>, st?: Settings): string {
  const t = strictKeys(r)
    .map((k) =>
      st
        ? strictKeyTxt(st, k)
        : k === 'mg'
          ? 'μαγειρεία'
          : k === 'mid'
            ? '2ο-3ο νούμερο'
            : k === 'edge'
              ? '1ο-4ο νούμερο'
              : '',
    )
    .filter(Boolean)
    .join(' → ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** The description of «Αυστηρά Άοπλοι» (default: as it always was). */
export function strictTxt(r: Pick<Rules, 'strictOrder'>, st?: Settings): string {
  const part = (k: string) =>
    k === 'mg'
      ? 'στα μαγειρεία'
      : k === 'mid'
        ? 'στο 2ο και 3ο νούμερο θαλαμοφύλακα και οπλοφύλακα (αν ο οπλοφύλακας είναι άοπλος στις Ρυθμίσεις)'
        : k === 'edge'
          ? 'στο 1ο και 4ο νούμερο θαλαμοφύλακα'
          : 'στην υπηρεσία «' + (st ? strictKeyTxt(st, k) : '') + '»';
  const ks = strictKeys(r).filter((k) => !k.startsWith('b:') || !st || strictKeyTxt(st, k));
  return 'Οι άοπλοι μπαίνουν πρώτα ' + ks.map(part).join(', μετά ') + '. Σκοποί μόνο ένοπλοι.';
}
/**
 * One line with what applies (on the button, in the History and in the message after saving).
 * @param r the rules, or the draft of the dialog
 */
export const RULE_TXT = (r: Rules & { armBefore?: number; armAfter?: number }, st?: Settings) =>
  [
    r.restDays ? 'ανάπαυση ' + r.restDays + ' ημ. μετά από υπηρεσία' : 'χωρίς ανάπαυση',
    r.numRest ? numRotsTxt(r) + ' νούμερο ξανά μετά από ' + r.numRest + ' ημ.' : '',
    r.noConsecHol ? 'όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες' : 'αργίες χωρίς περιορισμό',
    r.newAvg ? 'οι νέοι ξεκινούν από τον μέσο όρο' : '',
    r.rotate === false ? 'χωρίς εναλλαγή υπηρεσιών' : 'εναλλαγή υπηρεσιών',
    r.strictUnarmed
      ? 'Αυστηρά Άοπλοι' +
        (r.strictOrder && !same(strictKeys(r), DEFAULT_STRICT_ORDER) ? ' (' + strictOrderTxt(r, st) + ')' : '')
      : '',
    r.hkTime && r.hkTime !== DEFAULT_HK_TIME ? 'ώρα ' + HK() + ' ' + r.hkTime : '',
    (r.armBefore ?? ARM_BEFORE) !== ARM_BEFORE || (r.armAfter ?? ARM_AFTER) !== ARM_AFTER
      ? 'το όπλο ένοπλης υπηρεσίας βγαίνει ' +
        (r.armBefore ?? ARM_BEFORE) +
        '′ πριν και μπαίνει ' +
        (r.armAfter ?? ARM_AFTER) +
        '′ μετά'
      : '',
  ]
    .filter(Boolean)
    .join(', ');
