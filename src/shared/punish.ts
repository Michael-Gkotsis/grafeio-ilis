// Κείμενο ποινής για το Word (από την εφαρμογή του άλλου γραφέα): «Ο ΣΤΡ (ΠΖ) … τιμωρήθηκε την … από τον … με δύο (02) ημέρες κράτηση, διότι …»
import { daysBetween, dmy } from './dates';
import type { AppState, Person, Status } from './domain';
import { itemKey, userItem, type UserLists } from './ranks';

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
export const punDays = (st: Status) => daysBetween(st.from, st.to);
// Τα βασικά είδη και όσα πρόσθεσες στις Λίστες (με το δικό τους κείμενο και τις ανώτατες ημέρες)
const builtin = <T>(m: Record<string, T>, kind: string | undefined): T | undefined => { const k = itemKey(kind || ''); const hit = Object.keys(m).find(x => itemKey(x) === k); return hit ? m[hit] : undefined; };
export const punMax = (kind: string | undefined, lists?: UserLists): number => builtin(PUN_MAX, kind) ?? (userItem(lists, 'punKinds', kind)?.max || 0);
export const punAcc = (kind: string | undefined, lists?: UserLists): string => builtin(ACC, kind) ?? (userItem(lists, 'punKinds', kind)?.acc || (kind || 'ποινή').toLowerCase());
export const overMax = (kind: string | undefined, days: number, lists?: UserLists) => { const m = punMax(kind, lists); return m && days > m ? m : 0; };
export interface PunText { before: string; dur: string; after: string; plain: string; html: string }
// Η διάρκεια χωριστά, για να μπει υπογραμμισμένη στο Word
export function punText(p: Person, st: Status, lists?: UserLists): PunText {
  const n = punDays(st);
  const before = 'Ο ' + p.rank + (p.spec ? ' (' + p.spec + ')' : '') + ' ' + p.last + ' ' + p.first + ' τιμωρήθηκε την ' + dmy(st.on || st.from) + ' από τον ' + (st.by || '……') + ' με ';
  const dur = daysWord(n) + ' (' + String(n).padStart(2, '0') + ') ' + (n === 1 ? 'ημέρα' : 'ημέρες') + ' ' + punAcc(st.kind, lists);
  const after = ', διότι ' + (st.reason ? st.reason.trim().replace(/[.\s]+$/, '') : '……') + '.';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { before, dur, after, plain: before + dur + after, html: '<p>' + esc(before) + '<u>' + esc(dur) + '</u>' + esc(after) + '</p>' };
}
// Προτάσεις για το «Ποιος τιμώρησε»: όσοι έχουν ήδη γραφτεί σε ποινές και τα στελέχη
export function punBySuggestions(s: AppState): string[] {
  const out = new Set<string>();
  for (const st of s.statuses) if (st.type === 'PUN' && st.by) out.add(st.by);
  for (const c of s.cadreList || []) if (c.active) out.add((c.rank + ' ' + c.last).trim());
  return [...out].sort((a, b) => a.localeCompare(b, 'el'));
}
