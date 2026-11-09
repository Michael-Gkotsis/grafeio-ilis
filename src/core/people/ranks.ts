// Pick-lists of the people layer: ranks, origins, arms/corps, weapon types, and the unarmed rule of a Σ.Ι.
//
// Purpose: the base lists behind every rank / origin / Ο/Σ dropdown (app forms and Excel), `listRows` / `listOf` that
//   layer the user's hide/add changes on top, the split of "origin inside the rank", and `siUnarmed`.
//   Everything the user can change lives in `lists` (settings); the base values stay here.
// Does NOT: read or write any file, own the list shapes (core/model/lists.ts), or know the ΗΚΑΙ rows (hkRows.ts) or
//   how a leave / medical kind counts (kinds.ts); both import this file, never the other way round.
// Owner layer: core/people (no fs, no Electron, no React).
// Why: leaves, rules and the Excel readers all need these lists, so they sit below rules.ts. The old src/shared/ranks.ts
//   was one file; it is now ranks.ts + hkRows.ts + kinds.ts (the shim re-exports all three).
// Covering tests: test/lists.test.ts, test/origin.test.ts, test/si.test.ts.
import { collator, normGreek } from '../lib/text';
import { CADRE_ABS } from '../model/cadreRecord';
import { LEAVE_KINDS, PUN_KINDS, TYPES, type TypeKey } from '../model/status';
import type { AppState } from '../model/state';
import type { UserLists, ListId, ListItem } from '../model/lists';
export type { HkRowDef, UserLists, LeaveText, UserList, ListItem, ListId } from '../model/lists';

/**
 * Soldier ranks (Δυναμολόγιο). The origin (ΕΠΟΠ, ΟΒΑ...) is its own field, not part of the rank.
 * @decision Michael 22/10: origin is separate from the rank.
 */
export const SOLDIER_RANKS = ['ΣΤΡ', 'ΥΔΝΕΑΣ', 'ΔΝΕΑΣ', 'ΛΧΙΑΣ', 'ΔΕΑ'];
/** Cadre ranks, lowest to highest. An ΕΠΟΠ/ΟΒΑ soldier is ΣΤΡ with origin ΕΠΟΠ/ΟΒΑ. */
export const CADRE_RANKS = [
  'ΣΤΡ',
  'ΔΝΕΑΣ',
  'ΛΧΙΑΣ',
  'ΕΠΛΧΙΑΣ',
  'ΑΛΧΙΑΣ',
  'ΑΝΘΣΤΗΣ',
  'ΑΝΘΛΧΟΣ',
  'ΥΠΛΧΟΣ',
  'ΙΛΧΟΣ',
  'ΑΝΘΛΓΟΣ',
  'ΥΠΛΓΟΣ',
  'ΛΓΟΣ',
  'ΕΠΛΧΟΣ',
  'ΤΧΗΣ',
  'ΔΕΑ',
];
/**
 * Origins: soldiers and cadre share one list. On forms the origin is printed in front of the rank (ΕΠΟΠ ΛΧΙΑΣ), the
 * way the full name joins surname and first name (rankTxt); others are added in the Λίστες screen.
 * @decision Michael 22/10: origin has its own list.
 */
export const ORIGINS = ['ΕΠΟΠ', 'ΟΒΑ', 'ΣΜΥ', 'ΣΣΕ'];
/**
 * ΕΠΟΠ and ΟΒΑ: duties by hand only, up to the month limit (rules.ts isEpop); on the ΗΚΑΙ they count as soldiers, on
 * their own row.
 */
export const EPOP_ORIGINS = ['ΕΠΟΠ', 'ΟΒΑ'];
/**
 * Weapon types (Οπλισμός card); others are added in the Λίστες screen.
 * @decision Michael 17/10
 */
export const WEAPON_TYPES = ['G3A3', 'G3A4', 'M16A2', 'M4'];
/**
 * Reasons a weapon leaves the armourer, and the matching return reason of each; others are added in Λίστες.
 * @decision Michael 18/10: «ΕΚΠ» → «ΛΗΞ ΕΚΠ».
 */
