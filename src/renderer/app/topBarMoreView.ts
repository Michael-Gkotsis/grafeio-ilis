// View logic of the «⋯» menu: which rows it has and which item an arrow key focuses.
// Purpose: pure functions, so TopBarMore.tsx only draws and wires events.
// Does NOT: render, touch the DOM beyond the elements it is given, or navigate (rows only carry callbacks).
// Owner layer: renderer/app. Why: keeps the component under 150 lines.
// Covering test: test/shell-nav.test.ts.

/** What the menu needs from the shell. Plain callbacks, so the menu can be tested without the store. */
export interface TopBarMoreProps {
  /** Name of the screen «Πίσω» returns to; `undefined` = no history, the item is disabled. */
  backTo: string | undefined;
  /** An update is available, installing or ready: shows the dot and the «Νέα έκδοση» item. */
  hasUpdate: boolean;
  /** Changes with every route change; the open menu closes when it does. */
  routeKey: string;
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenLegend: () => void;
  onOpenUpdate: () => void;
  onOpenDiag: () => void;
}

export interface MenuRow {
  key: string;
  label: string;
  hint: string;
  disabled?: boolean;
  run: () => void;
}

/** The rows in display order; «Νέα έκδοση» only exists while there is an update. */
export function menuRows(p: TopBarMoreProps): MenuRow[] {
  const back = { key: 'back', label: p.backTo ? 'Πίσω στο ' + p.backTo : 'Πίσω', hint: 'Alt+←', disabled: !p.backTo };
  const rows: MenuRow[] = [
    { ...back, run: p.onBack },
    { key: 'history', label: 'Ιστορικό ενεργειών', hint: '', run: p.onOpenHistory },
    { key: 'legend', label: 'Υπόμνημα κωδικών', hint: 'Shift+F1', run: p.onOpenLegend },
  ];
  const update: MenuRow[] = p.hasUpdate ? [{ key: 'update', label: 'Νέα έκδοση', hint: '', run: p.onOpenUpdate }] : [];
  return [...rows, ...update, { key: 'diag', label: 'Διάγνωση', hint: 'Ctrl+Shift+D', run: p.onOpenDiag }];
}

/** The item an arrow/Home/End key focuses, from the enabled items `all` and the focused index `at` (-1 = none). */
export function focusTarget(key: string, all: HTMLElement[], at: number): HTMLElement | undefined {
  if (key === 'ArrowDown') return all[(at + 1) % all.length];
  if (key === 'ArrowUp') return all[(at - 1 + all.length) % all.length];
  if (key === 'Home') return all[0];
  if (key === 'End') return all[all.length - 1];
  return undefined;
}
