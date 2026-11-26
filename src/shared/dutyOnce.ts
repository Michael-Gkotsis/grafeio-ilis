// «Μετρά για 1» (Michael, 26/11): όταν κάποιος έχει 2 υπηρεσίες την ίδια μέρα, ο λοχίας λέει αν η μέρα μετρά για μία ή για δύο.
// Χωρίς απάντηση (και σε όλα τα παλιά δεδομένα) μετρά κάθε υπηρεσία. Η απάντηση «1» κρατιέται στο state.dutyOnce (kv «dutyOnce»):
// ανά μέρα, η λίστα όσων η μέρα τους μετρά ΜΙΑ. Κλειδί ατόμου: στρατιώτης String(pid), στέλεχος 'c:' + cadre.id (ίδιο με θέση ή πρόγραμμα).
// Απάντηση σε μέρα με λιγότερες από 2 υπηρεσίες δεν έχει αποτέλεσμα. Καθαρό αρχείο: χωρίς εξαρτήσεις, το διαβάζουν rules, cadreDuty, Excel και οθόνη.
import type { ISODate } from './dates';

export type DutyOnce = Record<ISODate, string[]>;
export const onceKeyOfCadre = (cid: string): string => 'c:' + cid;
export const onceKeyOfPid = (pid: number): string => String(pid);

// ανά αντικείμενο dutyOnce: κλειδί ατόμου → μέρες με απάντηση «1» (μία φορά, όχι σε κάθε ερώτηση)
const byWho = new WeakMap<DutyOnce, Map<string, ISODate[]>>();
const NONE: ISODate[] = [];
export function onceDays(once: DutyOnce | undefined, who: string): ISODate[] {
  if (!once) return NONE;
  let m = byWho.get(once);
  if (!m) { m = new Map(); for (const d in once) for (const w of once[d]) { const l = m.get(w); if (l) l.push(d); else m.set(w, [d]); } byWho.set(once, m); }
  return m.get(who) || NONE;
}
export const isOnce = (once: DutyOnce | undefined, d: ISODate, who: string): boolean => !!once?.[d]?.includes(who);
// πόσες μετρά μια μέρα με n υπηρεσίες: μία αν έχει 2 ή περισσότερες και η απάντηση είναι «1», αλλιώς όλες
export const countOf = (once: DutyOnce | undefined, d: ISODate, who: string, n: number): number => (n >= 2 && isOnce(once, d, who) ? 1 : n);
