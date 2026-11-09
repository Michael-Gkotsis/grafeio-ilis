// Notes of the office (Michael, 24/10): general, per soldier, per cadre member, with an optional reminder.
//
// Purpose: who a note is linked to (`noteLinks`, `noteKind`, `noteWho`), the stored form (`normNote`), reminders
//   that are due (`noteDue`, `dueCount`, `remLabel`, `quickRems`), the groups and filters of the page (`noteGroups`,
//   `personGroups`, `noteIn`, `NOTE_FILTERS`), the search and the small marks next to a name (`noteSearch`,
//   `noteIndex`, `noteKeys`, `whoKey`).
// Does NOT: write notes to Excel or to any printed form (they stay in the database of the app only), or save anything.
// Owner layer: core/notes (no fs, no Electron, no React); imports core/duty (personMap) and core/people (rankTxt).
// Why: the notes page, the person card, Ctrl+K and the History all group and label notes the same way.
// Covering tests: test/notes.test.ts, test/note-only.test.ts.
import { addDays, daysBetween, dm, dow, type ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { Note } from '../model/records';
import { personMap } from '../duty/indexes';
import { normGreek } from '../lib/text';
import { rankTxt } from '../people/ranks';

/** Longest note text, in characters. */
export const NOTE_MAX = 2000;
/** General (nobody), for soldiers, for cadre, or mixed. */
export type NoteKind = 'gen' | 'sol' | 'cad' | 'mix';
type S = Pick<AppState, 'people' | 'cadreList'>;

type Links = Pick<Note, 'pids' | 'cids' | 'pid' | 'cid'>;
/** Who a note is linked to (also the notes of the first version, with a single pid / cid). */
export function noteLinks(n: Links): { pids: number[]; cids: string[] } {
  const pids = [...(n.pids || [])];
  const cids = [...(n.cids || [])];
  if (n.pid != null && !pids.includes(n.pid)) pids.push(n.pid);
  if (n.cid && !cids.includes(n.cid)) cids.push(n.cid);
  return { pids, cids };
}
/** The note as it is stored: pids / cids only when they have something. */
export function normNote(n: Note): Note {
  const { pid, cid, pids: _a, cids: _b, ...rest } = n;
  const l = noteLinks(n);
  return { ...rest, ...(l.pids.length ? { pids: l.pids } : {}), ...(l.cids.length ? { cids: l.cids } : {}) };
}
/** General (nobody), for soldiers, for cadre, or mixed. */
export const noteKind = (n: Links): NoteKind => {
  const l = noteLinks(n);
  return l.pids.length && l.cids.length ? 'mix' : l.pids.length ? 'sol' : l.cids.length ? 'cad' : 'gen';
};
/** A reminder that has arrived (today or earlier) and is not done. */
export const noteDue = (n: Note, today: ISODate): boolean => !n.done && !!n.rem && n.rem <= today;
/** How many of the notes have a reminder that is due. */
export const dueCount = (notes: Note[] | undefined, today: ISODate): number =>
  (notes || []).reduce((c, n) => c + (noteDue(n, today) ? 1 : 0), 0);
type NoteOwner = { pid: number } | { cid: string };
const linked = (n: Note, who: NoteOwner): boolean => {
  const l = noteLinks(n);
  return 'pid' in who ? l.pids.includes(who.pid) : l.cids.includes(who.cid);
};

/** The groups of the card «Σημειώσεις» of one person. */
export interface PersonGroups extends NoteGroups {
  done: Note[];
  open: number;
  dueN: number;
}
/**
 * The card «Σημειώσεις» of one person: the same groups as the page, and the done ones (latest first) apart.
 * `open` = open notes, `dueN` = those that need attention today.
 */
export function personGroups(notes: Note[] | undefined, who: NoteOwner, today: ISODate): PersonGroups {
  const mine = (notes || []).filter((n) => linked(n, who));
  const g = noteGroups(
    mine.filter((n) => !n.done),
    today,
  );
  const done = mine.filter((n) => n.done).sort((a, b) => b.done!.localeCompare(a.done!));
  return { ...g, done, open: g.due.length + g.soon.length + g.rest.length, dueN: g.due.length };
}
/**
 * The reminder line «Σήμερα:» on the person card ('' when none has arrived): the start of the text, or how many
 * there are.
 */
export function remLine(notes: Note[] | undefined, who: NoteOwner, today: ISODate): string {
  const due = noteGroups(
    (notes || []).filter((n) => linked(n, who) && noteDue(n, today)),
    today,
  ).due;
  if (!due.length) return '';
  if (due.length > 1) return due.length + ' υπενθυμίσεις';
  return 'Υπενθύμιση: «' + noteHead(due[0].text, 50) + '»' + (due[0].rem! < today ? ' (εκπρόθεσμη)' : '');
}
/** A short text for the History and the messages. */
export const noteHead = (text: string, max = 60): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

/** One person a note is for, as shown in the app. */
export interface NoteWhoItem {
  key: string;
  kind: 'sol' | 'cad';
  label: string;
  active: boolean;
}
/** Who a note is for: the kind, the joined label, whether all are in strength, and the single persons. */
export interface NoteWho {
  kind: NoteKind;
  label: string;
  active: boolean;
  items: NoteWhoItem[];
}
/**
 * Who a note is for: names as in the app, joined with commas. `active` is false when someone left or was deleted
 * («εκτός δύναμης»).
 * @param pm the person map of `s.people` (pass it when calling in a loop)
 */
export function noteWho(s: S, n: Note, pm = personMap(s.people)): NoteWho {
  const l = noteLinks(n);
  const items: NoteWhoItem[] = [];
  for (const id of l.pids) {
    const p = pm.get(id);
    items.push({
      key: 'p' + id,
      kind: 'sol',
      label: p ? p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '') : 'Άγνωστος στρατιώτης',
      active: !!p && p.active,
    });
  }
  for (const id of l.cids) {
    const c = s.cadreList.find((x) => x.id === id);
    items.push({
      key: 'c' + id,
      kind: 'cad',
      label: c
        ? [rankTxt(c), c.last, c.first ? c.first.charAt(0) + '.' : ''].filter(Boolean).join(' ')
        : 'Άγνωστο στέλεχος',
      active: !!c && c.active,
    });
  }
  if (!items.length) return { kind: 'gen', label: 'Γενική', active: true, items };
  return {
    kind: noteKind(n),
    label: items.map((x) => x.label).join(', '),
    active: items.every((x) => x.active),
    items,
  };
}

