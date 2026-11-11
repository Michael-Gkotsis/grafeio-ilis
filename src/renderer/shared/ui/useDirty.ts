// Has the form changed since it opened?
// Purpose: `useDirty(form)` is the `dirty` flag of a Dialog: something was typed and not saved.
// Does NOT: reset after a save (the dialog closes then) or compare deeply beyond JSON.
// Owner layer: renderer/shared/ui. Why: every form dialog needs the same check, so it is one hook.
// Covering test: test/screens-dialogs-forms.test.ts (the dialogs that ask before closing).
import { useState } from 'react';

/**
 * @param value - the current form value (plain data: strings, numbers, arrays, objects)
 * @returns true when the value differs from the first one this component rendered with
 * why: the comparison is the JSON text of both values, exactly as before the rewrite (behavior is frozen). So key
 * order counts, and `undefined`, functions and `NaN` are not told apart from missing or `null`.
 */
export function useDirty(value: unknown): boolean {
  const [first] = useState(() => JSON.stringify(value));
  return JSON.stringify(value) !== first;
}
