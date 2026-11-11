// The list of statuses the declaration offers, and the fixed words of its steps.
// Purpose: `CATS`/`CAT_NAME` (the groups), `STEPS` and `ORDER_STATUS_FIRST` (the four steps and their order),
//   `statusPicks` (every kind of leave and penalty, and the user's own medical kinds, as one list).
// Does NOT: know which one is chosen or filter by the search text (`deriveDeclare` does); no React, no store.
// Owner layer: renderer/features/declare-status. Why: moved verbatim out of screens/people.ts so the dialog files
//   stay under the size limit.
// Covering test: test/screens-dialogs-forms.test.ts (step 2 snapshot), test/status-fix.test.ts.
import type { ListItem } from '../../../../core/model/lists';
import { TYPES, TYPE_KEYS, type Status, type TypeKey } from '../../../../shared/domain';
import { punLbl } from '../../../../shared/punish';
import { leavePhrase } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';

/** The groups of statuses, in the order the list shows them: [key, Greek title]. */
export const CATS: [string, string][] = [
  ['med', 'Ιατρικά'],
  ['abs', 'Απουσίες'],
  ['out', 'Έξοδος'],
  ['other', 'Άλλα'],
  ['pun', 'Ποινή'],
  ['kol', 'Κωλυόμενος'],
];

/** Group key -> Greek title. */
export const CAT_NAME: Record<string, string> = Object.fromEntries(CATS);

/**
 * The four steps of the declaration: first the soldier, then the status (for medical ones, one or several), then from
 * when to when with a remark, and last what will change.
 * @decision Michael 17/10 and 18/10.
 */
export const STEPS = ['Στρατιώτης', 'Κατάσταση', 'Πότε', 'Τι θα αλλάξει'];

/**
 * Step order when the dialog opens from «Ιατρικά και ποινές» (+ Ιατρικό, + Ποινή): the status first, then the soldiers
 * one by one.
 * @decision Michael 18/10.
 */
export const ORDER_STATUS_FIRST = [2, 1, 3, 4];

/** One row of the status list. */
export interface StatusPick {
  /** `TYPE`, `LEAVE:<kind>`, `PUN:<kind>` or `m:<own medical name>`. */
  key: string;
  cat: string;
  type: TypeKey;
  kind?: string;
  short: string;
  long: string;
  help: string;
}

/** A line of help under a status: what it does in practice (from `statSummary`). */
export type PickSummary = (s: Pick<Status, 'type' | 'kind'>) => string;

const ownMedPick = (m: ListItem, sum: PickSummary): StatusPick => ({
  key: 'm:' + m.name,
  cat: 'med',
  type: m.like as TypeKey,
  kind: m.name,
  short: m.name + (m.note ? ' (σημείωση)' : ''),
  long: m.note ? 'Μόνο σημείωση' : m.warn ? 'Μόνο προειδοποίηση' : 'Δικό σου ιατρικό',
  help: m.note
    ? 'Δεν αλλάζει υπηρεσίες, έξοδο, ΗΚΑΙ και Δύναμη'
    : sum({ type: m.like as TypeKey, kind: m.name }) + (m.warn ? ' · προειδοποίηση όταν μπαίνει σε υπηρεσία' : ''),
});

/**
 * All statuses in one list: every kind of leave and penalty on its own, and the user's own medical kinds next to the
 * built-in ones.
 * @param punKinds - the penalty kinds of the user's lists
 * @param leaveKinds - the leave kinds of the user's lists
 * @param meds - the user's own medical kinds (Ρυθμίσεις › Υπηρεσίες και αργίες)
 * @param sum - the one-line help of a status
 * @decision Michael 18/10: the own medical kinds come after the last built-in medical status.
 * @decision Michael 4/11: «Μόνο σημείωση».
 */
export function statusPicks(
  punKinds: string[],
  leaveKinds: string[],
  meds: ListItem[],
  sum: PickSummary,
): StatusPick[] {
  const lastMed = TYPE_KEYS.filter((x) => TYPES[x].cat === 'med').slice(-1)[0];
  return CATS.flatMap(([c]) =>
    TYPE_KEYS.filter((x) => TYPES[x].cat === c).flatMap((k): StatusPick[] => {
      const t = TYPES[k];
      const own = c === 'med' && k === lastMed ? meds.map((m) => ownMedPick(m, sum)) : [];
      if (k === 'LEAVE') {
        return [
          ...leaveKinds.map((n) => ({
            key: 'LEAVE:' + n,
            cat: c,
            type: k,
            kind: n,
            short: n === 'Κανονική' ? t.label : n,
            long: leavePhrase({ type: k, kind: n }),
            help: sum({ type: k, kind: n }),
          })),
          ...own,
        ];
      }
      if (k === 'PUN') {
        return [
          ...punKinds.map((n) => ({
            key: 'PUN:' + n,
            cat: c,
            type: k,
            kind: n,
            short: 'Ποινή',
            long: punLbl(n),
            help: sum({ type: k, kind: n }) + ' · ισχύει αμέσως και γράφεται στην ' + HK() + ' (4. Ποινές)',
          })),
          ...own,
        ];
      }
      const help =
        k === 'KOL'
          ? 'Υπηρεσία εκτός δικών μας (π.χ. ΣΤΕΠ): δεν μπαίνει στις υπηρεσίες μας· φαίνεται στη Δύναμη και στο Σήμερα, και προαιρετικά στην ' +
            HK()
          : sum({ type: k });
      return [{ key: k, cat: c, type: k, short: t.label, long: t.long, help }, ...own];
    }),
  );
}
