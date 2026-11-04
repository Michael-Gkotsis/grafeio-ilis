// Δυναμολόγιο-Παρουσιολόγιο στελεχών-ΣΤΡ (Michael, 3/11): επόμενη εργάσιμη, απουσίες, ειδικότητα στελεχών, γραμμές-διαχωριστικά, έτοιμο έντυπο. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import { dayFor, nextWorkday } from '../src/shared/dates';
import { absenceOfCadre, absenceOfPerson } from '../src/shared/absence';
import { FIELDS, PRESETS, defaultPick, guessField, tableDay, withBuilt, forBuild, type Report } from '../src/shared/reports';
import { evalTables } from '../src/shared/values';
import { defaultBinding, mapColumns, fieldsOf } from '../src/shared/sources';
import { planCadres } from '../src/shared/cadreSource';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, inspectTemplate } from '../src/main/reports';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const D = '2026-10-23';   // Παρασκευή
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const st = (pid: number, type: string, extra: Partial<Status> = {}) => ({ id: 'q' + pid + type, pid, type, from: D, to: D, note: '', ...extra }) as unknown as Status;

describe('επόμενη εργάσιμη', () => {
  it('Παρασκευή → Δευτέρα, αργία παραλείπεται', () => {
    expect(nextWorkday('2026-10-23')).toBe('2026-10-26');
    expect(nextWorkday('2026-10-22')).toBe('2026-10-23');
    expect(nextWorkday('2026-10-22', d => d === '2026-10-23' || d === '2026-10-24' || d === '2026-10-25')).toBe('2026-10-26');
    expect(nextWorkday('2026-10-26', d => d === '2026-10-27' || d === '2026-10-31' || d === '2026-11-01')).toBe('2026-10-28');
  });
  it('dayFor: +N και ημέρα της εβδομάδας', () => {
    expect(dayFor('', D)).toBe(D); expect(dayFor('next', D)).toBe('2026-10-26'); expect(dayFor('+2', D)).toBe('2026-10-25');
    expect(dayFor('wd5', '2026-10-21')).toBe('2026-10-23'); expect(dayFor('wd0', D)).toBe('2026-10-25'); expect(dayFor('wd5', D)).toBe(D);
  });
  it('tableDay παραλείπει τις αργίες της εφαρμογής', () => {
    const s = fakeState(2); s.settings = { ...s.settings, holidays: { ...(s.settings as never as { holidays?: object }).holidays, '2026-10-26': 'ΔΟΚΙΜΗ' } } as never;
    expect(tableDay(fakeState(2), 'next', D)).toBe('2026-10-26');
    expect(tableDay(s, 'next', D)).toBe(tableDay(s, 'next', D));
  });
});

describe('ΑΠΩΝ, αιτία, επιστροφή', () => {
  it('στρατιώτης: άδεια → αύριο από το «Έως»· με ώρα επιστροφής την ίδια μέρα· εξοδούχος δεν είναι απών', () => {
    const s = fakeState(6);
    s.statuses = [st(1, 'HON', { to: '2026-10-25' }), st(2, 'SICK', { to: '2026-10-24', toTime: '12:00' }), st(3, 'OUT'), st(4, 'STEP'), st(5, 'LEAVE', { kind: 'Γάμου' })];
    const a = (i: number) => absenceOfPerson(s, s.people[i - 1], D);
    expect(a(1)).toEqual({ absent: true, reason: 'ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ', ret: '2026-10-26' });
    expect(a(2)).toEqual({ absent: true, reason: 'ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ', ret: '2026-10-24' });
    expect(a(3).absent).toBe(false); expect(a(4)).toMatchObject({ absent: true, reason: 'ΕΙΣΑΓΩΓΗ ΣΤΕΠ' });
    expect(a(5).reason).toBe('ΓΑΜΟΥ'); expect(a(6)).toEqual({ absent: false, reason: '', ret: '' });
  });
  it('στέλεχος: κατάσταση από τον πίνακα των στελεχών', () => {
    let s = run(fakeState(2), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑΣ', first: 'ΠΡΩΤΟΣ' } });
    const c = s.cadreList[0];
    s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'Κανονική άδεια', from: '2026-10-26', to: '2026-10-28' } });
    expect(absenceOfCadre(s, c, D).absent).toBe(false);
    expect(absenceOfCadre(s, c, '2026-10-26')).toMatchObject({ absent: true, ret: '2026-10-29' });
  });
});

