// Έντυπα (Michael, 19/10): δικά σου πρότυπα Excel (ανεβασμένα ή φτιαγμένα στην εφαρμογή) που γεμίζουν με στοιχεία της
// εφαρμογής. Πρότυπο = το αρχείο (εμφάνιση)· Έντυπο = πρότυπο + τι αφορά + ποια στήλη παίρνει τι + ποιοι μπαίνουν.
// Εδώ ό,τι είναι κοινό για οθόνη και main: τα στοιχεία, η μαντεψιά από τις επικεφαλίδες, ποιοι μπαίνουν και η τυχαία επιλογή.
import { addDays, daysBetween, dmy, parseD, MON_SHORT, type ISODate } from './dates';
import { collator, norm, normGreek } from './text';
import { TYPES, blocksOf, fullName, unitOf, roomCfg, type AppState, type Cadre, type Person, type Post, type Status, type WeaponMove } from './domain';
import { activePeople, personMap, postBy, postsOf, statusesOn, strengthOf } from './rules';
import { WEAPON_FILTERS, byOut, inOutText, movesOn, weaponInfo, weaponMatch, type WeaponFilter, type WeaponInfo } from './weapons';
import { listOf, statusLbl } from './ranks';
import { cadreStatusOn, dutyOfficers, orderedCadre } from './cadre';
import { currentEsso, essoName } from './esso';
import { rosterMatch, type RosterFilter } from './rosterLists';
import type { Sig } from './sigs';
import type { Moves } from './layout';

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
const COMMON = [F('aa', 'Α/Α (αύξων αριθμός)', 'Α/Α', 5), F('rank', 'Βαθμός', 'ΒΑΘΜΟΣ', 10), F('spec', 'Ο/Σ', 'Ο/Σ', 6)];
// τα στοιχεία του στρατιώτη στα είδη με μία γραμμή ανά κατάσταση, θέση ή όπλο
const SOLDIER = [
  F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'), F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
  F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'), F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'), F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
  F('asm', 'ΑΣΜ', 'ΑΣΜ', 13), F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13), F('room', 'Θάλαμος', 'ΘΑΛ.', 6), F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10), F('si', 'Σ.Ι.', 'Σ.Ι.', 8)];
const TAIL = [F('blank', 'Κενή (π.χ. για υπογραφή)', 'ΥΠΟΓΡΑΦΗ', 18), F('text', 'Σταθερό κείμενο', '', 12)];
export const FIELDS: Record<RepKind, FieldDef[]> = {
  people: [...COMMON,
    F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'), F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
    F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'), F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'), F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
    F('asm', 'ΑΣΜ', 'ΑΣΜ', 13), F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13), F('room', 'Θάλαμος', 'ΘΑΛ.', 6), F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10),
    F('si', 'Σ.Ι.', 'Σ.Ι.', 8), F('post', 'Πόστο', 'ΠΟΣΤΟ', 14), F('role', 'Ρόλος', 'ΡΟΛΟΣ', 14), F('essos', 'ΕΣΣΟ', 'ΕΣΣΟ', 10), F('dn', 'Δικαίωμα ΔΝ', 'ΔΝ', 6),
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11), F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('status', 'Κατάσταση την ημέρα (ΚΑ, ΕΑ, ποινή…)', 'ΚΑΤΑΣΤΑΣΗ', 16), F('duty', 'Υπηρεσία την ημέρα', 'ΥΠΗΡΕΣΙΑ', 16), F('notes', 'Σημειώσεις', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 20, 'left'),
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
    ...SOLDIER, F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12),
    ...TAIL],
  weapon: [...COMMON, ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11), F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('inout', 'Εντός ή εκτός (με τον λόγο)', 'ΕΝΤΟΣ / ΕΚΤΟΣ', 26, 'left'),
    ...TAIL],
  wmove: [...COMMON, ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12), F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12), F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11),
    F('mreason', 'Λόγος εξόδου (ΕΚΠ, βολή…)', 'ΛΟΓΟΣ ΕΞΟΔΟΥ', 16), F('mout', 'Έξοδος (ημερομηνία και ώρα)', 'ΕΞΟΔΟΣ', 17),
    F('minr', 'Λόγος εισόδου', 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ', 16), F('min', 'Είσοδος (ημερομηνία και ώρα)', 'ΕΙΣΟΔΟΣ', 17), F('mnote', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', 22, 'left'),
    ...TAIL]
};
export const fieldOf = (kind: RepKind, k: string) => FIELDS[kind].find(x => x.k === k);

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

