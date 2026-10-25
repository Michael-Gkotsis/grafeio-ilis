// Ώρες εξόδου/επιστροφής ανά μέρα (Michael, 24/10): dayTimes = αρχή εξόδου, επιστροφή εξοδούχων, επιστροφή ΔΝ και πρωινή εκπαίδευση
// μιας μέρας (αλλαγή μιας μέρας ?? ημέρα εβδομάδας ?? προεπιλογή· οι αργίες δεν έχουν εκπαίδευση).
// Η «Ώρα εξόδου» 16:00 των Κανόνων (rules.outTime) είναι άλλο πράγμα: ισχύει μόνο για όσους γυρίζουν από άδεια.
import type { AppState, DayPlan, Rules } from './domain';
import { weekday, DOW_FULL, type ISODate } from './dates';
import { holOf } from './rules';

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
