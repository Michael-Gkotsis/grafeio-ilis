// The weapon number, rack or «Θέση» input of one row.
// Purpose: `WeaponInput`, a `memo` component: it writes when you leave the box (Enter, ↑/↓, Tab or a click elsewhere),
//   Esc brings the old value back, and a column pasted from Excel fills one value per row from this row down.
// Does NOT: save anything itself (`onCommit` / `onPaste` do) or draw the row.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the `memo` boundary and
//   the effects are unchanged, so typing in one box redraws only that box.
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { memo, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { fullName, type Person } from '../../../../shared/domain';
import { LBL, NORM, type WeaponField } from '../model/view';
import { focusRow } from './focusRow';

/** Props of `WeaponInput`. The callbacks must be stable (`useCallback`) or the `memo` is worth nothing. */
export interface WeaponInputProps {
  p: Person;
  /** Index of the row in the table. */
  i: number;
  /** Which field of `p` the box edits. */
  f?: WeaponField;
  /** Changes when a save failed or a paste was done: every box takes back the stored value. */
  reset: number;
  onCommit: (p: Person, raw: string, f: WeaponField) => void;
  onPaste: (i: number, vals: string[], f: WeaponField) => void;
}

/**
 * Weapon number or rack position of a row. The row leaving the page (scroll, filter) while you type still writes the
 * value: it is not lost.
 */
export const WeaponInput = memo(function WeaponInput({
  p,
  i,
  f = 'weapon',
  reset,
  onCommit,
  onPaste,
}: WeaponInputProps) {
  const cur = p[f] || '';
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur, reset]);
  // The row leaves the page (scroll, filter) while you type: the value is written, not lost.
  const live = useRef({ v, cur, p, f, onCommit, sent: cur });
  live.current = { ...live.current, v, cur, p, f, onCommit };
  useEffect(
    () => () => {
      const x = live.current;
      const n = NORM[x.f](x.v);
      if (n !== x.cur && n !== NORM[x.f](x.sent)) x.onCommit(x.p, x.v, x.f);
    },
    [],
  );
  const move = (e: KeyboardEvent<HTMLInputElement>, to: number) => {
    e.preventDefault();
    if (!focusRow(f, to)) (e.target as HTMLInputElement).blur();
  };
  return (
    <input
      className="ui-input weapon-input"
      data-wf={f}
      data-wrow={i}
      value={v}
      placeholder="—"
      aria-label={LBL[f] + ' ' + fullName(p)}
      spellCheck="false"
      autoComplete="off"
      onChange={(e: ChangeEvent<HTMLInputElement>) => setV(e.target.value)}
      onBlur={() => {
        if (NORM[f](v) !== cur) {
          live.current.sent = v;
          onCommit(p, v, f);
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') move(e, i + 1);
        else if (e.key === 'ArrowUp') move(e, i - 1);
        else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setV(cur);
        }
      }}
      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
        const t: string = e.clipboardData?.getData('text') || '';
        const lines = t.replace(/\r/g, '').split('\n');
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (lines.length < 2) return;
        e.preventDefault();
        onPaste(
          i,
          lines.map((l) => l.split('\t')[0]),
          f,
        );
      }}
    />
  );
});
