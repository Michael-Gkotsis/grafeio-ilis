// The soldier record and how a person's name is written.
//
// Purpose: the `Person` type, the one-off duty exceptions (`Skip`), the namesake rule («του <πατρώνυμο>» after a name
//   shared by two people) and the name/room text helpers.
// Does NOT: know statuses, duties or settings, and does not decide who is on duty.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: `Person` is the root of the domain; every other model file may import it, it imports nothing above core/lib.
// Covering tests: test/namesakes.test.ts, test/personal.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';

/**
 * One-off exclusion of a person from duties: from–to (both days count), optional reason.
 * @decision Michael 24/10: one-off exceptions from duties, with dates.
 */
export interface Skip {
  id: string;
  from: ISODate;
  to: ISODate;
  why?: string;
}
/** A soldier. Optional fields are written only when set; Excel columns are noted where the app and the file differ. */
export interface Person {
  id: number;
  rank: string; // e.g. ΣΤΡ, ΔΝΕΑΣ, ΛΧΙΑΣ (without the origin)
  // origin (ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ…), a field of its own; printed before the rank in forms (ranks.ts rankTxt)
  origin?: string;
  spec: string; // Ο/Σ (specialty): ΠΖ, ΤΘ, ΜΧ…
  last: string;
  first: string;
  father: string;
  asm: string; // ΑΣΜ
  phone: string;
  room: number | null; // room 1–8
  si: string; // Σ.Ι.: Ι1, Ι2, Ι3 ΜΕ ΟΠΛΟ, Ι3 ΧΩΡΙΣ ΟΠΛΟ (formerly «Ι3 ΑΟΠΛΟ»), Ι4
  siCat?: string; // condition category for Ι3/Ι4 (ΟΡΘΟΠΑΙΔΙΚΟ…): app only, not in the Excel (si.ts)
  post: string | null; // post (ΚΨΜ, ΙΑΤΡΟΣ ΣΤΕΠ…)
  role: string | null; // ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…
  essos: string; // e.g. 2026 Γ΄
  attached: boolean; // attached (not posted)
  active: boolean; // false = out of the strength
  notes: string;
  dn?: boolean; // has the right to «ΔΝ» (permanent, set by the sergeant)
  weapon?: string; // weapon number: written only next to the Λ/Υ and Δ/Υ in the duty form
  wtype?: string; // weapon type (G3A3…), from the list «Τύποι όπλων»: app and the «Οπλισμός» Excel only
  rack?: string; // slot in the weapon rack (e.g. Ε6)
  wpos?: string; // «Θέση» of the weapon (Michael, 18/10: a column in «Οπλισμός»), free text in capitals
  monthMax?: number; // ΕΠΟΠ/ΟΒΑ: at most this many duties a month (rules.ts monthBlock); set by hand only
  cid?: string; // cadre member in a duty seat (rules.ts cadreSeat): not in the strength sheet
  offDays?: number[]; // weekdays without duty (0 = Sunday … 6 = Saturday), permanent until changed
  skips?: Skip[]; // one-off exclusions from duties with dates (Υπηρεσίες › Εξαιρέσεις), in date order
  inOn?: ISODate; // joined the strength on this day («Νέος στρατιώτης» or a new strength row): «ΗΚΑΙ» 1. ΕΓΓΡΑΦΕΣ
  outOn?: ISODate; // left the strength on this day: «ΗΚΑΙ» 2. ΔΙΑΓΡΑΦΕΣ (dropped if he re-enters the strength)
  added?: boolean; // created in the app («Νέος στρατιώτης»): gets a new strength row until the next import
  // extra data (shared/personal.ts): IBAN/ΑΜΚΑ/ΑΦΜ columns of «ΣΥΝΟΛΙΚΟ» (from 3/11) and of «Έντυπα» (Michael, 4/11);
  // compact, no spaces
  iban?: string;
  amka?: string;
  afm?: string;
  // E-mail, relative's e-mail, blood group (shared/personal.ts): sheet «ΘΑΛΑΜΟΙ» of the strength and «Έντυπα» columns
  email?: string;
  relEmail?: string;
  blood?: string; // Α+, Α-, Β+, Β-, ΑΒ+, ΑΒ-, 0+, 0- (or text as it came from the Excel)
}

/** Start of the notes of people removed from the strength by a sheet «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» (not by hand). */
export const OUT_NOTE = 'Εκτός δύναμης';
// Namesakes (same last and first name): wherever the app shows or writes a name «του <father's name>» is added
// (Michael, 13/10). The others stay as they were. The set comes from the people of the current state (including
// those out of the strength): personMap, the database in main and the renderer root refresh it.
const nameKey = (p: { last: string; first: string }) =>
  normGreek(p.last).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(p.first).replace(/[^Α-ΩA-Z0-9]/g, '');
let twinKeys = new Set<string>();
let twinsFrom: Person[] | null = null;
/**
 * Rebuilds the set of namesake keys from `people`. Skips the work when the same array is passed again (reference
 * identity), so callers may call it on every state change. Module state: one set per thread (main, worker, UI).
 */
export function noteNamesakes(people: Person[]): void {
  if (people === twinsFrom) return;
  twinsFrom = people;
  const seen = new Set<string>();
  twinKeys = new Set();
  for (const p of people) {
    const k = nameKey(p);
    if (seen.has(k)) twinKeys.add(k);
    else seen.add(k);
  }
}
/** True when another person has the same last and first name (as of the last `noteNamesakes`). */
export const isNamesake = (p: { last: string; first: string }) => twinKeys.has(nameKey(p));
/** « του <father's name>» for a namesake with a known father's name, otherwise ''. */
export const fatherTxt = (p: Person) => (p.father && isNamesake(p) ? ' του ' + p.father : '');
/** Name without the father's name: where it is already shown next to it (a column or «του …» below). */
export const plainName = (p: Person) => p.last + ' ' + p.first;
/** Last and first name, plus the father's name for namesakes. */
export const fullName = (p: Person) => plainName(p) + fatherTxt(p);
/** Last name and the initial of the first name («ΠΑΠΑΣ Γ.»), plus the father's name for namesakes. */
export const shortName = (p: Person) => p.last + ' ' + (p.first ? p.first.charAt(0) + '.' : '') + fatherTxt(p);
/** Order of the weekdays on the card: Monday first (0 = Sunday). */
export const WEEK: number[] = [1, 2, 3, 4, 5, 6, 0];
/** «Θ4» for room 4, «—» for a person without a room. */
export const roomTxt = (p: Person) => (p.room == null ? '—' : 'Θ' + p.room);
