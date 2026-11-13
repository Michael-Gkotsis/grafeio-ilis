// A row of up to four counters with an optional wide «check» cell, drawn as one bordered strip.
// Purpose: `KpiStrip`, the counters of «Δύναμη» and «ΗΚΑΙ»: a cell is a `button[aria-pressed]` when it has `onPick`,
//   a plain box otherwise.
// Does NOT: hold state (the page owns which cell is pressed), count anything or decide a filter.
// Owner layer: renderer/shared/ui. Why: U12 built the strip inside pages/strength; U13 («ΗΚΑΙ») needs the same one,
//   and a page may not import another page, so it moved here with the same DOM and look.
// Covering test: test/screens-main.test.ts, test/strength-page-view.test.ts, bench:styles (groups «Δύναμη», «ΗΚΑΙ»).
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/** One counter of the strip. */
export interface KpiCell {
  /** React key, unique in the strip. */
  key: string;
  /** Small label above the number, e.g. «Παρόντες». */
  label: ReactNode;
  /** The number (shown with tabular digits). */
  value: ReactNode;
  /** Tooltip (`data-tip`). */
  tip?: string;
  /** `ok`: the number takes the success colour (e.g. «Παρόντες», «Διαθέσιμοι»). */
  tone?: 'ok';
  /** Makes the cell a button; `pressed` is then its `aria-pressed`. */
  onPick?: () => void;
  pressed?: boolean;
}

/** Props of `KpiStrip`. */
export interface KpiStripProps {
  /** Up to four counters (the grid has four equal columns). */
  cells: KpiCell[];
  /** The wide non-clickable cell after the counters: a small label and the sum line (`children`). */
  check?: { label: ReactNode; children: ReactNode };
}

/** The strip. With `check` the grid gets a fifth, wider column; under 1024 px it is 2 x 2, on a phone one column. */
export function KpiStrip({ cells, check }: KpiStripProps) {
  return (
    <div className={cx('ui-kpis', check && 'ui-kpis--check')}>
      {cells.map((c) => {
        const inner = (
          <>
            <span className="ui-kpi__l">{c.label}</span>
            <span className="ui-kpi__n">{c.value}</span>
          </>
        );
        const cls = cx('ui-kpi', c.tone === 'ok' && 'ui-kpi--ok');
        return c.onPick ? (
          <button
            key={c.key}
            type="button"
            className={cls}
            aria-pressed={!!c.pressed}
            data-tip={c.tip}
            onClick={c.onPick}
          >
            {inner}
          </button>
        ) : (
          <div key={c.key} className={cls} data-tip={c.tip}>
            {inner}
          </div>
        );
      })}
      {check && (
        <div className="ui-kpis__check">
          <span className="ui-kpi__l">{check.label}</span>
          <span className="ui-kpis__sum num">{check.children}</span>
        </div>
      )}
    </div>
  );
}
