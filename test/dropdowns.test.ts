// Ενιαίες λίστες επιλογής (Michael, 20/10): όλες οι οθόνες με το Select και το Combo (src/renderer/select.ts),
// όχι με το <select> ή το <datalist> των Windows, που δεν παίρνουν το στυλ και το σκοτεινό θέμα της εφαρμογής
//
// Phase 0.4: the old test listed src/renderer/**/*.ts and exempted the file named `select.ts`. Now (1) what the screens and
// dialogs render has no native list, (2) the Select/Combo components render their own markup, and (3) the source rule
// stays as a scan over .ts/.tsx/.jsx that finds the exempt files by what they export (Select, Combo), not by name.
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import * as H from './support/screens-harness';
import { loadWorld, type BehaviourWorld } from './support/behaviour';
import { renderEverything } from './support/all-markup';
import { definersOf, readSources } from './support/source-scan';
import { Combo, Select } from '../src/renderer/select';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let bw: BehaviourWorld;
beforeAll(async () => { bw = await loadWorld(); });

const NATIVE = /<select[\s>]|<datalist[\s>]/;

describe('λίστες επιλογής', () => {
  it('καμία οθόνη δεν φτιάχνει <select> ή <datalist> μόνη της', () => {
    const sources = readSources();
    // Select and Combo are the only code that may NAME the native elements (their comments explain what they replace)
    const own = [...definersOf(sources, 'Select'), ...definersOf(sources, 'Combo')];
    expect(own.length).toBeGreaterThan(0);
    const bad = sources.filter(s => !own.includes(s)).filter(s => NATIVE.test(s.text));
    expect(bad.map(s => s.rel)).toEqual([]);
  });
  it('ό,τι εμφανίζουν οι οθόνες και τα παράθυρα δεν έχει <select> ή <datalist>', () => {
    const bad = renderEverything(bw).filter(x => NATIVE.test(x.html)).map(x => x.name);
    expect(bad).toEqual([]);
  });
  it('Select και Combo γράφουν δικό τους κουμπί και πεδίο, όχι λίστα των Windows', () => {
    const options = [createElement('option', { key: 'a', value: 'a' }, 'Πρώτο'), createElement('option', { key: 'b', value: 'b' }, 'Δεύτερο')];
    const select = H.renderIn(bw.world, 'home', {}, createElement(Select as never, { value: 'b', onChange: () => {} }, options));
    expect(select).not.toMatch(NATIVE); expect(select).toContain('Δεύτερο');
    expect(select).toMatch(/<button/); expect(select).not.toContain('Πρώτο');   // closed: only the chosen value shows
    const combo = H.renderIn(bw.world, 'home', {}, createElement(Combo as never, { value: 'x', onChange: () => {}, options: [{ value: 'a', label: 'Α' }] }));
    expect(combo).not.toMatch(NATIVE); expect(combo).toMatch(/<input/);
  });
});
