// Σήμανση ΕΚΕ, εκπαίδευση ειδικότητας (Michael, 24/11, λειτουργία μονάδας): εντολή με αναίρεση, κατάσταση ανά μέρα, σήμα και φίλτρο
// στους Στρατιώτες, φίλτρο και στήλες στα Έντυπα (και με τυχαίες φόρμες), τίποτα στη λειτουργία κέντρου. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import { cleanEke, ekeBadge, ekeState, ekeWhy } from '../src/shared/mode';
import { rosterMatch } from '../src/shared/rosterLists';
import { DATE_FIELDS, FIELDS, candidates, defaultPick, fieldValue, guessField, pickText, type RepPick, type Report, type Row } from '../src/shared/reports';
import { dmy } from '../src/shared/dates';
import { Store } from '../src/main/db';
import { fillReport, inspectTemplate } from '../src/main/reports';
import { previewOf } from '../src/main/formPreview';
import { Workbook } from '../src/main/xlsx';
import { PeopleScreen } from '../src/renderer/screens/people';
import { PersonalTab } from '../src/renderer/screens/personal';
import { NavCtx, StoreCtx } from '../src/renderer/store';
import { fakeState } from './fixtures';
import { genReport, chance, int, pick, rng, shuffle } from './tplgen';

// η οθόνη Στρατιώτες διαβάζει το ρολόι της εφαρμογής (useSyncExternalStore): στον διακομιστή του τεστ δίνουμε μία σταθερή ώρα
vi.mock('../src/renderer/clock', async orig => ({ ...(await orig<typeof import('../src/renderer/clock')>()), useNowMin: () => 600 }));

const D = '2026-11-24';
let n = 0;
const ctx = { today: D, newId: () => 'e' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const unit = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, mode: 'unit' } });
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const ids = (s: AppState, pk: Partial<RepPick>, day = D, kind: 'people' | 'cadre' | 'status' | 'duty' = 'people') =>
  candidates(s, { kind, pick: { from: 'all', mode: 'all', ...pk } as RepPick }, day).map(x => (x as { id: number }).id).sort((a, b) => a - b);

// 1: τρέχει (ως 12/12) · 2: ανοιχτό έως · 3: αρχίζει αργότερα · 4: μόνο έως · 5: έληξε · 6, 7: τίποτα
function world(): AppState {
  const s = unit(fakeState(7)); const e: Record<number, Person['eke']> = {
    1: { from: '2026-11-02', to: '2026-12-12' }, 2: { from: '2026-11-02' }, 3: { from: '2026-12-07', to: '2026-12-20' }, 4: { to: '2026-12-01' }, 5: { from: '2026-10-01', to: '2026-10-31' } };
  return { ...s, people: s.people.map(p => (e[p.id] ? { ...p, eke: e[p.id] } : p)) };
}

