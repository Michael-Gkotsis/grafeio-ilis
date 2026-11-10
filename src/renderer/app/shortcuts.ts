// The global keyboard shortcuts as a pure table: key event in, named action out.
// Purpose: `matchShortcut(event, typing)` returns what a key press means for the shell (or `null`).
// Does NOT: run the action (useShortcuts.ts), touch the DOM or the store, or handle the shortcuts that belong to one
//   screen (↑/↓ and PgUp/PgDn in person and cadre cards, N for the next empty seat, 1-9 for the weapon move reason).
// Owner layer: renderer/app. Why: the rules are an ordered if/else chain where order matters (Ctrl+Shift+N before
//   Ctrl+N); as data they can be tested without a browser. Each Greek letter is accepted next to its Latin key so the
//   shortcuts work on a Greek keyboard layout.
// Covering test: test/shortcuts.test.ts.
import { NAV_ALL, type ScreenId } from './routes';

/** What a key press asks the shell to do. */
export type Shortcut =
  | { id: 'palette' }
  | { id: 'newNote' }
  | { id: 'declare' }
  | { id: 'undo' }
  | { id: 'diag' }
  | { id: 'toggleRail' }
  | { id: 'reports' }
  | { id: 'back' }
  | { id: 'view'; view: ScreenId }
  | { id: 'find' }
  | { id: 'legend' }
  | { id: 'help' };

/** The parts of a `KeyboardEvent` the table reads. */
export type KeyInput = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'>;

/**
 * The 14 global shortcuts, in the order they are tested (the first match wins):
 * Ctrl+K, Ctrl+Shift+N, Ctrl+N, Ctrl+Z, Ctrl+Shift+D, Ctrl+B, Ctrl+E, Alt+← (and the mouse back button),
 * Alt+1 … Alt+9, Alt+0, Ctrl+F, Shift+F1, F1.
 * @param e - the key event; Ctrl and Cmd count the same
 * @param typing - true when focus is in an input, textarea or select (Ctrl+Z then stays with the field)
 * @returns the action, or `null` when the key is not a global shortcut
 */
export function matchShortcut(e: KeyInput, typing: boolean): Shortcut | null {
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const is = (latin: string, greek: string) => k === latin || k === greek;
  if (mod && is('k', 'κ')) return { id: 'palette' };
  if (mod && e.shiftKey && is('n', 'ν')) return { id: 'newNote' };
  if (mod && is('n', 'ν')) return { id: 'declare' };
  if (mod && is('z', 'ζ') && !typing) return { id: 'undo' };
  if (mod && e.shiftKey && is('d', 'δ')) return { id: 'diag' };
  if (mod && is('b', 'β')) return { id: 'toggleRail' };
  if (mod && !e.shiftKey && is('e', 'ε')) return { id: 'reports' };
  if (e.altKey && !mod && e.key === 'ArrowLeft') return { id: 'back' };
  // Alt+1 … Alt+9 are the first nine entries, Alt+0 the tenth (Digit0 maps to index 9).
  const view = /^Digit[0-9]$/.test(e.code) ? NAV_ALL[(+e.code.slice(5) + 9) % 10] : undefined;
  if (e.altKey && !mod && view) return { id: 'view', view };
  if (mod && is('f', 'φ')) return { id: 'find' };
  // F1 is the guide on the topic of the screen (like any program), Shift+F1 is the legend of the codes.
  if (e.key === 'F1' && e.shiftKey) return { id: 'legend' };
  if (e.key === 'F1') return { id: 'help' };
  return null;
}
