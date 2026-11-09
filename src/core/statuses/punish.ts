// Penalties: the Word / ΗΚΑΙ sentence of a penalty and the counting of the days of a deprivation of leave.
//
// Purpose: the kinds and limits (`PUN_MAX`, `punMax`, `punAcc`, `overMax`, `isDeprivation`), the sentence
//   (`punText`, `punGroupKey`, `hkWho`, `joinAnd`, `daysWord`, `punLbl`, `punDays`), the suggestions for
//   «Ποιος τιμώρησε» (`punBySuggestions`) and the days of «Στέρηση εξόδου» (`deprivationEnd`, `servedDays`,
//   `skippedDays`, `fitDeprivations`).
// Does NOT: write the Word / ΗΚΑΙ file (src/main does), save the statuses, or own the user's kinds
//   (core/people/hkRows.ts).
// Owner layer: core/statuses (no fs, no Electron, no React); imports core/people (ranks, hkRows) and core/duty
//   (dutyIndexOf).
// Why: Word and ΗΚΑΙ use the same sentence, and the end date of a deprivation depends on the duties and the evening
//   training of the person, so the rule is one pure function. The sentence is from the app of the other clerk:
//   «Ο ΣΤΡ (ΠΖ) … τιμωρήθηκε την … από τον … με δύο (02) ημέρες κράτηση, διότι …».
// Covering tests: test/deprivation.test.ts, test/hkai.test.ts, test/cases.test.ts.
import { addDays, daysBetween, hkDate, type ISODate } from '../lib/dates';
import { fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Status } from '../model/status';
import { rankTxt, itemKey } from '../people/ranks';
import { userItem } from '../people/hkRows';
import type { UserLists } from '../model/lists';
import { dutyIndexOf } from '../duty/dutyIndex';
import { upper } from '../lib/text';
import { withArticle } from '../lib/greek';

/** Highest days per kind; above them the app warns (it does not forbid). */
export const PUN_MAX: Record<string, number> = { Κράτηση: 8, 'Στέρηση εξόδου': 4 };
const ACC: Record<string, string> = {
  Περιορισμός: 'περιορισμό',
  Κράτηση: 'κράτηση',
  Φυλάκιση: 'φυλάκιση',
  'Στέρηση εξόδου': 'στέρηση εξόδου',
};
const ONES = ['', 'μία', 'δύο', 'τρεις', 'τέσσερις', 'πέντε', 'έξι', 'επτά', 'οκτώ', 'εννέα'];
const TEENS = [
  'δέκα',
  'έντεκα',
  'δώδεκα',
  'δεκατρείς',
  'δεκατέσσερις',
  'δεκαπέντε',
  'δεκαέξι',
  'δεκαεπτά',
  'δεκαοκτώ',
  'δεκαεννέα',
];
const TENS = ['', '', 'είκοσι', 'τριάντα', 'σαράντα', 'πενήντα', 'εξήντα'];
/** A number of days in Greek words (up to 69; above that the number itself). */
export function daysWord(n: number): string {
  if (n < 10) return ONES[n] || String(n);
  if (n < 20) return TEENS[n - 10];
  if (n < 70) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return String(n);
}
/**
 * The days of a penalty. For a deprivation of leave it is what was declared (the days with a duty or evening training
 * do not count).
 */
export const punDays = (st: Pick<Status, 'from' | 'to' | 'days'>) => st.days || daysBetween(st.from, st.to);
/**
 * The kind of the penalty as it is shown and written everywhere: in capitals.
 * @decision Michael 13/10: the kind of the penalty in capitals.
 */
export const punLbl = (kind: string | undefined) => upper(kind || 'Ποινή');
// The built-in kinds and those added in Λίστες (with their own text and highest days)
const builtin = <T>(m: Record<string, T>, kind: string | undefined): T | undefined => {
  const k = itemKey(kind || '');
  const hit = Object.keys(m).find((x) => itemKey(x) === k);
  return hit ? m[hit] : undefined;
};
/** Highest days of a kind (0 = no limit), built-in or from the user's lists. */
export const punMax = (kind: string | undefined, lists?: UserLists): number =>
  builtin(PUN_MAX, kind) ?? (userItem(lists, 'punKinds', kind)?.max || 0);
/** The kind in the accusative, for the sentence («κράτηση»), built-in or from the user's lists. */
export const punAcc = (kind: string | undefined, lists?: UserLists): string =>
  builtin(ACC, kind) ?? (userItem(lists, 'punKinds', kind)?.acc || (kind || 'ποινή').toLowerCase());
/** The limit when `days` is over it, otherwise 0. */
export const overMax = (kind: string | undefined, days: number, lists?: UserLists) => {
  const m = punMax(kind, lists);
  return m && days > m ? m : 0;
};
/** The sentence in three parts (the duration apart, to be underlined in Word and ΗΚΑΙ), as plain text and as HTML. */
export interface PunText {
  before: string;
  dur: string;
  after: string;
  plain: string;
  html: string;
}
/** «ΣΤΡ (ΠΖ) ΕΠΩΝΥΜΟ ΟΝΟΜΑ», as written in the sentences of the ΗΚΑΙ. */
export const hkWho = (p: Person) => rankTxt(p) + (p.spec ? ' (' + p.spec + ')' : '') + ' ' + fullName(p);
/** «Α», «Α και Β», «Α, Β και Γ». */
export const joinAnd = (xs: string[]) =>
  xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' και ' + xs[xs.length - 1];
