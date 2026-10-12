import type { ISODate } from './dates';
import type { FormBinding, FormKind, ListKind, SourceBinding, StatusKind } from './sources';

// ---------------------------------------------------------------------------
// Πρόσωπα
// ---------------------------------------------------------------------------
export interface Person {
  id: number;
  rank: string;          // π.χ. ΣΤΡ, ΔΝΕΑΣ, ΕΠΟΠ ΛΧΙΑΣ
  spec: string;          // Ο/Σ (ειδικότητα): ΠΖ, ΤΘ, ΜΧ…
  last: string;
  first: string;
  father: string;
  asm: string;           // ΑΣΜ
  phone: string;
  room: number | null;   // θάλαμος 1–8
  si: string;            // Σ.Ι.: Ι1, Ι2, Ι3 ΜΕ ΟΠΛΟ, Ι3 ΑΟΠΛΟ, Ι4
  post: string | null;   // πόστο (ΚΨΜ, ΙΑΤΡΟΣ ΣΤΕΠ…)
  role: string | null;   // ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…
  essos: string;         // π.χ. 2026 Γ΄
  attached: boolean;     // προσκολλημένος (όχι τοποθετημένος)
  active: boolean;       // false = εκτός δύναμης
  notes: string;
  dn?: boolean;          // έχει δικαίωμα ΔΝ (μόνιμο, από τον λοχία)
  weapon?: string;       // αριθμός όπλου: γράφεται μόνο δίπλα στον Λ/Υ και τον Δ/Υ στο έντυπο υπηρεσιών
}

// Αρχή των σημειώσεων όσων βγήκαν εκτός δύναμης από φύλλο «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» (όχι με το χέρι)
export const OUT_NOTE = 'Εκτός δύναμης';
export const fullName = (p: Person) => p.last + ' ' + p.first;
export const shortName = (p: Person) => p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '');
// Ουλαμός από θάλαμο (Κ-18): 1–4 → 1ος, 5–8 → 2ος
export const unitOf = (p: Person) => (p.room == null ? '—' : p.room <= 4 ? '1ος Ουλ.' : '2ος Ουλ.');
export const roomTxt = (p: Person) => (p.room == null ? '—' : 'Θ' + p.room);

// ---------------------------------------------------------------------------
// Καταστάσεις (με διάστημα ημερομηνιών). Οι σημαίες ΕΙΝΑΙ ο πίνακας κανόνων του λοχία (10 §2).
// away: απών · noDuty: καμία υπηρεσία · noArmed: όχι ένοπλη θέση · noOut: δεν βγαίνει έξοδο
// light: ΕΟ/ΕΑ (λοχίας, 10/10): όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος
// ---------------------------------------------------------------------------
export type TypeKey = 'EY' | 'EA' | 'EO' | 'NOS' | 'STEP' | 'PUN' | 'LEAVE' | 'HON' | 'SICK' | 'OUT' | 'DN';
export type Cat = 'med' | 'abs' | 'out' | 'other' | 'pun';
export interface TypeDef {
  label: string; long: string; tone: string; cat: Cat;
  away?: boolean; noDuty?: boolean; noArmed?: boolean; noOut?: boolean; light?: boolean;
  hkai?: string;   // στήλη της ΗΚΑΙ
  code?: string;   // κωδικός στο ημερολόγιο κωλυομένων-απόντων
}
export const TYPES: Record<TypeKey, TypeDef> = {
  EY:    { label: 'ΕΥ', long: 'Ελεύθερος Υπηρεσίας', tone: 'ey', cat: 'med', noDuty: true, noOut: true, hkai: 'ey', code: 'Ε.Υ' },
  EA:    { label: 'ΕΑ', long: 'Ελεύθερος Ασκήσεων', tone: 'ey', cat: 'med', noArmed: true, light: true, code: 'Ε.Α' },
  EO:    { label: 'ΕΟ', long: 'Ελεύθερος Ορθοστασίας', tone: 'ey', cat: 'med', noArmed: true, light: true },
  STEP:  { label: 'ΣΤΕΠ', long: 'Εισαγωγή ΣΤΕΠ', tone: 'ey', cat: 'other', noArmed: true, noOut: true },
  NOS:   { label: 'Νοσοκομείο', long: 'Εισαγωγή σε νοσοκομείο', tone: 'bad', cat: 'other', away: true, noDuty: true, noOut: true, hkai: 'nos' },
  PUN:   { label: 'Ποινή', long: 'Τιμωρημένος', tone: 'bad', cat: 'pun', noOut: true, hkai: 'tim' },
  LEAVE: { label: 'ΚΑ', long: 'Κανονική άδεια', tone: 'info', cat: 'abs', away: true, noDuty: true, noOut: true, hkai: 'ka', code: 'Κ.Α' },
  HON:   { label: 'Τιμητική', long: 'Τιμητική άδεια', tone: 'info', cat: 'abs', away: true, noDuty: true, noOut: true, hkai: 'eid' },
  SICK:  { label: 'Αναρρωτική', long: 'Αναρρωτική άδεια', tone: 'bad', cat: 'abs', away: true, noDuty: true, noOut: true, hkai: 'an', code: 'ΑΝ.ΑΔ' },
  OUT:   { label: 'Εξοδούχος', long: 'Εξοδούχος', tone: 'warn', cat: 'out', away: true, noDuty: true },
  DN:    { label: 'ΔΝ', long: 'Εξοδούχος με ΔΝ', tone: 'dn', cat: 'out', away: true, noDuty: true }
};
export const TYPE_KEYS = Object.keys(TYPES) as TypeKey[];
export const effects = (t: TypeDef) =>
  [t.away && 'Απών', t.noDuty ? 'Καμία υπηρεσία' : t.noArmed && 'Όχι σε ένοπλη θέση', !t.noDuty && t.light && 'Όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος', t.noOut && 'Δεν βγαίνει έξοδο'].filter(Boolean).join(' · ');
