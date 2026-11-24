// Μόνιμο άτομο ανά υπηρεσία (Michael, 24/11): ό,τι έκαναν ο Λ/Υ και ο Δ/Υ γίνεται ρύθμιση κάθε θέσης (settings.fixed[κλειδί θέσης]).
// Ο Λ/Υ και ο Δ/Υ δουλεύουν όπως πριν· οι άλλες υπηρεσίες παίρνουν το ίδιο. Τυχαίες μορφές εντύπων, ΦΡΟΥΡΑ και προεπισκόπηση. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState } from '../src/shared/domain';
import { addDays } from '../src/shared/dates';
import { fillDay, fixedIds, isFixed, postsOf } from '../src/shared/rules';
import { fillFroura } from '../src/main/exports';
import { previewOf } from '../src/main/formPreview';
import { Workbook } from '../src/main/xlsx';
import { fakeState } from './fixtures';

const D = '2026-12-01';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
const fixedOn = (s: AppState, f: Record<string, number>) => run(s, { t: 'setSettings', settings: { fixed: f }, text: 'μόνιμα' });
const fill = (s: AppState, days: number) => { for (let i = 0; i < days; i++) s = run(s, { t: 'autofill', date: addDays(D, i) }); return s; };
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe('μόνιμο άτομο ανά θέση', () => {
  it('Λ/Υ και Δ/Υ: όπως πριν (ίδια ρύθμιση, κάθε μέρα στη θέση τους, ποτέ αλλού)', () => {
    const s = fill(fixedOn(fakeState(40), { ly: 7, dy: 8 }), 4);
    for (let i = 0; i < 4; i++) { const g = s.guards[addDays(D, i)]; expect(g.ly).toBe(7); expect(g.dy).toBe(8); expect(Object.values(g).filter(p => p === 7 || p === 8)).toHaveLength(2); }
  });
  it('νέα υπηρεσία (πύλη): το μόνιμο άτομο μπαίνει κάθε μέρα στη θέση της και δεν μπαίνει σε άλλη', () => {
    let s = run(fakeState(40), { t: 'addBlock', phase: fakeState(1).settings.phase, name: 'ΠΥΛΗ', armed: false, n: 2, hrs: '' });
    const k = blocksOf(s.settings).find(b => b.name === 'ΠΥΛΗ')!.posts[1].k;
    s = fill(fixedOn(s, { [k]: 11 }), 5);
    for (let i = 0; i < 5; i++) { const g = s.guards[addDays(D, i)]; expect(g[k]).toBe(11); expect(Object.entries(g).filter(([, p]) => p === 11)).toHaveLength(1); }
    expect(isFixed(s, 11, k)).toBe(true); expect(isFixed(s, 11, 'ly')).toBe(false);
  });
  it('αλλαγή για μία μέρα με το χέρι· την επόμενη ξαναμπαίνει ο μόνιμος', () => {
    let s = fillDayState();
    const k = Object.keys(s.settings.fixed!)[0]; const sub = s.people.find(p => p.id !== 5 && !Object.values(s.guards[D] || {}).includes(p.id))!.id;
    s = run(s, { t: 'assign', date: D, k, pid: sub }); expect(s.guards[D][k]).toBe(sub);
    s = run(s, { t: 'autofill', date: addDays(D, 1) }); expect(s.guards[addDays(D, 1)][k]).toBe(5);
    function fillDayState() { const t = run(fakeState(40), { t: 'addBlock', phase: fakeState(1).settings.phase, name: 'ΠΥΛΗ', armed: false, n: 1, hrs: '' }); const kk = blocksOf(t.settings).find(b => b.name === 'ΠΥΛΗ')!.posts[0].k; return run(fixedOn(t, { [kk]: 5 }), { t: 'autofill', date: D }); }
  });
  it('εγγραφή για θέση που δεν υπάρχει πια δεν βγάζει κανέναν από τη σειρά', () => {
    const s = fixedOn(fakeState(40), { ly: 3, ΞΕΧΑΣΜΕΝΗ: 9 });
    expect(fixedIds(s).has(3)).toBe(true); expect(fixedIds(s).has(9)).toBe(false);
    expect(fill(s, 3).guards[D].ly).toBe(3);
  });
  it('με όριο υπηρεσιών τον μήνα, ο μόνιμος μπαίνει κανονικά την πρώτη μέρα', () => {
    let s = fixedOn(fakeState(40), { ly: 4 }); s = { ...s, rules: { ...s.rules, dutyMax: 2, dutyMaxPer: 'month' } as AppState['rules'] };
    const f = fillDay(s, D); expect(f.guards[D].ly).toBe(4);   // πρώτη μέρα μπαίνει
  });
  it('ΦΡΟΥΡΑ και προεπισκόπηση: γράφουν το μόνιμο άτομο και ανανεώνονται όταν το αλλάζεις', async () => {
    const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'froura.xlsx'));
    let s = run(fakeState(40), { t: 'addBlock', phase: fakeState(1).settings.phase, name: 'ΠΥΛΗ', armed: false, n: 1, hrs: '' });
    const k = blocksOf(s.settings).find(b => b.name === 'ΠΥΛΗ')!.posts[0].k;
    const text = async (st: AppState) => {
      const o = await fillFroura(T, st, D); const pv = await previewOf({ name: o.name, data: o.data, warnings: o.warnings, empty: o.empty, sheet: o.sheet });
      return pv.sheets.map(x => x.html).join('');
    };
    const a = run(fixedOn(s, { [k]: 6 }), { t: 'autofill', date: D }); const b = run(fixedOn(s, { [k]: 9 }), { t: 'autofill', date: D });
    const last = (st: AppState, id: number) => st.people.find(p => p.id === id)!.last;
    const ta = await text(a), tb = await text(b);
    expect(ta).toContain(last(a, 6)); expect(tb).toContain(last(b, 9));
    expect(ta).not.toBe(tb);
    const wb = await (await Workbook.open((await fillFroura(T, a, D)).data)).sheet(0); let hit = false;
    for (let r = 1; r <= 90 && !hit; r++) for (const c of 'ABCDEFGHIJKL') { const v = wb.get(c + r); if (typeof v === 'string' && v.includes(last(a, 6).toUpperCase())) hit = true; }
    expect(hit).toBe(true);
  });
});

