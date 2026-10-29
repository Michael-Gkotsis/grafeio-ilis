// Ώρες εξόδου/επιστροφής ανά μέρα και «πότε γυρνά ο ΔΝ» (Michael, 24/10). Καθαρές συναρτήσεις πάνω στην κατάσταση:
//  - dayTimes: αρχή εξόδου, επιστροφή εξοδούχων, επιστροφή ΔΝ και πρωινή εκπαίδευση μιας μέρας
//    (αλλαγή μιας μέρας ?? ημέρα εβδομάδας ?? προεπιλογή· οι αργίες δεν έχουν εκπαίδευση)
//  - returnOf: πότε και γιατί γυρνά όποιος είναι εξοδούχος ή ΔΝ τη μέρα d
//  - outHeld/awayAt: λείπει εκείνη την ώρα; (η Δύναμη και το «Σήμερα» με την ώρα)
//  - returnsOn, retDay/retWhen/retTxt: «Ποιοι γυρίζουν και πότε» (Εξοδούχοι, Σήμερα)
// Η «Ώρα εξόδου» 16:00 των Κανόνων (rules.outTime) είναι άλλο πράγμα: ισχύει μόνο για όσους γυρίζουν από άδεια.
// Κυκλική εξάρτηση με το rules.ts (η Δύναμη με την ώρα καλεί το outHeld): όλα χρησιμοποιούνται μέσα σε συναρτήσεις, όχι στην αρχή του αρχείου.
import { TYPES, type AppState, type DayPlan, type Person, type Rules, type Status } from './domain';
import { addDays, dm, weekday, DOW_FULL, type ISODate } from './dates';
import { hasTimes, mins } from './hours';
import { activePeople, holOf, statusesOn } from './rules';
import { dutyAt, isSat, isWk } from './weekend';

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
// δεν έχει έξοδο/ΔΝ μένει. Αλλιώς δεν ξέρουμε αν ο ΔΝ μένει (η αλλαγή ωρών της μέρας δεν μετρά: μπορεί να μπει από πριν). Η «ΔΝ ΣΚ» του
// Σαββάτου δηλώνει και την Κυριακή, ακόμα κι αν εκείνος δεν μπήκε στη ΔΝ της (υπηρεσία, ποινή…).
const declIdx = new WeakMap<Status[], Map<ISODate, boolean>>();
function declared(s: AppState, d: ISODate): boolean {
  if (s.outNotes?.[d] && Object.keys(s.outNotes[d]).length) return true;
  let m = declIdx.get(s.statuses); if (!m) { m = new Map(); declIdx.set(s.statuses, m); }
  let r = m.get(d);
  if (r === undefined) { const prev = addDays(d, -1); r = s.statuses.some(x => !x.pending && TYPES[x.type].cat === 'out' && ((x.from <= d && d <= x.to) || (isWk(x) && isSat(prev) && x.from <= prev && prev <= x.to))); m.set(d, r); }
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

// Μετρά ως απών ο ΔΝ/εξοδούχος που δεν έχει γυρίσει ακόμα στη στιγμή m (λεπτά) της μέρας from; Όποιος δεν έχει δηλωθεί πότε γυρνά (pending) μένει απών.
const gone = (r: Ret | null, from: ISODate, m: number) => !!r && (!!r.pending || !!r.open || r.day > from || (r.day === from && m < mins(r.time)));
// Η έξοδος/ΔΝ που κρατά το άτομο έξω τη μέρα d στις m (λεπτά): η δική της μέρας από την αρχή εξόδου ως την επιστροφή, ή της προηγούμενης
// μέρας (ΔΝ που γυρνά το πρωί, διόρθωση που γυρνά αργότερα). null: δεν είναι έξω. undefined: δεν κρίνεται με ώρες (άδεια την ίδια μέρα
// με την έξοδο: μετρά όπως πριν, ολόκληρη η μέρα). Ό,τι δεν είναι έξοδος/ΔΝ (άδειες, νοσοκομείο) μετρά αλλού.
export function outHeldBy(s: AppState, pid: number, d: ISODate, m: number): { st: Status; r: Ret | null } | null | undefined {
  const own = awayOn(s, pid, d), outs = own.filter(hasOut);
  if (outs.length) {
    if (own.some(x => !hasOut(x))) return undefined;
    if (m >= mins(dayTimes(s, d).out)) { const r = returnOf(s, pid, d); if (gone(r, d, m)) return { st: outs.find(x => x.type === 'DN') || outs[0], r }; }
  }
  // η προηγούμενη μέρα και οι διορθώσεις παλαιότερων ημερών που γυρνούν αργότερα
  const prev = addDays(d, -1), days = [prev];
  for (const f of s.backFix || []) if (f.pid === pid && f.at && f.day < prev) days.push(f.day);
  for (const x of days) { const o = awayOn(s, pid, x).find(hasOut); if (o) { const r = returnOf(s, pid, x); if (gone(r, d, m)) return { st: o, r }; } }
  return null;
}
export function outHeld(s: AppState, pid: number, d: ISODate, m: number): Status | null | undefined {
  const h = outHeldBy(s, pid, d, m);
  return h ? h.st : h;
}
export const awayAt = (s: AppState, pid: number, d: ISODate, time: string): boolean => !!outHeld(s, pid, d, mins(time));

// ---------------------------------------------------------------------------------------------------------------------------
// «Ποιοι γυρίζουν και πότε»: όλοι όσοι λείπουν τη μέρα d, με πότε και γιατί γυρνά ο καθένας (Εξοδούχοι, Σήμερα)
// Εξοδούχοι/ΔΝ: returnOf. Όποιος λείπει με άδεια ή νοσοκομείο: ως τη λήξη τους (όπως πριν), νωρίτερα αν έχει υπηρεσία.
export interface Back { p: Person; st: Status; r: Ret }
export function leaveBack(s: AppState, pid: number, d: ISODate): Ret {
  let last = d, lastSt: Status | undefined, back: Ret | null = null;
  for (let i = 0, x = d; i < MAX_DAYS; i++, x = addDays(x, 1)) {
    const a = awayOn(s, pid, x); if (!a.length) break;
    last = x; lastSt = a.find(y => !hasOut(y)) || a[0];
    if (lastSt.open) { back = { day: x, time: '', why: 'χωρίς λήξη', open: true }; break; }
    // υπηρεσία μέσα στις μέρες που λείπει: γυρίζει γι' αυτήν
    const duty = i > 0 && dutyAt(s, x, pid);
    if (duty) { back = { day: x, time: duty.time, why: 'υπηρεσία', duty: duty.label }; break; }
  }
  if (back) return back;
  const t = TYPES[lastSt!.type];
  if (hasOut(lastSt!)) back = lastSt!.type === 'OUT' ? { day: last, time: dayTimes(s, last).backOut, why: 'τέλος εξόδου' } : { day: addDays(last, 1), time: dayTimes(s, addDays(last, 1)).backDn, why: 'μετά τη ΔΝ' };
  else if (lastSt!.toTime && hasTimes(lastSt!.type)) back = { day: last, time: lastSt!.toTime, why: 'τέλος ' + t.label };
  else back = { day: addDays(last, 1), time: '', why: 'τέλος ' + t.label };
  return withDuty(s, pid, back);
}
export function returnsOn(s: AppState, d: ISODate): Back[] {
  const out: Back[] = [];
  for (const p of activePeople(s)) {
    const now = awayOn(s, p.id, d); if (!now.length) continue;
    out.push({ p, st: now.find(y => !hasOut(y)) || now[0], r: returnOf(s, p.id, d) || leaveBack(s, p.id, d) });
  }
  const ord = (b: Back) => (b.r.open ? '9' : b.r.day + (b.r.duty ? '0' : b.r.pending ? '2' : '1') + (b.r.time || '23:59'));
  return out.sort((a, b) => ord(a).localeCompare(ord(b)) || a.p.last.localeCompare(b.p.last, 'el'));
}
// «Δευτέρα 26/10» · «06:00 · ΔΝ ως την Κυριακή» · «06:00 · μετά τη ΔΝ, φεύγει για άδεια 14:00» · «δεν έχει δηλωθεί η Κυριακή»
export const retDay = (r: Ret) => (r.open ? 'Χωρίς λήξη' : DOW_FULL[weekday(r.day)] + ' ' + dm(r.day));
// Γιατί γυρνά (why) και τι κάνει μετά (leave): οι ίδιες λέξεις στην οθόνη και στις Παρατηρήσεις του Excel
const retWhy = (r: Ret) => ({ why: r.duty ? r.duty + (r.dutyTime && r.dutyTime !== r.time ? ' από ' + r.dutyTime : '') : r.why, leave: !r.duty && r.leaveAt ? 'φεύγει για άδεια ' + r.leaveAt : '' });
export const retWhen = (r: Ret) => {
  if (r.pending) return r.why;
  if (r.open) return 'δεν γυρνά, συνεχίζει' + (r.fix ? ' · ' + r.why : '');
  const { why, leave } = retWhy(r);
  return (r.time || 'πρωί') + ' · ' + why + (leave ? ', ' + leave : '');
};
export const retTxt = (r: Ret) => (r.pending ? r.why : r.open ? 'χωρίς λήξη' + (r.fix ? ' · ' + r.why : '') : retDay(r) + ' ' + retWhen(r));
// Στις Παρατηρήσεις του Excel (πεζά, τα κεφαλαία τα βάζει ο γράφων): «γυρνά Δευτέρα 27/10 06:00 (ΔΝ ως την Κυριακή)»,
// «γυρνά Τρίτη 28/10 06:00, φεύγει για άδεια 14:00», «δεν έχει δηλωθεί η Δευτέρα 27/10». Ο εξοδούχος που γυρνά το βράδυ και η ΔΝ
// πριν από άδεια δεν λένε το αυτονόητο «γιατί» (η γραμμή λέει ήδη εξοδούχος/ΔΝ).
export function retNote(r: Ret): string {
  if (r.pending) return r.why + ' ' + dm(r.day);
  if (r.open) return 'δεν γυρνά (' + r.why + ')';
  const { why, leave } = retWhy(r);
  const obvious = !r.duty && (/^εξοδούχος /.test(why) || (!!leave && why === 'μετά τη ΔΝ'));
  return 'γυρνά ' + retDay(r) + ' ' + (r.time || 'πρωί') + (obvious ? '' : ' (' + why + ')') + (leave ? ', ' + leave : '');
}
// Στη σελίδα Δύναμη (μία γραμμή ανά άτομο): «Γυρνά Δευτέρα 27/10 06:00 (ΔΝ ως την Κυριακή)», «Γυρνά Τρίτη 28/10 πρωί (τέλος ΚΑ)»,
// «Γυρνά Τρίτη 28/10 06:00 (υπηρεσία Θ1 από 05:00), φεύγει για άδεια 14:00». Πάντα με τον λόγο.
export function retLine(r: Ret): string {
  if (r.pending) return 'Δεν ξέρουμε πότε γυρνά (' + r.why + ')';
  if (r.open) return 'Δεν γυρνά, συνεχίζει (' + r.why + ')';
  const { why, leave } = retWhy(r);
  return 'Γυρνά ' + retDay(r) + ' ' + (r.time || 'πρωί') + (why ? ' (' + why + ')' : '') + (leave ? ', ' + leave : '');
}
