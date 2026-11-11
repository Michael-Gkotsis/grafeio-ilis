// Opens the card of a person on a note chip, over whichever screen is showing.
// Purpose: `useOpenWho` returns the click handler of a who-chip: a soldier opens the person sheet, a cadre member the cadre sheet.
// Does NOT: draw anything.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3c).
// Covering test: test/notes.test.ts.
import { useNav } from '../../../shared/model';
import type { NoteWhoItem } from '../../../../shared/notes';

/** The handler of a who-chip: opens the card of that person. */
export function useOpenWho() {
  const nav = useNav();
  return (x: NoteWhoItem) =>
    x.kind === 'sol' ? nav.openPerson(Number(x.key.slice(1))) : nav.openCadre(x.key.slice(1));
}
