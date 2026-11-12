// The pure rules of the «Σημειώσεις» screen (pages/notes/model/view.ts): counts, people, filtering, order, subtitle.
import { describe, expect, it } from 'vitest';
import { countByFilter, filterNotes, notesSub, openPeople, sortDone } from '../src/renderer/pages/notes/model/view';
import type { Note } from '../src/shared/domain';
import { whoKey } from '../src/shared/notes';
import { fakeState } from './fixtures';

const state = fakeState(5);
const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  text: 'Σημείωση ' + id,
  at: '2026-11-01',
  ...extra,
});
const notes: Note[] = [
  note('a', { text: 'Τηλέφωνο συνεργείου' }),
  note('b', { pids: [2], rem: '2026-11-12', star: true }),
  note('c', { pids: [2, 3] }),
  note('d', { done: '2026-11-05', pids: [3] }),
  note('e', { done: '2026-11-09' }),
];

describe('notes view', () => {
  it('counts every filter button, done notes only under «done»', () => {
    expect(countByFilter(notes)).toEqual({ all: 3, rem: 1, star: 1, gen: 1, sol: 2, cad: 0, done: 2 });
  });

  it('lists people with open notes, each note counting for every person it names', () => {
    const people = openPeople(state, notes);
    expect(people.map((p) => [p.k, p.n])).toEqual(
      expect.arrayContaining([
        [whoKey({ pid: 2 }), 2],
        [whoKey({ pid: 3 }), 1],
      ]),
    );
    expect(people).toHaveLength(2);
    expect(people.map((p) => p.label)).toEqual(
      [...people.map((p) => p.label)].sort((a, b) => a.localeCompare(b, 'el')),
    );
  });

  it('filters by button, by person and by accent-free search text', () => {
    expect(filterNotes(state, notes, 'all', '', '').map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(filterNotes(state, notes, 'rem', '', '').map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(state, notes, 'all', whoKey({ pid: 3 }), '').map((n) => n.id)).toEqual(['c']);
    expect(filterNotes(state, notes, 'done', '', '').map((n) => n.id)).toEqual(['d', 'e']);
    expect(filterNotes(state, notes, 'all', '', 'ΤΗΛΕΦΩΝΟ συνεργειου').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(state, notes, 'all', '', 'δεν υπαρχει')).toEqual([]);
  });

  it('puts the most recently finished note first and does not change the input', () => {
    const done = notes.filter((n) => n.done);
    expect(sortDone(done).map((n) => n.id)).toEqual(['e', 'd']);
    expect(done.map((n) => n.id)).toEqual(['d', 'e']);
  });

  it('words the subtitle for one or many open notes and for reminders', () => {
    expect(notesSub(1, 0)).toBe('1 ανοιχτή · καμία υπενθύμιση για σήμερα');
    expect(notesSub(3, 1)).toBe('3 ανοιχτές · 1 υπενθύμιση ζητά προσοχή σήμερα');
    expect(notesSub(0, 2)).toBe('0 ανοιχτές · 2 υπενθυμίσεις ζητούν προσοχή σήμερα');
  });
});
