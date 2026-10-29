import { describe, expect, it } from 'vitest';
import { errorText } from '../src/renderer/errorBoundary';

describe('errorText', () => {
  it('μήνυμα και στοίβα συστατικών', () => {
    const t = errorText(new Error('boom'), '\n    at Foo\n    at Bar');
    expect(t.split('\n')[0]).toBe('boom');
    expect(t).toContain('at Foo');
  });
  it('όχι-Error και κενά: δεν σκάει', () => {
    expect(errorText('ωχ')).toBe('ωχ');
    expect(errorText(undefined, null)).toBe('undefined');
    const e = new TypeError('x'); e.stack = '';
    expect(errorText(e)).toBe('TypeError: x');
  });
});
