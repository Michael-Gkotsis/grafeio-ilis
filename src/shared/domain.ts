import { greekHolidays, type ISODate } from './dates';
import { normGreek } from './text';
import type { FormBinding, FormKind, ListKind, SourceBinding } from './sources';
import type { UserLists } from './ranks';
import type { Esso } from './esso';

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
  si: string;            // Σ.Ι.: Ι1, Ι2, Ι3 ΜΕ ΟΠΛΟ, Ι3 ΧΩΡΙΣ ΟΠΛΟ (παλιά «Ι3 ΑΟΠΛΟ»), Ι4
  siCat?: string;        // κατηγορία πάθησης για Ι3/Ι4 (ΟΡΘΟΠΑΙΔΙΚΟ…): μόνο στην εφαρμογή, όχι στο Excel (si.ts)
  post: string | null;   // πόστο (ΚΨΜ, ΙΑΤΡΟΣ ΣΤΕΠ…)
  role: string | null;   // ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…
  essos: string;         // π.χ. 2026 Γ΄
  attached: boolean;     // προσκολλημένος (όχι τοποθετημένος)
  active: boolean;       // false = εκτός δύναμης
  notes: string;
  dn?: boolean;          // έχει δικαίωμα ΔΝ (μόνιμο, από τον λοχία)
  weapon?: string;       // αριθμός όπλου: γράφεται μόνο δίπλα στον Λ/Υ και τον Δ/Υ στο έντυπο υπηρεσιών
  wtype?: string;        // τύπος όπλου (G3A3…), από τη λίστα «Τύποι όπλων»: μόνο στην εφαρμογή και στο Excel «Οπλισμός»
  rack?: string;         // θέση στον οπλοβαστό (π.χ. Ε6)
  offDays?: number[];    // μέρες της εβδομάδας χωρίς υπηρεσία (0 = Κυριακή … 6 = Σάββατο), μόνιμα μέχρι να αλλάξουν
  inOn?: ISODate;        // μπήκε στη δύναμη αυτή τη μέρα («Νέος στρατιώτης» ή νέα γραμμή του Δυναμολογίου): 1. ΕΓΓΡΑΦΕΣ της ΗΚΑΙ
  outOn?: ISODate;       // βγήκε εκτός δύναμης αυτή τη μέρα: 2. ΔΙΑΓΡΑΦΕΣ της ΗΚΑΙ (φεύγει αν ξαναμπεί σε δύναμη)
  added?: boolean;       // φτιάχτηκε στην εφαρμογή («Νέος στρατιώτης»): μπαίνει σε νέα γραμμή στο Δυναμολόγιο ως την επόμενη εισαγωγή του
}

