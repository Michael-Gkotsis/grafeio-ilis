// Ποιες οθόνες και καρτέλες φαίνονται (Ρυθμίσεις › Οθόνες και καρτέλες). Αποθηκεύουμε ό,τι είναι ΚΡΥΜΜΕΝΟ (settings.hide):
// ό,τι λείπει από τη λίστα φαίνεται. Κρύβεται μόνο η εμφάνιση: δεδομένα και αρχεία Excel/Word δεν αλλάζουν ποτέ.
import type { Settings } from '../shared/domain';

type Hide = Pick<Settings, 'hide'>;
// οθόνη → [όνομα, πάντα ανοιχτή, καρτέλες [id, όνομα, πάντα ανοιχτή]]. Τα id των καρτελών είναι οι τιμές που έχουν ήδη οι οθόνες.
export const SCREEN_TABLE: [string, string, boolean, [string, string, boolean?][]][] = [
  ['home', 'Σήμερα', false, []],
  ['people', 'Στρατιώτες', true, [['list', 'Λίστα', true], ['imer', 'Ημερολόγιο κωλυομένων']]],
  ['cadre', 'Στελέχη', true, [['list', 'Λίστα', true], ['plan', 'Πρόγραμμα αδειών'], ['duty', 'Υπηρεσίες στελεχών']]],
  ['guard', 'Υπηρεσίες', false, [['posts', 'Θέσεις'], ['check', 'Έλεγχος υπηρεσιών'], ['who', 'Ποιος κάνει τι'], ['skips', 'Εξαιρέσεις']]],
  ['outs', 'Εξοδούχοι', false, []], ['records', 'Ιατρικά', false, []], ['strength', 'Δύναμη', false, []],
  ['hkai', 'ΗΚΑΙ', false, [['hkai', 'ΗΚΑΙ'], ['pun', 'Ποινές'], ['leave', 'Άδειες'], ['req', 'Αιτήσεις'], ['hd', 'Ημερήσια Διαταγή']]],
  ['weapons', 'Οπλισμός', false, [['weapons', 'Όπλα ανά άτομο'], ['moves', 'Κινήσεις'], ['mitroo', 'Μητρώο όπλων'], ['yliko', 'Υλικό']]],
  ['vehicles', 'Οχήματα', false, []], ['reports', 'Έντυπα', false, []], ['notes', 'Σημειώσεις', false, []],
  ['templates', 'Ρυθμίσεις', true, []], ['guide', 'Οδηγός', true, []], ['history', 'Ιστορικό', true, []], ['diag', 'Διάγνωση', true, []]
];
const SCREEN = new Map(SCREEN_TABLE.map(s => [s[0], s]));
const lockedTab = (view: string, tab: string) => !!SCREEN.get(view)?.[3].find(t => t[0] === tab)?.[2];
const hideSet = (st: Hide) => new Set(Array.isArray(st.hide) ? st.hide : []);

// η οθόνη (και, αν δοθεί, η καρτέλα της) φαίνεται; Άγνωστα id φαίνονται· οι πάντα ανοιχτές δεν κρύβονται ποτέ
export function isShown(st: Hide, view: string, tab?: string): boolean {
  const s = SCREEN.get(view); if (!s) return true;
  const h = hideSet(st);
  if (!s[2] && h.has(view)) return false;
  return tab === undefined || lockedTab(view, tab) || !h.has(view + '.' + tab);
}
// οι καρτέλες που μένουν (τιμές που δεν είναι στον πίνακα, π.χ. «Excel» στο κινητό, μένουν)
export function shownTabs<T extends { value: string }>(st: Hide, view: string, items: T[]): T[] {
  return items.filter(it => isShown(st, view, it.value));
}
// η καρτέλα που ανοίγει: η ζητούμενη αν φαίνεται, αλλιώς η πρώτη που φαίνεται
export function pickTab(st: Hide, view: string, tab: string): string {
  if (isShown(st, view, tab)) return tab;
  return SCREEN.get(view)?.[3].find(t => isShown(st, view, t[0]))?.[0] ?? tab;
}
// η πρώτη οθόνη που φαίνεται, με τη σειρά του μενού (αρχική οθόνη όταν το Σήμερα είναι κρυφό)
export const firstShown = (st: Hide, order: string[]): string => order.find(v => isShown(st, v)) || 'people';
// σε μία καρτέλα κανείς δεν κρύβει την τελευταία: το κουτί της μένει κλειστό για αλλαγή
export function lastTab(st: Hide, view: string, tab: string): boolean {
  const l = SCREEN.get(view)?.[3] || [];
  return isShown(st, view, tab) && l.filter(t => isShown(st, view, t[0])).length <= 1;
}
// νέα λίστα hide μετά από αλλαγή: μόνο γνωστά id που μπορούν να κρυφτούν, χωρίς διπλά
export function hideNext(st: Hide, id: string, hidden: boolean): string[] {
  const [v, t] = id.split('.'); const s = SCREEN.get(v);
  const ok = !!s && (t === undefined ? !s[2] : !!s[3].find(x => x[0] === t) && !lockedTab(v, t));
  const h = hideSet(st); if (ok) { if (hidden) h.add(id); else h.delete(id); }
  return [...h].filter(x => { const [a, b] = x.split('.'); const q = SCREEN.get(a); return !!q && (b === undefined ? !q[2] : !!q[3].find(y => y[0] === b) && !lockedTab(a, b)); });
}
// όσα είναι κρυφά τώρα, για τη γραμμή «Κρυφά τώρα» (οθόνη ολόκληρη, αλλιώς οι καρτέλες της μία μία)
export function hiddenNow(st: Hide, name: (v: string) => string = v => SCREEN.get(v)![1]): string[] {
  const out: string[] = [];
  for (const [v, , , tabs] of SCREEN_TABLE) {
    if (!isShown(st, v)) { out.push(name(v)); continue; }
    for (const [t, l] of tabs) if (!isShown(st, v, t)) out.push(name(v) + ' › ' + l);
  }
  return out;
}
// Ρυθμίσεις που εξυπηρετούν μόνο κρυφό κομμάτι (§3.9): κρύβονται μαζί του
export const settingShown = (st: Hide, key: string): boolean =>
  key === 'assets' ? isShown(st, 'weapons') && (isShown(st, 'weapons', 'mitroo') || isShown(st, 'weapons', 'yliko'))
    : key === 'cadreDuty' ? isShown(st, 'cadre', 'duty') : true;
