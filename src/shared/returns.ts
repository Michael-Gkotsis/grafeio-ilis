// Ώρες εξόδου/επιστροφής ανά μέρα και «πότε γυρνά ο ΔΝ» (Michael, 24/10). Καθαρές συναρτήσεις πάνω στην κατάσταση:
//  - dayTimes: αρχή εξόδου, επιστροφή εξοδούχων, επιστροφή ΔΝ και πρωινή εκπαίδευση μιας μέρας
//    (αλλαγή μιας μέρας ?? ημέρα εβδομάδας ?? προεπιλογή· οι αργίες δεν έχουν εκπαίδευση)
//  - returnOf: πότε και γιατί γυρνά όποιος είναι εξοδούχος ή ΔΝ τη μέρα d
//  - awayOn/awayAt: λείπει εκείνη την ώρα; (η Δύναμη και το «Σήμερα» με την ώρα)
// Η «Ώρα εξόδου» 16:00 των Κανόνων (rules.outTime) είναι άλλο πράγμα: ισχύει μόνο για όσους γυρίζουν από άδεια.
import { TYPES, type AppState, type DayPlan, type Rules, type Status } from './domain';
import { addDays, weekday, DOW_FULL, type ISODate } from './dates';
import { hasTimes, mins } from './hours';
import { holOf, statusesOn } from './rules';
import { dutyAt } from './weekend';

export interface WeekRow { out: string; backOut: string; backDn: string; train: boolean }
// Προεπιλογές: έξοδος 17:00, εξοδούχοι πίσω 22:00, ΔΝ πίσω 06:00, εκπαίδευση Δευτέρα ως Σάββατο (η Κυριακή όχι)
export const defaultRow = (w: number): WeekRow => ({ out: '17:00', backOut: '22:00', backDn: '06:00', train: w !== 0 });
const okT = (t: unknown, def: string) => (typeof t === 'string' && /^\d\d:\d\d$/.test(t) ? t : def);
// Η γραμμή μιας ημέρας εβδομάδας (w = getDay, 0 = Κυριακή) με τις προεπιλογές όπου λείπει κάτι
export function weekRow(r: Pick<Rules, 'week'> | undefined | null, w: number): WeekRow {
  const d = defaultRow(w), x = r?.week?.[w];
  return { out: okT(x?.out, d.out), backOut: okT(x?.backOut, d.backOut), backDn: okT(x?.backDn, d.backDn), train: typeof x?.train === 'boolean' ? x.train : d.train };
}
// Η γραμμή της μέρας d χωρίς αλλαγή μιας μέρας: οι αργίες (όχι το ΣΚ) δεν έχουν εκπαίδευση
export function baseOf(s: Pick<AppState, 'rules' | 'settings'>, d: ISODate): WeekRow {
  const r = weekRow(s.rules, weekday(d));
  return holOf(s.settings, d) ? { ...r, train: false } : r;
}
export interface DayTimes extends WeekRow { hol: string; over?: DayPlan }
export function dayTimes(s: Pick<AppState, 'rules' | 'settings'> & Partial<Pick<AppState, 'dayPlan'>>, d: ISODate): DayTimes {
  const b = baseOf(s, d), o = s.dayPlan?.[d];
  return {
    out: okT(o?.out, b.out), backOut: okT(o?.backOut, b.backOut), backDn: okT(o?.backDn, b.backDn), train: typeof o?.train === 'boolean' ? o.train : b.train,
    hol: holOf(s.settings, d) || '', ...(o ? { over: o } : {})
  };
}

// «το Σάββατο», «τη Δευτέρα», «την Κυριακή» / «το Σάββατο», «η Δευτέρα»
const ACC = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];
export const onDay = (d: ISODate) => ACC[weekday(d)];
export const theDay = (d: ISODate) => (weekday(d) === 6 ? 'το ' : 'η ') + DOW_FULL[weekday(d)];

// day/time: πότε γυρνά· why: γιατί· pending: δεν ξέρουμε ακόμα (δεν έχει δηλωθεί η μέρα day)· leaveAt: γυρνά και φεύγει πάλι
// για άδεια στην ώρα αυτή· duty/dutyTime: γυρνά για υπηρεσία· open: δεν γυρνά (χωρίς λήξη ή διόρθωση «συνεχίζει»)· fix: από διόρθωση
export interface Ret { day: ISODate; time: string; why: string; pending?: true; leaveAt?: string; duty?: string; dutyTime?: string; open?: true; fix?: true }

const MAX_DAYS = 120;
const awayOn = (s: AppState, pid: number, d: ISODate): Status[] => statusesOn(s.statuses, pid, d).filter(y => TYPES[y.type].away && !y.pending);
// Μέρα «δηλωμένη» = κάποιος έχει έξοδο ή ΔΝ εκείνη τη μέρα (ή παρατήρηση εξοδούχου): οι Εξοδούχοι της μέρας έχουν συμπληρωθεί και όποιος
// δεν έχει έξοδο/ΔΝ μένει. Αλλιώς δεν ξέρουμε αν ο ΔΝ μένει (η αλλαγή ωρών της μέρας δεν μετρά: μπορεί να μπει από πριν).
const declIdx = new WeakMap<Status[], Map<ISODate, boolean>>();
function declared(s: AppState, d: ISODate): boolean {
  if (s.outNotes?.[d] && Object.keys(s.outNotes[d]).length) return true;
  let m = declIdx.get(s.statuses); if (!m) { m = new Map(); declIdx.set(s.statuses, m); }
  let r = m.get(d);
  if (r === undefined) { r = s.statuses.some(x => !x.pending && TYPES[x.type].cat === 'out' && x.from <= d && d <= x.to); m.set(d, r); }
  return r;
}
// Επιστροφή τη μέρα r.day: αν έχει υπηρεσία, γυρνά για αυτήν (και νωρίτερα αν η υπηρεσία ξεκινά πριν από την ώρα)
function withDuty(s: AppState, pid: number, r: Ret): Ret {
  const duty = dutyAt(s, r.day, pid); if (!duty) return r;
  return { ...r, why: 'υπηρεσία', duty: duty.label, dutyTime: duty.time, ...(r.time && duty.time && duty.time < r.time ? { time: duty.time } : {}) };
}
const hasOut = (x: Status) => TYPES[x.type].cat === 'out';

