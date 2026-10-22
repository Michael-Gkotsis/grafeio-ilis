// Έντυπα υπηρεσιών από λίστα (Michael, 22/10: «ΣΒΕΝ ΣΠΕΝ … να είναι dropdown και λίστες»): ΣΒΕΝ, ΣΠΕΝ και δικά σου,
// που ξεκινούν ως αντίγραφο ενός άλλου και βγαίνουν στο Excel με το έντυπο εκείνου. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, phaseDelWhy, type Ctx } from '../src/shared/commands';
import { fillFroura } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { codeErrors, codeOf, readDuty } from '../src/shared/codes';
import { allPosts, capCols, postsOf } from '../src/shared/rules';
import { dutyCols } from '../src/shared/sources';
import { blocksOf, frouraFile, phaseBase, phaseList, phaseName, withCodes, type AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'n' + ++seq };
const run = (s: AppState, c: Parameters<typeof apply>[1]) => apply(s, c, ctx).state;
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const newPhase = (s: AppState, name: string, from = 'spen') => { const ns = run(s, { t: 'addPhase', name, from }); return { s: ns, id: ns.settings.phases!.at(-1)!.id }; };
const cells = async (data: Buffer) => { const wb = await Workbook.open(data); const ws = await wb.sheet(0); return { names: wb.sheetNames(), text: JSON.stringify(Array.from({ length: 70 }, (_, r) => 'ABCDEFGHIJKLM'.split('').map(c => ws.get(c + (r + 1))))) }; };

