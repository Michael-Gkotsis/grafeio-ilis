import type { ISODate } from './dates';

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
}

export const fullName = (p: Person) => p.last + ' ' + p.first;
export const shortName = (p: Person) => p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '');
// Ουλαμός από θάλαμο (Κ-18): 1–4 → 1ος, 5–8 → 2ος
export const unitOf = (p: Person) => (p.room == null ? '—' : p.room <= 4 ? '1ος Ουλ.' : '2ος Ουλ.');
export const roomTxt = (p: Person) => (p.room == null ? '—' : 'Θ' + p.room);

// ---------------------------------------------------------------------------
// Καταστάσεις (με διάστημα ημερομηνιών). Οι σημαίες ΕΙΝΑΙ ο πίνακας κανόνων του λοχία (10 §2).
// away: απών · noDuty: καμία υπηρεσία · noArmed: όχι ένοπλη θέση · noOut: δεν βγαίνει έξοδο
// ---------------------------------------------------------------------------
export type TypeKey = 'EY' | 'EA' | 'EO' | 'NOS' | 'STEP' | 'PUN' | 'LEAVE' | 'SICK' | 'OUT' | 'DN';
export type Cat = 'med' | 'abs' | 'out' | 'other' | 'pun';
export interface TypeDef {
  label: string; long: string; tone: string; cat: Cat;
  away?: boolean; noDuty?: boolean; noArmed?: boolean; noOut?: boolean;
  hkai?: string;   // στήλη της ΗΚΑΙ
  code?: string;   // κωδικός στο ημερολόγιο κωλυομένων-απόντων
}
export const TYPES: Record<TypeKey, TypeDef> = {
  EY:    { label: 'ΕΥ', long: 'Ελεύθερος Υπηρεσίας', tone: 'ey', cat: 'med', noDuty: true, noOut: true, hkai: 'ey', code: 'Ε.Υ' },
  EA:    { label: 'ΕΑ', long: 'Ελεύθερος Ασκήσεων', tone: 'ey', cat: 'med', noArmed: true, code: 'Ε.Α' },
  EO:    { label: 'ΕΟ', long: 'Ελεύθερος Ορθοστασίας', tone: 'ey', cat: 'med', noArmed: true },
  NOS:   { label: 'ΝΟΣ', long: 'Νοσοκομείο', tone: 'bad', cat: 'med', away: true, noDuty: true, noOut: true, hkai: 'nos' },
  STEP:  { label: 'ΣΤΕΠ', long: 'Εισαγωγή ΣΤΕΠ', tone: 'ey', cat: 'other', noArmed: true, noOut: true },
  PUN:   { label: 'Ποινή', long: 'Τιμωρημένος', tone: 'bad', cat: 'pun', noOut: true, hkai: 'tim' },
  LEAVE: { label: 'Άδεια', long: 'Κανονική άδεια', tone: 'info', cat: 'abs', away: true, noDuty: true, noOut: true, hkai: 'ka', code: 'Κ.Α' },
  SICK:  { label: 'Αναρρωτική', long: 'Αναρρωτική άδεια', tone: 'bad', cat: 'abs', away: true, noDuty: true, noOut: true, hkai: 'an', code: 'ΑΝ.ΑΔ' },
  OUT:   { label: 'Εξοδούχος', long: 'Εξοδούχος', tone: 'warn', cat: 'out', away: true, noDuty: true },
  DN:    { label: 'ΔΝ', long: 'Εξοδούχος με ΔΝ', tone: 'dn', cat: 'out', away: true, noDuty: true }
};
export const TYPE_KEYS = Object.keys(TYPES) as TypeKey[];
export const effects = (t: TypeDef) =>
  [t.away && 'Απών', t.noDuty ? 'Καμία υπηρεσία' : t.noArmed && 'Όχι σε ένοπλη θέση', t.noOut && 'Δεν βγαίνει έξοδο'].filter(Boolean).join(' · ');
export const typeTip = (t: TypeDef) => t.long + (effects(t) ? ': ' + effects(t) : '');
export const RECORD_CATS: Cat[] = ['med', 'other', 'pun'];
export const PUN_KINDS = ['Περιορισμός', 'Κράτηση', 'Φυλάκιση', 'Στέρηση εξόδου'];
export const LEAVE_KINDS = ['Κανονική', 'Τιμητική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ'];

export interface Status {
  id: string;
  pid: number;
  type: TypeKey;
  from: ISODate;
  to: ISODate;
  kind?: string;      // είδος ποινής / άδειας / ΕΑ-ΕΥ
  note?: string;
  pending?: boolean;  // ποινή που αιτείται στην ΗΚΑΙ (Κ-19)
}

