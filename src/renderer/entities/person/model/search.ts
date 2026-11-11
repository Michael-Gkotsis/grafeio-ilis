// People search for the renderer: accent-free, look-alike Latin letters, Latin typing for Greek names.
// Purpose: `searchPeople(people, query)` for Ctrl+K and every person picker; the index is built once per people array.
// Does NOT: touch React, the store or storage, and never returns inactive people.
// Owner layer: renderer/entities/person. Why: it is the person entity's search; pure, so it needs no store or nav.
// Covering test: test/ux-names.test.ts and test/notes.test.ts (Ctrl+K search), test/screens-main.test.ts (pickers).
import { normGreek, translit, collator, norm } from '../../../../shared/text';
import type { Person } from '../../../../shared/domain';

interface Indexed {
  p: Person;
  key: string;
  lat: string;
}

// WeakMap: the index dies with the people array, and an unchanged array (same reference after a sync) reuses it.
const indexCache = new WeakMap<Person[], Indexed[]>();

function indexOf(people: Person[]): Indexed[] {
  const cached = indexCache.get(people);
  if (cached) return cached;
  // Rank, role, post, specialty and ESSO are searchable too: «θαλαμαρχ», «ΚΨΜ», «2026 Γ» (for the saved lists).
  const index = people
    .filter((p) => p.active)
    .map((p) => ({
      p,
      key: normGreek(
        [
          p.last,
          p.first,
          p.father,
          p.asm,
          p.room != null ? 'Θ' + p.room : '',
          p.rank,
          p.origin,
          p.role,
          p.post,
          p.spec,
          p.essos,
        ]
          .filter(Boolean)
          .join(' '),
      ),
      lat: translit(p.last + ' ' + p.first),
    }));
  index.sort((a, b) => collator.compare(a.p.last, b.p.last) || collator.compare(a.p.first, b.p.first));
  indexCache.set(people, index);
  return index;
}

/**
 * Active people matching every word of `q` (accent-free), or whose Latin spelling contains the query.
 * Names that start with the first word come first. An empty query returns everyone, sorted by name.
 * @param people - `state.people`; the same array reference reuses the cached index
 * @param q - what the user typed, any case, Greek or Latin
 * @see test/ux-names.test.ts
 */
export function searchPeople(people: Person[], q: string): Person[] {
  const idx = indexOf(people);
  const raw = norm(q.trim());
  const n = normGreek(q.trim());
  if (!n) return idx.map((x) => x.p);
  const parts = n.split(/\s+/);
  return idx
    .filter((x) => parts.every((t) => x.key.includes(t)) || x.lat.includes(raw))
    .map((x) => ({ p: x.p, sc: x.key.startsWith(parts[0]) ? 0 : 1 }))
    .sort((a, b) => a.sc - b.sc)
    .map((x) => x.p);
}
