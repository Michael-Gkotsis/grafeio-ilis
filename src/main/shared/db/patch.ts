// The undo patch: its shape, an empty one, and the diff of two maps that fills it.
//
// Purpose: `Rows`, `Patch`, `emptyPatch` and `diffMap`.
// Does NOT: write the patch to the database or apply it (`Store.commit`, `Store.addAudit`, `Store.revert`).
// Owner layer: main (architecture), `shared/db`.
// Why: FROZEN data contract (CLAUDE.md hard rule 3). A `Patch` is stored as JSON in column `audit.patch`, and the
//   actions of the previous version must stay undoable, so its shape must not change. Moved from src/main/db.ts with
//   the text byte for byte.
// Covering test: test/db.test.ts (undo and redo round trips).

/**
 * Undo difference of one table: the previous values of rows that changed or were deleted (put) and the keys of rows
 * that were added (del).
 */
export type Rows<K> = { put: [K, unknown][]; del: K[] };

/**
 * The difference for undo, per table. `request` and `kvd` are missing in patches written before the upgrade that added
 * them: undoing those patches works without them.
 */
export interface Patch {
  person: Rows<number>;
  status: Rows<string>;
  guard: Rows<string>;
  cap: Rows<number>;
  kv: Rows<string>;
  request?: Rows<string>;
  kvd?: (Rows<string> & { key: string })[];
}

/** A patch with no changes in any table. */
export const emptyPatch = (): Patch => ({
  person: { put: [], del: [] },
  status: { put: [], del: [] },
  guard: { put: [], del: [] },
  cap: { put: [], del: [] },
  kv: { put: [], del: [] },
  request: { put: [], del: [] },
  kvd: [],
});

/**
 * Compares two maps by key and by value identity (`!==`, not deep equality).
 *
 * @returns The keys whose value changed, the keys only in `before`, and the keys only in `after`.
 */
export function diffMap<K>(
  before: Map<K, unknown>,
  after: Map<K, unknown>,
): { changed: K[]; removed: K[]; added: K[] } {
  const changed: K[] = [],
    removed: K[] = [],
    added: K[] = [];
  before.forEach((v, k) => {
    if (!after.has(k)) removed.push(k);
    else if (after.get(k) !== v) changed.push(k);
  });
  after.forEach((_, k) => {
    if (!before.has(k)) added.push(k);
  });
  return { changed, removed, added };
}
