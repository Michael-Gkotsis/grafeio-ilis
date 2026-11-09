// The four tables of the Έντυπα values: Βγαίνουν ΔΝ, Βγαίνουν εξοδούχοι, Γυρίζουν απόψε, Γυρίζουν αύριο.
//
// Purpose: `outsTables`, `OutRow`, `OutsTables`, `whenTxt`, `whyTxt`.
// Does NOT: compute the returns.
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core.
// Why: The Excel «Σε 4 πίνακες» was replaced by «Όλη η δύναμη» (outsDay.ts); the tables stay as values.
// Covering tests: test/outs-tables.test.ts, test/outs-all.test.ts, test/outs-snapshot.test.ts.
import { addDays, dm, DOW_FULL, type ISODate, weekday } from '../lib/dates';
import { collator } from '../lib/text';
import { activePeople } from '../duty/indexes';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { type Status, TYPES } from '../model/status';
import { dayTimes } from './dayTimes';
import { OBVIOUS, retWhy } from './retText';
import { awayOn, hasOut, leaveBack, leaveEnd, type Ret, returnOf, stillOut } from './returns';
import { outLbl } from './weekend';
import { leavePhrase } from '../people/kinds';
import { mins } from '../statuses/hours';

/**
 * The four tables (Michael, 26/10; they were the Excel «Σε 4 πίνακες», now values of the Έντυπα): who goes where is
 * judged by what was declared yesterday / today and by whether today has training.
 * `dn`: inside and leaving today with ΔΝ (and yesterday's ΔΝ who returned in the morning because he has training and
 * leaves again); `out`: inside and leaving today as outs; `tonight`: yesterday's ΔΝ who are outs today (they did not
 * return in the morning) and whoever ends a leave today; `tomorrow`: today's ΔΝ, whoever continues ΔΝ from yesterday
 * (today without training: only here, not in `dn`) and the leaves that end tomorrow.
 * A leave that ends today: ΔΝ today -> he does not return tonight, he returns by the rule of the ΔΝ (`returnOf`); out
 * today -> returns at the time of the outs; otherwise at the time of the leave (`leaveBack`). `returnOf` / `leaveBack`
 * do not change.
 * @decision Michael 26/10: the four tables.
 */
export interface OutRow {
  p: Person;
  st?: Status;
  r: Ret;
  when: string;
  why: string;
  key: string;
}

/** The four tables: `dn`, `out`, `tonight`, `tomorrow` (see `OutRow`). */
export interface OutsTables {
  dn: OutRow[];
  out: OutRow[];
  tonight: OutRow[];
  tomorrow: OutRow[];
}

/**
 * When somebody returns, as a short text: «απόψε 22:00», «σήμερα 14:00», «αύριο 06:00», «αύριο πρωί», «Δευτέρα 26/10
 * 06:00», «δεν γυρνά», «άγνωστο».
 */
export function whenTxt(s: AppState, d: ISODate, r: Ret): string {
  if (r.pending) return 'άγνωστο';
  if (r.open) return 'δεν γυρνά';
  if (r.day === d)
    return r.time && mins(r.time) < mins(dayTimes(s, d).out)
      ? 'σήμερα ' + r.time
      : 'απόψε' + (r.time ? ' ' + r.time : '');
  if (r.day === addDays(d, 1)) return 'αύριο ' + (r.time || 'πρωί');
  return DOW_FULL[weekday(r.day)] + ' ' + dm(r.day) + ' ' + (r.time || 'πρωί');
}

// Why he returns: the reason (ΔΝ, out, kind of leave) and, if it is not obvious, whatever else the «Ποιοι γυρίζουν»
// says (ΔΝ ως την Κυριακή, υπηρεσία Λ/Υ από 14:00, correction…, leaves for a leave 14:00).
function whyTxt(r: Ret, base: string, plain = false): string {
  const { why, leave } = retWhy(r);
  if (r.base) return [why, leave].filter(Boolean).join(', ');
  const more = r.duty ? 'υπηρεσία ' + why : plain || OBVIOUS.test(why) ? '' : why;
  return [base, more, leave].filter(Boolean).join(', ');
}

const leaveName = (x: Status) =>
  x.type === 'LEAVE' ? leavePhrase(x) : x.type === 'NOS' ? 'νοσοκομείο' : TYPES[x.type].long;

