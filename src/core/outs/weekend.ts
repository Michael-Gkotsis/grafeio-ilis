// Weekend (Michael, 18/10, 24/10): «ΔΝ ΣΚ» and the remarks next to the outs.
//
// Purpose: `WK`, `isSat`, `isWk`, `outLbl`, `withNote`, `outNoteOf`, `leaveStart` / `leaveText`, `dutyAt`.
// Does NOT: decide when people return (returns.ts).
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core; imports core/duty/posts.ts.
// Why: «ΔΝ ΣΚ» on a Saturday is ΔΝ on Saturday and Sunday. The remarks of the outs are written beside the status in
//   brackets.
// Covering tests: test/weekend.test.ts, test/returns.test.ts.
import { addDays, dm, DOW_FULL, type ISODate, parseD } from '../lib/dates';
import { postOf, postSpan } from '../duty/posts';
import type { AppState } from '../model/state';
import { type Status, TYPES } from '../model/status';

/**
 * The kind of the ΔΝ of a Saturday and of the ΔΝ of the Sunday that is entered by itself from it (before 24/10 it was
 * an out). «ΔΝ ΣΚ» on a Saturday = ΔΝ on Saturday and on Sunday (when they return is in returns.ts).
 * @decision Michael 18/10, 24/10: «ΔΝ ΣΚ».
 */
export const WK = 'ΣΚ';

/** True when the date is a Saturday. */
export const isSat = (d: ISODate) => parseD(d).getDay() === 6;

/** True when the status is a ΔΝ ΣΚ (an out of kind `WK`). */
export const isWk = (s: Pick<Status, 'type' | 'kind'>) => TYPES[s.type].cat === 'out' && s.kind === WK;

/** «ΔΝ ΣΚ» in the texts of the app and in the Excel; otherwise ΔΝ / Εξοδούχος. */
export const outLbl = (s: Pick<Status, 'type' | 'kind'>) => (isWk(s) ? 'ΔΝ ΣΚ' : TYPES[s.type].label);

/**
 * The remark of the day beside whatever the app writes: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», or the remark alone if there is nothing
 * else. The remarks of the outs and of the stay-ins are written beside the status, in brackets.
 */
export const withNote = (auto: string, note?: string) => {
  const n = (note || '').trim();
  return !n ? auto : auto ? auto + ' (' + n + ')' : n;
};

/** The remark of the outs of a person on a day, or the empty text. */
export const outNoteOf = (s: Pick<AppState, 'outNotes'>, d: ISODate, pid: number) => s.outNotes?.[d]?.[pid] || '';

/**
 * A leave (ΚΑ, honorary, sick) that starts on day `d` or the next: it is written in the remarks of the ΔΝ, like the
 * duty (Michael, 24/10): «ΑΔΕΙΑ ΑΠΟ ΚΥΡΙΑΚΗ 25/10 14:00».
 * @decision Michael 24/10: the leave in the remarks of the ΔΝ.
 */
export const leaveStart = (s: Pick<AppState, 'statuses'>, d: ISODate, pid: number): Status | undefined => {
  const nx = addDays(d, 1);
  return s.statuses.find(
    (x) => x.pid === pid && TYPES[x.type].cat === 'abs' && !x.pending && (x.from === d || x.from === nx),
  );
};

/** The text «ΑΔΕΙΑ ΑΠΟ <weekday> <dd/mm> <time>» of a leave. */
export const leaveText = (x: Pick<Status, 'from' | 'fromTime'>) =>
  'ΑΔΕΙΑ ΑΠΟ ' + DOW_FULL[parseD(x.from).getDay()] + ' ' + dm(x.from) + (x.fromTime ? ' ' + x.fromTime : '');

/** His duty on day `d` and from what time (of the post; the μαγειρεία and the ΤΑΕ have no time: «πρωί»), or null. */
export function dutyAt(s: AppState, d: ISODate, pid: number): { label: string; time: string } | null {
  const post = postOf(s, d, pid);
  if (!post) return null;
  const st = postSpan(post).start;
  const time =
    st == null ? '' : String(Math.floor((st % 1440) / 60)).padStart(2, '0') + ':' + String(st % 60).padStart(2, '0');
  return { label: post.label, time };
}