describe('τυχαίες μορφές εντύπου και μόνιμα άτομα', () => {
  for (let seed = 1; seed <= 25; seed++) it('seed ' + seed, () => {
    const r = rng(seed); const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    let s = fakeState(60);
    for (let b = 0; b < int(0, 3); b++) s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΥΠΗΡΕΣΙΑ' + b, armed: r() < 0.3, n: int(1, 3), hrs: '' });
    const posts = postsOf(s.settings); const fixed: Record<string, number> = {}; const used = new Set<number>();
    for (let i = 0; i < int(1, 5); i++) { const p = posts[int(0, posts.length - 1)]; let id = int(1, 40); while (used.has(id)) id = int(1, 40); used.add(id); fixed[p.k] = id; }
    for (const id of [...used]) if (!Object.values(fixed).includes(id)) used.delete(id);   // θέση που ξαναδιαλέχτηκε: ο πρώτος δεν είναι πια μόνιμος
    s = fixedOn(s, fixed);
    const days = int(3, 6); s = fill(s, days);
    for (let i = 0; i < days; i++) {
      const g = s.guards[addDays(D, i)]; const seen = new Set<number>();
      for (const [k, pid] of Object.entries(g)) { expect(seen.has(pid), 'seed ' + seed + ' διπλή ' + pid).toBe(false); seen.add(pid); if (!fixed[k]) expect(used.has(pid), 'seed ' + seed + ' ο μόνιμος ' + pid + ' σε άλλη θέση ' + k + ' μέρα ' + i + ' ' + JSON.stringify(fixed)).toBe(false); }
      for (const [k, id] of Object.entries(fixed)) expect(g[k], 'seed ' + seed + ' ' + k).toBe(id);
    }
  });
});
