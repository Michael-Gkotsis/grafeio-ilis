import { greekHolidays, type ISODate } from './dates';
import { normGreek } from './text';
import { normTime } from './hours';
import type { FormBinding, FormKind, ListKind, SourceBinding } from './sources';
import type { UserLists } from './ranks';
import type { Esso } from './esso';
import type { UnitKind } from './unit';
import type { Report, RepTpl } from './reports';
import type { Sig, SigForm } from './sigs';
import type { Layout, LayoutForm } from './layout';
import type { XlLook } from './xlLook';

// ---------------------------------------------------------------------------
// Πρόσωπα
// ---------------------------------------------------------------------------
// Εφάπαξ εξαίρεση από υπηρεσίες (Michael, 24/10): από–έως (και οι δύο μέρες μετρούν), προαιρετική αιτιολογία
export interface Skip { id: string; from: ISODate; to: ISODate; why?: string }
export interface Person {
  id: number;
  rank: string;          // π.χ. ΣΤΡ, ΔΝΕΑΣ, ΛΧΙΑΣ (χωρίς την προέλευση)
  origin?: string;       // προέλευση (ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ…), δικό της πεδίο· στα έντυπα μπροστά από τον βαθμό (ranks.ts rankTxt)
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
  wpos?: string;         // «Θέση» του όπλου (Michael, 18/10: στήλη στον Οπλισμό), ελεύθερο κείμενο με κεφαλαία
  monthMax?: number;     // ΕΠΟΠ/ΟΒΑ: πόσες υπηρεσίες τον μήνα το πολύ (rules.ts monthBlock)· μπαίνουν μόνο με το χέρι
  cid?: string;          // στέλεχος σε θέση των Υπηρεσιών (rules.ts cadreSeat): όχι στο Δυναμολόγιο
  offDays?: number[];    // μέρες της εβδομάδας χωρίς υπηρεσία (0 = Κυριακή … 6 = Σάββατο), μόνιμα μέχρι να αλλάξουν
  skips?: Skip[];        // εφάπαξ εξαιρέσεις από υπηρεσίες με ημερομηνίες (Υπηρεσίες › Εξαιρέσεις), με σειρά ημερομηνίας
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
export type TypeKey = 'EY' | 'EA' | 'EARV' | 'EO' | 'NOS' | 'STEP' | 'PUN' | 'LEAVE' | 'HON' | 'SICK' | 'OUT' | 'DN' | 'KOL';
export type Cat = 'med' | 'abs' | 'out' | 'other' | 'pun' | 'kol';
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
  DN:    { label: 'ΔΝ', long: 'Εξοδούχος με ΔΝ', tone: 'dn', cat: 'out', away: true, noDuty: true },
  // Κωλυόμενος (Michael, 24/10): υπηρεσία που δεν είναι δική μας (π.χ. ΣΤΕΠ). Παρών, σε καμία δική μας υπηρεσία· η έξοδος, η αφαίρεση
  // από τους παρόντες και η στήλη της ΗΚΑΙ ορίζονται ανά δήλωση (Status.noOut, minus, hkCol, rules.ts kolView)
  KOL:   { label: 'Κωλυόμενος', long: 'Κωλυόμενος (υπηρεσία εκτός δικών μας)', tone: 'warn', cat: 'kol', noDuty: true }
};
export const TYPE_KEYS = Object.keys(TYPES) as TypeKey[];
export const effects = (t: TypeDef) =>
  [t.away && 'Απών', t.noDuty ? 'Καμία υπηρεσία' : t.noArmed && 'Όχι σε ένοπλη θέση', !t.noDuty && t.light && 'Όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος', t.noOut && 'Δεν βγαίνει έξοδο', t.cat === 'kol' && 'Έξοδος και ΗΚΑΙ όπως τα ορίζεις στη δήλωση'].filter(Boolean).join(' · ');
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
  minus?: boolean;    // κωλυόμενος: αφαιρείται από τους παρόντες και μπαίνει στην ΗΚΑΙ, στη στήλη hkCol
  hkCol?: string;     // κωλυόμενος: στήλη κωλυομένων της ΗΚΑΙ (KOL_COLS), προεπιλογή yp «Υπηρεσία»
  noOut?: boolean;    // κωλυόμενος: δεν βγαίνει έξοδο (αλλιώς βγαίνει κανονικά)
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

