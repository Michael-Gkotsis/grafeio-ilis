// Pure view logic of «Σήμερα»: who is away, which records end, the sentence for each ending record and the tasks.
// Purpose: the computations TodayScreen used inline (moved as they were), so the page stays short and they can be read
//   and tested without React.
// Does NOT: render, read the store (callers pass `state`) or change any rule (the rules are in src/shared).
// Owner layer: renderer/pages/today. Why: moved from screens/todayView.ts (Phase 6) together with the small text
//   helpers the component built inline.
// Covering test: test/today-page-view.test.ts, test/screens-main.test.ts (HTML snapshot), test/notes.test.ts.
import type { Boot } from '../../../../shared/api';
import type { AppState, Person, Status } from '../../../../shared/domain';
import { RECORD_CATS, TYPES, TYPE_KEYS, dutyStartOf, kolColName, shortName } from '../../../../shared/domain';
import { dm, dmy, dow, parseD, DOW_GEN, type ISODate } from '../../../../shared/dates';
import { live, isAway, noDutyOf, statusLbl } from '../../../../shared/ranks';
import { awayNow, activePeople, isRecordExpiredOn, statusesAt, statusesOn, strengthAt } from '../../../../shared/rules';
import { punLbl } from '../../../../shared/punish';
import { HK } from '../../../../shared/unit';
import { returnOf } from '../../../../shared/returns';
import { USB_DAYS, usbAge } from '../../../../shared/reminders';
import { noteDue, noteGroups, noteHead, noteWho } from '../../../../shared/notes';
import type { Nav } from '../../../shared/model';
import { reqWaiting } from '../../../shared/lib/reqWaiting';

/** One person who is away today, with the status that makes them away. */
export interface AwayRow {
  p: Person;
  s: Status;
}

/** What {@link scanRecords} finds. */
export interface RecordScan {
  /** Medical records and penalties that end today. */
  ending: Status[];
  /** Medical records and penalties that end tomorrow. */
  endTom: Status[];
  /** Records that expired yesterday. */
  expired: Status[];
  /** Records in force today (known or not). */
  nRec: number;
}

/**
 * Away today with the reason, sorted by status type, end date and name.
 * @param state - the app state
 * @param today - ISODate, local app time
 * @param now - minutes since midnight, local time
 */
export function awayToday(state: AppState, today: ISODate, now: number): AwayRow[] {
  // Like the ΗΚΑΙ (present until 08:00), then whoever came back by now (Michael, 20/10), and the out/DN person by
  // the hour (present until the start of the leave, away until the return), like the Δύναμη screen
  const at = strengthAt(state.rules, today, today, now);
  const out = activePeople(state).flatMap((p): AwayRow[] => {
    const x = statusesAt(state, p.id, today, at).find((q) => isAway(q, state.settings.lists));
    return x ? [{ p, s: x }] : [];
  });
  return out.sort(
    (a, b) =>
      TYPE_KEYS.indexOf(a.s.type) - TYPE_KEYS.indexOf(b.s.type) ||
      a.s.to.localeCompare(b.s.to) ||
      shortName(a.p).localeCompare(shortName(b.p), 'el'),
  );
}

/**
 * Out/DN: until when the person is away («ως 22:00», «ως Δευ 06:00»), else «σήμερα» when the return is unknown.
 * @param state - the app state
 * @param s - the out or DN status
 * @param today - ISODate, local app time
 */
export function outUntilText(state: AppState, s: Status, today: ISODate): string {
  const r = returnOf(state, s.pid, s.from);
  return !r || r.pending || r.open ? 'σήμερα' : 'ως ' + (r.day === today ? '' : dow(r.day) + ' ') + r.time;
}

/**
 * One scan of all statuses, only when they change (not on every render of «Σήμερα»).
 * @param state - the app state
 * @param pm - people by id (a status of an unknown person is only counted, never listed)
 * @param today - ISODate, local app time
 * @param tomorrow - ISODate, `today + 1`
 */
export function scanRecords(
  state: AppState,
  pm: ReadonlyMap<number, Person>,
  today: ISODate,
  tomorrow: ISODate,
): RecordScan {
  const o: RecordScan = { ending: [], endTom: [], expired: [], nRec: 0 };
  for (const s of live(state)) {
    const cat = TYPES[s.type].cat;
    const rec = RECORD_CATS.includes(cat);
    const known = pm.has(s.pid);
    if (s.from <= today && s.to >= today && rec) o.nRec++;
    if (!known) continue;
    // Only medical records and penalties: leaves show in «Ποιοι γυρίζουν» (not the same person three times)
    if (s.to === today && rec) o.ending.push(s);
    if (s.to === tomorrow && (rec || s.type === 'PUN')) o.endTom.push(s);
    if (isRecordExpiredOn(s, today)) o.expired.push(s);
  }
  return o;
}

/**
 * The sentence next to a record that ends today: what happens to the person from tomorrow.
 * @param state - the app state
 * @param s - the ending status
 * @param today - ISODate, local app time
 * @param tomorrow - ISODate, `today + 1`
 * @param now - minutes since midnight, local time
 */
