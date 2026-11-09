// Records the sergeant keeps besides statuses: notes, weapon moves, duty-time fixes, seatless duties and requests.
//
// Purpose: the types `Note`, `WeaponMove`, `DutyFix`, `SeatlessDuty`/`DutyLog`, `LeaveAsk`, `PersonRequest` and
//   `isWaiting`.
// Does NOT: normalise or apply them (core/notes, core/weapons, core/duty) or hold the AppState that contains them.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: they are stored in kv tables (frozen contract) and shared by commands, the database and the screens.
// Covering tests: test/notes.test.ts, test/weapons.test.ts, test/requests-approve.test.ts.
import type { ISODate } from '../lib/dates';
import type { DutyKind } from './duty';

/**
 * A note (Michael, 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε»). Without pid and cid it is general. rem: reminder day; it
 * shows in «Σήμερα» from that day on, until done. done: when it was completed (stays in «Ολοκληρωμένες»).
 * pids/cids: the soldiers and cadre members it is tied to (none = general); pid/cid: first version only, converted on
 * load (normNote).
 */
export interface Note {
  id: string;
  text: string;
  at: ISODate;
  pids?: number[];
  cids?: string[];
  pid?: number;
  cid?: string;
  rem?: ISODate;
  star?: boolean;
  done?: ISODate;
}
/**
 * A weapon move (Michael, 18/10: «όπως οι εξοδούχοι»): it leaves the rack with a reason from the list «Λόγοι εξόδου
 * όπλου»
 * (ΕΚΠ, ΒΟΛΗ…) and a time, and returns with its return reason (ΛΗΞ ΕΚΠ…) and time. Without inDay it is still out.
 * weapon: the weapon number at the time it went out. Times are HH:MM, written by themselves (now) and correctable.
 */
export interface WeaponMove {
  id: string;
  pid: number;
  weapon: string;
  reason: string;
  outDay: ISODate;
  outTime: string;
  inDay?: ISODate;
  inTime?: string;
  inReason?: string;
  note?: string;
}
/**
 * Correction of the time of an armed number (Michael, 24/10): on top of the automatic one, for the row (cycle day,
 * post,
 * first number). out/in: «YYYY-MM-DD HH:MM» (the time may fall on the next day); missing = as computed automatically.
 * Without a matching number it is ignored.
 */
export interface DutyFix {
  id: string;
  day: ISODate;
  post: string;
  n: number;
  out?: string;
  in?: string;
  why: string;
}
/** A duty without a post: counts in the totals, in the rest and in the holidays; not in the same-number rule. */
export interface SeatlessDuty {
  pid: number;
  kind: DutyKind;
}
/** Seatless duties per day. */
export type DutyLog = Record<ISODate, SeatlessDuty[]>;
/**
 * The leave part of a request. A soldier's request for the «ΗΚΑΙ» reads «Ο ΣΤΡ … αιτείται {text}.» (5. ΑΙΤΗΣΕΙΣ). A
 * leave
 * request (leave): the commander approves or rejects it; approval turns it into a leave (a Status with req = the id of
 * the
 * request). The «ΗΚΑΙ» gets only the request, once, not also 3. ΑΔΕΙΕΣ (Michael, 18/10).
 * text: what is requested; for a leave the reason (may be empty).
 * Departure/return times are optional (Michael, 21/10): written in the request and passed to the leave on «Εγκρίθηκε».
 * dest: destination (optional), passed to the leave on «Εγκρίθηκε».
 */
export interface LeaveAsk {
  type: 'LEAVE' | 'HON';
  kind?: string;
  from: ISODate;
  to: ISODate;
  fromTime?: string;
  toTime?: string;
  dest?: string;
}
/**
 * A request of a soldier. Approval for all requests (1/11): the other kind of request keeps only decision and decided.
 * old: an old request without an answer (before the version that brought approval to all): shown as «χωρίς απάντηση
 * (παλιά)» and not counted in «περιμένουν» (db.ts oldRequests).
 */
export interface PersonRequest {
  id: string;
  pid: number;
  date: ISODate;
  text: string;
  leave?: LeaveAsk;
  decision?: 'ok' | 'no';
  decided?: ISODate;
  sid?: string;
  old?: boolean;
}
/** Waiting for an answer: no decision and not old. */
export const isWaiting = (r: Pick<PersonRequest, 'decision' | 'old'>) => !r.decision && !r.old;
