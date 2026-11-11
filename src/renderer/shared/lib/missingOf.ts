// The «Λείπει: Α, Β» text next to a greyed-out button.
// Purpose: `missingOf(fields)` turns [field name, is filled] pairs into the reason a form cannot be saved yet.
// Does NOT: validate anything (the caller decides what "filled" means) or render (see `Why` in ui/Button.tsx).
// Owner layer: renderer/shared/lib. Why: pure text, used by many dialogs, so it is not a component.
// Covering test: test/screens-dialogs-forms.test.ts (the reason shown next to a disabled save).

/**
 * @param fields - [Greek field name, value]; a falsy value (`''`, `0`, `null`, `undefined`, `false`) counts as missing
 * @returns «Λείπει: Επώνυμο, Όνομα» in the order given, or `''` when nothing is missing
 */
export const missingOf = (fields: [string, unknown][]): string => {
  const names = fields.filter(([, filled]) => !filled).map(([name]) => name);
  return names.length ? 'Λείπει: ' + names.join(', ') : '';
};