const byRoomName = (a: OutRow, b: OutRow) =>
  (a.p.room ?? 99) - (b.p.room ?? 99) || collator.compare(a.p.last, b.p.last) || collator.compare(a.p.first, b.p.first);

/** Builds the four tables of the Έντυπα values for day `d` (see `OutRow`). */
export function outsTables(s: AppState, d: ISODate): OutsTables {
  const y = addDays(d, -1),
    n = addDays(d, 1);
  const t: OutsTables = { dn: [], out: [], tonight: [], tomorrow: [] };
  const row = (p: Person, st: Status | undefined, r: Ret, base: string, plain = false): OutRow => ({
    p,
    st,
    r,
    when: whenTxt(s, d, r),
    why: whyTxt(r, base, plain),
    key: r.pending || r.open ? r.day + ' 99:99' : r.day + ' ' + (r.time || dayTimes(s, r.day).backDn),
  });
  // when the ΔΝ / out of day x returns, and when a leave also ended that day (leaveEnd)
  const back = (pid: number, x: ISODate) => returnOf(s, pid, x) ?? leaveEnd(s, pid, x, awayOn(s, pid, x))?.r ?? null;
  for (const p of activePeople(s)) {
    const now = awayOn(s, p.id, d);
    if (!now.length) {
      // still out from an older day with a correction «returns …» (without a status of his own today): he returns today
      // or tomorrow
      const h = stillOut(s, p.id, d);
      if (h && !h.r.open && (h.r.day === d || h.r.day === n))
        (h.r.day === d ? t.tonight : t.tomorrow).push(row(p, h.st, h.r, outLbl(h.st)));
      continue;
    }
    const rd = returnOf(s, p.id, d);
    if (rd) {
      const dn = now.find((x) => x.type === 'DN'),
        st = dn || now.find(hasOut)!;
      if (dn) {
        // yesterday ΔΝ and he did not return in the morning (today without training, ΔΝ ΣΚ, correction): he continues,
        // he does not «go out» today
        const prev = back(p.id, y);
        if (!(prev && !prev.pending && (prev.open || prev.day > d))) t.dn.push(row(p, dn, rd, outLbl(dn)));
        if (rd.day === n && !rd.open) t.tomorrow.push(row(p, dn, rd, outLbl(dn)));
      } else {
        // yesterday ΔΝ (and with a leave that ended yesterday) and an out today: he did not return, he returns tonight;
        // with a correction for tomorrow only in the 4th
        const prevDn = awayOn(s, p.id, y).some((x) => x.type === 'DN') && !!back(p.id, y);
        if (!prevDn) t.out.push(row(p, st, rd, 'έξοδος'));
        else if (rd.day !== n || rd.open) t.tonight.push(row(p, st, rd, 'ΔΝ χθες, έξοδος'));
        if (rd.day === n && !rd.open) t.tomorrow.push(row(p, st, rd, prevDn ? 'ΔΝ χθες, έξοδος' : 'έξοδος'));
      }
      continue;
    }
    const lv = now.find((x) => !hasOut(x));
    if (!lv) continue;
    const out = now.find(hasOut);
    // a leave that ends today and an out / ΔΝ today: the rule of the ΔΝ / out (leaveEnd, or leaveBack when another
    // leave follows)
    const le =
      leaveEnd(s, p.id, d, now) ?? (out ? ((b: Ret) => (b.base ? { out, r: b } : null))(leaveBack(s, p.id, d)) : null);
    if (le) {
      const r2 = le.r;
      if (r2 && !r2.open) {
        if (le.out.type === 'DN') {
          if (r2.day === n) t.tomorrow.push(row(p, le.out, r2, ''));
        } else t.tonight.push(row(p, le.out, r2, ''));
      }
      continue;
    }
    if (out) continue;
    const b = leaveBack(s, p.id, d);
    if (b.open || b.pending || (b.day !== d && b.day !== n)) continue;
    (b.day === d ? t.tonight : t.tomorrow).push(row(p, undefined, b, leaveName(lv), true));
  }
  t.dn.sort(byRoomName);
  t.out.sort(byRoomName);
  const byTime = (a: OutRow, b: OutRow) => a.key.localeCompare(b.key) || byRoomName(a, b);
  t.tonight.sort(byTime);
  t.tomorrow.sort(byTime);
  return t;
}
