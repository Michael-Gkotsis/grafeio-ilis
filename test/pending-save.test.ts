// @vitest-environment jsdom
// Μπάρα «Δεν αποθηκεύτηκαν οι αλλαγές» (pending.ts): μετά το «Αποθήκευση» πρέπει να φεύγει και να μη ρωτά όταν φεύγεις από την οθόνη.
// Κάθε κάρτα με «Αποθήκευση» στις Ρυθμίσεις ανοίγει εδώ σε πραγματικό DOM (jsdom), αλλάζουμε ένα πεδίο, πατάμε «Αποθήκευση» και
// η εντολή εφαρμόζεται όπως στην εφαρμογή (apply + JSON, όπως περνά από το IPC)· μετά δεν πρέπει να μένει καμία εκκρεμότητα.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { NavCtx, StoreCtx, useStore } from '../src/renderer/store';
import { ToastProvider } from '../src/renderer/ui';
import { pendingNow } from '../src/renderer/pending';
import { fakeState } from './fixtures';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const D = '2026-11-26';
let n = 0;
const ctx = { today: D, newId: () => 'x' + ++n };
let root: Root | null = null; let host: HTMLElement | null = null;
// οι προειδοποιήσεις του React για «key» και «stroke-width» στις οθόνες δεν έχουν σχέση με το τεστ: μένουν μόνο τα σφάλματα
beforeAll(() => { const e = console.error; vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { if (!/^Warning:/.test(String(a[0]))) e(...a); }); });
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; });