export const typeTip = (t: TypeDef) => t.long + (effects(t) ? ': ' + effects(t) : '');
export const RECORD_CATS: Cat[] = ['med', 'other', 'pun'];
export const PUN_KINDS = ['Περιορισμός', 'Κράτηση', 'Φυλάκιση', 'Στέρηση εξόδου'];
export const LEAVE_KINDS = ['Κανονική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ'];   // η τιμητική είναι δικός της τύπος (HON)

export interface Status {
  id: string;
  pid: number;
  type: TypeKey;
  from: ISODate;
  to: ISODate;
  kind?: string;      // είδος ποινής / άδειας / ΕΑ-ΕΥ
  note?: string;
  pending?: boolean;  // ποινή που αιτείται στην ΗΚΑΙ (Κ-19)
  by?: string;        // ποινή: ποιος τιμώρησε
  reason?: string;    // ποινή: «διότι …»
  on?: ISODate;       // ποινή: ημερομηνία τιμωρίας (αλλιώς η έναρξη)
}

// ---------------------------------------------------------------------------
// Υπηρεσίες: μπλοκ θέσεων, όπως στο template (ρυθμίσιμα)
// ---------------------------------------------------------------------------
export type DutyKind = 'ly' | 'th' | 'op' | 'sk' | 'mg' | 'tae' | 'other';
export const KIND_LBL: Record<DutyKind, string> = { ly: 'Λ/Υ', th: 'Θαλ.', op: 'Οπλ.', sk: 'Σκοπ.', mg: 'Μαγ.', tae: 'ΤΑΕ', other: 'Άλλη' };
export const KIND_NAME: Record<DutyKind, string> = { ly: 'Λ/Υ - Δ/Υ', th: 'Θαλαμοφύλακας', op: 'Οπλοφύλακας', sk: 'Σκοπιά', mg: 'Μαγειρεία', tae: 'ΤΑΕ', other: 'Άλλη υπηρεσία (π.χ. πύλη)' };
// Κωδικός στον έλεγχο υπηρεσιών (δείγμα 03) και στο ημερολόγιο κωλυομένων (δείγμα 14)
export const KIND_CODE: Record<DutyKind, string> = { ly: 'ΛΥ', th: 'Θ', op: 'ΟΠ', sk: 'Σ', mg: 'Μ', tae: 'Τ', other: 'Υ' };
// Είδη που ρυθμίζονται ανά άτομο στη «Δυνατότητα υπηρεσιών» (δείγμα 02)
export const CAP_KINDS: [DutyKind, string][] = [['th', 'Θαλαμοφύλακας'], ['op', 'Οπλοφύλακας'], ['mg', 'Μαγειρεία'], ['sk', 'Σκοπιά'], ['tae', 'ΤΑΕ'], ['other', 'Άλλες (πύλη κ.λπ.)']];
export const CAP_ACC: Partial<Record<DutyKind, string>> = { th: 'θαλαμοφύλακα', op: 'οπλοφύλακα', mg: 'μαγειρεία', sk: 'σκοπιά', tae: 'ΤΑΕ', other: 'άλλη υπηρεσία' };

