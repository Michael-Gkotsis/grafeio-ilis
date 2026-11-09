// Memoisation by argument reference identity.
//
// Purpose: `memoByRef(fn)` returns a function that computes `fn(arg)` once per distinct object `arg` and gives the
//   same result back while the same object is passed again (a WeakMap keyed by the argument).
// Does NOT: compare by value, accept primitives, expire entries (the WeakMap lets them go with the argument) or
//   protect against mutation: the argument must not change in place after the first call.
// Owner layer: core/lib (no fs, no Electron, no React).
// Why: the app state is replaced, never edited in place, so "same reference" means "same data". About fifty
//   hand-written WeakMap caches in the code say this in eight lines each; this helper says it once, in three.
//   Adding it changes no behaviour: no existing code uses it yet (call sites move over in later PRs).
// Covering test: test/memo.test.ts.

/**
 * Wraps a pure one-argument function so the result is cached per argument object.
 *
 * Precondition: `fn` is pure and the argument object is never mutated after it was first passed (the state objects
 * of the app are replaced on every change, so this holds for them). A mutated argument returns the OLD result.
 * Edge cases: a thrown error is not cached (the next call runs `fn` again); `undefined` and other falsy results are
 * cached like any other value.
 *
 * @example const excludedFor = memoByRef((state: AppState) => computeExcluded(state));
 * @see test/memo.test.ts
 */
export function memoByRef<A extends object, R>(fn: (arg: A) => R): (arg: A) => R {
  const cache = new WeakMap<A, R>();
  return (arg) => {
    if (cache.has(arg)) return cache.get(arg) as R;
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}
