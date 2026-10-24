// Σημειώσεις του γραφείου (Michael, 24/10): γενικές, ανά στρατιώτη, ανά στέλεχος, με προαιρετική υπενθύμιση.
// Μένουν μόνο στη βάση της εφαρμογής: δεν γράφονται σε Excel ούτε βγαίνουν σε έντυπα.
import { addDays, daysBetween, dm, dow, type ISODate } from './dates';
import type { AppState, Note } from './domain';
import { personMap } from './rules';
import { normGreek } from './text';
import { rankTxt } from './ranks';

export const NOTE_MAX = 2000;
export type NoteKind = 'gen' | 'sol' | 'cad';
type S = Pick<AppState, 'people' | 'cadreList'>;

export const noteKind = (n: Pick<Note, 'pid' | 'cid'>): NoteKind => (n.pid != null ? 'sol' : n.cid ? 'cad' : 'gen');
/** Υπενθύμιση που έφτασε (σήμερα ή νωρίτερα) και δεν έχει ολοκληρωθεί. */
export const noteDue = (n: Note, today: ISODate): boolean => !n.done && !!n.rem && n.rem <= today;
export const dueCount = (notes: Note[] | undefined, today: ISODate): number => (notes || []).reduce((c, n) => c + (noteDue(n, today) ? 1 : 0), 0);
/** Οι ανοιχτές σημειώσεις ενός ατόμου. */
export const notesOf = (notes: Note[] | undefined, who: { pid: number } | { cid: string }): Note[] =>
  (notes || []).filter(n => !n.done && ('pid' in who ? n.pid === who.pid : n.cid === who.cid));
/** Μικρό κείμενο για το Ιστορικό και τα μηνύματα. */
export const noteHead = (text: string, max = 60): string => { const t = text.replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t; };

export interface NoteWho { kind: NoteKind; label: string; active: boolean }
/** Για ποιον είναι: όνομα όπως στην εφαρμογή· «εκτός δύναμης» όταν έφυγε ή σβήστηκε. */
export function noteWho(s: S, n: Note, pm = personMap(s.people)): NoteWho {
  if (n.pid != null) {
    const p = pm.get(n.pid);
    return p ? { kind: 'sol', label: p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : ''), active: p.active } : { kind: 'sol', label: 'Άγνωστος στρατιώτης', active: false };
  }
  if (n.cid) {
    const c = s.cadreList.find(x => x.id === n.cid);
    return c ? { kind: 'cad', label: [rankTxt(c), c.last, c.first ? c.first.charAt(0) + '.' : ''].filter(Boolean).join(' '), active: c.active } : { kind: 'cad', label: 'Άγνωστο στέλεχος', active: false };
  }
  return { kind: 'gen', label: 'Γενική', active: true };
}

export interface RemLabel { text: string; tone: 'bad' | 'warn' | 'info' | 'muted' }
export function remLabel(rem: ISODate, today: ISODate, done?: boolean): RemLabel {
  if (done) return { text: dm(rem), tone: 'muted' };
  const d = daysBetween(today, rem) - 1;
  if (d < 0) return { text: 'Εκπρόθεσμη ' + -d + (d === -1 ? ' μέρα' : ' μέρες'), tone: 'bad' };
  if (d === 0) return { text: 'Σήμερα', tone: 'bad' };
  if (d === 1) return { text: 'Αύριο', tone: 'warn' };
  return { text: dow(rem) + ' ' + dm(rem) + ' · σε ' + d + ' μέρες', tone: 'info' };
}

export type NoteFilter = 'all' | 'rem' | 'star' | 'gen' | 'sol' | 'cad' | 'done';
export const NOTE_FILTERS: [NoteFilter, string][] = [['all', 'Όλες'], ['rem', 'Υπενθυμίσεις'], ['star', 'Σημαντικές'], ['gen', 'Γενικές'], ['sol', 'Στρατιώτες'], ['cad', 'Στελέχη'], ['done', 'Ολοκληρωμένες']];
export function noteIn(f: NoteFilter, n: Note): boolean {
  if (f === 'done') return !!n.done;
  if (n.done) return false;
  return f === 'all' || (f === 'rem' ? !!n.rem : f === 'star' ? !!n.star : noteKind(n) === f);
}

export interface NoteGroups { due: Note[]; soon: Note[]; rest: Note[] }
/** «Πρέπει σήμερα» (υπενθύμιση που έφτασε), «Με υπενθύμιση» (μελλοντική), και οι υπόλοιπες: σημαντικές πρώτα, νεότερες πάνω. */
export function noteGroups(list: Note[], today: ISODate): NoteGroups {
  const order = new Map(list.map((n, i) => [n.id, i]));
  const byRem = (a: Note, b: Note) => a.rem!.localeCompare(b.rem!) || order.get(a.id)! - order.get(b.id)!;
  const due = list.filter(n => noteDue(n, today)).sort(byRem);
  const soon = list.filter(n => !n.done && n.rem && n.rem > today).sort(byRem);
  const rest = list.filter(n => n.done || !n.rem).sort((a, b) => (+!!b.star - +!!a.star) || order.get(b.id)! - order.get(a.id)!);
  return { due, soon, rest };
}

/** Αναζήτηση (Ctrl+K, φίλτρο της σελίδας): κείμενο και όνομα ατόμου, χωρίς τόνους. */
export const noteSearch = (s: S, n: Note, q: string): boolean => {
  const k = normGreek(q).trim(); if (!k) return true;
  const hay = normGreek(n.text + ' ' + noteWho(s, n).label);
  return k.split(/\s+/).every(t => hay.includes(t));
};

// Γρήγορες υπενθυμίσεις του πλαισίου: αύριο, η επόμενη Δευτέρα (όχι αν είναι ήδη αύριο ή ίδια με το «σε μία εβδομάδα») και σε μία εβδομάδα
export function quickRems(today: ISODate): { id: string; label: string; date: ISODate }[] {
  const wd = new Date(today + 'T12:00:00').getDay(); const toMon = ((8 - wd) % 7) || 7;
  const mon = addDays(today, toMon);
  const out = [{ id: 'tom', label: 'Αύριο', date: addDays(today, 1) }];
  if (toMon > 1 && toMon < 7) out.push({ id: 'mon', label: 'Δευτέρα ' + dm(mon), date: mon });
  out.push({ id: 'wk', label: 'Σε μία εβδομάδα', date: addDays(today, 7) });
  return out;
}

export interface NoteMark { n: number; hot: boolean }
/** Ανά άτομο ('p' + id στρατιώτη, 'c' + id στελέχους): πόσες ανοιχτές σημειώσεις έχει και αν κάποια έχει υπενθύμιση που έφτασε. Για τη μικρή ένδειξη δίπλα στο όνομα. */
export function noteIndex(notes: Note[] | undefined, today: ISODate): Map<string, NoteMark> {
  const m = new Map<string, NoteMark>();
  for (const n of notes || []) {
    if (n.done || (n.pid == null && !n.cid)) continue;
    const k = n.pid != null ? 'p' + n.pid : 'c' + n.cid; const x = m.get(k) || { n: 0, hot: false };
    x.n++; if (noteDue(n, today)) x.hot = true; m.set(k, x);
  }
  return m;
}
export const noteKey = (n: Pick<Note, 'pid' | 'cid'>): string => (n.pid != null ? 'p' + n.pid : n.cid ? 'c' + n.cid : '');
