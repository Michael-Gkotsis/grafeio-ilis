// The parts of the person picker that draw lists: the chips of the chosen people and the floating result list.
// Purpose: `PickerChips` (multiple mode) and `PickerList` (the portal with one row per person, their status or the
//   reason they are unavailable).
// Does NOT: hold state or search (model/pickerView.ts does); not exported from the slice (PersonPicker uses them).
// Owner layer: renderer/entities/person. Why: PersonPicker stays under the function-size limit.
// Covering test: test/screens-main.test.ts, test/screens-dialogs-forms.test.ts.
import { Fragment, type RefObject } from 'react';
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

// The status chip (or the reason) at the right of a row.
function RowStatus({ x, state, date }: { x: PickerRow; state: AppState; date: ISODate }) {
  if (x.na) return <Badge>{x.na}</Badge>;
  if (x.p.cid) return cadreBadge(state, x.p.cid, date);
  return <StatusBadge statuses={state.statuses} pid={x.p.id} date={date} lists={state.settings.lists} />;
}

/** The floating result list, drawn in a portal on <body>; cadre members get their own «Στελέχη» heading. */
export function PickerList({ items, sel, pos, listRef, state, date, hint, onPick, onHover }: PickerListProps) {
  return createPortal(
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: frozen DOM
    <ul ref={listRef} className="picker__list picker__list--float" role="listbox" style={pos}>
      {items.length === 0 ? (
        <li className="picker__hd">Κανείς δεν ταιριάζει. Δοκίμασε μόνο τα πρώτα γράμματα του επωνύμου.</li>
      ) : (
        items.map((x, i) => (
          <Fragment key={x.p.id}>
            {x.p.cid && !items[i - 1]?.p.cid && (
              <li className="picker__hd" role="presentation">
                Στελέχη
              </li>
            )}
            {/* biome-ignore lint/a11y/useFocusableInteractive: options use aria-activedescendant (frozen DOM) */}
            <li
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
              <RowStatus x={x} state={state} date={date} />
            </li>
          </Fragment>
        ))
      )}
    </ul>,
    document.body,
  );
}