// Βάρδιες 2 ωρών, κύκλος 14:00 → 14:00 (δείγμα «ΦΡΟΥΡΑ»): οι προεπιλογές, όταν η υπηρεσία δεν έχει δικές της βάρδιες
export const ROT = [
  ['14:00-16:00', '22:00-00:00', '06:00-08:00'],
  ['16:00-18:00', '00:00-02:00', '08:00-10:00'],
  ['18:00-20:00', '02:00-04:00', '10:00-12:00'],
  ['20:00-22:00', '04:00-06:00', '12:00-14:00']
];
// Βάρδιες ανά υπηρεσία (Michael, 20/10): κάθε πόσα λεπτά αλλάζει το νούμερο, μέσα σε ποιες ώρες του κύκλου (κενό = όλος
// ο κύκλος, από την αρχή της υπηρεσίας ως την ίδια ώρα την επόμενη μέρα). Τα νούμερα μοιράζονται τις βάρδιες με τη σειρά.
// «Δικές μου βάρδιες» (Michael, 24/10): με list, ο λοχίας γράφει μόνος τις βάρδιες και διαλέγει ποιο νούμερο (n, από 0) κάνει
// την καθεμία· η list νικά τα every/from/to, που μένουν μόνο για να γυρίσει στο «κάθε τόσες ώρες» χωρίς να τα ξαναγράψει.
export interface ShiftOwn { from: string; to: string; n: number }
export interface ShiftDef { every: number; from?: string; to?: string; list?: ShiftOwn[] }
export const MAX_SHIFT_OWN = 48;
export const hasShift = (sh?: ShiftDef | null): sh is ShiftDef => !!sh && (sh.every > 0 || !!sh.list?.length);
export const DEFAULT_DUTY_START = '14:00';
export const SHIFT_EVERY = [60, 90, 120, 180, 240, 360, 480, 720];
const hhmm = (m: number) => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const okT = (t?: string) => !!t && /^\d\d:\d\d$/.test(t);
export const dutyStartOf = (st?: Pick<Settings, 'dutyStart'> | null) => (okT(st?.dutyStart) ? st!.dutyStart! : DEFAULT_DUTY_START);
// Σωστή δική μου βάρδια: δύο ώρες ΩΩ:ΛΛ, διαφορετικές (η ίδια ώρα θα ήταν 0 ή 24 ώρες: αμφίβολο, δεν γίνεται δεκτό)
export const okOwn = (x: ShiftOwn) => okT(x.from) && okT(x.to) && x.from !== x.to;
// Λεπτά από την αρχή του κύκλου (start) ως την ώρα t, 0..1439: η σειρά μέσα στον κύκλο
const cycPos = (start: string, t: string) => ((toMin(t) - toMin(start)) % 1440 + 1440) % 1440;
const ownLen = (x: ShiftOwn) => ((toMin(x.to) - toMin(x.from)) % 1440 + 1440) % 1440;
// Καθαρισμός πριν την αποθήκευση: ώρες σε ΩΩ:ΛΛ, κακές γραμμές φεύγουν, το νούμερο μέσα στα νούμερα της υπηρεσίας (count), ως 48 γραμμές.
// null = χωρίς βάρδιες (ούτε every ούτε λίστα).
export function cleanShift(sh: ShiftDef | null | undefined, count: number): ShiftDef | null {
  if (!sh) return null;
  const list = (sh.list || []).flatMap(x => { const a = normTime(x.from), b = normTime(x.to); return a && b && a !== b ? [{ from: a, to: b, n: Math.min(Math.max(0, Math.round(+x.n) || 0), Math.max(0, count - 1)) }] : []; }).slice(0, MAX_SHIFT_OWN);
  const every = Math.round(sh.every); if (!(every > 0) && !list.length) return null;
  return { every: every > 0 ? every : 120, ...(normTime(sh.from) ? { from: normTime(sh.from)! } : {}), ...(normTime(sh.to) ? { to: normTime(sh.to)! } : {}), ...(list.length ? { list } : {}) };
}
// Οι βάρδιες όλων των νούμερων: [νούμερο][βάρδια] = «14:00-16:00». Η τελευταία κόβεται στο τέλος των ωρών.
// Με δικές μου βάρδιες: ανά νούμερο, με τη σειρά του κύκλου από start· νούμερο χωρίς βάρδια παίρνει [].
export function shiftSlots(start: string, sh: ShiftDef, n: number): string[][] {
  const out: string[][] = Array.from({ length: Math.max(1, n) }, () => []);
  if (sh.list?.length) {
    const own = sh.list.filter(x => okOwn(x) && x.n >= 0 && x.n < out.length).sort((a, b) => cycPos(start, a.from) - cycPos(start, b.from));
    for (const x of own) out[Math.floor(x.n)].push(x.from + '-' + x.to);
    return out;
  }
  const a = toMin(okT(sh.from) ? sh.from! : start); const b0 = toMin(okT(sh.to) ? sh.to! : (okT(sh.from) ? sh.from! : start));
  const len = ((b0 - a) % 1440 + 1440) % 1440 || 1440; const ev = Math.max(15, sh.every || 120);
  for (let t = 0, j = 0; t < len; t += ev, j++) out[j % out.length].push(hhmm(a + t) + '-' + hhmm(a + Math.min(len, t + ev)));
  return out;
}
// «Ξεκίνα από “κάθε 2 ώρες”»: οι βάρδιες του κάθε-τόσες-ώρες ως λίστα, με τη σειρά της ώρας (από το «Από» ή την αρχή), με το νούμερό τους
export function shiftList(start: string, sh: ShiftDef, n: number): ShiftOwn[] {
  const every = { ...sh }; delete every.list; const from = okT(sh.from) ? sh.from! : start;
  return shiftSlots(start, every, n).flatMap((t, i) => t.map(x => ({ from: x.slice(0, 5), to: x.slice(6), n: i }))).sort((a, b) => cycPos(from, a.from) - cycPos(from, b.from)).slice(0, MAX_SHIFT_OWN);
}
// Ώρες με ελληνική υποδιαστολή: 7 ώρες, 2,5 ώρες, 1 ώρα
export const hoursTxt = (min: number) => { const h = Math.round(min / 60 * 100) / 100; return String(h).replace('.', ',') + (h === 1 ? ' ώρα' : ' ώρες'); };
// Έλεγχος των δικών μου βαρδιών (Michael, 24/10: προειδοποίηση, δεν εμποδίζει): ποιες πέφτουν μαζί, ποια ώρα του κύκλου δεν
// φυλάει κανείς, ποιο νούμερο δεν έχει βάρδια, και πόσες βάρδιες/ώρες έχει το κάθε νούμερο. a, b = θέσεις στη λίστα.
export interface ShiftReport { overlaps: { a: number; b: number; from: string; to: string }[]; gaps: { from: string; to: string }[]; empty: number[]; per: { n: number; count: number; min: number }[] }
export function shiftReport(start: string, list: ShiftOwn[], count: number): ShiftReport {
  const ok = list.map((x, i) => [x, i] as const).filter(([x]) => okOwn(x));
  const seg = ([x]: readonly [ShiftOwn, number]) => { const a = cycPos(start, x.from); return [a, a + ownLen(x)] as const; };
  const overlaps: ShiftReport['overlaps'] = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const [a1, e1] = seg(ok[i]), [a2, e2] = seg(ok[j]);
    // κύκλος: η δεύτερη βάρδια και μια μέρα πριν ή μετά (βάρδια που περνά το τέλος του κύκλου πέφτει πάνω στην αρχή του)
    for (const d of [-1440, 0, 1440]) { const lo = Math.max(a1, a2 + d), hi = Math.min(e1, e2 + d); if (hi > lo) overlaps.push({ a: ok[i][1], b: ok[j][1], from: hhmm(toMin(start) + lo), to: hhmm(toMin(start) + hi) }); }
  }
  const cov = new Uint8Array(1440);
  for (const o of ok) { const [a, e] = seg(o); for (let m = a; m < e; m++) cov[m % 1440] = 1; }
  const runs: [number, number][] = []; // [αρχή, τέλος) ασκέπαστων λεπτών
  for (let m = 0; m < 1440; m++) if (!cov[m]) { const r = runs[runs.length - 1]; if (r && r[1] === m) r[1] = m + 1; else runs.push([m, m + 1]); }
  // το κενό που κρατά από το τέλος του κύκλου ως την αρχή του επόμενου είναι ένα
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 1440) { const f = runs.shift()!; runs[runs.length - 1][1] = 1440 + f[1]; }
  const gaps = ok.length ? runs.map(([a, e]) => ({ from: hhmm(toMin(start) + a), to: hhmm(toMin(start) + e) })) : [];
  const per = Array.from({ length: Math.max(1, count) }, (_, n) => { const own = ok.filter(([x]) => Math.floor(x.n) === n); return { n, count: own.length, min: own.reduce((t, [x]) => t + ownLen(x), 0) }; });
  return { overlaps, gaps, empty: per.filter(x => !x.count).map(x => x.n), per };
}
// code: ο κωδικός της θέσης στον έλεγχο υπηρεσιών (Θ1α, Μ2, ΛΥ…), αλλάζει στις Ρυθμίσεις
export interface PostDef { k: string; label: string; short: string; rot?: number | null; hrs?: string; hidden?: boolean; code?: string }
// armWeapon (Michael, 24/10): στις ένοπλες υπηρεσίες, «own» (προεπιλογή, χωρίς πεδίο) = κάθε άτομο βγάζει το δικό του όπλο στο νούμερό του·
// «post» = ένα όπλο της θέσης, που περνά από χέρι σε χέρι στις αλλαγές (armed.ts)
export interface BlockDef { id: string; kind: DutyKind; name: string; armed: boolean; posts: PostDef[]; custom?: boolean; hidden?: boolean; shift?: ShiftDef | null; armWeapon?: 'own' | 'post' }
// Έντυπο υπηρεσιών: ΣΒΕΝ, ΣΠΕΝ ή δικό σου (Michael, 22/10: «dropdown και λίστα»). Το δικό σου έχει δικές του
// υπηρεσίες και βγαίνει στο Excel με το έντυπο της ΣΒΕΝ ή της ΣΠΕΝ (base), με το όνομά του.
export type BasePhase = 'sven' | 'spen';
export type Phase = string;
export const PHASE_NAME: Record<BasePhase, string> = { sven: 'ΣΒΕΝ', spen: 'ΣΠΕΝ' };
export interface PhaseDef { id: string; name: string; base: BasePhase; blocks: BlockDef[] }
export interface Post extends PostDef { block: string; kind: DutyKind; armed: boolean; slots: string[] | null; hours: string; cyc?: number }

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
const ownPhase = (st: Settings, ph: Phase) => (ph === 'sven' || ph === 'spen' ? undefined : (st.phases || []).find(x => x.id === ph));
export const blocksOf = (settings: Settings, phase: Phase = settings.phase): BlockDef[] => (phase === 'spen' ? settings.blocksSpen : ownPhase(settings, phase)?.blocks || settings.blocks);
// Με ποιο έντυπο της εφαρμογής βγαίνει (ΣΒΕΝ ή ΣΠΕΝ): για το template, τα κελιά, τις υπογραφές
export const phaseBase = (st: Settings, ph: Phase = st.phase): BasePhase => (ph === 'spen' ? 'spen' : ownPhase(st, ph)?.base || 'sven');
export const phaseName = (st: Settings, ph: Phase = st.phase): string => (ph === 'sven' || ph === 'spen' ? PHASE_NAME[ph] : ownPhase(st, ph)?.name || PHASE_NAME.sven);
// Όλα τα έντυπα υπηρεσιών με τη σειρά: ΣΒΕΝ, ΣΠΕΝ, τα δικά σου
export const phaseList = (st: Settings): { id: Phase; name: string; base: BasePhase; custom: boolean }[] =>
  [{ id: 'sven', name: PHASE_NAME.sven, base: 'sven' as BasePhase, custom: false }, { id: 'spen', name: PHASE_NAME.spen, base: 'spen' as BasePhase, custom: false }, ...(st.phases || []).map(x => ({ id: x.id, name: x.name, base: x.base, custom: true }))];
