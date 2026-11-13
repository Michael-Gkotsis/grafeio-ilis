// Pure rules of the «Εξαιρέσεις» tab: the sentence of a period, the sorted list and the three groups.
// Purpose: `when`, `nDays`, `skipItems`, `splitSkips`, `skipBadge` for `useSkips` and its test.
// Does NOT: render anything, read the store or send a command (model/useSkips.ts does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/skips.ts (Phase 6) so it is testable without a
//   render. Εξαιρέσεις (Michael, 24/10): a one-time exception of a person from the duties, from–to, with an optional
//   reason.
// Covering test: test/guard-page-view.test.ts.
import { daysBetween, dm, dow, type ISODate } from '../../../../shared/dates';
import { shortName, type Person, type Skip } from '../../../../shared/domain';

/** A skip with the person it belongs to. */
export interface SkipItem {
  p: Person;
  k: Skip;
}

/** «Παρ 13/11» or «Παρ 13/11 → Κυρ 15/11». */
export const when = (k: Skip) =>
  dow(k.from) + ' ' + dm(k.from) + (k.to > k.from ? ' → ' + dow(k.to) + ' ' + dm(k.to) : '');

/** The days the skip covers, both ends counted. */
export const nDays = (k: Skip) => daysBetween(k.from, k.to);

/** Every skip of every person, earliest first, then by name. */
export const skipItems = (people: Person[]): SkipItem[] =>
  people
    .flatMap((p) => (p.skips || []).map((k) => ({ p, k })))
    .sort((a, b) =>
      a.k.from < b.k.from ? -1 : a.k.from > b.k.from ? 1 : shortName(a.p).localeCompare(shortName(b.p), 'el'),
    );

/** Skips in force today, those that come, and the past ones (latest first). */
export function splitSkips(items: SkipItem[], today: ISODate) {
  return {
    now: items.filter((x) => x.k.from <= today && today <= x.k.to),
    next: items.filter((x) => x.k.from > today),
    past: items.filter((x) => x.k.to < today).reverse(),
  };
}

/** The text of the badge of a group: «ισχύει», «αύριο» / «σε Ν μέρες», «πέρασε». */
export const skipBadge = (tone: string, from: ISODate, today: ISODate) =>
  tone === 'warn'
    ? 'ισχύει'
    : tone === 'info'
      ? daysBetween(today, from) <= 2
        ? 'αύριο'
        : 'σε ' + (daysBetween(today, from) - 1) + ' μέρες'
      : 'πέρασε';

/** The toast after «Πρόσθεσε»/«Αποθήκευση» of an exception; `who` is the short name with rank. */
export const savedText = (edited: boolean, who: string, from: ISODate, to: ISODate) =>
  (edited ? 'Άλλαξε η εξαίρεση: ' : 'Εξαίρεση από υπηρεσίες: ') +
  who +
  ' ' +
  when({ id: '', from, to }) +
  '. Η αυτόματη συμπλήρωση τον προσπερνά εκείνες τις μέρες.';
