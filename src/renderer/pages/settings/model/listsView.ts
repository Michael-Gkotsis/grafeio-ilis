// Pure rules of the «Λίστες» card: the lists, their help texts, the choice each own item carries, who uses what.
// Purpose: `listsView` helpers for `useLists` and the rows; plus the texts and the per-list tables.
// Does NOT: render anything, touch React or call `run` (model/useLists.ts does). The changes a button makes are in
//   model/listsPlans.ts.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-lists-view.test.ts.
// @decision Michael 13/10: the basic items are hidden, never deleted; the own ones are deleted only if nobody has them.
import type { AppState, Person, TypeKey } from '../../../../shared/domain';
import { CADRE_ABS, TYPES } from '../../../../shared/domain';
import {
  LEAVE_COLS,
  LIST_BASE,
  MED_LIKE,
  guessHk,
  hkCadreRows,
  hkRowsOf,
  itemKey,
  leaveCol,
  leaveEffect,
  rankTxt,
  siUnarmed,
  weaponBack,
  type ListId,
  type ListItem,
  type ListRow,
  type UserLists,
} from '../../../../shared/ranks';
import { HK_A, HK_K, hkRankOf } from '../../../../shared/rules';
import { punAcc, punMax } from '../../../../shared/punish';
import { HK, hkRowLabel } from '../../../../shared/unit';

/** The lists of the drop-down, in this order (the old «Σ.Ι. άοπλων» only when it has entries). */
export const IDS: ListId[] = [
  'soldierRanks',
  'cadreRanks',
  'origins',
  'specs',
  'medKinds',
  'punKinds',
  'leaveKinds',
  'cadreAbs',
  'weaponTypes',
  'weaponOut',
  'siUnarmed',
];
/** Lists whose items are «declared» (statuses, leaves, absences, weapon moves) rather than just held. */
export const STAT_IDS: ListId[] = ['punKinds', 'leaveKinds', 'medKinds', 'weaponOut', 'cadreAbs'];
/** Placeholder of the «Νέο» box per list. */
export const PH: Record<ListId, string> = {
  soldierRanks: 'π.χ. ΚΛΗΡ',
  cadreRanks: 'π.χ. ΣΜΧΟΣ',
  origins: 'π.χ. ΣΣΑΣ',
  specs: 'π.χ. ΠΝ',
  punKinds: 'π.χ. Επίπληξη',
  leaveKinds: 'π.χ. Γονική',
  cadreAbs: 'π.χ. Σχολείο',
  medKinds: 'π.χ. ΕΛ ΓΥΜΝ',
  siUnarmed: 'π.χ. Ι5',
  weaponTypes: 'π.χ. M1911',
  weaponOut: 'π.χ. ΦΡΟΥΡΑ',
};