// Αρχή του ονόματος του Excel: «ΦΡΟΥΡΑ », «ΦΡΟΥΡΑ ΣΠΕΝ », «ΦΡΟΥΡΑ ΑΣΚΗΣΗ »
export const frouraFile = (st: Settings, ph: Phase = st.phase || 'sven') => 'ΦΡΟΥΡΑ ' + (ph === 'sven' ? '' : phaseName(st, ph) + ' ');
// Οι υπηρεσίες κάθε εντύπου (ΣΒΕΝ, ΣΠΕΝ, δικά σου), για ό,τι κοιτά όλα τα έντυπα μαζί (κωδικοί, ιστορικό, στήλες)
export const phaseBlocks = (st: Settings): [Phase, BlockDef[]][] => [['sven', st.blocks || []], ['spen', st.blocksSpen || []], ...(st.phases || []).map(x => [x.id, x.blocks || []] as [Phase, BlockDef[]])];
export const everyBlock = (st: Settings): BlockDef[] => phaseBlocks(st).flatMap(([, b]) => b);
// Οι ρυθμίσεις με νέες υπηρεσίες σε ένα έντυπο
export function withBlocks(st: Settings, ph: Phase, list: BlockDef[]): Settings {
  if (ph === 'spen') return { ...st, blocksSpen: list };
  if (ph === 'sven' || !ownPhase(st, ph)) return { ...st, blocks: list };
  return { ...st, phases: (st.phases || []).map(x => (x.id === ph ? { ...x, blocks: list } : x)) };
}