/** The label of a reminder date and its tone (bad = late or today, warn = tomorrow, info = later, muted = done). */
export interface RemLabel {
  text: string;
  tone: 'bad' | 'warn' | 'info' | 'muted';
}
/** The label of the reminder date `rem` as seen on `today`; a done note shows only the date. */
export function remLabel(rem: ISODate, today: ISODate, done?: boolean): RemLabel {
  if (done) return { text: dm(rem), tone: 'muted' };
  const d = daysBetween(today, rem) - 1;
  if (d < 0) return { text: 'Εκπρόθεσμη ' + -d + (d === -1 ? ' μέρα' : ' μέρες'), tone: 'bad' };
  if (d === 0) return { text: 'Σήμερα', tone: 'bad' };
  if (d === 1) return { text: 'Αύριο', tone: 'warn' };
  return { text: dow(rem) + ' ' + dm(rem) + ' · σε ' + d + ' μέρες', tone: 'info' };
}

/** The filters of the notes page. */
export type NoteFilter = 'all' | 'rem' | 'star' | 'gen' | 'sol' | 'cad' | 'done';
/** The filters of the notes page with their labels, in screen order. */
export const NOTE_FILTERS: [NoteFilter, string][] = [
  ['all', 'Όλες'],
  ['rem', 'Υπενθυμίσεις'],
  ['star', 'Σημαντικές'],
  ['gen', 'Γενικές'],
  ['sol', 'Στρατιώτες'],
  ['cad', 'Στελέχη'],
  ['done', 'Ολοκληρωμένες'],
];
/** True when the note passes the filter. A mixed note shows both under the soldiers and under the cadre. */
export function noteIn(f: NoteFilter, n: Note): boolean {
  if (f === 'done') return !!n.done;
  if (n.done) return false;
  if (f === 'all') return true;
  if (f === 'rem') return !!n.rem;
  if (f === 'star') return !!n.star;
  const k = noteKind(n);
  return f === 'gen' ? k === 'gen' : f === 'sol' ? k === 'sol' || k === 'mix' : k === 'cad' || k === 'mix';
}