/**
 * The sentence of a penalty, in capitals. The duration is apart so that it can be underlined in Word and in the ΗΚΑΙ.
 * Many people with the same penalty (same kind, days, date, who and why, see `punGroupKey`) get one sentence for all.
 * The one who punished is written as given (in the accusative).
 * @decision Michael 17/10: one sentence for all the people with the same penalty.
 */
export function punText(p: Person | Person[], st: Status, lists?: UserLists): PunText {
  const ps = Array.isArray(p) ? p : [p];
  const many = ps.length > 1;
  const n = punDays(st);
  const before =
    (many ? 'Οι ' : 'Ο ') +
    joinAnd(ps.map(hkWho)) +
    (many ? ' τιμωρήθηκαν' : ' τιμωρήθηκε') +
    ' την ' +
    hkDate(st.on || st.from) +
    ' από ' +
    (st.by?.trim() ? withArticle(st.by) : 'τον ……') +
    ' με ';
  const dur =
    daysWord(n) +
    ' (' +
    String(n).padStart(2, '0') +
    ') ' +
    (n === 1 ? 'ημέρα' : 'ημέρες') +
    ' ' +
    punAcc(st.kind, lists);
  const after = ', διότι ' + (st.reason ? st.reason.trim().replace(/[.\s]+$/, '') : '……') + '.';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return caps({ before, dur, after }, esc);
}
/** The same penalty for many: same kind, days, date of punishment, who punished and reason. */
export const punGroupKey = (st: Status, lists?: UserLists) =>
  [
    itemKey(punAcc(st.kind, lists)),
    punDays(st),
    st.on || st.from,
    withArticle(st.by || ''),
    upper((st.reason || '').trim().replace(/[.\s]+$/, '')),
  ].join('|');
// The whole text of the penalty in capitals (ΗΚΑΙ and Word)
function caps(t: { before: string; dur: string; after: string }, esc: (t: string) => string): PunText {
  const before = upper(t.before),
    dur = upper(t.dur),
    after = upper(t.after);
  return {
    before,
    dur,
    after,
    plain: before + dur + after,
    html: '<p>' + esc(before) + '<u>' + esc(dur) + '</u>' + esc(after) + '</p>',
  };
}
/** Suggestions for «Ποιος τιμώρησε»: those already written in penalties, and the cadre. Sorted in Greek order. */
export function punBySuggestions(s: AppState): string[] {
  const out = new Set<string>();
  for (const st of s.statuses) if (st.type === 'PUN' && st.by) out.add(st.by);
  for (const c of s.cadreList || []) if (c.active) out.add((rankTxt(c) + ' ' + c.last).trim());
  return [...out].sort((a, b) => a.localeCompare(b, 'el'));
}

// ---------------------------------------------------------------------------
// Deprivation of leave («Στέρηση εξόδου»): the days with a duty and the days with evening training do not count, so the
// end moves one day for each. The penalty keeps its days (`days`) and the «έως» is derived from them after every
// action (`fitDeprivations`). Old entries without `days` stay as they were written.
// @decision Michael 13/10: duty days and evening-training days do not count.
// ---------------------------------------------------------------------------
/** True when the status is a penalty of the kind «Στέρηση εξόδου». */
export const isDeprivation = (st: Pick<Status, 'type' | 'kind'>) =>
  st.type === 'PUN' && itemKey(st.kind || '') === itemKey('Στέρηση εξόδου');
type Skip = (d: ISODate) => 'duty' | 'night' | null;
function skipper(s: AppState, pid: number): Skip {
  const duty = dutyIndexOf(s).get(pid);
  const night = s.nightTraining || {};
  return (d) => (duty?.has(d) ? 'duty' : night[d] ? 'night' : null);
}
/** The day on which `days` days are completed, counting from `from` (days with a duty or evening training skipped). */
export function deprivationEnd(s: AppState, pid: number, from: ISODate, days: number): ISODate {
  const skip = skipper(s, pid);
  let d = from,
    n = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (!skip(d) && ++n >= days) return d;
  return d;
}
/** How many days count from `from` to `to` (for entries that came from Excel with an end of their own). */
export function servedDays(s: AppState, pid: number, from: ISODate, to: ISODate): number {
  const skip = skipper(s, pid);
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!skip(d)) n++;
  return n;
}
/** The days that did not count inside the period of the penalty, to show why the end moved. */
export function skippedDays(s: AppState, st: Status): { date: ISODate; why: 'duty' | 'night' }[] {
  if (!st.days || !isDeprivation(st)) return [];
  const skip = skipper(s, st.pid);
  const out: { date: ISODate; why: 'duty' | 'night' }[] = [];
  for (let d = st.from; d <= st.to; d = addDays(d, 1)) {
    const w = skip(d);
    if (w) out.push({ date: d, why: w });
  }
  return out;
}
/** Derives the «έως» of every deprivation of leave again from its days. The same state object if nothing changed. */
export function fitDeprivations(s: AppState): AppState {
  let out: Status[] | null = null;
  s.statuses.forEach((x, i) => {
    if (!x.days || x.open || !isDeprivation(x)) return;
    const to = deprivationEnd(s, x.pid, x.from, x.days);
    if (to === x.to) return;
    out = out || [...s.statuses];
    out[i] = { ...x, to };
  });
  return out ? { ...s, statuses: out } : s;
}
