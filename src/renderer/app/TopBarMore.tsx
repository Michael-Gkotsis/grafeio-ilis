// The «⋯» menu of the top bar: Back, History, Legend, New version and Diagnostics.
// Purpose: `TopBarMore` keeps the rare top-bar items one click away without taking room in the 44 px bar.
// Does NOT: navigate by itself (items call props), bind the shortcuts (useShortcuts.ts; hints only repeat them).
// Owner layer: renderer/app. Why: Back, Legend and History were always-visible buttons; at 1024 px the bar needs room.
// Covering test: test/shell-nav.test.ts (items, disabled Back, update dot, keys), test/guide.test.ts (reaches History).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { cx, Icon, Kbd } from '../ui';
import { focusTarget, menuRows, type MenuRow, type TopBarMoreProps } from './topBarMoreView';

/** Closes the menu on a click outside `wrap` while it is open. */
function useCloseOutside(open: boolean, wrap: RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open, wrap, close]);
}

/** The open menu: one `menuitem` per row, a disabled one stays visible but cannot be picked or focused. */
function MenuList(p: { rows: MenuRow[]; onKeyDown: (e: KeyboardEvent) => void; onPick: (r: MenuRow) => void }) {
  return (
    <div className="topmore__menu" role="menu" aria-label="Περισσότερα" onKeyDown={p.onKeyDown}>
      {p.rows.map((r) => (
        <button
          key={r.key}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="topmore__item"
          disabled={r.disabled}
          onClick={() => p.onPick(r)}
        >
          <span className="topmore__lbl">{r.label}</span>
          {r.hint && <Kbd>{r.hint}</Kbd>}
        </button>
      ))}
    </div>
  );
}

/** The «⋯» button and its menu, positioned under the button and right-aligned (no portal: it stays inside the bar). */
export function TopBarMore(p: TopBarMoreProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const rows = menuRows(p);
  const items = useCallback(
    () => [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])],
    [],
  );
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);
  // Why a route key: a click on a screen button elsewhere changes the route without touching this menu.
  useEffect(() => setOpen(false), [p.routeKey]);
  useCloseOutside(open, wrap, () => setOpen(false));

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setOpen(true);
    requestAnimationFrame(() => items()[0]?.focus());
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const all = items();
    const next = focusTarget(e.key, all, all.indexOf(document.activeElement as HTMLElement));
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(true);
    } else if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="topmore" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={cx('ui-btn', 'ui-btn--outline', 'ui-btn--sm', 'topmore__btn')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={p.hasUpdate ? 'Περισσότερα (υπάρχει νέα έκδοση)' : 'Περισσότερα'}
        data-tip="Περισσότερα: Πίσω, Ιστορικό, Υπόμνημα, Διάγνωση"
        data-tip-side="bottom"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKey}
        onKeyUp={(e) => e.key === ' ' && e.preventDefault()}
      >
        {Icon.more}
        {p.hasUpdate && <span className="topmore__dot" aria-hidden="true" />}
      </button>
      {open && (
        <MenuList
          rows={rows}
          onKeyDown={onMenuKey}
          onPick={(r) => {
            close(false);
            r.run();
          }}
        />
      )}
    </div>
  );
}