export function endText(state: AppState, s: Status, today: ISODate, tomorrow: ISODate, now: number): string {
  const t = TYPES[s.type];
  if (t.cat === 'abs')
    return awayNow(s, today, now)
      ? 'Αναμένεται επιστροφή' + (s.toTime ? ' στις ' + s.toTime : '')
      : 'Γύρισε στις ' + s.toTime;
  // Another medical record that goes on tomorrow: says what remains, not that the person comes back
  const rest = statusesOn(live(state), s.pid, tomorrow).filter((x) => x.id !== s.id && TYPES[x.type].cat !== 'out');
  const lbl = (x: Status) => statusLbl(x, state.settings.lists) + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to));
  const nd = rest.find((x) => noDutyOf(x, state.settings.lists)),
    na = rest.find((x) => TYPES[x.type].noArmed);
  if (noDutyOf(s, state.settings.lists))
    return nd
      ? 'Μένει ' + lbl(nd)
      : na
        ? 'Από αύριο ξαναμπαίνει σε υπηρεσίες, όχι σε ένοπλες (' + lbl(na) + ')'
        : 'Από αύριο ξαναμπαίνει σε υπηρεσίες';
  if (t.noArmed) return nd || na ? 'Μένει ' + lbl((nd || na)!) : 'Από αύριο ξαναμπαίνει και σε ένοπλες θέσεις';
  return 'Από αύριο μπορεί να βγει έξοδο';
}

/** One line of «Πρέπει σήμερα»: what to do, why, and the button that does it. */
export interface TodayTask {
  key: string;
  title: string;
  sub: string;
  urgent?: boolean;
  btn: string;
  fn: () => void;
}

/** What {@link todayTasks} reads. */
export interface TodayTaskInput {
  state: AppState;
  /** People by id. */
  pm: ReadonlyMap<number, Person>;
  /** ISODate, local app time. */
  today: ISODate;
  /** ISODate, `today + 1`. */
  tomorrow: ISODate;
  /** Number of empty seats in tomorrow's ΦΡΟΥΡΑ. */
  empty: number;
  /** True when the USB copy is due. */
  due: boolean;
  boot: Boot;
  nav: Nav;
  /** «Αντίγραφο σε USB». */
  usb: () => void;
}

/**
 * What must be done today, numbered on the screen: empty seats tomorrow, requests waiting for an answer, notes whose
 * reminder has come, and a USB copy that is due.
 * @param a - state, today, and the pieces the screen already computed
 */
export function todayTasks({ state, pm, today, tomorrow, empty, due, boot, nav, usb }: TodayTaskInput): TodayTask[] {
  const tasks: TodayTask[] = [];
  if (empty > 0)
    tasks.push({
      key: 'empty',
      title: 'Υπηρεσίες αύριο, ' + dow(tomorrow) + ' ' + dm(tomorrow),
      sub: empty + (empty === 1 ? ' κενή θέση' : ' κενές θέσεις') + ' · πριν τις ' + dutyStartOf(state.settings),
      urgent: true,
      btn: 'Συμπλήρωσε',
      fn: () => nav.go('guard', { guardDate: tomorrow }),
    });
  const waiting = reqWaiting(state.requests).filter((r) => pm.has(r.pid));
  if (waiting.length)
    tasks.push({
      key: 'req',
      title: waiting.length === 1 ? 'Αίτηση περιμένει απάντηση' : waiting.length + ' αιτήσεις περιμένουν απάντηση',
      sub:
        waiting.map((r) => shortName(pm.get(r.pid)!)).join(', ') +
        ' · πάτα «Εγκρίθηκε» ή «Απορρίφθηκε» όταν υπογράψει ο Διοικητής',
      btn: 'Άνοιξε',
      fn: () => nav.go('records', { stTab: 'req' }),
    });
  // Notes whose reminder has come (Michael, 24/10): the oldest first
  const remNotes = noteGroups(
    (state.notes || []).filter((n) => noteDue(n, today)),
    today,
  ).due;
  if (remNotes.length)
    tasks.push({
      key: 'notes',
      title: remNotes.length === 1 ? 'Σημείωση με υπενθύμιση' : remNotes.length + ' σημειώσεις με υπενθύμιση',
      sub:
        remNotes
          .slice(0, 2)
          .map((n) => {
            const w = noteWho(state, n);
            return (
              (w.kind === 'gen' ? '' : w.label + ': ') +
              '«' +
              noteHead(n.text, 46) +
              '»' +
              (n.rem! < today ? ' (εκπρόθεσμη)' : '')
            );
          })
          .join(' · ') + (remNotes.length > 2 ? ' · και ' + (remNotes.length - 2) + ' ακόμα' : ''),
      urgent: remNotes.some((n) => n.rem! < today),
      btn: 'Δες τις',
      fn: () => nav.go('notes', { nfilter: 'rem' }),
    });
  if (due)
    tasks.push({
      key: 'usb',
      title: 'Αντίγραφο σε USB',
      sub:
        (boot.lastUsb ? 'Πέρασαν ' + usbAge(boot.lastUsb, today) + ' μέρες από το τελευταίο' : 'Δεν έχει παρθεί ποτέ') +
        '. Αν χαλάσει ο δίσκος του PC, χάνονται όλα (κάθε ' +
        USB_DAYS +
        ' μέρες).',
      btn: 'Αντίγραφο σε USB',
      fn: usb,
    });
  return tasks;
}