// Βάρδιες 2 ωρών, κύκλος 14:00 → 14:00 (δείγμα «ΦΡΟΥΡΑ»)
export const ROT = [
  ['14:00-16:00', '22:00-00:00', '06:00-08:00'],
  ['16:00-18:00', '00:00-02:00', '08:00-10:00'],
  ['18:00-20:00', '02:00-04:00', '10:00-12:00'],
  ['20:00-22:00', '04:00-06:00', '12:00-14:00']
];

export interface PostDef { k: string; label: string; short: string; rot?: number | null; hrs?: string; hidden?: boolean }
export interface BlockDef { id: string; kind: DutyKind; name: string; armed: boolean; posts: PostDef[]; custom?: boolean; hidden?: boolean }
export type Phase = 'sven' | 'spen';
export const PHASE_NAME: Record<Phase, string> = { sven: 'ΣΒΕΝ', spen: 'ΣΠΕΝ' };
export interface Post extends PostDef { block: string; kind: DutyKind; armed: boolean; slots: string[] | null; hours: string }

// Προεπιλογή = το πραγματικό έντυπο «ΦΡΟΥΡΑ ΣΒΕΝ» (δείγμα 01): Λ/Υ, Δ/Υ, 2 μπλοκ θαλαμοφυλάκων 4×3, μαγειρεία ×5.
// Ποιες θέσεις είναι ένοπλες θέλει επιβεβαίωση από τον λοχία: ρυθμίζεται.
export const DEFAULT_BLOCKS: BlockDef[] = [
  { id: 'ly', kind: 'ly', name: 'Λ/Υ και Δ/Υ', armed: false, posts: [{ k: 'ly', label: 'Λ/Υ', short: 'Λ/Υ', hrs: '14:00 → 14:00' }, { k: 'dy', label: 'Δ/Υ', short: 'Δ/Υ', hrs: '14:00 → 14:00' }] },
  { id: 'th', kind: 'th', name: 'Θαλαμοφύλακες (α΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 1), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (α΄)', short: (i + 1) + 'ος', rot: i })) },
  { id: 'th2', kind: 'th', name: 'Θαλαμοφύλακες (β΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 5), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (β΄)', short: (i + 1) + 'ος', rot: i })) },
  { id: 'mg', kind: 'mg', name: 'Μαγειρεία', armed: false, posts: [1, 2, 3, 4, 5].map(i => ({ k: 'mg' + i, label: 'Μαγειρεία ' + i + 'ος', short: i + 'ος', hrs: 'ημέρα' })) }
];
// «ΦΡΟΥΡΑ ΣΠΕΝ» (φωτογραφία του γραφέα, 10/10): θαλαμοφύλακες, οπλοφύλακες, μαγειρεία ×5, ΤΑΕ, σκοποί 3ης και 4ης σκοπιάς σε ζεύγη.
// Οπλοφύλακες και σκοποί είναι προεπιλεγμένα ένοπλοι· αλλάζει στις Ρυθμίσεις.
const skPost = (n: number, ab: string, rot: number): PostDef => ({ k: 'sk' + n + ab, label: 'Σκοπός ' + n + 'ης σκοπιάς (' + (ab === 'a' ? 'α' : 'β') + ')', short: n + 'η ' + (ab === 'a' ? 'α' : 'β'), rot });
export const DEFAULT_BLOCKS_SPEN: BlockDef[] = [
  DEFAULT_BLOCKS[0],
  { id: 'th', kind: 'th', name: 'Θαλαμοφύλακες', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 1), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος', short: (i + 1) + 'ος', rot: i })) },
  { id: 'op', kind: 'op', name: 'Οπλοφύλακες', armed: true, posts: [0, 1, 2, 3].map(i => ({ k: 'op' + (i + 1), label: 'Οπλοφύλακας ' + (i + 1) + 'ος', short: (i + 1) + 'ος', rot: i })) },
  { id: 'sk', kind: 'sk', name: 'Σκοποί', armed: true, posts: [skPost(3, 'a', 2), skPost(3, 'b', 2), skPost(4, 'a', 3), skPost(4, 'b', 3)] },
  DEFAULT_BLOCKS[3],
  // ΤΑΕ: ένοπλη, χωρίς σταθερές ώρες (λοχίας, 10/10)
  { id: 'tae', kind: 'tae', name: 'ΤΑΕ', armed: true, posts: [{ k: 'tae', label: 'ΤΑΕ', short: 'ΤΑΕ', hrs: '' }] }
];
export const blocksOf = (settings: Settings, phase: Phase = settings.phase) => (phase === 'spen' ? settings.blocksSpen : settings.blocks);