export interface RepCol { c: number; f: string; text?: string; h?: string }   // c: στήλη από 1 · h: η επικεφαλίδα όταν αντιστοιχίστηκε (για να ξαναβρεθεί)
export interface RepCell { ref: string; k: string }
export interface RepPick {
  from: 'all' | 'present' | RosterFilter;   // όλοι σε δύναμη, οι παρόντες τη μέρα, ή ένα φίλτρο του Δυναμολογίου
  view?: string;                              // αποθηκευμένη λίστα του Δυναμολογίου (SavedView.id)
  noDuty?: boolean;                           // χωρίς όσους έχουν υπηρεσία τη μέρα ή την επόμενη
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
export type RepSort = 'name' | 'room' | 'rank' | 'pick' | 'from' | 'seat';
export type StCat = 'med' | 'pun' | 'abs' | 'other' | 'out';
export const ST_CATS: { id: StCat; label: string }[] = [{ id: 'med', label: 'Ιατρικά' }, { id: 'pun', label: 'Ποινές' }, { id: 'abs', label: 'Άδειες' }, { id: 'other', label: 'ΣΤΕΠ, νοσοκομείο' }, { id: 'out', label: 'Έξοδοι' }];
const DEF_CATS: StCat[] = ['med', 'pun', 'abs'];
// Πού βγαίνει ως φύλλο: στο Δυναμολόγιο (το αρχείο του, όποιο είναι τη στιγμή που βγαίνει) ή σε άλλο Excel.
// auto: ξαναγράφεται μόνο του μετά από κάθε αλλαγή (όχι για τυχαίους, που θα άλλαζαν κάθε φορά)
export interface RepTarget { to: 'people' | 'file'; file?: string; sheet: string; auto?: boolean }
export type RepSplit = 'none' | 'room' | 'unit' | 'si';
export const SPLITS: { value: RepSplit; label: string }[] = [{ value: 'none', label: 'Ένα φύλλο' }, { value: 'room', label: 'Ανά θάλαμο' }, { value: 'unit', label: 'Ανά ουλαμό' }, { value: 'si', label: 'Ανά Σ.Ι.' }];
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
}
// Πρότυπο: αρχείο στον φάκελο «Πρότυπα εντύπων» (file = όνομα αρχείου)· built: φτιαγμένο στην εφαρμογή με αυτές τις επιλογές
export interface RepTpl { id: string; name: string; file: string; built?: BuildOpts; mtime?: number }
export interface BuildCol { f: string; h: string; w: 'auto' | 'narrow' | 'wide'; text?: string }
// sig: 'list' = οι υπογραφές του εντύπου ή των Ρυθμίσεων (όσες είναι)· 'sgt'/'both': πρότυπα πριν τις 20/10 (λοχίας, διοικητής)
export interface BuildOpts { title: string; cols: BuildCol[]; head: boolean; date: boolean; sig: 'none' | 'list' | 'sgt' | 'both'; land: boolean; sz: 10 | 11 | 12; fill: 'none' | 'gray' | 'olive' }
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
  ['rank', /^ΒΑΘΜΟΣ$|^ΒΑΘ$/], ['spec', /^ΟΣ$|^ΕΙΔΙΚΟΤΗΤΑ$|^ΟΠΛΟΣΩΜΑ$/],
  ['name', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^(ΕΠΩΝΥΜΟ|ΕΠΙΘΕΤΟ)(ΚΑΙ)?ΟΝΟΜΑ$/], ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/], ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$|^ΟΝΠΑΤΡΟΣ$|^ΟΝΟΜΑΠΑΤΡΟΣ$/], ['asm', /^ΑΣΜ$|ΜΗΤΡΩΟΥ$/], ['am', /^ΑΜ$/], ['phone', /ΤΗΛΕΦΩΝΟ|^ΤΗΛ$|ΚΙΝΗΤΟ/],
  ['room', /^ΘΑΛΑΜΟΣ$|^ΘΑΛ$/], ['unit', /^ΟΥΛΑΜΟΣ$|^ΟΥΛ$/], ['si', /^ΣΙ$/], ['post', /^ΠΟΣΤΟ$/], ['role', /^ΡΟΛΟΣ$|^ΘΕΣΗ$/], ['essos', /^ΕΣΣΟ$/],
  ['dn', /^ΔΝ$|ΔΙΚΑΙΩΜΑΔΝ/], ['weapon', /^ΑΡΟΠΛΟΥ$|^ΑΡΙΘΜΟΣΟΠΛΟΥ$|^ΟΠΛΟ$/], ['wtype', /^ΤΥΠΟΣΟΠΛΟΥ$|^ΤΥΠΟΣ$/], ['rack', /ΟΠΛΟΒΑΣΤΟΣ/], ['wpos', /^ΘΕΣΗΟΠΛΟΥ$/],
  ['status', /^ΚΑΤΑΣΤΑΣΗ$/], ['duty', /^ΥΠΗΡΕΣΙΑ$/], ['blank', /^ΥΠΟΓΡΑΦΗ$|^ΥΠΟΓΡ$/],
  ['stype', /^ΕΙΔΟΣ$|^ΚΑΤΑΣΤΑΣΗ$|^ΕΙΔΟΣΑΔΕΙΑΣ$|^ΠΟΙΝΗ$/], ['from', /^ΑΠΟ$|^ΕΝΑΡΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΑΠΟ$/], ['to', /^ΕΩΣ$|^ΜΕΧΡΙ$|^ΛΗΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΕΩΣ$/],
  ['days', /^ΗΜΕΡΕΣ$|^ΗΜΕΡΩΝ$|^ΗΜ$/], ['note', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/], ['by', /ΤΙΜΩΡΗΣΕ|^ΥΠΟ$/], ['reason', /^ΔΙΟΤΙ$|^ΑΙΤΙΟΛΟΓΙΑ$|^ΑΙΤΙΑ$/], ['on', /^ΗΜΤΙΜΩΡΙΑΣ$|^ΗΜΕΡΟΜΗΝΙΑΤΙΜΩΡΙΑΣ$/],
  ['seat', /^ΘΕΣΗ$|^ΘΕΣΗΥΠΗΡΕΣΙΑΣ$/], ['hours', /^ΩΡΕΣ$|^ΩΡΑ$/], ['block', /^ΥΠΗΡΕΣΙΑ$/], ['armed', /^ΕΝΟΠΛΗ$|^ΕΝΟΠΛΟΣ$/], ['code', /^ΚΩΔ$|^ΚΩΔΙΚΟΣ$/],
  ['inout', /^ΕΝΤΟΣΕΚΤΟΣ$|^ΕΝΤΟΣ$|^ΕΚΤΟΣ$/], ['mreason', /^ΛΟΓΟΣΕΞΟΔΟΥ$|^ΛΟΓΟΣ$/], ['mout', /^ΕΞΟΔΟΣ$|^ΩΡΑΕΞΟΔΟΥ$/], ['minr', /^ΛΟΓΟΣΕΙΣΟΔΟΥ$/], ['min', /^ΕΙΣΟΔΟΣ$|^ΩΡΑΕΙΣΟΔΟΥ$/], ['mnote', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/]
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
const blockName = (s: AppState, id: string) => ((blocksOf(s.settings) || s.settings.blocks).find(b => b.id === id) || [...(s.settings.blocks || []), ...(s.settings.blocksSpen || [])].find(b => b.id === id))?.name || '';
// εντός/εκτός για όλους μαζί: μία φορά ανά κατάσταση και μέρα (καλείται για κάθε γραμμή)
let wiMemo: { s: AppState; d: ISODate; info: WeaponInfo } | null = null;
const wInfo = (s: AppState, d: ISODate) => { if (!wiMemo || wiMemo.s !== s || wiMemo.d !== d) wiMemo = { s, d, info: weaponInfo(s, d) }; return wiMemo.info; };
const when = (day?: ISODate, t?: string) => (day ? dmy(day) + (t ? ' ' + t : '') : '');
export function fieldValue(s: AppState, kind: RepKind, x: Row, f: string, i: number, d: ISODate, text?: string): string | number | null {
  if (f === 'aa') return i + 1;
  if (f === 'blank') return null;
  if (f === 'text') return text || null;
  if (kind === 'status') {
    const r = x as StatusRow; const st = r.st;
    switch (f) {
      case 'stype': return statusLbl(st, s.settings.lists); case 'from': return dmy(st.from); case 'to': return st.open ? '' : dmy(st.to);
      case 'days': return st.open ? '' : daysBetween(st.from, st.to); case 'note': return st.note || ''; case 'by': return st.by || ''; case 'reason': return st.reason || '';
      case 'on': return st.type === 'PUN' ? dmy(st.on || st.from) : '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text);
  }
  if (kind === 'duty') {
    const r = x as DutyRow; const po = r.seat;
    switch (f) {
      case 'seat': return po.label; case 'code': return po.code || ''; case 'block': return blockName(s, po.block); case 'hours': return po.hours || '';
      case 'armed': return po.armed ? 'ΝΑΙ' : '';
    }
    return r.p ? fieldValue(s, 'people', r.p, f, i, d, text) : null;
  }
  if (kind === 'wmove') {
    const r = x as MoveRow; const m = r.m;
    switch (f) {
      case 'weapon': return m.weapon || r.p.weapon || ''; case 'mreason': return m.reason; case 'mout': return when(m.outDay, m.outTime);
      case 'minr': return m.inReason || ''; case 'min': return when(m.inDay, m.inTime); case 'mnote': return m.note || '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text);
  }
  if (kind === 'weapon' && f === 'inout') return inOutText(x as Person, wInfo(s, d));
  if (kind === 'cadre') {
    const c = x as Cadre; const nm = [c.last, c.first].filter(Boolean).join(' ');
    switch (f) {
      case 'rank': return c.rank; case 'spec': return c.spec || ''; case 'name': return nm; case 'who': return [c.rank, c.spec ? '(' + c.spec + ')' : '', nm].filter(Boolean).join(' ');
      case 'last': return c.last; case 'first': return c.first; case 'am': return c.am || ''; case 'phone': return c.phone || ''; case 'role': return c.role || '';
      case 'status': return cadreStatusOn(s, c.id, d)?.label || '';
    }
    return null;
  }
  const p = x as Person;
  switch (f) {
    case 'rank': return p.rank; case 'spec': return p.spec; case 'name': return fullName(p);
    case 'who': return [p.rank, p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
    case 'last': return p.last; case 'first': return p.first; case 'father': return p.father; case 'asm': return p.asm; case 'phone': return p.phone;
    case 'room': return p.room; case 'unit': { const u = unitOf(p, s.settings); return u === '—' ? '' : u; }
    case 'si': return p.si; case 'post': return p.post || ''; case 'role': return p.role || ''; case 'essos': return p.essos; case 'dn': return p.dn ? 'ΝΑΙ' : '';
    case 'weapon': return p.weapon || ''; case 'wtype': return p.wtype || ''; case 'rack': return p.rack || ''; case 'wpos': return p.wpos || '';
    case 'status': return statusesOn(s.statuses, p.id, d).map(x => statusLbl(x, s.settings.lists)).join(', ');
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
export const defaultPick = (mode: RepPick['mode'] = 'all'): RepPick => (mode === 'random' ? { from: 'present', noDuty: true, mode, n: 10, even: false } : { from: 'all', mode });
// Όσοι περνούν τα φίλτρα (πριν από «πόσοι»), με τη σειρά του Δυναμολογίου (αλφαβητικά)
export function candidates(s: AppState, r: Pick<Report, 'kind' | 'pick'>, d: ISODate): Row[] {
  const pk = r.pick;
  if (r.kind === 'status') {
    const cats = new Set(pk.cats?.length ? pk.cats : DEF_CATS); const pm = personMap(s.people);
    const people = new Set(candidates(s, { kind: 'people', pick: { ...pk, from: 'all', noDuty: false, mode: 'all' } }, d).map(p => p.id));
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
    const ok = filtered ? soldiersOf(s, pk, d) : null; const pm = personMap(s.people);
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
    const ok = soldiersOf(s, pk, d); const pm = personMap(s.people);
    const out: MoveRow[] = [];
    for (const m of [...movesOn(s.weaponLog, d)].sort(byOut)) {
      if (pk.open && m.inDay && m.inDay <= d) continue;
      const p = pm.get(m.pid); if (p && ok.has(p.id)) out.push({ ...p, id: m.id, pid: p.id, p, m });
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
  let list: Person[] = pk.from === 'all' || pk.from === 'present' ? activePeople(s) : s.people.filter(p => rosterMatch(pk.from as RosterFilter, p, statusesOn(s.statuses, p.id, d)));
  if (pk.from === 'present') { const pres = new Set(strengthOf(s, d).lists.present.map(p => p.id)); list = list.filter(p => pres.has(p.id)); }
  if (view) list = list.filter(p => (view.room == null || p.room === view.room) && (view.unit === 'all' || !view.unit || unitOf(p, s.settings) === view.unit) && (!view.filter || view.filter === 'all' || rosterMatch(view.filter as RosterFilter, p, statusesOn(s.statuses, p.id, d))) && (!view.q || normGreek([p.last, p.first, p.rank, p.post, p.role].join(' ')).includes(normGreek(view.q))));
  if (pk.si?.length) { const si = new Set(pk.si.map(norm)); list = list.filter(p => si.has(norm(p.si))); }
  if (pk.rooms?.length) { const rs = new Set(pk.rooms); list = list.filter(p => p.room != null && rs.has(p.room)); }
  if (pk.noDuty) {
    const busy = new Set<number>([...Object.values(s.guards[d] || {}), ...Object.values(s.guards[addDays(d, 1)] || {})].filter((x): x is number => typeof x === 'number'));
    list = list.filter(p => !busy.has(p.id));
  }
  return [...list].sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
}
export const rowId = (x: Row) => x.id;
// στρατιώτες που περνούν τα φίλτρα του Δυναμολογίου (λίστα, θάλαμοι, Σ.Ι.): για τα είδη με μία γραμμή ανά κατάσταση, θέση, κίνηση
function soldiersOf(s: AppState, pk: RepPick, d: ISODate): Set<number> {
  return new Set(candidates(s, { kind: 'people', pick: { ...pk, from: 'all', noDuty: false, mode: 'all' } }, d).map(p => p.id as number));
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
export function keepDraw(pool: Row[], ids: (number | string)[]): Row[] | null {
  const by = new Map(pool.map(x => [x.id, x])); const got: Row[] = [];
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
export function groupsOf(s: Pick<AppState, 'settings'>, kind: RepKind, rows: Row[], split: RepSplit | undefined): RepGroup[] {
  if (!split || split === 'none' || kind === 'cadre') return [{ key: '', label: '', short: '', rows }];
  const by = new Map<string, RepGroup>();
  for (const x of rows) {
    const p = x as Person; let key: string, label: string, short: string;
    if (split === 'room') { key = p.room == null ? '~' : String(p.room).padStart(3, '0'); label = p.room == null ? 'ΧΩΡΙΣ ΘΑΛΑΜΟ' : 'ΘΑΛΑΜΟΣ ' + p.room; short = p.room == null ? 'ΧΩΡΙΣ ΘΑΛ' : 'Θ' + p.room; }
    else if (split === 'unit') { const u = unitOf(p, s.settings); key = u === '—' ? '~' : u; label = u === '—' ? 'ΧΩΡΙΣ ΟΥΛΑΜΟ' : 'ΟΥΛΑΜΟΣ ' + u; short = u === '—' ? 'ΧΩΡΙΣ ΟΥΛ' : u; }
    else { const si = (p.si || '').trim(); key = si || '~'; label = si || 'ΧΩΡΙΣ Σ.Ι.'; short = si || 'ΧΩΡΙΣ ΣΙ'; }
    const g = by.get(key); if (g) g.rows.push(x); else by.set(key, { key, label: label.toUpperCase(), short: short.toUpperCase(), rows: [x] });
  }
  return [...by.values()].sort((a, b) => Number(a.key === '~') - Number(b.key === '~') || collator.compare(a.key, b.key));   // «χωρίς» στο τέλος
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
export function rowsOf(s: AppState, r: Pick<Report, 'kind' | 'pick' | 'sort'>, d: ISODate): Row[] {
  const c = candidates(s, r, d);
  const n = r.pick.mode === 'all' ? c.length : Math.max(0, r.pick.n || 0);
  return sortRows(r.pick.mode === 'first' ? c.slice(0, n) : c, r.sort, s, r.kind);
}
export const byIds = (s: AppState, kind: RepKind, ids: (number | string)[], d?: ISODate): Row[] => {
  if (kind === 'duty') {
    const pm = personMap(s.people); const g = (d && s.guards[d]) || {};
    return ids.map(k => { const po = postBy(s, String(k)); return po ? dutyRow(pm, po, g[po.k]) : null; }).filter((x): x is DutyRow => !!x);
  }
  if (kind === 'wmove') {
    const pm = personMap(s.people); const mm = new Map((s.weaponLog || []).map(m => [m.id, m]));
    return ids.map(id => { const m = mm.get(id as string); const p = m && pm.get(m.pid); return m && p ? { ...p, id: m.id, pid: p.id, p, m } as MoveRow : null; }).filter((x): x is MoveRow => !!x);
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
    const bl = pk.blocks?.length ? pk.blocks.map(id => [...(s.settings.blocks || []), ...(s.settings.blocksSpen || [])].find(b => b.id === id)?.name).filter(Boolean).join(', ') : '';
    return (bl ? 'Θέσεις: ' + bl : 'Όλες οι θέσεις υπηρεσίας') + (pk.empty ? ', και οι κενές' : '') + tail;
  }
  if (r.kind === 'wmove') return (pk.open ? 'Τα όπλα που είναι ακόμα έξω' : 'Οι κινήσεις όπλων της μέρας') + tail;
  if (r.kind === 'weapon') {
    const wf = WEAPON_FILTERS.find(x => x[0] === (pk.wf || 'with'));
    return (pk.mode === 'random' ? (pk.n || 0) + ' τυχαίοι: ' : '') + 'Οπλισμός, ' + (wf ? wf[1].toLowerCase() : '') + tail;
  }
  const from = pk.from === 'all' ? (r.kind === 'cadre' ? 'όλα τα στελέχη' : 'όλους') : pk.from === 'present' ? 'τους παρόντες' : 'τη λίστα «' + (FROM_NAME[pk.from] || pk.from) + '»';
  const view = pk.view ? (s.settings.views || []).find(v => v.id === pk.view)?.name : '';
  const extra = [view && 'λίστα «' + view + '»', pk.si?.length && 'Σ.Ι. ' + pk.si.join(', '), pk.rooms?.length && (pk.rooms.length === 1 ? 'θάλαμος ' : 'θάλαμοι ') + pk.rooms.join(', '), pk.noDuty && 'χωρίς υπηρεσία'].filter(Boolean).join(', ');
  const head = pk.mode === 'random' ? (pk.n || 0) + ' τυχαίοι από ' + from + (pk.even ? ', ισομερώς ανά θάλαμο' : '') + (pk.fair ? ', πρώτα όσοι βγήκαν λιγότερο' : '') : pk.mode === 'first' ? 'Οι πρώτοι ' + (pk.n || 0) + ' από ' + from : (pk.from === 'all' ? 'Όλοι οι ' + who : 'Όλοι από ' + from);
  return head + (extra ? ' (' + extra + ')' : '');
}
const FROM_NAME: Record<string, string> = { leave: 'Άδειες', pun: 'Τιμωρημένοι', post: 'Πόστα', inactive: 'Εκτός δύναμης', dnright: 'Με δικαίωμα ΔΝ' };
export const roomList = (s: Pick<AppState, 'settings'>) => Array.from({ length: roomCfg(s.settings).n }, (_, i) => i + 1);
