// Statuses: the type table (what each kind blocks) and the dated status record.
//
// Purpose: `TYPES` (label, category and flags of every status kind: away, no duty, no armed seat, no out, light),
//   the `Status` record with its dates, `coversDay`, and `noPending`.
// Does NOT: apply the flags (core/duty and core/outs do) or read the Excel files that declare statuses.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: the flags ARE the sergeant's rule table (10 §2): changing a flag changes duties and outs everywhere.
// @decision Michael 17/10: penalties take effect at once, without approval (noPending).
// Covering tests: test/status-fix.test.ts, test/kolyomenoi.test.ts, test/rules.test.ts.
import type { ISODate } from '../lib/dates';
import { STEP_COL, kolColName } from './kol';

/** Key of a status kind. */
export type TypeKey =
  | 'EY'
  | 'EA'
  | 'EARV'
  | 'EO'
  | 'NOS'
  | 'STEP'
  | 'PUN'
  | 'LEAVE'
  | 'HON'
  | 'SICK'
  | 'OUT'
  | 'DN'
  | 'KOL';
/** Category of a status kind: medical, absence, out, other, penalty, prevented. */
export type Cat = 'med' | 'abs' | 'out' | 'other' | 'pun' | 'kol';
/**
 * Definition of a status kind. Flags: away = absent · noDuty = no duty at all · noArmed = no armed seat · noOut = does
 * not go out
 * · light = ΕΟ/ΕΑ (sergeant, 10/10): no kitchen, guard only if nobody else is available.
 */
export interface TypeDef {
  label: string;
  long: string;
  tone: string;
  cat: Cat;
  away?: boolean;
  noDuty?: boolean;
  noArmed?: boolean;
  noOut?: boolean;
  light?: boolean;
  hkai?: string; // «ΗΚΑΙ» column
  // prevented automatically: removed from the present in the strength; in the «ΗΚΑΙ» only if STEP_COL has a column
  // (rules.ts kolView)
  kolAuto?: boolean;
  code?: string; // code in the prevented-absent calendar
}
/** The table of status kinds. Labels and flags are the sergeant's rules; see the file header. */
export const TYPES: Record<TypeKey, TypeDef> = {
  EY: {
    label: 'ΕΥ',
    long: 'Ελεύθερος Υπηρεσίας',
    tone: 'ey',
    cat: 'med',
    noDuty: true,
    noOut: true,
    hkai: 'ey',
    code: 'Ε.Υ',
  },
  EA: { label: 'ΕΑ', long: 'Ελεύθερος Ασκήσεων', tone: 'ey', cat: 'med', noArmed: true, light: true, code: 'Ε.Α' },
  // no restriction on duties and outs (sergeant, 12/10)
  EARV: { label: 'ΕΑΡΒ', long: 'Ελεύθερος Αρβύλων', tone: 'ey', cat: 'med' },
  EO: { label: 'ΕΟ', long: 'Ελεύθερος Ορθοστασίας', tone: 'ey', cat: 'med', noArmed: true, light: true },
  STEP: {
    label: 'ΣΤΕΠ',
    long: 'Εισαγωγή ΣΤΕΠ',
    tone: 'ey',
    cat: 'other',
    noDuty: true,
    noArmed: true,
    noOut: true,
    kolAuto: true,
    // admission inside the camp: no duty, no out (Michael, 13-14/10); prevented automatically, removed from the present
    // in the strength and in «Σήμερα», not in a «ΗΚΑΙ» column (Michael, 29/10)
  },
  NOS: {
    label: 'Νοσοκομείο',
    long: 'Εισαγωγή σε νοσοκομείο',
    tone: 'bad',
    cat: 'other',
    away: true,
    noDuty: true,
    noOut: true,
    hkai: 'nos',
  },
  PUN: { label: 'Ποινή', long: 'Τιμωρημένος', tone: 'bad', cat: 'pun', noOut: true, hkai: 'tim' },
  LEAVE: {
    label: 'ΚΑ',
    long: 'Κανονική άδεια',
    tone: 'info',
    cat: 'abs',
    away: true,
    noDuty: true,
    noOut: true,
    hkai: 'ka',
    code: 'Κ.Α',
  },
  HON: {
    label: 'Τιμητική',
    long: 'Τιμητική άδεια',
    tone: 'info',
    cat: 'abs',
    away: true,
    noDuty: true,
    noOut: true,
    hkai: 'eid',
  },
  SICK: {
    label: 'Αναρρωτική',
    long: 'Αναρρωτική άδεια',
    tone: 'bad',
    cat: 'abs',
    away: true,
    noDuty: true,
    noOut: true,
    hkai: 'an',
    code: 'ΑΝ.ΑΔ',
  },
  OUT: { label: 'Εξοδούχος', long: 'Εξοδούχος', tone: 'warn', cat: 'out', away: true, noDuty: true },
  DN: { label: 'ΔΝ', long: 'Εξοδούχος με ΔΝ', tone: 'dn', cat: 'out', away: true, noDuty: true },
  // Prevented (Michael, 24/10): a duty that is not ours (e.g. ΣΤΕΠ). Present, on none of our duties; the out, the
  // removal
  // from the present and the «ΗΚΑΙ» column are set per declaration (Status.noOut, minus, hkCol, rules.ts kolView)
  KOL: { label: 'Κωλυόμενος', long: 'Κωλυόμενος (υπηρεσία εκτός δικών μας)', tone: 'warn', cat: 'kol', noDuty: true },
};
/** All status keys, in table order. */
export const TYPE_KEYS = Object.keys(TYPES) as TypeKey[];
/** The effects of a kind as one screen line («Απών · Καμία υπηρεσία · …»). */
export const effects = (t: TypeDef) =>
  [
    t.away && 'Απών',
    t.noDuty ? 'Καμία υπηρεσία' : t.noArmed && 'Όχι σε ένοπλη θέση',
    !t.noDuty && t.light && 'Όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος',
    t.noOut && 'Δεν βγαίνει έξοδο',
    t.kolAuto && 'Κωλυόμενος' + (STEP_COL ? ' (ΗΚΑΙ: ' + kolColName(STEP_COL) + ')' : ' (δεν μετρά σε στήλη της ΗΚΑΙ)'),
    t.cat === 'kol' && 'Έξοδος και ΗΚΑΙ όπως τα ορίζεις στη δήλωση',
  ]
    .filter(Boolean)
    .join(' · ');
