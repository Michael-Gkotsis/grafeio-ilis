// Ρυθμίσεις › Οπλισμός και υλικό με λίστες (24/11): μετονομασία τύπου (εγγραφές + αναίρεση), παρελκόμενα λίστα ↔ κείμενο (accs ↔ acc),
// παλιές ρυθμίσεις χωρίς accs, το κείμενο παρελκομένων στο Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ» όπως πριν, και η οθόνη (κατηγορίες σε 3 ομάδες, chips).
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Asset } from '../src/shared/domain';
import { accsToText, assetCfgOf, assetSheets, assetView, cleanAsset, parseAccText } from '../src/shared/assets';
import { Store } from '../src/main/db';
import { AssetsCard } from '../src/renderer/screens/assetsSet';
import { StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const D = '2026-11-24';
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
let n = 0;
const ctx = { today: D, newId: () => 'x' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const add = (s: AppState, a: Partial<Asset> & { no: string }) => run(s, { t: 'saveAsset', asset: { cat: 'tyfekia', type: 'G3A3', state: 'ok', ...a }, date: D });
const withCats = (s: AppState) => run(s, { t: 'setSettings', settings: { assets: { cats: assetCfgOf(s.settings).cats } }, text: 'δ' });

describe('renameAssetType', () => {
  it('μετονομάζει τον τύπο στην κατηγορία και σε κάθε εγγραφή που τον έχει (μία εντολή)', () => {
    let s = withCats(fakeState(3));
    s = add(s, { no: 'Α1' }); s = add(s, { no: 'Α2', type: 'g3a3' }); s = add(s, { no: 'Α3', type: 'G3A4' }); s = add(s, { no: 'Δ1', cat: 'diopt', type: 'G3A3' });
    const r = apply(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'G3A3 Νέο' }, ctx);
    const types = assetCfgOf(r.state.settings).cats.find(c => c.id === 'tyfekia')!.types;
    expect(types).toContain('G3A3 Νέο'); expect(types).not.toContain('G3A3');
    expect(r.state.assets!.map(a => a.type)).toEqual(['G3A3 Νέο', 'G3A3 Νέο', 'G3A4', 'G3A3']);   // άλλης κατηγορίας: δεν αλλάζει
    expect(r.text).toContain('G3A3 Νέο');
  });
  it('το κύριο όπλο ατόμου με τον τύπο αλλάζει κι αυτό (εικονική γραμμή του Μητρώου)', () => {
    let s = withCats(fakeState(3)); s = run(s, { t: 'setWeapons', changes: [{ pid: 1, weapon: 'Ι 1', wtype: 'G3A3' }] });
    s = run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'G3A3-B' });
    expect(s.people.find(p => p.id === 1)!.wtype).toBe('G3A3-B');
  });
  it('σφάλματα: κενό όνομα, άγνωστη κατηγορία/τύπος, ο τύπος υπάρχει ήδη', () => {
    const s = withCats(fakeState(1));
    expect(() => run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: ' ' })).toThrow();
    expect(() => run(s, { t: 'renameAssetType', cat: 'xxx', from: 'G3A3', to: 'Β' })).toThrow();
    expect(() => run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'ΔΕΝ ΥΠΑΡΧΕΙ', to: 'Β' })).toThrow();
    expect(() => run(s, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'g3a4' })).toThrow();
  });
  it('η αναίρεση (patch της βάσης) τα γυρίζει όλα πίσω με μία κίνηση', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-rename-'));
    try {
      const st = new Store(dir, WASM); await st.open();
      st.commit(withCats(add(fakeState(2), { no: 'Α1' })));
      const before = JSON.stringify([st.state.settings.assets, st.state.assets]);
      const r = apply(st.state, { t: 'renameAssetType', cat: 'tyfekia', from: 'G3A3', to: 'ΝΕΟΣ' }, ctx);
      st.addAudit({ at: '10:00', day: D, text: r.text, files: [], source: 'app', undoable: true }, st.commit(r.state), false);
      expect(st.state.assets![0].type).toBe('ΝΕΟΣ');
      const last = st.lastUndoable()!; st.revert(last.patch); st.markUndone(last.id);
      expect(JSON.stringify([st.state.settings.assets, st.state.assets])).toBe(before);
      st.close();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('παρελκόμενα: accs ↔ acc', () => {
  it('accsToText: ποσότητα μπροστά μόνο πάνω από 1', () => {
    expect(accsToText([{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }, { name: 'Ιμάντας' }])).toBe('2 Γεμιστήρας, Λόγχη, Ιμάντας');
    expect(accsToText(undefined)).toBe(''); expect(accsToText([])).toBe('');
  });
  it('parseAccText: από ελεύθερο κείμενο, ό,τι δεν καταλαβαίνει μένει όνομα', () => {
    expect(parseAccText('2 γεμιστήρες, λόγχη; ιμάντας\nθήκη')).toEqual([{ name: 'γεμιστήρες', qty: 2 }, { name: 'λόγχη', qty: 1 }, { name: 'ιμάντας', qty: 1 }, { name: 'θήκη', qty: 1 }]);
    expect(parseAccText('3x Γεμιστήρας, Λόγχη x2, Κάνη ΜΑΝ 6t')).toEqual([{ name: 'Γεμιστήρας', qty: 3 }, { name: 'Λόγχη', qty: 2 }, { name: 'Κάνη ΜΑΝ 6t', qty: 1 }]);
    expect(parseAccText('')).toEqual([]); expect(parseAccText(undefined)).toEqual([]);
  });
  it('κύκλος λίστα → κείμενο → λίστα', () => {
    const l = [{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }, { name: 'Κιτ καθαρισμού', qty: 1 }];
    expect(parseAccText(accsToText(l))).toEqual(l);
  });
  it('cleanAsset: με accs το acc ακολουθεί· χωρίς accs το acc μένει όπως είναι', () => {
    const base = { cat: 'tyfekia', type: 'G3A3', no: 'Α1', state: 'ok' as const };
    const a = cleanAsset({ ...base, acc: 'παλιό κείμενο', accs: [{ name: ' Γεμιστήρας ', qty: 2 }, { name: 'γεμιστήρας', qty: 1 }, { name: 'Λόγχη', qty: 1 }] }, 'a1');
    expect(a.accs).toEqual([{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }]); expect(a.acc).toBe('2 Γεμιστήρας, Λόγχη');
    const b = cleanAsset({ ...base, acc: '  2 γεμιστήρες,  λόγχη ' }, 'a2'); expect(b.acc).toBe('2 γεμιστήρες, λόγχη'); expect('accs' in b).toBe(false);
    expect('accs' in cleanAsset({ ...base, accs: [] }, 'a3')).toBe(false);
  });
});

describe('παλιές ρυθμίσεις και Excel', () => {
  it('ρυθμίσεις χωρίς accs φορτώνουν και δουλεύουν όπως πριν', () => {
    const s = withCats(fakeState(2)); const cfg = assetCfgOf(s.settings);
    expect(cfg.cats.every(c => !('accs' in c))).toBe(true); expect(cfg.cats[0].types.length).toBeGreaterThan(0);
    const s2 = run(s, { t: 'setSettings', settings: { assets: { cats: [{ id: 'k', name: 'Κ', kind: 'weapon', types: ['Τ1'], fields: [], accs: [{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη' }] }] } }, text: 'δ' });
    expect(assetCfgOf(s2.settings).cats[0].accs).toEqual([{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη' }]);
  });
  it('Excel: το κείμενο παρελκομένων είναι το ίδιο για παλιά εγγραφή (acc) και για εγγραφή με accs', () => {
    let s = fakeState(2);
    s = add(s, { no: 'Α1', acc: '2 γεμιστήρες, λόγχη' });
    s = add(s, { no: 'Α2', accs: [{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη', qty: 1 }] });
    const g = assetSheets(s, assetView(s, {}, D), D)[0];
    expect(g.rows.find(r => r[4] === 'Α1')!.at(-1)).toBe('ΠΑΡΕΛΚΟΜΕΝΑ: 2 ΓΕΜΙΣΤΗΡΕΣ, ΛΟΓΧΗ');
    expect(g.rows.find(r => r[4] === 'Α2')!.at(-1)).toBe('ΠΑΡΕΛΚΟΜΕΝΑ: 2 ΓΕΜΙΣΤΗΡΑΣ, ΛΟΓΧΗ');
  });
});

describe('οθόνη Ρυθμίσεις › Οπλισμός και υλικό', () => {
  const page = (state: AppState) => {
    const store: any = { state, audit: [], boot: {}, today: D, tomorrow: '2026-11-25', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
    return renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(AssetsCard)));
  };
  it('κατηγορίες σε τρεις ομάδες με πλήθος, τύποι ως chips, παρελκόμενα με ποσότητα', () => {
    let s = fakeState(2);
    s = run(s, { t: 'setSettings', settings: { assets: { cats: [{ id: 'tyfekia', name: 'Τυφέκια', kind: 'weapon', types: ['G3A3', 'HK33'], fields: [{ id: 'barrel', name: 'Αριθμός κάνης' }], every: 6, accs: [{ name: 'Γεμιστήρας', qty: 2 }, { name: 'Λόγχη' }] }, { id: 'diopt', name: 'Διόπτρες', kind: 'material', types: [], fields: [] }, { id: 'troxofora', name: 'Τροχοφόρα', kind: 'vehicle', types: [], fields: [] }] } }, text: 'δ' });
    s = add(s, { no: 'Α1' });
    const h = page(s);
    for (const t of ['Όπλα', 'Υλικό', 'Οχήματα', 'Τυφέκια', 'Διόπτρες', 'Τροχοφόρα', '+ Κατηγορία', '+ Τύπος', '+ Παρελκόμενο', '+ Πεδίο', 'G3A3', 'HK33', 'Γεμιστήρας · 2', 'Λόγχη', 'Αριθμός κάνης', 'Παρελκόμενα που έχει συνήθως', 'Δικά σου πεδία', 'Συντήρηση κάθε (μήνες)']) expect(h, t).toContain(t);
    expect(h).not.toMatch(/textarea|undefined|NaN|\[object/);
  });
  it('παλιές ρυθμίσεις (προεπιλογές, χωρίς accs) ανοίγουν χωρίς σφάλμα', () => {
    expect(() => page(fakeState(2))).not.toThrow();
  });
});
