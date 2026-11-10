// Table test for the global keyboard shortcuts of the shell (src/renderer/app/shortcuts.ts).
//
// Purpose: pin which key press means which action, including the order rules (Ctrl+Shift+N before Ctrl+N) and the
//   Greek-layout letters. The 19 shortcuts are a frozen contract (CLAUDE.md rule 3).
// Does NOT: press keys in a browser (test/notes.test.ts, test/guide.test.ts do that through App) or test shortcuts that
//   belong to one screen (↑/↓ in cards, N next empty seat, 1-9 weapon move reason).
import { describe, expect, it } from 'vitest';
import { matchShortcut, type KeyInput } from '../src/renderer/app/shortcuts';

const key = (k: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...extra,
});

describe('global shortcuts', () => {
  it('Ctrl+K and Ctrl+F: search, and Cmd counts as Ctrl', () => {
    expect(matchShortcut(key('k', { ctrlKey: true }), false)).toEqual({ id: 'palette' });
    expect(matchShortcut(key('K', { metaKey: true }), false)).toEqual({ id: 'palette' });
    expect(matchShortcut(key('f', { ctrlKey: true }), false)).toEqual({ id: 'find' });
  });
  it('Ctrl+Shift+N (new note) wins over Ctrl+N (declaration)', () => {
    expect(matchShortcut(key('N', { ctrlKey: true, shiftKey: true }), false)).toEqual({ id: 'newNote' });
    expect(matchShortcut(key('n', { ctrlKey: true }), false)).toEqual({ id: 'declare' });
  });
  it('Ctrl+Z undoes only outside a text field', () => {
    expect(matchShortcut(key('z', { ctrlKey: true }), false)).toEqual({ id: 'undo' });
    expect(matchShortcut(key('z', { ctrlKey: true }), true)).toBeNull();
  });
  it('Ctrl+Shift+D, Ctrl+B and Ctrl+E (Ctrl+Shift+E is not Reports)', () => {
    expect(matchShortcut(key('d', { ctrlKey: true, shiftKey: true }), false)).toEqual({ id: 'diag' });
    expect(matchShortcut(key('b', { ctrlKey: true }), false)).toEqual({ id: 'toggleRail' });
    expect(matchShortcut(key('e', { ctrlKey: true }), false)).toEqual({ id: 'reports' });
    expect(matchShortcut(key('E', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
  });
  it('Greek layout letters work like the Latin ones', () => {
    expect(matchShortcut(key('κ', { ctrlKey: true }), false)).toEqual({ id: 'palette' });
    expect(matchShortcut(key('Ν', { ctrlKey: true, shiftKey: true }), false)).toEqual({ id: 'newNote' });
    expect(matchShortcut(key('ν', { ctrlKey: true }), false)).toEqual({ id: 'declare' });
    expect(matchShortcut(key('ζ', { ctrlKey: true }), false)).toEqual({ id: 'undo' });
    expect(matchShortcut(key('δ', { ctrlKey: true, shiftKey: true }), false)).toEqual({ id: 'diag' });
    expect(matchShortcut(key('β', { ctrlKey: true }), false)).toEqual({ id: 'toggleRail' });
    expect(matchShortcut(key('ε', { ctrlKey: true }), false)).toEqual({ id: 'reports' });
    expect(matchShortcut(key('φ', { ctrlKey: true }), false)).toEqual({ id: 'find' });
  });
  it('Alt+← goes back; Alt+1 … Alt+9 open the first nine menu entries, Alt+0 Settings', () => {
    expect(matchShortcut(key('ArrowLeft', { altKey: true }), false)).toEqual({ id: 'back' });
    expect(matchShortcut(key('1', { altKey: true, code: 'Digit1' }), false)).toEqual({ id: 'view', view: 'home' });
    expect(matchShortcut(key('4', { altKey: true, code: 'Digit4' }), false)).toEqual({ id: 'view', view: 'guard' });
    expect(matchShortcut(key('9', { altKey: true, code: 'Digit9' }), false)).toEqual({ id: 'view', view: 'weapons' });
    expect(matchShortcut(key('0', { altKey: true, code: 'Digit0' }), false)).toEqual({ id: 'view', view: 'templates' });
    expect(matchShortcut(key('1', { code: 'Digit1' }), false)).toBeNull();
    expect(matchShortcut(key('1', { altKey: true, ctrlKey: true, code: 'Digit1' }), false)).toBeNull();
  });
  it('F1 is the guide, Shift+F1 the legend', () => {
    expect(matchShortcut(key('F1'), false)).toEqual({ id: 'help' });
    expect(matchShortcut(key('F1', { shiftKey: true }), false)).toEqual({ id: 'legend' });
  });
  it('plain keys are not shortcuts', () => {
    expect(matchShortcut(key('k'), false)).toBeNull();
    expect(matchShortcut(key('ArrowLeft'), false)).toBeNull();
  });
});
