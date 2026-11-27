// Οθόνες και καρτέλες που φαίνονται (renderer/shown.ts, Ρυθμίσεις › Οθόνες και καρτέλες)
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { SCREEN_TABLE, firstShown, hiddenNow, hideNext, isShown, lastTab, pickTab, settingShown, shownTabs } from '../src/renderer/shown';
import { TemplatesScreen } from '../src/renderer/screens/settings';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const NAV = ['home', 'people', 'cadre', 'guard', 'outs', 'records', 'strength', 'hkai', 'weapons', 'vehicles', 'reports', 'notes'];
const H = (...hide: string[]) => ({ hide });

describe('shown: τι φαίνεται', () => {
  it('χωρίς hide φαίνονται όλες οι οθόνες και καρτέλες', () => {
    for (const [v, , , tabs] of SCREEN_TABLE) { expect(isShown({}, v)).toBe(true); for (const [t] of tabs) expect(isShown({}, v, t)).toBe(true); }
    expect(firstShown({}, NAV)).toBe('home');
  });
  it('οι πάντα ανοιχτές δεν κρύβονται ούτε αν είναι στη λίστα', () => {
    const h = H('people', 'cadre', 'templates', 'guide', 'history', 'diag', 'people.list', 'cadre.list');
    for (const v of ['people', 'cadre', 'templates', 'guide', 'history', 'diag']) expect(isShown(h, v)).toBe(true);
    expect(isShown(h, 'people', 'list')).toBe(true); expect(isShown(h, 'cadre', 'list')).toBe(true);
    expect(hideNext({}, 'people', true)).toEqual([]); expect(hideNext({}, 'cadre.list', true)).toEqual([]);
  });
  it('άγνωστα id αγνοούνται', () => {
    const h = H('nope', 'guard.zzz', 'weapons.', 'x.y');
    expect(hiddenNow(h)).toEqual([]); expect(isShown(h, 'guard', 'posts')).toBe(true); expect(isShown(h, 'nope')).toBe(true);
    expect(hideNext(h, 'nope', true)).toEqual([]);
    expect(isShown({ hide: 'x' as any }, 'guard')).toBe(true);
  });
  it('κρυφή οθόνη και καρτέλα', () => {
    const h = H('weapons', 'guard.who');
    expect(isShown(h, 'weapons')).toBe(false); expect(isShown(h, 'guard')).toBe(true); expect(isShown(h, 'guard', 'who')).toBe(false);
    expect(shownTabs(h, 'guard', [{ value: 'posts' }, { value: 'who' }, { value: 'xl' }]).map(t => t.value)).toEqual(['posts', 'xl']);
    expect(hiddenNow(h)).toEqual(['Υπηρεσίες › Ποιος κάνει τι', 'Οπλισμός']);
  });
  it('κρυφή καρτέλα: ανοίγει η πρώτη που φαίνεται', () => {
    expect(pickTab(H('guard.posts'), 'guard', 'posts')).toBe('check');
    expect(pickTab(H('hkai.hkai', 'hkai.pun'), 'hkai', 'pun')).toBe('leave');
    expect(pickTab(H('cadre.duty'), 'cadre', 'duty')).toBe('list');
    expect(pickTab({}, 'weapons', 'yliko')).toBe('yliko');
  });
  it('η τελευταία καρτέλα δεν κρύβεται', () => {
    const h = H('weapons.weapons', 'weapons.moves', 'weapons.mitroo');
    expect(lastTab(h, 'weapons', 'yliko')).toBe(true); expect(lastTab({}, 'weapons', 'yliko')).toBe(false);
  });
  it('αρχική οθόνη: η πρώτη που φαίνεται', () => {
    expect(firstShown(H('home'), NAV)).toBe('people'); expect(firstShown(H('home', 'people'), NAV)).toBe('people');
  });
  it('Ρυθμίσεις που ακολουθούν κρυφό κομμάτι', () => {
    expect(settingShown({}, 'assets')).toBe(true);
    expect(settingShown(H('weapons'), 'assets')).toBe(false);
    expect(settingShown(H('weapons.mitroo'), 'assets')).toBe(true);
    expect(settingShown(H('weapons.mitroo', 'weapons.yliko'), 'assets')).toBe(false);
    expect(settingShown(H('cadre.duty'), 'cadreDuty')).toBe(false); expect(settingShown(H('cadre.duty'), 'unit')).toBe(true);
  });
  it('hideNext προσθέτει και αφαιρεί χωρίς διπλά', () => {
    const a = hideNext({}, 'guard.who', true); expect(hideNext({ hide: a }, 'guard.who', true)).toEqual(['guard.who']);
    expect(hideNext({ hide: a }, 'guard.who', false)).toEqual([]);
  });
});

const page = (hide: string[]) => {
  const state = fakeState(3); state.settings = { ...state.settings, hide };
  const store: any = { state, audit: [], boot: { templates: [] }, today: '2026-11-27', tomorrow: '2026-11-28', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
  const nav: any = { view: 'templates', params: { tab: 'screens' }, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  return renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, React.createElement(TemplatesScreen))));
};

describe('shown: σελίδα Ρυθμίσεων', () => {
  it('η ενότητα «Οθόνες και καρτέλες» εμφανίζεται, χωρίς γραμμή «Κρυφά τώρα» όταν όλα φαίνονται', () => {
    const out = page([]);
    expect(out).toContain('Οθόνες και καρτέλες'); expect(out).toContain('Άνοιξε όλες'); expect(out).not.toContain('Κρυφά τώρα');
    expect(out.slice(0, out.indexOf('</nav>'))).toContain('Μητρώο οπλισμού');
  });
  it('όταν κρύβεται ο Οπλισμός: γραμμή «Κρυφά τώρα» και χωρίς την ενότητα «Μητρώο οπλισμού»', () => {
    const out = page(['weapons', 'cadre.duty']);
    const nav = out.slice(out.indexOf('<nav class="setnav"'), out.indexOf('</nav>'));
    expect(out).toContain('Κρυφά τώρα'); expect(nav).toContain('Εμφάνιση'); expect(nav).not.toContain('Μητρώο οπλισμού'); expect(nav).not.toContain('Υπηρεσίες στελεχών');
  });
});
