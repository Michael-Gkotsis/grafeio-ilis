// Ρυθμίσεις εμφάνισης: το παλιό κλειδί του μενού περνά μία φορά και φεύγει· οι προεπιλογές δεν αλλάζουν ποτέ.
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_PREFS, loadPrefs } from '../src/renderer/prefs';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

describe('prefs', () => {
  beforeEach(() => mem.clear());
  it('το παλιό «grafeio.nav» περνά στις ρυθμίσεις και σβήνεται· οι προεπιλογές μένουν ίδιες', () => {
    mem.set('grafeio.nav', 'rail');
    expect(loadPrefs().nav).toBe('rail');
    expect(DEFAULT_PREFS.nav).toBe('auto');
    expect(mem.has('grafeio.nav')).toBe(false);
    expect(JSON.parse(mem.get('grafeio.prefs')!).nav).toBe('rail');
    expect(loadPrefs().nav).toBe('rail');
  });
});
