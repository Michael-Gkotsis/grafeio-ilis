// State of the «Σήμερα» page: every number and list the screen shows, computed once per render.
// Purpose: `useToday`, the hooks of `TodayScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the rules (model/view.ts and src/shared).
// Owner layer: renderer/pages/today. Why: moved verbatim from screens/today.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts, test/notes.test.ts, test/today-page-view.test.ts.
import { useMemo, useState } from 'react';
import { useNav, useStore, useUsbCopy } from '../../../shared/model';
import { useNowMin } from '../../../shared/lib/clock';
import { frouraEmpty } from '../../../shared/lib/sheets/froura';
import type { Status } from '../../../../shared/domain';
import { kolView, personMap, strengthOf, strengthAt } from '../../../../shared/rules';
import { nowHM } from '../../../../shared/dates';
import { newsSince, usbDue } from '../../../../shared/reminders';
import { outCountOn } from '../../../../shared/weaponView';
import { awayToday, endText, outUntilText, scanRecords } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the store pieces (`state`, `today`, `tomorrow`, `boot`), `nav`, `usb`, the dialog flag `forms` with
 *   `setForms`, the counts `c`, the lists `away`, `kol`, `news`, the scan of records (`ending`, `endTom`, `expired`,
 *   `nRec`), the numbers `empty`, `wOut`, `now`, the flag `due`, and the closures `outUntil`, `endTxt`
 */
export function useToday() {
  const { state, today, tomorrow, boot, audit } = useStore();
  const nav = useNav();
  const usb = useUsbCopy();
  const [forms, setForms] = useState(false);
  const due = usbDue(boot.lastUsb, today);
  const news = newsSince(audit, boot.seenUntil, boot.sessionStart);
  const pm = personMap(state.people);
  const now = useNowMin();
  const c = useMemo(() => strengthOf(state, today, strengthAt(state.rules, today, today, now)), [state, today, now]);
  // Away today with the reason and until when; the list stops at 12, the rest are on the Δύναμη screen
  const away = useMemo(() => awayToday(state, today, now), [state, today, now]);
  // Out/DN: until when the person is away («ως 22:00», «ως Δευ 06:00»), else «σήμερα» when the return is unknown
  const outUntil = (s: Status) => outUntilText(state, s, today);
  const empty = frouraEmpty(state, tomorrow);
  // People prevented (κωλυόμενοι) declared today (duty outside our unit), at the same moment as the present count
  const kol = useMemo(() => kolView(state, today, strengthAt(state.rules, today, today, now)), [state, today, now]);
  // Weapons out now: the same people the Οπλισμός header counts (movements and armed duties)
  const wOut = useMemo(
    () => outCountOn(state, today, nowHM()),
    [
      state.people,
      state.settings,
      state.rules,
      state.guards,
      state.dutyLog,
      state.weaponLog,
      state.dutyFix,
      today,
      now,
    ],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  // One scan of all statuses, only when they change (not on every render of «Σήμερα»)
  const scan = useMemo(
    () => scanRecords(state, pm, today, tomorrow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.statuses, state.settings.lists, state.people, today, tomorrow],
  );
  const endTxt = (s: Status) => endText(state, s, today, tomorrow, now);
  return {
    state,
    today,
    tomorrow,
    boot,
    nav,
    usb,
    forms,
    setForms,
    due,
    news,
    pm,
    now,
    c,
    away,
    outUntil,
    empty,
    kol,
    wOut,
    scan,
    endTxt,
  };
}