/** Help text under the title of each list (a function: the ΗΚΑΙ name depends on the unit kind). */
export const listHelp = (): Record<ListId, string> => ({
  soldierRanks:
    'Στη φόρμα στρατιώτη και στο dropdown «Βαθμός» του Δυναμολογίου. Κάθε δικός σου βαθμός ' +
    'λέει σε ποια γραμμή της ' +
    HK() +
    ' μετρά.',
  cadreRanks:
    'Στη φόρμα «Νέο στέλεχος». Ο βαθμός διαλέγει μόνος του τη γραμμή της ' + HK() + ' (αλλάζει και στη φόρμα).',
  origins:
    'Στο πεδίο «Προέλευση» του στρατιώτη και του στελέχους, και στο dropdown «Προέλευση» του ' +
    'Δυναμολογίου όταν έχει τέτοια στήλη. Στα έντυπα γράφεται μπροστά από τον βαθμό (π.χ. ' +
    'ΕΠΟΠ ΛΧΙΑΣ). ΕΠΟΠ και ΟΒΑ κάνουν υπηρεσίες μόνο με το χέρι, ως το όριο του μήνα, και ως ' +
    'στρατιώτες μετρούν στη δική τους γραμμή της ' +
    HK() +
    '.',
  specs: 'Στη φόρμα στρατιώτη και στο dropdown «Ο/Σ» του Δυναμολογίου.',
  weaponTypes: 'Στη στήλη «Τύπος» της καρτέλας Οπλισμός και στο Excel «Οπλισμός».',
  weaponOut:
    'Στην «Έξοδο όπλων» της καρτέλας Οπλισμός. Κάθε λόγος εξόδου έχει τον λόγο εισαγωγής του ' +
    '(π.χ. ΕΚΠ → ΛΗΞ ΕΚΠ), που μπαίνει μόνος του όταν επιστρέφει το όπλο.',
  punKinds:
    'Στη δήλωση ποινής. Κάθε ποινή κόβει την έξοδο, μετρά στη στήλη «Τιμ.» και γράφεται στην ' +
    HK() +
    ' (4. Ποινές). Το «κείμενο» μπαίνει στην πρόταση «με δύο (02) ημέρες …». Σε ποιες ' +
    'υπηρεσίες μπαίνει κάθε είδος ορίζεις στις Υπηρεσίες και αργίες.',
  leaveKinds:
    'Στη δήλωση άδειας. Τα βασικά είδη είναι απόντες, χωρίς υπηρεσίες. Για κάθε δικό σου ' +
    'είδος διαλέγεις τη στήλη της ' +
    HK() +
    ' και από αυτήν βγαίνει πώς μετρά παντού (Σήμερα, Δύναμη, ' +
    HK() +
    ', ΔΥΝΑΜΗ, Εξοδούχοι, υπηρεσίες): «Απ.:» απών, «Κωλ.:» κωλυόμενος (αφαιρείται από τους ' +
    'παρόντες, χωρίς υπηρεσία και έξοδο), «Πουθενά» παρών, με δικά σου τικ για υπηρεσίες και ' +
    'έξοδο. Ο «Κωδικός» γράφεται στον Έλεγχο υπηρεσιών (κενό = το όνομα). Το «Κείμενο στην ' +
    HK() +
    '» (κενό = αυτόματο) είναι πώς γράφεται το είδος στο 3. Άδειες και στο 5. Αιτήσεις (π.χ. ' +
    'Τιμητική → ΑΔΕΙΑ)· το Excel «Άδειες», οι Εξοδούχοι και τα Έντυπα λένε πάντα το είδος. Με ' +
    '«Κατεύθυνση στο κείμενο», η κατεύθυνση της άδειας γράφεται κι αυτή (… ΜΕ ΚΑΤΕΥΘΥΝΣΗ ' +
    'ΚΟΡΙΝΘΟ).',
  cadreAbs:
    'Στην «Κατάσταση» στελέχους (καρτέλα Στελέχη). Η στήλη λέει πού μετρά στην ' +
    HK() +
    ', στους κωλυόμενους ή στους απόντες· «μόνο στη λίστα» δεν μετρά. Οι άδειες (Κ.Άδ., Ειδ., ' +
    'Αναρρ.) έχουν και «Κείμενο στην ' +
    HK() +
    '» για το 3. Άδειες.',
  siUnarmed:
    'Όποιος έχει τέτοιο Σ.Ι. είναι άοπλος: δεν μπαίνει οπλοφύλακας ούτε σκοπός, και μετρά ως ' +
    'άοπλος στα «Αυστηρά Άοπλοι». Ένα δικό σου ισχύει για κάθε Σ.Ι. που αρχίζει από αυτό ' +
    '(χωρίς κενά και τελείες). Η «Δυνατότητα υπηρεσιών» κάθε ατόμου ισχύει όπως πριν.',
  medKinds:
    'Στη δήλωση ιατρικού και στη στήλη «είδος» του Excel ΕΑ-ΕΥ. Τι κάνει κάθε ιατρικό (σε ' +
    'ποιες υπηρεσίες μπαίνει, αν βγαίνει έξοδο, πού μετρά στην ' +
    HK() +
    ') το ορίζεις στις Υπηρεσίες και αργίες, όπου εμφανίζεται μόλις το προσθέσεις, αρχικά ' +
    'χωρίς περιορισμούς. «Μόνο προειδοποίηση» (π.χ. ΠΑΡΑΠΕΜΠΤΙΚΟ 401): όταν μπαίνει σε ' +
    'υπηρεσία βγαίνει προειδοποίηση και η αυτόματη συμπλήρωση τον βάζει μόνο αν δεν υπάρχει ' +
    'άλλος. «Μόνο σημείωση» (π.χ. ΕΛ. ΞΥΡΙΣΜΑΤΟΣ): υπάρχει μόνο σαν σημείωση πάνω στον ' +
    'στρατιώτη, δεν αλλάζει υπηρεσίες, έξοδο, ΗΚΑΙ και Δύναμη και δεν γράφεται στο Excel. ' +
    'Φαίνεται στην καρτέλα του και στα Ιατρικά › Σημειώσεις· προαιρετικά και σαν σήμα στις ' +
    'οθόνες ή στο Excel ΕΑ-ΕΥ. Όταν το τσεκάρεις, το «μόνο προειδοποίηση» σβήνει και το ' +
    'ιατρικό φεύγει από τον πίνακα Καταστάσεις στις Υπηρεσίες. Ο κωδικός μπαίνει στις μέρες ' +
    'απουσίας του Excel «Έλεγχος υπηρεσιών» (κενό = του βασικού). Αν κάποιο φύλλο του Excel ' +
    'σου μετράει με τύπο, π.χ. COUNTIF(…;"ΕΑ"), το νέο όνομα δεν μετριέται εκεί.',
});

