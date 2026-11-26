// «Μετρά για 1» (Michael, 26/11): όταν κάποιος έχει 2 υπηρεσίες την ίδια μέρα, ρωτά αν μετρά για μία ή δύο. Χωρίς απάντηση μετρά κάθε υπηρεσία.
// Έλεγχος υπηρεσιών: και οι δύο κωδικοί στο κελί («Θ1α/Μ1»), και οι υπηρεσίες του προγράμματος στελεχών. Μόνο ψεύτικα ονόματα.
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apply, type Command } from '../src/shared/commands';
import { DEFAULT_BLOCKS, blocksOf, type AppState, type CadreDutyCfg, type Rules } from '../src/shared/domain';
import { dutyCount, dutyLimitInfo, dutyStats, fairOf, monthDuties, monthStats, pickPeople, fillDay } from '../src/shared/rules';
import { cadreCheckTotal, monthCount, rosterCodes } from '../src/shared/cadreDuty';
import { onceCandidates, onceText } from '../src/shared/dutyOnceAsk';
import { Workbook } from '../src/main/xlsx';
import { dutyCheck } from '../src/main/excel';
import { Store } from '../src/main/db';
import { checkSheet } from '../src/renderer/sheets';
import { DutyOnceDialog } from '../src/renderer/dutyOnce';
import { StoreCtx, type StoreValue } from '../src/renderer/store';
import { fakeState } from './fixtures';

// Το παράθυρο ζωγραφίζεται με react-dom/server (χωρίς DOM): η πύλη (portal) δίνει απλώς το περιεχόμενο
vi.mock('react-dom', async orig => ({ ...(await orig<typeof import('react-dom')>()), createPortal: (c: unknown) => c }));
(globalThis as any).document = { body: {} };

const D = '2026-10-14';          // η μέρα με τις 2 υπηρεσίες
const T = '2026-10-20';          // «σήμερα» (η μέρα που κρίνεται δεν μετρά)
let seq = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: T, newId: () => 'o' + ++seq }).state;
// μονάδα, δύο υπηρεσίες την ίδια μέρα: θαλαμοφύλακας 1 και μαγειρεία 1 για τον ίδιο άνθρωπο (όπως στο unit-duties.test.ts)
function base(rules: Partial<Rules> = {}): AppState {
  const s = fakeState(4);
  const th = DEFAULT_BLOCKS.find(b => b.id === 'th')!; const mg = DEFAULT_BLOCKS.find(b => b.id === 'mg')!;
  s.people = s.people.map(p => ({ ...p, si: 'Ι1', post: null, rank: 'ΣΤΡ' }));
  return { ...s, rules: { ...s.rules, restDays: 0, twoPerDay: 'free', dutyMax: 5, dutyMaxPer: 'month', ...rules }, settings: { ...s.settings, phase: 'sven', mode: 'unit' as const,
    blocks: [th, { ...mg, posts: [{ ...mg.posts[0], hrs: '10:00-12:00' }] }] }, guards: { [D]: { th1: 1, mg1: 1 } } };
}
const once = (s: AppState, who = '1', on = true) => run(s, { t: 'setDutyOnce', date: D, who, once: on });
const cellOf = async (s: AppState, last: string) => { const wb = await Workbook.open((await dutyCheck(s, '2026-10')).data); const rows = await wb.values(wb.sheetNames()[0]); const h = rows[2]; const r = rows.find(x => x[2] === last)!; return { code: r[h.indexOf('14')], sum: r[h.indexOf('ΣΥΝ.')] }; };

