// Έντυπα (Michael, 19/10): δικά σου πρότυπα Excel (ανεβασμένα ή φτιαγμένα στην εφαρμογή) που γεμίζουν με στοιχεία της
// εφαρμογής. Πρότυπο = το αρχείο (εμφάνιση)· Έντυπο = πρότυπο + τι αφορά + ποια στήλη παίρνει τι + ποιοι μπαίνουν.
// Εδώ ό,τι είναι κοινό για οθόνη και main: τα στοιχεία, η μαντεψιά από τις επικεφαλίδες, ποιοι μπαίνουν και η τυχαία επιλογή.
import { addDays, daysBetween, dm, dmy, parseD, MON_SHORT, type ISODate } from './dates';
import { collator, norm, normGreek, upper } from './text';
import { TYPES, blocksOf, everyBlock, fullName, unitOf, roomCfg, type AppState, type Cadre, type Person, type Post, type Status, type WeaponMove } from './domain';
import { activePeople, personMap, seatMap, postBy, postsOf, statusesOn, strengthOf } from './rules';
import { WEAPON_FILTERS, byOut, inOutText, moveById, moveInCell, moveOutCell, movesAll, isAuto, weaponInfo, weaponMatch, type WeaponFilter, type WeaponInfo } from './weapons';
import { listOf, rankTxt, statusLbl } from './ranks';
import { cadreStatusOn, dutyOfficers, orderedCadre } from './cadre';
import { currentEsso, essoName } from './esso';
import { filterStatus, rosterMatch, type RosterFilter } from './rosterLists';
import type { Sig } from './sigs';
import type { Moves } from './layout';
import { valsUsed, type Spot, type ValueTable, type VAt } from './values';
import { MAIN, bandsOf, hasBeside, isDefault, type Bands } from './repBands';

export type RepKind = 'people' | 'cadre' | 'status' | 'duty' | 'weapon' | 'wmove';
export const REP_KINDS: { id: RepKind; label: string; help: string }[] = [
  { id: 'people', label: 'Στρατιώτες', help: 'Μία γραμμή για κάθε στρατιώτη' },
  { id: 'cadre', label: 'Στελέχη', help: 'Μία γραμμή για κάθε στέλεχος' },
  { id: 'status', label: 'Καταστάσεις', help: 'Μία γραμμή για κάθε ιατρικό, ποινή ή άδεια, με τα στοιχεία του στρατιώτη' },
  { id: 'duty', label: 'Υπηρεσίες ημέρας', help: 'Μία γραμμή για κάθε θέση υπηρεσίας της μέρας (θέση, ώρες), με τον στρατιώτη που την έχει' },
  { id: 'weapon', label: 'Οπλισμός', help: 'Μία γραμμή για κάθε στρατιώτη με όπλο: αριθμός, τύπος, οπλοβαστός, εντός ή εκτός' },
  { id: 'wmove', label: 'Κινήσεις όπλων', help: 'Μία γραμμή για κάθε έξοδο όπλου της μέρας: λόγος, ώρα εξόδου και εισόδου' }
];
// Είδη με μία γραμμή ανά «κάτι» ενός στρατιώτη (κατάσταση, θέση, κίνηση όπλου): τα στοιχεία του στρατιώτη είναι στο p
export const isLinked = (k: RepKind) => k === 'status' || k === 'duty' || k === 'wmove';
// «Έντυπα ημέρας»: βγαίνει χωρίς ερώτηση, άρα όχι με τυχαίους ή με «Ρώτα κάθε φορά»
export const dailyOk = (r: Pick<Report, 'pick' | 'day'>) => r.pick.mode !== 'random' && r.day !== 'ask';
// τι μετράει κάθε είδος: «20 άτομα», «12 θέσεις»
export const rowNoun = (k: RepKind) => (k === 'cadre' ? 'στελέχη' : k === 'status' ? 'καταστάσεις' : k === 'duty' ? 'θέσεις' : k === 'wmove' ? 'κινήσεις' : 'άτομα');

// Στοιχεία (στήλες) ανά είδος: [κλειδί, όνομα στη λίστα, επικεφαλίδα όταν το φτιάχνεις εδώ, πλάτος σε χαρακτήρες, στοίχιση]
export type Align = 'left' | 'center';
export interface FieldDef { k: string; label: string; head: string; w: number; al: Align }
const F = (k: string, label: string, head: string, w: number, al: Align = 'center'): FieldDef => ({ k, label, head, w, al });
// Βαθμός: με την προέλευση μπροστά (ΕΠΟΠ ΛΧΙΑΣ), όπως το ονοματεπώνυμο ενώνει επώνυμο και όνομα· και χωριστά (Michael, 22/10)
const COMMON = [F('aa', 'Α/Α (αύξων αριθμός)', 'Α/Α', 5), F('rank', 'Βαθμός (με την προέλευση, π.χ. ΕΠΟΠ ΛΧΙΑΣ)', 'ΒΑΘΜΟΣ', 11), F('rank1', 'Μόνο βαθμός (χωρίς προέλευση)', 'ΒΑΘΜΟΣ', 10),
  F('origin', 'Προέλευση (ΕΠΟΠ, ΟΒΑ, ΣΜΥ…)', 'ΠΡΟΕΛΕΥΣΗ', 10), F('spec', 'Ο/Σ', 'Ο/Σ', 6)];
// τα στοιχεία του στρατιώτη στα είδη με μία γραμμή ανά κατάσταση, θέση ή όπλο
const SOLDIER = [
  F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'), F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
  F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'), F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'), F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
  F('asm', 'ΑΣΜ', 'ΑΣΜ', 13), F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13), F('room', 'Θάλαμος', 'ΘΑΛ.', 6), F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10), F('si', 'Σ.Ι.', 'Σ.Ι.', 8)];
// Καταστάσεις της μέρας σε στήλη, κάθε είδος χωριστά (Michael, 22/10: «να διαλέξω ιατρικές καταστάσεις, άδεια κτλπ»),
// με τη μορφή που διαλέγεις (ColOpts.sf: ΕΑ, ΕΥ, ΑΔΕΙΑ…)
const STATUS = [F('smed', 'Ιατρικό τη μέρα (ΕΑ, ΕΥ…)', 'ΙΑΤΡΙΚΟ', 12), F('sabs', 'Άδεια τη μέρα (ΚΑ, τιμητική…)', 'ΑΔΕΙΑ', 12), F('spun', 'Ποινή τη μέρα', 'ΠΟΙΝΗ', 14),
  F('sother', 'ΣΤΕΠ ή νοσοκομείο τη μέρα', 'ΣΤΕΠ / ΝΟΣ.', 12), F('sout', 'Έξοδος τη μέρα (εξοδούχος, ΔΝ)', 'ΕΞΟΔΟΣ', 11)];
// Συνδυασμός: πολλά στοιχεία σε μία στήλη, με τη μορφή που γράφεις (ColOpts.parts, fmt: «{1} ({2})» → ΣΤΡ (ΜΧ))
const TAIL = [F('combo', 'Συνδυασμός στοιχείων (π.χ. ΣΤΡ (ΜΧ))', 'ΒΑΘΜΟΣ (Ο/Σ)', 16), F('blank', 'Κενή (π.χ. για υπογραφή)', 'ΥΠΟΓΡΑΦΗ', 18), F('text', 'Σταθερό κείμενο', '', 12)];
export const FIELDS: Record<RepKind, FieldDef[]> = {
  people: [...COMMON,
    F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'), F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
    F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'), F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'), F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
    F('asm', 'ΑΣΜ', 'ΑΣΜ', 13), F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13), F('room', 'Θάλαμος', 'ΘΑΛ.', 6), F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10),
    F('si', 'Σ.Ι.', 'Σ.Ι.', 8), F('post', 'Πόστο', 'ΠΟΣΤΟ', 14), F('role', 'Ρόλος', 'ΡΟΛΟΣ', 14), F('essos', 'ΕΣΣΟ', 'ΕΣΣΟ', 10), F('dn', 'Δικαίωμα ΔΝ', 'ΔΝ', 6),
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11), F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('status', 'Κατάσταση την ημέρα (όλες: ΚΑ, ΕΑ, ποινή…)', 'ΚΑΤΑΣΤΑΣΗ', 16), ...STATUS, F('duty', 'Υπηρεσία την ημέρα', 'ΥΠΗΡΕΣΙΑ', 16), F('notes', 'Σημειώσεις', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 20, 'left'),
    ...TAIL],
  cadre: [...COMMON,
    F('name', 'Επώνυμο Όνομα', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 26, 'left'), F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 32, 'left'),
    F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'), F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'), F('am', 'ΑΜ', 'ΑΜ', 12), F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13),
    F('role', 'Θέση', 'ΘΕΣΗ', 18, 'left'), F('status', 'Κατάσταση την ημέρα', 'ΚΑΤΑΣΤΑΣΗ', 18),
    ...TAIL],
  // Καταστάσεις (Φάση 2): τα στοιχεία του στρατιώτη και της κατάστασης
  status: [...COMMON, ...SOLDIER,
    F('stype', 'Είδος (ΚΑ, ΕΥ, ποινή…)', 'ΕΙΔΟΣ', 16), F('from', 'Από', 'ΑΠΟ', 11), F('to', 'Έως', 'ΕΩΣ', 11), F('days', 'Ημέρες', 'ΗΜΕΡΕΣ', 7),
    F('note', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', 22, 'left'), F('by', 'Ποιος τιμώρησε', 'ΤΙΜΩΡΗΣΕ', 18, 'left'), F('reason', 'Διότι', 'ΔΙΟΤΙ', 30, 'left'), F('on', 'Ημερομηνία τιμωρίας', 'ΗΜ. ΤΙΜΩΡΙΑΣ', 11),
    ...TAIL],
  // Φάση 3: θέσεις υπηρεσίας της μέρας, όπλα, κινήσεις όπλων
  duty: [...COMMON,
    F('seat', 'Θέση (π.χ. Θαλαμοφύλακας 1ος)', 'ΘΕΣΗ', 24, 'left'), F('code', 'Κωδικός θέσης (Θ1α, Μ2…)', 'ΚΩΔ.', 7), F('block', 'Υπηρεσία (ομάδα θέσεων)', 'ΥΠΗΡΕΣΙΑ', 20, 'left'),
    F('hours', 'Ώρες', 'ΩΡΕΣ', 16), F('armed', 'Ένοπλη (ΝΑΙ)', 'ΕΝΟΠΛΗ', 8),
    ...SOLDIER, F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), ...STATUS,
    ...TAIL],
  weapon: [...COMMON, ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11), F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('inout', 'Εντός ή εκτός (με τον λόγο)', 'ΕΝΤΟΣ / ΕΚΤΟΣ', 26, 'left'), ...STATUS,
    ...TAIL],
  wmove: [...COMMON, ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11),
    F('mreason', 'Λόγος εξόδου (ΕΚΠ, βολή…)', 'ΛΟΓΟΣ ΕΞΟΔΟΥ', 16), F('mout', 'Έξοδος (ημερομηνία και ώρα)', 'ΕΞΟΔΟΣ', 17),
    F('minr', 'Λόγος εισόδου', 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ', 16), F('min', 'Είσοδος (ημερομηνία και ώρα)', 'ΕΙΣΟΔΟΣ', 17), F('mnote', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', 22, 'left'), ...STATUS,
    ...TAIL]
};
export const fieldOf = (kind: RepKind, k: string) => FIELDS[kind].find(x => x.k === k);

