// When and why a person returns: outs, ΔΝ and leaves (Michael, 24/10).
//
// Purpose: `returnOf` (out or ΔΝ), `leaveBack` / `leaveEnd` (leave), `outHeld` / `awayAt` (absent at a time),
//   `stillOut`, `retFor`, `returnsOn`.
// Does NOT: print the texts (retText.ts) or build the four tables (outsTables.ts).
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core; imports core/duty low layer
//   (indexes, statuses, holidays, posts) and weekend.ts. Core/duty files that need this file import it, never the
//   reverse for the low layer.
// Why: Pure functions of the state. The «Αρχή εξόδου» of a day is valid also for people who return from a leave
//   (Michael, 1/11).
// Covering tests: test/returns.test.ts, test/return-hours.test.ts, test/return-one-source.test.ts,
//   test/leave-end.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import { activePeople } from '../duty/indexes';
import { postOf } from '../duty/posts';
import { hkMin, statusesOn } from '../duty/statuses';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { type Status, TYPES } from '../model/status';
import { dayTimes, onDay, theDay } from './dayTimes';
import { dutyAt, isSat, isWk } from './weekend';
import { isAway, live, statusLbl } from '../people/kinds';
import { backBy, hasTimes, mins } from '../statuses/hours';

/**
 * When and why somebody returns. `day` / `time`: when; `why`: why; `pending`: we do not know yet (the day `day` has not
 * been declared); `leaveAt`: returns and leaves again for a leave at that time; `duty` / `dutyTime`: returns for a
 * duty; `open`: does not return (no end, or the correction «continues»); `fix`: from a correction; `base`: a leave that
 * ends today with a ΔΝ / out today («τέλος άδειας, ΔΝ»): `why` stays the rule of the ΔΝ / out (`leaveEnd`).
 */
export interface Ret {
  day: ISODate;
  time: string;
  why: string;
  pending?: true;
  leaveAt?: string;
  duty?: string;
  dutyTime?: string;
  open?: true;
  fix?: true;
  base?: string;
}

const MAX_DAYS = 120;

/**
 * A leave / hospital that ends on day `d` with a time up to the ΗΚΑΙ time (e.g. ΚΑ until 06:00): he came back in the
 * morning and his day is normal. He does not «return today», neither in the «Ποιοι γυρίζουν» nor in Γ4; with a ΔΝ / out
 * today he is judged as if he had no leave.
 * @decision Michael 2/11: a leave that ends by the ΗΚΑΙ time does not «return today».
 */
export const backAm = (s: Pick<AppState, 'rules'>, x: Status, d: ISODate) =>
  TYPES[x.type].cat !== 'out' && backBy(x, d, hkMin(s.rules));

// The absences of a person on a day, with the ones that already ended by the ΗΚΑΙ time too, for the continuation of a
// leave on the next days (ΚΑ until tomorrow 06:00 returns tomorrow 06:00).
const awayAll = (s: AppState, pid: number, d: ISODate): Status[] =>
  statusesOn(live(s), pid, d).filter((y) => isAway(y, s.settings.lists) && !y.pending);

/** The absences of a person on a day without the leaves that ended by the ΗΚΑΙ time (`backAm`). */
export const awayOn = (s: AppState, pid: number, d: ISODate): Status[] =>
  awayAll(s, pid, d).filter((y) => !backAm(s, y, d));

const declIdx = new WeakMap<Status[], Map<ISODate, boolean>>();