/** The three groups of the open notes. */
export interface NoteGroups {
  due: Note[];
  soon: Note[];
  rest: Note[];
}
/**
 * «Πρέπει σήμερα» (a reminder that has arrived), «Με υπενθύμιση» (a future one), and the rest: starred first,
 * newer on top.
 */
export function noteGroups(list: Note[], today: ISODate): NoteGroups {
  const order = new Map(list.map((n, i) => [n.id, i]));
  const byRem = (a: Note, b: Note) => a.rem!.localeCompare(b.rem!) || order.get(a.id)! - order.get(b.id)!;
  const due = list.filter((n) => noteDue(n, today)).sort(byRem);
  const soon = list.filter((n) => !n.done && n.rem && n.rem > today).sort(byRem);
  const rest = list
    .filter((n) => n.done || !n.rem)
    .sort((a, b) => +!!b.star - +!!a.star || order.get(b.id)! - order.get(a.id)!);
  return { due, soon, rest };
}

/** Search (Ctrl+K, the filter of the page): the text and the name of the person, without accents. */
export const noteSearch = (s: S, n: Note, q: string): boolean => {
  const k = normGreek(q).trim();
  if (!k) return true;
  const hay = normGreek(n.text + ' ' + noteWho(s, n).label);
  return k.split(/\s+/).every((t) => hay.includes(t));
};

/**
 * The quick reminders of the dialog: tomorrow, the next Monday (not when it is already tomorrow or the same as
 * «σε μία εβδομάδα») and in one week.
 */
export function quickRems(today: ISODate): { id: string; label: string; date: ISODate }[] {
  const wd = new Date(today + 'T12:00:00').getDay();
  const toMon = (8 - wd) % 7 || 7;
  const mon = addDays(today, toMon);
  const out = [{ id: 'tom', label: 'Αύριο', date: addDays(today, 1) }];
  if (toMon > 1 && toMon < 7) out.push({ id: 'mon', label: 'Δευτέρα ' + dm(mon), date: mon });
  out.push({ id: 'wk', label: 'Σε μία εβδομάδα', date: addDays(today, 7) });
  return out;
}

/** The mark next to a name: how many open notes and whether one has a reminder that has arrived. */
export interface NoteMark {
  n: number;
  hot: boolean;
}
/**
 * Per person ('p' + soldier id, 'c' + cadre id): how many open notes the person has and whether one has a reminder
 * that has arrived. For the small mark next to the name.
 */
export function noteIndex(notes: Note[] | undefined, today: ISODate): Map<string, NoteMark> {
  const m = new Map<string, NoteMark>();
  for (const n of notes || []) {
    if (n.done) continue;
    for (const k of noteKeys(n)) {
      const x = m.get(k) || { n: 0, hot: false };
      x.n++;
      if (noteDue(n, today)) x.hot = true;
      m.set(k, x);
    }
  }
  return m;
}
/** The keys of the persons of a note ('p1', 'cs1'). */
export const noteKeys = (n: Links): string[] => {
  const l = noteLinks(n);
  return [...l.pids.map((id) => 'p' + id), ...l.cids.map((id) => 'c' + id)];
};
/** The key of one person, as in `noteKeys` ('' when neither pid nor cid is given). */
export const whoKey = (w: { pid?: number; cid?: string }): string =>
  w.pid != null ? 'p' + w.pid : w.cid ? 'c' + w.cid : '';
