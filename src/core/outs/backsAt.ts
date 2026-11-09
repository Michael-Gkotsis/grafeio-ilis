// The people who have not yet returned at a minute of a day.
//
// Purpose: `backsAt`.
// Does NOT: compute the returns (returns.ts).
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core; imports core/duty/presence.ts
//   (which imports returns.ts), so it sits beside returns.ts and not inside it.
// Why: It uses `statusesAt`, which needs the returns. Keeping it here makes the import graph acyclic.
// Covering tests: test/return-hours.test.ts, test/outs-consumers.test.ts.
import type { ISODate } from '../lib/dates';
import { statusesAt } from '../duty/presence';
import type { AppState } from '../model/state';
import type { Back } from './returns';
import { isAway } from '../people/kinds';
import { mins } from '../statuses/hours';

/**
 * The ones who have not returned yet at moment `at` (minutes) of day `d`: without whoever returns today by then (the
 * «Σήμερα» with the time). The same rule as the Δύναμη: whoever still counts as absent stays, e.g. he had to return at
 * 16:00 for a duty but the leave says 22:00.
 */
export const backsAt = (s: AppState, bs: Back[], d: ISODate, at?: number) =>
  at == null
    ? bs
    : bs.filter(
        (b) =>
          b.r.open ||
          b.r.pending ||
          b.r.day !== d ||
          !b.r.time ||
          mins(b.r.time) > at ||
          statusesAt(s, b.p.id, d, at).some((x) => isAway(x, s.settings.lists)),
      );