export const WEAPON_OUT: [string, string][] = [
  ['ΕΚΠ', 'ΛΗΞ ΕΚΠ'],
  ['ΒΟΛΗ', 'ΛΗΞ ΒΟΛΗΣ'],
  ['ΑΣΚΗΣΗ', 'ΛΗΞ ΑΣΚΗΣΗΣ'],
  ['ΥΠΗΡΕΣΙΑ', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ'],
  ['ΚΑΘΑΡΙΣΜΟΣ', 'ΛΗΞ ΚΑΘΑΡΙΣΜΟΥ'],
  ['ΕΠΙΣΚΕΥΗ', 'ΕΠΙΣΤΡΟΦΗ ΑΠΟ ΕΠΙΣΚΕΥΗ'],
];
/** Arms and corps (column «Ο/Σ»). */
export const SPECS = ['ΠΖ', 'ΤΘ', 'ΠΒ', 'ΜΧ', 'ΔΒ', 'ΔΒ-ΗΠ', 'ΑΣ', 'ΤΧ', 'ΕΜ', 'ΥΓ', 'ΥΠ', 'ΓΕ'];

/** The base list, then every other value already present (alphabetical), without duplicates or blanks. */
export function optionsOf(base: readonly string[], seen: Iterable<string | null | undefined>): string[] {
  const key = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  const have = new Set(base.map(key));
  const extra: string[] = [];
  for (const v of seen) {
    if (!v || !v.trim()) continue;
    const k = key(v);
    if (have.has(k)) continue;
    have.add(k);
    extra.push(v.trim().replace(/\s+/g, ' '));
  }
  return [...base, ...extra.sort(collator.compare)];
}

/** Base items of every list, by list id; the user's hide/add changes are layered on top by listRows. */
export const LIST_BASE: Record<ListId, readonly string[]> = {
  soldierRanks: SOLDIER_RANKS,
  cadreRanks: CADRE_RANKS,
  origins: ORIGINS,
  specs: SPECS,
  punKinds: PUN_KINDS,
  leaveKinds: LEAVE_KINDS,
  cadreAbs: CADRE_ABS.map((x) => x[1]), // in cadre absences the base ones have a code (ka, an…); the user's own use their name
  medKinds: ['EA', 'EY', 'EO', 'EARV'].map((k) => TYPES[k as TypeKey].label),
  siUnarmed: ['ΑΟΠΛ', 'Ι4'], // a Σ.Ι. that contains «ΑΟΠΛ» or starts with «Ι4» (as before Λίστες existed)
  weaponTypes: WEAPON_TYPES,
  weaponOut: WEAPON_OUT.map((x) => x[0]),
};
/** Greek screen name of every list (Λίστες screen). */
export const LIST_NAME: Record<ListId, string> = {
  soldierRanks: 'Βαθμοί στρατιωτών',
  cadreRanks: 'Βαθμοί στελεχών',
  origins: 'Προελεύσεις',
  specs: 'Ο/Σ (όπλα και σώματα)',
  punKinds: 'Είδη ποινής',
  leaveKinds: 'Είδη άδειας',
  cadreAbs: 'Καταστάσεις στελεχών',
  medKinds: 'Ιατρικά',
  siUnarmed: 'Σ.Ι. άοπλων',
  weaponTypes: 'Τύποι όπλων',
  weaponOut: 'Λόγοι εξόδου όπλου',
};
/**
 * Same key for «Ε.Π.Ο.Π στρ» and «ΕΠΟΠ ΣΤΡ»: no accents, dots or double spaces, Latin look-alikes turned into Greek.
 */
export const itemKey = (v: string) => normGreek(v).replace(/\./g, '').replace(/\s+/g, ' ').trim();
// Ranks, origins, Ο/Σ and medical kinds are stored in capitals, as in the Excel files; penalty, leave and absence
// kinds stay as typed.
const UPPER: ListId[] = [
  'soldierRanks',
  'cadreRanks',
  'origins',
  'specs',
  'medKinds',
  'siUnarmed',
  'weaponTypes',
  'weaponOut',
];
/** Display/storage form of a list item: trimmed, single spaces, capitals for the lists in UPPER. */
export const itemName = (v: string, id: ListId = 'specs') => {
  const t = v.trim().replace(/\s+/g, ' ');
  return UPPER.includes(id) ? t.toUpperCase() : t;
};
/** One row of a list in the settings card: a base or own item with its hidden flag. */
export interface ListRow extends ListItem {
  builtin: boolean;
  hidden: boolean;
}
/** Every row of a list for the settings card: the base rows first, then the user's own in insertion order. */
export function listRows(lists: UserLists | undefined, id: ListId): ListRow[] {
  const u = lists?.[id] || {};
  const hide = new Set((u.hide || []).map(itemKey));
  const base = LIST_BASE[id].map((name) => ({ name, builtin: true, hidden: hide.has(itemKey(name)) }));
  const have = new Set(LIST_BASE[id].map(itemKey));
  const add: ListRow[] = [];
  for (const x of u.add || []) {
    const k = itemKey(x.name || '');
    if (!k || have.has(k)) continue;
    have.add(k);
    add.push({ ...x, builtin: false, hidden: hide.has(k) });
  }
  return [...base, ...add];
}
/** What the forms and the Excel dropdowns offer: the base items not hidden, plus the user's own. */
export const listOf = (lists: UserLists | undefined, id: ListId): string[] =>
  lists?.[id]
    ? listRows(lists, id)
        .filter((x) => !x.hidden)
        .map((x) => x.name)
    : [...LIST_BASE[id]];
// Origin: text once written inside the rank («ΕΠΟΠ ΛΧΙΑΣ», «Ο.Β.Α. ΣΤΡ») is split into origin and rank, in front of
// or behind the rank, with or without dots. Hidden and added origins count too, so nothing stays inside the rank.
const oKey = (v: string) => itemKey(v.replace(/[()]/g, ' '));
const originIdx = new WeakMap<object, string[]>();
const NO_ORIGINS = {};
function originNames(lists?: UserLists): string[] {
  const key = lists?.origins || NO_ORIGINS;
  let v = originIdx.get(key);
  if (!v) {
    v = listRows(lists, 'origins')
      .map((r) => r.name)
      .sort((a, b) => oKey(b).split(' ').length - oKey(a).split(' ').length);
    originIdx.set(key, v);
  }
  return v;
}
/**
 * Splits a rank text into its origin and rank part. Returns the whole text as rank when no known origin is found.
 */
export function splitRank(raw: string | null | undefined, lists?: UserLists): { rank: string; origin: string } {
  const t = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return { rank: '', origin: '' };
  const words = t.split(' ');
  const keys = words.map(oKey);
  for (const o of originNames(lists)) {
    const ok = oKey(o);
    const n = ok.split(' ').length;
    if (!ok || words.length < n) continue;
    if (keys.slice(0, n).join(' ') === ok) return { origin: o, rank: words.slice(n).join(' ') };
    if (keys.slice(-n).join(' ') === ok) return { origin: o, rank: words.slice(0, -n).join(' ') };
  }
  return { rank: t, origin: '' };
}
/** Rank with the origin in front, as printed on forms: «ΕΠΟΠ ΛΧΙΑΣ»; «ΛΧΙΑΣ» when there is no origin. */
export const rankTxt = (x: { rank?: string | null; origin?: string | null } | null | undefined) =>
  x ? [x.origin, x.rank].filter(Boolean).join(' ') : '';
/** True for ΕΠΟΠ and ΟΒΑ, which count as soldiers and get duties by hand only. */
export const isEpopOrigin = (origin: string | null | undefined) => {
  const k = oKey(origin || '');
  return !!k && EPOP_ORIGINS.some((o) => o === k);
};
/**
 * Rank and origin as stored: the origin in capitals; if the rank text contains an origin (and none was given) it is
 * taken from there. ΕΠΟΠ/ΟΒΑ without a rank means ΣΤΡ (the old «ΕΠΟΠ» of Στελέχη was the ΕΠΟΠ soldier).
 */
export function withOrigin<T extends { rank: string; origin?: string }>(x: T, lists?: UserLists): T {
  let origin = itemName(x.origin || '', 'origins');
  let rank = x.rank || '';
  const sp = splitRank(rank, lists);
  if (sp.origin && (!origin || oKey(sp.origin) === oKey(origin))) {
    origin = origin || sp.origin;
    rank = sp.rank || (isEpopOrigin(origin) ? 'ΣΤΡ' : '');
  }
  const known = originNames(lists).find((o) => oKey(o) === oKey(origin));
  if (known) origin = known;
  const out = { ...x, rank };
  if (origin) out.origin = origin;
  else delete out.origin;
  return out;
}
/**
 * Runs when the database opens (db.ts), however many times: whatever writes an origin inside the rank («ΕΠΟΠ ΛΧΙΑΣ»,
 * the old «ΕΠΟΠ» of Στελέχη) is split into rank and origin. The user's own ranks with an origin inside keep only the
 * rank (with the ΗΚΑΙ row set for them), or are dropped if that rank already exists. The ΗΚΑΙ row of each cadre
 * member stays the same.
 * Returns null when nothing changes.
 */
export function splitOrigins(s: AppState): AppState | null {
  const lists = s.settings.lists;
  const fix = <T extends { rank: string; origin?: string }>(x: T): T =>
    splitRank(x.rank, lists).origin ? withOrigin(x, lists) : x;
  const people = s.people.map(fix);
  const cadreList = (s.cadreList || []).map(fix);
  let next = lists;
  for (const id of ['soldierRanks', 'cadreRanks'] as const) {
    const add = lists?.[id]?.add;
    if (!add?.some((x) => splitRank(x.name, lists).origin)) continue;
    const have = new Set(LIST_BASE[id].map(itemKey));
    const out: ListItem[] = [];
    for (const x of add) {
      const name = splitRank(x.name, lists).origin ? splitRank(x.name, lists).rank : x.name;
      if (!name || have.has(itemKey(name))) continue;
      have.add(itemKey(name));
      out.push({ ...x, name });
    }
    next = { ...next, [id]: { ...next![id], add: out } };
  }
  const same =
    people.every((p, i) => p === s.people[i]) &&
    cadreList.every((c, i) => c === (s.cadreList || [])[i]) &&
    next === lists;
  return same
    ? null
    : { ...s, people, cadreList, settings: next === lists ? s.settings : { ...s.settings, lists: next } };
}
/**
 * Return reason of a weapon for an exit reason: the base one's (ΕΚΠ → ΛΗΞ ΕΚΠ), else the one set on the user's own
 * reason, else «ΛΗΞ <reason>».
 */
export function weaponBack(reason: string, lists?: UserLists): string {
  const k = itemKey(reason || '');
  if (!k) return '';
  const base = WEAPON_OUT.find((x) => itemKey(x[0]) === k);
  if (base) return base[1];
  const own = (lists?.weaponOut?.add || []).find((x) => itemKey(x.name) === k);
  return own?.back || 'ΛΗΞ ' + reason.trim().toUpperCase();
}
// Σ.Ι. → unarmed (not weapon-keeper, not sentry). The base ones as before: contains «ΑΟΠΛ» or starts with «Ι4»;
// «ΧΩΡΙΣ ΟΠΛΟ», the new name of Ι3 ΑΟΠΛΟ (Michael 17/10), counts as the same base «ΑΟΠΛ».
// The user's own: the Σ.Ι. starts with it, ignoring spaces and dots («Ι5» also matches «Ι 5», «Ι5 ΧΩΡΙΣ ΟΠΛΟ»).
// Hidden ones do not count.
const siKey = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
// Asked for every candidate on every seat: cached per Λίστες and Σ.Ι.
const unarmedIdx = new WeakMap<object, Map<string, boolean>>();
const NO_LISTS = {};
/** True when the Σ.Ι. text means unarmed, for the given Λίστες; cached per Λίστες and Σ.Ι. */
export function siUnarmed(si: string | undefined, lists?: UserLists): boolean {
  let m = unarmedIdx.get(lists || NO_LISTS);
  if (!m) {
    m = new Map();
    unarmedIdx.set(lists || NO_LISTS, m);
  }
  const key = si || '';
  let r = m.get(key);
  if (r === undefined) {
    r = siUnarmedRaw(key, lists);
    m.set(key, r);
  }
  return r;
}
function siUnarmedRaw(si: string, lists?: UserLists): boolean {
  const v = normGreek(si);
  if (!v) return false;
  const u = lists?.siUnarmed;
  const hide = new Set((u?.hide || []).map(itemKey));
  const k = siKey(v);
  if (!hide.has('ΑΟΠΛ') && (v.includes('ΑΟΠΛ') || k.includes('ΧΩΡΙΣΟΠΛ'))) return true;
  if (!hide.has('Ι4') && v.startsWith('Ι4')) return true;
  return (u?.add || []).some((x) => {
    const a = siKey(x.name || '');
    return !!a && !hide.has(itemKey(x.name)) && k.startsWith(a);
  });
}

/** ΕΠΟΠ/ΟΒΑ soldier → «ΕΠΟΠ Στρατιώτης» / «ΟΒΑ Στρατιώτης». */
export const originRow = (origin?: string) => {
  const k = oKey(origin || '');
  return k === 'ΕΠΟΠ' ? 'ΕΠΟΠ Στρατιώτης' : k === 'ΟΒΑ' ? 'ΟΒΑ Στρατιώτης' : undefined;
};
