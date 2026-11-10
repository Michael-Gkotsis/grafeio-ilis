// The once-a-day jobs of the open app.
//
// Purpose: `daily` runs at boot, every 10 minutes (the boot code sets the interval) and when the UI reports a new day:
//   it extends open statuses, expires finished ones, re-arms the write of the sheets that show only what is valid
//   today when the day changed, and takes the daily backup.
// Does NOT: set the interval, write Excel itself (it arms `runAuto`), or know the commands beyond running them.
// Owner layer: main (architecture), `features/autowrite`. Imports app/*, shared/*, `features/commands`, `run.ts`.
// Why: its day-change rewrite drives the auto-write, so it moves with it. Moved verbatim from main.ts (Phase 4.3a).
// Covering test: test/architecture.test.ts (layers, no cycle); the daily expiry rules are covered by
//   test/status*.test.ts; the Electron auto-write comparison in the PR description.
import fs from 'fs';
import path from 'path';
import { today } from '../../../shared/dates';
import { STATUS_KINDS, type ListKind } from '../../../shared/sources';
import { bindingOf } from '../../app/bindings';
import { DATA } from '../../app/paths';
import { autoTimer, dirty, setAutoTimer, store } from '../../app/state';
import { runCmd } from '../commands';
import { runAuto } from './run';

// The day of the previous call (ISODate, local time); '' before the first one
let dayOf = '';

/**
 * Every day: the medical/penalty statuses that ended yesterday are written to the history (Κ-04, Κ-10), and one copy
 * of the database is made. With the app open from one day to the next, the sheets with «Μόνο όσες ισχύουν» are
 * rewritten so that what expired yesterday is deleted (without a data change they would not be written until the
 * next start).
 */
export function daily() {
  const d = today();
  if (store.state.statuses.some((x) => x.open && x.to < d)) runCmd({ t: 'extendOpen' });
  if (!store.hasAuditToday(d, 'auto')) runCmd({ t: 'expire' });
  if (dayOf && dayOf !== d) {
    // the Δυναμολόγιο too: the totals under the ΣΥΝΟΛΙΚΟ are of today
    const ks: ListKind[] = [
      ...STATUS_KINDS.filter((k) => bindingOf(k)?.scope === 'active' && bindingOf(k)?.write !== false),
      ...(bindingOf('people') ? ['people' as const] : []),
    ];
    if (ks.length) {
      for (const k of ks) dirty.add(k);
      clearTimeout(autoTimer);
      setAutoTimer(setTimeout(runAuto, 1200));
    }
  }
  dayOf = d;
  const dir = path.join(DATA, 'backups');
  const has = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith('ilh_' + d));
  if (!has) {
    try {
      store.backup('ημερήσιο');
      store.pruneBackups();
    } catch (e) {
      console.error('backup', e);
    }
  }
}
