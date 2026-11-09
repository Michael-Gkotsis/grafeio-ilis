// Κείμενα των Κανόνων υπηρεσιών (Υπηρεσίες › Κανόνες): μία γραμμή «τι ισχύει» και η περιγραφή των «Αυστηρά Άοπλοι» με τη σειρά τους.
// Καθαρές συναρτήσεις, ώστε να ελέγχονται· η οθόνη (guard.ts) τα δείχνει.
import { DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER, type Rules, type Settings } from './domain';
import { ARM_AFTER, ARM_BEFORE } from './armed';
import { DEFAULT_HK_TIME, strictKeyTxt, strictKeys } from './rules';
import { HK } from './unit';

// «3ο/4ο», «1ο/3ο/4ο»: τα νούμερα με «ξανά στο ίδιο νούμερο» (rules.numRots, προεπιλογή 3ο και 4ο)
export const numRotsTxt = (r: Pick<Rules, 'numRots'>) =>
  [...(r.numRots ?? DEFAULT_NUM_ROTS)]
    .sort((a, b) => a - b)
    .map((n) => n + 1 + 'ο')
    .join('/');
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
// «Μαγειρεία → 2ο-3ο νούμερο → 1ο-4ο νούμερο»: η σειρά των Αυστηρά Άοπλοι· όσες δικές σου υπηρεσίες διαγράφηκαν δεν φαίνονται
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
// Η περιγραφή των Αυστηρά Άοπλοι (προεπιλογή: όπως ήταν πάντα)
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
// Μία γραμμή με ό,τι ισχύει (στο κουμπί, στο ιστορικό και στο μήνυμα μετά την αποθήκευση). r: κανόνες ή πρόχειρο του παραθύρου
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
