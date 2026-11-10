// Weapons, screen logic: the moves by reason, the search, the status hints and «stays OUT because of duty».
//
// Purpose: the lines of «Εκτός τώρα» (`openMoveList`, `moveKey`, `moveReasons`), the search (`personMatch`,
//   `seatQuery`, `seatMatch`, `moveMatch`, `moveFilter`), the ids for the group actions (`inIds`, `fixIds`), the
//   status hints (`statusHint`), the rule «stays OUT because of duty» (`stayOutByDuty`) and the counter of the
//   Σήμερα screen (`outCountOn`).
// Does NOT: draw anything, write a move or build the Excel (weaponSheets.ts does). Pure logic, no screen.
// Owner layer: core/weapons (no fs, no Electron, no React); imports weaponInfo.ts, weaponSheets.ts, weaponKeys.ts,
//   armed.ts and core/duty.
// Why: Michael, 24/10: every weapon counts once, in the header and in the list, whether it is out by a move or by an
//   armed duty; and an entry that is written while an armed number still holds the weapon leaves it OUT.
// Covering tests: test/weaponView.test.ts.
import { dm, type ISODate } from '../lib/dates';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import type { Person } from '../model/person';
import type { WeaponMove } from '../model/records';
import { armedLive, calDay, hmOf, type ArmRow, type ArmState } from './armed';
import { isAway, noDutyOf, statusLbl } from '../people/kinds';
import type { UserLists } from '../model/lists';
import { statusesOn } from '../duty/statuses';
import { normGreek, norm, translit } from '../lib/text';
import { posKey, rackKey, weaponKey } from './weaponKeys';
import { AUTO_KEY, outPeople, weaponInfo, type WeaponInfo } from './weaponInfo';
import { armMap, dutyMove, isAuto } from './weaponSheets';

// ---------- Moves: «Εκτός τώρα» ----------
/** The reason of each line for the chips: the manual one as written, or AUTO_KEY for an armed duty. */
export const moveKey = (m: WeaponMove) => (isAuto(m) ? AUTO_KEY : m.reason);
/**
 * The lines of «Εκτός τώρα»: all the open moves (also of those who left the force, so that the weapon can go in) and
 * the armed duties (today those that run now, otherwise all the numbers of the day). An armed duty is not added when
 * the weapon of its owner is already out by a move or the owner is out of force: so every weapon counts once, like in
 * the header.
 */
