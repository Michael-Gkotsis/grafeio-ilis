// Pure rules of the medical, penalty and leave lists («Ιατρικά», «Ποινές», «Άδειες»).
// Purpose: which statuses each tab lists, the counts on the tabs and the texts under a name.
// Does NOT: read the store, draw anything or write commands (model/useRecordList.ts and model/useLeaves.ts do).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/other.ts and screens/leaves.ts
//   (Phase 6.0), so the three status screens read the same rules.
// Covering test: test/note-only.test.ts, test/screens-main.test.ts, test/screens-tabs.test.ts.
import { addDays, dayName, daysBetween, dm } from '../../../../shared/dates';
import { TYPES, coversDay, fullName, type AppState, type Person, type Status } from '../../../../shared/domain';
import { timeNames } from '../../../../shared/hours';
import { punDays, skippedDays } from '../../../../shared/punish';
import { medNote, notesOf, statusLbl, type UserLists } from '../../../../shared/ranks';
import { awayNow } from '../../../../shared/rules';
import { collator, normGreek } from '../../../../shared/text';

/** Tabs of «Ιατρικά» (first is the default). */
export const MED_TABS = ['med', 'changes', 'expired', 'notes'];
/** Tabs of «ΗΚΑΙ › Ποινές» (first is the default). */
export const PUN_TABS = ['pun', 'expired', 'allpun'];

/** Everything the list of a tab depends on. `pm` is the person map of the state. */
export interface RecordQuery {
  state: AppState;
  pm: Map<number, Person>;
  mode: 'med' | 'pun';
  tab: string;
  /** ISODate, local time. */
  today: string;
  /** Minutes since midnight, local time. */
  now: number;
  /** The text typed in the search box. */
  query: string;
  /** Medical kind filter of the «Τώρα» tab, '' for all. */
  medF: string;
  /** ISODate of the «Μεταβολές ημέρας» tab. */
  chDay: string;
}

/**
 * A medical record that counts in «Τώρα / Μεταβολές / Έληξαν».
 * @decision Michael 4/11: «μόνο σημείωση» records do not count there, they have their own tab.
 */
export const isMedStatus = (s: Status, lists: UserLists | undefined) =>
  ['med', 'other'].includes(TYPES[s.type].cat) && !medNote(s, lists);

/** The statuses a tab lists, already sorted. The search covers name, code, penalty kind, note, who punished and why. */
export function recordRows({ state, pm, mode, tab, today, now, query, medF, chDay }: RecordQuery): Status[] {
  const nl = state.settings.lists;
  const qq = normGreek(query.trim());
  const ok = (s: Status) =>
    pm.has(s.pid) &&
    (!qq ||
      normGreek(
        fullName(pm.get(s.pid)!) +
          ' ' +
          TYPES[s.type].label +
          ' ' +
          TYPES[s.type].long +
          ' ' +
          (s.kind || '') +
          ' ' +
          (s.note || '') +
          ' ' +
          (s.by || '') +
          ' ' +
          (s.reason || ''),
      ).includes(qq));
  if (tab === 'notes')
    return notesOf(state.statuses, nl)
      .filter((s) => pm.has(s.pid) && !s.pending && coversDay(s, today) && ok(s))
      .sort(
        (a, b) =>
          collator.compare(pm.get(a.pid)!.last, pm.get(b.pid)!.last) ||
          collator.compare(pm.get(a.pid)!.first, pm.get(b.pid)!.first),
      );
  if (tab === 'allpun')
    return state.statuses.filter((s) => s.type === 'PUN' && ok(s)).sort((a, b) => b.from.localeCompare(a.from));
  if (tab === 'changes')
    return state.statuses
      .filter((s) => isMedStatus(s, nl) && !s.pending && (s.from === chDay || (!s.open && s.to === chDay)) && ok(s))
      .sort((a, b) => Number(b.from === chDay) - Number(a.from === chDay) || a.to.localeCompare(b.to));
  if (tab === 'expired')
    return state.statuses
      .filter(
        (s) =>
          (mode === 'med' ? isMedStatus(s, nl) : s.type === 'PUN') &&
          !s.pending &&
          !awayNow(s, today, now) &&
          s.to >= addDays(today, -14) &&
          ok(s),
      )
      .sort((a, b) => b.to.localeCompare(a.to));
  return state.statuses
    .filter(
      (s) =>
        awayNow(s, today, now) &&
        (tab === 'med'
          ? isMedStatus(s, nl) && (!medF || statusLbl(s, state.settings.lists) === medF)
          : s.type === 'PUN') &&
        ok(s),
    )
    .sort((a, b) => a.to.localeCompare(b.to));
}

