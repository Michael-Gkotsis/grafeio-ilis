// Λίστες επιλογής για βαθμό και Ο/Σ (όπλο/σώμα): στις φόρμες της εφαρμογής και ως dropdown στα Excel.
// Πάντα επιτρέπεται και άλλη τιμή γραμμένη με το χέρι· η λίστα συμπληρώνεται με όσες υπάρχουν ήδη στα δεδομένα.
import { collator, normGreek } from './text';

// Βαθμοί στρατιωτών (Δυναμολόγιο)
export const SOLDIER_RANKS = ['ΣΤΡ', 'ΥΔΝΕΑΣ', 'ΔΝΕΑΣ', 'ΛΧΙΑΣ', 'ΕΠΟΠ ΣΤΡ', 'ΕΠΟΠ ΔΝΕΑΣ', 'ΕΠΟΠ ΛΧΙΑΣ', 'ΔΕΑ'];
// Βαθμοί στελεχών (από τον μικρότερο στον μεγαλύτερο)
export const CADRE_RANKS = ['ΛΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΑΛΧΙΑΣ', 'ΑΝΘΣΤΗΣ', 'ΑΝΘΛΧΟΣ', 'ΥΠΛΧΟΣ', 'ΙΛΧΟΣ', 'ΑΝΘΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΛΓΟΣ', 'ΕΠΛΧΟΣ', 'ΤΧΗΣ', 'ΔΕΑ'];
// Όπλα και σώματα (στήλη «Ο/Σ»)
export const SPECS = ['ΠΖ', 'ΤΘ', 'ΠΒ', 'ΜΧ', 'ΔΒ', 'ΔΒ-ΗΠ', 'ΑΣ', 'ΤΧ', 'ΕΜ', 'ΥΓ', 'ΥΠ', 'ΓΕ'];

// Η βασική λίστα και από κάτω (αλφαβητικά) όσες άλλες τιμές υπάρχουν ήδη, χωρίς διπλές και κενά
export function optionsOf(base: readonly string[], seen: Iterable<string | null | undefined>): string[] {
  const key = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  const have = new Set(base.map(key)); const extra: string[] = [];
  for (const v of seen) {
    if (!v || !v.trim()) continue;
    const k = key(v); if (have.has(k)) continue;
    have.add(k); extra.push(v.trim().replace(/\s+/g, ' '));
  }
  return [...base, ...extra.sort(collator.compare)];
}

// ---------------------------------------------------------------------------
// Λίστες που συμπληρώνει ο χρήστης (Ρυθμίσεις › Λίστες, Michael 13/10). Στις ρυθμίσεις μένουν μόνο οι προσθήκες
// και όσα βασικά έκρυψε: οι βασικές λίστες είναι εδώ, οπότε χωρίς προσθήκες όλα μένουν όπως πριν.
// ---------------------------------------------------------------------------
export type ListId = 'soldierRanks' | 'cadreRanks' | 'specs';
export interface ListItem { name: string; hk?: string }   // hk: γραμμή της ΗΚΑΙ όπου μετρά ο βαθμός
export interface UserList { add?: ListItem[]; hide?: string[] }
export type UserLists = Partial<Record<ListId, UserList>>;
export const LIST_BASE: Record<ListId, readonly string[]> = { soldierRanks: SOLDIER_RANKS, cadreRanks: CADRE_RANKS, specs: SPECS };
export const LIST_NAME: Record<ListId, string> = { soldierRanks: 'Βαθμοί στρατιωτών', cadreRanks: 'Βαθμοί στελεχών', specs: 'Ο/Σ (όπλα και σώματα)' };
// ίδιο κλειδί για «Ε.Π.Ο.Π στρ» και «ΕΠΟΠ ΣΤΡ»: χωρίς τόνους, τελείες και διπλά κενά, λατινικά που μοιάζουν → ελληνικά
export const itemKey = (v: string) => normGreek(v).replace(/\./g, '').replace(/\s+/g, ' ').trim();
export const itemName = (v: string) => v.trim().replace(/\s+/g, ' ').toUpperCase();
export interface ListRow { name: string; hk?: string; builtin: boolean; hidden: boolean }
// Όλες οι γραμμές μιας λίστας για την κάρτα: πρώτα οι βασικές, μετά οι δικές σου με τη σειρά που μπήκαν
export function listRows(lists: UserLists | undefined, id: ListId): ListRow[] {
  const u = lists?.[id] || {}; const hide = new Set((u.hide || []).map(itemKey));
  const base = LIST_BASE[id].map(name => ({ name, builtin: true, hidden: hide.has(itemKey(name)) }));
  const have = new Set(LIST_BASE[id].map(itemKey)); const add: ListRow[] = [];
  for (const x of u.add || []) {
    const k = itemKey(x.name || ''); if (!k || have.has(k)) continue;
    have.add(k); add.push({ name: x.name, ...(x.hk ? { hk: x.hk } : {}), builtin: false, hidden: hide.has(k) });
  }
  return [...base, ...add];
}
// Ό,τι προτείνεται στις φόρμες και στα dropdown του Excel: οι βασικές που δεν έκρυψες και οι δικές σου
export const listOf = (lists: UserLists | undefined, id: ListId): string[] => (lists?.[id] ? listRows(lists, id).filter(x => !x.hidden).map(x => x.name) : [...LIST_BASE[id]]);
// Η γραμμή της ΗΚΑΙ που όρισες για έναν δικό σου βαθμό (αλλιώς undefined: τη βρίσκει η εφαρμογή από το όνομα)
export function hkOfRank(lists: UserLists | undefined, id: 'soldierRanks' | 'cadreRanks', rank: string): string | undefined {
  const k = itemKey(rank); if (!k) return undefined;
  return (lists?.[id]?.add || []).find(x => x.hk && itemKey(x.name) === k)?.hk;
}

// Μαντεύει την κατηγορία της ΗΚΑΙ από τον βαθμό που γράφει ο χρήστης· πρώτα ό,τι όρισες στις Λίστες
export function guessHk(rank: string, lists?: UserLists): string {
  const own = hkOfRank(lists, 'cadreRanks', rank); if (own) return own;
  const r = rank.toUpperCase().replace(/[.\s]/g, '');
  if (/ΕΠΧ|ΕΠΙΛΑΡΧ|ΕΠΛΧΟ|ΤΧΗΣ/.test(r)) return 'Επίλαρχοι';
  if (/ΑΝΘΥΠΑΣ|ΑΝΘΣΤ/.test(r)) return 'Ανθυπασπιστές';
  if (/ΑΝΘΛΧ|ΑΝΘΥΠΙΛ|ΑΝΘΛΓ|ΥΠΛΓ|ΥΠΛΧ/.test(r)) return 'Ανθυπίλαρχοι-Ανθλγοι';
  if (/ΙΛΧ|ΙΛΑΡΧ|ΛΓΟΣ/.test(r)) return 'Ίλαρχοι';
  if (/ΔΕΑ/.test(r)) return 'ΔΕΑ';
  if (/ΑΡΧΙΛ|ΑΛΧΙ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛ|ΕΠΛΧΙ/.test(r)) return 'Επιλοχίες';
  return 'Λοχίες';
}
