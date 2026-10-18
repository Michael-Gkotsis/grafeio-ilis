// Ώρες στις άδειες (Michael, 13/10): ώρα αναχώρησης και ώρα επιστροφής, προαιρετικές. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import JSZip from 'jszip';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { DEFAULT_SETTINGS, type AppState, type Status } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { cellTime, normTime, rangeHm } from '../src/shared/hours';
import { dutyBlock, fillDay, guardUnavailable, planStatusChange, postBy, postSpan } from '../src/shared/rules';
import { diffStatuses, defaultBinding, identity, parseStatuses, planWrite, recVal, timeCols, type SourceBinding } from '../src/shared/sources';
import { dm } from '../src/shared/dates';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'h' + ++seq });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today)).state;
const leave = (pid: number, from: string, to: string, x: Partial<Status> = {}): Status => ({ id: 'l' + pid, pid, type: 'LEAVE', from, to, kind: 'Κανονική', ...x });
const with1 = (st: Status): AppState => ({ ...fakeState(30), statuses: [st] });
const P = (s: AppState, k: string) => postBy(s, k)!;

describe('ώρες: ανάγνωση', () => {
  it('normTime δέχεται 14, 1400, 14.00, 9:30 και κενό', () => {
    expect(['14', '1400', '14.00', '14:00', '9:30', ' 22 ', '24:00', ''].map(normTime)).toEqual(['14:00', '14:00', '14:00', '14:00', '09:30', '22:00', '00:00', '']);
    expect(['25:00', '14:75', 'πρωί', '1:2'].map(normTime)).toEqual([null, null, null, null]);
  });
  it('cellTime: ώρα του Excel (κλάσμα, ημερομηνία με ώρα), αριθμός, κείμενο', () => {
    expect(cellTime(14 / 24)).toBe('14:00');
    expect(cellTime(46310 + 22 / 24)).toBe('22:00');
    expect(cellTime(new Date(Date.UTC(1899, 11, 30, 8, 30)))).toBe('08:30');
    expect(cellTime(14)).toBe('14:00');
    expect(cellTime('21.30')).toBe('21:30');
    expect(cellTime(null)).toBeNull(); expect(cellTime('')).toBeNull(); expect(cellTime(';)')).toBeNull();
  });
  it('διάρκεια θέσεων: βάρδιες ως το πρωί της επόμενης, Λ/Υ 14:00 → 14:00, μαγειρεία άγνωστη', () => {
    const s = fakeState(1);
    expect(postSpan(P(s, 'th1'))).toEqual({ start: 14 * 60, end: 32 * 60 });   // 14:00 ως 08:00
    expect(postSpan(P(s, 'th4'))).toEqual({ start: 20 * 60, end: 38 * 60 });   // 20:00 ως 14:00
    expect(postSpan(P(s, 'ly'))).toEqual({ start: 14 * 60, end: 38 * 60 });
    expect(postSpan(P(s, 'mg1'))).toEqual({ start: null, end: null });
  });
  it('κείμενο για την ΗΚΑΙ: χωρίς ώρες όπως πριν', () => {
    expect(rangeHm(leave(1, '2026-10-14', '2026-10-17'), dm)).toBe('14/10–17/10');
    expect(rangeHm(leave(1, '2026-10-14', '2026-10-14'), dm)).toBe('14/10');
    expect(rangeHm(leave(1, '2026-10-14', '2026-10-17', { fromTime: '14:00', toTime: '22:00' }), dm)).toBe('14/10 14:00–17/10 22:00');
    expect(rangeHm(leave(1, '2026-10-14', '2026-10-14', { fromTime: '08:00', toTime: '12:00' }), dm)).toBe('14/10 08:00–12:00');
  });
});

