// The «Το έχουν N» list of the «Λίστες» card: who has an item.
// Purpose: `WhoHas`: the soldiers open their card (with ↑/↓ inside this list), the cadre members are only names.
// Does NOT: know the lists (the holders come as a prop).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); a component because it
//   reads the store and the nav, as before.
// Covering test: test/screens-settings-guide.test.ts.
import type { Person } from '../../../../../shared/domain';
import { personMap } from '../../../../../shared/rules';
import { collator } from '../../../../../shared/text';
import { rkShort } from '../../../../entities/person';
import { useNav, useStore } from '../../../../shared/model';
import type { Holders } from '../../model/listsView';

/** The names of the holders `e`; nothing when `e` is missing. */
export function WhoHas({ e }: { e?: Holders }) {
  const { state } = useStore();
  const nav = useNav();
  if (!e) return null;
  const pm = personMap(state.people);
  const ps = [...e.pids]
    .map((id) => pm.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
  const ids = ps.map((p) => p.id);
  return (
    <div className="lists__who">
      {ps.map((p) => (
        <button key={p.id} type="button" className="na linkish" onClick={() => nav.openPerson(p.id, ids)}>
          {rkShort(p)}
          {!p.active && (
            <>
              {' '}
              <span className="muted">(εκτός)</span>
            </>
          )}
        </button>
      ))}
      {[...e.names].sort(collator.compare).map((n) => (
        <span key={n} className="na">
          {n}
        </span>
      ))}
    </div>
  );
}
