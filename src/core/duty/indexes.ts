// People, cadre seats and the duty pool: the per-object indexes the rules read people through.
//
// Purpose: `personMap` (id to person), `activePeople`, `isEpop` / `hkRankOf` (who counts as an ΕΠΟΠ/ΟΒΑ soldier),
//   `dutyPool` (who the auto-fill may use), and the cadre seat helpers (`cadreSeat`, `cadreOf`, `cadreSeats`,
//   `seatPeople`, `pickPeople`, `seatMap`, `cadreAbsOn`).
// Does NOT: decide who may stand a duty (dutyCheck.ts) or read statuses (statuses.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; the lowest layer of the duty
//   rules.
// Why: Every index is a WeakMap keyed by the array it was built from, so each cache has exactly one instance, here.
//   `personMap` also calls `noteNamesakes`: the people index must keep the namesake set right for any caller, including
//   the worker (see src/core/ambient.ts).
// Covering tests: test/rules.test.ts, test/epop.test.ts, test/cadre-duty.test.ts, test/golden-outputs.test.ts.
import type { ISODate } from '../lib/dates';
import type { Cadre, CadreAbs } from '../model/cadreRecord';
import type { UserLists } from '../model/lists';
import { noteNamesakes, type Person } from '../model/person';
import type { AppState } from '../model/state';
import { hkClaimOf, hkOfRank, hkRowsOf } from '../people/hkRows';
import { isEpopOrigin, originRow } from '../people/ranks';

// People index by id, cached per `people` array (cache per object).
const peopleIdx = new WeakMap<Person[], Map<number, Person>>();

/**
 * Map from person id to person, cached per `people` array (commands always build a new array, they never change one).
 * Also refreshes the namesake set that `fullName` / `shortName` read.
 */
export function personMap(people: Person[]): Map<number, Person> {
  // stays here on purpose: the namesake set must be right for any caller, including the worker (see
  // src/core/ambient.ts)
  noteNamesakes(people);
  let m = peopleIdx.get(people);
  if (!m) {
    m = new Map(people.map((p) => [p.id, p]));
    peopleIdx.set(people, m);
  }
  return m;
}

/** The people who are in strength (`active`). */
export const activePeople = (s: AppState) => s.people.filter((p) => p.active);

/**
 * The ΗΚΑΙ rows of the ΕΠΟΠ and ΟΒΑ soldiers.
 * ΕΠΟΠ and ΟΒΑ soldiers count like cadre (statuses, exemption by hand) but do a few duties per month (limit
 * `monthMax`), by hand only, never from the auto-fill. They are usually in the Στελέχη: a cadre member who has a limit
 * gets a seat number (`Cadre.pid`, negative) and enters the posts as a person (`cadreSeat`). If an ΕΠΟΠ is in the
 * Δυναμολόγιο (from Excel), the same applies to whoever has the origin ΕΠΟΠ or ΟΒΑ (or, in old data, ΕΠΟΠ/ΟΒΑ inside
 * the rank), or an own rank that the ΗΚΑΙ puts in the row «ΕΠΟΠ/ΟΒΑ Στρατιώτης».
 * @decision Michael 21/10: ΕΠΟΠ/ΟΒΑ do a limited number of duties per month, by hand only.
 */
export const EPOP_ROWS = ['ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης'];

/**
 * The ΗΚΑΙ row of a rank (and origin): first what the user set in the Λίστες for an own rank, otherwise from the name.
 * An ΕΠΟΠ/ΟΒΑ soldier goes to their own row, the ΕΠΟΠ ΛΧΙΑΣ to the Λοχίες.
 */
export function hkRankOf(rank: string, lists?: UserLists, origin?: string): string {
  const claim = hkClaimOf(lists, rank, origin, 'nco');
  if (claim) return claim;
  const own = hkOfRank(lists, 'soldierRanks', rank);
  if (own && hkRowsOf(lists).nco.includes(own)) return own;
  const r = rank.toUpperCase().replace(/\./g, '');
  if (/ΑΡΧΙΛΧ|ΑΡΧΙΛΟΧ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛΧ|ΕΠΙΛΟΧ/.test(r)) return 'Επιλοχίες';
  if (/ΛΧΙΑΣ|ΛΟΧΙΑΣ/.test(r)) return 'Λοχίες';
  if (/ΔΝΕΑΣ|ΔΕΚΑΝ/.test(r)) return 'Δεκανείς';
  if (/ΕΠΟΠ/.test(r)) return 'ΕΠΟΠ Στρατιώτης';
  if (/ΟΒΑ/.test(r)) return 'ΟΒΑ Στρατιώτης';
  return originRow(origin) || 'Στρατιώτες';
}

/**
 * True for an ΕΠΟΠ/ΟΒΑ soldier: by origin, by «ΕΠΟΠ» / «ΟΒΑ» inside the rank, or by an own rank that the ΗΚΑΙ puts in
 * one of `EPOP_ROWS`.
 */
export const isEpop = (p: Pick<Person, 'rank' | 'origin'>, lists?: UserLists) =>
  isEpopOrigin(p.origin) ||
  /(^|[^Α-Ω])(ΕΠΟΠ|ΟΒΑ)([^Α-Ω]|$)/.test((p.rank || '').toUpperCase().replace(/\./g, '')) ||
  EPOP_ROWS.includes(hkRankOf(p.rank || '', lists, p.origin));

const poolIdx = new WeakMap<Person[], { lists?: UserLists; out: Person[] }>();

