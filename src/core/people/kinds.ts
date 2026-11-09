// How a leave kind or a medical kind counts, and the names and codes of a status on screens and in the calendar.
//
// Purpose: leave → ΗΚΑΙ column and mode (`leaveCol`, `leaveMode`: absent / prevented / present), the «Text on the ΗΚΑΙ»
//   keys, cadre absences, the user's own medical kinds (`ownMed`, warning-only and note-only kinds, `noNotes`,
//   `live`), and `statusLbl` / `absCode`.
// Does NOT: apply the duty or out rules (core/duty and core/outs call `noDutyOf` / `noOutOf`) or own the list items
//   (ranks.ts) or the ΗΚΑΙ columns (hkRows.ts).
// Owner layer: core/people (no fs, no Electron, no React); imports ranks.ts and hkRows.ts.
// Why: one place knows that a leave of the user's own kind can count as absent, prevented or present, and that a
//   «note only» medical kind has no effect on the rules.
// @decision Michael 3/11: the user's own leave kinds choose how they count (LEAVE_NO_COL, LEAVE_AWAY_NO_COL).
// @decision Michael 4/11: «note only» medical kinds.
// Covering tests: test/own-leave-modes.test.ts, test/leave-no-col.test.ts, test/leave-text.test.ts,
//   test/note-only.test.ts, test/note-only-excel.test.ts, test/declare-own-med.test.ts.
import { norm, normGreek, upper } from '../lib/text';
import { CADRE_ABS } from '../model/cadreRecord';
import { LEAVE_KINDS, TYPES, type Status, type TypeKey } from '../model/status';
import type { AppState } from '../model/state';
import type { UserLists, ListItem, LeaveText } from '../model/lists';
import { itemKey, listRows } from './ranks';
import { HK_A, HK_K, userItem } from './hkRows';

/**
 * Leave → ΗΚΑΙ column: «Ειδική» goes to the Ειδικές, the other base kinds to the Κανονικές. The user's own kinds
 * choose for themselves: an absent column (absent everywhere), a prevented column (prevented: removed from those
 * present, no duty, no out) or '-' (LEAVE_NO_COL, «Πουθενά»: present everywhere, counts in no column; duties and out
 * only if asked: ListItem.duty / out).
 * @decision Michael 13/10 (Ειδική), 3/11 (own kinds)
 */
export const LEAVE_NO_COL = '-';
/**
 * '-a': «Πουθενά στην ΗΚΑΙ, απών στην εφαρμογή»: absent like the absent columns, but in no ΗΚΑΙ column (there it
 * counts as present).
 * @decision Michael 3/11
 */