describe('ειδικότητα στελεχών', () => {
  it('αποθήκευση με κεφαλαία και ΕΙΔΙΚΟΤΗΤΑ δεν μπερδεύεται με Ο/Σ', () => {
    const s = run(fakeState(2), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑΣ', first: 'ΠΡΩΤΟΣ', spec: 'ΠΖ', eid: ' διοικητικός ' } });
    expect(s.cadreList[0]).toMatchObject({ spec: 'ΠΖ', eid: 'ΔΙΟΙΚΗΤΙΚΟΣ' });
    const cols = mapColumns(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΙΚΟΤΗΤΑ'], fieldsOf('cadres'));
    expect(cols).toMatchObject({ spec: 2, eid: 5 });
    expect(mapColumns(['ΕΙΔΙΚΟΤΗΤΑ', 'ΕΠΩΝΥΜΟ'], fieldsOf('cadres'))).toMatchObject({ eid: 0 });
    expect(guessField('cadre', 'ΕΙΔΙΚΟΤΗΤΑ')).toBe('cspec'); expect(guessField('people', 'ΕΙΔΙΚΟΤΗΤΑ')).toBe('spec');
    expect(FIELDS.cadre.some(f => f.k === 'cspec')).toBe(true);
  });
  it('γράφεται και διαβάζεται από το Excel των στελεχών (προαιρετική στήλη στο τέλος)', async () => {
    let s = run(fakeState(2), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑΣ', first: 'ΠΡΩΤΟΣ' } });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-eid-')), 'ΣΤΕΛΕΧΗ.xlsx');
    let w = await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true });
    if (!w.ok) throw new Error(w.error);
    expect(w.binding?.cols.eid).toBeUndefined();   // χωρίς τιμή δεν μπαίνει στήλη
    s = run(s, { t: 'saveCadre', cadre: { id: s.cadreList[0].id, rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑΣ', first: 'ΠΡΩΤΟΣ', eid: 'ΟΔΗΓΟΣ' } });
    w = await writeSource('cadres', w.binding || defaultBinding('cadres', file), s, w.meta as never, D);
    if (!w.ok) throw new Error(w.error);
    const sh = (await readBook(file)).sheets.find(x => x.name === 'ΣΤΕΛΕΧΗ')!;
    expect(sh.rows[1]).toContain('ΕΙΔΙΚΟΤΗΤΑ');
    const eidCol = sh.rows[1].indexOf('ΕΙΔΙΚΟΤΗΤΑ'); expect(sh.rows[2][eidCol]).toBe('ΟΔΗΓΟΣ');
    const rd = planCadres(sh, w.binding!, s, { keys: w.meta.keys, base: w.meta.base });
    expect(rd.updates).toEqual([]);   // ίδια τιμή: καμία αλλαγή
  });
});

describe('γραμμές αξιών με δική τους μέρα και ώρα', () => {
  it('δείπνο Παρασκευής 19:00: μετρά εκείνη τη στιγμή', () => {
    const s = fakeState(6);
    s.statuses = [st(1, 'LEAVE', { from: '2026-10-23', to: '2026-10-23' }), st(2, 'LEAVE', { from: '2026-10-24', to: '2026-10-25' })];
    const row = (day?: string) => ({ label: 'Χ', expr: [{ sign: '+' as const, metric: 'str.inside' }], ...(day ? { day, time: '19:00' } : {}) });
    const out = evalTables(s, '2026-10-21', 600, [{ id: 'v', rows: [row(), row('wd5'), row('wd6')] }]);
    expect(out[0].rows.map(r => r.v)).toEqual([6, 5, 5]);
  });
});

describe('γραμμή-διαχωριστικό κάτω από τις επικεφαλίδες', () => {
  it('οι νέες γραμμές δεν παίρνουν ύψος 0,75', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet(0);
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΙΤΙΑ', 'ΕΠΙΣΤΡΟΦΗ', 'Ζ'].forEach((h, i) => ws.set('ABCDEFG'[i] + '2', h));
    ws.setRowHeight(3, 0.75); ws.addMerge('A4:G4'); ws.setRowHeight(4, 15);
    for (let r = 5; r <= 6; r++) { ws.set('A' + r, r - 4); ws.set('B' + r, 'ΔΕΙΓΜΑ'); ws.set('C' + r, 'ΔΕΙΓΜΑ'); ws.setRowHeight(r, 15); }
    const tpl = await wb.save();
    const insp = await inspectTemplate(tpl, 'people', undefined, 2);
    expect(insp.data).toBe(5);
    const s = fakeState(5);
    const r = { id: 'r1', name: 'Χ', tpl: 't', kind: 'people', sheet: insp.sheet, head: 2, cols: [{ f: 'aa', c: 1 }, { f: 'rank', c: 2 }, { f: 'last', c: 3 }, { f: 'first', c: 4 }], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' } as unknown as Report;
    const out = await fillReport(tpl, s, r, s.people.map(p => p.id), D);
    const o = await Workbook.open(out.data); const w2 = await o.sheet(0);
    for (let rr = 5; rr <= 9; rr++) { expect(w2.rowHeight(rr)).toBeGreaterThan(5); expect(w2.get('C' + rr)).toBeTruthy(); }
    expect(w2.rowHeight(3)).toBeLessThan(1);
  });
  it('οι γραμμές-δείγμα που περισσεύουν αδειάζουν', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet(0);
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ'].forEach((h, i) => ws.set('ABC'[i] + '1', h));
    for (let r = 2; r <= 6; r++) { ws.set('A' + r, r - 1); ws.set('B' + r, 'ΔΕΙΓΜΑ'); ws.set('C' + r, 'ΔΕΙΓΜΑ'); }
    const tpl = await wb.save();
    const s = fakeState(2);
    const r = { id: 'r1', name: 'Χ', tpl: 't', kind: 'people', sheet: 'Φ', head: 1, cols: [{ f: 'aa', c: 1 }, { f: 'rank', c: 2 }, { f: 'last', c: 3 }], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' } as unknown as Report;
    const w2 = await (await Workbook.open((await fillReport(tpl, s, r, [1, 2], D)).data)).sheet(0);
    expect(w2.get('C2')).not.toBe('ΔΕΙΓΜΑ'); expect(w2.get('B4')).toBeNull(); expect(w2.get('C6')).toBeNull();
  });
});

describe('έτοιμο Δυναμολόγιο-Παρουσιολόγιο στελεχών', () => {
  const pre = PRESETS.find(p => p.id === 'stelexi')!;
  it('δομή του έτοιμου', () => {
    expect(pre.kind).toBe('cadre');
    expect(pre.opts.cols.map(c => c.h)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΙΚΟΤΗΤΑ', 'ΘΕΣΗ', 'ΑΠΩΝ', 'ΑΙΤΙΑ ΑΠΟΥΣΙΑΣ', 'ΗΜ/ΝΙΑ ΕΠΙΣΤΡΟΦΗΣ']);
    expect(pre.opts.tday).toBe('next'); expect(pre.opts.more!.map(t => t.kind)).toEqual(['people', 'status']);
    expect(pre.vals!.length).toBe(3);
  });
  it('βγαίνει με στελέχη την επόμενη εργάσιμη και οπλίτες τη μέρα του εντύπου', async () => {
    let s = fakeState(6);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΑΛΦΑΣ', first: 'ΠΡΩΤΟΣ', eid: 'ΟΔΗΓΟΣ' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'Κανονική άδεια', from: '2026-10-26', to: '2026-10-28' } });
    s.statuses = [st(1, 'HON', { to: '2026-10-25' })];
    const b = await buildTemplate(pre.opts, 'cadre');
    const r = withBuilt({ id: 'r1', name: pre.name, tpl: 't', kind: 'cadre', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', vals: pre.vals, more: pre.opts.more!.map((t, i) => ({ id: t.id, kind: t.kind, head: 1, cols: [], title: t.title, pick: pre.more![i].pick!, sort: 'room' as const })) } as unknown as Report, b, pre.opts);
    const out = await fillReport(b.data, s, r, s.cadreList.map(c => c.id), D, { clock: { today: D, now: 600 } });
    const ws = await (await Workbook.open(out.data)).sheet(0);
    const all: string[] = []; for (let rr = 1; rr <= 40; rr++) for (const c of 'ABCDEFGHIJ') { const v = ws.get(c + rr); if (v != null) all.push(String(v)); }
    const text = all.join('|');
    expect(text).toContain('26 ΟΚΤ 26');   // η επόμενη εργάσιμη στον τίτλο
    expect(text).toContain('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'); expect(text).toContain('ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ'); expect(text).toContain('ΟΔΗΓΟΣ'); expect(text).toContain('ΠΑΡΑΣΚΕΥΗ');
    expect(out.warnings).toEqual([]);
    void forBuild;
  });
});

describe('Καταστάσεις: μόνο ορισμένα είδη (Michael 4/11)', () => {
  it('με types: [EY] μπαίνουν μόνο οι ελεύθεροι υπηρεσίας, όχι όλα τα ιατρικά', async () => {
    const { rowsOf } = await import('../src/shared/reports');
    const s = fakeState(6); const D = '2026-11-04';
    s.statuses = [{ id: 'a', pid: 1, type: 'EY', from: D, to: D, note: '' }, { id: 'b', pid: 2, type: 'EA', from: D, to: D, note: '' }] as unknown as Status[];
    const base = { ...defaultPick(), cats: ['med' as const] };
    const all = rowsOf(s, { kind: 'status', pick: base } as unknown as Report, D);
    const ey = rowsOf(s, { kind: 'status', pick: { ...base, types: ['EY'] } } as unknown as Report, D);
    expect(all.length).toBe(2); expect(ey.map(r => (r as unknown as { st: Status }).st.type)).toEqual(['EY']);
    const m2 = PRESETS.find(p => p.id === 'stelexi')!.more![1];
    expect(m2.pick?.types).toEqual(['EY']);
  });
});