/** The choice each own item carries: [field, title, options [value, name]]. */
export type Pick = { f: 'hk' | 'col'; label: string; opts: [string, string][] };
const rowsOf = (l: string[]): [string, string][] => l.map((x) => [x, hkRowLabel(x)]);
// Cadre states: every ΗΚΑΙ column, as detained («Κωλ.») and as absent («Απ.»).
const hkCols = (): [string, string][] => [
  ...HK_K.filter(([k]) => k !== 'bl').map(([k, , full]) => [k, 'Κωλ.: ' + full] as [string, string]),
  ...HK_A.map(([k, , full]) => [k, 'Απ.: ' + full] as [string, string]),
];
const PICK = (): Partial<Record<ListId, Pick>> => ({
  leaveKinds: { f: 'col', label: 'Στήλη στην ' + HK(), opts: LEAVE_COLS },
  cadreAbs: { f: 'col', label: 'Στήλη στην ' + HK(), opts: [['', 'Μόνο στη λίστα (δεν μετρά)'], ...hkCols()] },
});
/**
 * The choice of a list: the ΗΚΑΙ rows (with the ones added in «Μονάδα και έντυπα», named as in the ΗΚΑΛ of a λόχος) for
 * the ranks, the ΗΚΑΙ column for leaves and cadre absences, none for the others.
 */
export const pickOf = (id: ListId, lists?: UserLists): Pick | undefined =>
  id === 'soldierRanks'
    ? { f: 'hk', label: 'Γραμμή στην ' + HK(), opts: rowsOf(hkRowsOf(lists).nco) }
    : id === 'cadreRanks'
      ? { f: 'hk', label: 'Γραμμή στην ' + HK(), opts: rowsOf(hkCadreRows(lists)) }
      : PICK()[id];
/** Medicals: «ΕΛ.ΓΥΜΝ» and «ΕΛ ΓΥΜΝ» are the same, as in the Excel. */
export const keyOf = (id: ListId) =>
  id === 'medKinds' ? (v: string) => itemKey(v).replace(/[^Α-ΩA-Z0-9]/g, '') : itemKey;
