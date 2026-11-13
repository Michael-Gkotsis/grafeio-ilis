// The list card of the «Εξοδούχοι» screen: one virtual list of `OutRow`, or «Κανείς σε αυτό το φίλτρο.».
// Purpose: `outsList`, a plain function returning the card, called as `{outsList(o)}`.
// Does NOT: hold state (model/useOuts.ts). The row callbacks (`set`, `setNote`, `open`) are stable, so memoised rows
//   re-render only when their own data changes.
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import type { CSSProperties } from 'react';
import { VirtualList } from '../../../shared/ui';
import { unitOf, type Person } from '../../../../shared/domain';
import type { Outs } from '../model/useOuts';
import { OutRow } from './OutRow';

/** The card with the rows. `resetKey` scrolls back to the top when the filter, search, day, room or sort change. */
export const outsList = (o: Outs) => (
  <div className="ui-card" style={{ overflow: 'hidden' }}>
    {o.rows.length ? (
      <VirtualList
        items={o.rows}
        resetKey={o.filter + '|' + o.dq + '|' + o.date + '|' + o.room + '|' + o.sort}
        rowHeight={o.rh}
        height={o.height}
        renderRow={(p: Person, _i: number, style: CSSProperties) => (
          <OutRow
            key={p.id}
            p={p}
            unit={unitOf(p, o.state.settings)}
            style={style}
            reason={o.reasons[p.id]}
            away={o.aways.get(p.id)?.st}
            awayTxt={o.aways.get(p.id)?.note}
            value={o.draft[p.id]}
            changed={(o.saved[p.id] || null) !== (o.draft[p.id] || null)}
            onSet={o.set}
            onOpen={o.open}
            noDn={o.dnSet && !p.dn}
            sat={o.sat}
            sun={o.draft[p.id] === 'DNSK' ? o.sunWhy(p.id) : null}
            wkNote={o.wkSun.has(p.id)}
            note={o.notes[p.id] || ''}
            onNote={o.setNote}
          />
        )}
      />
    ) : (
      <div className="empty">Κανείς σε αυτό το φίλτρο.</div>
    )}
  </div>
);
