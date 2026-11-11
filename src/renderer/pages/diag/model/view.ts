// Pure helpers of the hidden «Διάγνωση» screen: memory totals, the time texts and the colour of a timing.
// Purpose: everything the screen computes from `Diag` and from a speed run, so it can be tested without a browser.
// Does NOT: call the API, poll, or touch the DOM (model/useDiag.ts and model/speedRun.ts do).
// Owner layer: renderer/pages/diag. Why: moved verbatim from screens/diag.ts (Phase 6), view logic out of the markup.
// Covering test: test/diag-view.test.ts, test/screens-main.test.ts.
import type { Diag } from '../../../../shared/api';

/** Above this total (KB, all processes) the screen suggests turning off GPU acceleration. */
export const MEM_WARN_KB = 250 * 1024;

/** KB as whole MB, e.g. `"84 MB"` (rounded by `toFixed(0)`). */
export const mb = (kb: number) => (kb / 1024).toFixed(0) + ' MB';

/** Sum of the memory of every process, in KB. */
export const memTotalKb = (procs: Diag['procs']) => procs.reduce((a, p) => a + p.kb, 0);

/** The colour of one timing: over 1 s is bad, over 0.4 s is a warning (the caption says «κάτω από 0,4 δευτ.»). */
export const tone = (ms: number) => (ms > 1000 ? 'bad' : ms > 400 ? 'warn' : 'ok');

/**
 * Start-up time in seconds with one decimal and a dot, as the screen has always shown it, e.g. `"2.3"`.
 * The markup adds « δευτ.» as its own text node, as before (bench:styles compares text nodes).
 */
export const startupSecs = (ms: number) => (ms / 1000).toFixed(1);

/** Duration of one Excel write: one decimal with a Greek comma, e.g. `"1,4 δευτ."`. */
export const writeText = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',') + ' δευτ.';

/** One row of the speed table: two decimals with a Greek comma; a negative time (nothing to click) is «—». */
export const speedText = (ms: number) => (ms < 0 ? '—' : (ms / 1000).toFixed(2).replace('.', ',') + ' δευτ.');

/** The middle value of an odd number of runs (the speed run does 3), rounded to whole ms. */
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
};

/** A tab's name without its trailing count, e.g. `"Ποινές (3)"` → `"Ποινές"`. */
export const tabName = (text: string) => text.replace(/\s*\(?\d+\)?\s*$/, '').trim();
