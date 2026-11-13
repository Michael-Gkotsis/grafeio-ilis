// Pure rules of the «Οπλισμός» screen: the normalisers of the three input fields, the remarks of a row, the filters,
// counts, sort and rows of the table, the messages of a save and the changes a pasted column makes.
// Purpose: `WeaponField`, `NORM`, `LBL`, `weaponNotes`, `weaponPlace`, `filterCounts`, `roomCounts`, `rowSorter`,
//   `weaponRows`, `emptyText`, `saveMessage`, `commitWpos`, `commitRack`, `pasteSeatsPlan`, `pasteWeaponsPlan`,
//   `dtCell`, for the screen, its hooks and its test.
// Does NOT: render anything, touch React, read the store or call the main process.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts and weaponMoves.ts (Phase 6) so
//   it is testable without a render.
// Covering test: test/weapons-page-view.test.ts.
import { rkShort } from '../../../entities/person';
import { armWhen, hmOf } from '../../../../shared/armed';
import { dm, dmy } from '../../../../shared/dates';
import type { Person, Settings } from '../../../../shared/domain';
import { shortName, unitOf } from '../../../../shared/domain';
import type { WeaponChange } from '../../../../shared/commands';
import { byRoomName } from '../../../../shared/rosterLists';
import { siOf } from '../../../../shared/si';
import { collator } from '../../../../shared/text';
import {
  WEAPON_FILTERS,
  bySeat,
  isOut,
  noSeat,
  normPos,
  normRack,
  normWeapon,
  outReasonOf,
  posKey,
  rackKey,
  sameRack,
  sameWeapon,
  seatTxt,
  weaponKey,
  weaponMatch,
  type WeaponFilter,
  type WeaponInfo,
} from '../../../../shared/weapons';
import { personMatch, statusHint, type StatusHint } from '../../../../shared/weaponView';
import type { Status } from '../../../../shared/domain';

type Lists = Settings['lists'];

/** The three fields a row can write: the weapon number, the rack and the «Θέση» of the weapon. */
export type WeaponField = 'weapon' | 'rack' | 'wpos';

/** Normaliser of each field (the same the command uses, so «changed» means the same on screen and in the log). */
export const NORM: Record<WeaponField, (v: unknown) => string> = { weapon: normWeapon, rack: normRack, wpos: normPos };

/** Screen-reader label of each field input. */
export const LBL: Record<WeaponField, string> = {
  weapon: 'Αριθμός όπλου',
  rack: 'Θέση οπλοβαστού',
  wpos: 'Θέση όπλου',
};

/** One remark of a row: tone of the badge, its text and the tooltip. */
export interface WeaponNote {
  tone: string;
  text: string;
  tip: string;
}

/** The remarks of a row before they become badges. */
export interface WeaponNotes {
  /** Tooltip of the «αυτόματα» badge, `null` when the weapon is not out because of an armed duty. */
  autoTip: string | null;
  /** The status of the day (leave, ΔΝ, hospital...), shown as an information badge; never counted in «⚠ n». */
  hint: StatusHint | null;
  /** The warnings and information lines. */
  items: WeaponNote[];
  /** With two or more `items`: the single «⚠ n» badge (tone `bad` if any is bad) with all tips joined. */
  summary: { tone: string; tip: string; count: number } | null;
}

