// One row of the Excel preview. Purpose: `XlRow`, redrawn only when a cell of the row or its flash changed.
// Does NOT: know the sheet. Owner layer: renderer/widgets/excel-preview. Why: moved from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts.
import { Fragment, memo } from 'react';
import type { Cell } from '../../../shared/lib/sheets/model';
import { cx } from '../../../shared/lib/cx';
import { sameRow } from '../model/view';

/** Props of `XlRow`. */
export interface XlRowProps {
  r: (Cell | null)[];
  /** Zero-based row index (the row number shown is ri + 1). */
  ri: number;
  /** Column indexes to flash. */
  fl?: Set<number>;
  /** Flash generation: a new one restarts the CSS animation. */
  gen: number;
}

export const XlRow = memo(
  function XlRow({ r, ri, fl, gen }: XlRowProps) {
    return (
      <tr>
        <th>{ri + 1}</th>
        {r.map((c, ci) => {
          if (!c) return null;
          const f = !!fl && fl.has(ci);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
            <td key={ci + (f ? 'f' + gen : '')} colSpan={c.cs} rowSpan={c.rs} className={cx(c.s, f && 'flash')}>
              {c.rich
                ? c.rich.map((l, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model)
                    <Fragment key={i}>
                      {i > 0 && <br />}
                      {/* biome-ignore lint/suspicious/noArrayIndexKey: cells and rows have no identity: the position is the key (and the sheet is redrawn per model) */}
                      {l.map((r, j) => (r.u ? <u key={j}>{r.t}</u> : r.t))}
                    </Fragment>
                  ))
                : c.v}
            </td>
          );
        })}
      </tr>
    );
  },
  (a, b) => a.ri === b.ri && a.fl === b.fl && (!a.fl || a.gen === b.gen) && sameRow(a.r, b.r),
);
