// One soldier's line in «Ποιος κάνει τι»: name, one cell per duty, the weekdays and the reset button.
// Purpose: `WhoRow`, memoised: a click on a cell redraws only that line, not all 180.
// Does NOT: hold anything (the tab does; `onCell`, `onDay`, `onReset` and `onOpen` are stable callbacks).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/whodoes.ts (Phase 6); same props, markup and text
//   nodes.
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { memo, type CSSProperties } from 'react';
import { DOW_FULL } from '../../../../shared/dates';
import { WEEK, type Person, type Settings } from '../../../../shared/domain';
import { siOf } from '../../../../shared/si';
import { cx } from '../../../shared/lib/cx';
import { RkName, rkFull, rkShort } from '../../../entities/person';
import type { CapCell, CapCol } from '../../../../shared/rules';
import { cellView, DAY2 } from '../model/whoView';

/** Props of {@link WhoRow}. */
export interface WhoRowProps {
  p: Person;
  /** The sergeant set something by hand for this person: the reset button shows. */
  own: boolean;
  cols: CapCol[];
  cells: CapCell[];
  odd: boolean;
  grid: string;
  hintTxt?: string;
  hintTip?: string;
  hintBad?: boolean;
  lists: Settings['lists'];
  style: CSSProperties;
  onCell: (p: Person, col: CapCol, c: CapCell) => void;
  onDay: (p: Person, d: number) => void;
  onReset: (p: Person) => void;
  onOpen: (pid: number) => void;
}

/** The line. The function keeps the name `Row` the render-count scripts know it by. */
export const WhoRow = memo(function Row(props: WhoRowProps) {
  const { p, own, cols, cells, odd, grid, hintTxt, hintTip, hintBad, lists, style } = props;
  const { onCell, onDay, onReset, onOpen } = props;
  const hint = hintTxt ? { txt: hintTxt, tip: hintTip, bad: hintBad } : null;
  const days: number[] = p.offDays || [];
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, the row is not focusable
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before
    <div
      className={cx('ptable__row', 'whod__row', odd && 'is-odd')}
      role="row"
      style={{ ...style, gridTemplateColumns: grid }}
    >
      <span className="whod__name">
        <button
          type="button"
          className="linkish"
          onClick={() => onOpen(p.id)}
          data-tip={rkFull(p) + ' · καρτέλα οπλίτη'}
        >
          <b>
            <RkName p={p} />
          </b>
        </button>
        <small>
          {[p.room != null && 'Θ' + p.room, p.si && 'Σ.Ι. ' + siOf(p, lists).text, p.post && 'πόστο ' + p.post]
            .filter(Boolean)
            .join(' · ')}
          {hint && (
            <span className={cx('whod__hint', hint.bad && 'is-bad')} data-tip={hint.tip}>
              {hint.txt}
            </span>
          )}
        </small>
      </span>
      {cols.map((col, i) => {
        const v = cellView(cells[i], col);
        return (
          <span key={col.key} className="whod__c">
            <button
              type="button"
              className={cx('whod__cell', v.cls)}
              aria-label={rkShort(p) + ', ' + col.label + ': ' + v.tip.split('.')[0]}
              data-tip={v.tip}
              onClick={() => onCell(p, col, cells[i])}
            >
              {v.sym}
            </button>
          </span>
        );
      })}
      {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a span with role="group" as before */}
      <span className="whod__days" role="group" aria-label={'Μέρες υπηρεσίας ' + rkShort(p)}>
        {WEEK.map((d) => {
          const off = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              className={cx('whod__day', off && 'is-off', (d === 6 || d === 0) && 'is-we')}
              aria-pressed={!off}
              data-tip={
                off
                  ? 'Δεν κάνει υπηρεσία ' + DOW_FULL[d] + '. Πάτα: κάνει'
                  : 'Κάνει υπηρεσία ' + DOW_FULL[d] + '. Πάτα: όχι ' + DOW_FULL[d]
              }
              onClick={() => onDay(p, d)}
            >
              {DAY2(d)}
            </button>
          );
        })}
      </span>
      <span className="whod__reset">
        {own && (
          <button
            type="button"
            className="whod__x"
            aria-label={'Καμία εξαίρεση για ' + rkShort(p)}
            data-tip="Σβήνει ό,τι όρισες με το χέρι (✕, ✓! και μέρες)· μένουν μόνο Σ.Ι. και πόστο"
            data-tip-side="left"
            onClick={() => onReset(p)}
          >
            ↺
          </button>
        )}
      </span>
    </div>
  );
});
