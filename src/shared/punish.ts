// Κείμενο ποινής για το Word (από την εφαρμογή του άλλου γραφέα): «Ο ΣΤΡ (ΠΖ) … τιμωρήθηκε την … από τον … με δύο (02) ημέρες κράτηση, διότι …»
import { addDays, daysBetween, dmy, type ISODate } from './dates';
import { fullName, type AppState, type Person, type Status } from './domain';
import { itemKey, userItem, type UserLists } from './ranks';
import { dutyIndexOf } from './rules';
import { upper } from './text';

// Ανώτατες ημέρες ανά είδος· πάνω από αυτές η εφαρμογή προειδοποιεί (δεν απαγορεύει)
export const PUN_MAX: Record<string, number> = { 'Κράτηση': 8, 'Στέρηση εξόδου': 4 };
const ACC: Record<string, string> = { 'Περιορισμός': 'περιορισμό', 'Κράτηση': 'κράτηση', 'Φυλάκιση': 'φυλάκιση', 'Στέρηση εξόδου': 'στέρηση εξόδου' };
const ONES = ['', 'μία', 'δύο', 'τρεις', 'τέσσερις', 'πέντε', 'έξι', 'επτά', 'οκτώ', 'εννέα'];
const TEENS = ['δέκα', 'έντεκα', 'δώδεκα', 'δεκατρείς', 'δεκατέσσερις', 'δεκαπέντε', 'δεκαέξι', 'δεκαεπτά', 'δεκαοκτώ', 'δεκαεννέα'];
const TENS = ['', '', 'είκοσι', 'τριάντα', 'σαράντα', 'πενήντα', 'εξήντα'];
export function daysWord(n: number): string {
  if (n < 10) return ONES[n] || String(n);
  if (n < 20) return TEENS[n - 10];
  if (n < 70) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return String(n);
}
// Ημέρες ποινής: στη στέρηση εξόδου όσες δηλώθηκαν (οι μέρες με υπηρεσία ή βραδινή εκπαίδευση δεν μετράνε)
export const punDays = (st: Pick<Status, 'from' | 'to' | 'days'>) => st.days || daysBetween(st.from, st.to);
// Το είδος της ποινής όπως φαίνεται και γράφεται παντού: κεφαλαία (Michael, 13/10)
export const punLbl = (kind: string | undefined) => upper(kind || 'Ποινή');
// Τα βασικά είδη και όσα πρόσθεσες στις Λίστες (με το δικό τους κείμενο και τις ανώτατες ημέρες)
const builtin = <T>(m: Record<string, T>, kind: string | undefined): T | undefined => { const k = itemKey(kind || ''); const hit = Object.keys(m).find(x => itemKey(x) === k); return hit ? m[hit] : undefined; };
export const punMax = (kind: string | undefined, lists?: UserLists): number => builtin(PUN_MAX, kind) ?? (userItem(lists, 'punKinds', kind)?.max || 0);
export const punAcc = (kind: string | undefined, lists?: UserLists): string => builtin(ACC, kind) ?? (userItem(lists, 'punKinds', kind)?.acc || (kind || 'ποινή').toLowerCase());
export const overMax = (kind: string | undefined, days: number, lists?: UserLists) => { const m = punMax(kind, lists); return m && days > m ? m : 0; };
export interface PunText { before: string; dur: string; after: string; plain: string; html: string }
// Η διάρκεια χωριστά, για να μπει υπογραμμισμένη στο Word
export function punText(p: Person, st: Status, lists?: UserLists): PunText {
  const n = punDays(st);
  const before = 'Ο ' + p.rank + (p.spec ? ' (' + p.spec + ')' : '') + ' ' + fullName(p) + ' τιμωρήθηκε την ' + dmy(st.on || st.from) + ' από τον ' + (st.by || '……') + ' με ';
  const dur = daysWord(n) + ' (' + String(n).padStart(2, '0') + ') ' + (n === 1 ? 'ημέρα' : 'ημέρες') + ' ' + punAcc(st.kind, lists);
  const after = ', διότι ' + (st.reason ? st.reason.trim().replace(/[.\s]+$/, '') : '……') + '.';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return caps({ before, dur, after }, esc);
}
// Όλο το κείμενο της ποινής με κεφαλαία (ΗΚΑΙ και Word)
function caps(t: { before: string; dur: string; after: string }, esc: (t: string) => string): PunText {
  const before = upper(t.before), dur = upper(t.dur), after = upper(t.after);
  return { before, dur, after, plain: before + dur + after, html: '<p>' + esc(before) + '<u>' + esc(dur) + '</u>' + esc(after) + '</p>' };
}
// Προτάσεις για το «Ποιος τιμώρησε»: όσοι έχουν ήδη γραφτεί σε ποινές και τα στελέχη
export function punBySuggestions(s: AppState): string[] {
  const out = new Set<string>();
  for (const st of s.statuses) if (st.type === 'PUN' && st.by) out.add(st.by);
  for (const c of s.cadreList || []) if (c.active) out.add((c.rank + ' ' + c.last).trim());
  return [...out].sort((a, b) => a.localeCompare(b, 'el'));
}

