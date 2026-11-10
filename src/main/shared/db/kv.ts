// The key-value part of the database: which state fields live in table `kv`, and which of them are diffed per entry.
//
// Purpose: `KV_KEYS` (the fields stored as one row each), `KV_ENTRIES` (how big fields are split for undo) and
//   `entriesOf` (a field as a map of entries).
// Does NOT: read or write the database, or build patches (store.ts and patch.ts).
// Owner layer: main (architecture), `shared/db`.
// Why: FROZEN data contract (CLAUDE.md hard rule 3). The key names are the rows of `kv` in `data/ilh.db`, and the
//   `obj`/`ids` kinds decide the shape of `kvd` in stored undo patches, so actions of the previous version must stay
//   undoable. Moved from src/main/db.ts with the text byte for byte.
// Covering test: test/db.test.ts.

/** The state fields stored in table `kv`, one row per key. */
export const KV_KEYS = [
  'rules',
  'settings',
  'printed',
  'baseline',
  'hkaiManual',
  'cadreList',
  'cadreAbs',
  'dutyLog',
  'nightTraining',
  'weaponLog',
  'dutyFix',
  'notes',
  'outNotes',
  'imer',
  'hd',
  'dayPlan',
  'backFix',
  'lastExpire',
] as const;

/**
 * Values that grow every day: undo keeps only what changed (one day of the ΗΚΑΙ, one absence), not the whole value.
 * obj: an object keyed by date; ids: a list of records with an id.
 * dutyLog: duties without a seat per day (from Excel), nightTraining: days with night training, dayPlan: the hours
 * of a day, backFix: return corrections. The old version of the app simply does not read these.
 */
export const KV_ENTRIES: Partial<Record<string, 'obj' | 'ids'>> = {
  hkaiManual: 'obj',
  printed: 'obj',
  cadreAbs: 'ids',
  dutyLog: 'obj',
  nightTraining: 'obj',
  weaponLog: 'ids',
  dutyFix: 'ids',
  notes: 'ids',
  outNotes: 'obj',
  imer: 'obj',
  hd: 'obj',
  dayPlan: 'obj',
  backFix: 'ids',
};

/** One `KV_ENTRIES` field as a map from entry key (date or id) to entry. A missing value gives an empty map. */
export const entriesOf = (k: string, v: unknown): Map<string, unknown> =>
  KV_ENTRIES[k] === 'ids'
    ? new Map(((v as { id: string }[]) || []).map((x) => [x.id, x]))
    : new Map(Object.entries((v as Record<string, unknown>) || {}));
