// «Όλη η δύναμη» of a day (Michael, 30/10): every person of the force once, in one group, and the sum closes.
//
// Purpose: `dayBook` (the group of each person), the groups in the order of the form (`DAY_GROUPS`, `DayGroup`,
//   `DayRow`) and the list «Δ. ΠΟΤΕ ΓΥΡΙΖΟΥΝ» (`whenList`, `DayWhen`).
// Does NOT: write the Excel file (src/main/exports.ts does), save anything, or have rules of its own for the returns:
//   they come from core/outs/returns.ts.
// Owner layer: core/outs (no fs, no Electron, no React); imports outsStay.ts, returns.ts, weekend.ts, core/duty.
// Why: Α + Β + Γ = the active people. The sorting rules have an order of priority and come only from the functions that
//   the screen and the other Excel files already use (returnOf, leaveEnd, retFor, stillOut, outHeldBy, postOf,
//   statusesFrom, dayTimes): one source.
//   Α. go out today (were inside): A1 ΔΝ, A2 outs, A3 leave today
//   Β. already out (left before): B1 leave, B2 hospital, B3 ΔΝ/out since yesterday that did not return
//   Γ. stay in tonight: G1 duty, G2 penalty, G3 ΣΤΕΠ/blocked/medical, G4 return today and stay, G5 did not go out
// Covering tests: test/outs-day.test.ts, test/outs-combos.test.ts, test/outs-all.test.ts,
//   test/strength-consistency.test.ts.
import type { ISODate } from '../lib/dates';
import { addDays, dm } from '../lib/dates';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { mins } from '../statuses/hours';
import { activePeople } from '../duty/indexes';
import { postOf } from '../duty/posts';
import { statusesFrom } from '../duty/statuses';
import { awayOn, leaveEnd, leaveOut, outHeldBy, retFor, retOrd, returnOf, stillOut, type Ret } from './returns';
import { dayTimes } from './dayTimes';
import { retDay } from './retText';
import { byRoom } from './outsStay';
import { statNoOut } from '../statuses/stat';
import { live, isAway } from '../people/kinds';
import { dutyAt } from './weekend';
import { upper } from '../lib/text';

/** The groups: Α (go out today), Β (already out), Γ (stay in tonight). */
export type DayGroup = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
/**
 * One person of the day. `st`: the out/ΔΝ of the day (otherwise the leave, or the out/ΔΝ that still holds him out);
 * `lv`: the leave/hospital of the day; `warn`: ΠΡΟΣΟΧΗ for the office.
 */
export interface DayRow {
  p: Person;
  g: DayGroup;
  r: Ret | null;
  why: string;
  st?: Status;
  lv?: Status;
  warn?: string;
}
/** The groups in the order of the form: [group, section Α/Β/Γ, title]. */
export const DAY_GROUPS: [DayGroup, 'A' | 'B' | 'G', string][] = [
  ['A1', 'A', 'ΜΕ ΔΝ'],
  ['A2', 'A', 'ΕΞΟΔΟΥΧΟΙ'],
  ['A3', 'A', 'ΦΕΥΓΟΥΝ ΓΙΑ ΑΔΕΙΑ'],
  ['B1', 'B', 'ΣΕ ΑΔΕΙΑ'],
  ['B2', 'B', 'ΝΟΣΟΚΟΜΕΙΟ'],
  ['B3', 'B', 'ΔΝ ΑΠΟ ΧΘΕΣ / ΔΕΝ ΓΥΡΙΣΑΝ'],
  ['G1', 'G', 'ΥΠΗΡΕΣΙΑ'],
  ['G2', 'G', 'ΠΟΙΝΗ'],
  ['G3', 'G', 'ΣΤΕΠ / ΚΩΛΥΟΜΕΝΟΙ / ΙΑΤΡΙΚΑ'],
  ['G4', 'G', 'ΓΥΡΙΖΟΥΝ ΣΗΜΕΡΑ ΚΑΙ ΜΕΝΟΥΝ'],
  ['G5', 'G', 'ΔΕΝ ΒΓΗΚΑΝ'],
];
const isOut = (x: Status) => TYPES[x.type].cat === 'out';
// when the ΔΝ/out of day x came back (and when that day a leave ended too: leaveEnd)
const back = (s: AppState, pid: number, x: ISODate) =>
  returnOf(s, pid, x) ?? leaveEnd(s, pid, x, awayOn(s, pid, x))?.r ?? null;