/** One line of «Λήγουν»: the record, when it ends, and the tooltip. */
export interface EndRow {
  s: Status;
  /** «λήγει σήμερα», «λήγει αύριο» or «έληξε χθες, αφαιρέθηκε αυτόματα». */
  when: string;
  /** Tooltip text, empty for no tooltip. */
  tip: string;
}

/**
 * The rows of «Λήγουν»: expired yesterday first, then ending today, then ending tomorrow.
 * @param scan - what {@link scanRecords} found
 * @param endTxt - the tooltip sentence for a record that ends today
 */
export function endRows({ expired, ending, endTom }: RecordScan, endTxt: (s: Status) => string): EndRow[] {
  return [
    ...expired.map((s) => ({
      s,
      when: 'έληξε χθες, αφαιρέθηκε αυτόματα',
      tip: 'Από σήμερα δεν ισχύει· γράφτηκε στο Ιστορικό',
    })),
    ...ending.map((s) => ({ s, when: 'λήγει σήμερα', tip: endTxt(s) })),
    ...endTom.map((s) => ({ s, when: 'λήγει αύριο', tip: '' })),
  ];
}

/**
 * The sub-title of the page header: the date and how many things wait for the user.
 * @param today - ISODate, local app time
 * @param taskCount - number of lines in «Πρέπει σήμερα»
 * @param empty - number of empty seats in tomorrow's ΦΡΟΥΡΑ
 * @param dutyStart - the clock time duties start (settings), e.g. «08:00»
 */
export function todaySub(today: ISODate, taskCount: number, empty: number, dutyStart: string): string {
  const head = 'Ημερήσια κατάσταση ' + DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + '. ';
  if (!taskCount) return head + 'Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.';
  const n = taskCount + (taskCount === 1 ? ' πράγμα θέλει εσένα' : ' πράγματα θέλουν εσένα');
  return head + n + (empty > 0 ? '. Το πρώτο πριν τις ' + dutyStart + '.' : '.');
}

/**
 * «έως 12/03 08:00» or «χωρίς λήξη»: when a status ends.
 * @param s - the status (`to` is ISODate, `toTime` an optional «HH:MM»)
 */
export function untilText(s: Status): string {
  return s.open ? 'χωρίς λήξη' : 'έως ' + dm(s.to) + (s.toTime ? ' ' + s.toTime : '');
}

/**
 * The note line under a prevented (κωλυόμενος) person: what the status is, without the end.
 * @param s - the κωλυόμενος status
 * @param lists - the settings lists (leave kinds)
 */
export function kolNote(s: Status, lists: AppState['settings']['lists']): string {
  if (s.type === 'STEP') return [TYPES.STEP.long, s.note].filter(Boolean).join(' · ');
  if (s.type === 'LEAVE') return [statusLbl(s, lists), s.note].filter(Boolean).join(' · ');
  return s.note || 'Κωλυόμενος';
}

/**
 * The badge text of a prevented person: the ΗΚΑΙ column that loses him, or «παρών».
 * @param minus - true when he is taken off the present count
 * @param col - the ΗΚΑΙ column code, `-` or empty when none
 */
export function kolBadge(minus: boolean, col: string | undefined): string {
  if (!minus) return 'παρών';
  return col && col !== '-' ? kolColName(col) : 'εκτός ' + HK();
}

/**
 * The tooltip of that badge.
 * @param minus - true when he is taken off the present count
 * @param col - the ΗΚΑΙ column code, `-` or empty when none
 */
export function kolBadgeTip(minus: boolean, col: string | undefined): string {
  if (!minus) return 'Μένει στους παρόντες, δεν μπαίνει στην ' + HK();
  return (
    'Αφαιρείται από τους παρόντες· ' +
    (col && col !== '-' ? 'στην ' + HK() + ': ' + kolColName(col) : 'δεν μετρά σε στήλη της ' + HK())
  );
}

/**
 * The record label in «Λήγουν»: «ποινή (…)» for a penalty, else the status label.
 * @param s - the status
 * @param lists - the settings lists
 */
export function recordWhat(s: Status, lists: AppState['settings']['lists']): string {
  return s.type === 'PUN' ? 'ποινή (' + punLbl(s.kind) + ')' : statusLbl(s, lists);
}

/**
 * The time cell of a news line: nothing for today, else «Τρι 12/03 », followed by the bold time in the screen.
 * @param day - ISODate of the entry
 * @param today - ISODate, local app time
 */
export function newsDay(day: ISODate, today: ISODate): string {
  return day === today ? '' : dow(day) + ' ' + dm(day) + ' ';
}