export function buildPosts(blocks: BlockDef[]): Post[] {
  return blocks.flatMap(b => b.posts.map(p => ({
    ...p, block: b.id, kind: b.kind, armed: b.armed,
    slots: p.rot != null ? ROT[p.rot] : null,
    hours: p.rot != null ? ROT[p.rot].join(' · ') : (p.hrs || '')
  })));
}
export const postTxt = (x: Post) => x.label + (x.slots ? ' ' + x.slots[0].slice(0, 5) : '');

// ---------------------------------------------------------------------------
// Κατάσταση εφαρμογής
// ---------------------------------------------------------------------------
export type Guards = Record<ISODate, Record<string, number>>;
export type Caps = Record<number, Partial<Record<DutyKind, string | null>>>;

export interface Rules {
  noConsecHol: boolean;                  // Κ-13
  restDays: number;                      // Κ-14
  numRest: number;                       // 3ο/4ο νούμερο: ξανά στο ίδιο νούμερο μετά από τόσες μέρες (0 = όχι)
  outRooms: Record<number, number[]>;    // Κ-16: ημέρα εβδομάδας → θάλαμοι που βγαίνουν
}
export const DEFAULT_RULES: Rules = { noConsecHol: true, restDays: 1, numRest: 3, outRooms: { 6: [1, 2, 3, 4], 0: [5, 6, 7, 8] } };

export interface Settings {
  unit: [string, string, string];        // κεφαλίδα 3 γραμμών
  unitName: string;                      // π.χ. 4ης ΙΛΗΣ
  place: string;                         // Αυλώνας
  blocks: BlockDef[];                    // ΣΒΕΝ
  blocksSpen: BlockDef[];                // ΣΠΕΝ
  phase: Phase;                          // ποιο έντυπο υπηρεσιών ισχύει τώρα
  holidays: Record<ISODate, string>;
  cadre: Record<string, number>;         // στελέχη ανά βαθμό για την ΗΚΑΙ
  signers: { sergeant: string; commander: string };
  outputDir: string;                     // φάκελος για τα Excel (κενό = προεπιλογή)
  fixed: Partial<Record<'ly' | 'dy', number>>; // μόνιμος Λ/Υ και Δ/Υ: μπαίνουν μόνοι τους, εκτός σειράς
  rev: number;                           // έκδοση ρυθμίσεων, για τις αλλαγές προεπιλογών
  views?: SavedView[];                   // αποθηκευμένες λίστες στο Προσωπικό (π.χ. «Θαλαμάρχες»)
  sources?: Partial<Record<ListKind, SourceBinding>>;   // από ποιο Excel/φύλλο/πίνακα διαβάζει κάθε είδος και πού γράφει
  forms?: Partial<Record<FormKind, FormBinding>>;        // ποιο template και ποιος φάκελος για κάθε έντυπο
  newDirs?: Partial<Record<StatusKind, string>>;         // πού φτιάχνονται τα νέα Excel κάθε είδους (κενό = ο γενικός φάκελος)
}
// Αποθηκευμένη λίστα: ουλαμός, θάλαμος, φίλτρο κατάστασης και κείμενο αναζήτησης
export interface SavedView { id: string; name: string; unit: string; room: number | null; filter: string; q: string }
export const DEFAULT_SETTINGS: Settings = {
  unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'],
  unitName: '4ης ΙΛΗΣ',
  place: 'Αυλώνας',
  blocks: DEFAULT_BLOCKS,
  blocksSpen: DEFAULT_BLOCKS_SPEN,
  phase: 'sven',
  holidays: {
    '2026-10-28': '28η Οκτωβρίου', '2026-12-25': 'Χριστούγεννα', '2026-12-26': 'Σύναξη Θεοτόκου',
    '2027-01-01': 'Πρωτοχρονιά', '2027-01-06': 'Θεοφάνεια', '2027-03-15': 'Καθαρά Δευτέρα', '2027-03-25': '25η Μαρτίου',
    '2027-04-30': 'Μεγάλη Παρασκευή', '2027-05-01': 'Πρωτομαγιά', '2027-05-03': 'Δευτέρα του Πάσχα', '2027-06-21': 'Αγίου Πνεύματος', '2027-08-15': 'Δεκαπενταύγουστος'
  },
  cadre: { 'Επίλαρχοι': 0, 'Ίλαρχοι': 0, 'Ανθυπίλαρχοι-Ανθλγοι': 0, 'Ανθυπασπιστές': 0, 'ΔΕΑ': 0, 'Αρχιλοχίες': 0, 'Επιλοχίες': 0 },
  signers: { sergeant: '', commander: '' },
  outputDir: '',
  fixed: {},
  rev: 2
};
// Αλλαγές προεπιλογών σε ρυθμίσεις που έχουν ήδη αποθηκευτεί
export function migrateSettings(st: Settings): Settings {
  if ((st.rev || 0) >= 2) return st;
  // rev 2: η ΤΑΕ είναι ένοπλη και χωρίς ώρες (λοχίας, 10/10)
  const blocksSpen = (st.blocksSpen || DEFAULT_BLOCKS_SPEN).map(b => (b.id === 'tae' ? { ...b, armed: true, posts: b.posts.map(p => ({ ...p, hrs: '' })) } : b));
  return { ...st, blocksSpen, fixed: st.fixed || {}, rev: 2 };
}

