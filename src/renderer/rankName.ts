// Βαθμός και όπλο πριν το όνομα στις οθόνες: «ΣΤΡ (ΠΖ) ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.» (Michael, 4/11).
// Μόνο για την εμφάνιση στην εφαρμογή· τα Excel/εκτυπώσεις (shared, sheets.ts) δεν αλλάζουν.
// Το πρόθεμα είναι ίδιο με το rankName του froura.ts· το όνομα έρχεται από τις fullName/shortName/plainName (πατρώνυμο στους συνονόματους).
import { createElement } from 'react';
import { rankTxt } from '../shared/ranks';
import { fullName, plainName, shortName, type Person } from '../shared/domain';

// Ρύθμιση του PC (prefs.rankNames)· ορίζεται από το App σε κάθε render, ώστε να δουλεύουν και οι συναρτήσεις κειμένου έξω από components
let on = true;
export const setRankNamesOn = (v: boolean) => { on = v; };

export const rkOn = () => on;
// keep: σε σημεία που ήδη τύπωναν τον βαθμό, με κλειστή ρύθμιση μένει ο βαθμός όπως πριν
export function rkPrefix(p: Person, keep = false): string {
  return on ? [rankTxt(p), p.spec ? '(' + p.spec + ')' : ''].filter(Boolean).join(' ') : keep ? rankTxt(p) : '';
}
// απλό κείμενο «ΠΡΟΘΕΜΑ ΟΝΟΜΑ» (toasts, aria-label, data-tip, περιγραφές, επιλογές λίστας)
export function rkText(p: Person, nameFn: (p: Person) => string = shortName, keep = false): string {
  const pre = rkPrefix(p, keep); return pre ? pre + ' ' + nameFn(p) : nameFn(p);
}
export const rkShort = (p: Person) => rkText(p, shortName);
export const rkFull = (p: Person) => rkText(p, fullName);
export const rkPlain = (p: Person) => rkText(p, plainName);
// Για JSX/html: γκρι πρόθεμα + όνομα (το όνομα κρατά το στυλ του γονέα)
export function RkName({ p, fn = shortName, keep = false }: { p: Person; fn?: (p: Person) => string; keep?: boolean }) {
  const pre = rkPrefix(p, keep);
  return pre ? createElement('span', null, createElement('span', { className: 'rk' }, pre + ' '), fn(p)) : createElement('span', null, fn(p));
}
