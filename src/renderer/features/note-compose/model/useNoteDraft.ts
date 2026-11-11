// The note being written: text, who it is for, a reminder and «σημαντική».
// Purpose: `useNoteDraft` is the state and the save of a NEW note, shared by the notes page, the Ctrl+Shift+N dialog
// and the «Σημειώσεις» tab of a person.
// Does NOT: draw anything, or edit a stored note (EditDialog keeps its own copy of the fields).
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import { dm } from '../../../../shared/dates';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/** The fields of a note being written. `rem` is an ISODate (local time) or '' for no reminder. */
export interface Draft {
  text: string;
  pids: number[];
  cids: string[];
  rem: string;
  star: boolean;
}

/** Who a new note starts bound to: the open person sheet or cadre sheet, if any. */
export interface Start {
  pid?: number;
  cid?: string;
}

/** What `useNoteDraft` hands to the composer. */
export type NoteDraft = ReturnType<typeof useNoteDraft>;

/** The pure empty draft, bound to `start`. */
export function firstDraft(start: Start): Draft {
  return {
    text: '',
    pids: start.pid != null ? [start.pid] : [],
    cids: start.cid ? [start.cid] : [],
    rem: '',
    star: false,
  };
}

/**
 * Το κείμενο, για ποιον είναι, υπενθύμιση και «σημαντική»: κοινό για τη σελίδα, το παράθυρο Ctrl+Shift+N και την καρτέλα ατόμου.
 * `save` resolves false when the text is empty or the command was refused; on success the draft is emptied again.
 */
export function useNoteDraft(start: Start = {}) {
  const { run, undoMark } = useStore();
  const toast = useToast();
  const first = (): Draft => firstDraft(start);
  const [d, setD] = useState<Draft>(first);
  const set = (x: Partial<Draft>) => setD((o) => ({ ...o, ...x }));
  const why = d.text.trim() ? '' : 'Λείπει: Κείμενο σημείωσης';
  const save = async (): Promise<boolean> => {
    if (why) return false;
    const note = {
      text: d.text,
      ...(d.pids.length ? { pids: d.pids } : {}),
      ...(d.cids.length ? { cids: d.cids } : {}),
      ...(d.rem ? { rem: d.rem } : {}),
      ...(d.star ? { star: true } : {}),
    };
    if (!(await run({ t: 'addNote', note }, false))) return false;
    toast({ text: d.rem ? 'Σημειώθηκε. Υπενθύμιση ' + dm(d.rem) + '.' : 'Σημειώθηκε.', actions: [undoMark()] });
    setD(first());
    return true;
  };
  return { d, set, why, save, dirty: d.text.trim().length > 0 };
}
