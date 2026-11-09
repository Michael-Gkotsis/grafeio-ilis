// Tests of memoByRef (src/core/lib/memo.ts): cached per argument object, never by value.
import { describe, expect, it, vi } from 'vitest';
import { memoByRef } from '../src/core/lib/memo';

describe('memoByRef', () => {
  it('computes once per argument object and returns the same result for the same reference', () => {
    const calls = vi.fn((s: { n: number }) => ({ doubled: s.n * 2 }));
    const f = memoByRef(calls);
    const state = { n: 21 };
    const first = f(state);
    expect(first).toEqual({ doubled: 42 });
    expect(f(state)).toBe(first);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('treats an equal but different object as a different argument', () => {
    const calls = vi.fn((s: { n: number }) => s.n);
    const f = memoByRef(calls);
    expect(f({ n: 1 })).toBe(1);
    expect(f({ n: 1 })).toBe(1);
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('keeps one cache per wrapped function', () => {
    const a = memoByRef((s: { n: number }) => s.n + 1);
    const b = memoByRef((s: { n: number }) => s.n + 100);
    const state = { n: 1 };
    expect([a(state), b(state), a(state), b(state)]).toEqual([2, 101, 2, 101]);
  });

  it('caches falsy results too', () => {
    const calls = vi.fn((_s: object) => undefined);
    const f = memoByRef(calls);
    const state = {};
    f(state);
    f(state);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('does not cache a thrown error', () => {
    let fail = true;
    const f = memoByRef((_s: object) => {
      if (fail) throw new Error('boom');
      return 'ok';
    });
    const state = {};
    expect(() => f(state)).toThrow('boom');
    fail = false;
    expect(f(state)).toBe('ok');
  });

  it('documents the precondition: a mutated argument still returns the old result', () => {
    const state = { n: 1 };
    const f = memoByRef((s: { n: number }) => s.n);
    expect(f(state)).toBe(1);
    state.n = 2;
    expect(f(state)).toBe(1);
  });
});
