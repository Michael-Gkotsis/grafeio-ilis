// State of the «Αργίες» card: the new holiday's fields, the show-old flag and the saves.
// Purpose: `useHolidays`, the hooks of `HolidaysCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/HolidaysCard.tsx) or hold the rules (model/holidaysView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-holidays-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import { useStore } from '../../../shared/model';
import {
  addChange,
  allHolidays,
  dropChange,
  generatedHolidays,
  pastCount,
  removedHolidays,
  restoreChange,
  shownHolidays,
  type HolidayChange,
  type HolidayRow,
} from './holidaysView';

/**
 * Everything `HolidaysCard` reads and calls.
 * @returns `today`, the new holiday's date `d` and name `n` with their setters, the show-old flag `old` with `setOld`,
 *   the `list` shown, the `past` count, the `removed` official ones, and `drop`, `restore` and `add` (which clears the
 *   fields when the command was done)
 */
export function useHolidays() {
  const { state, run, today } = useStore();
  const [d, setD] = useState('');
  const [n, setN] = useState('');
  const [old, setOld] = useState(false);
  const st = state.settings;
  const gen = generatedHolidays(today);
  const all = allHolidays(st, gen);
  const past = pastCount(all, today);
  const list = shownHolidays(all, today, old);
  const removed = removedHolidays(st, gen);
  const save = ({ patch, text }: HolidayChange) => run({ t: 'setSettings', settings: patch, text });
  const drop = (x: HolidayRow) => save(dropChange(st, x));
  const restore = (k: string, v: string) => save(restoreChange(st, k, v));
  const add = async () => {
    if (await save(addChange(st, d, n))) {
      setD('');
      setN('');
    }
  };
  return { today, d, setD, n, setN, old, setOld, list, past, removed, drop, restore, add };
}
