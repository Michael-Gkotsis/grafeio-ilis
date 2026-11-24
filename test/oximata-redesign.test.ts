// Οχήματα (24/11, επανασχεδιασμός στο σχέδιο του Οπλισμού): γραμμή τίτλου με «?», λωρίδα μετρήσεων, γραμμές και πλαϊνή καρτέλα με καρτέλες,
// φόρμα σε ενότητες με παρελκόμενα ως λίστα (accs ↔ acc, Excel όπως πριν) και οι ενέργειες (γέμισμα, χιλιόμετρα, συντήρηση, ακινησία, οδηγός) από άκρη σε άκρη.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Asset } from '../src/shared/domain';
import { assetCfgOf, registry } from '../src/shared/assets';
import { vehicleSheets } from '../src/shared/vehicles';
import { HeldBlock, accsOf } from '../src/renderer/screens/assets';
import { VehiclesScreen, vehKpis } from '../src/renderer/screens/vehicles';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';

const D = '2026-11-24';
let n = 0;
const ctx = { today: D, newId: () => 'x' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const add = (s: AppState, cat: string, type: string, plate: string, more: Partial<Asset> = {}) => run(s, { t: 'saveAsset', asset: { cat, type, no: plate, plate, state: 'ok', ...more }, date: D });
const idOf = (s: AppState, plate: string) => s.assets!.find(a => a.plate === plate)!.id;
const rowOf = (s: AppState, plate: string) => registry(s).find(r => r.a.plate === plate)!;
const kpisOf = (s: AppState) => vehKpis(registry(s).filter(r => r.cat?.kind === 'vehicle'), s.assetLog, D, assetCfgOf(s.settings).warnDays);

function page(state: AppState, vsel?: string, held?: number) {
  (globalThis as any).window = { innerHeight: 800, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  const store: any = { state, audit: [], boot: {}, today: D, tomorrow: '2026-11-25', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
  const nav: any = { view: 'vehicles', params: vsel ? { vsel } : {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  const el = held ? React.createElement('dl', null, React.createElement(HeldBlock, { pid: held })) : React.createElement(VehiclesScreen);
  return renderToString(React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, el)));
}
// Δείγμα: 3 τροχοφόρα, 1 ερπυστριοφόρο, 1 πολιτικού τύπου· ένα σε ακινησία, ένα προς επισκευή, ένα με συντήρηση σε 10 μέρες
function sample(): AppState {
  let s = fakeState(12);
  s = add(s, 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 12345', { km: 48210, kmOn: '2026-11-20', maint: { next: '2026-12-04', every: 6 } });
  s = add(s, 'troxofora', 'HUMMER', 'ΕΣ 22871', { km: 91400 });
  s = add(s, 'erpystr', 'M113', 'ΕΣ 30411', { km: 6120 });
  s = add(s, 'politikou', 'Nissan', 'ΕΣ 40102', { km: 132900 });
  s = add(s, 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 12399', { km: 77050 });
  s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 22871'), state: 'immobile', why: 'μπαταρίες', date: D });
  s = run(s, { t: 'assetState', id: idOf(s, 'ΕΣ 30411'), state: 'repair', why: 'κιβώτιο', date: D });
  return s;
}

describe('οθόνη Οχήματα στο σχέδιο του Οπλισμού', () => {
  it('γραμμή τίτλου, ένα κύριο κουμπί, Ενέργειες, Εκτύπωση, λωρίδα μετρήσεων και γραμμές', () => {
    const h = page(sample());
    expect(h).toContain('<h1>Οχήματα</h1>'); expect(h).toContain('aria-label="Βοήθεια"');
    expect(h).toContain('+ Νέο όχημα'); expect(h).toContain('Ενέργειες'); expect(h).toContain('Εκτύπωση');
    for (const l of ['Σύνολο', 'Διαθέσιμα', 'Σε ακινησία', 'Προς επισκευή', 'Συντήρηση σε ≤30 μέρες']) expect(h).toContain('>' + l + '<');
    for (const p of ['ΕΣ 12345', 'ΕΣ 22871', 'ΕΣ 30411', 'ΕΣ 40102', 'ΕΣ 12399']) expect(h).toContain(p);
    expect(h).toContain('Τροχοφόρα'); expect(h).toContain('Ερπυστριοφόρα'); expect(h).toContain('5 οχήματα');
    expect(h).toContain('ώρ.');   // το ερπυστριοφόρο μετρά ώρες
    expect(h).not.toContain('op__card');   // χωρίς επιλογή, καμία καρτέλα
    expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
  it('μετρήσεις: Σύνολο, Διαθέσιμα, Σε ακινησία, Προς επισκευή, Συντήρηση σε ≤30 μέρες', () => {
    expect(kpisOf(sample())).toMatchObject({ total: 5, avail: 3, immobile: 1, repair: 1, due: 1 });
    const h = page(sample());
    expect(h).toMatch(/op__kpi-n">5<\/span><span class="op__kpi-l">Σύνολο/); expect(h).toMatch(/op__kpi-n">3<\/span><span class="op__kpi-l">Διαθέσιμα/);
    expect(h).toMatch(/op__kpi-n">1<\/span><span class="op__kpi-l">Σε ακινησία/); expect(h).toMatch(/op__kpi-n">1<\/span><span class="op__kpi-l">Προς επισκευή/);
    expect(h).toMatch(/op__kpi-n">1<\/span><span class="op__kpi-l">Συντήρηση σε ≤30 μέρες/);
  });
  it('χωρίς οχήματα: λέει τι να κάνεις· χωρίς κατηγορίες οχημάτων προσφέρει τις προεπιλεγμένες', () => {
    expect(page(fakeState(2))).toContain('Δεν υπάρχει ακόμα όχημα. Πάτα «+ Νέο όχημα».');
    const s = fakeState(2); s.settings = { ...s.settings, assets: { ...(s.settings.assets || {}), cats: assetCfgOf(s.settings).cats.filter(c => c.kind !== 'vehicle') } };
    expect(page(s)).toContain('Πρόσθεσε Τροχοφόρα');
  });
  it('πλαϊνή καρτέλα (από τον σύνδεσμο της καρτέλας ατόμου): Στοιχεία / Καύσιμα / Ιστορικό, ↑/↓ και όλες οι ενέργειες', () => {
    const s = sample(); const h = page(s, rowOf(s, 'ΕΣ 12345').key);
    expect(h).toContain('data-asset-card'); expect(h).toContain('ΜΑΝ 6t · ΕΣ 12345'); expect(h).toContain('↑/↓ ');
    for (const l of ['Στοιχεία', 'Καύσιμα / Χιλιόμετρα (0)', 'Ιστορικό (']) expect(h).toContain(l);
    for (const b of ['+ Γέμισμα…', '+ Χιλιόμετρα…', 'Έγινε συντήρηση…', 'Αλλαγή…', 'Ενέργειες']) expect(h).toContain(b);
    expect(h).toContain('48.210'); expect(h).toContain('04/12/2026');
    expect(page(s, rowOf(s, 'ΕΣ 30411').key)).toContain('+ Ώρες…');   // ερπυστριοφόρο: ώρες κινητήρα
  });
});

describe('ενέργειες: γέμισμα, χιλιόμετρα, συντήρηση, ακινησία, οδηγός ενημερώνουν την καρτέλα', () => {
  it('γέμισμα: λίτρα και χιλιόμετρα στο όχημα και στο ιστορικό', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12345');
    s = run(s, { t: 'assetFuel', id, date: D, litres: 85, km: 48500 });
    const a = rowOf(s, 'ΕΣ 12345').a; expect(a.km).toBe(48500); expect(a.kmOn).toBe(D);
    expect(s.assetLog!.find(e => e.what === 'fuel')).toMatchObject({ aid: id, litres: 85, km: 48500 });
    const h = page(s, rowOf(s, 'ΕΣ 12345').key);
    expect(h).toContain('48.500'); expect(h).toContain('τελευταίο γέμισμα 24/11 · 85 λίτρα'); expect(h).toContain('Καύσιμα / Χιλιόμετρα (1)');
  });
  it('χιλιόμετρα: ένδειξη στην καρτέλα και «σε κίνηση» στη μέτρηση', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12399');
    s = run(s, { t: 'assetKm', id, date: D, km: 77100 });
    expect(rowOf(s, 'ΕΣ 12399').a.km).toBe(77100); expect(kpisOf(s).moving).toBe(1);
    expect(page(s, rowOf(s, 'ΕΣ 12399').key)).toContain('77.100');
  });
  it('συντήρηση: ημερομηνία και km, επόμενη, και φεύγει από τις «προς συντήρηση»', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12345');
    s = run(s, { t: 'assetMaint', id, date: D, km: 48210 });
    expect(rowOf(s, 'ΕΣ 12345').a.maint).toMatchObject({ last: D, next: '2027-05-24', lastKm: 48210, nextKm: 53210 });
    expect(kpisOf(s).due).toBe(0);
    const h = page(s, rowOf(s, 'ΕΣ 12345').key); expect(h).toContain('24/11/2026'); expect(h).toContain('53.210');
  });
  it('ακινησία και επανήλθε: οι μετρήσεις ακολουθούν', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12399');
    s = run(s, { t: 'assetState', id, state: 'immobile', why: 'ανταλλακτικό', date: D });
    expect(kpisOf(s)).toMatchObject({ avail: 2, immobile: 2 });
    s = run(s, { t: 'assetState', id, state: 'ok', date: D });
    expect(kpisOf(s)).toMatchObject({ avail: 3, immobile: 1 });
  });
  it('οδηγός: στην καρτέλα του οχήματος και στα Χρεωμένα της καρτέλας του ατόμου (και «οδηγός» στο όνομα)', () => {
    let s = sample();
    s = run(s, { t: 'assetDriver', id: idOf(s, 'ΕΣ 12345'), date: D, driver: { k: 'person', pid: 3 } });
    expect(rowOf(s, 'ΕΣ 12345').a.driver).toEqual({ k: 'person', pid: 3 });
    expect(page(s, rowOf(s, 'ΕΣ 12345').key)).toContain('ΥΠΟΘΕΤΙΔΗΣ');   // ο 3ος του fixture
    const held = page(s, undefined, 3); expect(held).toContain('ΕΣ 12345'); expect(held).toContain('(οδηγός)');
    s = run(s, { t: 'assetDriver', id: idOf(s, 'ΕΣ 12345'), date: D, driver: null });
    expect(page(s, undefined, 3)).not.toContain('ΕΣ 12345');
  });
  it('χρέωση και σβήσιμο: μία αναίρεση η κάθε ενέργεια', () => {
    let s = sample(); const id = idOf(s, 'ΕΣ 12399');
    s = run(s, { t: 'assetHolder', id, holder: { k: 'unit', name: '50 ΕΜΑ' }, date: D });
    expect(rowOf(s, 'ΕΣ 12399').a.holder).toEqual({ k: 'unit', name: '50 ΕΜΑ' });
    s = run(s, { t: 'deleteAsset', id });
    expect(kpisOf(s).total).toBe(4);
  });
});

describe('φόρμα: παρελκόμενα ως λίστα, νέος τύπος, Excel όπως πριν', () => {
  it('παρελκόμενα με ποσότητα: accs και acc σε sync, και το Excel τα γράφει με κεφαλαία', () => {
    const s = add(fakeState(2), 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 1', { accs: [{ name: 'Πυροσβεστήρας', qty: 2 }, { name: 'Τρίγωνο', qty: 1 }], acc: 'ΠΑΛΙΟ' });
    const a = s.assets![0];
    expect(a.accs).toEqual([{ name: 'Πυροσβεστήρας', qty: 2 }, { name: 'Τρίγωνο', qty: 1 }]); expect(a.acc).toBe('2 Πυροσβεστήρας, Τρίγωνο');
    expect(accsOf(a)).toEqual(a.accs);
    expect(JSON.stringify(vehicleSheets(s, D))).toContain('2 ΠΥΡΟΣΒΕΣΤΗΡΑΣ, ΤΡΙΓΩΝΟ');
  });
  it('παλιό όχημα μόνο με κείμενο acc: τα checkboxes γεμίζουν από το κείμενο και το Excel μένει ίδιο', () => {
    const s = add(fakeState(2), 'troxofora', 'ΜΑΝ 6t', 'ΕΣ 2', { acc: 'τρίγωνο, πυροσβεστήρας, φαρμακείο' });
    expect(accsOf(s.assets![0])).toEqual([{ name: 'τρίγωνο', qty: 1 }, { name: 'πυροσβεστήρας', qty: 1 }, { name: 'φαρμακείο', qty: 1 }]);
    expect(JSON.stringify(vehicleSheets(s, D))).toContain('ΤΡΙΓΩΝΟ, ΠΥΡΟΣΒΕΣΤΗΡΑΣ, ΦΑΡΜΑΚΕΙΟ');
  });
  it('«+ Νέος τύπος…»: μπαίνει και στη λίστα της κατηγορίας, χωρίς διπλογραφή', () => {
    let s = run(fakeState(2), { t: 'saveAsset', asset: { cat: 'troxofora', type: 'ΙΣΑ 4x4', no: 'ΕΣ 9', plate: 'ΕΣ 9', state: 'ok' }, date: D, addType: true });
    expect(s.settings.assets!.cats!.find(c => c.id === 'troxofora')!.types).toContain('ΙΣΑ 4x4');
    s = run(s, { t: 'saveAsset', asset: { cat: 'troxofora', type: 'ισα 4x4', no: 'ΕΣ 8', plate: 'ΕΣ 8', state: 'ok' }, date: D, addType: true });
    expect(s.settings.assets!.cats!.find(c => c.id === 'troxofora')!.types.filter(t => t.toLowerCase() === 'ισα 4x4').length).toBe(1);
  });
  it('δεν σπάει με παλιά δεδομένα: όχημα χωρίς πινακίδα ή χωρίς κατηγορία', () => {
    let s = add(sample(), 'troxofora', 'Παλιό', '', { plate: undefined, no: 'ΠΑΛ-1' });
    s = { ...s, assets: [...s.assets!, { id: 'zz', cat: 'xxx', type: 'Άγνωστο', no: 'Ζ1', state: 'ok' } as Asset] };
    expect(() => page(s)).not.toThrow(); expect(page(s)).not.toMatch(/undefined|\[object|NaN/);
  });
});
