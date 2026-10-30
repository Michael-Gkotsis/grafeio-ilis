// Εξοδούχοι και παραμένοντες μιας μέρας (δείγμα 10, Excel «Εξοδούχοι / Παραμένοντες»): στη Δύναμη των εντύπων (shared/values.ts) μετρούν οι ίδιοι.
// Ώρα εξόδου: όποιος γύρισε ως τότε μετρά σαν να ήταν μέσα.
import type { ISODate } from './dates';
import { TYPES, coversDay, type AppState, type Person, type Status } from './domain';
import { activePeople, outMin, postOf, statusesFrom } from './rules';
import { byName } from './hkaiText';
import { statusLbl } from './ranks';
import { norm } from './text';
import { outNoteOf, withNote } from './weekend';
import { stillOut } from './returns';

export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);
// Τι κρατά μέσα έναν παραμένοντα (υπηρεσία, ΣΤΕΠ, ποινή, ιατρικά, πόστο) και η παρατήρηση της μέρας: οι Παραμένοντες και το Γ της «Όλη η δύναμη»
// ss: οι καταστάσεις του από την ώρα εξόδου· hours: η υπηρεσία με τις ώρες της («Λ/Υ 14:00 → 14:00»)
export function stayNote(s: AppState, d: ISODate, p: Person, ss: Status[], hours = false): string {
  const post = postOf(s, d, p.id);
  // και η ποινή που ακόμα αιτείται κρατά μέσα (γραφέας, 10/10)
  const pend = s.statuses.filter(x => x.pid === p.id && x.type === 'PUN' && x.pending && coversDay(x, d));
  // δύο καταστάσεις του ίδιου είδους που πέφτουν την ίδια μέρα: μία φορά («ΣΤΕΠ», όχι «ΣΤΕΠ, ΣΤΕΠ»)
  const note = [...new Set([...ss.map(x => statusLbl(x, s.settings.lists)), ...pend.map(x => statusLbl(x, s.settings.lists)), post ? post.label + (hours && post.hrs ? ' ' + post.hrs : '') : '', p.post || ''].filter(Boolean))].join(', ');
  return norm(withNote(note, outNoteOf(s, d, p.id)));
}
export function outsAndStay(s: AppState, d: ISODate): { outs: { p: Person; st: Status }[]; stay: { p: Person; note: string }[] } {
  const outs: { p: Person; st: Status }[] = []; const stay: { p: Person; note: string }[] = [];
  for (const p of activePeople(s)) {
    // γύρισε ως την ώρα εξόδου: μετρά σαν να ήταν μέσα (εξοδούχος ή παραμένων)
    const ss = statusesFrom(s.statuses, p.id, d, outMin(s.rules));
    const o = ss.find(x => TYPES[x.type].cat === 'out');
    if (o) { outs.push({ p, st: o }); continue; }
    // έξω ακόμα από έξοδο/ΔΝ παλαιότερης μέρας (διόρθωση «γυρνά αργότερα», «δεν γυρνά»): δεν είναι παραμένων
    const held = stillOut(s, p.id, d);
    if (held) { outs.push({ p, st: held.st }); continue; }
    if (ss.some(x => TYPES[x.type].away)) continue; // σε άδεια/νοσοκομείο: ούτε εξοδούχος ούτε παραμένων
    stay.push({ p, note: stayNote(s, d, p, ss) });
  }
  // ανά θάλαμο, όπως έρχονται τα χαρτιά (γραφέας, 10/10)
  outs.sort((a, b) => byRoom(a.p, b.p)); stay.sort((a, b) => byRoom(a.p, b.p));
  return { outs, stay };
}
