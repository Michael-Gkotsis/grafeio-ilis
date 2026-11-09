// Changes of defaults in settings that were saved by an older version (settings.rev).
//
// Purpose: `migrateSettings` brings any saved Settings up to the revision in DEFAULT_SETTINGS, one rev at a time.
// Does NOT: migrate the database (src/main/db.ts: rev 6 and 7 need state.caps and live there) or run on its own.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: users upgrade in place; each rev rewrites only what that version changed, and never loses a user's choice.
// Covering tests: test/own-phases.test.ts, test/codes.test.ts.
import { greekHolidays } from '../lib/dates';
import { DEFAULT_BLOCKS_SPEN } from './defaultBlocks';
import { withCodes } from './codes';
import type { Settings } from './settings';

/** Changes of defaults in settings that were already saved. Pure: returns a new object for every rev applied. */
export function migrateSettings(st: Settings): Settings {
  if ((st.rev || 0) < 2) {
    // rev 2: ΤΑΕ is armed and has no hours (sergeant, 10/10)
    const blocksSpen = (st.blocksSpen || DEFAULT_BLOCKS_SPEN).map((b) =>
      b.id === 'tae' ? { ...b, armed: true, posts: b.posts.map((p) => ({ ...p, hrs: '' })) } : b,
    );
    st = { ...st, blocksSpen, fixed: st.fixed || {}, rev: 2 };
  }
  if ((st.rev || 0) < 3) st = withCodes({ ...st, rev: 3 });
  if ((st.rev || 0) < 4) {
    // rev 4: the official holidays come by themselves every year; those that were written (the old defaults up to
    // 15/8/2027) leave the user's own, so removing them works like for all official ones
    const holidays = Object.fromEntries(
      Object.entries(st.holidays || {}).filter(([d]) => !greekHolidays(+d.slice(0, 4))[d]),
    );
    st = { ...st, holidays, rev: 4 };
  }
  if ((st.rev || 0) < 5) {
    // rev 5: «Ι3 ΑΟΠΛΟ» is now called «Ι3 ΧΩΡΙΣ ΟΠΛΟ» (Michael, 17/10); the rows of the Σ.Ι. table get the new name
    const cells = st.lists?.si?.cells;
    const old = 'Ι3 ΑΟΠΛΟ',
      now = 'Ι3 ΧΩΡΙΣ ΟΠΛΟ';
    const ren = (k: string) => (k === old || k.startsWith(old + ' · ') ? now + k.slice(old.length) : k);
    st = {
      ...st,
      rev: 5,
      ...(cells && Object.keys(cells).some((k) => ren(k) !== k)
        ? {
            lists: {
              ...st.lists,
              si: {
                ...st.lists!.si,
                cells: Object.fromEntries(
                  Object.entries(cells).map(([k, v]) => [ren(k), { ...(cells[ren(k)] || {}), ...v }]),
                ),
              },
            },
          }
        : {}),
    };
  }
  // rev 6 (its own capability for each of the user's duties) also needs s.caps: it is done in db.ts (capsPerService),
  // together with rev 7 (each of the user's duties counts as its own, ownKinds), which must run after it
  return st;
}
