// «Υπηρεσίες του μήνα με το χέρι» (Michael, 27/11): ο χρήστης γράφει το ΣΥΝΟΛΟ του μήνα ανά υπηρεσία. Έξτρα = max(0, γραμμένο − όσες έχει η εφαρμογή
// με ημερομηνία ως τη μέρα αποθήκευσης). Μετρούν στη σειρά δικαιοσύνης, στα όρια και στον Έλεγχο υπηρεσιών· ΚΑΝΕΝΑ Excel δεν αλλάζει. Μόνο ψεύτικα ονόματα.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import { DEFAULT_BLOCKS, emptyState, type AppState } from '../src/shared/domain';
import { dutyCount, dutyLimitInfo, dutyStats, fairCompare, fairMap, fairOf, handExtras, monthDuties, monthStats, pickPeople, ruleBlock, seatPeople, statOf } from '../src/shared/rules';
import { freshState } from '../src/shared/esso';
import { Workbook } from '../src/main/xlsx';
import { dutyCheck } from '../src/main/excel';
import { Store } from '../src/main/db';
import { checkSheet } from '../src/renderer/sheets';
import { DutyHandDialog } from '../src/renderer/screens/dutyHand';
import { StoreCtx, type StoreValue } from '../src/renderer/store';
import { fakeState } from './fixtures';

// το παράθυρο ζωγραφίζεται με react-dom/server (χωρίς DOM): η πύλη (portal) δίνει απλώς το περιεχόμενο
vi.mock('react-dom', async orig => ({ ...(await orig<typeof import('react-dom')>()), createPortal: (c: unknown) => c }));
(globalThis as any).document = { body: {} };

const YM = '2026-11';
const T = '2026-11-27';
let seq = 0;
const run = (s: AppState, c: Command, today = T) => apply(s, c, { today, newId: () => 'h' + ++seq });
const hand = (s: AppState, rows: Record<number, { n: Record<string, number>; hol?: number }>, ym = YM, today = T) => run(s, { t: 'setDutyHand', ym, rows }, today).state;
const base = (n = 6): AppState => { const s = fakeState(n); return { ...s, people: s.people.map(p => ({ ...p, post: null, si: 'Ι1' })) }; };
// 2 θαλαμοφύλακες του Νοεμβρίου για το άτομο 1
const withTwo = (): AppState => ({ ...base(), guards: { '2026-11-03': { th1: 1 }, '2026-11-10': { th1: 1 } } });