/** ΕΥ, ΕΑ, ΕΟ, ΣΤΕΠ… as filters, with how many people have each one, biggest first (Michael 17/10). */
export function medCounts(state: AppState, pm: Map<number, Person>, today: string, now: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of state.statuses) {
    if (awayNow(s, today, now) && isMedStatus(s, state.settings.lists) && pm.has(s.pid)) {
      const l = statusLbl(s, state.settings.lists);
      counts.set(l, (counts.get(l) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** Numbers on the tabs: people away with a medical now, notes in force, penalties in force or in the future. */
export function recordCounts(state: AppState, pm: Map<number, Person>, today: string, now: number, hasNotes: boolean) {
  const nl = state.settings.lists;
  return {
    nMed: state.statuses.filter((s) => awayNow(s, today, now) && isMedStatus(s, nl)).length,
    nNote: hasNotes
      ? notesOf(state.statuses, nl).filter((s) => pm.has(s.pid) && !s.pending && coversDay(s, today)).length
      : 0,
    nPun: state.statuses.filter((s) => s.to >= today && s.type === 'PUN' && pm.has(s.pid)).length,
  };
}

/** How long a record still lasts, or since when it ended. */
export function leftTxt(s: Status, today: string): string {
  if (s.to < today) {
    const d = daysBetween(s.to, today) - 1;
    return d === 1 ? 'έληξε χθες' : 'έληξε πριν από ' + d + ' ημ.';
  }
  if (s.open) return 'χωρίς λήξη (κενό «έως» στο Excel)';
  const n = daysBetween(today, s.to) - 1;
  return s.from > today
    ? 'ξεκινά ' + dayName(s.from, today).toLowerCase()
    : n === 0
      ? 'λήγει σήμερα'
      : n === 1
        ? 'λήγει αύριο'
        : 'λήγει σε ' + n + ' ημ.';
}

/** Loss of leave: which days did not count (duty, evening training), so it shows why the end moved. */
export function skipTxt(state: AppState, s: Status): string {
  const k = skippedDays(state, s);
  return k.length
    ? ' · ' +
        punDays(s) +
        ' ημ. ποινή, δεν μετράνε: ' +
        k.map((x) => dm(x.date) + ' ' + (x.why === 'duty' ? 'υπηρεσία' : 'βραδινή εκπαίδευση')).join(', ')
    : '';
}

/** The "when" part of the line under a name, which depends on the tab. `y` is yesterday. */
export function detailTxt(s: Status, tab: string, today: string, chDay: string, y: string): string {
  if (tab === 'changes')
    return [
      s.from === chDay && 'ξεκινά ' + (chDay === today ? 'σήμερα' : dm(chDay)),
      !s.open && s.to === chDay && (s.to < today ? 'έληξε ' : 'λήγει ') + (chDay === today ? 'σήμερα' : dm(chDay)),
    ]
      .filter(Boolean)
      .join(' και ');
  if (tab === 'expired')
    return s.to === today
      ? timeNames(s.type).to + ' σήμερα ' + s.toTime
      : 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1)));
  if (tab === 'notes') return s.open ? 'χωρίς λήξη' : 'ως ' + dm(s.to);
  return leftTxt(s, today);
}

/** Who punished and why, for a penalty line. */
export const punByTxt = (s: Status): string =>
  s.type === 'PUN' && (s.by || s.reason)
    ? ' · ' + [s.by && 'από ' + s.by, s.reason && 'διότι ' + s.reason].filter(Boolean).join(', ')
    : '';

/** The text of the empty list. */
export function emptyTxt(mode: 'med' | 'pun', tab: string, today: string, chDay: string): string {
  if (tab === 'expired') return 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.';
  if (tab === 'changes') return 'Κανένα ιατρικό δεν ξεκινά ή λήγει ' + (chDay === today ? 'σήμερα' : dm(chDay)) + '.';
  if (mode === 'med') return tab === 'notes' ? 'Καμία σημείωση υγείας σε ισχύ.' : 'Κανένα ιατρικό σε ισχύ.';
  return 'Καμία ποινή σε ισχύ.';
}