// ---------------------------------------------------------------------------
// Υπηρεσίες: μπλοκ θέσεων, όπως στο template (ρυθμίσιμα)
// ---------------------------------------------------------------------------
export type DutyKind = 'ly' | 'th' | 'op' | 'sk' | 'mg' | 'tae';
export const KIND_LBL: Record<DutyKind, string> = { ly: 'Λ/Υ', th: 'Θαλ.', op: 'Οπλ.', sk: 'Σκοπ.', mg: 'Μαγ.', tae: 'ΤΑΕ' };
export const KIND_NAME: Record<DutyKind, string> = { ly: 'Λ/Υ - Δ/Υ', th: 'Θαλαμοφύλακας', op: 'Οπλοφύλακας', sk: 'Σκοπιά', mg: 'Μαγειρεία', tae: 'ΤΑΕ' };
// Κωδικός στον έλεγχο υπηρεσιών (δείγμα 03) και στο ημερολόγιο κωλυομένων (δείγμα 14)
export const KIND_CODE: Record<DutyKind, string> = { ly: 'ΛΥ', th: 'Θ', op: 'ΟΠ', sk: 'Σ', mg: 'Μ', tae: 'Τ' };
// Είδη που ρυθμίζονται ανά άτομο στη «Δυνατότητα υπηρεσιών» (δείγμα 02)
export const CAP_KINDS: [DutyKind, string][] = [['th', 'Θαλαμοφύλακας'], ['op', 'Οπλοφύλακας'], ['mg', 'Μαγειρεία'], ['sk', 'Σκοπιά']];
export const CAP_ACC: Partial<Record<DutyKind, string>> = { th: 'θαλαμοφύλακα', op: 'οπλοφύλακα', mg: 'μαγειρεία', sk: 'σκοπιά' };

// Βάρδιες 2 ωρών, κύκλος 14:00 → 14:00 (δείγμα «ΦΡΟΥΡΑ»)
export const ROT = [
  ['14:00-16:00', '22:00-00:00', '06:00-08:00'],
  ['16:00-18:00', '00:00-02:00', '08:00-10:00'],
  ['18:00-20:00', '02:00-04:00', '10:00-12:00'],
  ['20:00-22:00', '04:00-06:00', '12:00-14:00']
];

export interface PostDef { k: string; label: string; short: string; rot?: number | null; hrs?: string }
export interface BlockDef { id: string; kind: DutyKind; name: string; armed: boolean; posts: PostDef[] }
export interface Post extends PostDef { block: string; kind: DutyKind; armed: boolean; slots: string[] | null; hours: string }

// Προεπιλογή = το πραγματικό έντυπο «ΦΡΟΥΡΑ ΣΒΕΝ» (δείγμα 01): Λ/Υ, Δ/Υ, 2 μπλοκ θαλαμοφυλάκων 4×3, μαγειρεία ×5.
// Ποιες θέσεις είναι ένοπλες θέλει επιβεβαίωση από τον λοχία: ρυθμίζεται.
export const DEFAULT_BLOCKS: BlockDef[] = [
  { id: 'ly', kind: 'ly', name: 'Λ/Υ και Δ/Υ', armed: false, posts: [{ k: 'ly', label: 'Λ/Υ', short: 'Λ/Υ', hrs: '14:00 → 14:00' }, { k: 'dy', label: 'Δ/Υ', short: 'Δ/Υ', hrs: '14:00 → 14:00' }] },
  { id: 'th', kind: 'th', name: 'Θαλαμοφύλακες (α΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 1), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (α΄)', short: (i + 1) + 'ος', rot: i })) },
  { id: 'th2', kind: 'th', name: 'Θαλαμοφύλακες (β΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 5), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (β΄)', short: (i + 1) + 'ος', rot: i })) },
  { id: 'mg', kind: 'mg', name: 'Μαγειρεία', armed: false, posts: [1, 2, 3, 4, 5].map(i => ({ k: 'mg' + i, label: 'Μαγειρεία ' + i + 'ος', short: i + 'ος', hrs: 'ημέρα' })) }
];

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
  outRooms: Record<number, number[]>;    // Κ-16: ημέρα εβδομάδας → θάλαμοι που βγαίνουν
}
export const DEFAULT_RULES: Rules = { noConsecHol: true, restDays: 1, outRooms: { 6: [1, 2, 3, 4], 0: [5, 6, 7, 8] } };

export interface Settings {
  unit: [string, string, string];        // κεφαλίδα 3 γραμμών
  unitName: string;                      // π.χ. 4ης ΙΛΗΣ
  place: string;                         // Αυλώνας
  blocks: BlockDef[];
  holidays: Record<ISODate, string>;
  cadre: Record<string, number>;         // στελέχη ανά βαθμό για την ΗΚΑΙ
  signers: { sergeant: string; commander: string };
  outputDir: string;                     // φάκελος για τα Excel (κενό = προεπιλογή)
}
export const DEFAULT_SETTINGS: Settings = {
  unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'],
  unitName: '4ης ΙΛΗΣ',
  place: 'Αυλώνας',
  blocks: DEFAULT_BLOCKS,
  holidays: {
    '2026-10-28': '28η Οκτωβρίου', '2026-12-25': 'Χριστούγεννα', '2026-12-26': 'Σύναξη Θεοτόκου',
    '2027-01-01': 'Πρωτοχρονιά', '2027-01-06': 'Θεοφάνεια', '2027-03-15': 'Καθαρά Δευτέρα', '2027-03-25': '25η Μαρτίου',
    '2027-04-30': 'Μεγάλη Παρασκευή', '2027-05-01': 'Πρωτομαγιά', '2027-05-03': 'Δευτέρα του Πάσχα', '2027-06-21': 'Αγίου Πνεύματος', '2027-08-15': 'Δεκαπενταύγουστος'
  },
  cadre: { 'Επίλαρχοι': 0, 'Ίλαρχοι': 0, 'Ανθυπίλαρχοι-Ανθλγοι': 0, 'Ανθυπασπιστές': 0, 'ΔΕΑ': 0, 'Αρχιλοχίες': 0, 'Επιλοχίες': 0 },
  signers: { sergeant: '', commander: '' },
  outputDir: ''
};

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
}

export const emptyState = (): AppState => ({
  people: [], statuses: [], guards: {}, caps: {}, rules: { ...DEFAULT_RULES }, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), printed: {}
});
