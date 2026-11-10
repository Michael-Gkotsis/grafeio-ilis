// The automatic rewrite of the self-updating report sheets.
//
// Purpose: `regenReports`, which `runAuto` (features/autowrite) calls after every change that dirtied the reports.
// Does NOT: decide which reports update themselves (`autoReps`), write a sheet itself (sheet.ts), or schedule the run.
// Owner layer: main (architecture), `features/reports`. Imports app/*, shared/*, `features/autowrite`.
// Why: moved verbatim from main.ts (Phase 4.4). It cannot be imported by `features/autowrite` (that would be a cycle:
//   this file imports `autoReps` and `logWrite` from it), so main.ts hands it over with `onAutoWriteDeps`, as before.
// Covering test: test/architecture.test.ts (layers, no cycle); the Electron auto-write comparison in the PR
//   description.
import { today } from '../../../shared/dates';
import { repDate, rowsOf } from '../../../shared/reports';
import { msgOf } from '../../app/errors';
import { serial } from '../../app/serial';
import { setRepDirty, store } from '../../app/state';
import { LockedError } from '../../files';
import { autoReps, logWrite } from '../autowrite';
import { writeRepSheet } from './sheet';

/**
 * Rewrites the self-updating report sheets (`autoReps`) inside the auto-write run, one at a time in `serial`.
 * A locked file marks the reports dirty again (`repDirty`) so the minute retry tries once more.
 * @returns true when it tried at least one report
 */
export async function regenReports(): Promise<boolean> {
  let wrote = false;
  for (const r of autoReps()) {
    const tpl = (store.state.settings.reportTpls || []).find((t) => t.id === r.tpl);
    if (!tpl) continue;
    const t0 = Date.now();
    const d = repDate(r, today());
    try {
      const ids = rowsOf(store.state, r, d).map((x) => x.id);
      const res = await serial(() => writeRepSheet(r, tpl.file, ids, d, false));
      logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0, res.ok ? undefined : res.error);
      wrote = true;
    } catch (e) {
      if (e instanceof LockedError) setRepDirty(true);
      logWrite('Έντυπο ' + r.name + ' (φύλλο)', t0, msgOf(e));
    }
  }
  return wrote;
}
