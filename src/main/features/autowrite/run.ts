// The auto-write run: one pass that writes everything that is waiting, and the minute retry.
//
// Purpose: `runAuto` (Excel files, then the filled forms, then the self-updating report sheets, with the «Γράφεται
//   στο Excel…» indicator), `retryPending` (what was open in Excel is tried again), the speed log of the writes
//   (`writeLog`, `logWrite`) and `autoReps` (which saved reports update themselves).
// Does NOT: decide what is dirty or when to run (schedule.ts, daily.ts, the boot code), write a file itself
//   (sync.ts, `features/exports` `regenForms`), or know the report writer and the sources status: the status push is
//   in `features/sources` and the report writer in `features/reports`, which both import this feature; main.ts
//   installs both with `onAutoWriteDeps`.
// Owner layer: main (architecture), `features/autowrite`. Imports app/*, shared/*, `features/exports`, `ipc/handle`.
// Why: moved verbatim from main.ts (Phase 4.3a). The two upward calls (`notify`, `regenReports`) are a hook for the
//   same reason as `onCommandApplied` and `onPrintPreview`: main.ts may not be imported (no cycle).
// Covering test: test/architecture.test.ts (layers, no cycle); the written files are covered by
//   `npm run bench:golden` and the Electron auto-write comparison in the PR description.
import path from 'path';
import { nowHM, today } from '../../../shared/dates';
import type { ExcelBusy, WriteTime } from '../../../shared/api';
import type { ListKind } from '../../../shared/sources';
import type { SourceMetaStore } from '../../sources';
import { eventChannel } from '../../ipc/handle';
import { bindingOf, srcMeta } from '../../app/bindings';
import { serial } from '../../app/serial';
import {
  autoBusy,
  autoTimer,
  dirty,
  formsDirty,
  repDirty,
  setAutoBusy,
  setAutoTimer,
  setFormsDirty,
  setRepDirty,
  store,
  win,
} from '../../app/state';
import { lastDay, readOuts, regenForms } from '../exports';
import { syncFileAuto } from './sync';

/** What the run needs from areas that import this feature: see `onAutoWriteDeps`. */
export interface AutoWriteDeps {
  /** Pushes the Excel status to the UI. */
  notify: () => void;
  /** Rewrites the self-updating report sheets; true when it wrote at least one. */
  regenReports: () => Promise<boolean>;
}
let deps: AutoWriteDeps = {
  notify: () => {
    throw new Error('onAutoWriteDeps was not installed'); // loud on purpose: a silent skip would drop the status
  },
  regenReports: () => {
    throw new Error('onAutoWriteDeps was not installed'); // loud on purpose: a silent skip would drop the reports
  },
};

/**
 * Installs `notify` (`features/sources`) and `regenReports` (`features/reports`), which `runAuto` calls. main.ts
 * installs them once while it loads, before any run can start (the first run is a timer).
 * @decision Phase 4.3a: a hook instead of an import, so the feature never imports main.ts (no cycle).
 * @decision Phase 4.3b: `notify` stays a hook: `features/sources` imports this feature (`importStatuses` arms the
 *   auto-write), so importing it here would be a cycle.
 * @decision Phase 4.4: `regenReports` stays a hook for the same reason: `features/reports` imports `autoReps` and
 *   `logWrite` from this feature.
 */
export function onAutoWriteDeps(next: AutoWriteDeps): void {
  deps = next;
}

/**
 * «Ενημερώνεται μόνο του»: the saved reports that are rewritten after every change, inside the auto-write (not the
 * random ones, which would change every time).
 */
export const autoReps = () =>
  (store.state.settings.reports || []).filter((r) => r.out === 'sheet' && r.target?.auto && r.pick.mode !== 'random');

/** Diagnostics › «Μέτρηση ταχύτητας»: how long the last writes to Excel took (newest first, at most 12). */
export const writeLog: WriteTime[] = [];
/**
 * Adds one write to the speed log.
 * @param t0 `Date.now()` when the write started
 */
export const logWrite = (what: string, t0: number, error?: string) => {
  writeLog.unshift({ at: nowHM(), what, ms: Date.now() - t0, error });
  writeLog.length = Math.min(writeLog.length, 12);
};

// the indicator in the top bar: «Γράφεται στο Excel…» / «Γράφτηκε 10:42»
const busy = (b: ExcelBusy) => {
  try {
    win?.webContents.send(eventChannel('onBusy'), b);
  } catch {
    /* window closed */
  }
};

/**
 * Writes everything that waits: the dirty Excel kinds (per file, one file at a time), then the forms already made,
 * then the self-updating report sheets. If a run is already going it asks for another try 1.5 s later. Never throws;
 * the indicator and the status are always refreshed at the end.
 */
export async function runAuto() {
  if (autoBusy) {
    clearTimeout(autoTimer);
    setAutoTimer(setTimeout(runAuto, 1500));
    return;
  }
  setAutoBusy(true);
  let wrote = false,
    err: string | undefined;
  try {
    // per file: all its kinds (e.g. the sheets of the Δυναμολόγιο) together
    const byFile = new Map<string, ListKind[]>();
    for (const k of [...dirty]) {
      dirty.delete(k);
      const b = bindingOf(k);
      if (!b) continue;
      const f = path.resolve(b.file);
      byFile.set(f, [...(byFile.get(f) || []), k]);
    }
    // the indicator only when there is something to write: files with changes or forms made for today and later
    if (byFile.size || (formsDirty && readOuts().some((o) => !o.manual && lastDay(o) >= today()))) {
      wrote = true;
      busy({ on: true });
    }
    for (const [f, ks] of byFile) {
      const t0 = Date.now();
      await serial(() => syncFileAuto(ks));
      logWrite(path.basename(f), t0, srcMeta.get(ks[0])?.error);
    }
    if (formsDirty) {
      setFormsDirty(false);
      const t0 = Date.now();
      if (await regenForms()) logWrite('Έντυπα (ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι)', t0);
    }
    if (repDirty) {
      setRepDirty(false);
      if (!wrote && autoReps().length) {
        wrote = true;
        busy({ on: true });
      }
      await deps.regenReports();
    }
  } catch (e) {
    console.error('auto', e);
    err = e instanceof Error ? e.message : String(e);
  } finally {
    setAutoBusy(false);
    deps.notify();
    if (wrote) busy({ on: false, at: nowHM(), error: err });
  }
}

/** What waits because the file was open in Excel is tried again every minute (the boot code sets the interval). */
export function retryPending() {
  const metas = srcMeta.all();
  let any = false;
  for (const [k, m] of Object.entries(metas) as [ListKind, NonNullable<ReturnType<SourceMetaStore['get']>>][])
    if (m?.pending && m.locked) {
      dirty.add(k);
      any = true;
    }
  if (readOuts().some((o) => o.pending)) {
    setFormsDirty(true);
    any = true;
  }
  if (repDirty) any = true;
  if (any) runAuto();
}
