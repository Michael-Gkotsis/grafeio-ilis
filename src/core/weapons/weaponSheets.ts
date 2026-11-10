// Weapons: the Excel «Οπλισμός» (one sheet per filter) and the sheet of the moves of the day (armed duties included).
//
// Purpose: the columns and the sheets (`WEAPON_COLS`, `W_NUM`, `WeaponSheet`, `weaponSheets`, `MOVE_COLS`), the moves
//   of a day (`movesOn`, `byOut`, `movesAll`, `moveById`), the armed duties as moves (`DutyMove`, `isAuto`, `armMap`,
//   `dutyMove`, `dutyMoves`) and the cells of a move (`moveOutCell`, `moveInCell`).
// Does NOT: write the Excel file (src/main does), save the moves (`state.weaponLog`) or compute who is out (that is
//   weaponInfo.ts).
// Owner layer: core/weapons (no fs, no Electron, no React); imports weaponInfo.ts, weaponKeys.ts, armed.ts, core/people
//   and core/duty.
// Why: the armed duties are not written in the weaponLog: they come out of the duties of the day, one row per number
//   with its hours (Michael, 24/10). The Excel, the form «Κινήσεις όπλων» and the screen must list the same rows in the
//   same order.
// Covering tests: test/weapons.test.ts, test/weaponView.test.ts, test/armed.test.ts.
import { dm, dmy, type ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import type { Person } from '../model/person';
import type { WeaponMove } from '../model/records';
import { ARM_BACK, armedRows, calDay, hmOf, rowById, type ArmRow } from './armed';
import { weaponBack, rankTxt } from '../people/ranks';
import { seatMap } from '../duty/indexes';
import { siOf } from '../people/si';
import { byRoomName } from '../people/rosterLists';
import { upper } from '../lib/text';
import { normPos, normRack, normWeapon, weaponKey } from './weaponKeys';
import { WEAPON_FILTERS, inOutText, weaponInfo, weaponMatch } from './weaponInfo';

/** The columns of the sheets of the Excel «Οπλισμός». */
export const WEAPON_COLS = [
  'Α/Α',
  'ΒΑΘΜΟΣ',
  'Ο/Σ',
  'ΕΠΙΘΕΤΟ',
  'ΟΝΟΜΑ',
  'ΠΑΤΡΩΝΥΜΟ',
  'ΑΣΜ',
  'ΘΑΛΑΜΟΣ',
  'Σ.Ι.',
  'ΤΥΠΟΣ ΟΠΛΟΥ',
  'ΑΡΙΘΜΟΣ ΟΠΛΟΥ',
  'ΟΠΛΟΒΑΣΤΟΣ',
  'ΘΕΣΗ',
  'ΕΝΤΟΣ / ΕΚΤΟΣ',
];
/** The index of the column «ΑΡΙΘΜΟΣ ΟΠΛΟΥ». */
export const W_NUM = WEAPON_COLS.indexOf('ΑΡΙΘΜΟΣ ΟΠΛΟΥ');
/** One sheet of the Excel «Οπλισμός»: name, title, head row, body rows and the help note. */
export interface WeaponSheet {
  name: string;
  title: string;
  head: string[];
  rows: (string | number)[][];
  note: string;
}
/**
 * The sheets of the Excel «Οπλισμός» for day `d`: one per filter, then «ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ». The first one (everybody) also
 * has a column for the signature, for the charge of the weapons.
 */
export function weaponSheets(s: AppState, d: ISODate): WeaponSheet[] {
  const info = weaponInfo(s, d);
  const lists = s.settings.lists;
  const people = [...s.people].sort(byRoomName);
  return WEAPON_FILTERS.map(([f, , name, note], i) => {
    const rows = people
      .filter((p) => weaponMatch(f, p, info))
      .map((p, j) => [
        j + 1,
        rankTxt(p),
        p.spec,
        p.last,
        p.first,
        p.father,
        p.asm,
        p.room ?? '',
        p.si ? siOf(p, lists).text : '',
        p.wtype || '',
        normWeapon(p.weapon),
        normRack(p.rack),
        normPos(p.wpos),
        inOutText(p, info),
      ]);
    if (f === 'dup')
      rows
        .sort((a, b) => weaponKey(a[W_NUM]).localeCompare(weaponKey(b[W_NUM])) || 0)
        .forEach((r, j) => {
          r[0] = j + 1;
        });
    return {
      name,
      title: name + ' ' + dmy(d),
      head: i === 0 ? [...WEAPON_COLS, 'ΥΠΟΓΡΑΦΗ'] : WEAPON_COLS,
      rows: i === 0 ? rows.map((r) => [...r, '']) : rows,
      note,
    };
  }).concat([moveSheet(s, d)]);
}
/** The columns of the moves of the day: weapons out or in that day, and those out before and still out. */
export const MOVE_COLS = [
  'Α/Α',
  'ΒΑΘΜΟΣ',
  'ΕΠΙΘΕΤΟ',
  'ΟΝΟΜΑ',
  'ΑΡΙΘΜΟΣ ΟΠΛΟΥ',
  'ΛΟΓΟΣ ΕΞΟΔΟΥ',
  'ΕΞΟΔΟΣ',
  'ΛΟΓΟΣ ΕΙΣΟΔΟΥ',
  'ΕΙΣΟΔΟΣ',
  'ΠΑΡΑΤΗΡΗΣΗ',
];
/** The moves of the log that touch day `d`: out or in that day, and those that left earlier and are still out. */
export const movesOn = (log: WeaponMove[] | undefined, d: ISODate) =>
  (log || []).filter(
    (m) => m.outDay === d || m.inDay === d || (!m.inDay && m.outDay <= d) || (m.outDay < d && !!m.inDay && m.inDay > d),
  );
/** Order by the moment of the exit. */
export const byOut = (a: WeaponMove, b: WeaponMove) => (a.outDay + a.outTime).localeCompare(b.outDay + b.outTime);
/**
 * An armed duty as a move (Michael, 24/10): one row per number of the duty day, with its hours. It is not written in
 * the weaponLog: it comes out of the duties. id «auto:DAY|seat|n»; in «of the post» pid = whoever holds the weapon,
 * weapon = the one of the owner.
 * @decision Michael 24/10: armed duties are listed as moves, computed from the duties.
 */
export interface DutyMove extends WeaponMove {
  auto: true;
  row: ArmRow;
}
/** Is the move an armed duty (computed) and not a line of the weaponLog? */
export const isAuto = (m: WeaponMove): m is DutyMove => (m as DutyMove).auto === true;
/**
 * The people who can have a weapon on an armed duty: soldiers and cadre in a post.
 * @decision Michael 26/10: cadre members in a post can have a weapon.
 */
export const armMap = (s: { people: Person[]; cadreList?: Cadre[] }) =>
  seatMap({ people: s.people, cadreList: s.cadreList || [] });
/** The move that an armed-duty row stands for (hours of the number, the reason of the entry, the correction). */
export function dutyMove(s: Pick<AppState, 'people' | 'settings'> & { cadreList?: Cadre[] }, r: ArmRow): DutyMove {
  const pm = armMap(s);
  const o = r.out,
    i = r.in;
  const back =
    r.mode === 'post' && r.give
      ? 'ΠΑΡΑΔΟΣΗ' + (r.next != null ? ' ΣΕ ' + upper(pm.get(r.next)?.last || '') : '')
      : weaponBack('ΥΠΗΡΕΣΙΑ', s.settings.lists) || ARM_BACK;
  return {
    id: 'auto:' + r.id,
    pid: r.who,
    weapon: normWeapon(pm.get(r.owner)?.weapon),
    reason: r.reason,
    outDay: calDay(r.day, o),
    outTime: hmOf(o),
    inDay: calDay(r.day, i),
    inTime: hmOf(i),
    inReason: back.trim(),
    note: r.fix ? 'ΔΙΟΡΘΩΣΗ: ' + r.fix.why : '',
    auto: true,
    row: r,
  };
}
/** All the armed duties of day `d` as moves. */
export const dutyMoves = (
  s: Pick<AppState, 'people' | 'settings' | 'guards' | 'dutyLog' | 'rules' | 'dutyFix'> & { cadreList?: Cadre[] },
  d: ISODate,
): DutyMove[] => armedRows(s, d).map((r) => dutyMove(s, r));
/** A move from its id: from the weaponLog or an automatic one (form «Κινήσεις όπλων»). */
export function moveById(s: AppState, id: string): WeaponMove | undefined {
  if (id.startsWith('auto:')) {
    const r = rowById(s, id.slice(5));
    return r ? dutyMove(s, r) : undefined;
  }
  return (s.weaponLog || []).find((m) => m.id === id);
}
/**
 * As in the Excel and on the form: the moves and the armed duties of the day in the order they come out. In «of the
 * post»: «ΠΑΡΑΛΑΒΗ ΩΩ:ΛΛ» / «ΠΑΡΑΔΟΣΗ ΩΩ:ΛΛ».
 */
export const movesAll = (s: AppState, d: ISODate): WeaponMove[] =>
  [...movesOn(s.weaponLog, d), ...dutyMoves(s, d)].sort(byOut);
const dayTxt = (day: ISODate | undefined, t: string | undefined, d: ISODate) => (day === d ? '' : dm(day!) + ' ') + t;
/** The cell «ΕΞΟΔΟΣ» of a move. */
export const moveOutCell = (m: WeaponMove) =>
  isAuto(m) && m.row.mode === 'post'
    ? 'ΠΑΡΑΛΑΒΗ ' + dayTxt(m.outDay, m.outTime, m.row.day)
    : dmy(m.outDay) + ' ' + m.outTime;
/** The cell «ΕΙΣΟΔΟΣ» of a move («ΕΚΤΟΣ» while it is still out). */
export const moveInCell = (m: WeaponMove) =>
  isAuto(m) && m.row.mode === 'post'
    ? 'ΠΑΡΑΔΟΣΗ ' + dayTxt(m.inDay, m.inTime, m.row.day)
    : m.inDay
      ? dmy(m.inDay) + ' ' + (m.inTime || '')
      : 'ΕΚΤΟΣ';
function moveSheet(s: AppState, d: ISODate): WeaponSheet {
  const pm = armMap(s);
  const rows = movesAll(s, d).map((m, j) => {
    const p = pm.get(m.pid);
    return [
      j + 1,
      rankTxt(p),
      p?.last || '',
      p?.first || '',
      normWeapon(m.weapon),
      m.reason,
      moveOutCell(m),
      m.inReason || '',
      moveInCell(m),
      (p?.cid ? 'ΣΤΕΛΕΧΟΣ' + (isAuto(m) || m.note ? ' · ' : '') : '') +
        (isAuto(m) ? 'ΑΥΤΟΜΑΤΑ' + (m.note ? ' · ' + m.note : '') : m.note || ''),
    ];
  });
  return {
    name: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ',
    title: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ ' + dmy(d),
    head: MOVE_COLS,
    rows,
    note: 'Έξοδοι και είσοδοι όπλων από τον οπλοβαστό τη μέρα, και όσα είναι ακόμα εκτός· οι ένοπλες υπηρεσίες ανά νούμερο, με τις ώρες',
  };
}
