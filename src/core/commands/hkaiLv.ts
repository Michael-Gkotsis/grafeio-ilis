// The ΗΚΑΙ manual values with «3. Άδειες» on or off.
//
// Purpose: `withLv`: the manual ΗΚΑΙ of a day with the leave flag set, other values kept.
// Does NOT: decide the default of the flag.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Used by `setHkaiLv` and `freezeHkaiLv`.
// Covering tests: test/hkai.test.ts.
import type { ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { HkaiManual } from '../model/hkaiSettings';

/** The ΗΚΑΙ day with «3. Άδειες» on/off (hkaiManual[d].lv), without touching its other values. */
export const withLv = (s: AppState, d: ISODate, lv: boolean): HkaiManual => ({
  cells: s.hkaiManual[d]?.cells ?? {},
  text: s.hkaiManual[d]?.text ?? {},
  lv,
});