// ------------------------------------------------------------------ μορφή στήλης (καταστάσεις, συνδυασμός)
// sf: πώς γράφεται κάθε κατάσταση, με {ΕΤΙΚΕΤΕΣ} (ST_TAGS)· parts/fmt: τα στοιχεία του συνδυασμού και η μορφή του με {1}, {2}…
export interface ColOpts { sf?: string; parts?: string[]; fmt?: string }
// στήλες με καταστάσεις της μέρας: ποιες κατηγορίες παίρνει η καθεμία (null: όλες)
const ST_FIELD: Record<string, StCat[] | null> = { status: null, smed: ['med'], sabs: ['abs'], spun: ['pun'], sother: ['other'], sout: ['out'] };
export const isStatusField = (f: string) => f === 'stype' || Object.prototype.hasOwnProperty.call(ST_FIELD, f);
const CAT_WORD: Partial<Record<string, string>> = { med: 'ΙΑΤΡΙΚΟ', abs: 'ΑΔΕΙΑ', pun: 'ΠΟΙΝΗ', out: 'ΕΞΟΔΟΣ' };
export const ST_TAGS: { tag: string; help: string }[] = [
  { tag: 'ΚΩΔ', help: 'ΕΑ, ΚΑ, ΠΕΡΙΟΡΙΣΜΟΣ' }, { tag: 'ΣΥΝΤΟΜΑ', help: 'ΕΑ, ΕΥ, ΑΔΕΙΑ, ΠΟΙΝΗ' }, { tag: 'ΟΝΟΜΑ', help: 'ΕΛΕΥΘΕΡΟΣ ΑΣΚΗΣΕΩΝ' },
  { tag: 'ΚΑΤΗΓΟΡΙΑ', help: 'ΙΑΤΡΙΚΟ, ΑΔΕΙΑ, ΠΟΙΝΗ' }, { tag: 'ΑΠΟ', help: '20/10' }, { tag: 'ΕΩΣ', help: '24/10' }, { tag: 'ΗΜΕΡΕΣ', help: '5' }
];
// έτοιμες μορφές· ό,τι άλλο γράψεις είναι «δική σου»
export const ST_FMTS = ['{ΚΩΔ}', '{ΣΥΝΤΟΜΑ}', '{ΟΝΟΜΑ}', '{ΚΑΤΗΓΟΡΙΑ}', '{ΚΩΔ} ΕΩΣ {ΕΩΣ}', '{ΚΩΔ} {ΑΠΟ}-{ΕΩΣ}', '{ΚΩΔ} ({ΗΜΕΡΕΣ} ΗΜ.)', 'ΝΑΙ'];
// Μία κατάσταση με τη μορφή fmt (χωρίς: ΕΑ, ΚΑ, ΠΕΡΙΟΡΙΣΜΟΣ, όπως πριν)
export function stText(st: Pick<Status, 'type' | 'kind' | 'from' | 'to' | 'open'>, fmt: string | undefined, lists?: AppState['settings']['lists']): string {
  const lbl = statusLbl(st, lists); if (!fmt || fmt === '{ΚΩΔ}') return lbl;
  const t = TYPES[st.type]; const cat = t?.cat || '';
  const tag = (name: string): string | null => {
    switch (normGreek(name).replace(/\s+/g, '')) {
      case 'ΚΩΔ': case 'ΚΩΔΙΚΟΣ': return lbl;
      case 'ΣΥΝΤΟΜΑ': return cat === 'abs' || cat === 'pun' ? CAT_WORD[cat]! : st.type === 'OUT' ? 'ΕΞΟΔΟΣ' : lbl;
      case 'ΟΝΟΜΑ': return st.type === 'PUN' || lbl !== t?.label ? lbl : st.type === 'LEAVE' && st.kind ? st.kind + ' άδεια' : t?.long || lbl;
      case 'ΚΑΤΗΓΟΡΙΑ': return CAT_WORD[cat] || lbl;
      case 'ΑΠΟ': return dm(st.from);
      case 'ΕΩΣ': return st.open ? '…' : dm(st.to);
      case 'ΗΜΕΡΕΣ': return st.open ? '…' : String(daysBetween(st.from, st.to));
    }
    return null;
  };
  return fmt.replace(/\{([^{}]{1,20})\}/g, (m, n: string) => tag(n) ?? m).trim();
}
// Οι καταστάσεις ενός στρατιώτη τη μέρα d (κατηγορίες cats, null: όλες), μία φορά η καθεμία, με κόμμα
function stCol(s: AppState, pid: number, d: ISODate, cats: StCat[] | null, fmt?: string): string {
  const on = statusesOn(s.statuses, pid, d).filter(x => !cats || cats.includes(TYPES[x.type]?.cat as StCat));
  return [...new Set(on.map(x => stText(x, fmt, s.settings.lists)).filter(Boolean))].join(', ');
}
// Συνδυασμός: στοιχεία που δεν μπαίνουν σε συνδυασμό, η προεπιλογή (ΣΤΡ (ΜΧ)) και έτοιμες μορφές για n στοιχεία
const COMBO_NO = new Set(['aa', 'blank', 'text', 'combo']);
export const comboFields = (kind: RepKind) => FIELDS[kind].filter(f => !COMBO_NO.has(f.k));
export const DEF_COMBO: Required<Pick<ColOpts, 'parts' | 'fmt'>> = { parts: ['rank1', 'spec'], fmt: '{1} ({2})' };
export function comboFmts(n: number): string[] {
  const p = Array.from({ length: Math.max(1, n) }, (_, i) => '{' + (i + 1) + '}');
  if (p.length === 1) return ['{1}'];
  return [p.join(' '), p[0] + ' (' + p.slice(1).join(' ') + ')', p.join(' - '), p.join('/'), p.join(', ')];
}
export const comboOf = (o?: ColOpts) => (o?.parts?.length ? { parts: o.parts, fmt: o.fmt ?? comboFmts(o.parts.length)[0] } : DEF_COMBO);
// Γέμισμα της μορφής· αν κάποιο στοιχείο είναι κενό, φεύγουν οι άδειες παρενθέσεις και τα διπλά/ακραία διαχωριστικά
// («ΣΤΡ ()» → «ΣΤΡ», «Α - - Γ» → «Α - Γ»)
export function fillFmt(fmt: string, vals: string[]): string {
  let empty = false;
  const out = fmt.replace(/\{(\d{1,2})\}/g, (_m, n: string) => { const v = vals[+n - 1] ?? ''; if (!v) empty = true; return v; });
  if (!empty) return out.trim();
  let t = out;
  for (let i = 0; i < 3; i++) t = t.replace(/\(\s*\)|\[\s*\]/g, '');
  t = t.replace(/([,/\-–·])(?:\s*\1)+/g, '$1').replace(/\s+/g, ' ').replace(/\s+([,)\]])/g, '$1').replace(/([([])\s+/g, '$1');
  return t.replace(/^[\s,/\-–·]+|[\s,/\-–·]+$/g, '').trim();
}
// Η επικεφαλίδα του συνδυασμού από τα ονόματα των στοιχείων (ΒΑΘΜΟΣ (Ο/Σ))· και για τις έτοιμες μορφές στη λίστα
export const comboHead = (kind: RepKind, o?: ColOpts, fmt?: string) => { const c = comboOf(o); return fillFmt(fmt ?? c.fmt, c.parts.map(k => fieldOf(kind, k)?.head || '')); };

// Στοιχεία εντύπου: ένα κελί (κεφαλίδα, ημερομηνία, υπογραφές…), είτε με κλικ στο κελί είτε με {ΕΤΙΚΕΤΑ} μέσα στο Excel
export interface CellDef { k: string; label: string; tag: string }
export const CELLS: CellDef[] = [
  { k: 'head', label: 'Κεφαλίδα εγγράφων (3 γραμμές, Ρυθμίσεις)', tag: 'ΚΕΦΑΛΙΔΑ' },
  { k: 'head1', label: 'Κεφαλίδα, 1η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 1' }, { k: 'head2', label: 'Κεφαλίδα, 2η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 2' }, { k: 'head3', label: 'Κεφαλίδα, 3η γραμμή', tag: 'ΚΕΦΑΛΙΔΑ 3' },
  { k: 'unitName', label: 'Όνομα μονάδας (π.χ. 4ης ΙΛΗΣ)', tag: 'ΜΟΝΑΔΑ' },
  { k: 'placeDate', label: 'Τόπος και ημερομηνία (ΑΥΛΩΝΑΣ, 19 ΟΚΤ 26)', tag: 'ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ' },
  { k: 'date', label: 'Ημερομηνία (19/10/2026)', tag: 'ΗΜΕΡΟΜΗΝΙΑ' },
  { k: 'title', label: 'Τίτλος του εντύπου', tag: 'ΤΙΤΛΟΣ' },
  { k: 'count', label: 'Σύνολο ατόμων', tag: 'ΣΥΝΟΛΟ' },
  { k: 'sigs', label: 'Υπογραφές (όλες, από αριστερά προς τα δεξιά, Ρυθμίσεις)', tag: 'ΥΠΟΓΡΑΦΕΣ' },
  { k: 'sgtName', label: 'Υπογραφή λοχία (όνομα, Ρυθμίσεις)', tag: 'ΛΟΧΙΑΣ' },
  { k: 'cmdName', label: 'Υπογραφή Διοικητή (όνομα, Ρυθμίσεις)', tag: 'ΔΙΟΙΚΗΤΗΣ' },
  { k: 'esso', label: 'ΕΣΣΟ (Γ΄ ΕΣΣΟ 2026)', tag: 'ΕΣΣΟ' },
  { k: 'officer', label: 'Αξιωματικός υπηρεσίας', tag: 'ΑΞΙΩΜΑΤΙΚΟΣ ΥΠΗΡΕΣΙΑΣ' },
  { k: 'group', label: 'Ομάδα του φύλλου (π.χ. ΘΑΛΑΜΟΣ 3, όταν χωρίζεται σε φύλλα)', tag: 'ΟΜΑΔΑ' }
];
export const cellOf = (k: string) => CELLS.find(x => x.k === k);
const TAG_KEY = new Map(CELLS.map(c => [normGreek(c.tag), c.k]));
export const TAG_RE = /\{([^{}]{1,40})\}/g;

export interface RepCol { c: number; f: string; text?: string; h?: string; o?: ColOpts }   // c: στήλη από 1 · h: η επικεφαλίδα όταν αντιστοιχίστηκε (για να ξαναβρεθεί)
export interface RepCell { ref: string; k: string }
export interface RepPick {
  from: 'all' | 'present' | RosterFilter;   // όλοι σε δύναμη, οι παρόντες τη μέρα, ή ένα φίλτρο του Δυναμολογίου
  view?: string;                              // αποθηκευμένη λίστα του Δυναμολογίου (SavedView.id)
  noDuty?: boolean;                           // (παλιό) χωρίς όσους έχουν υπηρεσία τη μέρα ή την επόμενη: τώρα not: ['duty']
  need?: RepCond[]; not?: RepCond[];          // φίλτρα που συνδυάζονται: πρέπει να ισχύουν όλα τα need και κανένα από τα not
  always?: number[]; never?: number[];        // στρατιώτες: πάντα μέσα (ό,τι κι αν λένε τα φίλτρα) / ποτέ σε αυτό το έντυπο
  gap?: number;                               // τυχαίοι: όχι όσοι βγήκαν σε αυτό το έντυπο τις τελευταίες gap μέρες (από το Ιστορικό)
  si?: string[]; rooms?: number[];            // μόνο αυτά τα Σ.Ι. / αυτοί οι θάλαμοι (κενό = όλα)
  mode: 'all' | 'first' | 'random'; n?: number;
  even?: boolean;                             // τυχαία: ισομερώς από κάθε θάλαμο
  fair?: boolean;                             // τυχαία: πρώτα όσοι βγήκαν λιγότερες φορές σε αυτό το έντυπο (μνήμη ανά ΕΣΣΟ)
  cats?: StCat[];                             // Καταστάσεις: ποια είδη (κενό = ιατρικά, ποινές, άδειες)
  when?: 'on' | 'from';                       // Καταστάσεις: όσες ισχύουν τη μέρα ή όσες ισχύουν από τη μέρα και μετά
  blocks?: string[];                          // Υπηρεσίες: μόνο αυτές οι ομάδες θέσεων (κενό = όλες)
  empty?: boolean;                            // Υπηρεσίες: και οι θέσεις που δεν έχουν κανέναν
  wf?: WeaponFilter;                          // Οπλισμός: φίλτρο της καρτέλας Οπλισμός (προεπιλογή: με όπλο)
  open?: boolean;                             // Κινήσεις όπλων: μόνο όσα είναι ακόμα έξω
}
// Φίλτρα στρατιωτών που συνδυάζονται (Michael 20/10: «π.χ. όχι πόστα και με ιατρικά»), όλα για τη μέρα του εντύπου
export type RepCond = 'present' | 'duty' | 'post' | 'med' | 'pun' | 'leave' | 'dnright' | 'weapon';
export const REP_CONDS: { id: RepCond; label: string; yes: string; no: string }[] = [
  { id: 'present', label: 'Παρών τη μέρα', yes: 'Παρόντες', no: 'Απόντες' },
  { id: 'duty', label: 'Υπηρεσία τη μέρα ή την επόμενη', yes: 'Με υπηρεσία', no: 'Χωρίς υπηρεσία' },
  { id: 'post', label: 'Πόστο', yes: 'Με πόστο', no: 'Χωρίς πόστο' },
  { id: 'med', label: 'Ιατρικό τη μέρα', yes: 'Με ιατρικό', no: 'Χωρίς ιατρικό' },
  { id: 'pun', label: 'Ποινή τη μέρα', yes: 'Τιμωρημένοι', no: 'Χωρίς ποινή' },
  { id: 'leave', label: 'Άδεια τη μέρα', yes: 'Σε άδεια', no: 'Όχι σε άδεια' },
  { id: 'dnright', label: 'Δικαίωμα ΔΝ', yes: 'Με δικαίωμα ΔΝ', no: 'Χωρίς δικαίωμα ΔΝ' },
  { id: 'weapon', label: 'Όπλο', yes: 'Με όπλο', no: 'Χωρίς όπλο' }
];
const LEGACY_FROM: Partial<Record<string, RepCond>> = { present: 'present', leave: 'leave', pun: 'pun', post: 'post', dnright: 'dnright' };
// Τα φίλτρα του εντύπου, και από τα παλιά πεδία (from: παρόντες/άδειες/…, noDuty), ώστε τα αποθηκευμένα έντυπα να δουλεύουν όπως πριν
export function condsOf(pk: RepPick): { need: RepCond[]; not: RepCond[] } {
  const need = new Set(pk.need || []); const not = new Set(pk.not || []);
  const old = LEGACY_FROM[pk.from]; if (old) need.add(old);
  if (pk.noDuty) not.add('duty');
  for (const c of need) not.delete(c);
  return { need: [...need], not: [...not] };
}
// Αλλάζει ένα φίλτρο (any: όλοι, yes: μόνο όσοι το έχουν, no: χωρίς όσους το έχουν). Γράφει μόνο τα νέα πεδία.
export function setCond(pk: RepPick, c: RepCond, v: 'any' | 'yes' | 'no'): RepPick {
  const { need, not } = condsOf(pk);
  const n = need.filter(x => x !== c); const o = not.filter(x => x !== c);
  if (v === 'yes') n.push(c); if (v === 'no') o.push(c);
  const order = (l: RepCond[]) => REP_CONDS.map(x => x.id).filter(x => l.includes(x));
  return { ...pk, from: pk.from === 'inactive' ? 'inactive' : 'all', noDuty: undefined, need: order(n), not: order(o) };
}
export const condVal = (pk: RepPick, c: RepCond): 'any' | 'yes' | 'no' => { const { need, not } = condsOf(pk); return need.includes(c) ? 'yes' : not.includes(c) ? 'no' : 'any'; };
// Ελέγχει ένα φίλτρο για έναν στρατιώτη τη μέρα d (τα σύνολα φτιάχνονται μία φορά, μόνο όσα χρειάζονται)
function condTest(s: AppState, d: ISODate) {
  let present: Set<number> | null = null; let busy: Set<number> | null = null;
  return (c: RepCond, p: Person): boolean => {
    if (c === 'present') { present = present || new Set(strengthOf(s, d).lists.present.map(x => x.id)); return present.has(p.id); }
    if (c === 'duty') { busy = busy || new Set<number>([...Object.values(s.guards[d] || {}), ...Object.values(s.guards[addDays(d, 1)] || {})].filter((x): x is number => typeof x === 'number')); return busy.has(p.id); }
    if (c === 'post') return !!p.post;
    if (c === 'dnright') return !!p.dn;
    if (c === 'weapon') return !!(p.weapon || '').trim();
    const on = statusesOn(s.statuses, p.id, d);
    if (c === 'med') return on.some(x => TYPES[x.type].cat === 'med');
    return !!filterStatus(c, on);
  };
}
export type RepSort = 'name' | 'room' | 'rank' | 'pick' | 'from' | 'seat';
export type StCat = 'med' | 'pun' | 'abs' | 'other' | 'out';
export const ST_CATS: { id: StCat; label: string }[] = [{ id: 'med', label: 'Ιατρικά' }, { id: 'pun', label: 'Ποινές' }, { id: 'abs', label: 'Άδειες' }, { id: 'other', label: 'ΣΤΕΠ, νοσοκομείο' }, { id: 'out', label: 'Έξοδοι' }];
const DEF_CATS: StCat[] = ['med', 'pun', 'abs'];
// Πού βγαίνει ως φύλλο: στο Δυναμολόγιο (το αρχείο του, όποιο είναι τη στιγμή που βγαίνει) ή σε άλλο Excel.
// auto: ξαναγράφεται μόνο του μετά από κάθε αλλαγή (όχι για τυχαίους, που θα άλλαζαν κάθε φορά)
export interface RepTarget { to: 'people' | 'file'; file?: string; sheet: string; auto?: boolean }
export type RepSplit = 'none' | 'room' | 'unit' | 'si';
export const SPLITS: { value: RepSplit; label: string }[] = [{ value: 'none', label: 'Ένα για όλους' }, { value: 'room', label: 'Ανά θάλαμο' }, { value: 'unit', label: 'Ανά ουλαμό' }, { value: 'si', label: 'Ανά Σ.Ι.' }];
export interface Report {
  id: string; name: string; tpl: string; kind: RepKind;
  sheet: string; head: number;                // φύλλο και γραμμή επικεφαλίδων (από 1)
  cols: RepCol[]; cells: RepCell[];
  title?: string;                             // για το στοιχείο «Τίτλος»
  pick: RepPick; sort: RepSort;
  day: 'today' | 'tomorrow' | 'ask';
  out: 'file' | 'print' | 'sheet';
  target?: RepTarget;                         // out = 'sheet'
  split?: RepSplit;                           // ένα φύλλο ανά θάλαμο, ουλαμό ή Σ.Ι.
  trim?: boolean;                             // σβήνονται οι έτοιμες κενές γραμμές του προτύπου που περισσεύουν
  daily?: boolean;                            // βγαίνει και από τα «Έντυπα ημέρας» (Σήμερα), μαζί με ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχους
  sigs?: Sig[];                               // δικές του υπογραφές (κενό = Ρυθμίσεις › Υπογραφές › Έντυπα)
  layout?: Moves;                             // πού μετακίνησες υπογραφές, κεφαλίδα, ημερομηνία (όλα τα φύλλα του), layout.ts
  more?: RepTable[];                          // κι άλλοι πίνακες κάτω από τον πρώτο, με δικές τους στήλες και δικούς τους ποιοι μπαίνουν
  fixed?: boolean;                            // πρότυπο σε πλέγμα (πίνακες με δικό τους πλάτος/θέση): οι στήλες δεν φαρδαίνουν όταν γεμίζει
  vals?: ValueTable[];                        // πίνακες τιμών (shared/values.ts): κείμενο και τιμή, κάτω από τους πίνακες, πριν τις υπογραφές· χωρίς πίνακα ατόμων επιτρέπεται το έντυπο να έχει μόνο αυτούς
  at?: VAt;                                   // στιγμή μέτρησης των πινάκων τιμών (κενό: όπως η Δύναμη της μέρας)
  bands?: Bands;                              // θέσεις πινάκων (Φάση 3, shared/repBands.ts): ζώνες πάνω-κάτω, μέσα σε κάθε ζώνη οι πίνακες δίπλα-δίπλα· κενό: ο ένας κάτω από τον άλλον όπως πριν
  nohead?: boolean;                           // ο 1ος πίνακας βγαίνει χωρίς γραμμή επικεφαλίδων (η γραμμή μένει στο πρότυπο για να βρίσκονται οι στήλες, κρύβεται στο έντυπο)· μπαίνει από το «Φτιάξ' το εδώ»
}
// Πίνακας 2, 3… του εντύπου (Michael, 22/10: «παραπάνω από ένα table με διαφορετικές στήλες»): δικό του είδος, γραμμή
// επικεφαλίδων, στήλες, φίλτρα και σειρά. Χωρίς τυχαίους (η κλήρωση είναι του πρώτου): βγαίνουν όλοι ή οι πρώτοι Ν.
export interface RepTable { id: string; title?: string; kind: RepKind; head: number; cols: RepCol[]; pick: RepPick; sort: RepSort; nohead?: boolean }
// Πρότυπο: αρχείο στον φάκελο «Πρότυπα εντύπων» (file = όνομα αρχείου)· built: φτιαγμένο στην εφαρμογή με αυτές τις επιλογές
export interface RepTpl { id: string; name: string; file: string; built?: BuildOpts; mtime?: number }
export interface BuildCol { f: string; h: string; w: 'auto' | 'narrow' | 'wide'; text?: string; o?: ColOpts }
// «Φτιάξ' το εδώ»: ένας ακόμα πίνακας κάτω από τον πρώτο (τίτλος του πίνακα, είδος, στήλες)
// Πίνακας τιμών στο «Φτιάξ' το εδώ»: δεν έχει στήλες στο πρότυπο, μόνο κρατά χώρο (δίπλα σε πίνακα ατόμων ή σε δική του γραμμή) που τον γεμίζει το έντυπο
export interface BuildVal { id: string; title?: string; lay?: TabLay }
export interface BuildTable { id: string; title: string; kind: RepKind; cols: BuildCol[]; lay?: TabLay; nohead?: boolean }   // nohead: χωρίς γραμμή επικεφαλίδων (Michael, 29/10)
// Μέγεθος και θέση ενός πίνακα στο χαρτί (Michael, 22/10: «ένας πίνακας σε όλη τη σελίδα και ένας με 2 στήλες στο μισό,
// στο κέντρο»): πλάτος (όσο χρειάζονται οι στήλες ή μέρος της σελίδας), αριστερά/κέντρο/δεξιά, ίσες στήλες, κενές γραμμές από πάνω
export interface TabLay { w?: 'auto' | 'full' | '3/4' | '2/3' | '1/2' | '1/3' | '1/4'; at?: 'left' | 'center' | 'right'; even?: boolean; gap?: number }
export const TAB_WIDTHS: { value: NonNullable<TabLay['w']>; label: string; f: number }[] = [
  { value: 'auto', label: 'Όσο χρειάζονται οι στήλες', f: 0 }, { value: 'full', label: 'Όλο το πλάτος', f: 1 }, { value: '3/4', label: 'Τα 3/4', f: 3 / 4 },
  { value: '2/3', label: 'Τα 2/3', f: 2 / 3 }, { value: '1/2', label: 'Το μισό', f: 1 / 2 }, { value: '1/3', label: 'Το 1/3', f: 1 / 3 }, { value: '1/4', label: 'Το 1/4', f: 1 / 4 }];
// Με κάποιον πίνακα σε δικό του πλάτος ή θέση, το φύλλο στήνεται σε πλέγμα στηλών (κάθε στήλη πίνακα = συγχωνευμένα κελιά)
// Και όταν κάποιοι πίνακες είναι δίπλα-δίπλα (bands): μοιράζονται τις 24 στήλες
export const gridOn = (o: Pick<BuildOpts, 'lay' | 'more'> & Partial<Pick<BuildOpts, 'bands' | 'vals'>>) => [o.lay, ...(o.more || []).map(t => t.lay), ...(o.vals || []).map(t => t.lay)].some(l => !!l && ((l.w && l.w !== 'auto') || (l.at && l.at !== 'left') || !!l.even)) || hasBeside(o.bands || []);
// sig: 'list' = οι υπογραφές του εντύπου ή των Ρυθμίσεων (όσες είναι)· 'sgt'/'both': πρότυπα πριν τις 20/10 (λοχίας, διοικητής)
export interface BuildOpts { title: string; cols: BuildCol[]; head: boolean; date: boolean; sig: 'none' | 'list' | 'sgt' | 'both'; land: boolean; sz: 10 | 11 | 12; fill: 'none' | 'gray' | 'olive'; more?: BuildTable[]; lay?: TabLay; nopeople?: boolean; bands?: Bands; vals?: BuildVal[]; nohead?: boolean }   // nohead: ο 1ος πίνακας χωρίς γραμμή επικεφαλίδων · nopeople: χωρίς πίνακα ατόμων (μόνο πίνακες τιμών, χωρίς πίνακες 2, 3…) · bands, vals: θέσεις πινάκων και πίνακες τιμών (μπαίνουν από το forBuild, δεν τα διαλέγει ο χρήστης εδώ)
export const FILLS: Record<BuildOpts['fill'], string> = { none: '', gray: 'D9D9D9', olive: 'D8DFC4' };

// Έτοιμα για αρχή (Φτιάξ' το εδώ)
const bc = (f: string, w: BuildCol['w'] = 'auto', h?: string): BuildCol => ({ f, h: h ?? fieldOf('people', f)!.head, w });
export const PRESETS: { id: string; name: string; help: string; opts: BuildOpts }[] = [
  { id: 'onomastiki', name: 'Ονομαστική κατάσταση', help: 'Α/Α, βαθμός, ονοματεπώνυμο, ΑΣΜ, θάλαμος, παρατηρήσεις', opts: { title: 'ΟΝΟΜΑΣΤΙΚΗ ΚΑΤΑΣΤΑΣΗ', cols: [bc('aa', 'narrow'), bc('rank'), bc('name'), bc('asm'), bc('room', 'narrow'), bc('blank', 'auto', 'ΠΑΡΑΤΗΡΗΣΕΙΣ')], head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray' } },
  { id: 'parousiologio', name: 'Παρουσιολόγιο με υπογραφή', help: 'Α/Α, βαθμός, ονοματεπώνυμο, θάλαμος, υπογραφή', opts: { title: 'ΠΑΡΟΥΣΙΟΛΟΓΙΟ', cols: [bc('aa', 'narrow'), bc('rank'), bc('name'), bc('room', 'narrow'), bc('blank', 'wide')], head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray' } },
  { id: 'thalamos', name: 'Λίστα θαλάμου', help: 'Α/Α, βαθμός, ονοματεπώνυμο, τηλέφωνο, Σ.Ι.', opts: { title: 'ΚΑΤΑΣΤΑΣΗ ΘΑΛΑΜΟΥ', cols: [bc('aa', 'narrow'), bc('rank'), bc('name'), bc('phone'), bc('si', 'narrow')], head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray' } }
];
export const blankBuild = (): BuildOpts => ({ title: 'ΚΑΤΑΣΤΑΣΗ', cols: [bc('aa', 'narrow'), bc('rank'), bc('name')], head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray' });

// ------------------------------------------------------------------ μαντεψιά από τις επικεφαλίδες του Excel
const k = (s: string) => normGreek(s).replace(/[\s.\-_:/\\()]/g, '');
const GUESS: [string, RegExp][] = [
  ['aa', /^(ΑΑ|ΑΡ|ΑΡΙΘ|ΑΡΙΘΜΟΣ|ΑΥΞΩΝΑΡΙΘΜΟΣ|ΑΥΞΑΡ|NO|Νο)$/], ['who', /^ΒΑΘΜΟΣ(ΚΑΙ)?ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^ΒΑΘΜΟΣ(ΚΑΙ)?ΕΠΩΝΥΜΟ(ΚΑΙ)?ΟΝΟΜΑ$/],
  ['rank', /^ΒΑΘΜΟΣ$|^ΒΑΘ$/], ['origin', /^ΠΡΟΕΛΕΥΣΗ$|^ΠΡΟΕΛ$/], ['spec', /^ΟΣ$|^ΕΙΔΙΚΟΤΗΤΑ$|^ΟΠΛΟΣΩΜΑ$/],
  ['name', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^(ΕΠΩΝΥΜΟ|ΕΠΙΘΕΤΟ)(ΚΑΙ)?ΟΝΟΜΑ$/], ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/], ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$|^ΟΝΠΑΤΡΟΣ$|^ΟΝΟΜΑΠΑΤΡΟΣ$/], ['asm', /^ΑΣΜ$|ΜΗΤΡΩΟΥ$/], ['am', /^ΑΜ$/], ['phone', /ΤΗΛΕΦΩΝΟ|^ΤΗΛ$|ΚΙΝΗΤΟ/],
  ['room', /^ΘΑΛΑΜΟΣ$|^ΘΑΛ$/], ['unit', /^ΟΥΛΑΜΟΣ$|^ΟΥΛ$/], ['si', /^ΣΙ$/], ['post', /^ΠΟΣΤΟ$/], ['role', /^ΡΟΛΟΣ$|^ΘΕΣΗ$/], ['essos', /^ΕΣΣΟ$/],
  ['dn', /^ΔΝ$|ΔΙΚΑΙΩΜΑΔΝ/], ['weapon', /^ΑΡΟΠΛΟΥ$|^ΑΡΙΘΜΟΣΟΠΛΟΥ$|^ΟΠΛΟ$/], ['wtype', /^ΤΥΠΟΣΟΠΛΟΥ$|^ΤΥΠΟΣ$/], ['rack', /ΟΠΛΟΒΑΣΤΟΣ/], ['wpos', /^ΘΕΣΗΟΠΛΟΥ$/],
  ['status', /^ΚΑΤΑΣΤΑΣΗ$/], ['duty', /^ΥΠΗΡΕΣΙΑ$/], ['blank', /^ΥΠΟΓΡΑΦΗ$|^ΥΠΟΓΡ$/],
  ['stype', /^ΕΙΔΟΣ$|^ΚΑΤΑΣΤΑΣΗ$|^ΕΙΔΟΣΑΔΕΙΑΣ$|^ΠΟΙΝΗ$/], ['from', /^ΑΠΟ$|^ΕΝΑΡΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΑΠΟ$/], ['to', /^ΕΩΣ$|^ΜΕΧΡΙ$|^ΛΗΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΕΩΣ$/],
  ['days', /^ΗΜΕΡΕΣ$|^ΗΜΕΡΩΝ$|^ΗΜ$/], ['note', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/], ['by', /ΤΙΜΩΡΗΣΕ|^ΥΠΟ$/], ['reason', /^ΔΙΟΤΙ$|^ΑΙΤΙΟΛΟΓΙΑ$|^ΑΙΤΙΑ$/], ['on', /^ΗΜΤΙΜΩΡΙΑΣ$|^ΗΜΕΡΟΜΗΝΙΑΤΙΜΩΡΙΑΣ$/],
  ['seat', /^ΘΕΣΗ$|^ΘΕΣΗΥΠΗΡΕΣΙΑΣ$/], ['hours', /^ΩΡΕΣ$|^ΩΡΑ$/], ['block', /^ΥΠΗΡΕΣΙΑ$/], ['armed', /^ΕΝΟΠΛΗ$|^ΕΝΟΠΛΟΣ$/], ['code', /^ΚΩΔ$|^ΚΩΔΙΚΟΣ$/],
  ['inout', /^ΕΝΤΟΣΕΚΤΟΣ$|^ΕΝΤΟΣ$|^ΕΚΤΟΣ$/], ['mreason', /^ΛΟΓΟΣΕΞΟΔΟΥ$|^ΛΟΓΟΣ$/], ['mout', /^ΕΞΟΔΟΣ$|^ΩΡΑΕΞΟΔΟΥ$/], ['minr', /^ΛΟΓΟΣΕΙΣΟΔΟΥ$/], ['min', /^ΕΙΣΟΔΟΣ$|^ΩΡΑΕΙΣΟΔΟΥ$/], ['mnote', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/],
  ['smed', /^ΙΑΤΡΙΚΟ$|^ΙΑΤΡΙΚΑ$/], ['sabs', /^ΑΔΕΙΑ$|^ΑΔΕΙΕΣ$/], ['spun', /^ΠΟΙΝΗ$|^ΠΟΙΝΕΣ$/], ['sother', /^ΣΤΕΠ|^ΝΟΣΟΚΟΜΕΙΟ$/], ['sout', /^ΕΞΟΔΟΣ$|^ΕΞΟΔΟΥΧΟΣ$/]
];
// Ποιο στοιχείο ταιριάζει σε μια επικεφαλίδα (ή σε {ΕΤΙΚΕΤΑ} μέσα στη γραμμή)· null = δεν το ξέρω
export function guessField(kind: RepKind, head: unknown): string | null {
  const t = k(String(head ?? '').replace(/[{}]/g, '')); if (!t) return null;
  const ok = new Set(FIELDS[kind].map(f => f.k));
  for (const [f, re] of GUESS) if (ok.has(f) && re.test(t)) return f;
  for (const f of FIELDS[kind]) if (f.k !== 'text' && f.k !== 'blank' && (k(f.head) === t || k(f.label) === t)) return f.k;
  return null;
}
// {ΗΜΕΡΟΜΗΝΙΑ} → 'date'
export const tagKey = (tag: string) => TAG_KEY.get(normGreek(tag).replace(/\s+/g, ' ').trim()) || null;

// ------------------------------------------------------------------ τιμές
const shortDate = (d: ISODate) => { const x = parseD(d); return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + String(x.getFullYear()).slice(2); };
export const repDate = (r: Pick<Report, 'day'>, today: ISODate, asked?: ISODate) => (r.day === 'tomorrow' ? addDays(today, 1) : r.day === 'ask' && asked ? asked : today);

// Καταστάσεις: μία γραμμή = μία κατάσταση, με τα στοιχεία του στρατιώτη (θάλαμος, βαθμός… για φίλτρα, σειρά, χωρισμό)
export type StatusRow = Omit<Person, 'id'> & { id: string; pid: number; st: Status; p: Person };
// Υπηρεσίες: μία γραμμή = μία θέση (id = κλειδί θέσης)· p: ο στρατιώτης, null σε κενή θέση
export type DutyRow = Omit<Person, 'id'> & { id: string; pid: number | null; p: Person | null; seat: Post };
// Κινήσεις όπλων: μία γραμμή = μία έξοδος όπλου (id = της κίνησης)
export type MoveRow = Omit<Person, 'id'> & { id: string; pid: number; p: Person; m: WeaponMove };
export type Row = Person | Cadre | StatusRow | DutyRow | MoveRow;
const blockName = (s: AppState, id: string) => ((blocksOf(s.settings) || s.settings.blocks).find(b => b.id === id) || everyBlock(s.settings).find(b => b.id === id))?.name || '';
// εντός/εκτός για όλους μαζί: μία φορά ανά κατάσταση και μέρα (καλείται για κάθε γραμμή)
let wiMemo: { s: AppState; d: ISODate; info: WeaponInfo } | null = null;
const wInfo = (s: AppState, d: ISODate) => { if (!wiMemo || wiMemo.s !== s || wiMemo.d !== d) wiMemo = { s, d, info: weaponInfo(s, d) }; return wiMemo.info; };
const when = (day?: ISODate, t?: string) => (day ? dmy(day) + (t ? ' ' + t : '') : '');
// o: μορφή της στήλης (καταστάσεις, συνδυασμός)
export function fieldValue(s: AppState, kind: RepKind, x: Row, f: string, i: number, d: ISODate, text?: string, o?: ColOpts): string | number | null {
  if (f === 'aa') return i + 1;
  if (f === 'blank') return null;
  if (f === 'text') return text || null;
  if (f === 'combo') {
    const c = comboOf(o);
    const vals = c.parts.map(k => { const v = COMBO_NO.has(k) ? null : fieldValue(s, kind, x, k, i, d, undefined, o); return v == null ? '' : String(v); });
    return fillFmt(c.fmt, vals) || null;
  }
  if (kind === 'status') {
    const r = x as StatusRow; const st = r.st;
    switch (f) {
      case 'stype': return stText(st, o?.sf, s.settings.lists); case 'from': return dmy(st.from); case 'to': return st.open ? '' : dmy(st.to);
      case 'days': return st.open ? '' : daysBetween(st.from, st.to); case 'note': return st.note || ''; case 'by': return st.by || ''; case 'reason': return st.reason || '';
      case 'on': return st.type === 'PUN' ? dmy(st.on || st.from) : '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text, o);
  }
  if (kind === 'duty') {
    const r = x as DutyRow; const po = r.seat;
    switch (f) {
      case 'seat': return po.label; case 'code': return po.code || ''; case 'block': return blockName(s, po.block); case 'hours': return po.hours || '';
      case 'armed': return po.armed ? 'ΝΑΙ' : '';
    }
    return r.p ? fieldValue(s, 'people', r.p, f, i, d, text, o) : null;
  }
  if (kind === 'wmove') {
    const r = x as MoveRow; const m = r.m;
    switch (f) {
      case 'weapon': return m.weapon || r.p.weapon || ''; case 'mreason': return m.reason; case 'mout': return isAuto(m) ? moveOutCell(m) : when(m.outDay, m.outTime);
      case 'minr': return m.inReason || ''; case 'min': return isAuto(m) ? moveInCell(m) : when(m.inDay, m.inTime); case 'mnote': return isAuto(m) ? 'ΑΥΤΟΜΑΤΑ' + (m.note ? ' · ' + m.note : '') : m.note || '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text, o);
  }
  if (kind === 'weapon' && f === 'inout') return inOutText(x as Person, wInfo(s, d));
  if (kind === 'cadre') {
    const c = x as Cadre; const nm = [c.last, c.first].filter(Boolean).join(' ');
    switch (f) {
      case 'rank': return rankTxt(c); case 'rank1': return c.rank; case 'origin': return c.origin || ''; case 'spec': return c.spec || ''; case 'name': return nm; case 'who': return [rankTxt(c), c.spec ? '(' + c.spec + ')' : '', nm].filter(Boolean).join(' ');
      case 'last': return c.last; case 'first': return c.first; case 'am': return c.am || ''; case 'phone': return c.phone || ''; case 'role': return c.role || '';
      case 'status': return cadreStatusOn(s, c.id, d)?.label || '';
    }
    return null;
  }
  const p = x as Person;
  if (f !== 'stype' && isStatusField(f)) return stCol(s, p.id, d, ST_FIELD[f], o?.sf);
  switch (f) {
    case 'rank': return rankTxt(p); case 'rank1': return p.rank; case 'origin': return p.origin || ''; case 'spec': return p.spec; case 'name': return fullName(p);
    case 'who': return [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
    case 'last': return p.last; case 'first': return p.first; case 'father': return p.father; case 'asm': return p.asm; case 'phone': return p.phone;
    case 'room': return p.room; case 'unit': { const u = unitOf(p, s.settings); return u === '—' ? '' : u; }
    case 'si': return p.si; case 'post': return p.post || ''; case 'role': return p.role || ''; case 'essos': return p.essos; case 'dn': return p.dn ? 'ΝΑΙ' : '';
    case 'weapon': return p.weapon || ''; case 'wtype': return p.wtype || ''; case 'rack': return p.rack || ''; case 'wpos': return p.wpos || '';
    case 'duty': return Object.entries(s.guards[d] || {}).filter(([, pid]) => pid === p.id).map(([key]) => postBy(s, key)?.label || '').filter(Boolean).join(', ');
    case 'notes': return p.notes;
  }
  return null;
}
export function cellValue(s: AppState, key: string, d: ISODate, r: Pick<Report, 'title' | 'name'>, n: number, group = ''): string | number | null {
  const st = s.settings; const head = st.unit.filter(Boolean);
  switch (key) {
    case 'head': return head.join('\n');
    case 'head1': return st.unit[0] || ''; case 'head2': return st.unit[1] || ''; case 'head3': return st.unit[2] || '';
    case 'unitName': return st.unitName; case 'place': return st.place;
    case 'placeDate': return (st.place ? st.place + ', ' : '') + shortDate(d);
    case 'date': return dmy(d); case 'title': return r.title || r.name; case 'count': return n;
    case 'sgtName': return st.signers?.sergeant || ''; case 'cmdName': return st.signers?.commander || '';
    case 'esso': { const e = currentEsso(s); return e ? essoName(e) : ''; }
    case 'officer': return dutyOfficers(s, d);
    case 'group': return group;
  }
  return null;
}

// ------------------------------------------------------------------ ποιοι μπαίνουν
export const defaultPick = (mode: RepPick['mode'] = 'all'): RepPick => (mode === 'random' ? { from: 'all', need: ['present'], not: ['duty'], mode, n: 10, even: false } : { from: 'all', mode });
// τα φίλτρα στρατιωτών χωρίς «ποιοι» φίλτρα (για τα είδη με μία γραμμή ανά κατάσταση, θέση, κίνηση)
const soldiersPick = (pk: RepPick): RepPick => ({ ...pk, from: 'all', noDuty: false, need: undefined, not: undefined, mode: 'all' });
// Όσοι περνούν τα φίλτρα (πριν από «πόσοι»), με τη σειρά του Δυναμολογίου (αλφαβητικά)
export function candidates(s: AppState, r: Pick<Report, 'kind' | 'pick'>, d: ISODate): Row[] {
  const pk = r.pick;
  if (r.kind === 'status') {
    const cats = new Set(pk.cats?.length ? pk.cats : DEF_CATS); const pm = personMap(s.people);
    const people = new Set(candidates(s, { kind: 'people', pick: soldiersPick(pk) }, d).map(p => p.id));
    const out: StatusRow[] = [];
    for (const st of s.statuses) {
      if (!cats.has(TYPES[st.type]?.cat as StCat) || !people.has(st.pid)) continue;
      if (pk.when === 'from' ? st.to < d && !st.open : st.from > d || (st.to < d && !st.open)) continue;
      const p = pm.get(st.pid); if (!p) continue;
      out.push({ ...p, id: st.id, pid: p.id, st, p });
    }
    return out.sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first) || (a.st.from < b.st.from ? -1 : 1));
  }
  // Υπηρεσίες: οι θέσεις της μέρας με τη σειρά της ΦΡΟΥΡΑΣ (και όσες έχουν κάποιον αλλά δεν είναι πια στο έντυπο)
  if (r.kind === 'duty') {
    const filtered = !!(pk.view || pk.si?.length || pk.rooms?.length);
    const ok = filtered ? soldiersOf(s, pk, d) : null; const pm = seatMap(s);   // και στελέχη σε θέση (Michael, 26/10)
    const blocks = pk.blocks?.length ? new Set(pk.blocks) : null;
    const g = s.guards[d] || {}; const posts = postsOf(s.settings); const have = new Set(posts.map(x => x.k));
    const out: DutyRow[] = [];
    for (const po of [...posts, ...Object.keys(g).filter(k => !have.has(k)).map(k => postBy(s, k)).filter((x): x is Post => !!x)]) {
      if (blocks && !blocks.has(po.block)) continue;
      const row = dutyRow(pm, po, g[po.k]);
      if (row.p ? (!ok || ok.has(row.p.id)) : pk.empty && !filtered) out.push(row);
    }
    return out;
  }
  // Κινήσεις όπλων της μέρας (έξοδοι της μέρας, είσοδοι της μέρας, όσα είναι ακόμα έξω), με τη σειρά που βγήκαν
  if (r.kind === 'wmove') {
    const ok = soldiersOf(s, pk, d); const pm = seatMap(s); const all = !(pk.view || pk.si?.length || pk.rooms?.length);   // στελέχη (ένοπλη υπηρεσία) μόνο χωρίς φίλτρο στρατιωτών
    const out: MoveRow[] = [];
    for (const m of movesAll(s, d)) {
      if (pk.open && m.inDay && m.inDay <= d) continue;
      const p = pm.get(m.pid); if (p && (ok.has(p.id) || (all && p.cid))) out.push({ ...p, id: m.id, pid: p.id, p, m });
    }
    return out;
  }
  // Οπλισμός: όπως οι στρατιώτες, με το φίλτρο της καρτέλας Οπλισμός («Να παραδώσουν»: και όσοι είναι εκτός δύναμης)
  if (r.kind === 'weapon') {
    const wf = pk.wf || 'with'; const info = wInfo(s, d);
    const base = wf === 'return' ? s.people.filter(p => !p.active) : (candidates(s, { kind: 'people', pick: pk }, d) as Person[]);
    return base.filter(p => weaponMatch(wf, p, info)).sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
  }
  if (r.kind === 'cadre') {
    const list = orderedCadre(s.cadreList || []).filter(c => c.active);
    return pk.from === 'present' ? list.filter(c => !cadreStatusOn(s, c.id, d)) : list;
  }
  const view = pk.view ? (s.settings.views || []).find(v => v.id === pk.view) : undefined;
  let list: Person[] = pk.from === 'inactive' ? s.people.filter(p => !p.active) : activePeople(s);
  const { need, not } = condsOf(pk);
  if (need.length || not.length) { const t = condTest(s, d); list = list.filter(p => need.every(c => t(c, p)) && !not.some(c => t(c, p))); }
  if (view) list = list.filter(p => (view.room == null || p.room === view.room) && (view.unit === 'all' || !view.unit || unitOf(p, s.settings) === view.unit) && (!view.filter || view.filter === 'all' || rosterMatch(view.filter as RosterFilter, p, statusesOn(s.statuses, p.id, d))) && (!view.q || normGreek([p.last, p.first, p.rank, p.origin, p.post, p.role].join(' ')).includes(normGreek(view.q))));
  if (pk.never?.length) { const nv = new Set(pk.never); list = list.filter(p => !nv.has(p.id)); }
  if (pk.si?.length) { const si = new Set(pk.si.map(norm)); list = list.filter(p => si.has(norm(p.si))); }
  if (pk.rooms?.length) { const rs = new Set(pk.rooms); list = list.filter(p => p.room != null && rs.has(p.room)); }
  return [...list].sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
}
export const rowId = (x: Row) => x.id;
// στρατιώτες που περνούν τα φίλτρα του Δυναμολογίου (λίστα, θάλαμοι, Σ.Ι.): για τα είδη με μία γραμμή ανά κατάσταση, θέση, κίνηση
function soldiersOf(s: AppState, pk: RepPick, d: ISODate): Set<number> {
  return new Set(candidates(s, { kind: 'people', pick: soldiersPick(pk) }, d).map(p => p.id as number));
}
const NOBODY = { rank: '', spec: '', last: '', first: '', father: '', asm: '', phone: '', si: '', room: null } as unknown as Omit<Person, 'id'>;
function dutyRow(pm: Map<number, Person>, po: Post, pid: number | undefined): DutyRow {
  const p = pid != null ? pm.get(pid) : undefined;
  return p ? { ...p, id: po.k, pid: p.id, p, seat: po } : { ...NOBODY, id: po.k, pid: null, p: null, seat: po };
}

// Τυχαίοι n από τη λίστα. even: ισομερώς από κάθε θάλαμο (όσοι λείπουν από έναν θάλαμο συμπληρώνονται από τους άλλους).
// rnd: για τα τεστ (Math.random)
function shuffle<X>(a: X[], rnd: () => number): X[] { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
// times: πόσες φορές βγήκε ο καθένας σε αυτό το έντυπο («Πρώτα όσοι βγήκαν λιγότερες φορές»): πρώτα οι λιγότερες,
// τυχαία ανάμεσα σε όσους έχουν τις ίδιες (η ταξινόμηση κρατά τη σειρά της ανακατεμένης λίστας)
function ordered<X extends Row>(a: X[], rnd: () => number, times?: Record<string, number>): X[] {
  const x = shuffle(a, rnd); return times ? x.sort((p, q) => (times[p.id] || 0) - (times[q.id] || 0)) : x;
}
export function pickRandom<T extends Row>(list: T[], n: number, even = false, rnd: () => number = Math.random, times?: Record<string, number>): T[] {
  n = Math.max(0, Math.min(n, list.length));
  if (!even) return ordered(list, rnd, times).slice(0, n);
  const groups = new Map<string, T[]>();
  for (const x of list) { const g = String((x as Person).room ?? '—'); const l = groups.get(g); if (l) l.push(x); else groups.set(g, [x]); }
  const gs = shuffle([...groups.values()].map(g => ordered(g, rnd, times)), rnd);
  const out: T[] = []; const at = gs.map(() => 0);
  // γύρω γύρω: ένας από κάθε θάλαμο με τη σειρά, μέχρι να φτάσουν οι n (οι θάλαμοι που τελείωσαν παραλείπονται)
  while (out.length < n) gs.forEach((g, i) => { if (out.length < n && at[i] < g.length) out.push(g[at[i]++]); });
  return out;
}
// Ένας άλλος τυχαίος στη θέση του i (από όσους δεν είναι ήδη μέσα, πρώτα όσοι βγήκαν λιγότερες φορές)· null: δεν υπάρχει άλλος
// Η κλήρωση που ήδη είδε ο χρήστης (π.χ. στον οδηγό, με τις αλλαγές με ✕), ξανά από τους τωρινούς υποψήφιους.
// null αν κάποιος δεν περνά πια τα φίλτρα: τότε γίνεται νέα κλήρωση.
// more: όσοι μπήκαν με το όνομα (μπορεί να μην περνούν τα φίλτρα)
export function keepDraw(pool: Row[], ids: (number | string)[], more: Row[] = []): Row[] | null {
  const by = new Map([...more, ...pool].map(x => [x.id, x])); const got: Row[] = [];
  for (const id of ids) { const x = by.get(id); if (!x) return null; got.push(x); }
  return got;
}
export function replaceOne<T extends Row>(picked: T[], i: number, pool: T[], rnd: () => number = Math.random, times?: Record<string, number>): T[] | null {
  const ids = new Set(picked.map(x => x.id)); let rest = pool.filter(x => !ids.has(x.id));
  if (!rest.length) return null;
  if (times) { const min = Math.min(...rest.map(x => times[x.id] || 0)); rest = rest.filter(x => (times[x.id] || 0) === min); }
  const nx = [...picked]; nx[i] = rest[Math.floor(rnd() * rest.length)]; return nx;
}
// Χωρισμός σε φύλλα: ομάδες με τη σειρά θαλάμου / ουλαμού / Σ.Ι., και μέσα στην καθεμία η σειρά της λίστας
export interface RepGroup { key: string; label: string; short: string; rows: Row[] }
// η ομάδα μιας γραμμής (θάλαμος, ουλαμός ή Σ.Ι. του στρατιώτη)
export function groupOf(s: Pick<AppState, 'settings'>, x: Row, split: RepSplit): Omit<RepGroup, 'rows'> {
  const p = x as Person; let key: string, label: string, short: string;
  if (split === 'room') { key = p.room == null ? '~' : String(p.room).padStart(3, '0'); label = p.room == null ? 'ΧΩΡΙΣ ΘΑΛΑΜΟ' : 'ΘΑΛΑΜΟΣ ' + p.room; short = p.room == null ? 'ΧΩΡΙΣ ΘΑΛ' : 'Θ' + p.room; }
  else if (split === 'unit') { const u = unitOf(p, s.settings); key = u === '—' ? '~' : u; label = u === '—' ? 'ΧΩΡΙΣ ΟΥΛΑΜΟ' : 'ΟΥΛΑΜΟΣ ' + u; short = u === '—' ? 'ΧΩΡΙΣ ΟΥΛ' : u; }
  else { const si = (p.si || '').trim(); key = si || '~'; label = si || 'ΧΩΡΙΣ Σ.Ι.'; short = si || 'ΧΩΡΙΣ ΣΙ'; }
  return { key, label: label.toUpperCase(), short: short.toUpperCase() };
}
export const byGroup = (a: { key: string }, b: { key: string }) => Number(a.key === '~') - Number(b.key === '~') || collator.compare(a.key, b.key);   // «χωρίς» στο τέλος
export function groupsOf(s: Pick<AppState, 'settings'>, kind: RepKind, rows: Row[], split: RepSplit | undefined): RepGroup[] {
  if (!split || split === 'none' || kind === 'cadre') return [{ key: '', label: '', short: '', rows }];
  const by = new Map<string, RepGroup>();
  for (const x of rows) {
    const k = groupOf(s, x, split);
    const g = by.get(k.key); if (g) g.rows.push(x); else by.set(k.key, { ...k, rows: [x] });
  }
  return [...by.values()].sort(byGroup);
}
// Τι θα γίνει όταν πατηθεί «Βγάλε», σε απλά λόγια (οδηγός, «Βγάλε…»): πόσα φύλλα/σελίδες, ποια, πού
export const repFileName = (r: Pick<Report, 'name'>, d: ISODate) => upper(r.name || 'ΕΝΤΥΠΟ').replace(/[\\/:*?"<>|]/g, '-').trim() + ' ' + d.split('-').reverse().join('-') + '.xlsx';
const baseName = (f?: string) => (f || '').split(/[\\/]/).pop() || '';
export const SPLIT_NOUN: Record<RepSplit, [string, string]> = { none: ['', ''], room: ['θάλαμο', 'θαλάμους'], unit: ['ουλαμό', 'ουλαμούς'], si: ['Σ.Ι.', 'Σ.Ι.'] };
export function outPlan(s: Pick<AppState, 'settings'>, r: Report, rows: Row[], d: ISODate): { groups: RepGroup[]; text: string } {
  const split = r.kind !== 'cadre' && !!r.split && r.split !== 'none';
  const groups = split ? groupsOf(s, r.kind, rows, r.split) : [];
  const gl = (f: (g: RepGroup) => string) => groups.slice(0, 6).map(g => f(g) + ' (' + g.rows.length + ')').join(', ') + (groups.length > 6 ? ' κ.ά.' : '');
  const one = SPLIT_NOUN[r.split || 'none'][0];
  const file = repFileName(r, d);
  const parts = (page: boolean) => (groups.length === 1 ? (page ? '1 σελίδα' : '1 φύλλο') : groups.length + (page ? ' σελίδες' : ' φύλλα')) + (page ? ', μία' : ', ένα') + ' για κάθε ' + one + (groups.length ? ': ' + gl(g => g.short) : '');
  let text: string;
  if (r.out === 'print') text = 'Ανοίγει η προεπισκόπηση εκτύπωσης' + (split ? ' με ' + parts(true) : '') + '. Το αρχείο «' + file + '» μένει και στον φάκελο των Excel.';
  else if (r.out === 'sheet') {
    const t = r.target || { to: 'people', sheet: '' };
    const where = t.to === 'file' ? baseName(t.file) : baseName(s.settings.sources?.people?.file) || 'Δυναμολόγιο';
    const base = upper(t.sheet || r.name || 'ΕΝΤΥΠΟ').trim();
    text = (split ? 'Γράφονται ' + parts(false) + ', μέσα στο ' + where : 'Γράφεται το φύλλο «' + base.slice(0, 31) + '» μέσα στο ' + where) + '. Τα άλλα φύλλα του αρχείου δεν αλλάζουν.';
  } else text = 'Φτιάχνεται το αρχείο «' + file + '» στον φάκελο των Excel' + (split ? ', με ' + parts(false) : '') + ', και ανοίγει.';
  return { groups, text };
}
// Σειρά στο έντυπο
export function sortRows<T extends Row>(rows: T[], sort: RepSort, s: AppState, kind: RepKind): T[] {
  if (sort === 'pick' || (sort === 'seat' && kind === 'duty')) return rows;
  if (sort === 'from' && kind === 'wmove') return [...rows].sort((a, b) => byOut((a as MoveRow).m, (b as MoveRow).m));
  if (sort === 'from' && kind === 'status') return [...rows].sort((a, b) => ((a as StatusRow).st.from < (b as StatusRow).st.from ? -1 : (a as StatusRow).st.from > (b as StatusRow).st.from ? 1 : collator.compare(a.last, b.last)));
  if (kind === 'cadre') { if (sort !== 'rank') return [...rows].sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first)); const ord = orderedCadre(s.cadreList || []).map(c => c.id); return [...rows].sort((a, b) => ord.indexOf(a.id as string) - ord.indexOf(b.id as string)); }
  const byName = (a: Row, b: Row) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);
  if (sort === 'room') return [...rows].sort((a, b) => ((a as Person).room ?? 99) - ((b as Person).room ?? 99) || byName(a, b));
  if (sort === 'rank') { const rk = listOf(s.settings.lists, 'soldierRanks'); const ix = (r: string) => { const i = rk.indexOf(r); return i < 0 ? -1 : i; }; return [...rows].sort((a, b) => ix(b.rank) - ix(a.rank) || byName(a, b)); }
  return [...rows].sort(byName);
}
// Τα άτομα του εντύπου, χωρίς τυχαία επιλογή (αυτή γίνεται στην οθόνη, για να βγει ό,τι είδες)
// Στρατιώτες που διαλέγεις με το όνομα: μόνο στα έντυπα με μία γραμμή ανά στρατιώτη
export const manualKind = (k: RepKind) => k === 'people' || k === 'weapon';
// «Πάντα μέσα»: μπαίνουν ό,τι κι αν λένε τα φίλτρα (όχι όσοι είναι και στο «Ποτέ»)
export function alwaysOf(s: AppState, r: Pick<Report, 'kind' | 'pick'>): Person[] {
  if (!manualKind(r.kind) || !r.pick.always?.length) return [];
  const pm = personMap(s.people); const nv = new Set(r.pick.never || []);
  return r.pick.always.map(id => pm.get(id)).filter((p): p is Person => !!p && !nv.has(p.id));
}
// Κλήρωση: οι «πάντα μέσα» και τυχαίοι μέχρι να γίνουν n
export function drawRows(always: Row[], pool: Row[], n: number, even = false, rnd: () => number = Math.random, times?: Record<string, number>): Row[] {
  const ids = new Set(always.map(x => x.id));
  return [...always, ...pickRandom(pool.filter(x => !ids.has(x.id)), Math.max(0, n - always.length), even, rnd, times)];
}
// Όταν αλλάζουν τα φίλτρα ή το πόσοι, η κλήρωση κρατά όσους περνούν ακόμα και συμπληρώνει (ή κόβει) μέχρι n
export function refillDraw(prev: Row[], always: Row[], pool: Row[], n: number, even = false, rnd: () => number = Math.random, times?: Record<string, number>): Row[] {
  const by = new Map(pool.map(x => [x.id, x])); const aIds = new Set(always.map(x => x.id));
  const kept = [...always, ...prev.filter(x => !aIds.has(x.id) && by.has(x.id)).map(x => by.get(x.id)!)].slice(0, Math.max(n, always.length));
  const used = new Set(kept.map(x => x.id));
  return [...kept, ...pickRandom(pool.filter(x => !used.has(x.id)), Math.max(0, n - kept.length), even, rnd, times)];
}
// Όσοι βγήκαν σε αυτό το έντυπο τις gap μέρες πριν από τη d (το Ιστορικό κρατά ποιοι και για ποια μέρα)
export function recentIds(hist: { date: ISODate; ids: (number | string)[] }[], d: ISODate, gap: number): Set<number | string> {
  const from = addDays(d, -Math.max(0, gap)); const out = new Set<number | string>();
  for (const h of hist) if (h.date < d && h.date >= from) h.ids.forEach(i => out.add(i));
  return out;
}
export function rowsOf(s: AppState, r: Pick<Report, 'kind' | 'pick' | 'sort'>, d: ISODate): Row[] {
  const a = alwaysOf(s, r); const aIds = new Set(a.map(p => p.id));
  const c = [...a, ...candidates(s, r, d).filter(x => !aIds.has(x.id as number))];
  const n = r.pick.mode === 'all' ? c.length : Math.max(0, r.pick.n || 0);
  return sortRows(r.pick.mode === 'first' ? c.slice(0, n) : c, r.sort, s, r.kind);
}
export const byIds = (s: AppState, kind: RepKind, ids: (number | string)[], d?: ISODate): Row[] => {
  if (kind === 'duty') {
    const pm = seatMap(s); const g = (d && s.guards[d]) || {};
    return ids.map(k => { const po = postBy(s, String(k)); return po ? dutyRow(pm, po, g[po.k]) : null; }).filter((x): x is DutyRow => !!x);
  }
  if (kind === 'wmove') {
    const pm = seatMap(s);
    return ids.map(id => { const m = moveById(s, id as string); const p = m && pm.get(m.pid); return m && p ? { ...p, id: m.id, pid: p.id, p, m } as MoveRow : null; }).filter((x): x is MoveRow => !!x);
  }
  if (kind === 'status') {
    const pm = personMap(s.people); const sm = new Map(s.statuses.map(x => [x.id, x]));
    return ids.map(id => { const st = sm.get(id as string); const p = st && pm.get(st.pid); return st && p ? { ...p, id: st.id, pid: p.id, st, p } as StatusRow : null; }).filter((x): x is StatusRow => !!x);
  }
  if (kind === 'cadre') { const m = new Map((s.cadreList || []).map(c => [c.id, c])); return ids.map(id => m.get(id as string)).filter((x): x is Cadre => !!x); }
  const pm = personMap(s.people); return ids.map(id => pm.get(id as number)).filter((x): x is Person => !!x);
};

// Σύνοψη για τη λίστα των εντύπων: «57 τυχαίοι από τους παρόντες»
export function pickText(r: Pick<Report, 'kind' | 'pick'>, s: Pick<AppState, 'settings'>): string {
  const pk = r.pick; const who = r.kind === 'cadre' ? 'στελέχη' : r.kind === 'status' ? 'καταστάσεις' : 'στρατιώτες';
  if (r.kind === 'status') {
    const cats = (pk.cats?.length ? pk.cats : DEF_CATS).map(c => ST_CATS.find(x => x.id === c)?.label.toLowerCase()).join(', ');
    const lead = pk.mode === 'random' ? (pk.n || 0) + ' τυχαίες' : pk.mode === 'first' ? 'Οι πρώτες ' + (pk.n || 0) : 'Όλες';
    return lead + ' (' + cats + ') ' + (pk.when === 'from' ? 'από τη μέρα και μετά' : 'που ισχύουν τη μέρα');
  }
  const rest = [pk.view && 'λίστα «' + ((s.settings.views || []).find(v => v.id === pk.view)?.name || '') + '»', pk.si?.length && 'Σ.Ι. ' + pk.si.join(', '), pk.rooms?.length && (pk.rooms.length === 1 ? 'θάλαμος ' : 'θάλαμοι ') + pk.rooms.join(', ')].filter(Boolean).join(', ');
  const tail = rest ? ' (' + rest + ')' : '';
  if (r.kind === 'duty') {
    const bl = pk.blocks?.length ? pk.blocks.map(id => everyBlock(s.settings).find(b => b.id === id)?.name).filter(Boolean).join(', ') : '';
    return (bl ? 'Θέσεις: ' + bl : 'Όλες οι θέσεις υπηρεσίας') + (pk.empty ? ', και οι κενές' : '') + tail;
  }
  if (r.kind === 'wmove') return (pk.open ? 'Τα όπλα που είναι ακόμα έξω' : 'Οι κινήσεις όπλων της μέρας') + tail;
  if (r.kind === 'weapon') {
    const wf = WEAPON_FILTERS.find(x => x[0] === (pk.wf || 'with'));
    return (pk.mode === 'random' ? (pk.n || 0) + ' τυχαίοι: ' : '') + 'Οπλισμός, ' + (wf ? wf[1].toLowerCase() : '') + tail;
  }
  const cadre = r.kind === 'cadre';
  const { need, not } = cadre ? { need: [] as RepCond[], not: [] as RepCond[] } : condsOf(pk);
  const pres = cadre ? pk.from === 'present' : need.includes('present');
  const from = pk.from === 'inactive' ? 'τους εκτός δύναμης' : pres ? (cadre ? 'τα παρόντα στελέχη' : 'τους παρόντες') : cadre ? 'όλα τα στελέχη' : 'όλους';
  const view = pk.view ? (s.settings.views || []).find(v => v.id === pk.view)?.name : '';
  const word = (c: RepCond, yes: boolean) => { const x = REP_CONDS.find(k => k.id === c)!; return (yes ? x.yes : x.no).toLowerCase(); };
  const man = manualKind(r.kind);
  const extra = [view && 'λίστα «' + view + '»', ...need.filter(c => c !== 'present').map(c => word(c, true)), pk.si?.length && 'Σ.Ι. ' + pk.si.join(', '), pk.rooms?.length && (pk.rooms.length === 1 ? 'θάλαμος ' : 'θάλαμοι ') + pk.rooms.join(', '), ...not.map(c => word(c, false)),
    pk.mode === 'random' && pk.gap ? 'όχι όσοι βγήκαν τις τελευταίες ' + (pk.gap === 1 ? 'μία μέρα' : pk.gap + ' μέρες') : '',
    man && pk.always?.length ? pk.always.length + ' πάντα μέσα' : '', man && pk.never?.length ? pk.never.length + ' ποτέ' : ''].filter(Boolean).join(', ');
  const head = pk.mode === 'random' ? (pk.n || 0) + ' τυχαίοι από ' + from + (pk.even ? ', ισομερώς ανά θάλαμο' : '') + (pk.fair ? ', πρώτα όσοι βγήκαν λιγότερο' : '') : pk.mode === 'first' ? 'Οι πρώτοι ' + (pk.n || 0) + ' από ' + from : (from === 'όλους' || from === 'όλα τα στελέχη' ? 'Όλοι οι ' + who : 'Όλοι από ' + from);
  return head + (extra ? ' (' + extra + ')' : '');
}
// Σειρές ανά είδος (οι «Ημερομηνία» μόνο στις καταστάσεις και στις κινήσεις όπλων, η «Σειρά ΦΡΟΥΡΑΣ» μόνο στις υπηρεσίες)
const SORTS: { value: RepSort; label: string }[] = [{ value: 'seat', label: 'Σειρά ΦΡΟΥΡΑΣ' }, { value: 'name', label: 'Αλφαβητικά' }, { value: 'room', label: 'Θάλαμος' }, { value: 'rank', label: 'Βαθμός' }, { value: 'from', label: 'Ημερομηνία' }, { value: 'pick', label: 'Όπως βγήκαν' }];
export const sortsOf = (kind: RepKind) => SORTS.filter(s => (kind !== 'cadre' || s.value !== 'room') && ((kind === 'status' || kind === 'wmove') || s.value !== 'from') && (kind === 'duty' || s.value !== 'seat')
  && !((kind === 'duty' || kind === 'wmove') && s.value === 'pick')).map(s => (kind === 'wmove' && s.value === 'from' ? { ...s, label: 'Ώρα εξόδου' } : s));
// Άλλαξε «Τι αφορά»: κάθε είδος κρατά μόνο τα δικά του φίλτρα· θάλαμοι, Σ.Ι. και λίστα μένουν σε όσα έχουν στρατιώτες
export function pickForKind(from: RepKind, pk: RepPick, sort: RepSort, kind: RepKind): { pick: RepPick; sort: RepSort } {
  const { cats, when, blocks, empty, wf, open, ...rest } = pk;
  const base = { ...rest, from: 'all' as const, noDuty: false };
  const pick: RepPick = kind === 'cadre' ? { from: pk.from === 'present' ? 'present' : 'all', mode: pk.mode, n: pk.n }
    : kind === 'status' ? { ...base, cats: cats || ['med', 'pun', 'abs'], when: when || 'on' }
    : kind === 'duty' ? { ...base, mode: 'all', blocks, empty } : kind === 'wmove' ? { ...base, mode: 'all', open }
    : kind === 'weapon' ? { ...rest, from: isLinked(from) ? 'all' : rest.from, wf: wf || 'with' } : { ...rest, from: isLinked(from) ? 'all' : rest.from };
  const so: RepSort = kind === 'duty' ? 'seat' : kind === 'wmove' ? 'from' : sortsOf(kind).some(x => x.value === sort) ? sort : kind === 'cadre' ? 'rank' : 'name';
  return { pick, sort: so };
}
// Νέος πίνακας 2, 3…: όλοι, χωρίς φίλτρα, με τη σειρά που ταιριάζει στο είδος
export function newTable(kind: RepKind, id: string): RepTable {
  const x = pickForKind('people', defaultPick(), 'name', kind);
  return { id, kind, head: 1, cols: [], pick: x.pick, sort: x.sort };
}
// Οι πίνακες 2, 3… χωρίς τυχαίους: η κλήρωση είναι μόνο του πρώτου
export const subPick = (pk: RepPick): RepPick => (pk.mode === 'random' ? { ...pk, mode: 'all', even: undefined, fair: undefined, gap: undefined } : pk);
// Μετά το «Φτιάξ' το εδώ»: πού κατέληξαν οι πίνακες στο πρότυπο, μαζί με ό,τι διάλεξες για τον καθένα (ποιοι, σειρά)
export interface BuiltOut { sheet: string; head: number; cols: RepCol[]; cells: RepCell[]; more?: { id: string; head: number; cols: RepCol[] }[]; fixed?: boolean; vals?: ({ id: string } & Spot)[] }
// Το BuildOpts όπως το χρειάζεται το buildTemplate: με τις θέσεις των πινάκων και τους πίνακες τιμών του εντύπου, αλλά μόνο όταν η διάταξη δεν είναι
// η προεπιλεγμένη (ο ένας κάτω από τον άλλον)· αλλιώς το ίδιο αντικείμενο, άρα το ίδιο πρότυπο όπως πριν τη Φάση 3
export function forBuild(o: BuildOpts, r: Pick<Report, 'bands' | 'vals'>): BuildOpts {
  if (o.nopeople && !(o.more || []).length) return o;
  const vs = valsUsed(r.vals); const ids = [MAIN, ...(o.more || []).map(t => t.id), ...vs.map(v => v.id)];
  const bands = bandsOf(ids, r.bands); if (isDefault(ids, bands)) return o;
  return { ...o, bands, vals: vs.map(v => ({ id: v.id, title: (v.title || '').trim(), ...(v.lay ? { lay: v.lay } : {}) })) };
}
export function withBuilt(r: Report, b: BuiltOut, o: BuildOpts): Report {
  const more = (o.more || []).map(t => {
    const prev = r.more?.find(x => x.id === t.id); const got = b.more?.find(x => x.id === t.id);
    const base = !prev ? newTable(t.kind, t.id) : prev.kind === t.kind ? prev : { ...prev, ...pickForKind(prev.kind, prev.pick, prev.sort, t.kind) };
    const { nohead: _h, ...b0 } = base;
    return { ...b0, title: t.title, kind: t.kind, head: got?.head ?? base.head, cols: got?.cols || [], ...(t.nohead ? { nohead: true } : {}) };
  });
  const { more: _, fixed: _f, nohead: _n, ...rest } = r;
  // πίνακες τιμών: η θέση που τους άφησε το πρότυπο (δεν υπάρχει όταν η διάταξη είναι η προεπιλεγμένη: γράφονται στο τέλος, όπως πριν)
  const vals = r.vals?.map(v => { const { spot: _s, ...w } = v; const p = b.vals?.find(x => x.id === v.id); return p ? { ...w, spot: { c1: p.c1, c2: p.c2, ...(p.row != null ? { row: p.row } : {}) } } : w; });
  return { ...rest, ...(vals ? { vals } : {}), sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, ...(more.length ? { more } : {}), ...(b.fixed ? { fixed: true } : {}), ...(o.nohead && !o.nopeople ? { nohead: true } : {}), ...(o.sig === 'none' && !r.sigs ? { sigs: [] } : {}) };
}
// «Υπογραφές: Καμία» στο «Φτιάξ' το εδώ» (Michael, 29/10: «οι υπογραφές δεν φεύγουν»): το πρότυπο δεν έχει γραμμή υπογραφών, και χωρίς
// sigs το έντυπο έπαιρνε κάτω από τον πίνακα τις υπογραφές των Ρυθμίσεων (όταν τις έχεις αλλάξει εκεί). Τώρα «Καμία» = καμία (withBuilt
// βάζει sigs: [])· τα έντυπα που αποθηκεύτηκαν πριν διορθώνονται εδώ όταν βγαίνουν (edited: το πρότυπο άλλαξε μετά στο Excel, μένει όπως ήταν)
export function sigsNone(r: Report, tpls: RepTpl[] | undefined, edited = false): Report {
  if (r.sigs || edited) return r;
  return tpls?.find(t => t.id === r.tpl)?.built?.sig === 'none' ? { ...r, sigs: [] } : r;
}
// Οι γραμμές των πινάκων 2, 3… (όλες ή οι πρώτες Ν, με τη σειρά τους)
export const moreRows = (s: AppState, r: Pick<Report, 'more'>, d: ISODate): Row[][] => (r.more || []).map(t => rowsOf(s, { ...t, pick: subPick(t.pick) }, d));
export const roomList = (s: Pick<AppState, 'settings'>) => Array.from({ length: roomCfg(s.settings).n }, (_, i) => i + 1);
