// What the Ctrl+K palette lists for the text typed so far: recent people, commands, people and notes.
// Purpose: `usePaletteItems(query, ctx)` filters {@link paletteActions}, searches people and notes, and returns one
//   flat `items` list in the order the rows are drawn (the arrow keys walk through it).
// Does NOT: draw rows, handle keys or run a command (CommandPalette.tsx).
// Owner layer: renderer/app. Why: the lookup was 12 lines of CommandPalette's body; the draw code is now readable.
// Covering test: test/ux-names.test.ts (search by name), test/notes.test.ts (notes in the palette).
import { useMemo } from 'react';
import type { Person } from '../../shared/domain';
import { personMap } from '../../shared/rules';
import { noteSearch } from '../../shared/notes';
import { norm } from '../../shared/text';
import { recentPeople } from '../prefs';
import { searchPeople } from '../entities/person';
import { paletteActions, type PaletteAction, type PaletteContext } from './paletteActions';

type Note = PaletteContext['state']['notes'][number];

/** One selectable row. */
export type PaletteItem =
  | { kind: 'person'; p: Person }
  | { kind: 'action'; a: PaletteAction }
  | { kind: 'note'; x: Note };

/** Most people and notes shown for a query. */
const MAX_PEOPLE = 6;
const MAX_NOTES = 4;

/**
 * @param dq - the (deferred) text of the search box
 * @param ctx - navigation, state and dates the commands need
 * @returns the four groups and `items`: recent people (only while the box is empty), commands, people, notes
 */
export function usePaletteItems(dq: string, ctx: PaletteContext) {
  const { state } = ctx;
  const n = norm(dq.trim());
  const acts = paletteActions(ctx).filter((a) => !n || a.k.includes(n) || norm(a.t).includes(n));
  const ppl = n ? searchPeople(state.people, dq).slice(0, MAX_PEOPLE) : [];
  const nts =
    n.length > 1 ? (state.notes || []).filter((x) => !x.done && noteSearch(state, x, dq)).slice(0, MAX_NOTES) : [];
  // With an empty box: the last people you opened come first (prefs.ts keeps 5).
  const pm = personMap(state.people);
  const rec = useMemo(
    () =>
      recentPeople()
        .map((id) => pm.get(id))
        .filter((p): p is Person => !!p && p.active),
    [pm],
  );
  const recent = n ? [] : rec;
  const items: PaletteItem[] = [
    ...recent.map((p): PaletteItem => ({ kind: 'person', p })),
    ...acts.map((a): PaletteItem => ({ kind: 'action', a })),
    ...ppl.map((p): PaletteItem => ({ kind: 'person', p })),
    ...nts.map((x): PaletteItem => ({ kind: 'note', x })),
  ];
  return { recent, acts, ppl, nts, items };
}
