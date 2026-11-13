// Stored choices, the draft the user edits and the note drafts of the «Εξοδούχοι» screen.
// Purpose: `useOutsDraft`, the first hooks of `OutsScreen` after the store, in the order the screen always called them.
// Does NOT: filter rows, save or draw (useOutsRows.ts, outsActions.ts, ui/).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ISODate } from '../../../../shared/dates';
import type { AppState } from '../../../../shared/domain';
import { NO_NOTES, mergeDraft, savedOuts, weekendSunPids, type OutDraft } from './view';

/**
 * The stored map of the day, who came in from «ΔΝ ΣΚ», the draft and the note drafts.
 * A new day starts the draft over. On the same day, when the stored statuses change elsewhere (a declaration, a read
 * from Excel), what the user changed here and nobody else changed stays in the draft instead of being lost.
 * @param date - ISODate of the day on screen
 * @param sat - whether `date` is a Saturday
 */
export function useOutsDraft(state: AppState, date: ISODate, sat: boolean) {
  const saved = useMemo(() => savedOuts(state.statuses, date, sat), [state.statuses, date]);
  const wkSun = useMemo(() => weekendSunPids(state.statuses, date, sat), [state.statuses, date, sat]);
  const savedNotes = state.outNotes?.[date] || NO_NOTES;
  const [notes, setNotes] = useState<Record<number, string>>(savedNotes);
  useEffect(() => setNotes(savedNotes), [savedNotes]);
  const [draft, setDraft] = useState<OutDraft>(saved);
  const last = useRef({ saved, date });
  useEffect(() => {
    const old = last.current;
    last.current = { saved, date };
    if (old.date !== date) {
      setDraft(saved);
      return;
    }
    if (old.saved === saved) return;
    setDraft((d) => mergeDraft(d, saved, old.saved));
  }, [saved, date]);
  return { saved, wkSun, savedNotes, notes, setNotes, draft, setDraft };
}