export function openMoveList(
  s: Pick<AppState, 'people' | 'settings' | 'weaponLog'> & { cadreList?: Cadre[] },
  info: WeaponInfo,
): WeaponMove[] {
  const act = new Set([...armMap(s).values()].filter((p) => p.active).map((p) => p.id)); // also cadre on an armed duty
  const open = (s.weaponLog || []).filter((m) => !m.inDay);
  const by = new Set(open.map((m) => m.pid));
  const rows: ArmRow[] = info.arm.live ? [...info.arm.cur.values()] : info.arm.rows;
  const auto = rows.filter((r) => act.has(r.owner) && !by.has(r.owner)).map((r) => dutyMove(s, r));
  return [...open, ...auto];
}
/** Chips of reasons with a counter: the manual ones by count, the «duty (automatic)» last. */
export function moveReasons(list: WeaponMove[]): [string, number][] {
  const n = new Map<string, number>();
  for (const m of list) {
    const k = moveKey(m);
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n].sort(
    (a, b) => Number(a[0] === AUTO_KEY) - Number(b[0] === AUTO_KEY) || b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

// ---------- Search ----------
/** Name, ΑΣΜ, weapon number, room, type, seat (without accents, each word apart). */
export function personMatch(p: Person, q: string): boolean {
  const n = normGreek(q.trim());
  if (!n) return true;
  const key = normGreek(
    [
      p.last,
      p.first,
      p.father,
      p.asm,
      p.rank,
      p.origin || '',
      p.spec,
      p.room != null ? 'Θ' + p.room : '',
      p.wtype || '',
      p.rack || '',
      p.wpos || '',
    ].join(' '),
  );
  const wk = weaponKey(q);
  return (
    n.split(/\s+/).every((t) => key.includes(t)) ||
    translit(p.last + ' ' + p.first).includes(norm(q.trim())) ||
    (!!wk && weaponKey(p.weapon).includes(wk))
  );
}
// A seat «Ε 23» or «Ε23» (rack + seat): whole, or only the rack («Ε»)
const SEAT_Q = /^[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]{1,3}\s*\d+$/;
/** Does the query look like a seat («Ε 23»)? */
export const seatQuery = (q: string) => SEAT_Q.test(q.trim());
/** Does the person have the seat of the query: the whole seat, or only the rack? */
export const seatMatch = (p: Pick<Person, 'rack' | 'wpos'>, q: string) => {
  const k = rackKey(q);
  return !!k && !!rackKey(p.rack) && (rackKey(p.rack) + posKey(p.wpos) === k || rackKey(p.rack) === k);
};
/**
 * One move matches: the holder or the owner of the weapon («of the post» weapon) by name/ΑΣΜ, the weapon number of the
 * move, or the seat of the owner.
 */
export function moveMatch(m: WeaponMove, pm: Map<number, Person>, q: string): boolean {
  if (!q.trim()) return true;
  const holder = pm.get(m.pid),
    owner = isAuto(m) ? pm.get(m.row.owner) : holder;
  const wk = weaponKey(q);
  if (seatQuery(q))
    return (
      (!!owner && seatMatch(owner, q)) ||
      (!!holder && seatMatch(holder, q)) ||
      (!!wk && weaponKey(m.weapon).includes(wk))
    );
  return (
    (!!holder && personMatch(holder, q)) ||
    (!!owner && owner !== holder && personMatch(owner, q)) ||
    (!!wk && weaponKey(m.weapon).includes(wk))
  );
}
/** The list as shown: reason (empty = all) and search. */
export const moveFilter = (list: WeaponMove[], pm: Map<number, Person>, reason: string, q: string) =>
  list.filter((m) => (!reason || moveKey(m) === reason) && moveMatch(m, pm, q));
/** Which lines can go in together (manual ones without an entry). */
export const inIds = (list: WeaponMove[]) => list.filter((m) => !isAuto(m) && !m.inDay).map((m) => m.id);
/** Which lines are corrected together (all the manual ones). */
export const fixIds = (list: WeaponMove[]) => list.filter((m) => !isAuto(m)).map((m) => m.id);

// ---------- Status hints (an observation, it does not block) ----------
/** A short hint (`text`) and the long one for the tooltip (`tip`). */
export interface StatusHint {
  text: string;
  tip: string;
}
/**
 * «Άδεια», «ΔΝ», «Νοσοκομείο»… from the statuses of the day that matter for the weapon: away, without duties or without
 * armed posts.
 */
export function statusHint(statuses: Status[], pid: number, date: ISODate, lists?: UserLists): StatusHint | null {
  const l = statusesOn(statuses, pid, date).filter(
    (x) => isAway(x, lists) || noDutyOf(x, lists) || TYPES[x.type].noArmed,
  );
  if (!l.length) return null;
  const lbl = (x: Status) => (x.type === 'LEAVE' ? 'Άδεια' : statusLbl(x, lists));
  return {
    text: lbl(l[0]) + (l.length > 1 ? ' +' + (l.length - 1) : ''),
    tip: l.map((x) => TYPES[x.type].long + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to))).join(' · '),
  };
}

// ---------- Stays OUT because of duty ----------
/**
 * The weapon of `pid` goes IN at time day/hm, but an armed number still holds it out (with the margin): the entry is
 * written, the weapon stays OUT. «Weapon of the post»: the weapon stays out to the end of the chain (not to the next
 * hand-over), with the seat of the 1st number.
 */
export function stayOutByDuty(
  s: ArmState,
  pid: number,
  day: ISODate,
  hm: string,
): { row: ArmRow; text: string } | null {
  const live = armedLive(s, day, hm);
  const r = live.cur.get(pid);
  if (!r) return null;
  let first = r,
    last = r;
  if (r.mode === 'post') {
    const chain = live.rows
      .filter((x) => x.owner === pid && x.mode === 'post' && x.day === r.day)
      .sort((x, y) => x.out - y.out);
    first = chain.find((x) => !x.take) || r;
    last = chain[chain.length - 1] || r;
  }
  const end = calDay(last.day, last.in);
  return {
    row: first,
    text: 'Μένει ΕΚΤΟΣ λόγω υπηρεσίας ' + first.label + ' ως ' + (end === day ? '' : dm(end) + ' ') + hmOf(last.in),
  };
}

// ---------- Counter for Σήμερα ----------
/**
 * Those who have the weapon out (moves and armed duties, once each): the people that the header of the Οπλισμός counts.
 */
export const outCountOn = (
  s: Pick<AppState, 'people' | 'settings'> &
    Partial<Pick<AppState, 'guards' | 'dutyLog' | 'weaponLog' | 'rules' | 'dutyFix' | 'cadreList'>>,
  d: ISODate,
  hm?: string,
) =>
  outPeople([...s.people, ...(s.cadreList ? [...armMap(s).values()].filter((p) => p.cid) : [])], weaponInfo(s, d, hm))
    .length;