// A day is "declared" when somebody has an out or ΔΝ that day (or an out remark): the Εξοδούχοι of the day have been
// filled in, and whoever has no out / ΔΝ stays. Otherwise we do not know whether the ΔΝ stays (the change of the hours
// of the day does not count: it may be entered in advance). The «ΔΝ ΣΚ» of the Saturday declares the Sunday too, even
// if he is not in the ΔΝ of that day (duty, penalty…).
function declared(s: AppState, d: ISODate): boolean {
  if (s.outNotes?.[d] && Object.keys(s.outNotes[d]).length) return true;
  let m = declIdx.get(s.statuses);
  if (!m) {
    m = new Map();
    declIdx.set(s.statuses, m);
  }
  let r = m.get(d);
  if (r === undefined) {
    const prev = addDays(d, -1);
    r = s.statuses.some(
      (x) =>
        !x.pending &&
        TYPES[x.type].cat === 'out' &&
        ((x.from <= d && d <= x.to) || (isWk(x) && isSat(prev) && x.from <= prev && prev <= x.to)),
    );
    m.set(d, r);
  }
  return r;
}

// The return on day `r.day`: if he has a duty, he returns for it (and earlier if the duty starts before the time).
function withDuty(s: AppState, pid: number, r: Ret): Ret {
  const duty = dutyAt(s, r.day, pid);
  if (!duty) return r;
  return {
    ...r,
    why: 'υπηρεσία',
    duty: duty.label,
    dutyTime: duty.time,
    ...(r.time && duty.time && duty.time < r.time ? { time: duty.time } : {}),
  };
}

export const hasOut = (x: Status) => TYPES[x.type].cat === 'out';

/**
 * A leave that ends today (`d`) and has a ΔΝ / out today (`now` = the absences of `d`): the ΔΝ / out wins and is judged
 * as if there were no leave (ΔΝ: he does not return tonight, he returns by the rule of the ΔΝ; out: at the time of the
 * outs). One source for the screen «Ποιοι γυρίζουν και πότε» (`leaveBack`) and for the 4 tables (`outsTables`). null:
 * does not apply (no leave / ΔΝ / out, or the leave continues tomorrow).
 */
export function leaveEnd(s: AppState, pid: number, d: ISODate, now: Status[]): { out: Status; r: Ret | null } | null {
  const out = now.find(hasOut);
  if (!out || !now.some((x) => !hasOut(x)) || awayAll(s, pid, addDays(d, 1)).some((x) => !hasOut(x))) return null;
  const free = { ...s, statuses: s.statuses.filter((x) => x.pid !== pid || hasOut(x) || !isAway(x, s.settings.lists)) };
  const r = returnOf(free, pid, d);
  return { out, r: r && { ...r, base: out.type === 'DN' ? 'τέλος άδειας, ΔΝ' : 'τέλος άδειας, έξοδος' } };
}

/**
 * When somebody who is out or ΔΝ on day `d` returns (the ΔΝ of `d` = night of `d` to the morning of `d+1`). null: he is
 * not out / ΔΝ (or he is absent otherwise).
 */