// Πότε γυρνά όποιος είναι εξοδούχος ή ΔΝ τη μέρα d (ΔΝ της d = νύχτα d → πρωί d+1). null: δεν είναι εξοδούχος/ΔΝ (ή λείπει και αλλιώς).
export function returnOf(s: AppState, pid: number, d: ISODate): Ret | null {
  const now = awayOn(s, pid, d);
  if (!now.some(hasOut) || now.some(x => !hasOut(x))) return null;
  const fix = (s.backFix || []).find(f => f.pid === pid && f.day === d);
  if (fix) return fix.stay ? { day: d, time: '', why: 'διόρθωση: ' + fix.why, open: true, fix: true } : { day: fix.at!.day, time: fix.at!.time, why: 'διόρθωση: ' + fix.why, fix: true };
  // εξοδούχος: γυρνά το ίδιο βράδυ
  if (!now.some(x => x.type === 'DN')) return { day: d, time: dayTimes(s, d).backOut, why: 'εξοδούχος ' + onDay(d) };
  // ΔΝ: κρίνεται από ό,τι έχει δηλωθεί την επόμενη μέρα n. Αν έχει ΔΝ και εκείνη τη μέρα δεν έχει εκπαίδευση, συνεχίζει και
  // κρίνεται από την επόμενη (ΔΝ ΣΚ). Με εκπαίδευση γυρνά το πρωί (και φεύγει πάλι για τη δική της ΔΝ).
  let cur = d;
  for (let i = 0; i < MAX_DAYS; i++) {
    const n = addDays(cur, 1), t = dayTimes(s, n);
    const why = (plain: string) => (cur === d ? plain : 'ΔΝ ως ' + onDay(cur));
    const duty = dutyAt(s, n, pid);
    if (duty) return withDuty(s, pid, { day: n, time: t.backDn, why: '' });
    const on = awayOn(s, pid, n);
    const lv = on.find(x => !hasOut(x));
    if (lv) {
      // άδεια που ξεκινά μετά την ώρα επιστροφής ΔΝ: γυρνά και φεύγει στην ώρα της· ως την ώρα αυτή: συνεχίζει σε άδεια
      const at = lv.from === n && hasTimes(lv.type) && lv.fromTime ? lv.fromTime : '';
      if (at && mins(at) > mins(t.backDn)) return { day: n, time: t.backDn, why: why('μετά τη ΔΝ'), leaveAt: at };
      if (lv.open) return { day: n, time: '', why: 'χωρίς λήξη', open: true };
      const end: Ret = lv.toTime && hasTimes(lv.type) ? { day: lv.to, time: lv.toTime, why: 'τέλος ' + TYPES[lv.type].label } : { day: addDays(lv.to, 1), time: dayTimes(s, addDays(lv.to, 1)).backDn, why: 'τέλος ' + TYPES[lv.type].label };
      return withDuty(s, pid, end);
    }
    if (on.some(x => x.type === 'OUT')) return { day: n, time: t.backOut, why: 'εξοδούχος ' + onDay(n) };
    if (on.some(x => x.type === 'DN')) {
      if (t.train) return { day: n, time: t.backDn, why: why('πρωινή εκπαίδευση') };
      cur = n; continue;
    }
    if (declared(s, n)) return { day: n, time: t.backDn, why: why('μένει ' + onDay(n)) };
    if (t.train) return { day: n, time: t.backDn, why: why('πρωινή εκπαίδευση') };
    return { day: n, time: '', why: 'δεν έχει δηλωθεί ' + theDay(n), pending: true };
  }
  return { day: cur, time: '', why: 'χωρίς λήξη', open: true };
}

// Λείπει το άτομο τη μέρα d στις time (ΩΩ:ΛΛ) λόγω εξόδου/ΔΝ; Εξοδούχος: από την αρχή εξόδου ως την επιστροφή· ΔΝ: από την
// αρχή εξόδου ως την ώρα που γυρνά (πιθανώς μέρες μετά). Ό,τι δεν είναι έξοδος/ΔΝ (άδειες, νοσοκομείο) μετρά αλλού.
// Αν η επιστροφή δεν έχει δηλωθεί (pending), μετράει ότι έχει γυρίσει.
export function awayAt(s: AppState, pid: number, d: ISODate, time: string): boolean {
  const m = mins(time);
  const gone = (r: Ret | null, from: ISODate) => !!r && !r.pending && (!!r.open || r.day > from || (r.day === from && m < mins(r.time)));
  if (awayOn(s, pid, d).some(hasOut) && m >= mins(dayTimes(s, d).out)) {
    const r = returnOf(s, pid, d);
    if (r && (r.pending || gone(r, d))) return true;
  }
  return gone(returnOf(s, pid, addDays(d, -1)), d);
}
