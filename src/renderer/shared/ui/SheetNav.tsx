// «5 / 119» and ▲▼: move to the previous or next person of the list a card was opened from.
// Purpose: `useSheetNav` (position + ↑/↓ PageUp/PageDown keys) and `SheetNav` (the counter and the two buttons).
// Does NOT: open the card (the caller's `onMove` does) or know what the ids are (any comparable value).
// Owner layer: renderer/shared/ui. Why: the soldier card and the cadre card behave the same.
// Covering test: test/shortcuts.test.ts (keys in person and cadre cards).
import { useCallback, useEffect } from 'react';
import { typing } from '../lib/typing';
import { Button } from './Button';
import { Icon } from './Icon';

/** Result of `useSheetNav`. */
export interface SheetNavState {
  /** Index of the current id in the list, -1 when it is not there. */
  at: number;
  /** Length of the list. */
  n: number;
  /** Go `d` places on (-1 previous, 1 next); does nothing past either end. */
  move: (d: number) => void;
}

/**
 * ↑/↓ and PageUp/PageDown go to the previous/next id of the list the card was opened from.
 * @param order - ids of the list, in the order shown
 * @param id - the current id
 * @param onMove - receives the new id
 * @param busy - true while a dialog is open over the card: the keys are off then
 * The keys are also off with Alt/Ctrl/Meta held, or while focus is in a field.
 */
export function useSheetNav<T>(order: T[], id: T, onMove: (id: T) => void, busy: boolean): SheetNavState {
  const at = order.indexOf(id);
  const move = useCallback(
    (d: number) => {
      const i = order.indexOf(id) + d;
      if (i >= 0 && i < order.length) onMove(order[i]);
    },
    [order, id, onMove],
  );
  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(document.activeElement)) return;
      const d = e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 0;
      if (d) {
        e.preventDefault();
        move(d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, busy]);
  return { at, n: order.length, move };
}

/** Counter and ▲▼ buttons for the head of a card; nothing when the list has fewer than 2 people or `at` is -1. */
export function SheetNav({ at, n, move }: SheetNavState) {
  if (n < 2 || at < 0) return null;
  return (
    <span className="sheetnav">
      <span className="muted num" data-tip="Η θέση του στη λίστα από την οποία άνοιξε">
        {at + 1} / {n}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Προηγούμενος"
        data-tip="Προηγούμενος (↑)"
        disabled={at <= 0}
        onClick={() => move(-1)}
      >
        {Icon.up}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Επόμενος"
        data-tip="Επόμενος (↓)"
        disabled={at >= n - 1}
        onClick={() => move(1)}
      >
        {Icon.down}
      </Button>
    </span>
  );
}
