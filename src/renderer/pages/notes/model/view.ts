// Pure rules of the «Σημειώσεις» screen: filter counts, people with open notes, the filtered rows and the subtitle.
// Purpose: `countByFilter`, `openPeople`, `filterNotes`, `sortDone`, `notesSub`, for the screen and its test.
// Does NOT: render anything, touch React, read the store or navigate (model/useNotes.ts does).
// Owner layer: renderer/pages/notes. Why: moved verbatim from screens/notes.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/notes-view.test.ts.
import type { Note } from '../../../../shared/domain';
import { NOTE_FILTERS, noteIn, noteKeys, noteSearch, noteWho, type NoteFilter } from '../../../../shared/notes';

type NoteState = Parameters<typeof noteWho>[0];

/** One person (soldier or cadre member) who has open notes, as a filter button. */
export interface NotePerson {
  /** `whoKey` of the person. */
  k: string;
  label: string;
  /** How many open notes name this person. */
  n: number;
  active: boolean;
}

/** How many notes each filter button would show (done notes count only under `done`, as `noteIn` decides). */
export function countByFilter(notes: Note[]): Record<NoteFilter, number> {
  return Object.fromEntries(NOTE_FILTERS.map(([f]) => [f, notes.filter((n) => noteIn(f, n)).length])) as Record<
    NoteFilter,
    number
  >;
}

/** People with open notes and how many, sorted by label in Greek order. A note naming two people counts for both. */
export function openPeople(state: NoteState, notes: Note[]): NotePerson[] {
  const byKey = new Map<string, NotePerson>();
  for (const n of notes) {
    if (n.done) continue;
    for (const it of noteWho(state, n).items) {
      const x = byKey.get(it.key) || { k: it.key, label: it.label, n: 0, active: it.active };
      x.n++;
      byKey.set(it.key, x);
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

/**
 * The notes the list shows.
 * @param filter - a filter button of `NOTE_FILTERS`
 * @param who - `whoKey` of the chosen person, or `''` for everybody
 * @param query - search text (deferred value of the box), matched without accents against text and names
 */
export function filterNotes(state: NoteState, notes: Note[], filter: NoteFilter, who: string, query: string): Note[] {
  return notes.filter((n) => noteIn(filter, n) && (!who || noteKeys(n).includes(who)) && noteSearch(state, n, query));
}

/** The «Ολοκληρωμένες» order: the most recently finished first (`done` is an ISO date or empty). */
export const sortDone = (rows: Note[]): Note[] => [...rows].sort((a, b) => (b.done || '').localeCompare(a.done || ''));

/** The page subtitle: open notes and how many reminders ask for attention today. */
export function notesSub(open: number, due: number): string {
  return (
    open +
    (open === 1 ? ' ανοιχτή' : ' ανοιχτές') +
    (due
      ? ' · ' + due + (due === 1 ? ' υπενθύμιση ζητά' : ' υπενθυμίσεις ζητούν') + ' προσοχή σήμερα'
      : ' · καμία υπενθύμιση για σήμερα')
  );
}
