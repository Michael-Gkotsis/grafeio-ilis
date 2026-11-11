// Joins class names, dropping every falsy part.
// Purpose: `cx('ui-btn', size && 'ui-btn--' + size, className)` builds a `className` string.
// Does NOT: dedupe or sort names, or accept objects (unlike the `clsx` package, which the app does not ship).
// Owner layer: renderer/shared/lib. Why: every UI primitive builds BEM class names, so it sits below all of them.
// Covering test: test/screens-*.test.ts (every class name in the screen snapshots goes through it).

/**
 * Class names joined by a single space.
 * @param parts - strings, or anything falsy (`false`, `undefined`, `null`, `''`, `0`) to leave a name out
 * @returns `''` when every part is falsy; never has leading, trailing or double spaces from falsy parts
 */
export const cx = (...parts: unknown[]): string => parts.filter(Boolean).join(' ');