// Δείχνει την κάρτα με ζωντανή κατάσταση: το run κάνει apply και περνά το αποτέλεσμα από JSON (όπως το IPC)
export async function mount(Card: React.ComponentType, init: AppState) {
  (globalThis as any).window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const nav: any = { view: 'settings', params: {}, go() {}, set() {}, declare() {}, note() {}, openPerson() {}, openCadre() {}, guard: (f: () => void) => f(), setDirty() {} };
  const runs: Command[] = [];
  function Wrap() {
    const [state, setState] = useState(init);
    const run = async (cmd: Command) => {
      runs.push(cmd);
      let r; try { r = apply(state, cmd, ctx); } catch (e) { throw e; }
      if ((r as any).error) return null;
      const next = JSON.parse(JSON.stringify(r.state)) as AppState; setState(next); return next;
    };
    const store: any = { state, audit: [], boot: {}, today: D, tomorrow: '2026-11-27', run, undo: async () => {}, undoMark: () => ({ label: '', fn() {} }), refresh: async () => {}, sync: async () => {} };
    return React.createElement(ToastProvider, null, React.createElement(StoreCtx.Provider, { value: store }, React.createElement(NavCtx.Provider, { value: nav }, React.createElement(Card))));
  }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(React.createElement(Wrap)); });
  return { el: host, runs };
}
// γράφει τιμή σε πεδίο όπως ο χρήστης (το React ακούει το «input»)
export async function type(input: Element, value: string) {
  const proto = Object.getPrototypeOf(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event((input as HTMLElement).tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
export const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
export const byText = (root: ParentNode, text: string, tag = 'button') => [...root.querySelectorAll(tag)].find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
export const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
// το σύνολο των εκκρεμοτήτων (η μπάρα κάτω δείχνει αυτά τα ονόματα)
export const pendingLabels = () => pendingNow().map(p => p.label);

import { CadreDutyCard } from '../src/renderer/screens/cadreDutySet';
import { AssetsCard } from '../src/renderer/screens/assetsSet';
import { CadreLeaveCard } from '../src/renderer/screens/cadreLeave';
import { FileNamesCard } from '../src/renderer/screens/fileNamesCard';
import { HkColsCard } from '../src/renderer/screens/hkcols';
import { HkHeadCard } from '../src/renderer/screens/hkrows';
import { CadreCard, HkaiManualCard, PunTextDialog } from '../src/renderer/screens/other';
import { SettingsCard } from '../src/renderer/screens/settings';
import { RoomsCard, BrandCard } from '../src/renderer/screens/units';

const seeded = () => { const s = fakeState(5); s.settings = { ...s.settings, cadreDuty: { groups: [{ id: 'g1', name: 'ΠΥΛΗ', services: [{ id: 's1', name: 'Κεντρική πύλη', short: 'ΠΥΛ', perDay: 1, h24: true, hkCol: 'yp' }] }], limits: { off: { base: 3, extra: 1 }, nco: { base: 4, extra: 1 } }, rest: 1, carry: true, fairHol: true } }; return s; };

describe('Υπηρεσίες στελεχών: μετά την αποθήκευση δεν μένει μπάρα', () => {
  it('κωδικός με μικρά γράμματα: αποθηκεύεται με κεφαλαία και η μπάρα φεύγει', async () => {
    const { el, runs } = await mount(CadreDutyCard, seeded());
    expect(pendingLabels()).toEqual([]);
    await type(el.querySelector('input[id^="sv-s-"]')!, 'αυδμ');
    expect(pendingLabels()).toEqual(['Υπηρεσίες στελεχών']);
    await click(byText(el, 'Αποθήκευση')!); await settle();
    expect(runs.length).toBe(1);
    expect(pendingLabels()).toEqual([]);
  });
  it('όριο, νέα ομάδα και ημέρες: η μπάρα φεύγει', async () => {
    const { el, runs } = await mount(CadreDutyCard, seeded());
    await click(byText(el, '+ Νέα ομάδα…')!);
    await type(el.querySelector('input[id^="g-n-g2"]')!, ' Φυλάκιο ');
    await type(el.querySelector('input[id^="sv-n-s2"]')!, ' Νυχτερινή ');
    await type(el.querySelector('input[id^="sv-s-s2"]')!, 'νυχ');
    await click(el.querySelector('.duty__dow')!); await click(byText(el, 'Μόνο αξιωματικοί', 'span')!.previousElementSibling!);
    expect(pendingLabels()).toEqual(['Υπηρεσίες στελεχών']);
    await click(byText(el, 'Αποθήκευση')!); await settle();
    expect(runs.length).toBe(1);
    expect(pendingLabels()).toEqual([]);
  });
});

// Κοινό σενάριο: γράφεις κάτι όπως το γράφει ο χρήστης (κενά, κόμμα, μικρά), πατάς «Αποθήκευση», και η μπάρα πρέπει να φύγει
async function saveClean(Card: React.ComponentType, st: AppState, label: string, edit: (el: HTMLElement) => Promise<void>, saveLabel = 'Αποθήκευση') {
  const { el, runs } = await mount(Card, st);
  expect(pendingLabels()).toEqual([]);
  await edit(el);
  expect(pendingLabels()).toEqual([label]);
  const b = [...el.querySelectorAll('button')].find(x => x.textContent?.trim() === saveLabel && !x.disabled);
  await click(b!); await settle();
  expect(runs.length).toBeGreaterThan(0);
  expect(pendingLabels()).toEqual([]);
}
const q = (el: HTMLElement, sel: string) => el.querySelector(sel)!;

describe('κάθε κάρτα με «Αποθήκευση»: η μπάρα φεύγει μετά την αποθήκευση', () => {
  it('Οπλισμός και υλικό: λέξη θέσης με μικρά και όνομα με κενό', async () => {
    await saveClean(AssetsCard, fakeState(3), 'Οπλισμός και υλικό', async el => { await type(q(el, 'input[id^="ac-n-"]'), (q(el, 'input[id^="ac-n-"]') as HTMLInputElement).value + ' '); await type(q(el, 'input[id^="pw-w-"]'), 'κβ'); });
  });
  it('Άδειες και απαλλαγές στελεχών: δεκαδικό με κόμμα και κενό στο όνομα', async () => {
    await saveClean(CadreLeaveCard, fakeState(3), 'Άδειες και απαλλαγές στελεχών', async el => { await type(q(el, 'input[aria-label="Απαλλαγές ανά υπηρεσία"]'), '0,5'); await type(q(el, 'input[id^="lq-n-"]'), 'Κανονική '); });
  });
  it('Ονόματα αρχείων', async () => {
    await saveClean(FileNamesCard, fakeState(3), 'Ονόματα αρχείων', async el => { await type(q(el, 'input[aria-label^="Όνομα: "]'), '  Δικό μου  '); });
  });
  it('Δικές μου στήλες: όνομα με κενά', async () => {
    await saveClean(HkColsCard, fakeState(3), 'Δικές μου στήλες', async el => { await click(byText(el, '+ Νέα στήλη')!); await type(q(el, '#hc-n0'), ' Καραντίνα '); });
  });
  it('Κεφαλίδα της ΗΚΑΙ: κενό στο τέλος του ίδιου κειμένου', async () => {
    const st = fakeState(3); st.settings = { ...st.settings, hkai: { head: ['ΜΟΝΑΔΑ', ''] } } as any;
    await saveClean(HkHeadCard, st, 'Κεφαλίδα της ΗΚΑΙ', async el => { await type(q(el, 'input[aria-label$="γραμμή 1"]'), 'ΜΟΝΑΔΑ '); });
  });
  it('Μονάδα και έντυπα: κεφαλίδα ΗΚΑΙ με κενό στο τέλος', async () => {
    await saveClean(SettingsCard, fakeState(3), 'Μονάδα και έντυπα', async el => { await type(q(el, 'input[aria-label$="γραμμή 1"]'), 'ΤΕΣΤ '); }, 'Αποθήκευση ρυθμίσεων');
  });
  it('Θάλαμοι και ουλαμοί: όνομα ουλαμού με διπλά κενά', async () => {
    await saveClean(RoomsCard, fakeState(3), 'Θάλαμοι και ουλαμοί', async el => { await type(q(el, 'input[aria-label="Όνομα ουλαμού 1"]'), ' 1ος  Ουλαμός '); });
  });
  it('Τίτλος και λογότυπο: τίτλος με κενά', async () => {
    await saveClean(BrandCard, fakeState(3), 'Τίτλος και λογότυπο', async el => { await type(q(el, '#br-title'), '  Γραφείο   Ίλης '); });
  });
  it('Στελέχη ανά βαθμό (ΗΚΑΙ)', async () => {
    const C = () => React.createElement(CadreCard, { warn: true });
    await saveClean(C, fakeState(3), 'Στελέχη ανά βαθμό', async el => { await type(q(el, '.settings-grid input'), '3'); });
  });
  it('Στοιχεία της ΗΚΑΙ (χειροκίνητα): κείμενο με κενό στο τέλος', async () => {
    const C = () => React.createElement(HkaiManualCard, { date: D });
    await saveClean(C, fakeState(3), 'Στοιχεία της ΗΚΑΙ 26/11', async el => { await type(q(el, '#hk-egr'), 'Κάτι '); });
  });
});

// Παράθυρο που μένει ανοιχτό μετά την «Αποθήκευση» (Κείμενο ποινής): το κλείσιμο δεν πρέπει να ρωτά «να χαθεί;»
describe('παράθυρο με «Αποθήκευση» που μένει ανοιχτό', () => {
  it('Κείμενο ποινής: μετά την αποθήκευση το ✕ κλείνει χωρίς ερώτηση', async () => {
    const st = fakeState(3); const pun = { id: 'p1', pid: 1, type: 'PUN', from: D, to: D, kind: 'Κράτηση' } as any; st.statuses = [pun];
    let closed = 0;
    // όπως η οθόνη: la ποινή διαβάζεται κάθε φορά από την κατάσταση
    const C = () => { const { state } = useStore(); return React.createElement(PunTextDialog, { st: state.statuses[0], onClose: () => { closed++; } }); };
    await mount(C, st);
    const by = document.getElementById('pt-by') as HTMLInputElement;
    await type(by, 'ΛΧΙΑ ΔΟΚΙΜΙΟ ');
    await click(byText(document.body, 'Αποθήκευση')!); await settle();
    await click(document.querySelector('button[aria-label="Κλείσιμο"]')!);   // το ✕ της κεφαλίδας
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(closed).toBe(1);
  });
});