describe('ώρες: υπηρεσίες', () => {
  const pid = 3;
  it('χωρίς ώρες: όπως πριν (όλη η μέρα, και η προηγούμενη μέρα ελεύθερη)', () => {
    const s = with1(leave(pid, '2026-10-14', '2026-10-16'));
    for (const k of ['th1', 'th4', 'ly', 'mg1']) {
      expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, k))).toBe('ΚΑ');
      expect(dutyBlock(s.statuses, '2026-10-13', pid, P(s, k))).toBeNull();
    }
  });
  it('επιστροφή 12:00: μπαίνει σε υπηρεσία την ίδια μέρα (ξεκινά 14:00)· όχι στη μαγειρεία', () => {
    const s = with1(leave(pid, '2026-10-14', '2026-10-16', { toTime: '12:00' }));
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'th1'))).toBeNull();
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'ly'))).toBeNull();
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'mg1'))).toBe('ΚΑ');
    expect(dutyBlock(s.statuses, '2026-10-15', pid, P(s, 'th1'))).toBe('ΚΑ έως 16/10');
  });
  it('επιστροφή 19:00: μόνο θέσεις που ξεκινούν μετά (4ο νούμερο 20:00)', () => {
    const s = with1(leave(pid, '2026-10-14', '2026-10-16', { toTime: '19:00' }));
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'th1'))).toBe('ΚΑ');
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'th4'))).toBeNull();
    expect(dutyBlock(s.statuses, '2026-10-16', pid, P(s, 'ly'))).toBe('ΚΑ');
  });
  it('αναχώρηση 10:00: η υπηρεσία της προηγούμενης μέρας μόνο αν τελειώνει ως τις 10:00', () => {
    const s = with1(leave(pid, '2026-10-14', '2026-10-16', { fromTime: '10:00' }));
    const d = '2026-10-13';
    expect(dutyBlock(s.statuses, d, pid, P(s, 'th1'))).toBeNull();    // ως 08:00
    expect(dutyBlock(s.statuses, d, pid, P(s, 'th2'))).toBeNull();    // ως 10:00
    expect(dutyBlock(s.statuses, d, pid, P(s, 'th3'))).toBe('Φεύγει ΚΑ 14/10 στις 10:00');   // ως 12:00
    expect(dutyBlock(s.statuses, d, pid, P(s, 'ly'))).toBe('Φεύγει ΚΑ 14/10 στις 10:00');
    expect(dutyBlock(s.statuses, d, pid, P(s, 'mg1'))).toBeNull();    // μαγειρεία της ημέρας
    expect(dutyBlock(s.statuses, '2026-10-14', pid, P(s, 'th1'))).toBe('ΚΑ έως 16/10');
  });
  it('αναχώρηση 14:00: η προηγούμενη μέρα ελεύθερη για όλες τις θέσεις', () => {
    const s = with1(leave(pid, '2026-10-14', '2026-10-16', { fromTime: '14:00' }));
    for (const k of ['th1', 'th4', 'ly', 'mg1']) expect(dutyBlock(s.statuses, '2026-10-13', pid, P(s, k))).toBeNull();
  });
  it('η αυτόματη συμπλήρωση σέβεται τις ώρες', () => {
    let s = with1(leave(pid, '2026-10-14', '2026-10-16', { fromTime: '09:00', toTime: '12:00' }));
    s = { ...s, settings: { ...DEFAULT_SETTINGS, blocks: s.settings.blocks } };
    const g13 = fillDay(s, '2026-10-13').guards['2026-10-13'];
    for (const [k, v] of Object.entries(g13)) if (v === pid) expect(['th1', 'th5', 'mg1', 'mg2', 'mg3', 'mg4', 'mg5'], k).toContain(k);
    expect(guardUnavailable(s, '2026-10-16', pid, 'th1')).toBeNull();
  });
  it('η δήλωση με ώρα αναχώρησης αδειάζει την υπηρεσία της προηγούμενης μέρας που δεν προλαβαίνει', () => {
    let s = fakeState(30);
    s = { ...s, guards: { '2026-10-13': { th3: pid, th1: 5 } } };
    const cmd = { type: 'LEAVE' as const, pids: [pid], from: '2026-10-14', to: '2026-10-16', kind: 'Κανονική', fromTime: '10:00' };
    expect(planStatusChange(s, cmd, TODAY).conflicts).toEqual([{ pid, date: '2026-10-13', k: 'th3' }]);
    expect(planStatusChange(s, { ...cmd, fromTime: undefined }, TODAY).conflicts).toEqual([]);
    const n = run(s, { t: 'declare', cmd });
    expect(n.guards['2026-10-13']).toEqual({ th1: 5 });
    expect(n.statuses[0]).toMatchObject({ fromTime: '10:00' }); expect(n.statuses[0].toTime).toBeUndefined();
  });
  it('η δήλωση ελέγχει τις ώρες και δεν τις κρατά σε άλλα είδη', () => {
    const s = fakeState(5);
    expect(() => run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [2], from: '2026-10-14', to: '2026-10-14', fromTime: '14:00', toTime: '12:00' } })).toThrow(/μετά την αναχώρηση/);
    expect(() => run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [2], from: '2026-10-14', to: '2026-10-15', fromTime: 'αύριο' } })).toThrow(/δεν διαβάζεται/);
    const e = run(s, { t: 'declare', cmd: { type: 'EY', pids: [2], from: '2026-10-14', to: '2026-10-15', fromTime: '10:00' } });
    expect(e.statuses[0].fromTime).toBeUndefined();
    const h = run(s, { t: 'declare', cmd: { type: 'HON', pids: [2], from: '2026-10-14', to: '2026-10-15', toTime: '2200' } });
    expect(h.statuses[0].toTime).toBe('22:00');
  });
  it('ώρες σε άδεια που υπάρχει: αλλάζουν, σβήνουν, αδειάζουν υπηρεσία που δεν γίνεται πια', () => {
    let s = with1(leave(pid, '2026-10-14', '2026-10-16'));
    s = { ...s, guards: { '2026-10-13': { ly: pid } } };
    s = run(s, { t: 'setTimes', id: 'l' + pid, fromTime: '8', toTime: '12:00' });
    expect(s.statuses[0]).toMatchObject({ fromTime: '08:00', toTime: '12:00' });
    expect(s.guards['2026-10-13']).toEqual({});
    s = run(s, { t: 'setTimes', id: 'l' + pid, fromTime: '', toTime: '' });
    expect('fromTime' in s.statuses[0] || 'toTime' in s.statuses[0]).toBe(false);
  });
});