/** Remarks about the weapon number and the rack seat: unarmed by the Σ.Ι., same number, same seat, no seat. */
function numberNotes(p: Person, info: WeaponInfo, lists: Lists): WeaponNote[] {
  const items: WeaponNote[] = [];
  if (!p.active)
    items.push({
      tone: 'warn',
      text: 'Εκτός δύναμης',
      tip: p.outOn ? 'Εκτός δύναμης από ' + dm(p.outOn) : 'Εκτός δύναμης',
    });
  const has = !!weaponKey(p.weapon);
  if (has && info.unarmed.has(p.id))
    items.push({ tone: 'warn', text: 'Άοπλος', tip: 'Άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ')' });
  const same = has ? sameWeapon(info, p) : [];
  if (same.length)
    items.push({
      tone: 'bad',
      text: 'Ίδιος με ' + rkShort(same[0]) + (same.length > 1 ? ' +' + (same.length - 1) : ''),
      tip: 'Ο ίδιος αριθμός: ' + same.map((x) => rkShort(x) + (x.active ? '' : ' (εκτός δύναμης)')).join(', '),
    });
  // Seat = rack + position together (Ε 22 and Ε 23 do not warn).
  const rk = p.active && rackKey(p.rack) ? sameRack(info, p) : [];
  if (rk.length)
    items.push({
      tone: 'warn',
      text: 'Ίδια θέση ×' + (rk.length + 1),
      tip: 'Η ίδια θέση (' + seatTxt(p.rack, p.wpos) + '): ' + rk.map(shortName).join(', '),
    });
  if (noSeat(p))
    items.push({
      tone: 'warn',
      text: 'Χωρίς θέση',
      tip: 'Έχει οπλοβαστό (' + normRack(p.rack) + ') αλλά όχι θέση: γράψε τη Θέση',
    });
  return items;
}

/** Remarks about armed duties: armed without a weapon (also before the number starts), and holding a post weapon. */
function dutyNotes(p: Person, info: WeaponInfo, pm: Map<number, Person>): WeaponNote[] {
  const items: WeaponNote[] = [];
  // Armed duty without a weapon, also before the number starts, so there is time to hand one out (Michael, 24/10).
  const soon = info.arm.next.get(p.id);
  if (!weaponKey(p.weapon) && p.active && (isOut(info, p.id) || soon))
    items.push({
      tone: 'bad',
      text: 'Ένοπλη χωρίς όπλο',
      tip:
        'Ένοπλη υπηρεσία (' +
        (info.out.get(p.id) ||
          (soon as NonNullable<typeof soon>).label + ' ' + armWhen(soon as NonNullable<typeof soon>)) +
        ') χωρίς αριθμό όπλου',
    });
  const hold = info.arm.holding.get(p.id);
  if (hold) {
    const owner = pm.get(hold.owner);
    items.push({
      tone: 'info',
      text: 'Κρατά όπλο θέσης',
      tip:
        'Κρατά το όπλο της θέσης (' +
        hold.label +
        ') του ' +
        (owner ? rkShort(owner) : '—') +
        ' ως τις ' +
        hmOf(hold.in),
    });
  }
  return items;
}

/**
 * The remarks of one row (Παρατήρηση column). One remark is one badge; with more, «⚠ 2» and all of them in the tooltip,
 * so they do not get cut and fall on each other.
 * @param pm - people by id, also cadre members in an armed duty
 * @param date - ISODate, local time
 */
export function weaponNotes(
  p: Person,
  info: WeaponInfo,
  lists: Lists,
  pm: Map<number, Person>,
  statuses: Status[],
  date: string,
): WeaponNotes {
  const items = [...numberNotes(p, info, lists), ...dutyNotes(p, info, pm)];
  // «αυτόματα»: out because of an armed duty (told apart from the manual reason ΥΠΗΡΕΣΙΑ); not counted in «⚠ n».
  const autoTip =
    !info.moves.has(p.id) && info.out.has(p.id) ? 'Αυτόματα από τις ένοπλες υπηρεσίες: ' + info.out.get(p.id) : null;
  // The status of the day is information: not counted in «⚠ n» and blocks nothing.
  const hint = p.active ? statusHint(statuses, p.id, date, lists) : null;
  const summary =
    items.length < 2
      ? null
      : {
          tone: items.some((n) => n.tone === 'bad') ? 'bad' : 'warn',
          tip: items.map((n) => n.tip).join(' · '),
          count: items.length,
        };
  return { autoTip, hint, items, summary };
}

/** Is the person in the picked platoon (`'all'` = every platoon) and room (`null` = every room)? */
export const weaponPlace = (p: Person, unit: string, room: number | null, settings: Settings): boolean =>
  (unit === 'all' || unitOf(p, settings) === unit) && (room == null || p.room === room);

/** How many people match each filter chip, among those in `place`. */
export function filterCounts(
  people: Person[],
  place: (p: Person) => boolean,
  info: WeaponInfo,
): Record<string, number> {
  const n = people
    .filter(place)
    .flatMap((p) => WEAPON_FILTERS.map(([k]) => k).filter((k) => weaponMatch(k, p, info)))
    .reduce((acc, k) => acc.set(k, (acc.get(k) || 0) + 1), new Map<string, number>());
  return Object.fromEntries(n);
}

/** Rooms of the people in strength with how many each has, by room number. */
export function roomCounts(people: Person[]): [number, number][] {
  const m = people.reduce((acc, p) => {
    if (p.active && p.room != null) acc.set(p.room, (acc.get(p.room) || 0) + 1);
    return acc;
  }, new Map<number, number>());
  return [...m].sort((a, b) => a[0] - b[0]);
}

/** Sort key of the header buttons and its direction (1 up, -1 down). */
export interface WeaponSort {
  k: string;
  dir: number;
}

/** The comparator of a sort key; the weapon and rack sorts put the empty ones last. */
export function rowSorter(sort: WeaponSort): (a: Person, b: Person) => number {
  if (sort.k === 'rack')
    return (a, b) =>
      (rackKey(a.rack) ? 0 : 1) - (rackKey(b.rack) ? 0 : 1) || bySeat(a, b) * sort.dir || byRoomName(a, b);
  if (sort.k === 'weapon')
    return (a, b) =>
      (weaponKey(a.weapon) ? 0 : 1) - (weaponKey(b.weapon) ? 0 : 1) ||
      collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) * sort.dir ||
      byRoomName(a, b);
  if (sort.k === 'last')
    return (a, b) => (collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) * sort.dir;
  return (a, b) => byRoomName(a, b) * sort.dir;
}

