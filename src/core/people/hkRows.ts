// The ΗΚΑΙ rows and columns: the form's base rows, the user's own rows, the prevented / absent columns, and the guess
// of the row of a rank.
//
// Purpose: `hkRowsOf` / `hkRowList` / `hkCadreRows` (rows in form order), `hkRowClaim` / `hkOfRank` / `hkClaimOf`
//   (which own row collects a rank), `HK_K` / `HK_A` (the columns), `userItem` and `guessHk` (category from a rank).
// Does NOT: count anybody on the form (core/hkai and exports.ts do), or decide how a leave counts (kinds.ts).
// Owner layer: core/people (no fs, no Electron, no React); imports ranks.ts only.
// Why: the columns are here and not in rules.ts so that leaves can see them too (it would be a circular dependency).
// @decision Michael 18/10: the user can add ΗΚΑΙ rows («Ίλαρχος, Λοχαγός, Ταγματάρχης…»).
// Covering tests: test/lists.test.ts, test/origin.test.ts, test/cadre-tab.test.ts.
import { itemKey, originRow, rankTxt } from './ranks';
import type { UserLists, ListId, ListItem } from '../model/lists';

/**
 * ΗΚΑΙ rows (ranks): the form's base rows and the ones the user added. Each own row goes under another row, among the
 * officers (ΑΞΚΩΝ) or the other ranks (ΟΠΛΙΤΩΝ), and collects the ranks chosen for it. On the form it becomes a new
 * row with its formulas and counts in the totals (exports.ts).
 * @decision Michael 18/10: «Ίλαρχος, Λοχαγός, Ταγματάρχης…»
 */
export const HK_OFFICERS = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ'];
/** Base ΗΚΑΙ rows of the other ranks (ΟΠΛΙΤΩΝ), in form order. */
export const HK_NCO = [
  'Αρχιλοχίες',
  'Επιλοχίες',
  'Λοχίες',
  'Δεκανείς',
  'ΕΠΟΠ Στρατιώτης',
  'ΟΒΑ Στρατιώτης',
  'Στρατιώτες',
];
/** The ΗΚΑΙ rows: officers, other ranks, and the names of the user's own rows. */
export interface HkRows {
  off: string[];
  nco: string[];
  own: Set<string>;
}
const rowsIdx = new WeakMap<object, HkRows>();
/**
 * Resolves the ΗΚΑΙ rows for the user's Λίστες; cached per `hkRows` array. Without own rows it returns the base rows.
 */