/**
 * The people who enter the auto-fill and the fairness order: everybody in strength except the ΕΠΟΠ/ΟΒΑ. Cached per
 * people array and Λίστες.
 */
export function dutyPool(s: AppState): Person[] {
  const c = poolIdx.get(s.people);
  if (c && c.lists === s.settings.lists) return c.out;
  const out = s.people.filter((p) => p.active && !isEpop(p, s.settings.lists));
  poolIdx.set(s.people, { lists: s.settings.lists, out });
  return out;
}

/**
 * Base of the provisional seat numbers of the cadre members who have no `pid` yet (`PROV - index in the cadre list`);
 * used only for the choice, the assign gives the real `pid`, which is negative, unique and kept forever.
 * @decision Michael 26/10: every active cadre member can enter any post, by hand only.
 */
export const PROV = -1e6;

/**
 * A cadre member as a person (a «seat»), so the posts and the rules treat soldiers and cadre alike. `id` is the real
 * `pid` or a provisional number.
 */
export const cadreSeat = (c: Cadre, id: number = c.pid!): Person => ({
  id,
  cid: c.id,
  rank: c.rank,
  ...(c.origin ? { origin: c.origin } : {}),
  spec: c.spec || '',
  last: c.last,
  first: c.first,
  father: '',
  asm: c.am || '',
  phone: c.phone || '',
  room: null,
  si: '',
  post: null,
  role: c.role || null,
  essos: '',
  attached: false,
  active: c.active,
  notes: '',
  ...(c.monthMax ? { monthMax: c.monthMax } : {}),
  ...(c.weapon ? { weapon: c.weapon } : {}),
  ...(c.wtype ? { wtype: c.wtype } : {}),
  ...(c.rack ? { rack: c.rack } : {}),
  ...(c.wpos ? { wpos: c.wpos } : {}),
});

/** The cadre member of a seat number: real (`pid`) or provisional (`PROV`). */
export const cadreOf = (s: Pick<AppState, 'cadreList'>, pid: number): Cadre | undefined =>
  pid <= PROV ? (s.cadreList || [])[PROV - pid] : pid < 0 ? (s.cadreList || []).find((c) => c.pid === pid) : undefined;

/** The next free seat number of a cadre member (negative, never given again). */
export const nextCadrePid = (cl: Cadre[]): number => Math.min(0, ...cl.map((y) => y.pid ?? 0)) - 1;

const seatsIdx = new WeakMap<Cadre[], Person[]>();

/** The cadre members who have (or had) seats, as people. Also the ones out of strength, for the history. */
export function cadreSeats(s: Pick<AppState, 'cadreList'>): Person[] {
  const cl = s.cadreList || [];
  let v = seatsIdx.get(cl);
  if (!v) {
    v = cl.filter((c) => c.pid != null).map((c) => cadreSeat(c));
    seatsIdx.set(cl, v);
  }
  return v;
}

const seatPplIdx = new WeakMap<Person[], { cl: Cadre[]; v: Person[] }>();

/**
 * The people chosen for a post: the soldiers and the cadre members with duties (in strength, with a limit). Also used
 * in the Έλεγχος υπηρεσιών.
 */
export function seatPeople(s: Pick<AppState, 'people' | 'cadreList'>): Person[] {
  const cl = s.cadreList || [];
  const c = seatPplIdx.get(s.people);
  if (c && c.cl === cl) return c.v;
  const extra = cadreSeats(s).filter((p) => p.active && p.monthMax);
  const v = extra.length ? [...s.people, ...extra] : s.people;
  seatPplIdx.set(s.people, { cl, v });
  return v;
}

const pickIdx = new WeakMap<Person[], { cl: Cadre[]; v: Person[] }>();

/**
 * The people chosen by hand for a post (Θέσεις, «Αλλαγή…», ΦΡΟΥΡΑ): the soldiers and ALL the active cadre members, with
 * a provisional number for the ones that have no `pid` yet.
 */
export function pickPeople(s: Pick<AppState, 'people' | 'cadreList'>): Person[] {
  const cl = s.cadreList || [];
  const c = pickIdx.get(s.people);
  if (c && c.cl === cl) return c.v;
  const extra = cl.flatMap((x, i) => (x.active ? [cadreSeat(x, x.pid ?? PROV - i)] : []));
  const v = extra.length ? [...s.people, ...extra] : s.people;
  pickIdx.set(s.people, { cl, v });
  return v;
}

const seatMapIdx = new WeakMap<Person[], { cl: Cadre[]; m: Map<number, Person> }>();

/** Who is in a seat: a soldier, or a cadre member (negative number). */
export function seatMap(s: Pick<AppState, 'people' | 'cadreList'>): Map<number, Person> {
  const pm = personMap(s.people);
  const cl = s.cadreList || [];
  if (!cl.some((c) => c.pid != null)) return pm;
  const c = seatMapIdx.get(s.people);
  if (c && c.cl === cl) return c.m;
  const m = new Map(pm);
  for (const p of cadreSeats(s)) m.set(p.id, p);
  seatMapIdx.set(s.people, { cl, m });
  return m;
}

/** The status of a cadre member on a day (the first, if they overlap by mistake). */
export const cadreAbsOn = (s: Pick<AppState, 'cadreAbs'>, cid: string, date: ISODate): CadreAbs | undefined =>
  (s.cadreAbs || []).find((x) => x.cid === cid && x.from <= date && date <= x.to);
