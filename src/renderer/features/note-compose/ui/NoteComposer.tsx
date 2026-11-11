// The quick-add box for a note: text with «@» suggestions, who, reminder, «Σημαντική» and the save button.
// Purpose: `NoteComposer` is used by the notes page, the Ctrl+Shift+N dialog and the «Σημειώσεις» tab of a person.
// Does NOT: own the draft (the caller passes `useNoteDraft()`).
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts.
import { NOTE_MAX } from '../../../../shared/notes';
import { Button, Why } from '../../../shared/ui';
import { useMention } from '../model/useMention';
import type { NoteDraft } from '../model/useNoteDraft';
import { RemPick } from './RemPick';
import { WhoField } from './WhoField';

/** Props of `NoteComposer`. `compact`: in the person sheet (480px), with shorter texts. `ns` prefixes the ids. */
export interface NoteComposerProps {
  draft: NoteDraft;
  autoFocus?: boolean;
  onSaved?: () => void;
  ns?: string;
  compact?: boolean;
}

/** Το πλαίσιο γρήγορης προσθήκης της σελίδας, του παραθύρου Ctrl+Shift+N και της καρτέλας ατόμου. */
export function NoteComposer({ draft, autoFocus, onSaved, ns = 'nt', compact }: NoteComposerProps) {
  const { d, set, why, save } = draft;
  const men = useMention(
    d.text,
    (text) => set({ text }),
    (x) =>
      x.kind === 'sol'
        ? set({ pids: d.pids.includes(x.id) ? d.pids : [...d.pids, x.id] })
        : set({ cids: d.cids.includes(x.id) ? d.cids : [...d.cids, x.id] }),
  );
  const go = async () => {
    if (await save()) onSaved?.();
  };
  return (
    <div className="note-comp">
      <div className="note-comp__box">
        <textarea
          id={ns + '-text'}
          className="ui-input note-text"
          rows={2}
          maxLength={NOTE_MAX}
          data-autofocus={autoFocus ? '' : undefined}
          aria-label="Κείμενο σημείωσης"
          placeholder={
            compact
              ? 'Γράψε τη σημείωση εδώ… (Ctrl+Enter)\nΜε @ δένεις κι άλλο άτομο, π.χ. @Παπαδ'
              : 'Γράψε τη σημείωση εδώ… (Ctrl+Enter για αποθήκευση)\nΜε @ δένεις το όνομα (όσα θες) με τη σημείωση, π.χ. @Παπαδ'
          }
          value={d.text}
          onChange={(e) => set({ text: e.target.value })}
          onKeyDown={(e) => {
            if (men.onKey(e)) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
        />
        {men.list}
      </div>
      <WhoField d={d} set={set} ns={ns} compact={compact} />
      <RemPick id={ns + '-rem'} value={d.rem} onChange={(rem) => set({ rem })} />
      <div className="note-comp__foot">
        <label className="ui-checkrow">
          <input type="checkbox" className="ui-check" checked={d.star} onChange={() => set({ star: !d.star })} />
          Σημαντική
        </label>
        <span className="note-comp__sp" />
        <Why text={why} />
        <Button disabled={!!why} why={why} onClick={go}>
          Αποθήκευση
        </Button>
      </div>
    </div>
  );
}