// Νούμερα μιας υπηρεσίας με βάρδιες: οι θέσεις με το ίδιο rot είναι ένα νούμερο (ζεύγος σκοπών)· οι δικές σου, ένα η καθεμία
export const shiftGroups = (b: BlockDef) => { const ps = b.posts.filter(p => !p.hidden); const keys: string[] = []; for (const p of ps) { const k = p.rot != null ? 'r' + p.rot : p.k; if (!keys.includes(k)) keys.push(k); } return keys; };
const groupKey = (p: PostDef) => (p.rot != null ? 'r' + p.rot : p.k);
export function buildPosts(blocks: BlockDef[], start: string = DEFAULT_DUTY_START): Post[] {
  const def = start === DEFAULT_DUTY_START ? ROT : shiftSlots(start, { every: 120 }, 4);
  return blocks.flatMap(b => {
    const sh = hasShift(b.shift) ? b.shift : null;
    const groups = sh ? shiftGroups(b) : []; const sl = sh ? shiftSlots(start, sh, groups.length) : null;
    return b.posts.map(p => {
      // με δικές μου βάρδιες, νούμερο χωρίς καμία βάρδια δεν έχει ώρες (null), όχι άδεια λίστα
      const mine = sl ? sl[groups.indexOf(groupKey(p))] : undefined;
      const slots = sl ? (sh!.list?.length && !mine?.length ? null : mine || null) : p.rot != null ? def[p.rot] : null;
      const hrs = p.hrs === '14:00 → 14:00' ? start + ' → ' + start : p.hrs;   // Λ/Υ, Δ/Υ: όλος ο κύκλος
      return { ...p, ...(hrs !== p.hrs ? { hrs } : {}), block: b.id, kind: b.kind, armed: b.armed, slots, hours: slots ? slots.join(' · ') : (hrs || ''), cyc: toMin(start) };
    });
  });
}
export const postTxt = (x: Post) => x.label + (x.slots ? ' ' + x.slots[0].slice(0, 5) : '');

// ---------------------------------------------------------------------------
// Κατάσταση εφαρμογής
// ---------------------------------------------------------------------------
export type Guards = Record<ISODate, Record<string, number>>;
// Ανά άτομο: είδος (th, mg…) ή δική σου υπηρεσία («b:» + id μπλοκ) → αιτία «δεν κάνει», ή null = ρητά «κάνει» (παρά Σ.Ι./πόστο)
export type CapKey = DutyKind | `b:${string}`;
export type Caps = Record<number, Partial<Record<CapKey, string | null>>>;

