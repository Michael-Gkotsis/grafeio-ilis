// The «Σημειώσεις» tab of a person's or cadre member's card.
// Purpose: `NotesTab` shows what the Σημειώσεις page shows (quick composer, groups, done), for one person; the same data,
//   so what is done here shows there and back (Michael, 24/10). `who` is `{ pid }` or `{ cid }`; mount it with a key per person.
// Does NOT: write notes by itself: the composer, the cards and the editor run the commands.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3c); both sheets use it.
// Covering test: test/notes.test.ts.
import { useEffect, useMemo, useState } from 'react';
import { useNav, useStore } from '../../../shared/model';
import type { Note } from '../../../../shared/domain';
import { personGroups, whoKey } from '../../../../shared/notes';
import { useOpenWho } from '../model/useOpenWho';
import { useNoteDraft } from '../model/useNoteDraft';
import { EditDialog } from './EditDialog';
import { NoteComposer } from './NoteComposer';
import { NoteCard } from './NoteCard';
import { NoteGroup } from './NoteGroup';

/** Props of `NotesTab`. */
export interface NotesTabProps {
  who: { pid: number; cid?: undefined } | { cid: string; pid?: undefined };
}

// Η καρτέλα «Σημειώσεις» στην κάρτα στρατιώτη/στελέχους: ό,τι έχει η σελίδα (πλαίσιο, ομάδες, ολοκληρωμένες), για ένα άτομο.
// Ίδια δεδομένα με τη σελίδα, άρα ό,τι γίνεται εδώ φαίνεται εκεί και αντίστροφα. who: { pid } ή { cid }. Να μπαίνει με key ανά άτομο.
export function NotesTab({ who }: NotesTabProps) {
  const { state, today } = useStore();
  const nav = useNav();
  const openWho = useOpenWho();
  const draft = useNoteDraft(who);
  const [edit, setEdit] = useState<Note | null>(null);
  const [showDone, setShowDone] = useState(false);
  const g = useMemo(() => personGroups(state.notes, who, today), [state.notes, today, who.pid, who.cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const self = whoKey(who);
  // η κάρτα ρωτά πριν φύγει (άλλο άτομο, καρτέλα, κλείσιμο) όσο το πρόχειρο δεν έχει αποθηκευτεί
  useEffect(() => {
    nav.setDirty(draft.dirty);
    return () => nav.setDirty(false);
  }, [draft.dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const rest = { self, onEdit: setEdit, onOpen: openWho };
  return (
    <div className="note-tab">
      <div className="note-tab__bar">
        <span className="muted">
          {g.open} {g.open === 1 ? 'ανοιχτή' : 'ανοιχτές'}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          data-tip="Όλες οι σημειώσεις του στη σελίδα Σημειώσεις"
          onClick={() => nav.go('notes', { nwho: self })}
        >
          Άνοιγμα στη σελίδα
        </button>
      </div>
      <div className="ui-card note-quick">
        <NoteComposer draft={draft} ns="np" compact={true} />
      </div>
      <NoteGroup title="Πρέπει σήμερα" list={g.due} {...rest} />
      <NoteGroup title="Με υπενθύμιση" list={g.soon} {...rest} />
      <NoteGroup title="Χωρίς υπενθύμιση" list={g.rest} {...rest} />
      {g.open + g.done.length === 0 && (
        <p className="muted note-tab__empty">
          Δεν υπάρχει καμία σημείωση για αυτό το άτομο ακόμα. Γράψε την πρώτη από πάνω.
        </p>
      )}
      {g.done.length > 0 && (
        <section className="note-group">
          <div className="note-group__h">
            <button
              type="button"
              className="note-group__fold"
              aria-expanded={showDone}
              onClick={() => setShowDone(!showDone)}
            >
              {showDone ? '▾' : '▸'} Ολοκληρωμένες · {g.done.length}
            </button>
            <span className="note-group__line" />
          </div>
          {showDone && (
            <div className="note-list">
              {g.done.map((n: Note) => (
                <NoteCard key={n.id} n={n} {...rest} />
              ))}
            </div>
          )}
        </section>
      )}
      {edit && <EditDialog note={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
