import { describe, expect, it } from 'vitest';
import { lockScroll } from '../src/renderer/scrollLock';

const mk = () => ({ style: { overflow: '' } });

describe('lockScroll', () => {
  it('κλειδώνει και ξεκλειδώνει ένα παράθυρο', () => {
    const t = mk();
    const u = lockScroll(t);
    expect(t.style.overflow).toBe('hidden');
    u();
    expect(t.style.overflow).toBe('');
  });
  it('ξεκλειδώνει με σειρά A, B (εξωτερικό πρώτα)', () => {
    const t = mk();
    const a = lockScroll(t);
    const b = lockScroll(t);
    a();
    expect(t.style.overflow).toBe('hidden');
    b();
    expect(t.style.overflow).toBe('');
  });
  it('ξεκλειδώνει με σειρά B, A', () => {
    const t = mk();
    const a = lockScroll(t);
    const b = lockScroll(t);
    b();
    expect(t.style.overflow).toBe('hidden');
    a();
    expect(t.style.overflow).toBe('');
  });
  it('διπλή κλήση ξεκλειδώματος δεν χαλά το μέτρημα', () => {
    const t = mk();
    const a = lockScroll(t);
    const b = lockScroll(t);
    a();
    a();
    expect(t.style.overflow).toBe('hidden');
    b();
    expect(t.style.overflow).toBe('');
  });
});
