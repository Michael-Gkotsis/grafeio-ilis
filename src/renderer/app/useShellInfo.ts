// Values the top bar and the menus show: the clock text, the undoable action, the ESSO and the menu badges.
// Purpose: `useShellInfo()` derives them from the store and keeps old «Αναίρεση» toasts honest.
// Does NOT: change state, draw anything or bind keys.
// Owner layer: renderer/app. Why: Shell was 150 lines of derived values before the markup started.
// Covering test: test/screens-main.test.ts (shell snapshots with the clock text and the undo tooltip).
import { useEffect, useMemo } from 'react';
import { DEFAULT_TZ, appVsOs, clockShift, durLabel, osParts, zoneLabel } from '../../shared/dates';
import { isWaiting } from '../../shared/domain';
import { dueCount } from '../../shared/notes';
import { currentEssos } from '../../shared/rosterLists';
import { essoPersonTxt } from '../../shared/esso';
import { useNowMin } from '../clock';
import { frouraEmpty } from '../sheets';
import { useToastPrune } from '../ui';
import type { NavBadges } from './SideNav';
import { useStore } from './store';

/** At most this many recent actions can be undone; the main process counts the same (db.lastUndoable). */
const UNDO_WINDOW = 50;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * @returns `hm` (hh:mm app time), `clockTip` (zone, correction and, if different, the Windows time), `lastUndo`
 *   (what the undo button would undo), `essos` (Settings › New ESSO, else the most common among people in strength) and
 *   `badges` (numbers on menu entries)
 */
export function useShellInfo() {
  const { state, audit, today, tomorrow } = useStore();
  const nm = useNowMin();
  const hm = pad2(Math.floor(nm / 60)) + ':' + pad2(nm % 60);
  // The tooltip explains the clock: zone, correction and, when they differ, the time on Windows.
  const clockTip = useMemo(() => {
    const st = state.settings;
    const fx = clockShift();
    const vs = appVsOs();
    const os = osParts();
    return (
      'Η ώρα της εφαρμογής (' +
      zoneLabel(st.tz || DEFAULT_TZ) +
      (fx ? ' · διόρθωση ' + (fx > 0 ? '+' : '−') + Math.abs(fx) + '′' : '') +
      '). Με αυτήν μετρούν η ΗΚΑΙ των 08:00, οι έξοδοι και οι επιστροφές. Κλικ: Ρυθμίσεις › Ώρα και ζώνη ώρας' +
      (Math.abs(vs) >= 1
        ? ' Τα Windows δείχνουν ' + pad2(os.h) + ':' + pad2(os.mi) + ' (διαφέρουν ' + durLabel(vs) + ').'
        : '')
    );
  }, [state.settings.tz, state.settings.clockFix, nm]);
  // An old «Αναίρεση» toast stays only while its action is still the last one.
  const prune = useToastPrune();
  useEffect(() => {
    prune(audit.find((a) => a.undoable && !a.undone)?.id ?? -1);
  }, [audit, prune]);
  // Like the main process: the first not-yet-undone action among the latest UNDO_WINDOW undoable ones.
  const lastUndo = useMemo(
    () =>
      audit
        .filter((a) => a.undoable)
        .slice(0, UNDO_WINDOW)
        .find((a) => !a.undone),
    [audit],
  );
  const essos = useMemo(
    () => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)),
    [state.settings.essos, state.people],
  );
  const guard = useMemo(
    () => (state.people.some((p) => p.active) ? frouraEmpty(state, tomorrow) : 0),
    [state, tomorrow],
  );
  const requests = useMemo(
    () => state.requests.filter((r) => isWaiting(r) && state.people.some((p) => p.id === r.pid && p.active)).length,
    [state.requests, state.people],
  );
  const notes = useMemo(() => dueCount(state.notes, today), [state.notes, today]);
  const badges: NavBadges = { guard, requests, notes };
  return { hm, clockTip, lastUndo, essos, badges };
}