// Αρχή των σημειώσεων όσων βγήκαν εκτός δύναμης από φύλλο «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» (όχι με το χέρι)
export const OUT_NOTE = 'Εκτός δύναμης';
// Συνονόματοι (ίδιο επώνυμο και όνομα): όπου η εφαρμογή δείχνει ή γράφει όνομα μπαίνει και «του <πατρώνυμο>»
// (Michael, 13/10). Οι υπόλοιποι μένουν όπως ήταν. Το σύνολο βγαίνει από τα άτομα της τρέχουσας κατάστασης
// (και τα εκτός δύναμης): το ενημερώνουν η personMap, η βάση στο main και η ρίζα του renderer.
const nameKey = (p: { last: string; first: string }) => normGreek(p.last).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(p.first).replace(/[^Α-ΩA-Z0-9]/g, '');
let twinKeys = new Set<string>(); let twinsFrom: Person[] | null = null;
export function noteNamesakes(people: Person[]): void {
  if (people === twinsFrom) return;
  twinsFrom = people; const seen = new Set<string>(); twinKeys = new Set();
  for (const p of people) { const k = nameKey(p); if (seen.has(k)) twinKeys.add(k); else seen.add(k); }
}
export const isNamesake = (p: { last: string; first: string }) => twinKeys.has(nameKey(p));
export const fatherTxt = (p: Person) => (p.father && isNamesake(p) ? ' του ' + p.father : '');
// Χωρίς πατρώνυμο: όπου φαίνεται ήδη δίπλα (στήλη ή «του …» από κάτω)
export const plainName = (p: Person) => p.last + ' ' + p.first;
export const fullName = (p: Person) => plainName(p) + fatherTxt(p);
export const shortName = (p: Person) => p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '') + fatherTxt(p);
// Θάλαμοι και ουλαμοί (Ρυθμίσεις › Θάλαμοι και ουλαμοί, Michael 17/10). Προεπιλογή: 8 θάλαμοι, 4 ανά ουλαμό
// (Κ-18: 1–4 → 1ος, 5–8 → 2ος). Οι ουλαμοί φτιάχνονται από τους δύο αριθμούς· αν άλλαξες ποιοι θάλαμοι ανήκουν
// πού, κρατιέται η δική σου λίστα (platoons) μέχρι να ξαναφτιάξεις τους ουλαμούς.
export interface Platoon { name: string; rooms: number[] }
export interface RoomSettings { n: number; per: number; platoons?: Platoon[] }
export const DEFAULT_ROOMS: RoomSettings = { n: 8, per: 4 };
export function makePlatoons(n: number, per: number): Platoon[] {
  const out: Platoon[] = []; const k = Math.max(1, per);
  for (let r = 1; r <= n; r += k) out.push({ name: (out.length + 1) + 'ος Ουλαμός', rooms: Array.from({ length: Math.min(k, n - r + 1) }, (_, i) => r + i) });
  return out;
}
export const roomCfg = (st?: Pick<Settings, 'rooms'> | null): RoomSettings => st?.rooms || DEFAULT_ROOMS;
export const platoonsOf = (st?: Pick<Settings, 'rooms'> | null): Platoon[] => { const c = roomCfg(st); return c.platoons || makePlatoons(c.n, c.per); };
// «1ος Ουλαμός» → «1ος Ουλ.» (στις λίστες και στα φίλτρα)
export const platoonShort = (name: string) => name.replace(/Ουλαμός$/, 'Ουλ.');
// Ουλαμός από θάλαμο: θάλαμος που δεν ανήκει σε κανέναν ουλαμό → «—»
export const unitOf = (p: Pick<Person, 'room'>, st?: Pick<Settings, 'rooms'> | null) => {
  if (p.room == null) return '—';
  const u = platoonsOf(st).find(x => x.rooms.includes(p.room!));
  return u ? platoonShort(u.name) : '—';
};
// Σειρά των ημερών στην κάρτα: Δευτέρα πρώτη
export const WEEK: number[] = [1, 2, 3, 4, 5, 6, 0];
export const roomTxt = (p: Person) => (p.room == null ? '—' : 'Θ' + p.room);

