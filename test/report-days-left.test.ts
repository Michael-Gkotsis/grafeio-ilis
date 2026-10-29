// Έντυπα: μορφή κατάστασης «{ΚΩΔ} X{ΜΕΝΟΥΝ}» = πόσες μέρες μένουν από τη μέρα του εντύπου, με αυτήν (ΕΥ ως 30/10: 29/10 → X2, 30/10 → X1)
import { describe, it, expect } from 'vitest';
import { ST_FMTS, ST_TAGS, fieldValue, stText } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const F = '{ΚΩΔ} X{ΜΕΝΟΥΝ}';
const ey = (x: Partial<Status> = {}): Status => ({ id: 'a', pid: 1, type: 'EY', from: '2026-10-29', to: '2026-10-30', ...x });

describe('Έντυπα: μέρες που μένουν', () => {
  it('μετράει από τη μέρα του εντύπου, με αυτήν', () => {
    expect(stText(ey(), F, undefined, '2026-10-29')).toBe('ΕΥ X2');
    expect(stText(ey(), F, undefined, '2026-10-30')).toBe('ΕΥ X1');
    expect(stText(ey(), '{μένουν}', undefined, '2026-10-30')).toBe('1');   // με μικρά και τόνο
    expect(stText(ey(), '{ΜΕΝΟΥΝ ΗΜΕΡΕΣ}', undefined, '2026-10-29')).toBe('2');
  });
  it('χωρίς λήξη: X…', () => { expect(stText(ey({ open: true }), F, undefined, '2026-10-29')).toBe('ΕΥ X…'); });
  it('μέρα πριν το «από»: μετράει από το «από»', () => { expect(stText(ey(), F, undefined, '2026-10-20')).toBe('ΕΥ X2'); });
  it('χωρίς μέρα (παλιοί καλούντες): όλες οι μέρες, τίποτα δεν σπάει', () => {
    expect(stText(ey(), F)).toBe('ΕΥ X2'); expect(stText(ey(), '{ΗΜΕΡΕΣ}')).toBe('2'); expect(stText(ey(), undefined)).toBe('ΕΥ');
  });
  it('μέρα μετά το «έως»: όχι αρνητικό', () => { expect(stText(ey(), F, undefined, '2026-11-05')).toBe('ΕΥ X0'); });
  it('μπαίνει στο τέλος των έτοιμων και στις ετικέτες', () => {
    expect(ST_FMTS[0]).toBe('{ΚΩΔ}'); expect(ST_FMTS[ST_FMTS.length - 1]).toBe(F); expect(ST_TAGS.some(t => t.tag === 'ΜΕΝΟΥΝ')).toBe(true);
  });
  it('στη στήλη «Ιατρικό τη μέρα» και στο «Είδος»', () => {
    const s = fakeState(12); s.statuses = [ey()]; const p = s.people[0];
    const v = (d: string, sf?: string) => fieldValue(s, 'people', p, 'smed', 0, d, undefined, sf ? { sf } : undefined);
    expect(v('2026-10-29', F)).toBe('ΕΥ X2'); expect(v('2026-10-30', F)).toBe('ΕΥ X1');
    expect(v('2026-10-29')).toBe('ΕΥ'); expect(v('2026-10-30')).toBe('ΕΥ');   // ίδιο με πριν
    expect(v('2026-10-30', '{ΚΩΔ} ΕΩΣ {ΕΩΣ}')).toBe('ΕΥ ΕΩΣ 30/10');
    const row = { ...p, pid: 1, st: s.statuses[0], p };
    expect(fieldValue(s, 'status', row, 'stype', 0, '2026-10-30', undefined, { sf: F })).toBe('ΕΥ X1');
  });
});