describe('ώρες: Excel «Άδειες»', () => {
  const s0 = fakeState(4); const p = s0.people[2];
  const HEAD = ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ', 'ΕΩΣ', 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ'];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Α', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, tout: 4, to: 5, tin: 6 }, write: true };
  const D = (iso: string) => new Date(iso + 'T00:00:00Z');
  const sheet = (tout: unknown, tin: unknown): RawSheet => ({ name: 'Α', rows: [HEAD, [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D('2026-10-14'), tout as any, D('2026-10-16'), tin as any]] });
  it('διαβάζονται από τις στήλες ωρών (κείμενο ή ώρα του Excel)', () => {
    const d = diffStatuses('leave', s0, parseStatuses('leave', sheet('14:00', 22 / 24), b, s0.people, TODAY), b);
    expect(d.add).toEqual([{ pid: p.id, type: 'LEAVE', from: '2026-10-14', to: '2026-10-16', kind: 'ΚΑΝΟΝΙΚΗ', fromTime: '14:00', toTime: '22:00' }]);
  });
  it('αλλαγή ή σβήσιμο ώρας στο Excel περνά στην εφαρμογή', () => {
    const st = leave(p.id, '2026-10-14', '2026-10-16', { kind: 'ΚΑΝΟΝΙΚΗ', fromTime: '14:00', toTime: '22:00' });
    const s = { ...s0, statuses: [st] };
    const d = diffStatuses('leave', s, parseStatuses('leave', sheet('16:00', null), b, s.people, TODAY), b);
    expect(d.update).toMatchObject([{ patch: { fromTime: '16:00', toTime: '' } }]);
    const n = run(s, { t: 'importRecords', adds: [], updates: d.update.map(u => ({ id: u.id, patch: u.patch })), source: 'x', what: 'άδειες' });
    expect(n.statuses[0].fromTime).toBe('16:00'); expect('toTime' in n.statuses[0]).toBe(false);
  });
  it('γράφονται στις στήλες ωρών· ίδια ώρα ως ώρα του Excel δεν ξαναγράφεται', () => {
    const st = leave(p.id, '2026-10-14', '2026-10-16', { kind: 'ΚΑΝΟΝΙΚΗ', fromTime: '14:00', toTime: '22:00' });
    const s = { ...s0, statuses: [st] }; const keys = [identity(p.id, 'leave', st.from)];
    expect(planWrite('leave', sheet(14 / 24, '22:00'), b, s, keys, TODAY).sets).toEqual([]);
    const sets = planWrite('leave', sheet(null, '21:00'), b, s, keys, TODAY).sets;
    expect(sets).toEqual([{ r: 1, c: 4, v: '14:00' }, { r: 1, c: 6, v: '22:00' }]);
  });
  it('χωρίς ώρες η τιμή σύγκρισης μένει ίδια με πριν (καμία ψεύτικη «αλλαγή στην εφαρμογή» μετά την αναβάθμιση)', () => {
    const st = leave(p.id, '2026-10-14', '2026-10-16');
    expect(recVal(st)).toBe(['2026-10-16', 'LEAVE', 'Κανονική', '', '', ''].join('\u0001'));
  });
  it('πίνακας χωρίς στήλες ωρών: μπαίνουν στο τέλος μόνο όταν κάποια άδεια έχει ώρα', () => {
    const b2: SourceBinding = { ...b, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4, note: 5 } };
    const sh: RawSheet = { name: 'Α', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D('2026-10-14'), D('2026-10-16'), '']] };
    const plain = { ...s0, statuses: [leave(p.id, '2026-10-14', '2026-10-16')] };
    expect(timeCols('leave', sh, b2, plain, TODAY)).toEqual({ b: b2, head: [] });
    const timed = { ...s0, statuses: [leave(p.id, '2026-10-14', '2026-10-16', { toTime: '22:00' })] };
    const t = timeCols('leave', sh, b2, timed, TODAY);
    expect(t.b.cols).toMatchObject({ tout: 6, tin: 7 });
    expect(t.head).toEqual([{ r: 0, c: 6, v: 'ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ' }, { r: 0, c: 7, v: 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ' }]);
    expect(timeCols('punish', sh, b2, timed, TODAY).head).toEqual([]);
  });
  it('στο αρχείο: οι στήλες γράφονται με επικεφαλίδα, κρατιούνται στην αντιστοίχιση και ξαναδιαβάζονται', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-hrs-')); const file = path.join(dir, 'ΑΔΕΙΕΣ.xlsx');
    const wb = await Workbook.blank('ΑΔΕΙΕΣ'); const ws = await wb.sheet('ΑΔΕΙΕΣ');
    ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΕΩΣ'].forEach((h, c) => ws.set(String.fromCharCode(65 + c) + '1', h).setStyle(String.fromCharCode(65 + c) + '1', 1));
    fs.writeFileSync(file, await wb.save());
    const b3: SourceBinding = { file, sheet: 'ΑΔΕΙΕΣ', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4 }, write: true, scope: 'all' };
    const s = { ...s0, statuses: [leave(p.id, '2026-10-14', '2026-10-16', { fromTime: '14:00', toTime: '22:00' })] };
    const w = await writeSource('leave', b3, s, undefined, TODAY);
    expect(w.ok && w.binding?.cols).toMatchObject({ tout: 5, tin: 6 });
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows[0].slice(5, 7)).toEqual(['ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ', 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ']);
    expect(rows[1].slice(5, 7)).toEqual(['14:00', '22:00']);
    const back = (await Workbook.open(fs.readFileSync(file)));
    // η επικεφαλίδα πήρε το πλαίσιο της διπλανής (και αναδιπλώνεται, αφού δεν χωράει στη στενή στήλη)
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(await (await JSZip.loadAsync(fs.readFileSync(file))).file('xl/styles.xml')!.async('string'))![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
    const frame = async (ref: string) => xfs[(await back.sheet('ΑΔΕΙΕΣ')).style(ref)!].match(/borderId="\d+"/g);
    expect(await frame('F1')).toEqual(await frame('E1'));
    if (!w.ok) return;
    const d = diffStatuses('leave', s, parseStatuses('leave', { name: 'ΑΔΕΙΕΣ', rows }, w.binding!, s.people, TODAY), w.binding!);
    expect(d.update).toEqual([]); expect(d.same).toBe(1);
  });
  it('νέος πίνακας «Άδειες» από την εφαρμογή έχει στήλες ωρών', () => {
    expect(defaultBinding('leave', 'x.xlsx').cols).toHaveProperty('tout');
    expect(defaultBinding('leave', 'x.xlsx').cols).toHaveProperty('tin');
  });
});
