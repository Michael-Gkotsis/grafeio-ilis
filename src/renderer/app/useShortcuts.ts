// Installs the global keyboard shortcuts and the mouse «back» button on the document.
// Purpose: `useShortcuts(deps)` runs {@link matchShortcut} on every keydown and performs the action it names.
// Does NOT: decide which key means what (shortcuts.ts), draw anything, or own state (it gets the setters).
// Owner layer: renderer/app. Why: the listener was a 25-line effect in Shell; the key table is now testable.
// Covering test: test/shortcuts.test.ts (table), test/support/behaviour.ts (App-level key presses).
import { useEffect } from 'react';
import { matchShortcut, type KeyInput, type Shortcut } from './shortcuts';
import type { OverlayState } from './useOverlays';
import type { RouterState } from './useRouter';

interface ShortcutDeps {
  undo: () => Promise<void>;
  go: RouterState['go'];
  goBack: () => void;
  help: () => void;
  toggleRail: () => void;
  overlays: Pick<OverlayState, 'setLayer' | 'setOver' | 'open'>;
}

const SEARCH_BOX = '.main input[type="search"]';

/** Ctrl+F: the search box of the screen if it has one, otherwise the global search. */
function findOnScreen(openPalette: () => void) {
  const el = document.querySelector(SEARCH_BOX) as HTMLInputElement | null;
  if (el) {
    el.focus();
    el.select();
  } else {
    openPalette();
  }
}

/**
 * Binds the shortcuts for as long as the shell is mounted. The effect depends on the same five callbacks as before the
 * move, so it is re-bound exactly when they change.
 * @param deps - the actions a shortcut can trigger
 */
export function useShortcuts({ undo, go, goBack, help, toggleRail, overlays }: ShortcutDeps) {
  const { setLayer, setOver, open } = overlays;
  useEffect(() => {
    const run = (s: Shortcut, e: KeyInput) => {
      switch (s.id) {
        case 'palette':
          return setOver('palette');
        case 'newNote': {
          // A new note is bound to the open soldier's or cadre member's card.
          const { person, cadre } = open.current;
          return setLayer({
            kind: 'note',
            data: person != null && person > 0 ? { pid: person } : cadre ? { cid: cadre } : {},
          });
        }
        case 'declare':
          return setLayer({ kind: 'declare', data: {} });
        case 'undo':
          return e.repeat ? undefined : void undo();
        case 'diag':
          return go('diag');
        case 'toggleRail':
          return toggleRail();
        case 'reports':
          return go('reports');
        case 'back':
          return goBack();
        case 'view':
          return go(s.view);
        case 'find':
          return findOnScreen(() => setOver('palette'));
        case 'legend':
          return setOver('legend');
        case 'help':
          return help();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || '');
      const s = matchShortcut(e, typing);
      if (!s) return;
      e.preventDefault();
      run(s, e);
    };
    // The side «back» button of the mouse.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mouseup', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mouseup', onMouse);
    };
  }, [undo, go, goBack, toggleRail, help]);
}