// ---------------------------------------------------------------------------
// Καταστάσεις (με διάστημα ημερομηνιών). Οι σημαίες ΕΙΝΑΙ ο πίνακας κανόνων του λοχία (10 §2).
// away: απών · noDuty: καμία υπηρεσία · noArmed: όχι ένοπλη θέση · noOut: δεν βγαίνει έξοδο
// light: ΕΟ/ΕΑ (λοχίας, 10/10): όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος
// ---------------------------------------------------------------------------
export type TypeKey = 'EY' | 'EA' | 'EARV' | 'EO' | 'NOS' | 'STEP' | 'PUN' | 'LEAVE' | 'HON' | 'SICK' | 'OUT' | 'DN';
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
  EARV:  { label: 'ΕΑΡΒ', long: 'Ελεύθερος Αρβύλων', tone: 'ey', cat: 'med' },   // χωρίς περιορισμούς σε υπηρεσίες και έξοδο (λοχίας, 12/10)
  EO:    { label: 'ΕΟ', long: 'Ελεύθερος Ορθοστασίας', tone: 'ey', cat: 'med', noArmed: true, light: true },
  STEP:  { label: 'ΣΤΕΠ', long: 'Εισαγωγή ΣΤΕΠ', tone: 'ey', cat: 'other', noDuty: true, noArmed: true, noOut: true },   // εισαγωγή μέσα στο στρατόπεδο: παρών, σε καμία υπηρεσία, όχι έξοδο, όχι στην ΗΚΑΙ (Michael, 13-14/10)
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
  pending?: boolean;  // παλιά: ποινή που αιτούνταν στην ΗΚΑΙ (Κ-19)· πια οι ποινές ισχύουν αμέσως (noPending)
  by?: string;        // ποινή: ποιος τιμώρησε
  reason?: string;    // ποινή: «διότι …»
  on?: ISODate;       // ποινή: ημερομηνία τιμωρίας (αλλιώς η έναρξη)
  open?: boolean;     // χωρίς λήξη: στο Excel το «έως» είναι κενό· το «to» πάει μαζί με τη σημερινή μέρα (X4)
  fromTime?: string;  // άδεια: ώρα αναχώρησης την πρώτη μέρα (ΩΩ:ΛΛ), shared/hours.ts
  toTime?: string;    // άδεια: ώρα επιστροφής την τελευταία μέρα (ΩΩ:ΛΛ)
  req?: string;       // άδεια που εγκρίθηκε από αίτηση της ΗΚΑΙ (PersonRequest.id)
  days?: number;      // στέρηση εξόδου: ημέρες ποινής· το «to» μετακινείται για κάθε μέρα με υπηρεσία ή βραδινή εκπαίδευση (shared/punish.ts)
}
// Οι ποινές ισχύουν αμέσως, χωρίς έγκριση (Michael, 17/10): όσες είχαν μείνει «αιτείται» από παλιότερη έκδοση ισχύουν κι αυτές.
// Τρέχει στο άνοιγμα της βάσης και μετά από κάθε ενέργεια (commands.ts apply).
export function noPending<S extends { statuses: Status[] }>(s: S): S {
  if (!s.statuses.some(x => x.pending)) return s;
  return { ...s, statuses: s.statuses.map(x => { if (!x.pending) return x; const y = { ...x }; delete y.pending; return y; }) };
}
// Ισχύει τη μέρα d; Η «χωρίς λήξη» ισχύει και κάθε επόμενη μέρα: το «to» της φτάνει μόνο ως σήμερα, αλλά οι υπηρεσίες
// και οι έξοδοι γίνονται για αύριο και μετά (Χορβάτ, ΣΤΕΠ χωρίς λήξη, 13/10)
export const coversDay = (s: { from: ISODate; to: ISODate; open?: boolean }, d: ISODate) => s.from <= d && (!!s.open || d <= s.to);

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

// code: ο κωδικός της θέσης στον έλεγχο υπηρεσιών (Θ1α, Μ2, ΛΥ…), αλλάζει στις Ρυθμίσεις
export interface PostDef { k: string; label: string; short: string; rot?: number | null; hrs?: string; hidden?: boolean; code?: string }
export interface BlockDef { id: string; kind: DutyKind; name: string; armed: boolean; posts: PostDef[]; custom?: boolean; hidden?: boolean }
export type Phase = 'sven' | 'spen';
export const PHASE_NAME: Record<Phase, string> = { sven: 'ΣΒΕΝ', spen: 'ΣΠΕΝ' };
export interface Post extends PostDef { block: string; kind: DutyKind; armed: boolean; slots: string[] | null; hours: string }