export function returnOf(s: AppState, pid: number, d: ISODate): Ret | null {
  const now = awayOn(s, pid, d);
  if (!now.some(hasOut) || now.some((x) => !hasOut(x))) return null;
  const fix = (s.backFix || []).find((f) => f.pid === pid && f.day === d);
  if (fix)
    return fix.stay
      ? { day: d, time: '', why: 'διόρθωση: ' + fix.why, open: true, fix: true }
      : { day: fix.at!.day, time: fix.at!.time, why: 'διόρθωση: ' + fix.why, fix: true };
  // out: returns the same evening
  if (!now.some((x) => x.type === 'DN')) return { day: d, time: dayTimes(s, d).backOut, why: 'εξοδούχος ' + onDay(d) };
  // ΔΝ: judged by what has been declared the next day `n`. If he has ΔΝ and that day he has no training, he continues
  // and is judged from the next day (ΔΝ ΣΚ). With training he returns in the morning (and leaves again for his own ΔΝ).
  let cur = d;
  for (let i = 0; i < MAX_DAYS; i++) {
    const n = addDays(cur, 1),
      t = dayTimes(s, n);
    const why = (plain: string) => (cur === d ? plain : 'ΔΝ ως ' + onDay(cur));
    const duty = dutyAt(s, n, pid);
    if (duty) return withDuty(s, pid, { day: n, time: t.backDn, why: '' });
    const on = awayAll(s, pid, n);
    const lv = on.find((x) => !hasOut(x));
    if (lv) {
      // a leave that starts after the return time of the ΔΝ: he returns and leaves at its time; until then he continues
      // on leave
      const at = lv.from === n && hasTimes(lv.type) && lv.fromTime ? lv.fromTime : '';
      if (at && mins(at) > mins(t.backDn)) return { day: n, time: t.backDn, why: why('μετά τη ΔΝ'), leaveAt: at };
      if (lv.open) return { day: n, time: '', why: 'χωρίς λήξη', open: true };
      const end: Ret =
        lv.toTime && hasTimes(lv.type)
          ? { day: lv.to, time: lv.toTime, why: 'τέλος ' + statusLbl(lv, s.settings.lists) }
          : {
              day: addDays(lv.to, 1),
              time: dayTimes(s, addDays(lv.to, 1)).backDn,
              why: 'τέλος ' + statusLbl(lv, s.settings.lists),
            };
      return withDuty(s, pid, end);
    }
    // out on the next day: with morning training he returns in the morning and leaves again at the out time, as with ΔΝ
    // (Michael, 2/11: ΔΝ ΣΚ and out on Monday came out as «ΔΝ από χθες» in Β3); without training (weekend, holiday) he
    // stays out until the outs return
    if (on.some((x) => x.type === 'OUT'))
      return t.train
        ? { day: n, time: t.backDn, why: why('πρωινή εκπαίδευση') }
        : { day: n, time: t.backOut, why: 'εξοδούχος ' + onDay(n) };
    if (on.some((x) => x.type === 'DN')) {
      if (t.train) return { day: n, time: t.backDn, why: why('πρωινή εκπαίδευση') };
      cur = n;
      continue;
    }
    if (declared(s, n)) return { day: n, time: t.backDn, why: why('μένει ' + onDay(n)) };
    if (t.train) return { day: n, time: t.backDn, why: why('πρωινή εκπαίδευση') };
    return { day: n, time: '', why: 'δεν έχει δηλωθεί ' + theDay(n), pending: true };
  }
  return { day: cur, time: '', why: 'χωρίς λήξη', open: true };
}

// Counts as absent the ΔΝ / out who has not returned yet at minute `m` (minutes) of day `from`? Whoever has not been
// declared when he returns (`pending`) stays absent.
const gone = (r: Ret | null, from: ISODate, m: number) =>
  !!r && (!!r.pending || !!r.open || r.day > from || (r.day === from && m < mins(r.time)));

/**
 * The out / ΔΝ that keeps the person outside on day `d` at `m` (minutes): that of the day from the out start to the
 * return, or that of the previous day (a ΔΝ that returns in the morning, a correction that returns later). null: he is
 * not outside. undefined: it is not judged by hours (a leave on the same day as the out: it counts as before, the whole
 * day). What is not an out / ΔΝ (leaves, hospital) counts elsewhere.
 */
export function outHeldBy(
  s: AppState,
  pid: number,
  d: ISODate,
  m: number,
): { st: Status; r: Ret | null } | null | undefined {
  const own = awayOn(s, pid, d),
    outs = own.filter(hasOut);
  if (outs.length) {
    if (own.some((x) => !hasOut(x))) {
      // a leave that ends today and an out / ΔΝ today (rule 26/10): from the out start he counts as out / ΔΝ, not as
      // leave (Michael, 30/10: leave until 22:00 and out, the Δύναμη had him among the absent on leave)
      const le = leaveOut(s, pid, d, m);
      if (le) return gone(le.r, d, m) ? { st: le.out, r: le.r } : null;
      // before the out start and the leave has already ended (Michael, 2/11: ΚΑ until 06:00 and ΔΝ today came out as
      // «ΔΝ» in the Απόντες from the morning): he is inside until the out, like whoever had no leave (only yesterday's
      // ΔΝ / out below remains)
      if (!(m < mins(dayTimes(s, d).out) && own.every((x) => hasOut(x) || backBy(x, d, m)))) return undefined;
    } else if (m >= mins(dayTimes(s, d).out)) {
      const r = returnOf(s, pid, d);
      if (gone(r, d, m)) return { st: outs.find((x) => x.type === 'DN') || outs[0], r };
    }
  }
  // the previous day and the corrections of older days that return later
  const prev = addDays(d, -1),
    days = [prev];
  for (const f of s.backFix || []) if (f.pid === pid && f.at && f.day < prev) days.push(f.day);
  for (const x of days) {
    const o = awayOn(s, pid, x).find(hasOut);
    if (o) {
      const r = returnOf(s, pid, x);
      if (gone(r, d, m)) return { st: o, r };
    }
  }
  return null;
}