// A calendar code has a dot or a slash (Κ.Α, Ε.Υ), so it does not look like a duty code.
/** The code is empty or valid: a dot or slash, up to 8 characters, no comma or quote. */
export const codeOk = (c: string) => !c || (/[./]/.test(c) && c.length <= 8 && !/[,"]/.test(c));
/** What applies now to an item (basic or own), as the app sees it. */
export function current(id: ListId, r: ListItem, lists: UserLists): string {
  switch (id) {
    case 'soldierRanks':
      return hkRankOf(r.name, lists);
    case 'cadreRanks':
      return guessHk(r.name, lists);
    case 'leaveKinds':
      return leaveCol(r.name, lists);
    case 'cadreAbs':
      return CADRE_ABS.find((x) => x[1] === r.name)?.[2] ?? (r.col || '');
    default:
      return '';
  }
}
/** Name of the option with value `v`, or `v` itself. */
export const optLbl = (p: Pick, v: string) => p.opts.find((o) => o[0] === v)?.[1] || v;

/** Who has an item: soldiers by id, cadre members by name. */
export interface Holders {
  pids: Set<number>;
  names: Set<string>;
}
type CadreName = { rank: string; origin?: string; last: string; first: string };
const cadreName = (c?: CadreName) => (c ? rankTxt(c) + ' ' + c.last + ' ' + c.first : '');
const statusIs = (id: ListId, t: TypeKey) =>
  id === 'punKinds' ? t === 'PUN' : id === 'leaveKinds' ? t === 'LEAVE' : MED_LIKE.includes(t);

/** One holder: the value, and the soldier id or the cadre member's name that has it. */
type Holding = [value: string | undefined, pid?: number, name?: string];

/** Every (value, holder) pair of the list in the app state. */
function holdings(id: ListId, state: AppState): Holding[] {
  const cm = new Map(state.cadreList.map((c) => [c.id, c]));
  const people = (pick: (p: Person) => string | undefined): Holding[] =>
    state.people.map((p) => [pick(p), p.id] as Holding);
  const cadre = (pick: (c: AppState['cadreList'][number]) => string | undefined): Holding[] =>
    state.cadreList.map((c) => [pick(c), undefined, cadreName(c)] as Holding);
  if (id === 'cadreRanks') return cadre((c) => c.rank);
  if (id === 'origins') return [...people((p) => p.origin), ...cadre((c) => c.origin)];
  if (id === 'cadreAbs') return state.cadreAbs.map((a) => [a.kind, undefined, cadreName(cm.get(a.cid))] as Holding);
  if (id === 'punKinds' || id === 'leaveKinds' || id === 'medKinds')
    return state.statuses.filter((x) => statusIs(id, x.type)).map((x) => [x.kind || '', x.pid] as Holding);
  if (id === 'weaponTypes') return people((p) => p.wtype);
  if (id === 'weaponOut') return (state.weaponLog || []).map((w) => [w.reason, w.pid] as Holding);
  if (id === 'siUnarmed') return [];
  return people((p) => (id === 'specs' ? p.spec : p.rank));
}

/**
 * Who already has each value of the list (those are only hidden, never deleted). Keyed by `keyOf(id)` of the value.
 * @param state - the app state
 */
export function usedBy(id: ListId, state: AppState): Map<string, Holders> {
  const k = keyOf(id);
  return holdings(id, state).reduce((m, [v, pid, name]) => {
    if (!v) return m;
    const kk = k(v);
    const e = m.get(kk) ?? { pids: new Set<number>(), names: new Set<string>() };
    m.set(kk, e);
    if (pid != null) e.pids.add(pid);
    if (name) e.names.add(name);
    return m;
  }, new Map<string, Holders>());
}

/** The grey line of a row that has no editor: what the item does. */
export function rowInfo(id: ListId, r: ListRow, lists: UserLists, people: Person[], pick?: Pick): string {
  if (id === 'weaponOut') return 'εισαγωγή: ' + weaponBack(r.name, lists);
  if (id === 'punKinds') {
    const mx = punMax(r.name, lists);
    return 'κείμενο: «' + punAcc(r.name, lists) + '»' + (mx ? ' · ως ' + mx + ' ημ.' : '');
  }
  if (id === 'siUnarmed') {
    // Only this rule: the others are hidden, so the people it catches are counted.
    const only: UserLists = {
      siUnarmed: r.builtin
        ? { hide: LIST_BASE.siUnarmed.filter((x) => x !== r.name) }
        : { add: [r], hide: [...LIST_BASE.siUnarmed] },
    };
    const n = people.filter((p) => p.active && siUnarmed(p.si, only)).length;
    return (
      (r.name === 'ΑΟΠΛ' && r.builtin ? 'περιέχει «ΑΟΠΛ» ή «ΧΩΡΙΣ ΟΠΛΟ»' : 'αρχίζει από «' + r.name + '»') +
      ' · ' +
      (n === 1 ? '1 άτομο' : n + ' άτομα') +
      (r.hidden ? ' (δεν ισχύει)' : '')
    );
  }
  if (id === 'medKinds') {
    const t = TYPES[MED_LIKE.find((k) => TYPES[k].label === r.name) || 'EA'];
    return t.long + (t.code ? ' · κωδικός ' + t.code : '');
  }
  if (id === 'leaveKinds') return leaveEffect(r.name, lists, HK());
  return pick ? HK() + ': ' + optLbl(pick, current(id, r, lists)) : '';
}

/** Is `k` a value somebody has (so «Σβήσε» is not offered)? */
export const isUsed = (used: Map<string, Holders>, id: ListId, r: ListRow) => used.has(keyOf(id)(r.name));
/** How many people (soldiers and cadre members) have the row. */
export const usedCount = (used: Map<string, Holders>, id: ListId, r: ListRow) => {
  const e = used.get(keyOf(id)(r.name));
  return e ? e.pids.size + e.names.size : 0;
};
