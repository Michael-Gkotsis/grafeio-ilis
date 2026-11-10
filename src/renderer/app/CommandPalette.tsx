// The Ctrl+K search box: recent people, commands, people and notes in one list, driven by the arrow keys.
// Purpose: `CommandPalette` draws the overlay, tracks the selected row and runs the chosen item.
// Does NOT: build the list of commands (paletteActions.ts), filter (usePaletteItems.ts) or open itself (useShortcuts.ts
//   and the top-bar button set `over = 'palette'`).
// Owner layer: renderer/app. Why: it lived at the end of screens/other.ts although it is part of the shell; the old
//   path re-exports it. It is the only place that mixes people, notes and commands.
// Covering test: test/ux-names.test.ts (rows and names), test/notes.test.ts (notes in the palette).
import { useDeferredValue, useEffect, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { dm } from '../../shared/dates';
import { fullName, unitOf, type Person } from '../../shared/domain';
import { noteHead, noteWho } from '../../shared/notes';
import { rankTxt } from '../../shared/ranks';
import { StatusBadge, useUsbCopy } from '../common';
import { RkName, rkOn } from '../rankName';
import { useEscape } from '../ui';
import { useNav } from './nav';
import { useStore } from './store';
import { usePaletteItems, type PaletteItem } from './usePaletteItems';

type RowProps = (j: number) => {
  role: string;
  'aria-selected': boolean;
  className: string;
  onMouseDown: (e: MouseEvent) => void;
  onMouseEnter: () => void;
};

interface PaletteListProps {
  found: ReturnType<typeof usePaletteItems>;
  rowProps: RowProps;
  /** The text typed, shown in «nothing found». */
  q: string;
}

/** The four groups of rows. Numbers run on across groups, so the arrow keys walk through one list. */
function PaletteList({ found, rowProps, q }: PaletteListProps) {
  const { state, today } = useStore();
  const { recent, acts, ppl, nts, items } = found;
  const personRow = (p: Person, j: number, key: string | number) => (
    <li key={key} {...rowProps(j)}>
      <div>
        <b>
          <RkName p={p} fn={fullName} keep={true} />
        </b>
        <small>
          του {p.father} · {rkOn() ? '' : rankTxt(p) + ' · '}
          {unitOf(p, state.settings)}
        </small>
      </div>
      <StatusBadge statuses={state.statuses} pid={p.id} date={today} lists={state.settings.lists} />
    </li>
  );
  // First row number of each group: recent, then commands, then people, then notes.
  const actsAt = recent.length;
  const pplAt = actsAt + acts.length;
  const ntsAt = pplAt + ppl.length;
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: markup is frozen (identical DOM)
    <ul className="picker__list" role="listbox">
      {recent.length > 0 && <li className="picker__hd">Πρόσφατα</li>}
      {recent.map((p, k) => personRow(p, k, 'r' + p.id))}
      {acts.length > 0 && <li className="picker__hd">Ενέργειες</li>}
      {acts.map((a, k) => (
        <li key={a.t} {...rowProps(actsAt + k)}>
          <div>
            <b>{a.t}</b>
          </div>
        </li>
      ))}
      {ppl.length > 0 && <li className="picker__hd">Πρόσωπα</li>}
      {ppl.map((p, k) => personRow(p, pplAt + k, p.id))}
      {nts.length > 0 && <li className="picker__hd">Σημειώσεις</li>}
      {nts.map((x, k) => {
        const w = noteWho(state, x);
        return (
          <li key={x.id} {...rowProps(ntsAt + k)}>
            <div>
              <b>{noteHead(x.text, 70)}</b>
              <small>
                {w.kind === 'gen' ? 'Γενική σημείωση' : w.label}
                {x.rem ? ' · υπενθύμιση ' + dm(x.rem) : ''}
              </small>
            </div>
          </li>
        );
      })}
      {!items.length && <li className="picker__hd">Δεν βρέθηκε τίποτα για «{q}».</li>}
    </ul>
  );
}

/**
 * The search overlay.
 * Rows are numbered in drawing order (recent, commands, people, notes); `sel` is the highlighted number.
 * Keys: ↑/↓ move, Enter runs, Esc closes (useEscape), a click outside closes.
 * @param onClose - called before a command runs and when the user dismisses the palette
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { state, today, tomorrow } = useStore();
  const nav = useNav();
  const usb = useUsbCopy();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const dq = useDeferredValue(q);
  const found = usePaletteItems(dq, { nav, state, today, tomorrow, usb });
  const { items } = found;
  useEffect(() => setSel(0), [dq]);
  const runItem = (i: number) => {
    const x: PaletteItem | undefined = items[i];
    if (!x) return;
    onClose();
    if (x.kind === 'action') x.a.fn();
    else if (x.kind === 'note') nav.go('notes', { nq: dq.trim(), nfilter: undefined, nwho: undefined });
    else nav.openPerson(x.p.id);
  };
  useEscape(onClose);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(sel);
    }
  };
  // Props shared by every row. mousedown, not click: the input must not lose focus before the row runs.
  const rowProps = (j: number) => ({
    role: 'option',
    'aria-selected': sel === j,
    className: 'picker__opt',
    onMouseDown: (e: MouseEvent) => {
      e.preventDefault();
      runItem(j);
    },
    onMouseEnter: () => setSel(j),
  });
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes; markup is frozen (identical DOM)
    <div
      className="ui-overlay"
      onMouseDown={(e: MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Αναζήτηση">
        <input
          className="ui-input"
          // biome-ignore lint/a11y/noAutofocus: the palette opens with the cursor in the box (unchanged behaviour)
          autoFocus={true}
          placeholder="Γράψε επώνυμο ή τι θέλεις να κάνεις (π.χ. «δν», «ποινη»)"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <PaletteList found={found} rowProps={rowProps} q={q} />
        <div className="note" style={{ padding: '6px 4px 0' }}>
          ↑↓ επιλογή · Enter άνοιγμα · Esc κλείσιμο · ψάχνει χωρίς τόνους και με λατινικά (π.χ. «papad»)
        </div>
      </div>
    </div>,
    document.body,
  );
}
