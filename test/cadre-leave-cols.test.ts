// Στελέχη: υπόλοιπο άδειας ανά είδος (ΚΑ, ΑΜΔ…) αντί για ένα σύνολο (σχόλιο συναδέλφου, Michael)
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { leaveCols, summaries } from '../src/shared/cadreBalance';
import { CadreScreen } from '../src/renderer/screens/cadre';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const D = '2026-11-18';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'x' + ++n }).state;
function withLeave() {
  let s = run(fakeState(3), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΠΑΠΑΔΑΚΗΣ', first: 'ΓΕΩΡΓΙΟΣ' } });
  s = run(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'ka', from: '2026-03-02', to: '2026-03-06' } });
  return s;
}
const page = (state: AppState) => {
  const store: any = { state, audit: [], boot: {}, today: D, tomorrow: '2026-11-19', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
  const nav: any = { view: 'cadre', params: {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  return renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, React.createElement(CadreScreen))));
};

describe('Στελέχη: άδειες ανά είδος', () => {
  it('leaveCols: τα είδη των Ρυθμίσεων για όλους (ΚΑ, ΑΜΔ)', () => {
    const s = withLeave();
    expect(leaveCols(s, summaries(s, 2026, D)).map(q => q.id)).toEqual(['ka', 'amd']);
  });
  it('η λίστα δείχνει στήλες ΚΑ και ΑΜΔ με 25/30 και 10/10, όχι το σύνολο 35/40', () => {
    const out = page(withLeave());
    expect(out).toMatch(/cadre-lv"[^>]*>ΚΑ</);
    expect(out).toMatch(/cadre-lv"[^>]*>ΑΜΔ</);
    expect(out).toContain('>25/30<');
    expect(out).toContain('>10/10<');
    expect(out).not.toContain('35/40');
    expect(out).not.toContain('>Άδειες<');
  });
});
