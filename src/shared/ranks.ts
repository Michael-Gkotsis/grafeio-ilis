// Λίστες επιλογής για βαθμό και Ο/Σ (όπλο/σώμα): στις φόρμες της εφαρμογής και ως dropdown στα Excel.
// Πάντα επιτρέπεται και άλλη τιμή γραμμένη με το χέρι· η λίστα συμπληρώνεται με όσες υπάρχουν ήδη στα δεδομένα.
import { collator, normGreek, upper } from './text';
import { CADRE_ABS, LEAVE_KINDS, PUN_KINDS, TYPES, type Status, type TypeKey } from './domain';
import type { SiConfig } from './si';
import type { StatConfig } from './stat';

// Βαθμοί στρατιωτών (Δυναμολόγιο)
export const SOLDIER_RANKS = ['ΣΤΡ', 'ΥΔΝΕΑΣ', 'ΔΝΕΑΣ', 'ΛΧΙΑΣ', 'ΕΠΟΠ ΣΤΡ', 'ΕΠΟΠ ΔΝΕΑΣ', 'ΕΠΟΠ ΛΧΙΑΣ', 'ΔΕΑ'];
// Βαθμοί στελεχών (από τον μικρότερο στον μεγαλύτερο)
export const CADRE_RANKS = ['ΛΧΙΑΣ', 'ΕΠΛΧΙΑΣ', 'ΑΛΧΙΑΣ', 'ΑΝΘΣΤΗΣ', 'ΑΝΘΛΧΟΣ', 'ΥΠΛΧΟΣ', 'ΙΛΧΟΣ', 'ΑΝΘΛΓΟΣ', 'ΥΠΛΓΟΣ', 'ΛΓΟΣ', 'ΕΠΛΧΟΣ', 'ΤΧΗΣ', 'ΔΕΑ'];
// Τύποι όπλων (καρτέλα Οπλισμός, Michael 17/10)· οι άλλοι προστίθενται στις Λίστες
export const WEAPON_TYPES = ['G3A3', 'G3A4', 'M16A2', 'M4'];
// Λόγοι εξόδου όπλου από τον οπλοβαστό και ο λόγος εισαγωγής του καθενός (Michael, 18/10: «ΕΚΠ» → «ΛΗΞ ΕΚΠ»)· οι άλλοι στις Λίστες
export const WEAPON_OUT: [string, string][] = [['ΕΚΠ', 'ΛΗΞ ΕΚΠ'], ['ΒΟΛΗ', 'ΛΗΞ ΒΟΛΗΣ'], ['ΑΣΚΗΣΗ', 'ΛΗΞ ΑΣΚΗΣΗΣ'], ['ΥΠΗΡΕΣΙΑ', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ'], ['ΚΑΘΑΡΙΣΜΟΣ', 'ΛΗΞ ΚΑΘΑΡΙΣΜΟΥ'], ['ΕΠΙΣΚΕΥΗ', 'ΕΠΙΣΤΡΟΦΗ ΑΠΟ ΕΠΙΣΚΕΥΗ']];
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
export type ListId = 'soldierRanks' | 'cadreRanks' | 'specs' | 'punKinds' | 'leaveKinds' | 'cadreAbs' | 'medKinds' | 'siUnarmed' | 'weaponTypes' | 'weaponOut';
// hk: γραμμή της ΗΚΑΙ όπου μετρά ο βαθμός · col: στήλη της ΗΚΑΙ (άδεια, απουσία στελέχους· κενό = μόνο στη λίστα)
// acc: πώς γράφεται η ποινή στο κείμενο («με δύο (02) ημέρες …») · max: ανώτατες ημέρες (προειδοποίηση)
// like: βασικός τύπος ιατρικού (ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ): στην ΗΚΑΙ μετρά μόνο ο ΕΥ· υπηρεσίες και έξοδος στον πίνακα Καταστάσεων.
// Τα καινούργια μπαίνουν σαν ΕΑΡΒ (χωρίς περιορισμούς ώσπου να τα ρυθμίσεις, Michael 18/10) · code: κωδικός στο ημερολόγιο (κενό = του βασικού)
// back: λόγος εισαγωγής όπλου για έναν δικό σου λόγο εξόδου (κενό = «ΛΗΞ <λόγος>»)
// warn: «μόνο προειδοποίηση» (checkbox): βγάζει προειδοποίηση όταν μπαίνει σε υπηρεσία (π.χ. παραπεμπτικό για 401)
export interface ListItem { name: string; hk?: string; col?: string; acc?: string; max?: number; like?: TypeKey; code?: string; warn?: boolean; back?: string }
export interface UserList { add?: ListItem[]; hide?: string[] }
// si: ο πίνακας Σ.Ι. (si.ts) · stat: ο πίνακας καταστάσεων ΕΑ/ΕΥ/ΕΟ… (stat.ts), ό,τι άλλαξες εκεί
// hkRows: γραμμές της ΗΚΑΙ που πρόσθεσες (Ρυθμίσεις › Μονάδα και έντυπα › Γραμμές της ΗΚΑΙ)
export type UserLists = Partial<Record<ListId, UserList>> & { si?: SiConfig; stat?: StatConfig; hkRows?: HkRowDef[] };
export const LIST_BASE: Record<ListId, readonly string[]> = {
  soldierRanks: SOLDIER_RANKS, cadreRanks: CADRE_RANKS, specs: SPECS, punKinds: PUN_KINDS, leaveKinds: LEAVE_KINDS,
  cadreAbs: CADRE_ABS.map(x => x[1]),   // στις απουσίες στελεχών οι βασικές έχουν κωδικό (ka, an…)· οι δικές σου το όνομά τους
  medKinds: ['EA', 'EY', 'EO', 'EARV'].map(k => TYPES[k as TypeKey].label),
  siUnarmed: ['ΑΟΠΛ', 'Ι4'],   // Σ.Ι. που περιέχει «ΑΟΠΛ» ή αρχίζει από «Ι4» (όπως πριν τις Λίστες)
  weaponTypes: WEAPON_TYPES,
  weaponOut: WEAPON_OUT.map(x => x[0])
};
export const LIST_NAME: Record<ListId, string> = { soldierRanks: 'Βαθμοί στρατιωτών', cadreRanks: 'Βαθμοί στελεχών', specs: 'Ο/Σ (όπλα και σώματα)', punKinds: 'Είδη ποινής', leaveKinds: 'Είδη άδειας', cadreAbs: 'Καταστάσεις στελεχών', medKinds: 'Ιατρικά', siUnarmed: 'Σ.Ι. άοπλων', weaponTypes: 'Τύποι όπλων', weaponOut: 'Λόγοι εξόδου όπλου' };
// ίδιο κλειδί για «Ε.Π.Ο.Π στρ» και «ΕΠΟΠ ΣΤΡ»: χωρίς τόνους, τελείες και διπλά κενά, λατινικά που μοιάζουν → ελληνικά
export const itemKey = (v: string) => normGreek(v).replace(/\./g, '').replace(/\s+/g, ' ').trim();
// βαθμοί, Ο/Σ και ιατρικά με κεφαλαία, όπως στα Excel· είδη ποινής, άδειας, απουσίας όπως γράφτηκαν
const UPPER: ListId[] = ['soldierRanks', 'cadreRanks', 'specs', 'medKinds', 'siUnarmed', 'weaponTypes', 'weaponOut'];
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
// Λόγος εισαγωγής όπλου για έναν λόγο εξόδου: του βασικού (ΕΚΠ → ΛΗΞ ΕΚΠ), όποιον όρισες στον δικό σου, αλλιώς «ΛΗΞ <λόγος>»
export function weaponBack(reason: string, lists?: UserLists): string {
  const k = itemKey(reason || ''); if (!k) return '';
  const base = WEAPON_OUT.find(x => itemKey(x[0]) === k); if (base) return base[1];
  const own = (lists?.weaponOut?.add || []).find(x => itemKey(x.name) === k);
  return own?.back || 'ΛΗΞ ' + reason.trim().toUpperCase();
}
// ---------------------------------------------------------------------------
// Γραμμές (βαθμοί) της ΗΚΑΙ: οι βασικές του εντύπου και όσες πρόσθεσες (Michael, 18/10: «Ίλαρχος, Λοχαγός, Ταγματάρχης…»).
// Κάθε δική σου γραμμή μπαίνει στους αξιωματικούς ή στους οπλίτες, κάτω από μια άλλη, και μαζεύει τους βαθμούς που
// διάλεξες. Στο έντυπο μπαίνει ως νέα γραμμή με τους τύπους της και μετρά στα σύνολα (exports.ts).
// ---------------------------------------------------------------------------
export const HK_OFFICERS = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ'];
export const HK_NCO = ['Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες', 'Δεκανείς', 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης', 'Στρατιώτες'];
// name: όνομα (και κλειδί) της γραμμής · grp: αξιωματικοί ή οπλίτες · after: κάτω από ποια (κενό = στο τέλος της ομάδας)
// ranks: βαθμοί που μετρούν σε αυτήν (στελέχη και στρατιώτες), αντί για τη γραμμή που θα έπαιρναν
export interface HkRowDef { name: string; grp: 'off' | 'nco'; after?: string; ranks?: string[] }
export interface HkRows { off: string[]; nco: string[]; own: Set<string> }
const rowsIdx = new WeakMap<object, HkRows>();
export function hkRowsOf(lists?: UserLists): HkRows {
  const key = lists?.hkRows; if (!key?.length) return { off: HK_OFFICERS, nco: HK_NCO, own: new Set() };
  let r = rowsIdx.get(key); if (r) return r;
  const off = [...HK_OFFICERS], nco = [...HK_NCO]; const own = new Set<string>();
  const taken = new Set([...off, ...nco, 'ΣΥΝΟΛΟ ΑΞΚΩΝ', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ'].map(itemKey));
  for (const x of key) {
    const k = itemKey(x.name || ''); if (!k || taken.has(k)) continue;
    taken.add(k); own.add(x.name);
    const list = x.grp === 'off' ? off : nco; const i = x.after ? list.indexOf(x.after) : -1;
    list.splice(i >= 0 ? i + 1 : list.length, 0, x.name);
  }
  r = { off, nco, own }; rowsIdx.set(key, r); return r;
}
// όλες οι γραμμές με τη σειρά του εντύπου
export const hkRowList = (lists?: UserLists) => { const r = hkRowsOf(lists); return [...r.off, ...r.nco]; };
// γραμμές όπου μπαίνει στέλεχος: αξιωματικοί, ανθυπασπιστές, ΔΕΑ, αρχιλοχίες, επιλοχίες, λοχίες και όσες πρόσθεσες
export const hkCadreRows = (lists?: UserLists) => { const r = hkRowsOf(lists); return [...r.off, ...r.nco.filter(x => HK_NCO.indexOf(x) < 3 && HK_NCO.indexOf(x) >= 0 || r.own.has(x))]; };
// γραμμές όπου γράφεις πόσα στελέχη έχει, όταν δεν τα περνάς με ονόματα (οι λοχίες μετρώνται από το προσωπικό)
export const cadreCountRows = (lists?: UserLists) => hkCadreRows(lists).filter(r => r !== 'Λοχίες');
// η δική σου γραμμή που μαζεύει έναν βαθμό (grp: μόνο από αυτή την ομάδα)
export function hkRowClaim(lists: UserLists | undefined, rank: string, grp?: 'off' | 'nco'): string | undefined {
  const k = itemKey(rank || ''); if (!k || !lists?.hkRows?.length) return undefined;
  const own = hkRowsOf(lists).own;
  return lists.hkRows.find(x => own.has(x.name) && (!grp || x.grp === grp) && (x.ranks || []).some(r => itemKey(r) === k))?.name;
}

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
// Καταστάσεις στελεχών (οι στήλες της ΗΚΑΙ): [κωδικός, όνομα, στήλη ΗΚΑΙ]. Οι βασικές με τον κωδικό τους, οι δικές σου με το όνομα ως κωδικό.
// all: και όσες έκρυψες (για εγγραφές που υπάρχουν ήδη)
export function cadreAbsKinds(lists?: UserLists, all = false): [string, string, string][] {
  const rows = listRows(lists, 'cadreAbs').filter(r => all || !r.hidden);
  return rows.map(r => (r.builtin ? CADRE_ABS.find(x => x[1] === r.name)! : [r.name, r.name, r.col || ''] as [string, string, string]));
}
// με τον κωδικό, αλλιώς με το όνομα: μια δική σου (π.χ. «Πρατήριο») που έγινε μετά βασική κρατά τη στήλη της
export function cadreAbsOf(kind: string, lists?: UserLists): [string, string, string] | undefined {
  const all = cadreAbsKinds(lists, true); const k = itemKey(kind || '');
  return all.find(x => x[0] === kind) || (k ? all.find(x => itemKey(x[1]) === k) : undefined);
}

// Ιατρικά (Michael, 13/10): κάθε δικό σου έχει βασικό τύπο ΕΑ, ΕΥ, ΕΟ ή ΕΑΡΒ (για την ΗΚΑΙ και ό,τι δεν όρισες στον πίνακα Καταστάσεων), με δικό του όνομα.
// Αποθηκεύεται στο «είδος» της κατάστασης, όπως το γράφει και το διαβάζει το Excel ΕΑ-ΕΥ.
export const MED_LIKE: TypeKey[] = ['EA', 'EY', 'EO', 'EARV'];
// χωρίς κενά και σημεία: «ΕΛ.ΓΥΜΝ», «Ελ γυμν» και «ΕΛ ΓΥΜΝ» είναι το ίδιο (όπως διαβάζει το Excel)
const medKey = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
export const ownMed = (lists: UserLists | undefined, kind: string | undefined) => {
  const k = medKey(kind || ''); if (!k) return undefined;
  return (lists?.medKinds?.add || []).find(x => x.like && MED_LIKE.includes(x.like) && medKey(x.name) === k);
};
// τιμή του Excel (ή είδος) → βασικός τύπος, αν είναι δικό σου ιατρικό· οι βασικοί αναγνωρίζονται όπως πριν
export const medTypeOf = (raw: string | undefined, lists?: UserLists): TypeKey | undefined => ownMed(lists, raw)?.like;
// δικά σου ιατρικά που προτείνονται στη δήλωση (όχι όσα έκρυψες)
export const medKinds = (lists?: UserLists): ListItem[] => listRows(lists, 'medKinds').filter(r => !r.builtin && !r.hidden && r.like && MED_LIKE.includes(r.like));
// Δικό σου ιατρικό «μόνο προειδοποίηση» (Michael, 13/10): μπαίνει σε υπηρεσία, αλλά με προειδοποίηση
export const medWarns = (s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): boolean => MED_LIKE.includes(s.type) && !!ownMed(lists, s.kind)?.warn;
// Όνομα κατάστασης σε σήματα και λίστες: η ποινή με το είδος της, το δικό σου ιατρικό με το όνομά του
export function statusLbl(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): string {
  if (s.type === 'PUN') return upper(s.kind || TYPES.PUN.label);   // οι ποινές με κεφαλαία παντού (Michael, 13/10)
  const m = MED_LIKE.includes(s.type) ? ownMed(lists, s.kind) : undefined;
  return m ? m.name : TYPES[s.type].label;
}
// Κωδικός στο ημερολόγιο (Κ.Α, Ε.Υ…): ό,τι όρισες για το δικό σου ιατρικό, αλλιώς του βασικού τύπου
export function absCode(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): string | undefined {
  const m = MED_LIKE.includes(s.type) ? ownMed(lists, s.kind) : undefined;
  return m?.code || TYPES[s.type].code;
}

// Σ.Ι. → άοπλος (όχι οπλοφύλακας, όχι σκοπός). Τα βασικά όπως πριν: περιέχει «ΑΟΠΛ» ή αρχίζει από «Ι4»· και το
// «ΧΩΡΙΣ ΟΠΛΟ», όπως λέγεται πια το Ι3 ΑΟΠΛΟ (Michael, 17/10), μετρά στο ίδιο βασικό «ΑΟΠΛ».
// Τα δικά σου: το Σ.Ι. αρχίζει από αυτό, χωρίς κενά και τελείες («Ι5» πιάνει και «Ι 5», «Ι5 ΧΩΡΙΣ ΟΠΛΟ»). Όσα έκρυψες δεν μετρούν.
const siKey = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
// ρωτιέται για κάθε υποψήφιο σε κάθε θέση: κρατιέται ανά Λίστες και Σ.Ι.
const unarmedIdx = new WeakMap<object, Map<string, boolean>>(); const NO_LISTS = {};
export function siUnarmed(si: string | undefined, lists?: UserLists): boolean {
  let m = unarmedIdx.get(lists || NO_LISTS); if (!m) { m = new Map(); unarmedIdx.set(lists || NO_LISTS, m); }
  const key = si || ''; let r = m.get(key);
  if (r === undefined) { r = siUnarmedRaw(key, lists); m.set(key, r); }
  return r;
}
function siUnarmedRaw(si: string, lists?: UserLists): boolean {
  const v = normGreek(si); if (!v) return false;
  const u = lists?.siUnarmed; const hide = new Set((u?.hide || []).map(itemKey));
  const k = siKey(v);
  if (!hide.has('ΑΟΠΛ') && (v.includes('ΑΟΠΛ') || k.includes('ΧΩΡΙΣΟΠΛ'))) return true;
  if (!hide.has('Ι4') && v.startsWith('Ι4')) return true;
  return (u?.add || []).some(x => { const a = siKey(x.name || ''); return !!a && !hide.has(itemKey(x.name)) && k.startsWith(a); });
}

// Μαντεύει την κατηγορία της ΗΚΑΙ από τον βαθμό που γράφει ο χρήστης· πρώτα ό,τι όρισες στις Λίστες
export function guessHk(rank: string, lists?: UserLists): string {
  const claim = hkRowClaim(lists, rank); if (claim) return claim;
  const own = hkOfRank(lists, 'cadreRanks', rank); if (own && hkCadreRows(lists).includes(own)) return own;
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