export interface Rules {
  noConsecHol: boolean;                  // Κ-13
  restDays: number;                      // Κ-14
  numRest: number;                       // 3ο/4ο νούμερο: ξανά στο ίδιο νούμερο μετά από τόσες μέρες (0 = όχι)
  outRooms: Record<number, number[]>;    // Κ-16: ημέρα εβδομάδας → θάλαμοι που βγαίνουν
  strictUnarmed?: boolean;               // «Αυστηρά Άοπλοι»: οι άοπλοι πρώτα σε μαγειρεία, μετά 2ο-3ο, μετά 1ο-4ο νούμερο· σκοποί μόνο ένοπλοι
  rotate?: boolean;                      // εναλλαγή υπηρεσιών (Michael, 18/10): όλοι περνούν από όλες τις υπηρεσίες πριν ξανακάνουν την ίδια· false = κλειστό
  outTime?: string;                      // ώρα που ξεκινά η έξοδος (ΩΩ:ΛΛ, προεπιλογή 16:00): όποιος γυρίσει ως τότε βγαίνει κανονικά
  hkTime?: string;                       // ώρα της ΗΚΑΙ (ΩΩ:ΛΛ, προεπιλογή 08:00): όποιος γυρίσει ως τότε μετρά παρών εκείνη τη μέρα
  armBefore?: number;                    // ένοπλη υπηρεσία (Michael, 24/10): το όπλο βγαίνει τόσα λεπτά πριν από το νούμερο (προεπιλογή 15, armed.ts)
  armAfter?: number;                     // ... και μπαίνει τόσα λεπτά μετά (προεπιλογή 15)
  week?: Record<number, DayPlan>;        // ώρες εξόδου/επιστροφής και εκπαίδευση ανά ημέρα εβδομάδας (getDay), μόνο όσα διαφέρουν από την προεπιλογή (shared/returns.ts)
}
// Ώρες μιας μέρας (Michael, 24/10): out = αρχή εξόδου, backOut = επιστροφή εξοδούχων (ίδιο βράδυ), backDn = επιστροφή ΔΝ (το πρωί),
// train = πρωινή εκπαίδευση. Ως αλλαγή μιας μέρας (state.dayPlan) όσα λείπουν μένουν όπως η ημέρα εβδομάδας.
export interface DayPlan { out?: string; backOut?: string; backDn?: string; train?: boolean }
// Διόρθωση επιστροφής ενός ατόμου (Michael, 24/10), όταν άλλαξε κάτι προφορικά: day = η μέρα της ΔΝ/εξόδου του· stay = δεν γυρνά,
// συνεχίζει· at = γυρνά τη μέρα και την ώρα που λέει. id: «pid:day» (μία διόρθωση ανά άτομο και μέρα). why υποχρεωτικό.
export interface BackFix { id: string; pid: number; day: ISODate; stay?: true; at?: { day: ISODate; time: string }; why: string }
export const DEFAULT_RULES: Rules = { noConsecHol: true, restDays: 1, numRest: 3, outRooms: { 6: [1, 2, 3, 4], 0: [5, 6, 7, 8] } };

