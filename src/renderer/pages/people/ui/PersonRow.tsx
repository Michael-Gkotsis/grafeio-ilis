// One soldier in the «Δυναμολόγιο»: a table row (desktop) and a card (phone).
// Purpose: `PersonRow` and `PersonCard`, the two `memo` components the VirtualList draws ~20 of.
// Does NOT: sort, filter or open the card: the list passes `onOpen` (one stable callback for all rows) and `st`.
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6). They stay `memo` with the
//   same props, so a click on one row, or a scroll, redraws only the rows whose props changed.
// Covering test: test/perf.test.ts (rows in the page), test/screens-main.test.ts (markup), test/notes.test.ts.
import { memo, type CSSProperties, type KeyboardEvent } from 'react';
import { TYPES, plainName, type Person, type Status, type TypeKey } from '../../../../shared/domain';
import { rankTxt, type UserLists } from '../../../../shared/ranks';
import { siOf, siShort } from '../../../../shared/si';
import { NoteDot, type NoteMark } from '../../../entities/note';
import { RkName } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge } from '../../../shared/ui';
import { cardLine, longTip, stTxt } from '../model/view';

/** Props of {@link PersonRow}. */
export interface PersonRowProps {
  p: Person;
  /** Position in the shown list, from 1. */
  n: number;
  odd: boolean;
  /** The absolute-position style the VirtualList gives the row. */
  style: CSSProperties;
  /** `gridTemplateColumns` of the row. */
  grid: string;
  /** The leave / penalty shown in the extra column, only on those two filters. */
  st: Status | undefined;
  lists: UserLists | undefined;
  selected: boolean;
  onOpen: (id: number) => void;
  narrow: boolean;
  nm: NoteMark | undefined;
}

/** A table row; Enter or a click opens the soldier's card. */
export const PersonRow = memo(function PersonRow({
  p,
  n,
  odd,
  style,
  grid,
  st,
  lists,
  selected,
  onOpen,
  narrow,
  nm,
}: PersonRowProps) {
  const si = p.si ? siOf(p, lists).text : '';
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before
    <div
      className={cx('ptable__row', odd && 'is-odd', selected && 'is-sel')}
      style={{ ...style, gridTemplateColumns: grid }}
      role="row"
      tabIndex={0}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') onOpen(p.id);
      }}
    >
      <span className="num muted">{n}</span>
      <span data-tip={rankTxt(p)}>{rankTxt(p)}</span>
      <span>{p.spec}</span>
      <span data-tip={p.last}>
        <b>{p.last}</b>
        {nm && <NoteDot m={nm} />}
      </span>
      <span data-tip={p.first}>{p.first}</span>
      {!narrow && <span>{p.father}</span>}
      {st && (
        <span>
          <Badge tone={TYPES[st.type as TypeKey].tone}>{stTxt(st, lists)}</Badge>
        </span>
      )}
      <span className="num">{p.asm}</span>
      {!narrow && <span className="num">{p.phone}</span>}
      <span>{p.room ?? ''}</span>
      <span data-tip={longTip(p.post)}>{p.post || ''}</span>
      <span data-tip={longTip(p.role)}>{p.role || ''}</span>
      <span data-tip={si !== siShort(si) ? si : undefined}>{siShort(si)}</span>
      <span>{p.dn ? '✓' : ''}</span>
    </div>
  );
});

/** Props of {@link PersonCard}. */
export interface PersonCardProps {
  p: Person;
  style: CSSProperties;
  st: Status | undefined;
  lists: UserLists | undefined;
  onOpen: (id: number) => void;
}

/** The phone version of a row: name and one line of details. */
export const PersonCard = memo(function PersonCard({ p, style, st, lists, onOpen }: PersonCardProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: frozen DOM, the card is a plain div as before
    // biome-ignore lint/a11y/useKeyWithClickEvents: frozen DOM, no key handler on the phone card as before
    <div className="pcard" style={style} onClick={() => onOpen(p.id)}>
      <div>
        <b>
          <RkName p={p} fn={plainName} keep={true} />
        </b>
        <small>{cardLine(p, lists)}</small>
      </div>
      {st && <Badge tone={TYPES[st.type as TypeKey].tone}>{stTxt(st, lists)}</Badge>}
    </div>
  );
});
