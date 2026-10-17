// Δυναμολόγιο (Michael, 17/10): η οθόνη δείχνει μόνο τα στοιχεία του στρατιώτη, με τα φίλτρα Όλοι, Άδειες,
// Τιμωρημένοι, Πόστα, Εκτός δύναμης, Με δικαίωμα ΔΝ. Το ίδιο, για μία ημερομηνία, βγαίνει σε ένα Excel με ένα φύλλο
// ανά φίλτρο. Τα ιατρικά είναι στην οθόνη «Ιατρικά και ποινές».
import { dmy, type ISODate } from './dates';
import { TYPES, coversDay, type AppState, type Person, type Status } from './domain';
import { siOf } from './si';
import { statusLbl } from './ranks';
import { collator } from './text';

export type RosterFilter = 'all' | 'leave' | 'pun' | 'post' | 'inactive' | 'dnright';
export const ROSTER_FILTERS: [RosterFilter, string, string][] = [
  ['all', 'Όλοι', 'ΔΥΝΑΜΟΛΟΓΙΟ'], ['leave', 'Άδειες', 'ΑΔΕΙΕΣ'], ['pun', 'Τιμωρημένοι', 'ΤΙΜΩΡΗΜΕΝΟΙ'],
  ['post', 'Πόστα', 'ΠΟΣΤΑ'], ['inactive', 'Εκτός δύναμης', 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ'], ['dnright', 'Με δικαίωμα ΔΝ', 'ΔΙΚΑΙΩΜΑ ΔΝ']
];
// Οι στήλες, με τη σειρά που τις ζήτησε ο Michael
export const ROSTER_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΑΛΑΜΟΣ', 'ΠΟΣΤΟ', 'ΡΟΛΟΣ', 'Σ.Ι.', 'ΔΙΚΑΙΩΜΑ ΔΝ'];
// Άδειες και ποινές: και τι, από πότε, έως πότε
export const STATUS_COLS = ['ΕΙΔΟΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ'];

// άδεια: κανονική/ειδική κ.λπ., τιμητική, αναρρωτική (όχι όσες ακόμα αιτούνται)· ποινή: κάθε ποινή εκείνη τη μέρα
const isLeave = (s: Status) => TYPES[s.type].cat === 'abs' && !s.pending;
const isPun = (s: Status) => s.type === 'PUN';
// Η κατάσταση του φίλτρου για ένα άτομο τη μέρα d (η πρώτη, αν έχει πολλές)
export function filterStatus(f: RosterFilter, on: Status[]): Status | undefined {
  return f === 'leave' ? on.find(isLeave) : f === 'pun' ? on.find(isPun) : undefined;
}
// Ταιριάζει στο φίλτρο; on: οι καταστάσεις του τη μέρα (statusesOn)
export function rosterMatch(f: RosterFilter, p: Person, on: Status[]): boolean {
  if (f === 'inactive') return !p.active;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'post') return !!p.post;
  if (f === 'dnright') return !!p.dn;
  return !!filterStatus(f, on);
}
export const statusKind = (s: Status, lists?: AppState['settings']['lists']) =>
  s.type === 'PUN' ? statusLbl(s, lists) : s.type === 'LEAVE' ? (s.kind ? s.kind + ' άδεια' : TYPES.LEAVE.long) : TYPES[s.type].long;
export const rosterCells = (p: Person, lists?: AppState['settings']['lists']): (string | number)[] => [
  p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room ?? '', p.post || '', p.role || '', p.si ? siOf(p, lists).text : '', p.dn ? 'ΝΑΙ' : ''
];
// Σειρά όπως στο Δυναμολόγιο: θάλαμος, επώνυμο, όνομα
export const byRoomName = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first);

export interface RosterSheet { name: string; title: string; head: string[]; rows: (string | number)[][] }
// Τα φύλλα του Excel για τη μέρα d: ένα ανά φίλτρο, και στις άδειες/ποινές μία γραμμή για κάθε άδεια ή ποινή
export function rosterSheets(s: AppState, d: ISODate): RosterSheet[] {
  const lists = s.settings.lists; const people = [...s.people].sort(byRoomName);
  const byPid = new Map<number, Status[]>();
  for (const x of s.statuses) if (coversDay(x, d)) { const l = byPid.get(x.pid); if (l) l.push(x); else byPid.set(x.pid, [x]); }
  return ROSTER_FILTERS.map(([f, , name]) => {
    const withStatus = f === 'leave' || f === 'pun';
    const rows: (string | number)[][] = [];
    for (const p of people) {
      const on = byPid.get(p.id) || [];
      if (!rosterMatch(f, p, on)) continue;
      if (!withStatus) { rows.push([rows.length + 1, ...rosterCells(p, lists)]); continue; }
      for (const x of on.filter(f === 'leave' ? isLeave : isPun))
        rows.push([rows.length + 1, ...rosterCells(p, lists), statusKind(x, lists), dmy(x.from), x.open ? '' : dmy(x.to), x.note || '']);
    }
    return { name, title: name + ' ' + dmy(d), head: withStatus ? [...ROSTER_COLS, ...STATUS_COLS] : ROSTER_COLS, rows };
  });
}
