// State of the «Ώρα και ζώνη ώρας» card: the zone choice, the correction and what the app and Windows show now.
// Purpose: `useClock`, the hooks of `ClockCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/ClockCard.tsx) or hold the rules (model/clockView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged. The card re-reads the clock on every render on purpose (`useNowMin` re-renders it each minute).
// Covering test: test/settings-clock-view.test.ts, test/screens-settings-guide.test.ts.
import { useMemo, useState } from 'react';
import { DEFAULT_TZ, appVsOs, nowParts, osParts, zoneLabel } from '../../../../shared/dates';
import { useNowMin } from '../../../shared/lib/clock';
import { useStore } from '../../../shared/model';
import { appOffset, clockMode, dstWord, isoOf, zoneList } from './clockView';

/**
 * Everything `ClockCard` reads and calls.
 * @returns `tz`, `fix`, the `mode`, the `zones`, the times `now` and `os`, the difference `vs` (minutes), `iso`,
 *   `zname`, `winOff` and `off` (ms), `dst`, and `save`, `pickMode` and `pickZone`
 */
export function useClock() {
  const { state, run } = useStore();
  useNowMin();
  const [pickOther, setPickOther] = useState(false);
  const tz = state.settings.tz || '';
  const fix = state.settings.clockFix || 0;
  const mode = clockMode(tz, pickOther);
  const zones = useMemo(zoneList, []);
  const save = (patch: { tz?: string; clockFix?: number }, text: string) =>
    run({ t: 'setSettings', settings: patch, text }, text);
  const now = nowParts();
  const os = osParts();
  const vs = appVsOs();
  const iso = isoOf(now);
  const zname = zoneLabel(tz || DEFAULT_TZ);
  const ms = Date.now() + fix * 6e4;
  const winOff = -new Date().getTimezoneOffset() * 6e4;
  const off = appOffset(tz, ms, winOff);
  const dst = dstWord(tz, off, now);
  const pickMode = (v: string) => {
    if (v === 'athens') {
      setPickOther(false);
      if (tz) save({ tz: '' }, 'Ώρα: Ελλάδα (Αθήνα)');
    } else if (v === 'win') {
      setPickOther(false);
      save({ tz: 'system' }, 'Ώρα: όπως τα Windows');
    } else setPickOther(true);
  };
  const pickZone = (v: string) => {
    if (v) save({ tz: v === DEFAULT_TZ ? '' : v }, 'Ώρα: ' + v);
  };
  return { tz, fix, mode, zones, now, os, vs, iso, zname, winOff, off, dst, save, pickMode, pickZone };
}