/** What `weaponRows` filters by. */
export interface WeaponRowsQuery {
  people: Person[];
  /** Platoon and room test of the screen. */
  place: (p: Person) => boolean;
  filter: WeaponFilter;
  info: WeaponInfo;
  /** The search text (deferred). */
  dq: string;
  /** Exit reason chosen in the «Εκτός τώρα» strip, `''` = none. */
  reasonF: string;
  /** Show only the ticked people (`sel`), whatever the filters say. */
  onlySel: boolean;
  sel: Set<number>;
  sort: WeaponSort;
}

/** The rows of the «Όπλα» table, sorted. «Ίδιος αριθμός» puts the same numbers one under the other. */
export function weaponRows(q: WeaponRowsQuery): Person[] {
  const { people, place, filter, info, dq, reasonF, onlySel, sel, sort } = q;
  const r = onlySel
    ? people.filter((p) => sel.has(p.id))
    : people.filter(
        (p) =>
          place(p) &&
          weaponMatch(filter, p, info) &&
          personMatch(p, dq) &&
          (!reasonF || (p.active && isOut(info, p.id) && outReasonOf(info, p.id) === reasonF)),
      );
  const cmp = rowSorter(sort);
  return r.sort(
    filter === 'dup' ? (a, b) => collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) || byRoomName(a, b) : cmp,
  );
}

/** Text of the empty table for a filter. `today` is the ISODate of today; `date` the day shown. */
export function emptyText(filter: WeaponFilter, date: string, today: string): string {
  return {
    all: 'Δεν υπάρχει κανείς σε δύναμη.',
    with: 'Κανείς δεν έχει ακόμα όπλο.',
    out: 'Κανείς δεν είναι εκτός οπλοβαστού ' + (date === today ? 'τώρα' : dm(date)) + '.',
    without: 'Όλοι οι ένοπλοι έχουν όπλο.',
    unarmed: 'Κανένας άοπλος δεν έχει όπλο.',
    dup: 'Κανένας αριθμός δεν είναι σε δύο.',
    return: 'Όλοι οι εκτός δύναμης παρέδωσαν το όπλο τους.',
  }[filter];
}

/** Toast text of a save when the caller gave none: «Χ: όπλο 123», «Χ: θέση Ε 23»..., or the number of people. */
export function saveMessage(changes: WeaponChange[], people: Person[]): string {
  const c0 = changes[0];
  const one = changes.length === 1 ? people.find((p) => p.id === c0.pid) : null;
  const seatMsg = (rack: unknown, wpos: unknown) =>
    rackKey(rack) && posKey(wpos)
      ? 'θέση ' + seatTxt(rack, wpos)
      : rackKey(rack)
        ? 'οπλοβαστός ' + normRack(rack)
        : 'θέση ' + normPos(wpos);
  const part =
    c0 &&
    (c0.weapon !== undefined
      ? normWeapon(c0.weapon)
        ? 'όπλο ' + normWeapon(c0.weapon)
        : 'χωρίς όπλο'
      : c0.rack !== undefined
        ? normRack(c0.rack)
          ? seatMsg(c0.rack, c0.wpos !== undefined ? c0.wpos : one?.wpos)
          : 'χωρίς οπλοβαστό'
        : c0.wpos !== undefined
          ? normPos(c0.wpos)
            ? seatMsg(c0.rack !== undefined ? c0.rack : one?.rack, c0.wpos)
            : 'χωρίς θέση'
          : c0.wtype
            ? 'τύπος ' + c0.wtype
            : 'χωρίς τύπο όπλου');
  return one ? rkShort(one) + ': ' + part : 'Οπλισμός: ' + changes.length + ' άτομα';
}

/** A change to write and the warning to show under the toast (`undefined` = none). */
export interface CommitPlan {
  changes: WeaponChange[];
  warn: string | undefined;
}

