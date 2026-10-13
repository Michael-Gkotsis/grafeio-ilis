// Λίστες επιλογής για βαθμό και Ο/Σ (όπλο/σώμα): στις φόρμες της εφαρμογής και ως dropdown στα Excel.
// Πάντα επιτρέπεται και άλλη τιμή γραμμένη με το χέρι· η λίστα συμπληρώνεται με όσες υπάρχουν ήδη στα δεδομένα.
import { collator, normGreek } from './text';
import { CADRE_ABS, LEAVE_KINDS, PUN_KINDS } from './domain';

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
export type ListId = 'soldierRanks' | 'cadreRanks' | 'specs' | 'punKinds' | 'leaveKinds' | 'cadreAbs';
// hk: γραμμή της ΗΚΑΙ όπου μετρά ο βαθμός · col: στήλη της ΗΚΑΙ (άδεια, απουσία στελέχους· κενό = μόνο στη λίστα)
// acc: πώς γράφεται η ποινή στο κείμενο («με δύο (02) ημέρες …») · max: ανώτατες ημέρες (προειδοποίηση)
export interface ListItem { name: string; hk?: string; col?: string; acc?: string; max?: number }
export interface UserList { add?: ListItem[]; hide?: string[] }
export type UserLists = Partial<Record<ListId, UserList>>;
export const LIST_BASE: Record<ListId, readonly string[]> = {
  soldierRanks: SOLDIER_RANKS, cadreRanks: CADRE_RANKS, specs: SPECS, punKinds: PUN_KINDS, leaveKinds: LEAVE_KINDS,
  cadreAbs: CADRE_ABS.map(x => x[1])   // στις απουσίες στελεχών οι βασικές έχουν κωδικό (ka, an…)· οι δικές σου το όνομά τους
};
export const LIST_NAME: Record<ListId, string> = { soldierRanks: 'Βαθμοί στρατιωτών', cadreRanks: 'Βαθμοί στελεχών', specs: 'Ο/Σ (όπλα και σώματα)', punKinds: 'Είδη ποινής', leaveKinds: 'Είδη άδειας', cadreAbs: 'Απουσίες στελεχών' };
// ίδιο κλειδί για «Ε.Π.Ο.Π στρ» και «ΕΠΟΠ ΣΤΡ»: χωρίς τόνους, τελείες και διπλά κενά, λατινικά που μοιάζουν → ελληνικά
export const itemKey = (v: string) => normGreek(v).replace(/\./g, '').replace(/\s+/g, ' ').trim();
// βαθμοί και Ο/Σ με κεφαλαία, όπως στο Δυναμολόγιο· είδη ποινής, άδειας, απουσίας όπως γράφτηκαν
const UPPER: ListId[] = ['soldierRanks', 'cadreRanks', 'specs'];
export const itemName = (v: string, id: ListId = 'specs') => { const t = v.trim().replace(/\s+/g, ' '); return UPPER.includes(id) ? t.toUpperCase() : t; };
export interface ListRow extends ListItem { builtin: boolean; hidden: boolean }
// Όλες οι γραμμές μιας λίστας για την κάρτα: πρώτα οι βασικές, μετά οι δικές σου με τη σειρά που μπήκαν
export function listRows(lists: UserLists | undefined, id: ListId): ListRow[] {
  const u = lists?.[id] || {}; const hide = new Set((u.hide || []).map(itemKey));
  const base = LIST_BASE[id].map(name => ({ name, builtin: true, hidden: hide.has(itemKey(name)) }));
  const have = new Set(LIST_BASE[id].map(itemKey)); const add: ListRow[] = [];
  for (const x of u.add || []) {
    const k = itemKey(x.name || ''); if (!k || have.has(k)) continue;
    have.add(k); add.push({ ...x, builtin: false, hidden: hide.has(k) });
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

// Ένα δικό σου στοιχείο λίστας με το όνομά του (χωρίς τόνους/τελείες), ή undefined
export const userItem = (lists: UserLists | undefined, id: ListId, name: string | undefined): ListItem | undefined => {
  const k = itemKey(name || ''); return k ? (lists?.[id]?.add || []).find(x => itemKey(x.name) === k) : undefined;
};
// Άδεια → στήλη της ΗΚΑΙ: η «Ειδική» στις Ειδικές (Michael, 13/10), οι άλλες βασικές στις Κανονικές· οι δικές σου όπου όρισες
export const LEAVE_COLS: [string, string][] = [['ka', 'Κ.Άδ. (κανονικές)'], ['eid', 'Ειδ. (ειδικές)']];
export function leaveCol(kind: string | undefined, lists?: UserLists): string {
  const k = itemKey(kind || '');
  if (k === itemKey('Ειδική') || k === itemKey('Ειδική άδεια')) return 'eid';
  const own = userItem(lists, 'leaveKinds', kind)?.col;
  return own && LEAVE_COLS.some(c => c[0] === own) ? own : 'ka';
}
// Απουσίες στελεχών: [κωδικός, όνομα, στήλη ΗΚΑΙ]. Οι βασικές με τον κωδικό τους, οι δικές σου με το όνομα ως κωδικό.
// all: και όσες έκρυψες (για εγγραφές που υπάρχουν ήδη)
export function cadreAbsKinds(lists?: UserLists, all = false): [string, string, string][] {
  const rows = listRows(lists, 'cadreAbs').filter(r => all || !r.hidden);
  return rows.map(r => (r.builtin ? CADRE_ABS.find(x => x[1] === r.name)! : [r.name, r.name, r.col || ''] as [string, string, string]));
}
export const cadreAbsOf = (kind: string, lists?: UserLists) => cadreAbsKinds(lists, true).find(x => x[0] === kind);

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