export const LEAVE_AWAY_NO_COL = '-a';
/** Columns a leave kind can be assigned to in Λίστες: absent, prevented, or the two «Πουθενά» options. */
export const LEAVE_COLS: [string, string][] = [
  ...HK_A.map(([k, , full]) => [k, 'Απ.: ' + full] as [string, string]),
  ...HK_K.filter(([k]) => k !== 'bl').map(([k, , full]) => [k, 'Κωλ.: ' + full] as [string, string]),
  [LEAVE_NO_COL, 'Πουθενά στην ΗΚΑΙ (παρών παντού)'],
  [LEAVE_AWAY_NO_COL, 'Πουθενά στην ΗΚΑΙ (απών στην εφαρμογή)'],
];
/** How a leave counts: absent, prevented, or present. */
export type LeaveMode = 'away' | 'kol' | 'present';
// The user's own leave kind (not the base ones: Κανονική, Ειδική, ΑΜΔ, ΥΕΘΑ).
function ownLeave(kind: string | undefined, lists?: UserLists): ListItem | undefined {
  const add = lists?.leaveKinds?.add;
  if (!add?.length || !kind) return undefined;
  const n = leaveNameKey(kind);
  if (LEAVE_KINDS.some((b) => leaveNameKey(b) === n)) return undefined;
  return userItem(lists, 'leaveKinds', kind);
}
/** ΗΚΑΙ column of a leave kind: 'eid' for Ειδική, the user's own choice if valid, else 'ka'. */
export function leaveCol(kind: string | undefined, lists?: UserLists): string {
  const k = itemKey(kind || '');
  if (k === itemKey('Ειδική') || k === itemKey('Ειδική άδεια')) return 'eid';
  const own = ownLeave(kind, lists)?.col;
  return own && LEAVE_COLS.some((c) => c[0] === own) ? own : 'ka';
}
// How a leave counts: 'away' absent (the base kinds and those with an absent column), 'kol' prevented, 'present'
// present; undefined: not a leave. It is asked for every person on every count, so it is cached per kind and per the
// user's Λίστες.
// @decision Michael 3/11
const modeIdx = new WeakMap<object, Map<string, LeaveMode>>();
/** Counting mode of a status that is a leave; see the cache note above. undefined for other types. */
export function leaveMode(st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): LeaveMode | undefined {
  if (st.type !== 'LEAVE') return undefined;
  const add = lists?.leaveKinds?.add;
  if (!add?.length) return 'away';
  let m = modeIdx.get(add);
  if (!m) {
    m = new Map();
    modeIdx.set(add, m);
  }
  const key = st.kind || '';
  let r = m.get(key);
  if (r === undefined) {
    const c = ownLeave(key, lists)?.col;
    r = !c ? 'away' : c === LEAVE_NO_COL ? 'present' : HK_K.some((x) => x[0] === c && c !== 'bl') ? 'kol' : 'away';
    m.set(key, r);
  }
  return r;
}
/** Absent? Like TYPES[...].away, except a leave of the user's own kind that counts as prevented or present. */
export const isAway = (st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  !!TYPES[st.type].away && (st.type !== 'LEAVE' || leaveMode(st, lists) === 'away');
/** Leave «Πουθενά» (present): it goes into duties / out only if the user said so; other statuses follow TYPES. */
export const noDutyOf = (st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  !!TYPES[st.type].noDuty &&
  !(st.type === 'LEAVE' && leaveMode(st, lists) === 'present' && ownLeave(st.kind, lists)?.duty);
/** True when the status keeps the person from going out, honouring a «Πουθενά» leave that was allowed out. */
export const noOutOf = (st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  !!TYPES[st.type].noOut &&
  !(st.type === 'LEAVE' && leaveMode(st, lists) === 'present' && ownLeave(st.kind, lists)?.out);
/** What a leave kind does, in one line (Λίστες › Είδη άδειας); hk is the name of the ΗΚΑΙ in the unit. */
export function leaveEffect(kind: string | undefined, lists?: UserLists, hk = 'ΗΚΑΙ'): string {
  const m = leaveMode({ type: 'LEAVE', kind }, lists),
    col = leaveCol(kind, lists),
    short = [...HK_K, ...HK_A].find((x) => x[0] === col)?.[1] || col;
  if (m === 'kol')
    return (
      'Κωλυόμενος: αφαιρείται από τους παρόντες, στην ' + hk + ' στη στήλη ' + short + ', χωρίς υπηρεσία και έξοδο'
    );
  if (m === 'away' && col === LEAVE_AWAY_NO_COL)
    return 'Απών στην εφαρμογή, δεν μετρά σε στήλη της ' + hk + ' (εκεί μετρά στους παρόντες)';
  if (m === 'present') {
    const o = ownLeave(kind, lists);
    return (
      'Παρών παντού, δεν μετρά σε στήλη της ' +
      hk +
      (o?.duty ? ' · μπαίνει σε υπηρεσίες' : ' · όχι υπηρεσίες') +
      (o?.out ? ' · βγαίνει έξοδο' : ' · όχι έξοδο')
    );
  }
  return 'Απών παντού, στην ' + hk + ' στη στήλη ' + short;
}
/**
 * The leave kind as a phrase: «Κανονική άδεια», «Άδεια ΑΜΔ», «Τιμητική άδεια»; the user's own kinds as typed
 * («Αιμοδοσίας» → «Άδεια Αιμοδοσίας», «ΑΔΕΙΑ ΓΑΜΟΥ» stays as it is).
 */
export function leavePhrase(st: Pick<Status, 'type' | 'kind'>): string {
  const k = ((st.type === 'LEAVE' ? st.kind : '') || TYPES[st.type].long).trim();
  const n = norm(k);
  return /ΑΔΕΙΑ/.test(n) ? k : /Η$/.test(n) ? k + ' άδεια' : 'Άδεια ' + k;
}
/** The leave phrase in capitals, as written into Excel. */
export const leaveName = (st: Pick<Status, 'type' | 'kind'>): string => upper(leavePhrase(st));
// Key of the «Text on the ΗΚΑΙ» of a leave kind: the name without the trailing «άδεια» («Ειδική άδεια» = «Ειδική»).
// The honorary and sick leaves have a fixed key; cadre use 'Σ:' + status code (cadreAbsOf).
const noLeaveWord = (v: string) => itemKey(v).replace(/ ΑΔΕΙΑ$/, '');
/** Comparison key of a leave kind name; an empty name means the first base kind (Κανονική). */
export const leaveNameKey = (name: string | undefined) => noLeaveWord(name || LEAVE_KINDS[0]);
/** Key of the «Text on the ΗΚΑΙ» of the status' leave kind. */
export const leaveKey = (st: Pick<Status, 'type' | 'kind'>): string =>
  st.type === 'HON' ? noLeaveWord('Τιμητική') : st.type === 'SICK' ? noLeaveWord('Αναρρωτική') : leaveNameKey(st.kind);
/** Key of the «Text on the ΗΚΑΙ» of a cadre status code. */
export const cadreLeaveKey = (code: string) => 'Σ:' + code;
/** The user's «Text on the ΗΚΑΙ» for a leave status, or undefined when none was set. */
export function leaveTextOf(st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): LeaveText | undefined {
  const m = lists?.leaveText;
  return m ? m[leaveKey(st)] : undefined;
}
/**
 * Cadre statuses (the ΗΚΑΙ columns) as [code, name, ΗΚΑΙ column]. Base ones carry their code, the user's own use the
 * name as code. all: also the hidden ones (for records that already exist).
 */
export function cadreAbsKinds(lists?: UserLists, all = false): [string, string, string][] {
  const rows = listRows(lists, 'cadreAbs').filter((r) => all || !r.hidden);
  return rows.map((r) =>
    r.builtin ? CADRE_ABS.find((x) => x[1] === r.name)! : ([r.name, r.name, r.col || ''] as [string, string, string]),
  );
}
/** By code, else by name: a user kind (e.g. «Πρατήριο») that later became a base one keeps its column. */
export function cadreAbsOf(kind: string, lists?: UserLists): [string, string, string] | undefined {
  const all = cadreAbsKinds(lists, true);
  const k = itemKey(kind || '');
  return all.find((x) => x[0] === kind) || (k ? all.find((x) => itemKey(x[1]) === k) : undefined);
}

/**
 * Medical kinds: each of the user's own has a base type ΕΑ, ΕΥ, ΕΟ or ΕΑΡΒ (for the ΗΚΑΙ and whatever is not set in
 * the Καταστάσεις table) and its own name. It is stored in the «kind» of the status, as the ΕΑ-ΕΥ Excel writes and
 * reads it.
 * @decision Michael 13/10
 */
export const MED_LIKE: TypeKey[] = ['EA', 'EY', 'EO', 'EARV'];
// No spaces or dots: «ΕΛ.ΓΥΜΝ», «Ελ γυμν» and «ΕΛ ΓΥΜΝ» are the same (as the Excel is read).
const medKey = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
/** The user's own medical kind matching `kind` (with a valid base type), or undefined. */
export const ownMed = (lists: UserLists | undefined, kind: string | undefined) => {
  const k = medKey(kind || '');
  if (!k) return undefined;
  return (lists?.medKinds?.add || []).find((x) => x.like && MED_LIKE.includes(x.like) && medKey(x.name) === k);
};
/**
 * Excel value (or kind) → base type, if it is one of the user's own medical kinds; the base ones are recognised as
 * before.
 */
export const medTypeOf = (raw: string | undefined, lists?: UserLists): TypeKey | undefined => ownMed(lists, raw)?.like;
/** The user's own medical kinds offered when declaring a status (not the hidden ones). */
export const medKinds = (lists?: UserLists): ListItem[] =>
  listRows(lists, 'medKinds').filter((r) => !r.builtin && !r.hidden && r.like && MED_LIKE.includes(r.like));
/**
 * A user medical kind «warning only»: it goes into a duty, but with a warning.
 * @decision Michael 13/10
 */
export const medWarns = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  MED_LIKE.includes(s.type) && !!ownMed(lists, s.kind)?.warn && !ownMed(lists, s.kind)?.note;
/**
 * A user medical kind «note only»: it exists only as a note on the soldier, with no effect on duties, out, ΗΚΑΙ or
 * Δύναμη. noteBadge: also shown as a badge on the screens; noteXl: also written to the ΕΑ-ΕΥ Excel. A note never
 * warns.
 * @decision Michael 4/11
 */
export const medNote = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  MED_LIKE.includes(s.type) && !!ownMed(lists, s.kind)?.note;
/** True when the status is a «note only» medical kind that is also shown as a badge. */
export const medNoteBadge = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  medNote(s, lists) && !!ownMed(lists, s.kind)?.noteBadge;
/** True when the status is a «note only» medical kind that is also written to the ΕΑ-ΕΥ Excel. */
export const medNoteXl = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean =>
  medNote(s, lists) && !!ownMed(lists, s.kind)?.noteXl;
/** True when the user defined at least one «note only» medical kind. */
export const hasNoteKinds = (lists: UserLists | undefined): boolean =>
  !!lists?.medKinds?.add?.some((x) => x.note && x.like && MED_LIKE.includes(x.like));
// The statuses without the «note only» ones: everything that works by rules (duties, out, ΗΚΑΙ, Δύναμη, forms) reads
// from here. Without such a medical kind it returns the same array (same identity, same cache); otherwise it is
// cached per array and per list.
const liveIdx = new WeakMap<Status[], { k: object; out: Status[] }>();
/** Statuses without the «note only» medical kinds (see the cache note above). */
export function noNotes(statuses: Status[], lists: UserLists | undefined): Status[] {
  if (!hasNoteKinds(lists)) return statuses;
  const k = lists!.medKinds!.add!;
  const c = liveIdx.get(statuses);
  if (c && c.k === k) return c.out;
  const out = statuses.filter((x) => !medNote(x, lists));
  liveIdx.set(statuses, { k, out });
  return out;
}
// For the badges next to names: without the notes, except those marked «as a badge on the screens».
const badgeIdx = new WeakMap<Status[], { k: object; out: Status[] }>();
/** Statuses for the badges next to names (see the note above). */
export function badgeStatuses(statuses: Status[], lists: UserLists | undefined): Status[] {
  if (!hasNoteKinds(lists)) return statuses;
  const k = lists!.medKinds!.add!;
  const c = badgeIdx.get(statuses);
  if (c && c.k === k) return c.out;
  const out = statuses.filter((x) => !medNote(x, lists) || medNoteBadge(x, lists));
  badgeIdx.set(statuses, { k, out });
  return out;
}
/** The state's statuses without the «note only» ones; what every rule reads. */
export const live = (s: Pick<AppState, 'statuses' | 'settings'>): Status[] => noNotes(s.statuses, s.settings.lists);
/** Only the notes (card, Ιατρικά › Σημειώσεις). */
export const notesOf = (statuses: Status[], lists: UserLists | undefined): Status[] =>
  hasNoteKinds(lists) ? statuses.filter((x) => medNote(x, lists)) : [];

/** Status name in badges and lists: a penalty with its kind, the user's own medical kind with its name. */
export function statusLbl(s: Pick<Status, 'type' | 'kind'> & { note?: string }, lists?: UserLists): string {
  if (s.type === 'PUN') return upper(s.kind || TYPES.PUN.label); // penalties in capitals everywhere (Michael 13/10)
  if (s.type === 'KOL') return TYPES.KOL.label + (s.note?.trim() ? ': ' + s.note.trim() : ''); // the prevented one with the «which duty» text the user typed
  // leave by its kind as typed; only the regular one is «ΚΑ» (Michael 3/11: own kinds are not written «ΚΑ»)
  if (s.type === 'LEAVE') {
    const k = s.kind?.trim();
    if (k && leaveNameKey(k) !== leaveNameKey(LEAVE_KINDS[0])) return k;
  }
  const m = MED_LIKE.includes(s.type) ? ownMed(lists, s.kind) : undefined;
  return m ? m.name : TYPES[s.type].label;
}
/** Badge on the screens (Λ5, 1/11): the same as statusLbl. */
export const badgeLbl = statusLbl;
// Code in the calendar (Κ.Α, Ε.Υ…): what was set for the user's own medical kind or leave kind, else the base type's.
// Leave: Κανονική «Κ.Α», Ειδική «ΕΙΔ», ΑΜΔ, ΥΕΘΑ, and the user's own kind by its code or its name.
// @decision Michael 3/11
const LEAVE_CODES: Record<string, string> = { ΕΙΔΙΚΗ: 'ΕΙΔ', ΑΜΔ: 'ΑΜΔ', ΥΕΘΑ: 'ΥΕΘΑ' };
/** Calendar code of a status (see the note above); undefined when the type has no code. */
export function absCode(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): string | undefined {
  if (s.type === 'LEAVE') {
    const k = s.kind?.trim(),
      n = leaveNameKey(k);
    if (!k || n === leaveNameKey(LEAVE_KINDS[0])) return TYPES.LEAVE.code;
    return LEAVE_CODES[n] || ownLeave(k, lists)?.code || upper(k);
  }
  const m = MED_LIKE.includes(s.type) ? ownMed(lists, s.kind) : undefined;
  return m?.code || TYPES[s.type].code;
}