// Προεπιλογή = το πραγματικό έντυπο «ΦΡΟΥΡΑ ΣΒΕΝ» (δείγμα 01): Λ/Υ, Δ/Υ, 2 μπλοκ θαλαμοφυλάκων 4×3, μαγειρεία ×5.
// Ποιες θέσεις είναι ένοπλες θέλει επιβεβαίωση από τον λοχία: ρυθμίζεται.
export const DEFAULT_BLOCKS: BlockDef[] = [
  { id: 'ly', kind: 'ly', name: 'Λ/Υ και Δ/Υ', armed: false, posts: [{ k: 'ly', label: 'Λ/Υ', short: 'Λ/Υ', hrs: '14:00 → 14:00', code: 'ΛΥ' }, { k: 'dy', label: 'Δ/Υ', short: 'Δ/Υ', hrs: '14:00 → 14:00', code: 'ΔΥ' }] },
  { id: 'th', kind: 'th', name: 'Θαλαμοφύλακες (α΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 1), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (α΄)', short: (i + 1) + 'ος', rot: i, code: 'Θ' + (i + 1) + 'α' })) },
  { id: 'th2', kind: 'th', name: 'Θαλαμοφύλακες (β΄ πίνακας)', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 5), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (β΄)', short: (i + 1) + 'ος', rot: i, code: 'Θ' + (i + 1) + 'β' })) },
  { id: 'mg', kind: 'mg', name: 'Μαγειρεία', armed: false, posts: [1, 2, 3, 4, 5].map(i => ({ k: 'mg' + i, label: 'Μαγειρεία ' + i + 'ος', short: i + 'ος', hrs: 'ημέρα', code: 'Μ' + i })) }
];
// «ΦΡΟΥΡΑ ΣΠΕΝ» (φωτογραφία του γραφέα, 10/10): θαλαμοφύλακες, οπλοφύλακες, μαγειρεία ×5, ΤΑΕ, σκοποί 3ης και 4ης σκοπιάς σε ζεύγη.
// Οπλοφύλακες και σκοποί είναι προεπιλεγμένα ένοπλοι· αλλάζει στις Ρυθμίσεις.
const skPost = (n: number, ab: string, rot: number): PostDef => ({ k: 'sk' + n + ab, label: 'Σκοπός ' + n + 'ης σκοπιάς (' + (ab === 'a' ? 'α' : 'β') + ')', short: n + 'η ' + (ab === 'a' ? 'α' : 'β'), rot, code: 'Σ' + n + (ab === 'a' ? 'α' : 'β') });
export const DEFAULT_BLOCKS_SPEN: BlockDef[] = [
  DEFAULT_BLOCKS[0],
  { id: 'th', kind: 'th', name: 'Θαλαμοφύλακες', armed: false, posts: [0, 1, 2, 3].map(i => ({ k: 'th' + (i + 1), label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος', short: (i + 1) + 'ος', rot: i, code: 'Θ' + (i + 1) })) },
  { id: 'op', kind: 'op', name: 'Οπλοφύλακες', armed: true, posts: [0, 1, 2, 3].map(i => ({ k: 'op' + (i + 1), label: 'Οπλοφύλακας ' + (i + 1) + 'ος', short: (i + 1) + 'ος', rot: i, code: 'ΟΠ' + (i + 1) })) },
  { id: 'sk', kind: 'sk', name: 'Σκοποί', armed: true, posts: [skPost(3, 'a', 2), skPost(3, 'b', 2), skPost(4, 'a', 3), skPost(4, 'b', 3)] },
  DEFAULT_BLOCKS[3],
  // ΤΑΕ: ένοπλη, χωρίς σταθερές ώρες (λοχίας, 10/10)
  { id: 'tae', kind: 'tae', name: 'ΤΑΕ', armed: true, posts: [{ k: 'tae', label: 'ΤΑΕ', short: 'ΤΑΕ', hrs: '', code: 'ΤΑΕ' }] }
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
  strictUnarmed?: boolean;               // «Αυστηρά Άοπλοι»: οι άοπλοι πρώτα σε μαγειρεία, μετά 2ο-3ο, μετά 1ο-4ο νούμερο· σκοποί μόνο ένοπλοι
}
export const DEFAULT_RULES: Rules = { noConsecHol: true, restDays: 1, numRest: 3, outRooms: { 6: [1, 2, 3, 4], 0: [5, 6, 7, 8] } };

export interface Settings {
  unit: [string, string, string];        // κεφαλίδα 3 γραμμών
  unitName: string;                      // π.χ. 4ης ΙΛΗΣ
  place: string;                         // Αυλώνας
  blocks: BlockDef[];                    // ΣΒΕΝ
  blocksSpen: BlockDef[];                // ΣΠΕΝ
  phase: Phase;                          // ποιο έντυπο υπηρεσιών ισχύει τώρα
  holidays: Record<ISODate, string>;     // αργίες που πρόσθεσες (οι επίσημες βγαίνουν μόνες τους κάθε χρονιά, rules.ts)
  holidaysOff?: ISODate[];               // επίσημες αργίες που αφαίρεσες
  cadre: Record<string, number>;         // στελέχη ανά βαθμό για την ΗΚΑΙ
  signers: { sergeant: string; commander: string };
  outputDir: string;                     // φάκελος για τα Excel (κενό = προεπιλογή)
  fixed: Partial<Record<'ly' | 'dy', number>>; // μόνιμος Λ/Υ και Δ/Υ: μπαίνουν μόνοι τους, εκτός σειράς
  rev: number;                           // έκδοση ρυθμίσεων, για τις αλλαγές προεπιλογών
  views?: SavedView[];                   // αποθηκευμένες λίστες στο Προσωπικό (π.χ. «Θαλαμάρχες»)
  sources?: Partial<Record<ListKind, SourceBinding>>;   // από ποιο Excel/φύλλο/πίνακα διαβάζει κάθε είδος και πού γράφει
  forms?: Partial<Record<FormKind, FormBinding>>;        // ποιο template και ποιος φάκελος για κάθε έντυπο
  newDirs?: Partial<Record<ListKind, string>>;         // πού φτιάχνονται τα νέα Excel κάθε είδους (κενό = ο γενικός φάκελος)
  dutyCodeAliases?: Record<string, string>;   // έλεγχος υπηρεσιών: άγνωστος κωδικός (codeKey) → θέση, «kind:<είδος>» χωρίς θέση, ή «ignore»
  baselineReviewed?: boolean;            // ο έλεγχος των «προηγούμενων υπηρεσιών» μετά την αναβάθμιση (κωδικοί θέσεων) έγινε
  lists?: UserLists;                     // ό,τι πρόσθεσες ή έκρυψες στις λίστες (βαθμοί, Ο/Σ)· οι βασικές είναι στο ranks.ts
  hkai?: HkaiSettings;                   // ΗΚΑΙ: ενότητες που δεν χρησιμοποιεί η Ίλη, οχήματα, «Προβλέπονται»
  rooms?: RoomSettings;                  // πόσοι θάλαμοι, πόσοι ανά ουλαμό και ποιοι ανήκουν σε κάθε ουλαμό (κενό = 8 και 4)
  brand?: BrandSettings;                 // τίτλος και λογότυπο της εφαρμογής (κενό = «Γραφείο Λοχία»)
  essos?: Esso;                          // η τωρινή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ, «Νέα ΕΣΣΟ»)· χωρίς αυτήν, η πιο συχνή των ατόμων (esso.ts)
}
// Τίτλος και λογότυπο (Michael, 17/10): ανάλογα με τον βαθμό όποιου τη χρησιμοποιεί, ή δικά σου.
// rank: βαθμός από τον πίνακα του brand.ts · title: δικός σου τίτλος (κενό = του βαθμού)
// logo: κενό = του βαθμού, ένα από τα σχέδια (brand.ts) ή εικόνα που ανέβασες (data:image/png…)
export interface BrandSettings { rank?: string; title?: string; logo?: string }
// Ενότητες της ΗΚΑΙ που ανοιγοκλείνουν (Michael, 17/10): κλειστή = δεν φαίνεται στην εφαρμογή και δεν γράφεται στο έντυπο
export const HK_SECTIONS: [HkSection, string, string][] = [
  ['veh', 'Κατάσταση οχημάτων', 'Είδος, προβλέπονται, σε κίνηση, προς επισκευή'],
  ['acc', 'Ατυχήματα', 'Ζημιές σε οχήματα και σε άνδρες (αλλιώς μένει το Ø του εντύπου)'],
  ['grd', 'Χορηγούμενες φρουρές', 'Νυκτοφρουρές και 24ωρες από τις υπηρεσίες της μέρας'],
  ['prov', 'Προβλέπονται από τη σύνθεση', 'Ένας αριθμός ανά βαθμό, ίδιος κάθε μέρα']
];
export type HkSection = 'veh' | 'acc' | 'grd' | 'prov';
export interface HkVehicle { type: string; prov?: number; kin?: number; maint?: number; dmg?: number }
export interface HkaiSettings { off?: HkSection[]; veh?: HkVehicle; prov?: Record<string, number> }
export const hkOn = (st: Settings, k: HkSection) => !(st.hkai?.off || []).includes(k);
// Αποθηκευμένη λίστα: ουλαμός, θάλαμος, φίλτρο κατάστασης και κείμενο αναζήτησης
export interface SavedView { id: string; name: string; unit: string; room: number | null; filter: string; q: string }
export const DEFAULT_SETTINGS: Settings = {
  unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'],
  unitName: '4ης ΙΛΗΣ',
  place: 'Αυλώνας',
  blocks: DEFAULT_BLOCKS,
  blocksSpen: DEFAULT_BLOCKS_SPEN,
  phase: 'sven',
  holidays: {},
  cadre: { 'Επίλαρχοι': 0, 'Ίλαρχοι': 0, 'Ανθυπίλαρχοι-Ανθλγοι': 0, 'Ανθυπασπιστές': 0, 'ΔΕΑ': 0, 'Αρχιλοχίες': 0, 'Επιλοχίες': 0 },
  signers: { sergeant: '', commander: '' },
  outputDir: '',
  fixed: {},
  rev: 5
};
// Αλλαγές προεπιλογών σε ρυθμίσεις που έχουν ήδη αποθηκευτεί
export function migrateSettings(st: Settings): Settings {
  if ((st.rev || 0) < 2) {
    // rev 2: η ΤΑΕ είναι ένοπλη και χωρίς ώρες (λοχίας, 10/10)
    const blocksSpen = (st.blocksSpen || DEFAULT_BLOCKS_SPEN).map(b => (b.id === 'tae' ? { ...b, armed: true, posts: b.posts.map(p => ({ ...p, hrs: '' })) } : b));
    st = { ...st, blocksSpen, fixed: st.fixed || {}, rev: 2 };
  }
  if ((st.rev || 0) < 3) st = withCodes({ ...st, rev: 3 });
  if ((st.rev || 0) < 4) {
    // rev 4: οι επίσημες αργίες βγαίνουν μόνες τους κάθε χρονιά· όσες ήταν γραμμένες (οι παλιές προεπιλογές ως 15/8/2027)
    // φεύγουν από τις «δικές σου», ώστε η αφαίρεσή τους να δουλεύει όπως όλων των επίσημων
    const holidays = Object.fromEntries(Object.entries(st.holidays || {}).filter(([d]) => !greekHolidays(+d.slice(0, 4))[d]));
    st = { ...st, holidays, rev: 4 };
  }
  if ((st.rev || 0) < 5) {
    // rev 5: το «Ι3 ΑΟΠΛΟ» λέγεται «Ι3 ΧΩΡΙΣ ΟΠΛΟ» (Michael, 17/10)· οι γραμμές του πίνακα Σ.Ι. παίρνουν το νέο όνομα
    const cells = st.lists?.si?.cells;
    const old = 'Ι3 ΑΟΠΛΟ', now = 'Ι3 ΧΩΡΙΣ ΟΠΛΟ';
    const ren = (k: string) => (k === old || k.startsWith(old + ' · ') ? now + k.slice(old.length) : k);
    st = { ...st, rev: 5, ...(cells && Object.keys(cells).some(k => ren(k) !== k) ? { lists: { ...st.lists, si: { ...st.lists!.si, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [ren(k), { ...(cells[ren(k)] || {}), ...v }])) } } } : {}) };
  }
  return st;
}
// Κωδικοί θέσεων (rev 3): όσες θέσεις δεν έχουν κωδικό παίρνουν τον προεπιλεγμένο του εντύπου (Θ1α…Θ4β στη ΣΒΕΝ,
// Θ1…Θ4, ΟΠ1…ΟΠ4, Σ3α… στη ΣΠΕΝ, Μ1…Μ5, ΛΥ, ΔΥ, ΤΑΕ)· οι δικές σου υπηρεσίες γράμμα + αριθμό (Υ1, Υ2…), χωρίς να
// πέφτουν πάνω σε κωδικό που υπάρχει ήδη. Πρώτα οι κωδικοί του εντύπου και στα δύο έντυπα, μετά οι δικές σου: αλλιώς
// δική σου υπηρεσία θαλαμοφυλάκων στη ΣΒΕΝ θα έπαιρνε τα Θ1, Θ2 της ΣΠΕΝ και οι θαλαμοφύλακες της ΣΠΕΝ θα γίνονταν Θ3…Θ6
export function withCodes(st: Settings): Settings {
  const owner = new Map<string, string>();   // κλειδί κωδικού → θέση που τον έχει
  for (const b of [...(st.blocks || []), ...(st.blocksSpen || [])]) for (const p of b.posts) if (p.code) owner.set(codeKey(p.code), p.k);
  const free = (c: string, k: string) => { const o = owner.get(codeKey(c)); return o == null || o === k; };
  const fill = (ph: Phase, list: BlockDef[] | undefined, own: boolean) => (list || []).map(b => ({ ...b, posts: b.posts.map((p, i) => {
    if (p.code) return p;
    let c = defaultCode(ph, b.id, p.k);
    if (!c || !free(c, p.k)) { if (!own) return p; let n = i + 1; do c = KIND_CODE[b.kind] + n++; while (!free(c, p.k)); }
    owner.set(codeKey(c), p.k);
    return { ...p, code: c };
  }) }));
  const blocks = fill('sven', st.blocks, false), blocksSpen = fill('spen', st.blocksSpen, false);
  return { ...st, blocks: fill('sven', blocks, true), blocksSpen: fill('spen', blocksSpen, true) };
}
// Ο κωδικός του εντύπου για μια θέση (ΣΒΕΝ/ΣΠΕΝ, υπηρεσία, θέση), όπως στις προεπιλογές
const DEF_CODES = new Map<string, string>();
for (const [ph, list] of [['sven', DEFAULT_BLOCKS], ['spen', DEFAULT_BLOCKS_SPEN]] as const) for (const b of list) for (const p of b.posts) if (p.code) DEF_CODES.set(ph + '|' + b.id + '|' + p.k, p.code);
export const defaultCode = (ph: Phase, block: string, k: string) => DEF_CODES.get(ph + '|' + block + '|' + k);
// Κλειδί σύγκρισης κωδικών: κεφαλαία, χωρίς τόνους, λατινικά που μοιάζουν → ελληνικά, χωρίς κενά και παύλες
export const codeKey = (raw: unknown) => normGreek(raw).replace(/[\s\-–—]+/g, '');

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
  dutyLog: DutyLog;                      // υπηρεσίες με ημερομηνία αλλά χωρίς θέση (από Excel με σκέτο «Θ», «Μ», «Σ»)
  nightTraining: Record<ISODate, true>;  // μέρες με βραδινή εκπαίδευση: δεν μετράνε στη στέρηση εξόδου
  lastExpire: ISODate | '';               // πότε γράφτηκαν τελευταία στο Ιστορικό όσα έληξαν (για τις μέρες που η εφαρμογή ήταν κλειστή)
}
// Υπηρεσία χωρίς θέση: μετρά στα σύνολα, στην ανάπαυση και στις αργίες· όχι στον κανόνα του ίδιου νούμερου
export interface SeatlessDuty { pid: number; kind: DutyKind }
export type DutyLog = Record<ISODate, SeatlessDuty[]>;
// Αίτηση στρατιώτη για την ΗΚΑΙ: «Ο ΣΤΡ … αιτείται {text}.»
// Αίτηση στην ΗΚΑΙ (5. ΑΙΤΗΣΕΙΣ). Αίτηση άδειας (leave): ο Διοικητής την εγκρίνει ή την απορρίπτει· με την έγκριση γίνεται άδεια
// (Status με req = το id της αίτησης) και γράφεται στο 3. ΑΔΕΙΕΣ της ΗΚΑΙ της μέρας της έγκρισης (Michael, 17/10).
// text: ό,τι αιτείται· στην άδεια η αιτιολόγηση (μπορεί να είναι κενή)
export interface LeaveAsk { type: 'LEAVE' | 'HON'; kind?: string; from: ISODate; to: ISODate }
export interface PersonRequest { id: string; pid: number; date: ISODate; text: string; leave?: LeaveAsk; decision?: 'ok' | 'no'; decided?: ISODate; sid?: string }
// Στελέχη (καρτέλα «Στελέχη»): ονόματα, θέση, καταστάσεις της ΗΚΑΙ, που ταΐζουν και την ΗΚΑΙ
export interface Cadre { id: string; rank: string; hk: string; last: string; first: string; phone?: string; role?: string; active: boolean }
export interface CadreAbs { id: string; cid: string; kind: string; from: ISODate; to: ISODate; note?: string }
// Καταστάσεις στελέχους = οι στήλες της ΗΚΑΙ (Michael, 17/10: «οι καταστάσεις τους να αφορούν τις καταστάσεις της ΗΚΑΙ»):
// [κωδικός, όνομα, στήλη ΗΚΑΙ]. Πρώτα οι κωλυόμενοι, μετά οι απόντες, όπως στο έντυπο· «Άλλο» μένει μόνο στη λίστα.
// Οι παλιοί κωδικοί (ka, an, eid, nos, fp, ekp, allh, other) κρατούν το ίδιο όνομα, για όσες έχουν ήδη γραφτεί.
export const CADRE_ABS: [string, string, string][] = [
  ['yp', 'Υπηρεσία εντός στρατοπέδου', 'yp'], ['ey', 'Ελεύθερος υπηρεσίας', 'ey'], ['tim', 'Τιμωρημένος', 'tim'], ['os', 'Ο/Σ', 'os'],
  ['mag', 'Μαγειρεία', 'mag'], ['sid', 'Σιδηρουργείο', 'sid'], ['kin', 'Σε κίνηση', 'kin'],
  ['ka', 'Κανονική άδεια', 'ka'], ['an', 'Αναρρωτική άδεια', 'an'], ['eid', 'Ειδική άδεια', 'eid'], ['nos', 'Νοσοκομείο', 'nos'], ['prat', 'Πρατήριο', 'prat'],
  ['adik', 'Αγνοούμενος / αδικαιολογήτως', 'adik'], ['fp', 'Φύλλο πορείας', 'fp'], ['fyl', 'Φυλάκιο', 'fyl'], ['apal', 'Απαλλαγή', 'apal'],
  ['ekp', 'Εκπαίδευση', 'ekp'], ['allh', 'Απόσπαση σε άλλη μονάδα', 'allh'], ['other', 'Άλλο (μόνο στη λίστα)', '']
];
// Προηγούμενες υπηρεσίες ανά είδος (+ πόσες σε ΣΚ/αργία), γραμμένες με το χέρι
export type Baseline = Partial<Record<DutyKind, number>> & { hol?: number };
// Ό,τι στην ΗΚΑΙ δεν βγαίνει από την εφαρμογή: αριθμοί ανά βαθμό και στήλη, και κείμενα της πίσω σελίδας
export interface HkaiManual { cells: Record<string, Record<string, number>>; text: Record<string, string> }

export const emptyState = (): AppState => ({
  people: [], statuses: [], guards: {}, caps: {}, rules: { ...DEFAULT_RULES }, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), printed: {}, baseline: {}, hkaiManual: {}, cadreList: [], cadreAbs: [], requests: [], dutyLog: {}, nightTraining: {}, lastExpire: ''
});