export type OutsFmt = 'cur' | 'tab4';
export const OUTS_FMT: [OutsFmt, string][] = [['cur', 'Τωρινή'], ['tab4', 'Σε 4 πίνακες']];
export interface Settings {
  unit: [string, string, string];        // κεφαλίδα 3 γραμμών
  unitName: string;                      // π.χ. 4ης ΙΛΗΣ
  unitKind?: UnitKind;                   // Ίλη/Επιλαρχία (ΗΚΑΙ, προεπιλογή) ή Λόχος/Τάγμα (ΗΚΑΛ), unit.ts
  place: string;                         // Αυλώνας
  blocks: BlockDef[];                    // ΣΒΕΝ
  blocksSpen: BlockDef[];                // ΣΠΕΝ
  phases?: PhaseDef[];                   // δικά σου έντυπα υπηρεσιών (αντίγραφο της ΣΒΕΝ ή της ΣΠΕΝ στην αρχή)
  phase: Phase;                          // ποιο έντυπο υπηρεσιών ισχύει τώρα
  holidays: Record<ISODate, string>;     // αργίες που πρόσθεσες (οι επίσημες βγαίνουν μόνες τους κάθε χρονιά, rules.ts)
  holidaysOff?: ISODate[];               // επίσημες αργίες που αφαίρεσες
  cadre: Record<string, number>;         // στελέχη ανά βαθμό για την ΗΚΑΙ
  signers: { sergeant: string; commander: string };
  sigs?: Partial<Record<SigForm, Sig[]>>;  // υπογραφές ανά έντυπο, από αριστερά προς τα δεξιά (κενό = όπως το έντυπο), sigs.ts
  layout?: Partial<Record<LayoutForm, Layout>>;  // πού μετακίνησες υπογραφές, κεφαλίδα, ημερομηνία πάνω στο χαρτί, layout.ts
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
  reportTpls?: RepTpl[];                 // Έντυπα: τα πρότυπά σου (αρχεία στον φάκελο «Πρότυπα εντύπων»), shared/reports.ts
  reports?: Report[];                    // Έντυπα: τα έτοιμα έντυπα (πρότυπο, στήλες, ποιοι μπαίνουν, πού βγαίνει)
  essos?: Esso;                          // η τωρινή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ, «Νέα ΕΣΣΟ»)· χωρίς αυτήν, η πιο συχνή των ατόμων (esso.ts)
  dutyStart?: string;                    // πότε ξεκινά ο κύκλος των υπηρεσιών (ΩΩ:ΛΛ, κενό = 14:00): η μέρα της υπηρεσίας είναι από τότε ως την ίδια ώρα την επόμενη
  outsFmt?: OutsFmt;                     // Excel Εξοδούχων: 'cur' = Τωρινή (προεπιλογή), 'tab4' = Σε 4 πίνακες· η τελευταία επιλογή μένει, και το αυτόματο ξαναγράψιμο την ακολουθεί
  xl?: Partial<XlLook>;                  // γράμματα και στοίχιση σε ό,τι φτιάχνει η εφαρμογή στο Excel (κενό = Arial 12, κέντρο), xlLook.ts
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
  ['prov', 'Προβλέπονται από τη σύνθεση', 'Ένας αριθμός ανά βαθμό, ίδιος κάθε μέρα'],
  ['lv', 'Άδειες στο «3. Άδειες»: προεπιλογή για νέες μέρες', 'Άδειες που δηλώνεις απευθείας (στρατιωτών και στελεχών), τη μέρα που ξεκινούν. Κάθε μέρα αλλάζει χωριστά από τον διακόπτη πάνω από την προεπισκόπηση· όσες μέρες έχουν βγει στο Excel κρατούν ό,τι είχαν. Οι αιτήσεις που εγκρίθηκαν μένουν μόνο στο «5. Αιτήσεις».']
];
export type HkSection = 'veh' | 'acc' | 'grd' | 'prov' | 'lv';
// Κλειστές αν δεν τις ανοίξεις (hkai.on): οι άδειες στο 3. ΑΔΕΙΕΣ (Michael, 22/10: να μη γράφονται, αλλά να μένει η δυνατότητα)
export const HK_DEFAULT_OFF: HkSection[] = ['lv'];
export interface HkVehicle { type: string; prov?: number; kin?: number; maint?: number; dmg?: number }
// head: η κεφαλίδα της ΗΚΑΙ (2 γραμμές πάνω αριστερά, π.χ. ΚΕΤΘ / 2Η ΕΠΧΙΑ)· κενή = ό,τι έχει το έντυπο
export interface HkaiSettings { off?: HkSection[]; on?: HkSection[]; veh?: HkVehicle; prov?: Record<string, number>; head?: string[] }
export const hkOn = (st: Settings, k: HkSection) => (HK_DEFAULT_OFF.includes(k) ? (st.hkai?.on || []).includes(k) : !(st.hkai?.off || []).includes(k));
// Ανοίγει ή κλείνει μία ενότητα, στη λίστα που της αντιστοιχεί (off για όσες είναι ανοιχτές από προεπιλογή, on για τις άλλες)
export function hkToggle(h: HkaiSettings, k: HkSection, on: boolean): HkaiSettings {
  const key = HK_DEFAULT_OFF.includes(k) ? 'on' : 'off'; const add = key === 'on' ? on : !on;
  const ls = (h[key] || []).filter(x => x !== k); if (add) ls.push(k);
  return { ...h, [key]: ls };
}
// 3. ΑΔΕΙΕΣ ανά μέρα (Michael, 24/10): ό,τι ορίστηκε για τη μέρα (hkaiManual[d].lv), αλλιώς η προεπιλογή της ενότητας «lv»
export const hkLvOn = (s: Pick<AppState, 'settings' | 'hkaiManual'>, d: ISODate): boolean => s.hkaiManual?.[d]?.lv ?? hkOn(s.settings, 'lv');
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
  rev: 7
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
  // rev 6 (δική της δυνατότητα υπηρεσιών για κάθε δική σου υπηρεσία) θέλει και τα s.caps: γίνεται στο db.ts (capsPerService),
  // μαζί με το rev 7 (κάθε δική σου υπηρεσία μετρά ως δική της, ownKinds), που πρέπει να γίνει μετά από αυτό
  return st;
}
// Κωδικοί θέσεων (rev 3): όσες θέσεις δεν έχουν κωδικό παίρνουν τον προεπιλεγμένο του εντύπου (Θ1α…Θ4β στη ΣΒΕΝ,
// Θ1…Θ4, ΟΠ1…ΟΠ4, Σ3α… στη ΣΠΕΝ, Μ1…Μ5, ΛΥ, ΔΥ, ΤΑΕ)· οι δικές σου υπηρεσίες γράμμα + αριθμό (Υ1, Υ2…), χωρίς να
// πέφτουν πάνω σε κωδικό που υπάρχει ήδη. Πρώτα οι κωδικοί του εντύπου και στα δύο έντυπα, μετά οι δικές σου: αλλιώς
// δική σου υπηρεσία θαλαμοφυλάκων στη ΣΒΕΝ θα έπαιρνε τα Θ1, Θ2 της ΣΠΕΝ και οι θαλαμοφύλακες της ΣΠΕΝ θα γίνονταν Θ3…Θ6
export function withCodes(st: Settings): Settings {
  const owner = new Map<string, string>();   // κλειδί κωδικού → θέση που τον έχει
  for (const b of everyBlock(st)) for (const p of b.posts) if (p.code) owner.set(codeKey(p.code), p.k);
  const free = (c: string, k: string) => { const o = owner.get(codeKey(c)); return o == null || o === k; };
  const fill = (ph: BasePhase, list: BlockDef[] | undefined, own: boolean) => (list || []).map(b => ({ ...b, posts: b.posts.map((p, i) => {
    if (p.code) return p;
    let c = defaultCode(ph, b.id, p.k);
    if (!c || !free(c, p.k)) { if (!own) return p; let n = i + 1; do c = KIND_CODE[b.kind] + n++; while (!free(c, p.k)); }
    owner.set(codeKey(c), p.k);
    return { ...p, code: c };
  }) }));
  const blocks = fill('sven', st.blocks, false), blocksSpen = fill('spen', st.blocksSpen, false);
  const own = (st.phases || []).map(x => ({ ...x, blocks: fill(x.base, x.blocks, false) }));
  return { ...st, blocks: fill('sven', blocks, true), blocksSpen: fill('spen', blocksSpen, true), ...(st.phases ? { phases: own.map(x => ({ ...x, blocks: fill(x.base, x.blocks, true) })) } : {}) };
}
// Ο κωδικός του εντύπου για μια θέση (ΣΒΕΝ/ΣΠΕΝ, υπηρεσία, θέση), όπως στις προεπιλογές
const DEF_CODES = new Map<string, string>();
for (const [ph, list] of [['sven', DEFAULT_BLOCKS], ['spen', DEFAULT_BLOCKS_SPEN]] as const) for (const b of list) for (const p of b.posts) if (p.code) DEF_CODES.set(ph + '|' + b.id + '|' + p.k, p.code);
export const defaultCode = (ph: BasePhase, block: string, k: string) => DEF_CODES.get(ph + '|' + block + '|' + k);
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
  weaponLog: WeaponMove[];               // έξοδοι και είσοδοι όπλων από τον οπλοβαστό (καρτέλα Οπλισμός)
  dutyFix: DutyFix[];                    // διορθώσεις με το χέρι στις ώρες των ένοπλων υπηρεσιών, με λόγο (kv «dutyFix», shared/armed.ts)
  notes: Note[];                         // σημειώσεις του γραφείου: γενικές ή για στρατιώτη/στέλεχος, με προαιρετική υπενθύμιση (shared/notes.ts)
  dayPlan?: Record<ISODate, DayPlan>;    // αλλαγή ωρών/εκπαίδευσης για μία μέρα, πάνω από την ημέρα εβδομάδας (shared/returns.ts)
  backFix?: BackFix[];                   // διορθώσεις επιστροφής ανά άτομο, με λόγο (kv «backFix», shared/returns.ts)
  outNotes?: Record<ISODate, Record<number, string>>;   // παρατήρηση εξοδούχου/παραμένοντα τη μέρα: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)» (shared/weekend.ts)
  lastExpire: ISODate | '';               // πότε γράφτηκαν τελευταία στο Ιστορικό όσα έληξαν (για τις μέρες που η εφαρμογή ήταν κλειστή)
}
// Σημείωση (Michael, 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε»). Χωρίς pid και cid είναι γενική. rem: μέρα υπενθύμισης·
// βγαίνει στο «Σήμερα» από εκείνη τη μέρα και μετά, μέχρι να ολοκληρωθεί. done: πότε ολοκληρώθηκε (μένει στις «Ολοκληρωμένες»)
// pids/cids: οι στρατιώτες και τα στελέχη στα οποία δένεται (καθόλου = γενική)· pid/cid: μόνο της πρώτης έκδοσης, μετατρέπονται στη φόρτωση (normNote)
export interface Note { id: string; text: string; at: ISODate; pids?: number[]; cids?: string[]; pid?: number; cid?: string; rem?: ISODate; star?: boolean; done?: ISODate }
// Κίνηση όπλου (Michael, 18/10: «όπως οι εξοδούχοι»): βγαίνει από τον οπλοβαστό με λόγο από τη λίστα «Λόγοι εξόδου όπλου»
// (ΕΚΠ, ΒΟΛΗ…) και ώρα, και μπαίνει με τον λόγο εισαγωγής του (ΛΗΞ ΕΚΠ…) και ώρα. Χωρίς inDay: είναι ακόμα εκτός.
// weapon: ο αριθμός όπλου τη στιγμή της εξόδου. Ώρες ΩΩ:ΛΛ, γράφονται μόνες τους (τώρα) και διορθώνονται.
export interface WeaponMove { id: string; pid: number; weapon: string; reason: string; outDay: ISODate; outTime: string; inDay?: ISODate; inTime?: string; inReason?: string; note?: string }
// Διόρθωση ώρας ένοπλου νούμερου (Michael, 24/10): πάνω στο αυτόματο, για τη γραμμή (μέρα κύκλου, θέση, πρώτο νούμερο). out/in:
// «ΕΕΕΕ-ΜΜ-ΗΗ ΩΩ:ΛΛ» (η ώρα μπορεί να πέφτει την άλλη μέρα)· λείπει = όπως βγαίνει αυτόματα. Χωρίς αντίστοιχο νούμερο, αγνοείται.
export interface DutyFix { id: string; day: ISODate; post: string; n: number; out?: string; in?: string; why: string }
// Υπηρεσία χωρίς θέση: μετρά στα σύνολα, στην ανάπαυση και στις αργίες· όχι στον κανόνα του ίδιου νούμερου
export interface SeatlessDuty { pid: number; kind: DutyKind }
export type DutyLog = Record<ISODate, SeatlessDuty[]>;
// Αίτηση στρατιώτη για την ΗΚΑΙ: «Ο ΣΤΡ … αιτείται {text}.»
// Αίτηση στην ΗΚΑΙ (5. ΑΙΤΗΣΕΙΣ). Αίτηση άδειας (leave): ο Διοικητής την εγκρίνει ή την απορρίπτει· με την έγκριση γίνεται άδεια
// (Status με req = το id της αίτησης). Στην ΗΚΑΙ γράφεται μόνο η αίτηση, μία φορά, όχι και στο 3. ΑΔΕΙΕΣ (Michael, 18/10).
// text: ό,τι αιτείται· στην άδεια η αιτιολόγηση (μπορεί να είναι κενή)
// Ώρες αναχώρησης/επιστροφής προαιρετικές (Michael, 21/10): γράφονται στην αίτηση και περνούν στην άδεια με το «Εγκρίθηκε»
export interface LeaveAsk { type: 'LEAVE' | 'HON'; kind?: string; from: ISODate; to: ISODate; fromTime?: string; toTime?: string }
export interface PersonRequest { id: string; pid: number; date: ISODate; text: string; leave?: LeaveAsk; decision?: 'ok' | 'no'; decided?: ISODate; sid?: string }
// Στελέχη (καρτέλα «Στελέχη»): ονόματα, θέση, καταστάσεις της ΗΚΑΙ, που ταΐζουν και την ΗΚΑΙ
// origin: προέλευση (ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ…) · spec: Ο/Σ · am: αριθμός μητρώου · pos: η σειρά που όρισε ο χρήστης (ιεραρχία· χωρίς pos σε κανέναν, με τη σειρά της ΗΚΑΙ)
// monthMax: ΕΠΟΠ/ΟΒΑ που κάνουν υπηρεσίες (Michael, 21/10): πόσες τον μήνα το πολύ· pid: ο αριθμός του στις θέσεις των
// Υπηρεσιών (αρνητικός, για να μη συμπέσει με στρατιώτη), δίνεται μία φορά και μένει για το ιστορικό (rules.ts cadreSeat)
// Κάθε ενεργό στέλεχος μπαίνει με το χέρι σε οποιαδήποτε θέση (Michael, 26/10): παίρνει το pid τη στιγμή που μπαίνει πρώτη φορά
// στις θέσεις (commands.ts assign), όχι μόνο όσοι έχουν monthMax. weapon/wtype/rack/wpos: όπλο στελέχους, όπως του Person (ένοπλες θέσεις)
export interface Cadre { id: string; rank: string; origin?: string; hk: string; last: string; first: string; spec?: string; am?: string; phone?: string; role?: string; active: boolean; pos?: number; monthMax?: number; pid?: number; weapon?: string; wtype?: string; rack?: string; wpos?: string }
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
// Στήλες κωλυομένων της ΗΚΑΙ που διαλέγει η δήλωση του κωλυόμενου: οι πρώτες επτά του CADRE_ABS (Υπηρεσία, ΕΥ, Τιμ., Ο/Σ, Μαγειρεία…)
export const KOL_COLS: [string, string][] = CADRE_ABS.slice(0, 7).map(([k, l]) => [k, k === 'yp' ? 'Υπηρεσία' : l]);
export const KOL_DEFAULT_COL = 'yp';
// Η στήλη της ΗΚΑΙ ενός κωλυόμενου (άκυρη ή λείπει: Υπηρεσία)
export const kolColOf = (s: { hkCol?: string }): string => (KOL_COLS.some(x => x[0] === s.hkCol) ? s.hkCol! : KOL_DEFAULT_COL);
export const kolColName = (k: string): string => KOL_COLS.find(x => x[0] === k)?.[1] || k;
// Προηγούμενες υπηρεσίες ανά είδος (+ πόσες σε ΣΚ/αργία), γραμμένες με το χέρι
export type Baseline = Partial<Record<DutyKind, number>> & { hol?: number };
// Ό,τι στην ΗΚΑΙ δεν βγαίνει από την εφαρμογή: αριθμοί ανά βαθμό και στήλη, και κείμενα της πίσω σελίδας
// lv: 3. ΑΔΕΙΕΣ ναι/όχι για τη μέρα (λείπει = η προεπιλογή των Ενοτήτων)· μπαίνει με τον διακόπτη της μέρας ή όταν βγαίνει το Excel
export interface HkaiManual { cells: Record<string, Record<string, number>>; text: Record<string, string>; lv?: boolean }

export const emptyState = (): AppState => ({
  people: [], statuses: [], guards: {}, caps: {}, rules: { ...DEFAULT_RULES }, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), printed: {}, baseline: {}, hkaiManual: {}, cadreList: [], cadreAbs: [], requests: [], notes: [], dutyLog: {}, nightTraining: {}, weaponLog: [], dutyFix: [], dayPlan: {}, backFix: [], outNotes: {}, lastExpire: ''
});