/**
 * A leave that ends on day `d` and an out / ΔΝ on the same day, from the out start (`m` minutes) on: the out / ΔΝ
 * person and when he returns (`leaveEnd`; or `leaveBack` when a new leave starts tomorrow: the out / ΔΝ of the day is
 * judged without the leave that ended).
 */
export function leaveOut(s: AppState, pid: number, d: ISODate, m: number): { out: Status; r: Ret | null } | null {
  if (m < mins(dayTimes(s, d).out)) return null;
  const now = awayOn(s, pid, d),
    out = now.find(hasOut);
  if (!out || now.some((x) => !hasOut(x) && (x.open || x.to !== d))) return null;
  const le = leaveEnd(s, pid, d, now);
  if (le) return le;
  const b = leaveBack(s, pid, d);
  return b.base ? { out, r: b } : null;
}

/** The out / ΔΝ that keeps the person outside at `m` (see `outHeldBy`); undefined when it is not judged by hours. */
export function outHeld(s: AppState, pid: number, d: ISODate, m: number): Status | null | undefined {
  const h = outHeldBy(s, pid, d, m);
  return h ? h.st : h;
}

/** True when the person is away at `time` («HH:MM») on day `d`. */
export const awayAt = (s: AppState, pid: number, d: ISODate, time: string): boolean => !!outHeld(s, pid, d, mins(time));

/**
 * Still absent from an out / ΔΝ of an older day without a status of his own on day `d`, because the correction of the
 * office says «returns later» or «does not return»: at the out start of `d` he is outside. He is not a stay-in; he is
 * in the Εξοδούχοι with the out / ΔΝ of his day. With a duty on day `d` he is inside (the duty counts above the
 * correction).
 */
export function stillOut(s: AppState, pid: number, d: ISODate): { st: Status; r: Ret } | null {
  if (!s.backFix?.length || awayOn(s, pid, d).length || postOf(s, d, pid)) return null;
  const h = outHeldBy(s, pid, d, mins(dayTimes(s, d).out));
  return h && h.r?.fix ? { st: h.st, r: h.r } : null;
}

/**
 * When somebody who is in the Εξοδούχοι of `d` returns, as the «Ποιοι γυρίζουν και πότε» (`returnsOn`) says: out / ΔΝ
 * (`returnOf`), with a leave the same day (`leaveBack`: e.g. the leave ends today and tonight he has ΔΝ), or still out
 * from an older day with a correction (`stillOut`). The Remarks of the Excel always say «ΓΥΡΝΑ …» this way.
 */
export function retFor(s: AppState, pid: number, d: ISODate): Ret | null {
  const r = returnOf(s, pid, d);
  if (r) return r;
  if (awayOn(s, pid, d).some((x) => !hasOut(x))) return leaveBack(s, pid, d);
  return stillOut(s, pid, d)?.r ?? null;
}

/** One line of «Ποιοι γυρίζουν και πότε»: the person, the status and the return. */
export interface Back {
  p: Person;
  st: Status;
  r: Ret;
}

/**
 * Everybody who is away on day `d`, with when and why each returns (Εξοδούχοι, Σήμερα). Outs / ΔΝ: `returnOf`. Whoever
 * is away on leave or in hospital: until the end of it (as before), earlier if he has a duty.
 */
