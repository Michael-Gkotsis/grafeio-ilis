// The service blocks of the «Θέσεις» tab: a foldable section per block with its seats.
// Purpose: `guardBlocks`, a plain function called as `{guardBlocks(G)}`; each block shows its name, armed or not, the
//   numbers × people, the empty count, and (open) its `PostRow`s.
// Does NOT: place anybody (`G.assign`, `G.next`, `G.blocked`) or hold the fold state (model/useGuardState.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup, keys and props.
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts.
import { blockShape, groupKey, type BlockDef, type Person, type Post } from '../../../../shared/domain';
import {
  capBlock,
  emptyStat,
  fairKey,
  guardUnavailable,
  lastResort,
  pickPeople,
  ruleBlock,
  statusWarn,
} from '../../../../shared/rules';
import { live } from '../../../../shared/ranks';
import { cx } from '../../../shared/lib/cx';
import { Icon } from '../../../shared/ui';
import { blockNames } from '../model/guardView';
import type { Guard } from '../model/useGuard';
import { FixedLine } from './FixedLine';
import { PostRow } from './PostRow';

// The seats of one block.
function seats(G: Guard, ps: Post[]) {
  const { state, nav, g, pm, date, st, why, locked, assign, next, blocked, epopHint } = G;
  return (
    <ul className="posts">
      {ps.map((x: Post) => {
        const pid = g[x.k];
        const d = pid ? st.get(pid) || emptyStat() : null;
        const first = ps.find((y: Post) => groupKey(y) === groupKey(x));
        return (
          <PostRow
            key={x.k}
            onOpen={nav.openPerson}
            x={x}
            same={first && first !== x ? first.short : ''}
            pid={pid}
            pm={pm}
            date={date}
            lists={state.settings.lists}
            statuses={live(state)}
            duty={d ? (d.byKind[fairKey(state, x)] || 0) + ' / ' + d.total : ''}
            ruleWarn={
              pid
                ? capBlock(state, date, pid, x) ||
                  ruleBlock(state, date, pid, undefined, x.k) ||
                  lastResort(state.statuses, date, pid, x, state.settings.lists) ||
                  statusWarn(state, date, pid)
                : null
            }
            why={pid ? why[x.k] || '' : ''}
            locked={locked}
            onAssign={assign}
            onNext={next}
            onBlocked={blocked}
            unavailable={(p: Person) => guardUnavailable(state, date, p.id, x.k)}
            hint={epopHint}
            pickFrom={pickPeople(state)}
          />
        );
      })}
    </ul>
  );
}

function section(G: Guard, b: BlockDef) {
  const { posts, g, fold, flip, pm, setFixedOpen } = G;
  const ps = posts.filter((x) => x.block === b.id);
  const emp = ps.filter((x) => !g[x.k]).length;
  const open = fold[b.id] ?? emp > 0;
  const names = blockNames(ps, g, pm);
  return (
    <section key={b.id} className={cx('gblock', !open && 'is-closed')}>
      <h2 className="gblock__hd">
        <button type="button" aria-expanded={open} onClick={() => flip(b.id, open)}>
          {Icon.chev}
          <span>{b.name}</span>
          <span
            className="gblock__meta"
            data-tip={
              b.armed ? 'Ένοπλη: δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01)' : 'Άοπλη: μπαίνουν και όσοι έχουν ΕΑ, ΕΟ'
            }
          >
            · {b.armed ? 'Ένοπλη' : 'Άοπλη'}
          </span>
          {blockShape(b).per > 1 && (
            <span className="gblock__meta" data-tip="Κάθε νούμερο έχει περισσότερα από ένα άτομα, με τις ίδιες ώρες">
              · {blockShape(b).nums} {blockShape(b).nums === 1 ? 'νούμερο' : 'νούμερα'} × {blockShape(b).per}
            </span>
          )}
          <span className={cx('gblock__meta', emp && 'is-bad')}>
            · {emp ? emp + ' ' + (emp === 1 ? 'κενή' : 'κενές') : 'πλήρης'}
          </span>
        </button>
        {!open && names && <span className="gblock__sum">{names}</span>}
      </h2>
      {open && (
        <>
          {seats(G, ps)}
          {b.id === 'ly' && <FixedLine onEdit={() => setFixedOpen(true)} />}
        </>
      )}
    </section>
  );
}

/** The sections of all visible blocks. */
export function guardBlocks(G: Guard) {
  return G.blocks.filter((b) => !b.hidden).map((b) => section(G, b));
}
