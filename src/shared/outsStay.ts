// Εξοδούχοι και παραμένοντες μιας μέρας (δείγμα 10, Excel «Εξοδούχοι / Παραμένοντες»): στη Δύναμη των εντύπων (shared/values.ts) μετρούν οι ίδιοι.
// Ώρα εξόδου: όποιος γύρισε ως τότε μετρά σαν να ήταν μέσα.
import type { ISODate } from './dates';
import { TYPES, coversDay, type AppState, type Person, type Status } from './domain';
import { activePeople, outMin, postOf, statusesFrom } from './rules';
import { byName } from './hkaiText';
import { statusLbl } from './ranks';
import { norm } from './text';
import { outNoteOf, withNote } from './weekend';

export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);
export function outsAndStay(s: AppState, d: ISODate): { outs: { p: Person; st: Status }[]; stay: { p: Person; note: string }[] } {
  const outs: { p: Person; st: Status }[] = []; const stay: { p: Person; note: string }[] = [];
  for (const p of activePeople(s)) {
    // γύρισε ως την ώρα εξόδου: μετρά σαν να ήταν μέσα (εξοδούχος ή παραμένων)
    const ss = statusesFrom(s.statuses, p.id, d, outMin(s.rules));
    const o = ss.find(x => TYPES[x.type].cat === 'out');
    if (o) { outs.push({ p, st: o }); continue; }
    if (ss.some(x => TYPES[x.type].away)) continue; // σε άδεια/νοσοκομείο: ούτε εξοδούχος ούτε παραμένων
    const post = postOf(s, d, p.id);
    // και η ποινή που ακόμα αιτείται κρατά μέσα (γραφέας, 10/10)
    const pend = s.statuses.filter(x => x.pid === p.id && x.type === 'PUN' && x.pending && coversDay(x, d));
    const note = [...ss.map(x => statusLbl(x, s.settings.lists)), ...pend.map(x => statusLbl(x, s.settings.lists)), post ? post.label : '', p.post || ''].filter(Boolean).join(', ');
    stay.push({ p, note: norm(withNote(note, outNoteOf(s, d, p.id))) });
  }
  // ανά θάλαμο, όπως έρχονται τα χαρτιά (γραφέας, 10/10)
  outs.sort((a, b) => byRoom(a.p, b.p)); stay.sort((a, b) => byRoom(a.p, b.p));
  return { outs, stay };
}