/** Tooltip of a kind: its long name and its effects. */
export const typeTip = (t: TypeDef) => t.long + (effects(t) ? ': ' + effects(t) : '');
/** Categories shown in the «Ιατρικά / ποινές» records. */
export const RECORD_CATS: Cat[] = ['med', 'other', 'pun'];
/** Penalty kinds, as written in the penalty Excel and the «ΗΚΑΙ». */
export const PUN_KINDS = ['Περιορισμός', 'Κράτηση', 'Φυλάκιση', 'Στέρηση εξόδου'];
/** Leave kinds. The honorary leave is a type of its own (HON). */
export const LEAVE_KINDS = ['Κανονική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ'];

/** A status of a person over a date range (from–to, both days count; `open` = no end). */
export interface Status {
  id: string;
  pid: number;
  type: TypeKey;
  from: ISODate;
  to: ISODate;
  kind?: string; // kind of penalty / leave / ΕΑ-ΕΥ
  note?: string;
  pending?: boolean; // old: a penalty requested in the «ΗΚΑΙ» (Κ-19); penalties now apply at once (noPending)
  by?: string; // penalty: who punished
  reason?: string; // penalty: «διότι …»
  on?: ISODate; // penalty: date of the punishment (otherwise the start)
  open?: boolean; // no end: «έως» is empty in the Excel; `to` follows today (X4)
  fromTime?: string; // leave: departure time on the first day (HH:MM), shared/hours.ts
  toTime?: string; // leave: return time on the last day (HH:MM)
  req?: string; // leave approved from a «ΗΚΑΙ» request (PersonRequest.id)
  // leave: destination (Κόρινθος, Αθήνα…), optional; written in the «ΗΚΑΙ» only if the kind has the setting (ranks.ts
  // leaveText)
  dest?: string;
  minus?: boolean; // prevented: removed from the present and put in the «ΗΚΑΙ», in column hkCol
  // prevented: prevented-column of the «ΗΚΑΙ» (KOL_COLS), default yp «Υπηρεσία» for old declarations; '-' (KOL_NO_COL)
  // = none (Michael, 29/10)
  hkCol?: string;
  noOut?: boolean; // prevented: does not go out (otherwise he goes out as usual)
  // out ban: days of the penalty; `to` moves for every day with a duty or night training (shared/punish.ts)
  days?: number;
}
/**
 * Penalties apply at once, without approval (Michael, 17/10): those left as «requested» by an older version apply too.
 * Runs when the database opens and after every action (commands.ts apply). Returns the same object when nothing is
 * pending.
 */
export function noPending<S extends { statuses: Status[] }>(s: S): S {
  if (!s.statuses.some((x) => x.pending)) return s;
  return {
    ...s,
    statuses: s.statuses.map((x) => {
      if (!x.pending) return x;
      const y = { ...x };
      delete y.pending;
      return y;
    }),
  };
}
/**
 * Does the status apply on day d? An open one applies on every later day too: its `to` reaches only today, but duties
 * and outs are made for tomorrow and after (Χορβάτ, open ΣΤΕΠ, 13/10).
 */
export const coversDay = (s: { from: ISODate; to: ISODate; open?: boolean }, d: ISODate) =>
  s.from <= d && (!!s.open || d <= s.to);