/** «Θέση» typed: warns only when rack AND position are the same in another person in strength. */
export function commitWpos(info: WeaponInfo, p: Person, raw: string): CommitPlan {
  const o = normPos(raw) && rackKey(p.rack) && p.active ? sameRack(info, p, p.rack, raw) : [];
  return {
    changes: [{ pid: p.id, wpos: raw }],
    warn: o.length
      ? 'η θέση ' + seatTxt(p.rack, raw) + ' είναι και του ' + o.map(shortName).join(', ') + '.'
      : undefined,
  };
}

/** Rack typed: warns about a taken seat, or about an armed person with a rack but no position. */
export function commitRack(info: WeaponInfo, p: Person, raw: string): CommitPlan {
  const r = normRack(raw);
  const o = r && p.active && posKey(p.wpos) ? sameRack(info, p, r, p.wpos) : [];
  return {
    changes: [{ pid: p.id, rack: r }],
    warn: o.length
      ? 'η θέση ' + seatTxt(r, p.wpos) + ' είναι και του ' + o.map(shortName).join(', ') + '.'
      : r && p.active && weaponKey(p.weapon) && !posKey(p.wpos)
        ? 'χωρίς θέση: γράψε και τη Θέση.'
        : undefined,
  };
}

/** What a pasted column of racks or positions writes: the changes, the toast (`msg`, `what`) and the warning. */
export interface PastePlan {
  changes: WeaponChange[];
  what: string;
  msg: string;
  warn: string | undefined;
}

/**
 * A column pasted from Excel into the rack or the «Θέση» input: one value per row, from row `i` down.
 * @param rows - the rows on screen, in order
 */
export function pasteSeatsPlan(vals: string[], rows: Person[], i: number, f: 'rack' | 'wpos'): PastePlan {
  const left = vals.length - Math.min(vals.length, rows.length - i);
  const changes = vals.slice(0, rows.length - i).map((v, j) => ({ pid: rows[i + j].id, [f]: v }) as WeaponChange);
  const what = f === 'rack' ? [' θέση οπλοβαστού', ' θέσεις οπλοβαστού'] : [' θέση όπλου', ' θέσεις όπλων'];
  return {
    changes,
    what: 'επικόλληση θέσεων',
    msg:
      'Επικόλληση: ' +
      changes.length +
      (changes.length === 1 ? what[0] : what[1]) +
      ' από ' +
      rkShort(rows[i]) +
      ' και κάτω',
    warn: left > 0 ? left + ' περίσσεψαν (δεν υπάρχουν άλλες γραμμές)' : undefined,
  };
}

/**
 * A column of weapon numbers pasted from Excel: one number per row, from row `i` down. Warns about leftover numbers and
 * about numbers that end up in two or more people (filter «Ίδιος αριθμός»).
 * @param people - everyone, to count the numbers the paste leaves untouched
 */
export function pasteWeaponsPlan(vals: string[], rows: Person[], i: number, people: Person[]): PastePlan {
  const left = vals.length - Math.min(vals.length, rows.length - i);
  const changes = vals.slice(0, rows.length - i).map((v, j) => ({ pid: rows[i + j].id, weapon: v }));
  const touched = new Set(changes.map((c) => c.pid));
  const next = [
    ...people.filter((p) => !touched.has(p.id)).map((p) => weaponKey(p.weapon)),
    ...changes.map((c) => weaponKey(c.weapon)),
  ]
    .filter(Boolean)
    .reduce((acc, k) => acc.set(k, (acc.get(k) || 0) + 1), new Map<string, number>());
  const dups = [...next.values()].filter((n) => n > 1).length;
  const warn = [
    left > 0 && left + (left === 1 ? ' αριθμός περίσσεψε' : ' αριθμοί περίσσεψαν') + ' (δεν υπάρχουν άλλες γραμμές)',
    dups > 0 &&
      dups + (dups === 1 ? ' αριθμός είναι' : ' αριθμοί είναι') + ' σε δύο ή περισσότερους (φίλτρο «Ίδιος αριθμός»)',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    changes,
    what: 'επικόλληση',
    msg:
      'Επικόλληση: ' +
      changes.length +
      (changes.length === 1 ? ' αριθμός όπλου' : ' αριθμοί όπλων') +
      ' από ' +
      rkShort(rows[i]) +
      ' και κάτω',
    warn: warn || undefined,
  };
}

/** Date and time of a move cell: «dd/mm» in the year of `today`, else «dd/mm/yyyy», then the time. */
export const dtCell = (day: string, t: string, today: string): string =>
  (day.slice(0, 4) === today.slice(0, 4) ? dm(day) : dmy(day)) + ' ' + t;
