// «Μέτρηση ταχύτητας» of the «Διάγνωση» screen: opens every menu screen and each of its tabs and times the next frame.
// Purpose: `runSpeed` clicks only menu buttons and tabs (no data changes), three times each, keeps the middle value,
//   and stores the table in `lastRun` so it is still there when the screen comes back.
// Does NOT: render anything or read the store. It runs outside the screen: «Διάγνωση» closes while the others open,
//   and `back()` returns to it at the end.
// Owner layer: renderer/pages/diag. Why: moved verbatim from screens/diag.ts (Phase 6).
// Covering test: test/diag-view.test.ts (median, tabName), test/screens-main.test.ts.
import { nowHM } from '../../../../shared/dates';
import { median, tabName } from './view';

/** One row of the speed table: a screen, or a tab of it (`tab`); `ms` is -1 when there was nothing to click. */
export interface Timing {
  name: string;
  ms: number;
  tab?: boolean;
}

/** The last speed run, kept for the life of the window (module state, not React state: the screen unmounts). */
let lastRun: { at: string; rows: Timing[] } | null = null;

/** The last speed run, or null before the first one. `at` is «HH:MM», local time. */
export const getLastRun = () => lastRun;

// three runs of each click; the middle one is kept
const RUNS = [1, 2, 3];
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function clickMs(el: Element | null | undefined) {
  if (!el) return -1;
  const a = performance.now();
  (el as HTMLElement).click();
  await frame();
  return performance.now() - a;
}
const navBtns = () => [...document.querySelectorAll('.sidenav .navbtn:not(.sidenav__toggle)')] as HTMLElement[];
const tabsOf = () =>
  [...(document.querySelector('.main [role=tablist]')?.querySelectorAll('[role=tab]') || [])] as HTMLElement[];

/** The tabs of the open screen, timed one by one; at the end the tab that was open is chosen again. */
async function timeTabs(screen: string, rows: Timing[]) {
  const tabs = tabsOf().map((el) => tabName(el.textContent || ''));
  const was = tabsOf().findIndex((t) => t.getAttribute('aria-selected') === 'true');
  // ordered awaits: each click must finish its frame before the next one is timed
  if (tabs.length > 1)
    for (const [j, tab] of tabs.entries()) {
      const ys: number[] = [];
      for (const _run of RUNS) {
        await clickMs(tabsOf()[(j + 1) % tabs.length]);
        ys.push(await clickMs(tabsOf()[j]));
      }
      rows.push({ name: screen + ' › ' + tab, ms: median(ys), tab: true });
    }
  if (was >= 0) await clickMs(tabsOf()[was]);
}

/**
 * Times every menu screen (from another screen, so it really opens) and then its tabs.
 * @param back called at the end to return to «Διάγνωση».
 * @param onStep the name of the screen being timed now, for the button text.
 */
export async function runSpeed(back: () => void, onStep: (s: string) => void) {
  const rows: Timing[] = [];
  const names = navBtns().map((b) => b.querySelector('.navbtn__lbl')?.textContent || '');
  for (const [i, name] of names.entries()) {
    onStep(name);
    const xs: number[] = [];
    for (const _run of RUNS) {
      await clickMs(navBtns()[i === 0 ? 1 : 0]);
      xs.push(await clickMs(navBtns()[i]));
    }
    rows.push({ name, ms: median(xs) });
    await timeTabs(name, rows);
  }
  lastRun = { at: nowHM(), rows };
  back();
}
