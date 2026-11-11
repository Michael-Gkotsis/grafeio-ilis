// One minute clock for the whole app.
// Purpose: `useNowMin()` (minutes since midnight, local time) and the hooks that tell the app the clock was corrected.
// Does NOT: know about days or rules (`useToday` in app/hooks.ts builds on `onClockChange`).
// Owner layer: renderer/shared/lib. Why: whoever came back from leave shows as present as soon as the return time
//   passes, without a refresh (@decision Michael 20/10).
// Covering test: test/clock.test.ts.
import { useSyncExternalStore } from 'react';
import { nowMin } from '../../../shared/dates';

let cur = nowMin();
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
const notify = (set: Set<() => void>) => {
  for (const f of set) f();
};
const tick = () => {
  const n = nowMin();
  if (n !== cur) {
    cur = n;
    notify(subs);
  }
};
// The time zone or the correction changed: recompute at once (and the day, for useToday).
const daySubs = new Set<() => void>();
/** Recomputes the minute and tells both the minute subscribers and the day subscribers. */
export function clockChanged() {
  cur = nowMin();
  notify(subs);
  notify(daySubs);
}
/** Subscribes to clock corrections; returns the unsubscribe function. */
export const onClockChange = (f: () => void) => {
  daySubs.add(f);
  return () => {
    daySubs.delete(f);
  };
};
function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) {
    cur = nowMin();
    timer = setInterval(tick, 15000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const get = () => cur;
/** Minutes since midnight, local app time; re-renders the caller when the minute changes. */
export const useNowMin = (): number => useSyncExternalStore(subscribe, get);