export function leaveBack(s: AppState, pid: number, d: ISODate): Ret {
  const le = leaveEnd(s, pid, d, awayOn(s, pid, d));
  if (le?.r) return le.r;
  let last = d,
    lastSt: Status | undefined,
    back: Ret | null = null,
    prev: Status[] = [];
  for (let i = 0, x = d; i < MAX_DAYS; i++, x = addDays(x, 1)) {
    const a = i ? awayAll(s, pid, x) : awayOn(s, pid, x);
    if (!a.length) break;
    if (i > 0) {
      // the leave ended the previous day with a return time (he is back), or today he has only an out / ΔΝ: it does not
      // continue, he returned at its end (30/10: leave until 14:00 and ΔΝ tomorrow said «returns tomorrow 06:00 after
      // the ΔΝ»). A leave and ΔΝ / out on the last day: the rule of the ΔΝ (`leaveEnd`).
      const lv = prev.filter((y) => !hasOut(y));
      if (a.every(hasOut) || lv.every((y) => !y.open && y.to === last && !!y.toTime && hasTimes(y.type))) {
        const o = prev.find(hasOut);
        if (o) {
          const le2 = leaveEnd(s, pid, last, prev);
          if (le2?.r) return le2.r;
          // a leave that ended with a time on the day of the out / ΔΝ and another leave after it: the out / ΔΝ of the
          // day is judged without the leave that ended
          const ended = new Set(lv.map((y) => y.id));
          const r = returnOf({ ...s, statuses: s.statuses.filter((y) => !ended.has(y.id)) }, pid, last);
          if (r) return { ...r, base: o.type === 'DN' ? 'τέλος άδειας, ΔΝ' : 'τέλος άδειας, έξοδος' };
        }
        break;
      }
    }
    prev = a;
    last = x;
    lastSt = a.find((y) => !hasOut(y)) || a[0];
    if (lastSt.open) {
      back = { day: x, time: '', why: 'χωρίς λήξη', open: true };
      break;
    }
    // a duty inside the days he is away: he returns for it
    const duty = i > 0 && dutyAt(s, x, pid);
    if (duty) {
      back = { day: x, time: duty.time, why: 'υπηρεσία', duty: duty.label };
      break;
    }
  }
  if (back) return back;
  const tl = statusLbl(lastSt!, s.settings.lists); // «τέλος ΚΑ», «τέλος ΥΠΗΡΕΣΙΑΚΟ»
  if (hasOut(lastSt!))
    back =
      lastSt!.type === 'OUT'
        ? { day: last, time: dayTimes(s, last).backOut, why: 'τέλος εξόδου' }
        : { day: addDays(last, 1), time: dayTimes(s, addDays(last, 1)).backDn, why: 'μετά τη ΔΝ' };
  else if (lastSt!.toTime && hasTimes(lastSt!.type)) back = { day: last, time: lastSt!.toTime, why: 'τέλος ' + tl };
  else back = { day: addDays(last, 1), time: '', why: 'τέλος ' + tl };
  return withDuty(s, pid, back);
}

/** «Ποιοι γυρίζουν και πότε»: everybody who is away on day `d`, with when and why each returns (Εξοδούχοι, Σήμερα). */
export function returnsOn(s: AppState, d: ISODate): Back[] {
  const out: Back[] = [];
  for (const p of activePeople(s)) {
    const now = awayOn(s, p.id, d);
    if (!now.length) continue;
    out.push({ p, st: now.find((y) => !hasOut(y)) || now[0], r: returnOf(s, p.id, d) || leaveBack(s, p.id, d) });
  }
  return out.sort((a, b) => retOrd(a.r).localeCompare(retOrd(b.r)) || a.p.last.localeCompare(b.p.last, 'el'));
}

/** Sort key of the returns: by day and time; the ones with no end last (and in «Όλη η δύναμη», Δ. Πότε γυρίζουν). */
export const retOrd = (r: Ret) => (r.open ? '9' : r.day + (r.duty ? '0' : r.pending ? '2' : '1') + (r.time || '23:59'));
