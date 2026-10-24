// Σημειώσεις του γραφείου (Michael, 24/10): γενικές, ανά στρατιώτη, ανά στέλεχος, με προαιρετική υπενθύμιση.
// Μένουν μόνο στη βάση της εφαρμογής: δεν γράφονται σε Excel ούτε βγαίνουν σε έντυπα.
import { addDays, daysBetween, dm, dow, type ISODate } from './dates';
import type { AppState, Note } from './domain';
import { personMap } from './rules';
import { normGreek } from './text';
import { rankTxt } from './ranks';

export const NOTE_MAX = 2000;
export type NoteKind = 'gen' | 'sol' | 'cad' | 'mix';
type S = Pick<AppState, 'people' | 'cadreList'>;

type Links = Pick<Note, 'pids' | 'cids' | 'pid' | 'cid'>;
/** Σε ποιους είναι δεμένη μια σημείωση (και οι σημειώσεις της πρώτης έκδοσης με pid/cid). */
export function noteLinks(n: Links): { pids: number[]; cids: string[] } {
  const pids = [...(n.pids || [])]; const cids = [...(n.cids || [])];
  if (n.pid != null && !pids.includes(n.pid)) pids.push(n.pid);
  if (n.cid && !cids.includes(n.cid)) cids.push(n.cid);
  return { pids, cids };
}
/** Η σημείωση όπως αποθηκεύεται: pids/cids μόνο όταν έχουν κάτι. */
export function normNote(n: Note): Note {
  const { pid, cid, pids: _a, cids: _b, ...rest } = n; const l = noteLinks(n);
  return { ...rest, ...(l.pids.length ? { pids: l.pids } : {}), ...(l.cids.length ? { cids: l.cids } : {}) };
}
/** Γενική (κανένας), για στρατιώτες, για στελέχη, ή μικτή. */
export const noteKind = (n: Links): NoteKind => { const l = noteLinks(n); return l.pids.length && l.cids.length ? 'mix' : l.pids.length ? 'sol' : l.cids.length ? 'cad' : 'gen'; };
/** Υπενθύμιση που έφτασε (σήμερα ή νωρίτερα) και δεν έχει ολοκληρωθεί. */
export const noteDue = (n: Note, today: ISODate): boolean => !n.done && !!n.rem && n.rem <= today;
export const dueCount = (notes: Note[] | undefined, today: ISODate): number => (notes || []).reduce((c, n) => c + (noteDue(n, today) ? 1 : 0), 0);
type NoteOwner = { pid: number } | { cid: string };
const linked = (n: Note, who: NoteOwner): boolean => { const l = noteLinks(n); return 'pid' in who ? l.pids.includes(who.pid) : l.cids.includes(who.cid); };

export interface PersonGroups extends NoteGroups { done: Note[]; open: number; dueN: number }
/** Η καρτέλα «Σημειώσεις» ενός ατόμου: οι ίδιες ομάδες με τη σελίδα, και οι ολοκληρωμένες (πιο πρόσφατες πρώτα) χωριστά. open: ανοιχτές, dueN: όσες ζητούν προσοχή σήμερα. */
export function personGroups(notes: Note[] | undefined, who: NoteOwner, today: ISODate): PersonGroups {
  const mine = (notes || []).filter(n => linked(n, who)); const g = noteGroups(mine.filter(n => !n.done), today);
  const done = mine.filter(n => n.done).sort((a, b) => b.done!.localeCompare(a.done!));
  return { ...g, done, open: g.due.length + g.soon.length + g.rest.length, dueN: g.due.length };
}
/** Η γραμμή υπενθύμισης του «Σήμερα:» στην κάρτα ατόμου (κενό αν δεν έφτασε καμία): η αρχή του κειμένου, ή πόσες είναι. */
export function remLine(notes: Note[] | undefined, who: NoteOwner, today: ISODate): string {
  const due = noteGroups((notes || []).filter(n => linked(n, who) && noteDue(n, today)), today).due;
  if (!due.length) return '';
  if (due.length > 1) return due.length + ' υπενθυμίσεις';
  return 'Υπενθύμιση: «' + noteHead(due[0].text, 50) + '»' + (due[0].rem! < today ? ' (εκπρόθεσμη)' : '');
}
/** Μικρό κείμενο για το Ιστορικό και τα μηνύματα. */
export const noteHead = (text: string, max = 60): string => { const t = text.replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t; };

export interface NoteWhoItem { key: string; kind: 'sol' | 'cad'; label: string; active: boolean }
export interface NoteWho { kind: NoteKind; label: string; active: boolean; items: NoteWhoItem[] }
/** Για ποιους είναι: ονόματα όπως στην εφαρμογή (χωρισμένα με κόμμα)· «εκτός δύναμης» όταν έφυγε ή σβήστηκε κάποιος. */
export function noteWho(s: S, n: Note, pm = personMap(s.people)): NoteWho {
  const l = noteLinks(n); const items: NoteWhoItem[] = [];
  for (const id of l.pids) { const p = pm.get(id); items.push({ key: 'p' + id, kind: 'sol', label: p ? p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '') : 'Άγνωστος στρατιώτης', active: !!p && p.active }); }
  for (const id of l.cids) { const c = s.cadreList.find(x => x.id === id); items.push({ key: 'c' + id, kind: 'cad', label: c ? [rankTxt(c), c.last, c.first ? c.first.charAt(0) + '.' : ''].filter(Boolean).join(' ') : 'Άγνωστο στέλεχος', active: !!c && c.active }); }
  if (!items.length) return { kind: 'gen', label: 'Γενική', active: true, items };
  return { kind: noteKind(n), label: items.map(x => x.label).join(', '), active: items.every(x => x.active), items };
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
  if (f === 'all') return true;
  if (f === 'rem') return !!n.rem;
  if (f === 'star') return !!n.star;
  const k = noteKind(n);   // μικτή: φαίνεται και στους στρατιώτες και στα στελέχη
  return f === 'gen' ? k === 'gen' : f === 'sol' ? k === 'sol' || k === 'mix' : k === 'cad' || k === 'mix';
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
    if (n.done) continue;
    for (const k of noteKeys(n)) { const x = m.get(k) || { n: 0, hot: false }; x.n++; if (noteDue(n, today)) x.hot = true; m.set(k, x); }
  }
  return m;
}
/** Τα κλειδιά των ατόμων μιας σημείωσης ('p1', 'cs1'). */
export const noteKeys = (n: Links): string[] => { const l = noteLinks(n); return [...l.pids.map(id => 'p' + id), ...l.cids.map(id => 'c' + id)]; };
export const whoKey = (w: { pid?: number; cid?: string }): string => (w.pid != null ? 'p' + w.pid : w.cid ? 'c' + w.cid : '');