/** The group of every active person on day `d`, by room and name. */
export function dayBook(s: AppState, d: ISODate): DayRow[] {
  const y = addDays(d, -1),
    T = mins(dayTimes(s, d).out),
    rows: DayRow[] = [];
  for (const p of activePeople(s)) {
    const now = awayOn(s, p.id, d),
      outs = now.filter(isOut),
      lv = now.filter((x) => !isOut(x));
    const R = (g: DayGroup, r: Ret | null, why = '', x: Partial<DayRow> = {}) => rows.push({ p, g, r, why, ...x });
    // with a duty AND an out/ΔΝ (against the rules) he stays an out, with a warning
    const duty = () => {
      const u = dutyAt(s, d, p.id);
      return u ? { warn: 'ΠΡΟΣΟΧΗ: ΚΑΙ ΥΠΗΡΕΣΙΑ ' + upper(u.label) + (u.time ? ' ' + u.time : '') } : {};
    };
    if (lv.length) {
      const r = retFor(s, p.id, d);
      const atT = statusesFrom(live(s), p.id, d, T).filter(
        (x) => isAway(x, s.settings.lists) && !isOut(x) && !x.pending,
      );
      if (outs.length) {
        const o = outs.find((x) => x.type === 'DN') || outs[0];
        // the leave ends today and today an out/ΔΝ (leaveOut, rule 26/10), or it ended before the out: an out/ΔΝ of the
        // day, as in the Δύναμη (Michael, 30/10: a leave until 22:00 and an out was «on leave»)
        if (leaveOut(s, p.id, d, T) || !atT.length) {
          R(o.type === 'DN' ? 'A1' : 'A2', r, 'τέλος άδειας + έξοδος', { st: o, lv: lv[0], ...duty() });
          continue;
        }
        R(lv.some((x) => x.type === 'NOS') ? 'B2' : 'B1', r, 'άδεια + έξοδος', { st: o, lv: lv[0] });
        continue;
      }
      if (!atT.length) {
        // back from leave before the out, but yesterday's ΔΝ/out holds him out («returns later»): out, as in Δύναμη
        const h = postOf(s, d, p.id) ? null : outHeldBy(s, p.id, d, T);
        if (h) {
          R('B3', h.r, 'held', { st: h.st, lv: lv[0] });
          continue;
        }
        R('G4', r, 'γύρισε πριν την έξοδο', { lv: lv[0] });
        continue;
      }
      const l = atT.find((x) => x.type === 'NOS') || atT[0];
      const yAway = awayOn(s, p.id, y);
      const yb = yAway.some(isOut) ? back(s, p.id, y) : null;
      // continues from yesterday: a ΔΝ/out that did not return, or another leave that ends after yesterday's
      const contFromOut = !!yb && !yb.leaveAt && (!!yb.open || !!yb.pending || yb.day > d);
      const contFromLeave = yAway.some((x) => !isOut(x) && x.to > y);
      if (l.from === d && !contFromOut && !contFromLeave) {
        R('A3', r, '', { lv: l });
        continue;
      }
      if (r && !r.open && !r.pending && r.day === d) {
        R('G4', r, 'γυρνά απόψε', { lv: l });
        continue;
      }
      R(l.type === 'NOS' ? 'B2' : 'B1', r, '', { lv: l });
      continue;
    }
    if (outs.length) {
      const dn = outs.find((x) => x.type === 'DN');
      const r = returnOf(s, p.id, d);
      const yb = awayOn(s, p.id, y).some(isOut) ? back(s, p.id, y) : null;
      // yesterday ΔΝ/out and he did not return by the out time: already out
      const away = !!yb && (yb.open || yb.pending || yb.day > d || (yb.day === d && !!yb.time && mins(yb.time) >= T));
      R(away ? 'B3' : dn ? 'A1' : 'A2', r, '', { st: dn || outs[0], ...(away ? {} : duty()) });
      continue;
    }
    // nothing today, but held out: correction «returns later/does not return», or a ΔΝ whose return is not declared yet
    const h =
      stillOut(s, p.id, d) ||
      (() => {
        const x = outHeldBy(s, p.id, d, T);
        return x && x.r && x.r.pending ? { st: x.st, r: x.r } : null;
      })();
    const post = postOf(s, d, p.id);
    if (h && !post) {
      R('B3', h.r, 'held', { st: h.st });
      continue;
    }
    if (post) {
      // the duty counts above the correction, but the office must know
      R('G1', null, '', stillOut({ ...s, guards: {} }, p.id, d) ? { warn: 'ΠΡΟΣΟΧΗ: Η ΔΙΟΡΘΩΣΗ ΛΕΕΙ ΕΞΩ' } : {});
      continue;
    }
    const ss = statusesFrom(live(s), p.id, d, T);
    if (
      ss.some((x) => x.type === 'PUN') ||
      s.statuses.some((x) => x.pid === p.id && x.type === 'PUN' && x.pending && x.from <= d && d <= x.to)
    ) {
      R('G2', null);
      continue;
    }
    if (ss.some((x) => x.type === 'STEP' || x.type === 'KOL' || statNoOut(x, s.settings.lists))) {
      R('G3', null);
      continue;
    }
    R('G5', null);
  }
  // by room and name inside each group
  return rows.sort((a, b) => byRoom(a.p, b.p));
}

/** One time of return with the people who come back then. */
export interface DayWhen {
  when: string;
  r: Ret;
  rows: DayRow[];
}
/**
 * Δ. ΠΟΤΕ ΓΥΡΙΖΟΥΝ: the people of Α, Β and Γ4, grouped by day and time of return, in the order of `returnsOn` (those
 * without an end last).
 */
export function whenList(rows: DayRow[]): DayWhen[] {
  const m = new Map<string, DayWhen>();
  // per time of return (day and time), not per reason: «Σάββατο 31/10 06:00» one line for all the ΔΝ
  const at = (r: Ret) =>
    r.pending ? r.why + ' ' + dm(r.day) : r.open ? 'χωρίς λήξη' : retDay(r) + ' ' + (r.time || 'πρωί');
  for (const x of rows)
    if (x.r && /^[AB]|^G4/.test(x.g)) {
      const k = at(x.r);
      const l = m.get(k);
      if (l) l.rows.push(x);
      else m.set(k, { when: k, r: x.r, rows: [x] });
    }
  return [...m.values()].sort((a, b) => retOrd(a.r).localeCompare(retOrd(b.r)) || a.when.localeCompare(b.when, 'el'));
}