export interface AuditEntry {
  id: number;
  at: string;          // ΩΩ:ΛΛ
  day: ISODate;
  text: string;
  files: string[];
  source: 'app' | 'auto' | 'import' | 'excel';
  undoable: boolean;
  undone: boolean;
}

export interface AppState {
  people: Person[];
  statuses: Status[];
  guards: Guards;
  caps: Caps;
  rules: Rules;
  settings: Settings;
  printed: Record<ISODate, string>;
  baseline: Record<number, Baseline>;    // υπηρεσίες πριν από την εφαρμογή (χωρίς ημερομηνία)
  hkaiManual: Record<ISODate, HkaiManual>;
  cadreList: Cadre[];                    // στελέχη με ονόματα (αν είναι κενό, η ΗΚΑΙ παίρνει τους αριθμούς των Ρυθμίσεων)
  cadreAbs: CadreAbs[];                  // απουσίες στελεχών
  requests: PersonRequest[];             // αιτήσεις στρατιωτών (ΗΚΑΙ, 5. ΑΙΤΗΣΕΙΣ)
}
// Αίτηση στρατιώτη για την ΗΚΑΙ: «Ο ΣΤΡ … αιτείται {text}.»
export interface PersonRequest { id: string; pid: number; date: ISODate; text: string }
// Στελέχη (από την εφαρμογή του άλλου γραφέα): ονόματα, θέση, απουσίες, που ταΐζουν και την ΗΚΑΙ
export interface Cadre { id: string; rank: string; hk: string; last: string; first: string; phone?: string; role?: string; active: boolean }
export interface CadreAbs { id: string; cid: string; kind: string; from: ISODate; to: ISODate; note?: string }
// είδος απουσίας στελέχους → στήλη της ΗΚΑΙ (κενό = μόνο στη λίστα)
export const CADRE_ABS: [string, string, string][] = [['ka', 'Κανονική άδεια', 'ka'], ['an', 'Αναρρωτική άδεια', 'an'], ['eid', 'Ειδική άδεια', 'eid'], ['nos', 'Νοσοκομείο', 'nos'], ['fp', 'Φύλλο πορείας', 'fp'], ['ekp', 'Εκπαίδευση', 'ekp'], ['allh', 'Απόσπαση σε άλλη μονάδα', 'allh'], ['other', 'Άλλο (μόνο στη λίστα)', '']];
// Προηγούμενες υπηρεσίες ανά είδος (+ πόσες σε ΣΚ/αργία), γραμμένες με το χέρι
export type Baseline = Partial<Record<DutyKind, number>> & { hol?: number };
// Ό,τι στην ΗΚΑΙ δεν βγαίνει από την εφαρμογή: αριθμοί ανά βαθμό και στήλη, και κείμενα της πίσω σελίδας
export interface HkaiManual { cells: Record<string, Record<string, number>>; text: Record<string, string> }

export const emptyState = (): AppState => ({
  people: [], statuses: [], guards: {}, caps: {}, rules: { ...DEFAULT_RULES }, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), printed: {}, baseline: {}, hkaiManual: {}, cadreList: [], cadreAbs: [], requests: []
});
