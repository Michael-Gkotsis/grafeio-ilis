// Handlers: the automatic commands: close open statuses and expire old records.
//
// Purpose: The handlers of `extendOpen`, `expire`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: run on a user click: main runs them on start and at midnight.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/expired-excel.test.ts, test/open-future.test.ts, test/golden-outputs.test.ts,
//   test/rules.test.ts, test/duty-fuzz.test.ts.
import { addDays, dm } from '../../lib/dates';
import { TYPES, RECORD_CATS } from '../../model/status';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import { isRecordExpiredOn } from '../../duty/statuses';
import { statusLbl } from '../../people/kinds';
import { punLbl } from '../../statuses/punish';
import type { CommandOf, Ctx, Result, SeatMap } from '../types';

/** Handler of the command `extendOpen`. */
export function handleExtendOpen(s: AppState, _c: CommandOf<'extendOpen'>, ctx: Ctx): Result {
  // Records without an end (empty «έως» in the Excel): they hold today too. Without a history line, it cannot be
  // undone.
  const statuses = s.statuses.map((x) => (x.open && x.to < ctx.today ? { ...x, to: ctx.today } : x));
  return {
    state: statuses.some((x, i) => x !== s.statuses[i]) ? { ...s, statuses } : s,
    text: '',
    files: [],
    source: 'auto',
    undoable: false,
  };
}
/** Handler of the command `expire`. */
export function handleExpire(s: AppState, _c: CommandOf<'expire'>, ctx: Ctx, pm: SeatMap): Result {
  // The medicals and penalties that expired are «removed» (Κ-04, Κ-10): nothing changes in the data, it is only written
  // in the history so that the user sees it. Whatever expired since the last time (and while the app was closed) counts
  // as yesterday.
  const since = s.lastExpire || addDays(ctx.today, -1); // same day a second time: nothing
  const ex = s.statuses.filter(
    (x) =>
      !x.pending &&
      (s.lastExpire
        ? !x.open && RECORD_CATS.includes(TYPES[x.type].cat) && x.to >= since && x.to < ctx.today
        : isRecordExpiredOn(x, ctx.today)),
  );
  return {
    state: s.lastExpire === ctx.today ? s : { ...s, lastExpire: ctx.today },
    source: 'auto',
    undoable: false,
    files: [],
    text: ex.length ? 'Έληξαν και αφαιρέθηκαν ' + ex.length + ' καταχωρήσεις' : '',
    extra: ex.map(
      (x) =>
        'Έληξε: ' +
        (x.type === 'PUN' ? 'ποινή (' + punLbl(x.kind) + ')' : statusLbl(x, s.settings.lists)) +
        ' του ' +
        shortName(pm.get(x.pid)!) +
        ' (έως ' +
        dm(x.to) +
        ')',
    ),
  };
}
