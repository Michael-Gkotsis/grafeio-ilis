// The parts of the person picker that draw lists: the chips of the chosen people and the floating result list.
// Purpose: `PickerChips` (multiple mode) and `PickerList` (the portal with one row per person, their status or the
//   reason they are unavailable).
// Does NOT: hold state or search (model/pickerView.ts does); not exported from the slice (PersonPicker uses them).
// Owner layer: renderer/entities/person. Why: PersonPicker stays under the function-size limit.
// Covering test: test/screens-main.test.ts, test/screens-dialogs-forms.test.ts.
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ISODate } from '../../../../shared/dates';
import { plainName, shortName, unitOf, type AppState, type Person } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { cx } from '../../../shared/lib/cx';
import { Badge, type FloatPos } from '../../../shared/ui';
import type { PickerRow } from '../model/pickerView';
import { rkOn } from '../model/rankName';
import { RkName } from './RankName';
import { StatusBadge, cadreBadge } from './StatusBadge';

/** Props of `PickerChips`. */
export interface PickerChipsProps {
  chosen: number[];
  pm: Map<number, Person>;
  onRemove: (pid: number) => void;
}

/** The chosen people as chips with a ✕ button (multiple mode). */
export function PickerChips({ chosen, pm, onRemove }: PickerChipsProps) {
  return (
    <div className="picker__chips">
      {chosen.map((pid) => (
        <span key={pid} className="picker__chip">
          {shortName(pm.get(pid)!)}
          <button type="button" aria-label={'Αφαίρεση ' + shortName(pm.get(pid)!)} onClick={() => onRemove(pid)}>
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

// The three parts of the small line under the name (kept as three children: the markup has three text nodes).
const who = (p: Person, settings: AppState['settings']) =>
  p.cid
    ? 'Στέλεχος' + (rkOn() ? '' : ' · ' + rankTxt(p))
    : 'του ' + (p.father || '—') + ' · ' + (rkOn() ? '' : rankTxt(p) + ' · ') + unitOf(p, settings);
const room = (p: Person) => (p.room != null ? ' · Θ' + p.room : '');
const note = (p: Person, hint: PickerListProps['hint']) => (hint && hint(p) ? ' · ' + hint(p) : '');

/** Props of `PickerList`. */
export interface PickerListProps {
  items: PickerRow[];
  /** Index of the highlighted row. */
  sel: number;
  pos: FloatPos;
  listRef: RefObject<HTMLUListElement>;
  state: AppState;
  /** ISODate: the day the status chips describe. */
  date: ISODate;
  hint?: (p: Person) => string | null | undefined | false;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
}

// The status chip (or the reason) at the right of a row. A plain function, not a component: it adds no render layer.
const rowStatus = (x: PickerRow, state: AppState, date: ISODate) =>
  x.na ? (
    <Badge>{x.na}</Badge>
  ) : x.p.cid ? (
    cadreBadge(state, x.p.cid, date)
  ) : (
    <StatusBadge statuses={state.statuses} pid={x.p.id} date={date} lists={state.settings.lists} />
  );

/** The floating result list, drawn in a portal on <body>; cadre members get their own «Στελέχη» heading. */
export function PickerList({ items, sel, pos, listRef, state, date, hint, onPick, onHover }: PickerListProps) {
  return createPortal(
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
    <ul ref={listRef} className="picker__list picker__list--float" role="listbox" style={pos}>
      {items.length === 0 ? (
        <li className="picker__hd">Κανείς δεν ταιριάζει. Δοκίμασε μόνο τα πρώτα γράμματα του επωνύμου.</li>
      ) : (
        // Each row is an array [heading, option] like before the move: React matches the arrays by position, so the
        // rows remount the same way as before (same render counts).
        items.map((x, i) => [
          x.p.cid && !items[i - 1]?.p.cid && (
            <li key={'g' + x.p.id} className="picker__hd" role="presentation">
              Στελέχη
            </li>
          ),
          // biome-ignore lint/a11y/useFocusableInteractive: options use aria-activedescendant (frozen DOM)
          <li
            key={x.p.id}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
            role="option"
            aria-selected={i === sel}
            className={cx('picker__opt', x.na && 'picker__opt--na')}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(i);
            }}
            onMouseEnter={() => onHover(i)}
          >
            <div>
              <b>
                <RkName p={x.p} fn={plainName} keep={true} />
              </b>
              <small>
                {who(x.p, state.settings)}
                {room(x.p)}
                {note(x.p, hint)}
              </small>
            </div>
            {rowStatus(x, state, date)}
          </li>,
        ])
      )}
    </ul>,
    document.body,
  );
}
