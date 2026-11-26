// Μετονομασία ειδικότητας: λίστα, στρατιώτες, στελέχη, φίλτρα εντύπων και αποθηκευμένες λίστες. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { itemKey, listOf } from '../src/shared/ranks';
import { ListsCard } from '../src/renderer/screens/lists';
import { StoreCtx, NavCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const ctx = { today: '2026-12-01', newId: () => 'q1' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
function setup(): AppState {
  let s = fakeState(5);
  s = run(s, { t: 'setSettings', settings: { lists: { eids: { add: [{ name: 'ΜΑΓΕΙΡΑΣ' }, { name: 'ΟΔΗΓΟΣ' }], hide: ['μαγειρας'] } } }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  s = { ...s, people: s.people.map((p, i) => (i < 2 ? { ...p, eid: 'ΜΑΓΕΙΡΑΣ' } : i === 2 ? { ...p, eid: 'ΟΔΗΓΟΣ' } : p)), cadreList: s.cadreList.map(c => ({ ...c, eid: 'ΜΑΓΕΙΡΑΣ' })) };
  s = { ...s, settings: { ...s.settings, views: [{ id: 'v1', name: 'Μάγειροι', unit: 'all', room: null, filter: 'eid:' + itemKey('ΜΑΓΕΙΡΑΣ'), q: '' }],
    reports: [{ id: 'r1', pick: { from: 'eid:' + itemKey('ΜΑΓΕΙΡΑΣ'), eids: ['ΜΑΓΕΙΡΑΣ', 'ΟΔΗΓΟΣ'] }, more: [{ id: 't1', pick: { eids: ['μάγειρας'] } }] }] as any } };
  return s;
}

describe('renameEid', () => {
  it('αλλάζει λίστα, στρατιώτες, στελέχη, φίλτρο εντύπου και αποθηκευμένη λίστα', () => {
    const s = setup(); const r = apply(s, { t: 'renameEid', from: 'ΜΑΓΕΙΡΑΣ', to: 'μάγειρος' }, ctx);
    const st = r.state;
    expect(listOf(st.settings.lists, 'eids')).toEqual(['ΟΔΗΓΟΣ']);   // κρυφό μένει κρυφό
    expect(st.settings.lists!.eids!.add!.map(x => x.name)).toEqual(['ΜΑΓΕΙΡΟΣ', 'ΟΔΗΓΟΣ']); expect(st.settings.lists!.eids!.hide).toEqual(['ΜΑΓΕΙΡΟΣ']);
    expect(st.people.map(p => p.eid).slice(0, 4)).toEqual(['ΜΑΓΕΙΡΟΣ', 'ΜΑΓΕΙΡΟΣ', 'ΟΔΗΓΟΣ', undefined]);
    expect(st.cadreList[0].eid).toBe('ΜΑΓΕΙΡΟΣ');
    const rep: any = st.settings.reports![0];
    expect(rep.pick.eids).toEqual(['ΜΑΓΕΙΡΟΣ', 'ΟΔΗΓΟΣ']); expect(rep.more[0].pick.eids).toEqual(['ΜΑΓΕΙΡΟΣ']); expect(rep.pick.from).toBe('eid:' + itemKey('ΜΑΓΕΙΡΟΣ'));
    expect(st.settings.views![0].filter).toBe('eid:' + itemKey('ΜΑΓΕΙΡΟΣ'));
    expect(r.text).toContain('Ειδικότητες: «ΜΑΓΕΙΡΑΣ» → «ΜΑΓΕΙΡΟΣ»'); expect(r.text).toContain('2 άτομα'); expect(r.files).toEqual([]);
  });
  it('κενό, κόμμα και διπλό όνομα δεν γίνονται δεκτά', () => {
    const s = setup();
    expect(() => apply(s, { t: 'renameEid', from: 'ΜΑΓΕΙΡΑΣ', to: '  ' }, ctx)).toThrow();
    expect(() => apply(s, { t: 'renameEid', from: 'ΜΑΓΕΙΡΑΣ', to: 'Α, Β' }, ctx)).toThrow(/κόμμα/);
    expect(() => apply(s, { t: 'renameEid', from: 'ΜΑΓΕΙΡΑΣ', to: 'οδηγός' }, ctx)).toThrow(/ήδη/);
  });
  it('η παλιά κατάσταση δεν αλλάζει (αναίρεση)', () => {
    const s = setup(); const b = JSON.stringify(s); run(s, { t: 'renameEid', from: 'ΜΑΓΕΙΡΑΣ', to: 'ΜΑΓΕΙΡΟΣ' });
    expect(JSON.stringify(s)).toBe(b);
  });
});

describe('οθόνη Λίστες › Ειδικότητες', () => {
  it('δείχνει «Μετονομασία» χωρίς ▲▼', () => {
    const state = setup();
    const store: any = { state, audit: [], boot: {}, today: '2026-12-01', tomorrow: '2026-12-02', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
    const nav: any = { view: 'settings', params: { list: 'eids' }, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
    const h = renderToString(React.createElement(NavCtx.Provider, { value: nav }, React.createElement(StoreCtx.Provider, { value: store }, React.createElement(ListsCard))));
    expect(h).toContain('Μετονομασία'); expect(h).not.toContain('Άνοδος');
  });
});
