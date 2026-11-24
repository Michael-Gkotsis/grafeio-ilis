// Οπλισμός (24/11, επανασχεδιασμός): καρτέλες «Μητρώο όπλων» και «Υλικό» χωριστά, φόρμα με παρελκόμενα ως λίστα (accs ↔ acc, Excel όπως πριν),
// και η χρέωση οπλισμού από άκρη σε άκρη: Μητρώο ↔ Όπλα ανά άτομο ↔ καρτέλα ατόμου ↔ Excel, με μαζικές ενέργειες σε μία αναίρεση.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Asset } from '../src/shared/domain';
import { assetSheets, assetView, registry } from '../src/shared/assets';
import { outPeople, weaponInfo } from '../src/shared/weapons';
import { Store } from '../src/main/db';
import { HeldBlock, RegistryView, accsOf } from '../src/renderer/screens/assets';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const D = '2026-11-24';
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
let n = 0;
const ctx = { today: D, newId: () => 'x' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const add = (s: AppState, a: Partial<Asset> & { no: string }) => run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', state: 'ok', ...a }, date: D });
const rowOf = (s: AppState, no: string) => registry(s).find(r => r.a.no === no)!;
const sheetText = (s: AppState) => JSON.stringify(assetSheets(s, assetView(s, {}, D), D));

function page(state: AppState, mode: 'weapon' | 'material', held = false) {
  (globalThis as any).window = { innerHeight: 800, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  const store: any = { state, audit: [], boot: {}, today: D, tomorrow: '2026-11-25', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
  const nav: any = { view: 'weapons', params: {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  const el = held ? React.createElement('dl', null, React.createElement(HeldBlock, { pid: 3 })) : React.createElement(RegistryView, { mode, tabs: React.createElement('div', { className: 'tabs-stub' }, 'ΚΑΡΤΕΛΕΣ') });
  return renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, el)));
}
// Δείγμα: τυφέκιο στο μητρώο (αχρέωτο), κύριο όπλο του 2 (εικονικό), διόπτρα και ασύρματος (υλικό)
function sample(): AppState {
  let s = fakeState(5);
  s = add(s, { no: 'ΤΥΦ-100' }); s = add(s, { no: 'ΤΥΦ-101', type: 'G3A4' });
  s = run(s, { t: 'setWeapons', changes: [{ pid: 2, weapon: 'ΚΥΡ-200', wtype: 'G3A3' }] });
  s = add(s, { no: 'DN-1182', cat: 'diopt', type: 'Διόπτρα νυκτός', qty: 1 }); s = add(s, { no: 'RF13-0457', cat: 'asyrm', type: 'Ασύρματος RF-13' });
  return s;
}

describe('καρτέλες Μητρώο όπλων και Υλικό', () => {
  it('Μητρώο όπλων: μόνο όπλα (και το κύριο όπλο του ατόμου), κανένα υλικό και καμία στήλη υλικού', () => {
    const h = page(sample(), 'weapon');
    expect(h).toContain('ΤΥΦ-100'); expect(h).toContain('ΤΥΦ-101'); expect(h).toContain('ΚΥΡ-200');
    expect(h).not.toContain('DN-1182'); expect(h).not.toContain('RF13-0457'); expect(h).not.toContain('Διόπτρα νυκτός');
    expect(h).toContain('+ Νέο όπλο'); expect(h).toContain('ΚΑΡΤΕΛΕΣ'); expect(h).toContain('Επόμ. συντ.');
    expect(h).not.toContain('Σειριακός'); expect(h).toContain('3 όπλα');
    expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
  it('Υλικό: μόνο υλικό, με δικές του στήλες και κανένα όπλο ή οπλοβαστός', () => {
    const h = page(sample(), 'material');
    expect(h).toContain('DN-1182'); expect(h).toContain('RF13-0457'); expect(h).toContain('Διόπτρα νυκτός');
    expect(h).not.toContain('ΤΥΦ-100'); expect(h).not.toContain('ΚΥΡ-200');
    for (const c of ['Κατηγορία', 'Είδος', 'Σειριακός', 'Ποσ.', 'Χρεωμένο σε', 'Θέση', 'Κατάσταση']) expect(h).toContain('>' + c + '<');
    expect(h).not.toContain('Οπλοβαστός'); expect(h).toContain('+ Νέο υλικό'); expect(h).toContain('Διόπτρες');
    expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
  it('οι δύο καρτέλες χωρίς δεδομένα δεν σπάνε και λένε τι να κάνεις', () => {
    expect(page(fakeState(2), 'weapon')).toContain('Το μητρώο είναι άδειο');
    expect(page(fakeState(2), 'material')).toContain('Δεν υπάρχει υλικό');
  });
});

describe('παρελκόμενα: λίστα accs ↔ κείμενο acc, Excel όπως πριν', () => {
  it('νέο όπλο με 2 γεμιστήρες και λόγχη: Asset.accs, acc σε sync και γραμμή του Excel', () => {
    const s = add(fakeState(2), { no: 'Ζ-1', accs: [{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }], acc: 'ΠΑΛΙΟ ΚΕΙΜΕΝΟ' });
    const a = s.assets![0];
    expect(a.accs).toEqual([{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }]);
    expect(a.acc).toBe('2 Γεμιστήρας, Λόγχη');
    expect(sheetText(s)).toContain('2 ΓΕΜΙΣΤΗΡΑΣ, ΛΟΓΧΗ');
    expect(accsOf(a)).toEqual([{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }]);
  });
  it('παλιό είδος μόνο με κείμενο acc: τα checkboxes γεμίζουν με parseAccText και το Excel μένει ίδιο', () => {
    const s = add(fakeState(2), { no: 'Ζ-2', acc: '2 γεμιστήρες, λόγχη' });
    expect(accsOf(s.assets![0])).toEqual([{ name: 'γεμιστήρες', qty: 2 }, { name: 'λόγχη', qty: 1 }]);
    expect(sheetText(s)).toContain('2 ΓΕΜΙΣΤΗΡΕΣ, ΛΟΓΧΗ');
  });
  it('«+ Νέος τύπος…»: ο τύπος μπαίνει και στη λίστα της κατηγορίας, μία εντολή', () => {
    const s = run(fakeState(2), { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'ΗΚ33', no: 'Η-1', state: 'ok' }, date: D, addType: true });
    expect(s.settings.assets!.cats!.find(c => c.id === 'tyfekia')!.types).toContain('ΗΚ33');
    const t = run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'hk33', no: 'Η-2', state: 'ok' }, date: D, addType: true });
    expect(t.settings.assets!.cats!.find(c => c.id === 'tyfekia')!.types.filter(x => x.toLowerCase() === 'ηκ33').length).toBe(1);   // δεν διπλογράφεται
  });
});

describe('χρέωση οπλισμού από άκρη σε άκρη', () => {
  it('χρέωση όπλου σε στρατιώτη: κάτοχος στο Μητρώο, στα Όπλα ανά άτομο, στην καρτέλα ατόμου και στο Excel', () => {
    let s = add(fakeState(4), { no: 'Α100' });
    const id = rowOf(s, 'Α100').key;
    s = run(s, { t: 'assetHolder', id, holder: { k: 'person', pid: 3 }, date: D });
    expect(rowOf(s, 'Α100').a.holder).toEqual({ k: 'person', pid: 3 });
    expect(s.people.find(p => p.id === 3)!.weapon).toBe('Α100'); expect(s.people.find(p => p.id === 3)!.wtype).toBe('G3A3');
    expect(page(s, 'weapon')).toContain('Α100');
    expect(page(s, 'weapon', true)).toContain('Α100');   // «Χρεωμένα» στην καρτέλα του ατόμου
    const x = sheetText(s); expect(x).toContain('Α100'); expect(x).toContain('ΥΠΟΘΕΤΙΔΗΣ');   // ο 3ος του fixture
    expect(x).not.toContain('"ΑΧΡΕΩΤΟ"');
  });
  it('επιστροφή: αχρέωτο στο Μητρώο, χωρίς αριθμό στο άτομο, «ΑΧΡΕΩΤΟ» στο Excel', () => {
    let s = add(fakeState(4), { no: 'Α100' });
    s = run(s, { t: 'assetHolder', id: rowOf(s, 'Α100').key, holder: { k: 'person', pid: 3 }, date: D });
    s = run(s, { t: 'assetHolder', id: rowOf(s, 'Α100').key, holder: null, date: D });
    expect(rowOf(s, 'Α100').a.holder).toBeUndefined();
    expect(s.people.find(p => p.id === 3)!.weapon).toBeFalsy();
    expect(sheetText(s)).toContain('ΑΧΡΕΩΤΟ');
    expect(page(s, 'weapon', true)).not.toContain('Α100');
  });
  it('κύριο όπλο (εικονική γραμμή v:p:<pid>): η αλλαγή τύπου, οπλοβαστού και θέσης από τη φόρμα γράφεται και στο άτομο', () => {
    let s = run(fakeState(3), { t: 'setWeapons', changes: [{ pid: 2, weapon: 'Β200', wtype: 'G3A3' }] });
    const r = rowOf(s, 'Β200'); expect(r.key).toBe('v:p:2'); expect(r.stored).toBe(false);
    s = run(s, { t: 'saveAsset', asset: { ...r.a, id: undefined as any, type: 'G3A4', rack: 'Ε', wpos: '5' }, date: D, syncPrimary: true });
    const p = s.people.find(x => x.id === 2)!;
    expect(p.weapon).toBe('Β200'); expect(p.wtype).toBe('G3A4'); expect(p.rack).toBe('Ε'); expect(p.wpos).toBe('5');
    const r2 = rowOf(s, 'Β200'); expect(r2.stored).toBe(true); expect(r2.a.type).toBe('G3A4'); expect(r2.a.holder).toEqual({ k: 'person', pid: 2 });
  });
  it('κύριο όπλο στελέχους: το ίδιο, στο Δυναμολόγιο του στελέχους', () => {
    let s = run(fakeState(2), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΚΑΤΩΤΕΡΟΣ', first: 'ΤΕΣΤ' } });
    const cid = s.cadreList[0].id; s = { ...s, cadreList: s.cadreList.map(c => ({ ...c, weapon: 'Σ300', wtype: 'M4' })) };
    const r = rowOf(s, 'Σ300'); expect(r.key).toBe('v:c:' + cid);
    s = run(s, { t: 'saveAsset', asset: { ...r.a, id: undefined as any, type: 'G3A4', rack: 'Δ', wpos: '7' }, date: D, syncPrimary: true });
    const c = s.cadreList[0]; expect(c.weapon).toBe('Σ300'); expect(c.wtype).toBe('G3A4'); expect(c.rack).toBe('Δ'); expect(c.wpos).toBe('7');
  });
  it('το εκτός οπλοβαστού μετράει το όπλο που χρεώθηκε από το Μητρώο', () => {
    let s = add(fakeState(4), { no: 'Α100' });
    s = run(s, { t: 'assetHolder', id: rowOf(s, 'Α100').key, holder: { k: 'person', pid: 3 }, date: D });
    s = run(s, { t: 'weaponOut', pids: [3], reason: 'ΕΚΠ', day: D, time: '08:00' });
    expect(outPeople(s.people, weaponInfo(s, D, '09:00')).map(p => p.id)).toEqual([3]);
  });
});

describe('μαζικές ενέργειες: μία εντολή, μία αναίρεση', () => {
  const items = (s: AppState, nos: string[]) => nos.map(no => { const r = rowOf(s, no); return r.stored ? { id: r.key } : { id: r.key, base: r.a }; });
  it('μαζική χρέωση, συντήρηση και επισκευή (και με εικονικό κύριο όπλο στην ομάδα)', () => {
    let s = add(add(fakeState(5), { no: 'Α1' }), { no: 'Α2' });
    s = run(s, { t: 'setWeapons', changes: [{ pid: 2, weapon: 'Κ9', wtype: 'G3A3' }] });
    const it = items(s, ['Α1', 'Α2', 'Κ9']);
    const h = run(s, { t: 'assetBulk', items: it, op: { k: 'holder', holder: { k: 'person', pid: 4 } }, date: D });
    for (const no of ['Α1', 'Α2', 'Κ9']) expect(rowOf(h, no).a.holder).toEqual({ k: 'person', pid: 4 });
    expect(h.people.find(p => p.id === 4)!.weapon).toBe('Α1');   // το πρώτο γίνεται κύριο όπλο, τα άλλα δεύτερα
    expect(h.people.find(p => p.id === 2)!.weapon).toBeFalsy();   // το κύριο όπλο του 2 έφυγε από εκεί
    const m = run(s, { t: 'assetBulk', items: it, op: { k: 'maint', note: 'ΕΜΑ' }, date: D });
    for (const no of ['Α1', 'Α2', 'Κ9']) expect(rowOf(m, no).a.maint?.last).toBe(D);
    const r = run(s, { t: 'assetBulk', items: it, op: { k: 'state', state: 'repair', why: 'ΣΚΑΝΔΑΛΗ' }, date: D });
    for (const no of ['Α1', 'Α2', 'Κ9']) expect(rowOf(r, no).a.state).toBe('repair');
    expect(() => run(s, { t: 'assetBulk', items: [], op: { k: 'maint' }, date: D })).toThrow();
  });
  it('μία αναίρεση (patch της βάσης) γυρίζει όλη τη μαζική χρέωση και τη μαζική συντήρηση', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oplismos-bulk-'));
    try {
      const st = new Store(dir, WASM); await st.open();
      st.commit(add(add(fakeState(5), { no: 'Α1' }), { no: 'Α2' }));
      const snap = () => JSON.stringify([st.state.people, st.state.assets, st.state.assetLog]);
      for (const op of [{ k: 'holder', holder: { k: 'person', pid: 4 } }, { k: 'maint', note: 'Χ' }] as const) {
        const before = snap();
        const r = apply(st.state, { t: 'assetBulk', items: items(st.state, ['Α1', 'Α2']), op: op as any, date: D }, ctx);
        st.addAudit({ at: '10:00', day: D, text: r.text, files: [], source: 'app', undoable: true }, st.commit(r.state), false);
        expect(snap()).not.toBe(before);
        const last = st.lastUndoable()!; st.revert(last.patch); st.markUndone(last.id);
        expect(snap()).toBe(before);
      }
      st.close();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