describe('δικά σου έντυπα υπηρεσιών', () => {
  it('νέο έντυπο: αντίγραφο με τις ίδιες θέσεις και κωδικούς, κεφαλαία, χωρίς «ΦΡΟΥΡΑ» και χωρίς διπλό όνομα', () => {
    const { s, id } = newPhase(fakeState(30), 'φρουρά Άσκηση');
    expect(phaseName(s.settings, id)).toBe('ΑΣΚΗΣΗ');
    expect(phaseBase(s.settings, id)).toBe('spen');
    expect(phaseList(s.settings).map(x => x.name)).toEqual(['ΣΒΕΝ', 'ΣΠΕΝ', 'ΑΣΚΗΣΗ']);
    expect(blocksOf(s.settings, id).map(b => b.id)).toEqual(s.settings.blocksSpen.map(b => b.id));
    expect(blocksOf(s.settings, id).flatMap(b => b.posts.map(p => p.code))).toEqual(s.settings.blocksSpen.flatMap(b => b.posts.map(p => p.code)));
    expect(codeErrors(s.settings)).toEqual([]);
    expect(() => run(s, { t: 'addPhase', name: 'ασκηση', from: 'sven' })).toThrow(/Υπάρχει ήδη/);
    expect(() => run(s, { t: 'addPhase', name: 'σπεν', from: 'sven' })).toThrow(/Υπάρχει ήδη/);
    expect(() => run(s, { t: 'addPhase', name: '  ', from: 'sven' })).toThrow(/όνομα/);
    expect(() => run(s, { t: 'addPhase', name: 'Α/Β', from: 'sven' })).toThrow(/αρχείου/);
    expect(() => run(s, { t: 'addPhase', name: 'ΧΧ', from: 'nope' })).toThrow();
    // αλλαγή στο αντίγραφο δεν πειράζει το αρχικό
    const s2 = run(s, { t: 'setBlock', phase: id, id: 'op', patch: { armed: false } });
    expect(blocksOf(s2.settings, id).find(b => b.id === 'op')!.armed).toBe(false);
    expect(s2.settings.blocksSpen.find(b => b.id === 'op')!.armed).toBe(true);
  });

  it('όταν ισχύει: θέσεις, αυτόματη συμπλήρωση και νέα υπηρεσία μόνο σε αυτό, με δικό της ελεύθερο κωδικό', () => {
    const { s: s0, id } = newPhase(fakeState(40), 'ΑΣΚΗΣΗ', 'sven');
    let s = run(s0, { t: 'setPhase', phase: id });
    expect(s.settings.phase).toBe(id);
    s = run(s, { t: 'addBlock', phase: id, name: 'Πύλη', kind: 'other', armed: false, n: 2, hrs: '' });
    const gate = blocksOf(s.settings, id).find(b => b.name === 'Πύλη')!;
    expect(s.settings.blocks.some(b => b.name === 'Πύλη')).toBe(false);
    expect(postsOf(s.settings).filter(x => x.block === gate.id)).toHaveLength(2);
    expect(codeErrors(s.settings)).toEqual([]);
    const code = gate.posts[0].code!;
    expect(readDuty(code, s.settings)).toEqual({ k: gate.posts[0].k, kind: 'other' });
    expect(codeOf(s.settings, gate.posts[0].k, 'other')).toBe(code);
    s = run(s, { t: 'autofill', date: D });
    expect(s.guards[D][gate.posts[0].k]).toBeTruthy();
    // ιστορικό και σύνολα βλέπουν και τις θέσεις του: και με άλλο έντυπο σε ισχύ
    const back = run(s, { t: 'setPhase', phase: 'sven' });
    expect(allPosts(back.settings).some(x => x.k === gate.posts[0].k)).toBe(true);
    expect(dutyCols(back.settings).head).toContain('ΠΥΛΗ');
    expect(capCols(back.settings).find(c => c.block?.id === gate.id)!.phases).toEqual([id]);
    expect(readDuty(code, back.settings)).toEqual({ k: gate.posts[0].k, kind: 'other' });
  });

  it('Excel: το έντυπο της ΣΠΕΝ με το όνομά του (αρχείο και φύλλο), οι δικές του υπηρεσίες σε δικό τους πίνακα', async () => {
    const { s: s0, id } = newPhase(fakeState(40), 'ΑΣΚΗΣΗ');
    let s = run(run(s0, { t: 'setPhase', phase: id }), { t: 'addBlock', phase: id, name: 'Σκοπιά πεδίου', kind: 'sk', armed: false, n: 1, hrs: '' });
    s = run(s, { t: 'autofill', date: D });
    const r = await fillFroura(T('froura-spen.xlsx'), s, D);
    expect(r.name).toBe('ΦΡΟΥΡΑ ΑΣΚΗΣΗ 12-10-2026.xlsx');
    expect(frouraFile(s.settings)).toBe('ΦΡΟΥΡΑ ΑΣΚΗΣΗ ');
    const x = await cells(r.data);
    expect(x.names).toEqual(['ΦΡΟΥΡΑ ΑΣΚΗΣΗ']);
    expect(x.text).toContain('ΣΚΟΠΙΑ ΠΕΔΙΟΥ');
    expect(x.text).toContain('ΟΠΛΟΦΥΛΑΚΕΣ');
    expect(r.warnings).toEqual([]);
    // η ΣΒΕΝ και η ΣΠΕΝ βγαίνουν όπως πριν
    const sv = await fillFroura(T('froura.xlsx'), run(s, { t: 'setPhase', phase: 'sven' }), D);
    expect(sv.name).toBe('ΦΡΟΥΡΑ 12-10-2026.xlsx');
    expect((await cells(sv.data)).names).toEqual(['ΦΡΟΥΡΑ ΣΒΕΝ']);
    expect((await fillFroura(T('froura-spen.xlsx'), run(s, { t: 'setPhase', phase: 'spen' }), D)).name).toBe('ΦΡΟΥΡΑ ΣΠΕΝ 12-10-2026.xlsx');
  });

  it('μετονομασία και διαγραφή: όχι το έντυπο που ισχύει, όχι αν μόνο αυτό έχει υπηρεσίες που έγιναν', () => {
    const { s: s0, id } = newPhase(fakeState(30), 'ΑΣΚΗΣΗ', 'sven');
    const r = run(s0, { t: 'renamePhase', id, name: 'Άσκηση 2' });
    expect(phaseName(r.settings, id)).toBe('ΑΣΚΗΣΗ 2');
    expect(() => run(s0, { t: 'renamePhase', id: 'sven', name: 'Χ' })).toThrow();
    expect(() => run(s0, { t: 'delPhase', id: 'spen' })).toThrow();
    // μόνο κοινές θέσεις με τη ΣΒΕΝ: διαγράφεται και με ιστορικό
    const cur = run(s0, { t: 'setPhase', phase: id });
    expect(phaseDelWhy(cur, id)).toMatch(/Ισχύει τώρα/);
    expect(() => run(cur, { t: 'delPhase', id })).toThrow(/Ισχύει τώρα/);
    const used = run(run(cur, { t: 'autofill', date: D }), { t: 'setPhase', phase: 'sven' });
    expect(phaseDelWhy(used, id)).toBe('');
    // δική του υπηρεσία που έγινε: μένει για το ιστορικό
    let s = run(cur, { t: 'addBlock', phase: id, name: 'Πύλη', kind: 'other', armed: false, n: 1, hrs: '' });
    const k = blocksOf(s.settings, id).find(b => b.name === 'Πύλη')!.posts[0].k;
    s = run({ ...s, guards: { [D]: { [k]: s.people[0].id } } }, { t: 'setPhase', phase: 'sven' });
    expect(phaseDelWhy(s, id)).toMatch(/ιστορικό/);
    s = { ...s, guards: {} };
    const gone = run(s, { t: 'delPhase', id });
    expect(gone.settings.phases).toEqual([]);
    expect(phaseList(gone.settings)).toHaveLength(2);
  });

  it('κωδικοί (withCodes) και έντυπο που λείπει: δεν χαλάνε', () => {
    const { s, id } = newPhase(fakeState(10), 'ΑΣΚΗΣΗ');
    const bare = { ...s.settings, phases: s.settings.phases!.map(x => ({ ...x, blocks: x.blocks.map(b => ({ ...b, posts: b.posts.map(p => ({ ...p, code: undefined })) })) })) };
    const fixed = withCodes(bare);
    expect(blocksOf(fixed, id).flatMap(b => b.posts.map(p => p.code))).toEqual(s.settings.blocksSpen.flatMap(b => b.posts.map(p => p.code)));
    // έντυπο που δεν υπάρχει πια: όπως η ΣΒΕΝ
    const lost = { ...s.settings, phase: 'fgone' };
    expect(blocksOf(lost)).toBe(s.settings.blocks);
    expect(phaseBase(lost)).toBe('sven');
    expect(() => run({ ...s, settings: lost }, { t: 'setPhase', phase: 'fother' })).toThrow();
  });
});