describe('υπηρεσίες με το χέρι: το σύνολο του μήνα', () => {
  it('Θ=5 με 2 της εφαρμογής: σύνολο 5, χωρίς να μπουν στο ημερολόγιο', () => {
    const s = hand(withTwo(), { 1: { n: { th: 5 } } });
    expect(s.dutyHand[YM][1]).toEqual({ on: T, n: { th: 5 } });
    const x = statOf(s, 1);
    expect(x.total).toBe(5); expect(x.byKind.th).toBe(5); expect(x.hand).toEqual({ th: 3 }); expect(x.log).toHaveLength(2);
  });
  it('μία Θ της εφαρμογής μετά την on προστίθεται από πάνω (6)', () => {
    const s0 = hand(withTwo(), { 1: { n: { th: 5 } } });
    const s = { ...s0, guards: { ...s0.guards, '2026-11-29': { th1: 1 } } };
    expect(statOf(s, 1).total).toBe(6);
  });
  it('μία Θ μέρα ≤ on μειώνει το έξτρα: το σύνολο μένει 5', () => {
    const s0 = hand(withTwo(), { 1: { n: { th: 5 } } });
    const s = { ...s0, guards: { ...s0.guards, '2026-11-15': { th2: 1 } } };
    expect(statOf(s, 1).total).toBe(5); expect(statOf(s, 1).hand).toEqual({ th: 2 });
  });
  it('γραμμένο κάτω από όσες έχει η εφαρμογή: έξτρα 0', () => {
    const s = hand(withTwo(), { 1: { n: { th: 1 } } });
    expect(statOf(s, 1).total).toBe(2); expect(statOf(s, 1).hand).toBeUndefined();
    expect(handExtras(s).get(YM)?.get(1)).toBeUndefined();
  });
  it('άλλος μήνας δεν επηρεάζεται· το μηνιαίο σύνολο έχει τα έξτρα του μήνα, οι «Όλοι οι μήνες» όλα', () => {
    const s0 = { ...withTwo(), guards: { ...withTwo().guards, '2026-10-05': { th1: 1 } } };
    const s = hand(s0, { 1: { n: { th: 5 } } });
    expect(statOf(s, 1).total).toBe(6);
    expect(monthStats(dutyStats(s), YM).get(1)!.total).toBe(5);
    expect(monthStats(dutyStats(s), '2026-10').get(1)!.total).toBe(1);
    expect(monthStats(dutyStats(s), YM).get(1)!.byKind.th).toBe(5);
  });
  it('άτομο χωρίς υπηρεσίες της εφαρμογής: μπαίνει στα σύνολα και στον μήνα', () => {
    const s = hand(base(), { 3: { n: { th: 2, mg: 1 }, hol: 1 } });
    const m = monthStats(dutyStats(s), YM).get(3)!;
    expect(statOf(s, 3).total).toBe(3); expect(statOf(s, 3).hol).toBe(1); expect(m.total).toBe(3); expect(m.byKind).toEqual({ th: 2, mg: 1 }); expect(m.hol).toBe(1);
  });
  it('οι ΣΚ/αργία: το «Από αυτές» μειώνεται όσο η εφαρμογή έχει ΣΚ/αργία με ημερομηνία', () => {
    // 7/11/2026 = Σάββατο
    const s0 = { ...base(), guards: { '2026-11-07': { th1: 1 } } };
    const s = hand(s0, { 1: { n: { th: 3 }, hol: 2 } });
    expect(statOf(s, 1).hol).toBe(2); expect(statOf(s, 1).total).toBe(3);
  });
});

