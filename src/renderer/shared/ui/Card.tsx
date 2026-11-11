// A titled box that holds a part of a screen; optionally folds.
// Purpose: `Card` draws the box with its head (title + actions) and body.
// Does NOT: remember whether it is open (the caller owns `open`) or lay out its children.
// Owner layer: renderer/shared/ui. Why: all screens group their content in cards.
// Covering test: test/screens-*.test.ts (cards are part of the screen snapshots).
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

/** Props of `Card`. */
export interface CardProps {
  /** Heading text or elements; a plain card without a title has no head at all. */
  title?: ReactNode;
  /** Buttons at the right of the head. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Foldable cards only (those with `onToggle`): body shown (true) or only the summary (false/undefined). */
  open?: boolean;
  /** Makes the card foldable: the head becomes a button that calls it. */
  onToggle?: () => void;
  /** Foldable cards only: what a closed card shows instead of the body (e.g. «3 ενεργές»). */
  summary?: ReactNode;
  /** Plain cards only: body without padding (tables that touch the edges). */
  flush?: boolean;
}

/**
 * Card with `onToggle` folds by a click on the head. A closed card shows only `summary` and does not render its
 * `children` at all, which keeps screens with many cards light.
 */
export function Card({ title, actions, children, open, onToggle, summary, flush }: CardProps) {
  if (onToggle) {
    return (
      <section className={cx('ui-card', 'ui-card--fold', !open && 'is-closed')}>
        <div className="ui-card__head">
          <h2>
            <button type="button" className="ui-card__toggle" aria-expanded={!!open} onClick={onToggle}>
              {Icon.chev}
              <span>{title}</span>
            </button>
          </h2>
          {actions}
        </div>
        {open ? (
          <div className="ui-card__body">{children}</div>
        ) : (
          summary && <div className="ui-card__sum">{summary}</div>
        )}
      </section>
    );
  }
  return (
    <section className="ui-card">
      {title && (
        <div className="ui-card__head">
          <h2>{title}</h2>
          {actions}
        </div>
      )}
      <div className={cx('ui-card__body', flush && 'ui-card__body--flush')}>{children}</div>
    </section>
  );
}
