// The rule engine (src/shared/hkRules.ts) with the DEFAULT rules must give exactly the numbers of hkaiCounts, for every row and every column,
// over many random app states (ranks, origins, attached, cadre list with absences, hand-written cells, own rows and own leave kinds).
// And the row rules: parentheses narrow by origin, ranks split a shared row, overlapping rows are found.
import { describe, it, expect } from 'vitest';
import { genHkState, DAYS } from './hk-gen';
import { hkaiClassify, hkaiCounts, HK_A, HK_K } from '../src/shared/rules';
import { hkRowList } from '../src/shared/ranks';
import { buildLexicon } from '../src/shared/lexicon';
import { ABS_KEYS, defaultColRule, defaultRowRule, HkEngine, KOL_KEYS, resolveRow, rowsOverlap, type RuleCtx } from '../src/shared/hkRules';

const N = Number(process.env.FUZZ_N || 12);
const lex = buildLexicon();
const COLS = [...HK_K, ...HK_A].map(x => x[0]).concat(['ab']);

describe('default rules = hkaiCounts', () => {
  for (const [name, o] of [['bundled rows', {}], ['own rows and leave kinds', { own: true }], ['Λόχος words', { lochos: true, own: true }], ['no cadre list', { cadre: false }]] as const) {
    it(name + ' x' + N, () => {
      const bad: string[] = []; let cells = 0;
      for (let seed = 1; seed <= N; seed++) {
        const s = genHkState(seed, o);
        for (const d of DAYS.slice(0, 6)) {
          const h = hkaiCounts(s, d); const eng = new HkEngine(hkaiClassify(s, d), lex);
          let kol = 0, apo = 0, n = 0;
          for (const r of hkRowList(s.settings.lists)) {
            const row = defaultRowRule(r), x = h.rank[r];
            const chk = (what: string, got: number, want: number) => { cells++; if (got !== want) bad.push('s' + seed + ' ' + d + ' ' + r + ' ' + what + ' ' + got + '≠' + want); };
            chk('force', eng.count(row, { t: 'force' }), x.n);
            chk('attached', eng.count(row, { t: 'attached' }), x.attached);
            chk('placed', eng.count(row, { t: 'placed' }), x.n - x.attached);
            for (const k of COLS) chk(k, eng.count(row, defaultColRule(k) ?? { t: 'state', keys: [k] }), x.c[k] || 0);
            const sk = KOL_KEYS.reduce((a, k) => a + (x.c[k] || 0), 0), sa = ABS_KEYS.reduce((a, k) => a + (x.c[k] || 0), 0);
            chk('sumK', eng.count(row, defaultColRule('sumK')!), sk); chk('sumA', eng.count(row, defaultColRule('sumA')!), sa);
            chk('avail', eng.count(row, defaultColRule('avail')!), x.n - sa);
            kol += sk; apo += sa; n += x.n;
          }
          expect(kol, 'kol').toBe(h.kol); expect(apo, 'apo').toBe(h.apo); expect(n, 'total').toBe(h.total); expect(n - apo, 'avail').toBe(h.avail);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]); expect(cells).toBeGreaterThan(1000);
    });
  }
  it('the classification puts everyone in exactly one row', () => {
    const s = genHkState(5, { own: true }); const c = hkaiClassify(s, DAYS[2]);
    expect(c.who.every(w => c.rows.includes(w.row))).toBe(true);
    expect(c.who.length).toBe(s.people.filter(p => p.active).length + (s.cadreList || []).filter(x => x.active).length);
  });
});

describe('row rules', () => {
  const ctx = (extra: Partial<RuleCtx> = {}): RuleCtx => ({ lex, rows: hkRowList(undefined), ...extra });
  it('parentheses narrow by origin', () => {
    expect(resolveRow('Λχίες (ΕΠΟΠ)', undefined, ctx()).rule).toMatchObject({ keys: ['Λοχίες'], origins: ['origin:ΕΠΟΠ'] });
    expect(resolveRow('Δεκανείς (ΕΠΟΠ/ΕΦ)', undefined, ctx()).rule).toMatchObject({ keys: ['Δεκανείς'], origins: ['origin:ΕΠΟΠ', 'origin:ΕΦ'] });
    expect(resolveRow('Λχίες (Μ.)', undefined, ctx()).rule).toMatchObject({ keys: ['Λοχίες'], origins: ['origin:ΜΟΝΙΜΟΣ'] });
  });
  it('an unknown word in the parentheses is not guessed', () => {
    const r = resolveRow('Λχίες (ΞΕΝΗ ΛΕΞΗ)', undefined, ctx()); expect(r.rule).toBeNull(); expect(r.why).toMatch(/άγνωστος/);
  });
  it('the Λόχος names of the officer rows are the same rows; Υπολοχαγοί and Ανθυπολοχαγοί split by rank', () => {
    expect(resolveRow('Ταγματάρχες', undefined, ctx()).rule).toEqual({ keys: ['Επίλαρχοι'] });
    expect(resolveRow('Λοχαγοί', undefined, ctx()).rule).toEqual({ keys: ['Ίλαρχοι'] });
    expect(resolveRow('Υπολοχαγοί', undefined, ctx()).rule).toEqual({ keys: ['Ανθυπίλαρχοι-Ανθλγοι'], ranks: ['rank:ΥΠΟΛΟΧΑΓΟΣ'] });
    expect(resolveRow('Ανθυπολοχαγοί', undefined, ctx()).rule).toEqual({ keys: ['Ανθυπίλαρχοι-Ανθλγοι'] });   // alone it is the whole row; next to «Υπολοχαγοί» mapMatrix splits it by rank
  });
  it('overlap: same row, same origin; different origins do not overlap', () => {
    expect(rowsOverlap({ keys: ['Λοχίες'] }, { keys: ['Λοχίες'], origins: ['origin:ΕΠΟΠ'] })).toBe(true);
    expect(rowsOverlap({ keys: ['Λοχίες'], origins: ['origin:ΕΠΟΠ'] }, { keys: ['Λοχίες'], origins: ['origin:ΜΟΝΙΜΟΣ'] })).toBe(false);
    expect(rowsOverlap({ keys: ['Λοχίες'] }, { keys: ['Δεκανείς'] })).toBe(false);
  });
  it('a restricted row counts only the matching people', () => {
    const s = genHkState(9, { cadre: false }); const d = DAYS[3]; const eng = new HkEngine(hkaiClassify(s, d), lex);
    const all = eng.count({ keys: ['Λοχίες'] }, { t: 'force' }), epop = eng.count({ keys: ['Λοχίες'], origins: ['origin:ΕΠΟΠ'] }, { t: 'force' }), other = eng.count({ keys: ['Λοχίες'], origins: ['origin:ΕΦ', 'origin:ΟΒΑ', 'origin:ΕΜΘ'] }, { t: 'force' });
    expect(epop).toBeLessThanOrEqual(all); expect(epop + other).toBeLessThanOrEqual(all);
  });
});
