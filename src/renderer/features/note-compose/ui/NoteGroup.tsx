// A titled group of note cards («Πρέπει σήμερα», «Με υπενθύμιση»…).
// Purpose: `NoteGroup` draws the heading with the count and a card for each note; nothing when the list is empty.
// Does NOT: sort or filter; the parent passes the list. Extra props go to every card.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (`Group`, Phase 5.3c).
// Covering test: test/notes.test.ts.
import type { Note } from '../../../../shared/domain';
import { NoteCard, type NoteCardProps } from './NoteCard';

/** Props of `NoteGroup`: the title, the list and what every card gets. */
export interface NoteGroupProps extends Omit<NoteCardProps, 'n'> {
  title: string;
  list: Note[];
}

export function NoteGroup({ title, list, ...rest }: NoteGroupProps) {
  if (!list.length) return null;
  return (
    <section className="note-group">
      <div className="note-group__h">
        <h2>
          {title} · {list.length}
        </h2>
        <span className="note-group__line" />
      </div>
      <div className="note-list">
        {list.map((n: Note) => (
          <NoteCard key={n.id} n={n} {...rest} />
        ))}
      </div>
    </section>
  );
}