describe('«Μετρά για 1»: στρατιώτης', () => {
  it('χωρίς απάντηση μετρά κάθε υπηρεσία: μήνας = σύνολο = 2, «2 από 5»', () => {
    const s = base();
    expect(monthDuties(s, T, 1)).toBe(2); expect(dutyCount(s, T, 1, 'all')).toBe(2); expect(dutyCount(s, T, 1, 'month')).toBe(2);
    expect(dutyStats(s).get(1)!.total).toBe(2); expect(fairOf(s, 1, T).total).toBe(2);
    expect(dutyLimitInfo(s, T, s.people[0])!.txt).toBe('2 από 5');
  });
  it('απάντηση «1»: μετρά 1 παντού· οι στήλες ανά είδος μένουν', () => {
    const s = once(base());
    expect(s.dutyOnce).toEqual({ [D]: ['1'] });
    expect(monthDuties(s, T, 1)).toBe(1); expect(dutyCount(s, T, 1, 'all')).toBe(1); expect(dutyCount(s, T, 1, 'month')).toBe(1);
    expect(dutyStats(s).get(1)!.total).toBe(1); expect(dutyStats(s).get(1)!.byKind).toEqual({ th: 1, mg: 1 });
    expect(monthStats(dutyStats(s), '2026-10').get(1)!.total).toBe(1); expect(monthStats(dutyStats(s), '2026-10').get(1)!.byKind).toEqual({ th: 1, mg: 1 });
    expect(fairOf(s, 1, T).total).toBe(1); expect(fairOf(s, 1, T).byKind).toEqual({ th: 1, mg: 1 });
    expect(dutyLimitInfo(s, T, s.people[0])!.txt).toBe('1 από 5');
    expect(dutyStats(s).get(2)).toBeUndefined();
  });
  it('η ίδια η μέρα δεν μετρά στο όριο της μέρας (και με «1»)', () => {
    const s = once(base());
    expect(monthDuties(s, D, 1)).toBe(0); expect(dutyCount(s, D, 1, 'all')).toBe(0); expect(monthDuties(s, D, 1, undefined, true)).toBe(1); expect(dutyCount(s, D, 1, 'all', undefined, true)).toBe(1);
  });
  it('«2» ξανά: όπως πριν· ίδια απάντηση δύο φορές: καμία αλλαγή· σε μέρα με μία υπηρεσία δεν έχει αποτέλεσμα', () => {
    const s1 = once(base()); const s2 = once(s1, '1', false);
    expect(s2.dutyOnce).toEqual({}); expect(monthDuties(s2, T, 1)).toBe(2);
    expect(once(s1)).toBe(s1);
    const lone = { ...base(), guards: { [D]: { th1: 1 } } }; const l = once(lone);
    expect(monthDuties(l, T, 1)).toBe(1); expect(dutyStats(l).get(1)!.total).toBe(1);
  });
  it('Excel «Έλεγχος υπηρεσιών»: «Θ1α/Μ1» και ΣΥΝ. 2, με «1» ΣΥΝ. 1· ίδιο στο πλέγμα της οθόνης', async () => {
    const s = base(); const last = s.people[0].last;
    expect(await cellOf(s, last)).toEqual({ code: 'Θ1α/Μ1', sum: 2 });
    expect(await cellOf(once(s), last)).toEqual({ code: 'Θ1α/Μ1', sum: 1 });
    const g = (x: AppState) => { const m = checkSheet(x, '2026-10'); const r = m.rows.find(r => r[1]?.v.includes(s.people[0].last))!; return { code: r[8 + 13]?.v, sum: Number(r[4]?.v) }; };
    expect(g(s)).toEqual({ code: 'Θ1α/Μ1', sum: 2 }); expect(g(once(s))).toEqual({ code: 'Θ1α/Μ1', sum: 1 });
  });
  it('αυτόματη συμπλήρωση: η απάντηση «1» μετρά και στο όριο της επόμενης μέρας', () => {
    const s = once(base({ dutyMax: 2, dutyMaxPer: 'month' }));
    // με «1» ο 1 έχει 1 από 2: δεν τον κρατά το όριο· χωρίς απάντηση έχει 2 από 2
    expect(dutyLimitInfo(s, T, s.people[0])!.over).toBe(false);
    expect(dutyLimitInfo({ ...s, dutyOnce: undefined }, T, s.people[0])!.n).toBe(2);
    expect(() => fillDay(s, '2026-10-15')).not.toThrow();
  });
  it('αναίρεση και αποθήκευση στη βάση (kv «dutyOnce»)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gipl-'));
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    let st = new Store(dir, WASM); await st.open();
    expect(st.state.dutyOnce).toBeUndefined();
    const p1 = st.commit(run(st.state, { t: 'setDutyOnce', date: D, who: '1', once: true }));
    const p2 = st.commit(run(st.state, { t: 'setDutyOnce', date: D, who: 'c:x1', once: true }));
    expect(p1.kvd).toMatchObject([{ key: 'dutyOnce' }]);
    st.close(); st = new Store(dir, WASM); await st.open();
    expect(st.state.dutyOnce).toEqual({ [D]: ['1', 'c:x1'] });
    st.revert(p2); expect(st.state.dutyOnce).toEqual({ [D]: ['1'] });
    st.revert(p1); expect(st.state.dutyOnce).toEqual({});
    st.close();
  });
});

