// Is the user typing into a field right now?
// Purpose: `typing(el)` and `typingText(el)` tell a global key handler to step aside while the focus is in a field.
// Does NOT: look at the key or the event; it only classifies the focused element.
// Owner layer: renderer/shared/lib. Why: the sheet arrows (useSheetNav) and the weapon reason keys share the rule.
// Covering test: test/shortcuts.test.ts and test/weapons.test.ts (keys that must not fire inside a field).

/**
 * Typing text (not a checkbox or a button): the weapon reason keys 1-9 must not be lost inside a text field.
 * @param el - usually `document.activeElement`
 * @returns true for a TEXTAREA, SELECT, contenteditable, or an INPUT that takes text (not checkbox, radio, button,
 *   submit, reset, range, color or file)
 */
export const typingText = (el: Element | null): boolean =>
  !!el &&
  (/^(TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el as HTMLElement).isContentEditable ||
    (el.tagName === 'INPUT' &&
      !/^(checkbox|radio|button|submit|reset|range|color|file)$/i.test((el as HTMLInputElement).type)));

/**
 * Focus is in any INPUT (checkbox and button inputs too), SELECT, TEXTAREA or contenteditable element.
 * @param el - usually `document.activeElement`
 */
export const typing = (el: Element | null): boolean =>
  !!el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);