// ---------------------------------------------------------------------------
// Στέρηση εξόδου (Michael, 13/10): οι μέρες με υπηρεσία και οι μέρες με βραδινή εκπαίδευση δεν μετράνε, άρα η λήξη
// μετακινείται μία μέρα για καθεμία. Η ποινή κρατά τις ημέρες της (days) και το «έως» βγαίνει από αυτές μετά από
// κάθε ενέργεια (fitDeprivations). Παλιές εγγραφές χωρίς days μένουν όπως γράφτηκαν.
// ---------------------------------------------------------------------------
export const isDeprivation = (st: Pick<Status, 'type' | 'kind'>) => st.type === 'PUN' && itemKey(st.kind || '') === itemKey('Στέρηση εξόδου');
type Skip = (d: ISODate) => 'duty' | 'night' | null;
function skipper(s: AppState, pid: number): Skip {
  const duty = dutyIndexOf(s).get(pid); const night = s.nightTraining || {};
  return d => (duty?.has(d) ? 'duty' : night[d] ? 'night' : null);
}
// Η μέρα που συμπληρώνονται οι days ημέρες από το «από»
export function deprivationEnd(s: AppState, pid: number, from: ISODate, days: number): ISODate {
  const skip = skipper(s, pid); let d = from, n = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (!skip(d) && ++n >= days) return d;
  return d;
}
// Πόσες μέρες μετράνε από το «από» ως το «έως» (για εγγραφές που ήρθαν από Excel με δική τους λήξη)
export function servedDays(s: AppState, pid: number, from: ISODate, to: ISODate): number {
  const skip = skipper(s, pid); let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!skip(d)) n++;
  return n;
}
// Οι μέρες που δεν μέτρησαν μέσα στο διάστημα της ποινής, για να φαίνεται γιατί μετακινήθηκε η λήξη
export function skippedDays(s: AppState, st: Status): { date: ISODate; why: 'duty' | 'night' }[] {
  if (!st.days || !isDeprivation(st)) return [];
  const skip = skipper(s, st.pid); const out: { date: ISODate; why: 'duty' | 'night' }[] = [];
  for (let d = st.from; d <= st.to; d = addDays(d, 1)) { const w = skip(d); if (w) out.push({ date: d, why: w }); }
  return out;
}
// Ξαναβγάζει το «έως» κάθε στέρησης εξόδου από τις ημέρες της. Ίδια κατάσταση (ίδιο αντικείμενο) αν δεν άλλαξε τίποτα.
export function fitDeprivations(s: AppState): AppState {
  let out: Status[] | null = null;
  s.statuses.forEach((x, i) => {
    if (!x.days || x.open || !isDeprivation(x)) return;
    const to = deprivationEnd(s, x.pid, x.from, x.days);
    if (to === x.to) return;
    out = out || [...s.statuses]; out[i] = { ...x, to };
  });
  return out ? { ...s, statuses: out } : s;
}