// ---- στέλεχος: θέση + υπηρεσία προγράμματος την ίδια μέρα ----
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [
    { id: 'a', name: 'Αξιωματικός Υπηρεσίας Διανυκτερεύων Μονάδος', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' },
    { id: 'b', name: 'Επόπτης ΕΕΑΣ', short: 'ΕΕΑΣ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 3, extra: 1 }, nco: { base: 3, extra: 1 } }, rest: 1, carry: true, fairHol: true
};
const YM = '2026-12'; const C = '2026-12-05';
function cadre(): { s: AppState; cid: string; cid2: string } {
  let s = run(fakeState(10), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΟΝΟΜΑ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΜΟΝΟΠΡΟΓΡΑΜΜΑ', first: 'ΟΝΟΜΑ' } });
  const cid = s.cadreList[0].id, cid2 = s.cadreList[1].id;
  for (const c of [cid, cid2]) s = run(s, { t: 'setCadreDutyOf', cid: c, person: { group: 'g' } });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' });
  const k = blocksOf(s.settings).find(b => b.name === 'ΑΥΔΜ')!.posts[0].k;
  s = run(s, { t: 'assign', date: C, k, pid: pickPeople(s).find(p => p.cid === cid)!.id, cid });          // ΑΥΔΜ στη θέση: μπαίνει και στο πρόγραμμα
  s = run(s, { t: 'saveCadreDuty', duty: { date: C, svc: 'b', cid } });                                     // και ΕΕΑΣ στο πρόγραμμα, την ίδια μέρα
  s = run(s, { t: 'saveCadreDuty', duty: { date: '2026-12-09', svc: 'b', cid: cid2 } });                     // στέλεχος μόνο με πρόγραμμα
  return { s, cid, cid2 };
}
const xl = async (s: AppState) => { const wb = await Workbook.open((await dutyCheck(s, YM)).data); const rows = await wb.values(wb.sheetNames()[0]); return { rows, h: rows[2] }; };

describe('«Μετρά για 1»: στέλεχος και υπηρεσίες του προγράμματος στον Έλεγχο υπηρεσιών', () => {
  it('ΑΥΔΜ (θέση) + ΕΕΑΣ (πρόγραμμα) την ίδια μέρα: done 2, με «1» done 1', () => {
    const { s, cid } = cadre();
    expect(monthCount(s, cid, YM).done).toBe(2);
    const s1 = run(s, { t: 'setDutyOnce', date: C, who: 'c:' + cid, once: true });
    expect(monthCount(s1, cid, YM)).toMatchObject({ done: 1, roster: 2 }); expect(cadreCheckTotal(s, s.cadreList[0], YM)).toBe(2); expect(cadreCheckTotal(s1, s1.cadreList[0], YM)).toBe(1);
    const pid = s.cadreList[0].pid!; expect(monthDuties(s, C.slice(0, 7) + '-20', pid)).toBe(2); expect(monthDuties(s1, '2026-12-20', pid)).toBe(1);
  });
  it('Excel: κελί με και τους δύο κωδικούς, ΣΥΝ. 2 → 1· το στέλεχος μόνο με πρόγραμμα έχει γραμμή', async () => {
    const { s, cid } = cadre();
    const a = await xl(s); const i = a.h.indexOf('5');
    const r = a.rows.find(x => x[2] === 'ΣΤΕΛΕΧΟΣ')!; expect(String(r[i])).toMatch(/\/ΕΕΑΣ$/); expect(r[a.h.indexOf('ΣΥΝ.')]).toBe(2);
    const only = a.rows.find(x => x[2] === 'ΜΟΝΟΠΡΟΓΡΑΜΜΑ')!; expect(only[a.h.indexOf('9')]).toBe('ΕΕΑΣ'); expect(only[a.h.indexOf('ΣΥΝ.')]).toBe(1);
    const b = await xl(run(s, { t: 'setDutyOnce', date: C, who: 'c:' + cid, once: true }));
    expect(b.rows.find(x => x[2] === 'ΣΤΕΛΕΧΟΣ')![b.h.indexOf('ΣΥΝ.')]).toBe(1);
  });
  it('οθόνη (checkSheet): ίδιο με το Excel', () => {
    const { s, cid } = cadre();
    const line = (x: AppState, last: string) => checkSheet(x, YM).rows.find(r => String(r[1]?.v).includes(last))! as NonNullable<ReturnType<typeof checkSheet>['rows'][number][number]>[];
    const r = line(s, 'ΣΤΕΛΕΧΟΣ'); expect(String(r[8 + 4].v)).toMatch(/\/ΕΕΑΣ$/); expect(r[4].v).toBe('2');
    expect(line(s, 'ΜΟΝΟΠΡΟΓΡΑΜΜΑ')[8 + 8].v).toBe('ΕΕΑΣ');
    expect(line(run(s, { t: 'setDutyOnce', date: C, who: 'c:' + cid, once: true }), 'ΣΤΕΛΕΧΟΣ')[4].v).toBe('1');
  });
  it('rosterCodes: χωρίς τις εγγραφές via (τη θέση τη δείχνει ήδη το ημερολόγιο)', () => {
    const { s, cid } = cadre();
    expect([...rosterCodes(s, YM).get(cid)!.get(C)!]).toEqual(['ΕΕΑΣ']);
  });
  it('ερώτηση: μετά τη 2η υπηρεσία βρίσκεται το άτομο· όχι αν έχει ήδη απάντηση ή αν δεν αυξήθηκαν οι υπηρεσίες του', () => {
    const { s, cid } = cadre();
    const s0 = run(s, { t: 'deleteCadreDuty', id: s.cadreDuties!.find(x => x.date === C && x.svc === 'b')!.id });
    const l = onceCandidates(s0, s, [C]);
    expect(l).toHaveLength(1); expect(l[0]).toMatchObject({ who: 'c:' + cid, n: 2, date: C }); expect(onceText(l[0])).toContain('έχει 2 υπηρεσίες στις 05/12/2026 (');
    expect(onceCandidates(s, s, [C])).toEqual([]);
    expect(onceCandidates(s0, run(s, { t: 'setDutyOnce', date: C, who: 'c:' + cid, once: true }), [C])).toEqual([]);
  });
  it('αυτόματη συμπλήρωση μονάδας: όποιος πήρε 2η υπηρεσία βρίσκεται στη λίστα της ερώτησης', () => {
    const s0 = { ...base(), guards: {} }; const ns = { ...s0, guards: { ...s0.guards, [D]: fillDay(s0, D).guards[D] } };
    const l = onceCandidates(s0, ns, [D]); expect(l.length).toBe(1); expect(l[0].n).toBe(2); expect(l[0].date).toBe(D);
  });
  it('στρατιώτης: ερώτηση και για υπηρεσία χωρίς θέση', () => {
    const s0 = { ...base(), guards: { [D]: { th1: 1 } } }; const s = base();
    expect(onceCandidates(s0, s, [D]).map(x => [x.who, x.codes])).toEqual([['1', ['Θ1α', 'Μ1']]]);
  });
});

describe('«Μετρά για 1»: το παράθυρο', () => {
  const store = (s: AppState) => ({ state: s, run: async () => s, undoMark: () => ({ label: 'Αναίρεση', fn: () => {} }) } as unknown as StoreValue);
  const draw = (s: AppState, items: ReturnType<typeof onceCandidates>) => renderToString(React.createElement(StoreCtx.Provider, { value: store(s) }, React.createElement(DutyOnceDialog, { items, onClose: () => {} })));
  it('ένα άτομο: τίτλος, κείμενο, «Μετρά για 1» και «Μετρά για 2»', () => {
    const s = base(); const l = onceCandidates({ ...s, guards: { [D]: { th1: 1 } } }, s, [D]); const out = draw(s, l);
    expect(out).toContain('2 υπηρεσίες την ίδια μέρα'); expect(out).toContain('έχει 2 υπηρεσίες στις 14/10/2026 (Θ1α/Μ1). Πόσες μετρούν;');
    expect(out).toContain('Μετρά για 1'); expect(out).toContain('Μετρά για 2'); expect(out).not.toMatch(/undefined|\[object|NaN/);
  });
  it('πολλά άτομα: λίστα με 1/2 και «Αποθήκευση»', () => {
    const s = base(); const l = [...onceCandidates({ ...s, guards: {} }, s, [D]), { date: D, who: '2', name: 'ΑΛΛΟΣ', codes: ['Θ2α', 'Μ1'], n: 2 }]; const out = draw(s, l);
    expect(l.length).toBeGreaterThan(1); expect(out).toContain('Αποθήκευση'); expect(out).toContain('ΑΛΛΟΣ'); expect(out).toContain('aria-pressed');
  });
});