describe('ΕΚΕ: κατάσταση ανά μέρα', () => {
  const st = (eke: Person['eke'], day: string) => ekeState({ eke }, day);
  it('μέσα: από ≤ μέρα ≤ έως, και τα δύο άκρα μέσα', () => {
    expect(st({ from: '2026-11-02', to: '2026-12-12' }, '2026-11-24')).toBe('now');
    expect(st({ from: '2026-11-02', to: '2026-12-12' }, '2026-11-02')).toBe('now');
    expect(st({ from: '2026-11-02', to: '2026-12-12' }, '2026-12-12')).toBe('now');
  });
  it('ανοιχτό έως: ισχύει από την ημέρα έναρξης και για πάντα', () => {
    expect(st({ from: '2026-11-02' }, '2026-11-02')).toBe('now');
    expect(st({ from: '2026-11-02' }, '2030-01-01')).toBe('now');
    expect(st({ from: '2026-11-02' }, '2026-11-01')).toBe('soon');
  });
  it('μελλοντικό: soon πριν την ημέρα έναρξης', () => {
    expect(st({ from: '2026-12-07', to: '2026-12-20' }, '2026-11-24')).toBe('soon');
    expect(st({ from: '2026-12-07', to: '2026-12-20' }, '2026-12-06')).toBe('soon');
    expect(st({ from: '2026-12-07', to: '2026-12-20' }, '2026-12-07')).toBe('now');
  });
  it('ληγμένο: none την επόμενη του έως', () => {
    expect(st({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31')).toBe('now');
    expect(st({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-01')).toBe('none');
  });
  it('μόνο «έως»: από την αρχή, μόνο now ως το έως (ποτέ soon)', () => {
    expect(st({ to: '2026-12-01' }, '1999-01-01')).toBe('now');
    expect(st({ to: '2026-12-01' }, '2026-12-01')).toBe('now');
    expect(st({ to: '2026-12-01' }, '2026-12-02')).toBe('none');
  });
  it('χωρίς ΕΚΕ (ή κενό αντικείμενο): none', () => {
    expect(st(undefined, D)).toBe('none');
    expect(st({}, D)).toBe('none');
  });
  it('σήμα: μπλε όσο διαρκεί, γκρι αν αρχίζει, «ΕΚΕ» χωρίς έως, τίποτα όταν έληξε', () => {
    const b = (eke: Person['eke']) => ekeBadge({ eke }, D);
    expect(b({ from: '2026-11-02', to: '2026-12-12' })).toEqual({ text: 'ΕΚΕ έως 12/12', now: true });
    expect(b({ from: '2026-12-07', to: '2026-12-20' })).toEqual({ text: 'ΕΚΕ από 07/12', now: false });
    expect(b({ from: '2026-11-02' })).toEqual({ text: 'ΕΚΕ', now: true });
    expect(b({ from: '2026-10-01', to: '2026-10-31' })).toBeNull();
    expect(b(undefined)).toBeNull();
  });
  it('έλεγχος: μορφή, υπαρκτή μέρα, από ≤ έως', () => {
    expect(ekeWhy('2026-11-02', '2026-11-02')).toBe('');
    expect(ekeWhy(undefined, '2026-11-02')).toBe('');
    expect(ekeWhy('2026-12-01', '2026-11-30')).toMatch(/Έως/);
    expect(ekeWhy('2026-13-01')).toMatch(/Λάθος/);
    expect(ekeWhy('2026-02-30')).toMatch(/Λάθος/);
    expect(ekeWhy('24/11/2026')).toMatch(/Λάθος/);
    expect(cleanEke('', undefined)).toBeUndefined();
    expect(cleanEke('2026-11-02', '')).toEqual({ from: '2026-11-02' });
  });
});

describe('ΕΚΕ: εντολή setEke', () => {
  it('βάζει, αντικαθιστά (ένα διάστημα ανά άτομο) και αφαιρεί με κενό', () => {
    let s = run(fakeState(3), { t: 'setEke', pid: 2, from: '2026-11-02', to: '2026-12-12' });
    expect(s.people[1].eke).toEqual({ from: '2026-11-02', to: '2026-12-12' });
    expect(s.people[0].eke).toBeUndefined();
    s = run(s, { t: 'setEke', pid: 2, from: '2026-12-20' });
    expect(s.people[1].eke).toEqual({ from: '2026-12-20' });   // αντικαταστάθηκε, δεν συγχωνεύτηκε με το παλιό έως
    s = run(s, { t: 'setEke', pid: 2 });
    expect('eke' in s.people[1]).toBe(false);
  });
  it('μόνο το άτομο αλλάζει: ούτε ειδικότητα, ούτε υπηρεσίες, ούτε κατάσταση, ούτε άλλο άτομο', () => {
    const s0 = unit(fakeState(4)); const s = run(s0, { t: 'setEke', pid: 3, from: D });
    expect(s.people.filter(p => p !== s0.people.find(x => x.id === p.id)).map(p => p.id)).toEqual([3]);
    expect({ ...s.people[2], eke: undefined }).toEqual({ ...s0.people[2], eke: undefined });
    expect(s.statuses).toBe(s0.statuses); expect(s.guards).toBe(s0.guards); expect(s.settings).toBe(s0.settings);
  });
  it('χωρίς αλλαγή: δεν γράφει τίποτα στο ιστορικό', () => {
    const s = run(fakeState(2), { t: 'setEke', pid: 1, from: D });
    expect(apply(s, { t: 'setEke', pid: 1, from: D }, ctx).text).toBe('');
    expect(apply(fakeState(2), { t: 'setEke', pid: 1 }, ctx).text).toBe('');
  });
  it('από > έως απορρίπτεται· λάθος μέρα και άγνωστο άτομο επίσης· το state μένει όπως ήταν', () => {
    const s = fakeState(2);
    expect(() => apply(s, { t: 'setEke', pid: 1, from: '2026-12-02', to: '2026-12-01' }, ctx)).toThrow(/Έως/);
    expect(() => apply(s, { t: 'setEke', pid: 1, from: '2026-02-31' }, ctx)).toThrow(/Λάθος/);
    expect(() => apply(s, { t: 'setEke', pid: 99, from: D }, ctx)).toThrow();
    expect(s.people[0].eke).toBeUndefined();
    expect(apply(s, { t: 'setEke', pid: 1, from: '2026-12-01', to: '2026-12-01' }, ctx).state.people[0].eke).toEqual({ from: '2026-12-01', to: '2026-12-01' });
  });
  it('κείμενο στο ιστορικό ενεργειών (dd/mm/yyyy)', () => {
    expect(apply(fakeState(2), { t: 'setEke', pid: 1, from: '2026-11-02', to: '2026-12-12' }, ctx).text).toMatch(/ΕΚΕ .*από 02\/11\/2026 έως 12\/12\/2026/);
    expect(apply(run(fakeState(2), { t: 'setEke', pid: 1, from: D }), { t: 'setEke', pid: 1 }, ctx).text).toMatch(/βγήκε από ΕΚΕ/);
  });
  it('αναίρεση και ξανά (redo) μέσα από τη βάση, και μένει αποθηκευμένο μετά το κλείσιμο, χωρίς νέο σχήμα βάσης', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gieke-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: fakeState(4).people.map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state);
    const v0 = (st as any).db.exec('PRAGMA user_version')[0]?.values[0][0];
    const cmd: Command = { t: 'setEke', pid: 2, from: '2026-11-02', to: '2026-12-12' };
    const patch = st.commit(apply(st.state, cmd, ctx).state);
    expect(st.state.people.find(p => p.id === 2)!.eke).toEqual({ from: '2026-11-02', to: '2026-12-12' });
    st.flush(); st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.people.find(p => p.id === 2)!.eke).toEqual({ from: '2026-11-02', to: '2026-12-12' });
    st.revert(patch);                                                              // αναίρεση
    expect(st.state.people.find(p => p.id === 2)!.eke).toBeUndefined();
    st.commit(apply(st.state, cmd, ctx).state);                                    // ξανά
    expect(st.state.people.find(p => p.id === 2)!.eke).toEqual({ from: '2026-11-02', to: '2026-12-12' });
    // αναίρεση της αφαίρεσης: ξαναγυρίζει το διάστημα
    const p2 = st.commit(apply(st.state, { t: 'setEke', pid: 2 }, ctx).state);
    expect(st.state.people.find(p => p.id === 2)!.eke).toBeUndefined();
    st.revert(p2);
    expect(st.state.people.find(p => p.id === 2)!.eke).toEqual({ from: '2026-11-02', to: '2026-12-12' });
    expect((st as any).db.exec('PRAGMA user_version')[0]?.values[0][0]).toBe(v0);
    st.close();
  });
  it('Νέος στρατιώτης με ΕΚΕ: μπαίνει στην καρτέλα· άκυρο διάστημα δεν τον προσθέτει', () => {
    const base = { rank: 'ΣΤΡ', spec: '', last: 'ΔΟΚΙΜΑΣ', first: 'ΝΕΟΣ', father: '', asm: '123', phone: '', room: null, si: 'Ι1', post: null, role: null, essos: '2026 Δ΄', attached: false, notes: '' };
    const s = unit(fakeState(3));
    const ok = run(s, { t: 'addPerson', person: { ...base, inOn: D, eke: { from: '2026-11-24', to: '2026-12-31' } } });
    expect(ok.people[3].eke).toEqual({ from: '2026-11-24', to: '2026-12-31' });
    const none = run(s, { t: 'addPerson', person: { ...base, eke: {} } });
    expect('eke' in none.people[3]).toBe(false);
    expect(() => apply(s, { t: 'addPerson', person: { ...base, eke: { from: '2026-12-02', to: '2026-12-01' } } }, ctx)).toThrow(/Έως/);
    expect(s.people).toHaveLength(3);
  });
  it('η διόρθωση στοιχείων (updatePerson) και η εισαγωγή Δυναμολογίου δεν τη χάνουν', () => {
    const s = world(); const p = s.people[0];
    expect(run(s, { t: 'updatePerson', person: { ...p, notes: 'x' } }).people[0].eke).toEqual(p.eke);
    const row = (({ id, active, eke, ...r }) => r)(p as Person & { eke?: unknown });
    expect(run(s, { t: 'importPeople', rows: [row], source: 't', deactivateMissing: false }).people[0].eke).toEqual(p.eke);
  });
});

describe('ΕΚΕ: λίστα Στρατιώτες', () => {
  it('rosterMatch «eke» (αποθηκευμένες λίστες): κρίνεται για τη μέρα', () => {
    const s = world();
    const m = (i: number, day?: string) => rosterMatch('eke' as never, s.people[i], [], day);
    expect([0, 1, 2, 3, 4, 5].map(i => m(i, D))).toEqual([true, true, false, true, false, false]);
    expect(m(2, '2026-12-08')).toBe(true);
    expect(m(0, '2026-12-13')).toBe(false);
    expect(m(0)).toBe(false);   // χωρίς μέρα δεν ξέρει
    expect(rosterMatch('eke' as never, { ...s.people[0], active: false }, [], D)).toBe(false);
  });
  it('αποθηκευμένη λίστα με φίλτρο eke μπαίνει στα Έντυπα (view) με τη μέρα του εντύπου', () => {
    const s = world(); const t = { ...s, settings: { ...s.settings, views: [{ id: 'v1', name: 'ΕΚΕ', unit: 'all', room: null, filter: 'eke', q: '' }] } };
    expect(ids(t, { view: 'v1' }, D)).toEqual([1, 2, 4]);
    expect(ids(t, { view: 'v1' }, '2026-12-08')).toEqual([1, 2, 3]);   // ο 4 έληξε στις 01/12
  });
  const store = (state: AppState): any => ({ state, audit: [], boot: {}, today: D, tomorrow: '2026-11-25', run: async () => null, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} });
  const nav: any = { view: 'people', params: {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  const page = (state: AppState, C: React.ComponentType<any>, props: object = {}) => {
    const g = globalThis as any; const had = g.window;
    g.window = { innerHeight: 800, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
    try { return renderToString(React.createElement(StoreCtx.Provider, { value: store(state) }, React.createElement(NavCtx.Provider, { value: nav }, React.createElement(C, props)))); }
    finally { if (had === undefined) delete g.window; else g.window = had; }
  };
  it('φίλτρο «Σε ΕΚΕ (N)» μόνο σε μονάδα και μόνο όταν N > 0', () => {
    const on = page(world(), PeopleScreen);
    expect(on).toMatch(/Σε ΕΚΕ<span class="cnt">3<\/span>/);   // 1, 2, 4 είναι τώρα σε ΕΚΕ (ο 3 αρχίζει αργότερα, ο 5 έληξε)
    expect(page(fakeState(7), PeopleScreen)).not.toContain('Σε ΕΚΕ');
    const centre = { ...world(), settings: { ...world().settings, mode: 'centre' as const } };
    expect(page(centre, PeopleScreen)).not.toContain('Σε ΕΚΕ');
    const only = unit(fakeState(7)); const future = { ...only, people: only.people.map(p => (p.id === 3 ? { ...p, eke: { from: '2026-12-07' } } : p)) };
    expect(page(future, PeopleScreen)).not.toContain('Σε ΕΚΕ<span');   // μόνο μελλοντικά: κανείς τώρα, χωρίς φίλτρο
  });
  it('σήμα δίπλα στο όνομα: μπλε (info) όσο διαρκεί, γκρι αν αρχίζει, τίποτα όταν έληξε· όχι στο κέντρο', () => {
    const on = page(world(), PeopleScreen);
    expect(on).toContain('ui-badge ui-badge--info">ΕΚΕ έως 12/12<');
    expect(on).toContain('ui-badge">ΕΚΕ από 07/12<');
    expect(on).toContain('ui-badge ui-badge--info">ΕΚΕ<');
    expect(on).not.toContain('ΕΚΕ έως 31/10');
    const centre = { ...world(), settings: { ...world().settings, mode: 'centre' as const } };
    expect(page(centre, PeopleScreen)).not.toContain('ΕΚΕ έως');
  });
  it('καρτέλα › Προσωπικά: checkbox και Από/Έως μόνο σε μονάδα και μόνο για στρατιώτη, με τη σημείωση', () => {
    const s = world(); const t = (state: AppState, who: object, rec: object) => page(state, PersonalTab, { who, rec });
    const u = t(s, { pid: 1 }, s.people[0]);
    expect(u).toContain('Σε ΕΚΕ (εκπαίδευση ειδικότητας)');
    expect(u).toContain('Μόνο για να ξέρουμε και να το βγάζεις στα Έντυπα. Δεν αλλάζει υπηρεσίες, έξοδο ή ΗΚΑΙ.');
    expect(u).toContain('02/11/2026'); expect(u).toContain('12/12/2026');   // Από και Έως όπως τα έγραψες
    const off = t(s, { pid: 6 }, s.people[5]);
    expect(off).toContain('Σε ΕΚΕ (εκπαίδευση ειδικότητας)'); expect(off).not.toContain('pr-eke-from');   // χωρίς ΕΚΕ: μόνο το checkbox
    const centre = { ...s, settings: { ...s.settings, mode: 'centre' as const } };
    expect(t(centre, { pid: 1 }, s.people[0])).not.toContain('ΕΚΕ');
    const cad = { id: 'c1', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΗ', first: 'ΕΛΕΝΗ', active: true };
    expect(t(s, { cid: 'c1' }, cad)).not.toContain('ΕΚΕ');
  });
});

describe('ΕΚΕ: Έντυπα (στρατιώτες)', () => {
  const FOUR = ['people', 'status', 'duty', 'weapon', 'wmove'] as const;
  it('στήλες ΕΚΕ ΑΠΟ / ΕΚΕ ΕΩΣ σε κάθε είδος με στρατιώτη, με κεφαλαία επικεφαλίδες, και όχι στα στελέχη', () => {
    for (const k of FOUR) { const f = FIELDS[k].filter(x => x.k === 'ekeFrom' || x.k === 'ekeTo'); expect(f.map(x => x.head), k).toEqual(['ΕΚΕ ΑΠΟ', 'ΕΚΕ ΕΩΣ']); for (const x of f) expect(x.head).toBe(x.head.toUpperCase()); }
    expect(FIELDS.blank.map(x => x.k)).toEqual(expect.arrayContaining(['ekeFrom', 'ekeTo']));
    expect(FIELDS.cadre.map(x => x.k)).not.toContain('ekeFrom');
    expect(DATE_FIELDS.has('ekeFrom') && DATE_FIELDS.has('ekeTo')).toBe(true);   // στο Excel πραγματική ημερομηνία, όπως η ημερομηνία εισαγωγής
  });
  it('τιμές dd/mm/yyyy, κενό όταν λείπει (και «έως» κενό όταν είναι ανοιχτό)', () => {
    const s = world(); const v = (i: number, f: string) => fieldValue(s, 'people', s.people[i] as Row, f, i, D);
    expect(v(0, 'ekeFrom')).toBe('02/11/2026'); expect(v(0, 'ekeTo')).toBe('12/12/2026');
    expect(v(1, 'ekeFrom')).toBe('02/11/2026'); expect(v(1, 'ekeTo')).toBe('');
    expect(v(3, 'ekeFrom')).toBe(''); expect(v(3, 'ekeTo')).toBe('01/12/2026');
    expect(v(5, 'ekeFrom')).toBe(''); expect(v(5, 'ekeTo')).toBe('');
    expect(v(4, 'ekeTo')).toBe('31/10/2026');   // ληγμένο: η στήλη δείχνει ό,τι γράφτηκε, όχι την κατάσταση
  });
  it('αυτόματη αναγνώριση επικεφαλίδων', () => {
    expect(guessField('people', 'ΕΚΕ ΑΠΟ')).toBe('ekeFrom'); expect(guessField('people', 'ΕΚΕ ΕΩΣ')).toBe('ekeTo');
    expect(guessField('people', 'ΕΚΕ Έως')).toBe('ekeTo'); expect(guessField('status', 'ΕΚΕ Από')).toBe('ekeFrom');
    expect(guessField('people', 'ΕΩΣ')).not.toBe('ekeTo'); expect(guessField('people', 'ΑΠΟ')).not.toBe('ekeFrom');
  });
  it('φίλτρο pk.eke in/out κρίνεται για τη ΜΕΡΑ ΤΟΥ ΕΝΤΥΠΟΥ', () => {
    const s = world();
    expect(ids(s, {})).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ids(s, { eke: 'in' }, D)).toEqual([1, 2, 4]);
    expect(ids(s, { eke: 'out' }, D)).toEqual([3, 5, 6, 7]);
    expect(ids(s, { eke: 'in' }, '2026-12-08')).toEqual([1, 2, 3]);               // ο 3 άρχισε, ο 4 έληξε
    expect(ids(s, { eke: 'in' }, '2026-12-13')).toEqual([2, 3]);                  // έληξαν ο 1 και ο 4
    expect(ids(s, { eke: 'in' }, '2026-10-15')).toEqual([4, 5]);                  // ο 4 (μόνο έως) και ο 5 (τότε μέσα)
    // το in και το out χωρίζουν τους ενεργούς στα δύο, κάθε μέρα
    for (const d of ['2026-10-15', '2026-11-01', D, '2026-12-08', '2026-12-13', '2027-03-01']) expect([...ids(s, { eke: 'in' }, d), ...ids(s, { eke: 'out' }, d)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('συνδυάζεται με τα άλλα φίλτρα (ειδικότητα, θάλαμος, λίστα, ποτέ/πάντα)', () => {
    const s = world(); s.people[0].eid = 'ΟΔΗΓΟΣ'; s.people[1].eid = 'ΜΑΓΕΙΡΑΣ'; s.people[5].eid = 'ΟΔΗΓΟΣ';
    expect(ids(s, { eke: 'in', eids: ['ΟΔΗΓΟΣ'] })).toEqual([1]);
    expect(ids(s, { eke: 'out', eids: ['ΟΔΗΓΟΣ'] })).toEqual([6]);
    expect(ids(s, { eke: 'in', rooms: [s.people[1].room!] }).every(i => [1, 2, 4].includes(i))).toBe(true);
    expect(ids(s, { eke: 'in', never: [1] })).toEqual([2, 4]);
  });
  it('και τα είδη με μία γραμμή ανά στρατιώτη/όπλο/θέση ακολουθούν το φίλτρο', () => {
    let s = world(); s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [1, 3, 6], from: D, to: '2026-11-30' } });
    const pids = (kind: 'status', pk: Partial<RepPick>) => candidates(s, { kind, pick: { from: 'all', mode: 'all', cats: ['abs'], ...pk } as RepPick }, D).map(x => (x as unknown as { pid: number }).pid).sort();
    expect(pids('status', {})).toEqual([1, 3, 6]);
    expect(pids('status', { eke: 'in' })).toEqual([1]);
    expect(pids('status', { eke: 'out' })).toEqual([3, 6]);
  });
  it('στη λειτουργία κέντρου το φίλτρο δεν εφαρμόζεται (δεν φαίνεται, άρα δεν πρέπει να κόβει κανέναν)', () => {
    const centre = { ...world(), settings: { ...world().settings, mode: 'centre' as const } };
    expect(ids(centre, { eke: 'in' })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ids(centre, { eke: 'out' })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pickText({ kind: 'people', pick: { from: 'all', mode: 'all', eke: 'in' } }, centre)).not.toMatch(/ΕΚΕ/);
  });
  it('τα στελέχη δεν επηρεάζονται από το φίλτρο ΕΚΕ', () => {
    const s = world(); s.cadreList = [{ id: 'a', last: 'Α', first: 'Ν', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', active: true }, { id: 'b', last: 'Β', first: 'Ν', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', active: true }] as AppState['cadreList'];
    const c = (pk: Partial<RepPick>) => candidates(s, { kind: 'cadre', pick: { from: 'all', mode: 'all', ...pk } as RepPick }, D).length;
    expect(c({})).toBe(2); expect(c({ eke: 'in' })).toBe(2); expect(c({ eke: 'out' })).toBe(2);
    expect(pickText({ kind: 'cadre', pick: { from: 'all', mode: 'all', eke: 'in' } }, s)).not.toMatch(/ΕΚΕ/);
  });
  it('η περιγραφή «ποιοι μπαίνουν» το λέει (στρατιώτες, και στις θέσεις υπηρεσίας/κινήσεις όπλων)', () => {
    const s = world(); const t = (kind: 'people' | 'duty' | 'wmove' | 'weapon', eke: 'in' | 'out') => pickText({ kind, pick: { ...defaultPick(), eke } }, s);
    expect(t('people', 'in')).toContain('μόνο σε ΕΚΕ'); expect(t('people', 'out')).toContain('χωρίς ΕΚΕ');
    for (const k of ['duty', 'wmove', 'weapon'] as const) expect(t(k, 'in'), k).toContain('μόνο σε ΕΚΕ');
  });
  it('οι θέσεις υπηρεσίας και οι κινήσεις όπλων ΦΙΛΤΡΑΡΟΝΤΑΙ όταν υπάρχει pk.eke (όπως pk.eids), όχι μόνο τα ονόματα', () => {
    const s = (() => { const w = apply(world(), { t: 'autofill', date: D }, ctx).state; return w; })();
    const all = candidates(s, { kind: 'duty', pick: { from: 'all', mode: 'all' } }, D) as unknown as { pid: number | null }[];
    const inn = candidates(s, { kind: 'duty', pick: { from: 'all', mode: 'all', eke: 'in' } }, D) as unknown as { pid: number | null }[];
    const eke = new Set([1, 2, 4]);
    expect(inn.every(r => r.pid != null && eke.has(r.pid))).toBe(true);
    expect(inn.length).toBeLessThanOrEqual(all.length);
  });
  it('το φίλτρο μπαίνει και στο «Ν τυχαίοι»: setMode κρατά pk.eke (πηγή)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/screens/reports.ts'), 'utf8');
    expect(src).toContain('eids: pk.eids, eke: pk.eke');
    expect(src).toMatch(/soldiers && isUnit\(state\.settings\) && html`<div data-eke="">/);   // το φίλτρο δεν φαίνεται σε κέντρο και στα στελέχη
    const draw = candidates(world(), { kind: 'people', pick: { ...defaultPick('random'), need: undefined, not: undefined, eke: 'in', n: 2 } }, D).map(x => (x as { id: number }).id);
    expect(draw.every(i => [1, 2, 4].includes(i))).toBe(true);
  });
});

// Τυχαίες φόρμες διαφορετικού σχήματος (tplgen.ts): οι στήλες ΕΚΕ ΑΠΟ/ΕΩΣ και το φίλτρο δουλεύουν όπου κι αν είναι οι στήλες, και η προεπισκόπηση
// είναι πάντα το αρχείο που βγαίνει τη στιγμή που ρωτάς (όταν αλλάζει η ΕΚΕ ή το φίλτρο, αλλάζει και η προεπισκόπηση)
describe('ΕΚΕ: τυχαίες φόρμες και προεπισκοπήσεις', () => {
  const N = Number(process.env.FUZZ_N || 12);
  const DAYS = ['2026-10-15', '2026-11-01', D, '2026-12-08', '2026-12-13'];
  const norm = (v: unknown) => (v == null ? '' : String(v).trim());
  // το πρότυπο της τυχαίας φόρμας με δύο στήλες ΕΚΕ δεξιά από τις υπάρχουσες, με επικεφαλίδες όπως τις γράφει ο χρήστης
  async function withEke(seed: number, r: () => number) {
    const gen = await genReport(seed * 17 + 3);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(gen.buf as unknown as ArrayBuffer);
    const insp0 = await inspectTemplate(gen.buf, 'people');
    const ws = wb.getWorksheet(insp0.sheet)!; const last = Math.max(...insp0.headers.map(h => h.c));
    const wordsA = ['ΕΚΕ ΑΠΟ', 'ΕΚΕ Από', 'ΕΚΕ από'], wordsB = ['ΕΚΕ ΕΩΣ', 'ΕΚΕ Έως', 'ΕΚΕ έως'];
    const gap = int(r, 1, 2); const cA = last + gap, cB = cA + 1;
    const put = (c: number, t: string) => { const x = ws.getCell(insp0.head, c); x.value = t; x.font = { name: 'Arial', size: 11, bold: true }; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; };
    put(cA, pick(r, wordsA)); put(cB, pick(r, wordsB));
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const insp = await inspectTemplate(buf, 'people');
    return { gen, buf, insp, cA, cB };
  }
  const reportOf = (insp: Awaited<ReturnType<typeof inspectTemplate>>, pk: Partial<RepPick>): Report => ({ id: 'r', name: 'Αγγαρεία', tpl: 't', kind: 'people', sheet: insp.sheet, head: insp.head, cells: [], title: 'ΑΓΓΑΡΕΙΑ',
    cols: insp.headers.filter(h => h.f).map(h => ({ c: h.c, f: h.f!, h: h.text })), pick: { from: 'all', mode: 'all', ...pk } as RepPick, sort: 'name', day: 'today', out: 'file' });
  const S0 = (() => { const s = unit(fakeState(30)); return { ...s, people: s.people.map(p => {
    const k = p.id % 6; const e = [{ from: '2026-11-02', to: '2026-12-12' }, { from: '2026-11-02' }, { from: '2026-12-07', to: '2026-12-20' }, { to: '2026-12-01' }, { from: '2026-10-01', to: '2026-10-31' }, undefined][k];
    return e ? { ...p, eke: e } : p; }) }; })();

  for (let seed = 1; seed <= N; seed++) {
    it('φόρμα #' + seed + ': στήλες και φίλτρο σωστά στο αρχείο, ό,τι κι αν είναι η διάταξη', async () => {
      const r = rng(seed * 313); const { gen, buf, insp, cA, cB } = await withEke(seed, r); const why = gen.desc.join(' · ');
      expect(insp.headers.find(h => h.c === cA)?.f, why + ' ΕΚΕ ΑΠΟ').toBe('ekeFrom');
      expect(insp.headers.find(h => h.c === cB)?.f, why + ' ΕΚΕ ΕΩΣ').toBe('ekeTo');
      const day = pick(r, DAYS); const eke = pick(r, ['in', 'out', undefined] as const);
      const rep = reportOf(insp, { eke }); const rows = candidates(S0, rep, day);
      const want = S0.people.filter(p => p.active && (eke ? (ekeState(p, day) === 'now') === (eke === 'in') : true));
      expect(rows.map(x => (x as { id: number }).id).sort((a, b) => a - b), why).toEqual(want.map(p => p.id).sort((a, b) => a - b));
      const take = shuffle(r, rows).slice(0, int(r, 1, 15)); const sel = take.map(x => (x as { id: number }).id);
      const res = await fillReport(buf, S0, rep, sel, day);
      const book = await Workbook.open(res.data); const grid = await book.values(insp.sheet, 200, 40);
      // κάθε στρατιώτης στη γραμμή του: το «Από» και το «Έως» του, είτε ως πραγματική ημερομηνία (πραγματική ημερομηνία του Excel) είτε κενό
      const byLast = new Map(S0.people.map(p => [p.last, p]));
      let seen = 0;
      for (let i = 0; i < grid.length; i++) {
        const lastCol = insp.headers.find(h => h.f === 'last' || h.f === 'name');
        const cell = lastCol ? norm(grid[i]?.[lastCol.c - 1]) : '';
        const p = [...byLast.values()].find(x => cell && (cell === x.last || cell.startsWith(x.last + ' ')) );
        if (!p || i < insp.head) continue; seen++;
        const a = grid[i]?.[cA - 1], b = grid[i]?.[cB - 1];
        const show = (v: unknown) => (v instanceof Date ? dmy(v.toISOString().slice(0, 10)) : typeof v === 'number' ? dmy(new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)) : norm(v));   // πραγματική ημερομηνία του Excel
        expect(show(a), why + ' από ' + p.last).toBe(p.eke?.from ? dmy(p.eke.from) : '');
        expect(show(b), why + ' έως ' + p.last).toBe(p.eke?.to ? dmy(p.eke.to) : '');
      }
      expect(seen, why).toBe(sel.length);
    });
  }

  it('οι προεπισκοπήσεις ανανεώνονται: αλλαγή ΕΚΕ ή φίλτρου αλλάζει το αρχείο και τη σελίδα, και τίποτα άλλο δεν αλλάζει', async () => {
    for (let seed = 1; seed <= Math.min(N, 6); seed++) {
      const r = rng(seed * 733); const { buf, insp } = await withEke(seed, r);
      const day = D; const pid = 1;
      const mk = async (state: AppState, pk: Partial<RepPick>) => {
        const rep = reportOf(insp, pk); const sel = candidates(state, rep, day).map(x => (x as { id: number }).id);
        const out = await fillReport(buf, state, rep, sel, day); const pv = await previewOf({ name: 'ε.xlsx', data: out.data, warnings: out.warnings } as never);
        return { sel, html: pv.sheets.map(x => x.html).join('\n'), data: out.data };
      };
      const a = await mk(S0, { eke: 'in' });
      const lastOf = (id: number) => S0.people.find(p => p.id === id)!.last;
      expect(a.sel).toContain(pid);
      // 1. αλλάζει η ημερομηνία «έως» του στρατιώτη: η σελίδα έχει τη νέα ημερομηνία, όχι την παλιά
      const old = S0.people[pid - 1].eke!;
      const S1 = run(S0, { t: 'setEke', pid, from: old.from, to: '2026-12-30' });
      const b = await mk(S1, { eke: 'in' });
      expect(b.html).toContain('30/12/2026'); expect(a.html).not.toContain('30/12/2026');
      expect(b.html).not.toEqual(a.html); expect(Buffer.compare(a.data, b.data)).not.toBe(0);
      // 2. βγαίνει από ΕΚΕ: φεύγει από τη σελίδα του «μόνο σε ΕΚΕ» και μπαίνει στη σελίδα του «χωρίς ΕΚΕ»
      const S2 = run(S0, { t: 'setEke', pid });
      const inn = await mk(S2, { eke: 'in' }); const out = await mk(S2, { eke: 'out' });
      expect(inn.sel).not.toContain(pid); expect(out.sel).toContain(pid);
      expect(inn.html).not.toContain('>' + lastOf(pid) + '<'); expect(out.html).toContain(lastOf(pid));
      expect(inn.sel.length + out.sel.length).toBe(S0.people.length);
      // 3. το ίδιο state δίνει ίδιο αρχείο (η προεπισκόπηση δεν έχει δική της κατάσταση)
      const a2 = await mk(S0, { eke: 'in' });
      expect(Buffer.compare(a.data, a2.data)).toBe(0); expect(a2.html).toEqual(a.html);
      // 4. «Όλοι» (χωρίς φίλτρο): μπαίνουν όλοι, και ο στρατιώτης φαίνεται και στη σελίδα που άλλαξε η ΕΚΕ του
      const all = await mk(S0, {}); expect(all.sel.length).toBe(S0.people.length);
      expect(b.html).toContain(lastOf(pid));
    }
  });

  it('τυχαίες καταστάσεις: για όποιες μέρες και διαστήματα, το in/out χωρίζει σωστά και συμφωνεί με ekeState', () => {
    const r = rng(2411); const s0 = unit(fakeState(25));
    for (let k = 0; k < 200; k++) {
      const d0 = 20260801 + int(r, 0, 200); const iso = (x: number) => { const t = new Date(Date.UTC(2026, 7, 1) + (x - 20260801) * 86400000); return t.toISOString().slice(0, 10); };
      const people = s0.people.map(p => {
        if (chance(r, 0.3)) return p; const a = iso(d0 + int(r, -40, 40)), b = iso(d0 + int(r, -40, 80));
        const f = chance(r, 0.15) ? undefined : a < b ? a : b, t = chance(r, 0.3) ? undefined : a < b ? b : a;
        return f || t ? { ...p, eke: { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) } } : p; });
      const s = { ...s0, people }; const day = iso(d0 + int(r, -60, 100));
      const inn = ids(s, { eke: 'in' }, day), out = ids(s, { eke: 'out' }, day);
      expect(inn.filter(x => out.includes(x))).toEqual([]);
      expect([...inn, ...out].sort((a, b) => a - b)).toEqual(s.people.map(p => p.id));
      for (const p of s.people) expect(inn.includes(p.id)).toBe(ekeState(p, day) === 'now');
    }
  });
});
