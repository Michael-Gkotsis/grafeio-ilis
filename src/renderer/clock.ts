// Η ώρα τώρα (λεπτά από τα μεσάνυχτα), ένα ρολόι για όλη την εφαρμογή: όποιος γύρισε από άδεια φαίνεται παρών μόλις
// περάσει η ώρα επιστροφής του, χωρίς ανανέωση (Michael, 20/10)
import { useSyncExternalStore } from 'react';
import { nowMin } from '../shared/dates';

let cur = nowMin(); let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
const tick = () => { const n = nowMin(); if (n !== cur) { cur = n; subs.forEach(f => f()); } };
function subscribe(f: () => void) {
  subs.add(f); if (!timer) { cur = nowMin(); timer = setInterval(tick, 15000); }
  return () => { subs.delete(f); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}
const get = () => cur;
export const useNowMin = (): number => useSyncExternalStore(subscribe, get);
