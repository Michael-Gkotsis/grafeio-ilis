// Weapons: who has a weapon, who is out of the rack and why, and the filters of the screen «Οπλισμός».
//
// Purpose: the filters (`WEAPON_FILTERS`, `weaponMatch`), the picture of a day (`WeaponInfo`, `ArmInfo`, `weaponInfo`),
//   the open moves (`openMoves`), the people who are out and the reasons (`isOut`, `outPeople`, `outReasonOf`,
//   `outReasons`, `AUTO_KEY`), the texts (`moveOutTxt`, `armTxt`, `inOutText`) and the people with the same weapon or
//   seat (`sameWeapon`, `sameRack`).
// Does NOT: write the Excel file (weaponSheets.ts builds the rows), save anything, or block anything: the same number
//   on two people, a weapon on an unarmed person or on a person out of force show as filters and warnings.
// Owner layer: core/weapons (no fs, no Electron, no React); imports core/people, core/duty and armed.ts.
// Why: out of the rack is whoever has an armed duty (sentry, weapon-keeper, ΤΑΕ, an armed duty of your own), with the
//   seat as the reason. The screen, the header, the chips and the Excel count the same people, so they use one
//   `WeaponInfo`.
// Covering tests: test/weapons.test.ts, test/weaponView.test.ts, test/armed.test.ts.
import { dm, type ISODate } from '../lib/dates';
import { blocksOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import type { WeaponMove } from '../model/records';
import { armedLive, armedRows, armWhen, type ArmRow, type ArmState } from './armed';
import { siIsUnarmed } from '../people/si';
import { rackKey, seatKey, weaponKey } from './weaponKeys';
import type { WeaponFilter } from '../model/lists';
export type { WeaponFilter } from '../model/lists';

/** The filters of the screen: key, label, name of the Excel sheet, help text. */
export const WEAPON_FILTERS: [WeaponFilter, string, string, string][] = [
  ['all', 'Όλοι', 'ΟΠΛΙΣΜΟΣ', 'Όλοι σε δύναμη'],
  ['with', 'Με όπλο', 'ΜΕ ΟΠΛΟ', 'Σε δύναμη, με αριθμό όπλου'],
  [
    'out',
    'Εκτός οπλοβαστού',
    'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ',
    'Το όπλο τους βγήκε με λόγο (ΕΚΠ, βολή…) και δεν μπήκε ακόμα, ή έχουν ένοπλη υπηρεσία τη μέρα',
  ],
  ['without', 'Χωρίς όπλο', 'ΧΩΡΙΣ ΟΠΛΟ', 'Σε δύναμη, ένοπλοι κατά τη Σ.Ι., χωρίς αριθμό όπλου'],
  [
    'unarmed',
    'Άοπλοι με όπλο',
    'ΑΟΠΛΟΙ ΜΕ ΟΠΛΟ',
    'Άοπλοι κατά τη Σ.Ι. (Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 ή ό,τι όρισες στις Ρυθμίσεις › Σ.Ι.) που έχουν όπλο',
  ],
  ['dup', 'Ίδιος αριθμός', 'ΙΔΙΟΣ ΑΡΙΘΜΟΣ', 'Ο ίδιος αριθμός όπλου ή η ίδια θέση οπλοβαστού σε δύο ή περισσότερους'],
  ['return', 'Να παραδώσουν', 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ', 'Εκτός δύναμης που έχουν ακόμα όπλο'],
];

/** The picture of the weapons for a day (or for now), computed once and shared by the screen and the Excel. */
export interface WeaponInfo {
  /** Unarmed by the Σ.Ι. (permanently, not the ΕΑ/ΕΟ of the day). */
  unarmed: Set<number>;
  /** weaponKey → those who have this weapon (also those out of force, since they did not hand it in). */
  holders: Map<string, Person[]>;
  /** seatKey (rack + seat) → those who have this seat (only those in force). */
  racks: Map<string, Person[]>;
  /** Out of the rack because of an armed duty: pid → «Σκοπός 3ης (α) 15:45–18:15» (now, or all numbers of the day). */
  out: Map<number, string>;
  /** Left the rack (Έξοδος όπλων) and not back yet: pid → the move. */
  moves: Map<number, WeaponMove>;
  /** The armed duties per number (armed.ts). */
  arm: ArmInfo;
}
/**
 * Armed duties (Michael, 24/10): live = judged by the time (today); otherwise all the numbers of the day with their
 * hours. cur: the owner of the weapon → the row that runs (for a day: the first); next/prev: the next/previous one
 * (live only); holding: «of the post», who holds the weapon of somebody else now.
 * @decision Michael 24/10: armed duties are judged by the time when the day is today.
 */
export interface ArmInfo {
  live: boolean;
  rows: ArmRow[];
  cur: Map<number, ArmRow>;
  next: Map<number, ArmRow>;
  prev: Map<number, ArmRow>;
  holding: Map<number, ArmRow>;
}
const NO_ARM: ArmInfo = { live: false, rows: [], cur: new Map(), next: new Map(), prev: new Map(), holding: new Map() };
// The exits without an entry, per person (the most recent one)
const openIdx = new WeakMap<WeaponMove[], Map<number, WeaponMove>>();
/** The exits without an entry, per person (the most recent one); the result is cached per log array. */
export function openMoves(log: WeaponMove[] | undefined): Map<number, WeaponMove> {
  if (!log) return new Map();
  let m = openIdx.get(log);
  if (!m) {
    m = new Map();
    for (const x of log)
      if (!x.inDay) {
        const o = m.get(x.pid);
        if (!o || o.outDay + o.outTime < x.outDay + x.outTime) m.set(x.pid, x);
      }
    openIdx.set(log, m);
  }
  return m;
}
/** «ΕΚΠ από 18/10 08:15». */
export const moveOutTxt = (m: WeaponMove) => m.reason + ' από ' + dm(m.outDay) + ' ' + m.outTime;
/** Is the weapon of `pid` out of the rack (a move or an armed duty)? */
export const isOut = (info: WeaponInfo, pid: number) => info.moves.has(pid) || info.out.has(pid);
/**
 * Those who are out (in force): a move or an armed duty, once each. The header, the chip and the card Κινήσεις all
 * count from here.
 */
export const outPeople = (people: Person[], info: WeaponInfo) => people.filter((p) => p.active && isOut(info, p.id));
/**
 * The reason shown for each person who is out: the manual one (as written) or AUTO_KEY for an armed duty without a
 * move (the move wins, it counts once).
 */
export const AUTO_KEY = '@auto';
/** The reason of `pid`: the manual one, `AUTO_KEY` for an armed duty, or empty when the weapon is in. */
export const outReasonOf = (info: WeaponInfo, pid: number) =>
  info.moves.get(pid)?.reason ?? (info.out.has(pid) ? AUTO_KEY : '');
/** The reasons with a count: by count (most first), `AUTO_KEY` last. */
export function outReasons(people: Person[], info: WeaponInfo): [string, number][] {
  const n = new Map<string, number>();
  for (const p of outPeople(people, info)) {
    const r = outReasonOf(info, p.id);
    n.set(r, (n.get(r) || 0) + 1);
  }
  return [...n].sort(
    (a, b) => Number(a[0] === AUTO_KEY) - Number(b[0] === AUTO_KEY) || b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}
/**
 * «Σκοπός 3ης (α) 15:45–18:15»: the number that runs; for a day all the numbers of the owner (in «of the post» from the
 * first exit to the last entry).
 */
export function armTxt(rows: ArmRow[]): string {
  const r = rows[0];
  return (
    r.label +
    ' ' +
    (r.mode === 'post' ? armWhen({ out: r.out, in: rows[rows.length - 1].in }) : rows.map(armWhen).join(', '))
  );
}
// Armed duties: with now («ΩΩ:ΛΛ», d is today) those out at this moment; without, those with a number on day d
function armInfo(st: ArmState, d: ISODate, now?: string): ArmInfo {
  if (now) return { live: true, ...armedLive(st, d, now) };
  const rows = armedRows(st, d);
  const cur = new Map<number, ArmRow>();
  for (const r of rows) if (!cur.has(r.owner)) cur.set(r.owner, r);
  return { ...NO_ARM, rows, cur };
}
/**
 * The picture of the weapons. Without `d` the armed duties do not count; with `d` all the numbers of the duty day;
 * with `d` and `now` (today) only those that run now.
 */
export function weaponInfo(
  s: Pick<AppState, 'people' | 'settings'> &
    Partial<Pick<AppState, 'guards' | 'dutyLog' | 'weaponLog' | 'rules' | 'dutyFix'>>,
  d?: ISODate,
  now?: string,
): WeaponInfo {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter((b) => !b.hidden && b.kind !== 'ly');
  const unarmed = new Set<number>();
  const holders = new Map<string, Person[]>();
  const racks = new Map<string, Person[]>();
  const push = (m: Map<string, Person[]>, k: string, p: Person) => {
    const l = m.get(k);
    if (l) l.push(p);
    else m.set(k, [p]);
  };
  for (const p of s.people) {
    if (p.si && siIsUnarmed(p, blocks, s.settings.lists)) unarmed.add(p.id);
    const r = seatKey(p.rack, p.wpos);
    if (r && p.active) push(racks, r, p);
    const k = weaponKey(p.weapon);
    if (k) push(holders, k, p);
  }
  const arm = d
    ? armInfo(
        { guards: s.guards || {}, dutyLog: s.dutyLog || {}, settings: s.settings, rules: s.rules, dutyFix: s.dutyFix },
        d,
        now,
      )
    : NO_ARM;
  const out = new Map<number, string>();
  if (arm.live) arm.cur.forEach((r, pid) => out.set(pid, armTxt([r])));
  else {
    const by = new Map<number, ArmRow[]>();
    for (const r of arm.rows) {
      const l = by.get(r.owner);
      if (l) l.push(r);
      else by.set(r.owner, [r]);
    }
    by.forEach((l, pid) => out.set(pid, armTxt(l)));
  }
  return { unarmed, holders, racks, out, moves: openMoves(s.weaponLog), arm };
}
/** The others (in force) with the same seat (rack + seat). */
export const sameRack = (info: WeaponInfo, p: Pick<Person, 'id' | 'rack' | 'wpos'>, rack = p.rack, wpos = p.wpos) =>
  (info.racks.get(seatKey(rack, wpos)) || []).filter((x) => x.id !== p.id);
/**
 * «ΕΝΤΟΣ» or «ΕΚΤΟΣ: ΣΚΟΠΟΣ …»; empty for whoever has neither a weapon nor an armed duty. The exit with a reason (ΕΚΠ…)
 * comes first, then the armed duty.
 */
export const inOutText = (p: Person, info: WeaponInfo) =>
  info.moves.has(p.id)
    ? 'ΕΚΤΟΣ: ' + moveOutTxt(info.moves.get(p.id)!)
    : info.out.has(p.id)
      ? 'ΕΚΤΟΣ: ' + info.out.get(p.id)
      : weaponKey(p.weapon) && p.active
        ? 'ΕΝΤΟΣ'
        : '';
/** The others who have the same number. */
export const sameWeapon = (info: WeaponInfo, p: Pick<Person, 'id' | 'weapon'>, weapon = p.weapon) =>
  (info.holders.get(weaponKey(weapon)) || []).filter((x) => x.id !== p.id);

/** Does the person pass the filter `f`? */
export function weaponMatch(f: WeaponFilter, p: Person, info: WeaponInfo): boolean {
  const has = !!weaponKey(p.weapon);
  if (f === 'return') return !p.active && has;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'with') return has;
  if (f === 'out') return isOut(info, p.id);
  if (f === 'without') return !has && !info.unarmed.has(p.id);
  if (f === 'unarmed') return has && info.unarmed.has(p.id);
  return (has && sameWeapon(info, p).length > 0) || (!!rackKey(p.rack) && sameRack(info, p).length > 0);
}
