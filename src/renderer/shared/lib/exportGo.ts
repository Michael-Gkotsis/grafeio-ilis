// Where «Δείξε μου» of an export check leads.
// Purpose: `GO` maps the `go` key of a pre-flight check (shared/preflight) to a screen and its params for a given date.
// Does NOT: navigate (the caller passes the result to `nav.go`) or run the checks.
// Owner layer: renderer/shared/lib. Why: moved down from renderer/common.ts (Phase 5.3b); the export gate (common.ts) and
// the «Έντυπα ημέρας» dialog (features/day-forms) both need it, and a feature may not import the other's owner.
// Covering test: test/reports-flow.test.ts.
import type { ISODate } from '../../../shared/dates';

/** Check `go` key to `[screen, params]`; `date` is an ISODate (local time). */
export const GO: Record<string, (d: ISODate) => [string, Record<string, unknown>]> = {
  guard: (d) => ['guard', { guardDate: d }],
  outs: (d) => ['outs', { outDate: d }],
  records: () => ['hkai', { hkTab: 'pun' }],
  settings: () => ['templates', { tab: 'settings' }],
  people: () => ['people', {}],
  cadre: () => ['cadre', {}],
};
