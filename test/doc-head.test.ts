import { describe, it, expect } from 'vitest';
import { TODAY, moveItem, addHead, cleanHeadUse, cleanHeads, copyHead, formsDefaulting, formsUsing, freeHeadName, headUseOf, headsOf, presetZones, removeHead, renameHead, setDefault, toggleUse, type DocHead } from '../src/shared/docHead';
import { apply } from '../src/shared/commands';
import { fakeState } from './fixtures';

const st: any = { unit: ['ΚΕΝ ΑΥΛΩΝΑ', '2η ΕΠΧΙΑ', '4η ΙΛΗ'] };
const H = (id: string, name = id): DocHead => ({ id, name, z: [[], [], []] });

describe('επικεφαλίδες εγγράφων', () => {
  it('η «Όπως σήμερα» είναι πρώτη και ακολουθεί τις 3 γραμμές της μονάδας', () => {
    const l = headsOf({ ...st, heads: [H('a')] });
    expect(l.map(h => h.id)).toEqual([TODAY, 'a']);
    expect(l[0].z[2].map((x: any) => x.t)).toEqual(st.unit);
    expect(l[0].z[0]).toEqual([{ k: 'date' }]);
  });
  it('hdLeft: κεφαλίδα αριστερά, ημερομηνία δεξιά', () => {
    const z = presetZones('today', { ...st, hdLeft: true });
    expect(z[0]).toHaveLength(3); expect(z[2]).toEqual([{ k: 'date' }]);
  });
  it('έτοιμες μορφές: εικόνα χωρίς αρχείο ακόμα, άδεια', () => {
    expect(presetZones('imgLeft', st)[0][0]).toMatchObject({ k: 'img', id: '' });
    expect(presetZones('imgMid', st)[1][0]).toMatchObject({ k: 'img' });
    expect(presetZones('empty', st)).toEqual([[], [], []]);
  });
  it('χωρίς ρύθμιση: μόνο η «Όπως σήμερα»', () => {
    expect(headUseOf({}, 'hkai')).toEqual({ on: [TODAY], def: TODAY });
  });
  it('τσεκ: τουλάχιστον μία, η αρχική μένει μέσα στις διαθέσιμες', () => {
    let s: any = { ...st, heads: [H('a'), H('b')] };
    expect(toggleUse(s, 'outs', TODAY)).toBeUndefined();   // το τελευταίο δεν βγαίνει (και είναι η προεπιλογή: δεν αποθηκεύεται)
    s.headUse = toggleUse(s, 'outs', 'a'); s.headUse = toggleUse(s, 'outs', 'b');
    expect(headUseOf(s, 'outs')).toEqual({ on: [TODAY, 'a', 'b'], def: TODAY });
    s.headUse = setDefault(s, 'outs', 'b');
    expect(headUseOf(s, 'outs').def).toBe('b');
    s.headUse = toggleUse(s, 'outs', 'b');   // βγαίνει η αρχική: το αστέρι στην πρώτη που μένει
    expect(headUseOf(s, 'outs')).toEqual({ on: [TODAY, 'a'], def: TODAY });
    expect(setDefault(s, 'outs', 'b')).toBe(s.headUse);   // αστέρι σε μη διαθέσιμη: τίποτα
  });
  it('σβήσιμο: φεύγει από κάθε έγγραφο και η αρχική γυρνά στην «Όπως σήμερα»', () => {
    let s: any = { ...st, heads: [H('a'), H('b')] };
    s.headUse = toggleUse(s, 'outs', 'a'); s.headUse = setDefault(s, 'outs', 'a');
    s.headUse = toggleUse(s, 'hd', 'a'); s.headUse = toggleUse(s, 'hd', 'b'); s.headUse = toggleUse(s, 'hd', TODAY); s.headUse = setDefault(s, 'hd', 'b');
    expect(formsUsing(s, 'a')).toEqual(['outs', 'hd']); expect(formsDefaulting(s, 'a')).toEqual(['outs']);
    const r = removeHead(s, 'a'); s = { ...s, ...r };
    expect(s.heads.map((h: any) => h.id)).toEqual(['b']);
    expect(headUseOf(s, 'outs')).toEqual({ on: [TODAY], def: TODAY });
    expect(headUseOf(s, 'hd')).toEqual({ on: ['b'], def: 'b' });
    s = { ...s, ...removeHead(s, 'b') };
    expect(s.heads).toBeUndefined(); expect(s.headUse).toBeUndefined();
  });
  it('σβήσιμο της αρχικής όταν υπάρχουν και άλλες: η «Όπως σήμερα» μπαίνει στις διαθέσιμες', () => {
    let s: any = { ...st, heads: [H('a'), H('b')] };
    s.headUse = toggleUse(s, 'hd', 'a'); s.headUse = toggleUse(s, 'hd', 'b'); s.headUse = toggleUse(s, 'hd', TODAY); s.headUse = setDefault(s, 'hd', 'a');
    s = { ...s, ...removeHead(s, 'a') };
    expect(headUseOf(s, 'hd')).toEqual({ on: [TODAY, 'b'], def: TODAY });
  });
  it('μοναδικά ονόματα, αντίγραφο, μετονομασία', () => {
    let s: any = { ...st };
    const a = addHead(s, 'Με έμβλημα', presetZones('imgLeft', st), () => 0.1); s = { ...s, heads: a.heads };
    expect(freeHeadName(s, 'με έμβλημα')).toBe('με έμβλημα (2)');
    expect(freeHeadName(s, 'Όπως σήμερα')).toBe('Όπως σήμερα (2)');
    const c = copyHead(s, a.id, () => 0.2); expect(c.heads[1].name).toBe('Με έμβλημα (αντίγραφο)'); expect(c.id).not.toBe(a.id);
    c.heads[1].z[0].push({ k: 'gap' }); expect(c.heads[0].z[0].some(x => x.k === 'gap')).toBe(false);   // το αντίγραφο δεν δένεται με το πρωτότυπο
    expect(renameHead(s, a.id, '  Νέο   όνομα ')[0].name).toBe('Νέο όνομα');
    expect(copyHead(s, TODAY, () => 0.3).heads[1].name).toBe('Όπως σήμερα (αντίγραφο)');
  });
  it('σύρσιμο: μέσα στο κουτί και από κουτί σε κουτί', () => {
    const a = { k: 'gap' } as const, d = { k: 'date' } as const, t = { k: 'text', t: 'x' } as const;
    const z: any = [[a, d, t], [], []];
    expect(moveItem(z, [0, 0], [0, 3])[0]).toEqual([d, t, a]);   // στο τέλος
    expect(moveItem(z, [0, 2], [0, 0])[0]).toEqual([t, a, d]);
    expect(moveItem(z, [0, 0], [0, 1])).toEqual(z);              // στην ίδια θέση
    const m = moveItem(z, [0, 1], [2, 0]); expect(m[0]).toEqual([a, t]); expect(m[2]).toEqual([d]);
    expect(moveItem(z, [1, 0], [0, 0])).toBe(z);
    const full: any = [[a], Array(12).fill(d), []]; expect(moveItem(full, [0, 0], [1, 0])).toBe(full);
  });
  it('καθάρισμα: άκυρα φεύγουν, τιμές μέσα στα όρια', () => {
    const raw = [{ id: 'a', name: ' X ', z: [[{ k: 'text', t: 'α\nβ', sz: 999, b: 1, al: 'r' }, { k: 'img', id: '../x', h: 2 }, { k: 'img', id: 'a'.repeat(40), h: 99 }, { k: 'zzz' }, { k: 'gap' }], [{ k: 'date' }]] },
      { id: TODAY, name: 'x', z: [] }, { id: 'a', name: 'dup', z: [] }, { id: 'b', name: 'x', z: 5 }, null];
    const h = cleanHeads(raw)!;
    expect(h.map(x => x.name)).toEqual(['X', 'x (2)']);
    expect(h[0].z[0]).toEqual([{ k: 'text', t: 'α β', sz: 48, al: 'r' }, { k: 'img', id: 'a'.repeat(40), h: 6 }, { k: 'gap' }]);
    expect(h[0].z[1]).toEqual([{ k: 'date' }]); expect(h[0].z[2]).toEqual([]); expect(h[1].z).toEqual([[], [], []]);
    expect(cleanHeads([])).toBeUndefined(); expect(cleanHeads('x')).toBeUndefined();
  });
  it('καθάρισμα χρήσης: άγνωστες επικεφαλίδες φεύγουν, η προεπιλογή δεν αποθηκεύεται', () => {
    const hs = [H('a')];
    expect(cleanHeadUse({ outs: { on: ['a', 'zz', 'a'], def: 'zz' }, hkai: { on: ['zz'], def: 'zz' }, bad: 1, hd: { on: [TODAY], def: TODAY } }, hs)).toEqual({ outs: { on: ['a'], def: 'a' } });
    expect(cleanHeadUse(undefined, hs)).toBeUndefined();
  });
  it('η εντολή setSettings καθαρίζει και δεν αγγίζει τίποτα άλλο όταν δεν αλλάζουν', () => {
    const s = fakeState(3); const ctx = { today: '2026-11-13', newId: () => 'x' };
    const r = apply(s, { t: 'setSettings', settings: { heads: [H('a')] as any, headUse: { outs: { on: ['a'], def: 'q' } } }, text: 't' }, ctx).state.settings;
    expect(r.headUse).toEqual({ outs: { on: ['a'], def: 'a' } });
    const r2 = apply({ ...s, settings: r }, { t: 'setSettings', settings: { place: 'Χ' }, text: 't' }, ctx).state.settings;
    expect(r2.heads).toBe(r.heads);
    const r3 = apply({ ...s, settings: r }, { t: 'setSettings', settings: { heads: undefined, headUse: undefined }, text: 't' }, ctx).state.settings;
    expect('heads' in r3).toBe(false); expect('headUse' in r3).toBe(false);
  });
});
