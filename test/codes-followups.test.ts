// Κωδικοί θέσεων: μετάβαση με δική σου υπηρεσία θαλαμοφυλάκων, δεύτερη ΤΑΕ, και ο έλεγχος των προηγούμενων
// υπηρεσιών σε καινούργια εγκατάσταση. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { DEFAULT_SETTINGS, migrateSettings, type AppState, type BlockDef } from '../src/shared/domain';
import { codeErrors } from '../src/shared/codes';
import { Store } from '../src/main/db';
import { needsBaselineReview } from '../src/renderer/screens/people';
import { fakeState } from './fixtures';

const ctx = { today: '2026-10-12', newId: () => Math.random().toString(36).slice(2) };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const noCodes = (list: BlockDef[]) => list.map(b => ({ ...b, posts: b.posts.map(({ code, ...p }) => p) }));
const codeOfK = (list: BlockDef[], k: string) => list.flatMap(b => b.posts).find(p => p.k === k)!.code;

describe('μετάβαση στους κωδικούς (B3)', () => {
  it('δική σου υπηρεσία θαλαμοφυλάκων στη ΣΒΕΝ δεν παίρνει τους κωδικούς της ΣΠΕΝ', () => {
    const mine: BlockDef = { id: 'c9', kind: 'th', name: 'Θαλαμοφύλακες γ΄', armed: false, custom: true, posts: [{ k: 'c9_1', label: 'Γ 1', short: '1' }, { k: 'c9_2', label: 'Γ 2', short: '2' }] };
    const old = { ...DEFAULT_SETTINGS, rev: 2, blocks: [...noCodes(DEFAULT_SETTINGS.blocks), mine], blocksSpen: noCodes(DEFAULT_SETTINGS.blocksSpen) };
    const m = migrateSettings(old);
    expect(['th1', 'th2', 'th3', 'th4'].map(k => codeOfK(m.blocksSpen, k))).toEqual(['Θ1', 'Θ2', 'Θ3', 'Θ4']);
    expect([codeOfK(m.blocks, 'th1'), codeOfK(m.blocks, 'th8')]).toEqual(['Θ1α', 'Θ4β']);
    expect([codeOfK(m.blocks, 'c9_1'), codeOfK(m.blocks, 'c9_2')]).toEqual(['Θ5', 'Θ6']);
    expect(codeErrors(m)).toEqual([]);
  });
});

describe('δεύτερη υπηρεσία του ίδιου είδους (B4)', () => {
  it('δεύτερη ΤΑΕ: παίρνει δικό της κωδικό, και κάθε επεξεργασία μετά δουλεύει', () => {
    let s = fakeState(5);
    s = run(s, { t: 'addBlock', phase: 'sven', name: 'ΤΑΕ πύλης', kind: 'tae', armed: true, n: 1, hrs: '' });
    s = run(s, { t: 'addBlock', phase: 'sven', name: 'ΤΑΕ πίσω', kind: 'tae', armed: true, n: 1, hrs: '' });
    const added = s.settings.blocks.filter(b => b.custom).map(b => b.posts[0].code);
    expect(added).toEqual(['ΤΑΕ2', 'ΤΑΕ3']);
    expect(codeErrors(s.settings)).toEqual([]);
    expect(() => run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {} })).not.toThrow();
    expect(() => run(s, { t: 'editBlock', phase: 'spen', id: 'tae', name: '', n: 1, hrs: { tae: '07:00-08:00' } })).not.toThrow();
  });
  it('παλιό λάθος σε άλλη υπηρεσία δεν εμποδίζει την επεξεργασία· λάθος στην ίδια την υπηρεσία ναι', () => {
    let s = fakeState(5);
    // δύο θέσεις μαγειρείων με τον ίδιο κωδικό (π.χ. γραμμένο παλιότερα)
    s = { ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (b.id === 'mg' ? { ...b, posts: b.posts.map(p => (p.k === 'mg2' ? { ...p, code: 'Μ1' } : p)) } : b)) } };
    expect(codeErrors(s.settings).join()).toMatch(/Μ1/);
    expect(() => run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {} })).not.toThrow();
    expect(() => run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {}, codes: { th2: 'Μ1' } })).toThrow(/Μ1/);
    expect(() => run(s, { t: 'editBlock', phase: 'sven', id: 'mg', name: '', n: 5, hrs: {} })).toThrow(/Μ1/);
  });
});

describe('έλεγχος προηγούμενων υπηρεσιών (B5)', () => {
  it('καινούργια βάση: δεν βγαίνει ποτέ ο έλεγχος μετά την αναβάθμιση', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-b5-'));
    const st = new Store(dir, WASM); await st.open();
    expect(st.state.settings.baselineReviewed).toBe(true);
    st.close();
    const again = new Store(dir, WASM); await again.open();
    expect(again.state.settings.baselineReviewed).toBe(true);
    again.close();
  });
  it('προηγούμενες υπηρεσίες με το χέρι: ο έλεγχος δεν βγαίνει μετά', () => {
    const s = fakeState(5);
    const s2 = run(s, { t: 'setBaseline', pid: 2, baseline: { th: 3 } });
    expect(s2.baseline[2]).toEqual({ th: 3 });
    expect(needsBaselineReview(s2)).toBe(false);
  });
  it('βάση από παλιότερη έκδοση με προηγούμενες υπηρεσίες: ο έλεγχος βγαίνει ακόμα', () => {
    const s = { ...fakeState(5), baseline: { 2: { th: 3 } } };
    expect(needsBaselineReview(s)).toBe(true);
  });
});
