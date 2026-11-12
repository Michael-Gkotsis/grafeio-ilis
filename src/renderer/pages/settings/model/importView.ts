// Pure rules of the «ανανέωση από Excel» dialog of the status kinds: what is derived from the diff once it is known.
// Purpose: `importDerived` (the people map, the two kinds of change, the ΔΝ warning and the count on the button).
// Does NOT: render anything, touch React or call `window.api`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6) so the counts are
//   testable without a render.
// Covering test: test/settings-sources-view.test.ts.
import type { AppState, Person } from '../../../../shared/domain';
import type { StatusKind, diffStatuses } from '../../../../shared/sources';

/** What `diffStatuses` answers: new, changed, removed and unmatched records. */
export type StatusDiff = NonNullable<ReturnType<typeof diffStatuses>>;

/** Values worked out from the diff for the markup of the dialog. */
export interface ImportDerived {
  /** Person id → person. */
  pm: Map<number, Person>;
  /** Records that changed on both sides (the sergeant picks which side to keep). */
  both: StatusDiff['update'];
  /** Records that changed only in the Excel. */
  plain: StatusDiff['update'];
  /** Whether a ΔΝ for this person is entered although he has no ΔΝ right. */
  noDn: (pid: number) => boolean;
  /** How many new ΔΝ records are for people without the right. */
  noDnN: number;
  /** How many changes the button will pass. */
  n: number;
}

/**
 * Everything the markup of the import dialog needs besides the diff itself.
 * @param list - the status kind being imported
 * @param state - the app state (people)
 * @param d - the diff of the Excel against the app
 * @param keepApp - ids of the records where the app's value is kept
 * @param del - whether records removed from the Excel are also removed from the app
 */
export function importDerived(
  list: StatusKind,
  state: AppState,
  d: StatusDiff,
  keepApp: Set<string>,
  del: boolean,
): ImportDerived {
  const pm = new Map(state.people.map((p) => [p.id, p]));
  const both = d.update.filter((u) => u.conflict);
  const plain = d.update.filter((u) => !u.conflict);
  // ΔΝ for somebody without the right (only once at least one person has it): it passes, but the dialog says so.
  const noDn = (pid: number) => list === 'dn' && state.people.some((p) => p.dn) && !pm.get(pid)?.dn;
  const noDnN = d.add.filter((a) => noDn(a.pid)).length;
  const n = d.add.length + d.update.filter((u) => !keepApp.has(u.id)).length + (del ? d.removed.length : 0);
  return { pm, both, plain, noDn, noDnN, n };
}

/**
 * The set of kept ids after the sergeant picked a side for record `id`.
 * @param keepApp - the ids kept from the app so far
 * @param id - the record
 * @param on - true to keep the app's value
 * @returns a new set
 */
export function toggleKeepApp(keepApp: Set<string>, id: string, on: boolean): Set<string> {
  const x = new Set(keepApp);
  if (on) x.add(id);
  else x.delete(id);
  return x;
}