export function hkRowsOf(lists?: UserLists): HkRows {
  const key = lists?.hkRows;
  if (!key?.length) return { off: HK_OFFICERS, nco: HK_NCO, own: new Set() };
  let r = rowsIdx.get(key);
  if (r) return r;
  const off = [...HK_OFFICERS],
    nco = [...HK_NCO];
  const own = new Set<string>();
  const taken = new Set([...off, ...nco, 'ΣΥΝΟΛΟ ΑΞΚΩΝ', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ'].map(itemKey));
  for (const x of key) {
    const k = itemKey(x.name || '');
    if (!k || taken.has(k)) continue;
    taken.add(k);
    own.add(x.name);
    const list = x.grp === 'off' ? off : nco;
    const i = x.after ? list.indexOf(x.after) : -1;
    list.splice(i >= 0 ? i + 1 : list.length, 0, x.name);
  }
  r = { off, nco, own };
  rowsIdx.set(key, r);
  return r;
}
/** All rows in form order. */
export const hkRowList = (lists?: UserLists) => {
  const r = hkRowsOf(lists);
  return [...r.off, ...r.nco];
};
/**
 * Rows a cadre member can go into: all except «Στρατιώτες», plus the user's own. Below ΣΥΝΟΛΟ ΑΞΚΩΝ everybody is
 * cadre (NCOs who count in ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ); only the Στρατιώτες are not.
 * @decision Michael 21/10
 */
export const HK_SOLDIERS_ROW = 'Στρατιώτες';
/** ΗΚΑΙ rows a cadre member can be counted in (all but «Στρατιώτες»). */
export const hkCadreRows = (lists?: UserLists) => hkRowList(lists).filter((x) => x !== HK_SOLDIERS_ROW);
/** Rows where the user types how many cadre there are, when they are not entered by name. */
export const cadreCountRows = (lists?: UserLists) => hkCadreRows(lists);
/** The user's own row that collects a rank (grp: only from that group). */
export function hkRowClaim(lists: UserLists | undefined, rank: string, grp?: 'off' | 'nco'): string | undefined {
  const k = itemKey(rank || '');
  if (!k || !lists?.hkRows?.length) return undefined;
  const own = hkRowsOf(lists).own;
  return lists.hkRows.find(
    (x) => own.has(x.name) && (!grp || x.grp === grp) && (x.ranks || []).some((r) => itemKey(r) === k),
  )?.name;
}

/** The ΗΚΑΙ row set for a user-defined rank (else undefined: the app derives it from the name). */
export function hkOfRank(
  lists: UserLists | undefined,
  id: 'soldierRanks' | 'cadreRanks',
  rank: string,
): string | undefined {
  const k = itemKey(rank);
  if (!k) return undefined;
  return (lists?.[id]?.add || []).find((x) => x.hk && itemKey(x.name) === k)?.hk;
}

/** A user's own list item by name (ignoring accents and dots), or undefined. */
export const userItem = (lists: UserLists | undefined, id: ListId, name: string | undefined): ListItem | undefined => {
  const k = itemKey(name || '');
  return k ? (lists?.[id]?.add || []).find((x) => itemKey(x.name) === k) : undefined;
};
/**
 * ΗΚΑΙ columns: prevented (HK_K) and absent (HK_A), as [key, short label, full label]. They are here and not in
 * rules.ts so that leaves can see them too (circular dependency).
 */
export const HK_K: [string, string, string][] = [
  ['yp', 'Υπηρ.', 'Υπηρεσία εντός στρατοπέδου'],
  ['ey', 'ΕΥ', 'Ελεύθεροι υπηρεσίας'],
  ['tim', 'Τιμ.', 'Τιμωρημένοι'],
  ['bl', '', '(κενή στήλη του εντύπου)'],
  ['os', 'Ο/Σ', 'Ο/Σ'],
  ['mag', 'Μαγ.', 'Μαγειρεία'],
  ['sid', 'Σιδ.', 'Σιδηρουργείο'],
  ['kin', 'Κίν.', 'Σε κίνηση'],
];
/** ΗΚΑΙ absent columns as [key, short label, full label]; see HK_K. */
export const HK_A: [string, string, string][] = [
  ['ka', 'Κ.Άδ.', 'Κανονικές άδειες / ΑΜΔ / ΥΕΘΑ'],
  ['an', 'Αναρ.', 'Αναρρωτικές άδειες'],
  ['eid', 'Ειδ.', 'Ειδικές άδειες'],
  ['nos', 'Νοσ.', 'Νοσοκομείο / 401 ΓΣΝΑ'],
  ['prat', 'Πρατ.', 'Πρατήριο'],
  ['adik', 'Αδικ.', 'Αγνοούμενοι / Αδικαιολογήτως'],
  ['fp', 'Φ.Πορ.', 'Φύλλα πορείας - μεταβάσεως'],
  ['fyl', 'Φυλ.', 'Φυλάκια'],
  ['apal', 'Απαλ.', 'Απαλλαγή'],
  ['ekp', 'Εκπ.', 'Αποσπασμένοι σε εκπαίδευση'],
  ['allh', 'Άλλη Μ.', 'Αποσπασμένοι σε άλλη μονάδα'],
];
/**
 * The user's own row that collects someone: by rank and origin together («ΕΠΟΠ ΛΧΙΑΣ»), by rank only or by origin
 * only.
 */
export const hkClaimOf = (lists: UserLists | undefined, rank: string, origin?: string, grp?: 'off' | 'nco') =>
  (origin ? hkRowClaim(lists, rankTxt({ rank, origin }), grp) : undefined) ||
  hkRowClaim(lists, rank, grp) ||
  (origin ? hkRowClaim(lists, origin, grp) : undefined);
/**
 * Guesses the ΗΚΑΙ category from the rank (and origin) the user typed; what was set in Λίστες comes first. ΕΠΟΠ/ΟΒΑ
 * count on their own row only as soldiers: an ΕΠΟΠ ΛΧΙΑΣ is among the Λοχίες.
 */
export function guessHk(rank: string, lists?: UserLists, origin?: string): string {
  const claim = hkClaimOf(lists, rank, origin);
  if (claim) return claim;
  const own = hkOfRank(lists, 'cadreRanks', rank);
  if (own && hkCadreRows(lists).includes(own)) return own;
  const r = rank.toUpperCase().replace(/[.\s]/g, '');
  if (/ΕΠΧ|ΕΠΙΛΑΡΧ|ΕΠΛΧΟ|ΤΧΗΣ/.test(r)) return 'Επίλαρχοι';
  if (/ΑΝΘΥΠΑΣ|ΑΝΘΣΤ/.test(r)) return 'Ανθυπασπιστές';
  if (/ΑΝΘΛΧ|ΑΝΘΥΠΙΛ|ΑΝΘΛΓ|ΥΠΛΓ|ΥΠΛΧ/.test(r)) return 'Ανθυπίλαρχοι-Ανθλγοι';
  if (/ΙΛΧ|ΙΛΑΡΧ|ΛΓΟΣ/.test(r)) return 'Ίλαρχοι';
  if (/ΔΕΑ/.test(r)) return 'ΔΕΑ';
  if (/ΑΡΧΙΛ|ΑΛΧΙ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛ|ΕΠΛΧΙ/.test(r)) return 'Επιλοχίες';
  if (/ΛΧΙΑΣ|ΛΟΧΙΑΣ/.test(r)) return 'Λοχίες';
  if (/ΔΝΕΑΣ|ΔΕΚΑΝ/.test(r)) return 'Δεκανείς';
  if (/ΕΠΟΠ/.test(r)) return 'ΕΠΟΠ Στρατιώτης';
  if (/ΟΒΑ/.test(r)) return 'ΟΒΑ Στρατιώτης';
  // soldier on the cadre list: ΕΠΟΠ or ΟΒΑ (the origin says which)
  if (/^ΣΤΡ$|^ΣΤΡΑΤΙΩΤ/.test(r)) return originRow(origin) || 'ΕΠΟΠ Στρατιώτης';
  return originRow(origin) || 'Λοχίες';
}
