// What the «Λήξη άδειας» dialog says: its wording, description line and the effect of the chosen time.
// Purpose: plain functions that build the texts of `LeaveEndDialog`, so the component keeps only state and layout.
// Does NOT: touch React, the store or the clock (the caller passes the time rules in).
// Owner layer: renderer/features/leave-end. Why: the dialog function stays under the size limit with the same texts.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { dm } from '../../../../shared/dates';
import { TYPES, type Status, type TypeKey } from '../../../../shared/domain';
import { timeNames } from '../../../../shared/hours';
import { statusLbl } from '../../../../shared/ranks';
import type { UserLists } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';

/** The words of the dialog for a leave («άδεια») or for a hospital / ΣΤΕΠ stay. */
export interface LeaveWording {
  title: string;
  cancel: string;
  go: string;
  intro: string;
}

/** Everything about the status type that the texts depend on. */
export interface LeaveKind {
  /** A leave (category `abs`); false for hospital and ΣΤΕΠ. */
  abs: boolean;
  /** `timeNames(type)`: «Μέρα/Ώρα …» words of the type. */
  tn: ReturnType<typeof timeNames>;
  /** The long type name, lower case. */
  what: string;
  W: LeaveWording;
}

/** The wording for a status: a leave comes back («Γύρισε»), a hospital or ΣΤΕΠ stay goes out («Βγήκε»). */
export function leaveKind(st: Status): LeaveKind {
  const abs = TYPES[st.type as TypeKey].cat === 'abs';
  const what = TYPES[st.type as TypeKey].long.toLowerCase();
  const W: LeaveWording = abs
    ? {
        title: 'Διακοπή άδειας',
        cancel: 'Ακύρωση άδειας',
        go: 'Γύρισε',
        intro: 'Γύρισε νωρίτερα (π.χ. ανακλήθηκε): η άδεια τελειώνει',
      }
    : { title: 'Έξοδος νωρίτερα', cancel: 'Διαγραφή', go: 'Βγήκε', intro: 'Βγήκε νωρίτερα: η ' + what + ' τελειώνει' };
  return { abs, tn: timeNames(st.type), what, W };
}

/** The small line under the title: person, status and the dates (with times when there are any). */
export const leaveDescription = (personName: string, st: Status, lists: UserLists | undefined): string =>
  personName +
  ' · ' +
  statusLbl(st, lists) +
  ' ' +
  dm(st.from) +
  (st.fromTime ? ' ' + st.fromTime : '') +
  ' – ' +
  (st.open ? 'χωρίς λήξη' : dm(st.to) + (st.toTime ? ' ' + st.toTime : ''));

/**
 * The first day offered: the end date when it has passed, else today, never before the start.
 * @param today - ISODate
 */
export const firstReturnDay = (st: Status, today: string): string => {
  const max = st.open ? undefined : st.to;
  return max && max < today ? max : today < st.from ? st.from : today;
};

/**
 * What the time means on the day he comes back (same rules as the leave's hours; ΣΤΕΠ counts as unavailable in the
 * ΗΚΑΙ until he goes out).
 * @param t - the normalised time ("HH:MM"), or an empty string for no time
 * @param hk - the ΗΚΑΙ time ("HH:MM")
 * @param out - the out time of that day ("HH:MM")
 * @decision Michael, 29/10: ΣΤΕΠ is unavailable in the ΗΚΑΙ until the out time.
 */
export function returnEffect(t: string, hk: string, out: string): string {
  if (!t) return 'Χωρίς ώρα η μέρα αυτή μετρά ολόκληρη· παρών από την επόμενη μέρα.';
  if (t <= hk) {
    return 'Εκείνη τη μέρα μετρά παρών και στην ' + HK() + ', βγαίνει έξοδο και μπαίνει σε υπηρεσίες.';
  }
  if (t <= out) {
    return (
      'Εκείνη τη μέρα βγαίνει κανονικά έξοδο και μπαίνει σε υπηρεσίες που ξεκινούν μετά τις ' +
      t +
      '· στην ' +
      HK() +
      ' μετρά παρών από την επόμενη μέρα.'
    );
  }
  return (
    'Εκείνη τη μέρα μπαίνει σε υπηρεσίες που ξεκινούν μετά τις ' +
    t +
    '· έξοδος και ' +
    HK() +
    ' κανονικά από την επόμενη μέρα.'
  );
}