describe('υπηρεσίες με το χέρι: σειρά δικαιοσύνης και όρια', () => {
  it('όποιος έχει υπηρεσίες με το χέρι μπαίνει πιο αργά από ίσο του χωρίς', () => {
    const D = '2026-11-30';
    const s = hand(base(2), { 1: { n: { th: 3 } } });
    const f = fairMap(s, s.people, D); const cmp = fairCompare(false, 'th', D);
    expect(f.get(1)!.total).toBe(3); expect(f.get(2)!.total).toBe(0);
    expect(cmp(f.get(1)!, f.get(2)!)).toBeGreaterThan(0);
    expect(fairOf(s, 1, D).byType.th).toBe(3); expect(fairOf(s, 1, D).byKind.th).toBe(3);
    const hs = hand(base(2), { 1: { n: {}, hol: 2 } });
    expect(fairOf(hs, 1, D).hol).toBe(2);
  });
  it('όριο του μήνα (dutyMax 4, per month): εφαρμογή + χέρι φτάνουν το όριο, και το «N από M»', () => {
    const s0 = withTwo(); const s1 = { ...s0, rules: { ...s0.rules, dutyMax: 4, dutyMaxPer: 'month' as const } };
    const D = '2026-11-28';
    expect(dutyLimitInfo(s1, D, s1.people[0])!.txt).toBe('2 από 4');
    const s = hand(s1, { 1: { n: { th: 4 } } });
    expect(monthDuties(s, D, 1)).toBe(4); expect(dutyCount(s, D, 1, 'month')).toBe(4);
    expect(dutyLimitInfo(s, D, s.people[0])!.txt).toBe('4 από 4');
    expect(ruleBlock(s, D, 1)).toMatch(/Πάνω από το όριο/);
    expect(ruleBlock(s1, D, 1)).toBeNull();
    // άλλος μήνας: δεν μετρά
    expect(monthDuties(s, '2026-12-05', 1)).toBe(0);
  });
  it('όριο συνολικό (all): μετρά τα έξτρα', () => {
    const s = hand(withTwo(), { 1: { n: { th: 5 } } });
    expect(dutyCount(s, '2026-11-28', 1, 'all')).toBe(5);
  });
  it('στέλεχος με θέση (αρνητικό pid): ο μήνας του μετρά τα έξτρα', () => {
    let s = run(base(), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ', monthMax: 3 } as any }).state;
    const p = pickPeople(s).find(x => x.cid)!;
    s = run(s, { t: 'assign', date: '2026-11-03', k: 'th1', pid: p.id, cid: p.cid }).state;
    const row = seatPeople(s).find(x => x.cid)!; expect(row.id).toBeLessThan(0);
    s = hand(s, { [row.id]: { n: { th: 3 } } });
    expect(monthDuties(s, '2026-11-28', row.id)).toBe(3);
    expect(statOf(s, row.id).total).toBe(3);
  });
});

describe('υπηρεσίες με το χέρι: δική σου υπηρεσία', () => {
  const mine = { id: 'c9', kind: 'th' as const, name: 'Πύλη', armed: false, custom: true, posts: [{ k: 'c9_1', label: 'Πύλη 1', short: '1' }] };
  const mk = (): AppState => { const s = base(); return { ...s, settings: { ...s.settings, blocks: [...DEFAULT_BLOCKS, mine] }, guards: { '2026-11-02': { c9_1: 1 }, '2026-11-04': { th1: 1 } } }; };
  it('το κλειδί b:c9 μετρά στη δική του στήλη και στο είδος της υπηρεσίας· το «th» χωριστά', () => {
    const s = hand(mk(), { 1: { n: { 'b:c9': 3, th: 1 }, hol: 1 } });
    const x = statOf(s, 1);
    expect(x.hand).toEqual({ 'b:c9': 2 });   // th: 1 = όσες έχει η εφαρμογή (η Πύλη δεν μετρά ως th)
    expect(x.byKind['b:c9']).toBe(3); expect(x.hol).toBe(1); expect(x.total).toBe(4);
    expect(fairOf(s, 1, '2026-11-30').byType['b:c9']).toBe(3);
  });
});

describe('υπηρεσίες με το χέρι: η εντολή και η αναίρεση', () => {
  it('καθαρίζει τιμές, σβήνει όποιον έχει μηδενικά, και σβήνει τον μήνα όταν αδειάσει', () => {
    let s = hand(base(), { 1: { n: { th: 400, mg: -2, ly: 1.7 } }, 2: { n: { th: 2 }, hol: 1 } });
    expect(s.dutyHand[YM][1].n).toEqual({ th: 99, ly: 1 }); expect(s.dutyHand[YM][2]).toEqual({ on: T, n: { th: 2 }, hol: 1 });
    s = hand(s, { 1: { n: { th: 0 } } }); expect(s.dutyHand[YM][1]).toBeUndefined(); expect(s.dutyHand[YM][2]).toBeDefined();
    s = hand(s, { 2: { n: {} } }); expect(s.dutyHand[YM]).toBeUndefined(); expect(Object.keys(s.dutyHand)).toEqual([]);
  });
  it('η μέρα on: σήμερα, ή το τέλος του μήνα για μήνα που πέρασε· ίδια τιμή = καμία αλλαγή', () => {
    const s = hand(base(), { 1: { n: { th: 2 } } }, '2026-10', T);
    expect(s.dutyHand['2026-10'][1].on).toBe('2026-10-31');
    const r = run(s, { t: 'setDutyHand', ym: '2026-10', rows: { 1: { n: { th: 2 } } } });
    expect(r.state).toBe(s); expect(r.text).toMatch(/έμειναν όπως ήταν/);
    expect(run(base(), { t: 'setDutyHand', ym: YM, rows: { 1: { n: { th: 2 } } } }).text).toBe('Υπηρεσίες με το χέρι, Νοέμβριος 2026: άλλαξαν σε 1 άτομο');
  });
  it('αναίρεση με τη βάση: επαναφέρει την προηγούμενη κατάσταση, και μένει μετά το ξανάνοιγμα', async () => {
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghand-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit({ ...st.state, people: base().people });
    const p1 = st.commit(apply(st.state, { t: 'setDutyHand', ym: YM, rows: { 1: { n: { th: 2 } } } }, { today: T, newId: () => 'u1' }).state);
    const p2 = st.commit(apply(st.state, { t: 'setDutyHand', ym: YM, rows: { 1: { n: { th: 4 } }, 2: { n: { mg: 1 } } } }, { today: T, newId: () => 'u2' }).state);
    st.flush(); st.close(); st = new Store(dir, WASM); await st.open();
    expect(st.state.dutyHand[YM][1].n).toEqual({ th: 4 });
    st.revert(p2); expect(st.state.dutyHand[YM][1].n).toEqual({ th: 2 }); expect(st.state.dutyHand[YM][2]).toBeUndefined();
    st.revert(p1); expect(st.state.dutyHand).toEqual({});
    st.close();
  });
});

describe('υπηρεσίες με το χέρι: Excel χωρίς αλλαγή, παλιά βάση, Νέα ΕΣΣΟ', () => {
  const cells = async (s: AppState) => { const wb = await Workbook.open((await dutyCheck(s, YM)).data); const n = wb.sheetNames(); return JSON.stringify(await Promise.all(n.map(x => wb.values(x)))); };
  it('Έλεγχος υπηρεσιών (Excel και πλέγμα οθόνης): ίδια κελιά με και χωρίς dutyHand', async () => {
    const s0 = withTwo(); const s = hand(s0, { 1: { n: { th: 9, mg: 2 }, hol: 3 }, 2: { n: { th: 4 } } });
    expect(Object.keys(s.dutyHand)).toEqual([YM]);
    expect(await cells(s)).toBe(await cells(s0));
    expect(JSON.stringify(checkSheet(s, YM))).toBe(JSON.stringify(checkSheet(s0, YM)));
  });
  it('κατάσταση χωρίς dutyHand (παλιά βάση) δουλεύει', () => {
    const s0 = withTwo(); const { dutyHand: _d, ...old } = s0; const s = old as unknown as AppState;
    expect(statOf(s, 1).total).toBe(2); expect(monthDuties(s, '2026-11-28', 1)).toBe(2); expect(fairOf(s, 1, '2026-11-30').total).toBe(2);
    expect(handExtras(s).size).toBe(0);
    expect(run(s, { t: 'setDutyHand', ym: YM, rows: { 1: { n: { th: 5 } } } }).state.dutyHand[YM][1].n).toEqual({ th: 5 });
  });
  it('Νέα ΕΣΣΟ: όπως οι προηγούμενες υπηρεσίες, φεύγουν', () => {
    const s = hand({ ...withTwo(), baseline: { 1: { th: 2 } } }, { 1: { n: { th: 5 } } });
    const f = freshState(s, { s: 'Α', y: 2027 } as any, '2027-01-05', 'C:\\x');
    expect(f.baseline).toEqual({}); expect(f.dutyHand).toEqual({}); expect(emptyState().dutyHand).toEqual({});
  });
});

describe('υπηρεσίες με το χέρι: το παράθυρο', () => {
  it('ζωγραφίζεται με στήλες ανά ενεργή υπηρεσία, γκρι «εφ.», και τα στελέχη μετά τους στρατιώτες', () => {
    const s = hand(withTwo(), { 1: { n: { th: 5 }, hol: 1 } });
    const st = { state: s, today: T, run: async () => true, undoMark: () => ({ label: 'Αναίρεση', fn: () => {} }) } as unknown as StoreValue;
    const h = renderToString(React.createElement(StoreCtx.Provider, { value: st }, React.createElement(DutyHandDialog, { ym: YM, onClose: () => {} })));
    expect(h).toContain('Υπηρεσίες του μήνα με το χέρι'); expect(h).toContain('εφ. <!-- -->2'); expect(h).toContain('Σύνολο μήνα'); expect(h).toContain('Μηδένισε τον μήνα');
    expect(h).toContain('3<!-- --> ενεργές υπηρεσίες'); expect(h).toContain('value="5"'); expect(h).toContain('hand__tot">5<');
  });
});
