// «Κείμενο στην ΗΚΑΙ» ανά είδος άδειας και «Κατεύθυνση» (Michael, 1/11). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { type AppState, type Status } from '../src/shared/domain';
import { hkaiLeaveLines, hkaiReqLines, lineText, leaveHk, leaveDest, destNote, reqWhat } from '../src/shared/hkaiText';
import { leavePhrase, leaveName, leaveKey, leaveTextOf, badgeLbl, cadreLeaveKey, type UserLists } from '../src/shared/ranks';
import { diffStatuses, parseStatuses, planWrite, recVal, timeCols, defaultBinding, identity, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-11-02', D = '2026-11-04';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 't' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const lv = (pid: number, x: Partial<Status> = {}): Status => ({ id: 'l' + pid + (x.kind || x.type || ''), pid, type: 'LEAVE', from: D, to: D, kind: 'Κανονική', ...x });
const withLists = (lists: UserLists, statuses: Status[] = []): AppState => {
  const s = fakeState(6); s.settings.lists = lists; s.statuses = statuses;
  s.hkaiManual = { [D]: { cells: {}, text: {}, lv: true } } as any;   // ανοιχτό το «Άδειες στο 3. Άδειες» της μέρας
  return s;
};
const lines = (s: AppState) => hkaiLeaveLines(s, D).map(lineText);

describe('κείμενο στην ΗΚΑΙ: κλειδιά και βοηθητικά', () => {
  it('«Ειδική» και «Ειδική άδεια» είναι το ίδιο κλειδί· τιμητική και αναρρωτική σταθερά', () => {
    expect(leaveKey({ type: 'LEAVE', kind: 'Ειδική' })).toBe(leaveKey({ type: 'LEAVE', kind: 'ειδική  ΑΔΕΙΑ' }));
    expect(leaveKey({ type: 'LEAVE', kind: undefined })).toBe(leaveKey({ type: 'LEAVE', kind: 'Κανονική άδεια' }));
    expect(leaveKey({ type: 'HON' })).toBe('ΤΙΜΗΤΙΚΗ'); expect(leaveKey({ type: 'SICK' })).toBe('ΑΝΑΡΡΩΤΙΚΗ');
    expect(cadreLeaveKey('ka')).toBe('Σ:ka');
  });
  it('χωρίς ρύθμιση: όπως πριν (leavePhrase), και το leaveName μένει ίδιο', () => {
    for (const st of [{ type: 'LEAVE', kind: 'Κανονική' }, { type: 'LEAVE', kind: 'ΑΜΔ' }, { type: 'LEAVE', kind: 'Αιμοδοσίας' }, { type: 'HON' }, { type: 'SICK' }] as Pick<Status, 'type' | 'kind'>[]) {
      expect(leaveHk(st)).toBe(leaveName(st)); expect(leaveHk(st, {})).toBe(leaveName(st));
    }
    expect(leavePhrase({ type: 'LEAVE', kind: 'Κανονική' })).toBe('Κανονική άδεια');
    expect(leavePhrase({ type: 'LEAVE', kind: 'ΑΜΔ' })).toBe('Άδεια ΑΜΔ');
    expect(leaveTextOf({ type: 'LEAVE', kind: 'Κανονική' }, {})).toBeUndefined();
  });
  it('με ρύθμιση: το κείμενο γράφεται με κεφαλαία· κενό ή κενά = το όνομα του είδους', () => {
    const lists: UserLists = { leaveText: { 'ΚΑΝΟΝΙΚΗ': { t: ' κανονική άδεια εξόδου ' }, 'ΑΜΔ': { t: '   ' } } };
    expect(leaveHk({ type: 'LEAVE', kind: 'Κανονική' }, lists)).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΕΞΟΔΟΥ');
    expect(leaveHk({ type: 'LEAVE', kind: 'ΑΜΔ' }, lists)).toBe('ΑΔΕΙΑ ΑΜΔ');
  });
  it('Λ5: το σήμα δείχνει το είδος, εκτός από την Κανονική', () => {
    expect(badgeLbl({ type: 'LEAVE', kind: 'Κανονική' })).toBe('ΚΑ');
    expect(badgeLbl({ type: 'LEAVE' })).toBe('ΚΑ');
    expect(badgeLbl({ type: 'LEAVE', kind: 'ΑΜΔ' })).toBe('ΑΜΔ');
    expect(badgeLbl({ type: 'LEAVE', kind: 'Ειδική' })).toBe('Ειδική');
    expect(badgeLbl({ type: 'SICK' })).not.toBe('');
  });
  it('οδηγίες κάτω από το πεδίο κατεύθυνσης', () => {
    const lists: UserLists = { leaveText: { 'ΚΑΝΟΝΙΚΗ': { dest: true } } };
    expect(leaveDest({ type: 'LEAVE', kind: 'Κανονική', dest: 'Κόρινθο' }, lists)).toBe(' ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ');
    expect(leaveDest({ type: 'LEAVE', kind: 'Κανονική', dest: 'Κόρινθο' })).toBe(''); expect(leaveDest({ type: 'LEAVE', kind: 'Κανονική' }, lists)).toBe('');
    expect(destNote({ type: 'LEAVE', kind: 'Κανονική' }, '', lists)).toMatch(/Προαιρετικό/);
    expect(destNote({ type: 'LEAVE', kind: 'Κανονική' }, 'Κόρινθος', lists)).toMatch(/^Γράφεται στην/);
    expect(destNote({ type: 'LEAVE', kind: 'ΑΜΔ' }, 'Κόρινθος', lists)).toMatch(/Δεν γράφεται.*ΑΜΔ/);
  });
});

describe('3. ΑΔΕΙΕΣ και 5. ΑΙΤΗΣΕΙΣ της ΗΚΑΙ', () => {
  it('χωρίς ρυθμίσεις: οι γραμμές είναι αυτές που ήταν, ακόμη κι αν η άδεια έχει κατεύθυνση', () => {
    const s = withLists({}, [lv(1, { dest: 'Κόρινθο' }), lv(2, { type: 'HON', kind: undefined }), lv(3, { type: 'SICK', kind: undefined })]);
    expect(lines(s)).toEqual([
      '1. ΔΝΕΑΣ (ΠΖ) ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26.',
      '2. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26.',
      '3. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26.'
    ]);
  });
  it('κάθε είδος με και χωρίς κείμενο, με και χωρίς κατεύθυνση', () => {
    const lists: UserLists = { leaveKinds: { add: [{ name: 'Αιμοδοσίας', col: 'ka' }] }, leaveText: {
      'ΚΑΝΟΝΙΚΗ': { t: 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΕΞΟΔΟΥ', dest: true }, 'ΕΙΔΙΚΗ': { dest: true }, 'ΑΜΔ': { t: 'ΑΜΔ ΜΕ ΕΙΔΙΚΗ ΕΓΚΡΙΣΗ' },
      'ΑΙΜΟΔΟΣΙΑΣ': { t: 'ΑΙΜΟΔΟΣΙΑ', dest: true }, 'ΤΙΜΗΤΙΚΗ': { t: 'ΤΙΜΗΤΙΚΗ', dest: true }, 'ΑΝΑΡΡΩΤΙΚΗ': { dest: true } } };
    const mk = (pid: number, kind: string | undefined, type: Status['type'], dest?: string) => lv(pid, { type, ...(kind ? { kind } : { kind: undefined }), ...(dest ? { dest } : {}) });
    const s = withLists(lists, [
      mk(1, 'Κανονική', 'LEAVE', 'Κόρινθο'), mk(2, 'Ειδική', 'LEAVE', 'Πάτρα'), mk(3, 'ΑΜΔ', 'LEAVE', 'Αθήνα'),
      mk(4, 'Αιμοδοσίας', 'LEAVE'), mk(5, undefined, 'HON', 'Βόλο'), mk(6, undefined, 'SICK', 'Λάρισα')
    ]);
    // οι γραμμές ταξινομούνται κατά όνομα: τη γραμμή κάθε στρατιώτη τη βρίσκουμε με το επώνυμό του
    const at = (pid: number) => lines(s).find(x => x.includes(' ' + s.people[pid - 1].last + ' '))!;
    const t = [1, 2, 3, 4, 5, 6].map(at);
    expect(t[0]).toMatch(/: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΕΞΟΔΟΥ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ\.$/);
    expect(t[1]).toMatch(/: ΕΙΔΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΠΑΤΡΑ\.$/);
    expect(t[2]).toMatch(/: ΑΜΔ ΜΕ ΕΙΔΙΚΗ ΕΓΚΡΙΣΗ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26\.$/);     // κείμενο, χωρίς ρύθμιση κατεύθυνσης
    expect(t[3]).toMatch(/: ΑΙΜΟΔΟΣΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26\.$/);                   // ρύθμιση κατεύθυνσης αλλά καμία κατεύθυνση
    expect(t[4]).toMatch(/: ΤΙΜΗΤΙΚΗ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΒΟΛΟ\.$/);
    expect(t[5]).toMatch(/: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΛΑΡΙΣΑ\.$/);
    for (const x of t) expect(x).toBe(x.toUpperCase());
  });
  it('οι άδειες από αίτηση δεν ξαναγράφονται στο 3., μόνο μία φορά στο 5. με το κείμενο και την κατεύθυνση', () => {
    let s = withLists({ leaveText: { 'ΚΑΝΟΝΙΚΗ': { t: 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΕΞΟΔΟΥ', dest: true } } });
    s = run(s, { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: D, to: D, dest: 'Κόρινθο' } } });
    const rl = () => hkaiReqLines(s, D).map(lineText);
    expect(rl()).toEqual(['1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΙΤΕΙΤΑΙ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΕΞΟΔΟΥ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ.']);
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    expect(s.statuses).toHaveLength(1); expect(s.statuses[0]).toMatchObject({ dest: 'Κόρινθο', req: s.requests[0].id });
    expect(lines(s)).toEqual([]); expect(rl()).toHaveLength(1);
  });
  it('αίτηση χωρίς ρύθμιση κατεύθυνσης: η κατεύθυνση δεν γράφεται, αλλά μένει στην αίτηση', () => {
    let s = withLists({});
    s = run(s, { t: 'addRequest', req: { pid: 4, date: D, text: 'για οικογενειακούς λόγους', leave: { type: 'LEAVE', kind: 'ΑΜΔ', from: D, to: D, dest: 'Κόρινθο' } } });
    expect(hkaiReqLines(s, D).map(lineText)).toEqual(['1. ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ: ΑΙΤΕΙΤΑΙ ΑΔΕΙΑ ΑΜΔ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26 ΓΙΑ ΟΙΚΟΓΕΝΕΙΑΚΟΥΣ ΛΟΓΟΥΣ.']);
    expect(s.requests[0].leave?.dest).toBe('Κόρινθο');
    expect(reqWhat(s.requests[0])).not.toMatch(/ΚΑΤΕΥΘΥΝΣΗ/i);
  });
  it('στελέχη: το κείμενο της κατάστασης (Σ:κωδικός)', () => {
    const s = withLists({ leaveText: { 'Σ:ka': { t: 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΣΤΕΛΕΧΟΥΣ' } } });
    s.cadreList = [{ id: 'c1', rank: 'ΛΧΙΑΣ', last: 'ΔΟΚΙΜΑΣΤΙΚΟΣ', first: 'ΕΨΙΛΟΝ', active: true } as any];
    s.cadreAbs = [{ id: 'a1', cid: 'c1', kind: 'ka', from: D, to: D }];
    expect(lines(s).join('\n')).toMatch(/ΔΟΚΙΜΑΣΤΙΚΟΣ ΕΨΙΛΟΝ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΣΤΕΛΕΧΟΥΣ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26\./);
    const plain = { ...s, settings: { ...s.settings, lists: {} } };
    expect(lines(plain).join('\n')).toMatch(/ΔΟΚΙΜΑΣΤΙΚΟΣ ΕΨΙΛΟΝ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΤΕΤ 04 ΝΟΕ 26\./);
  });
});

describe('κατεύθυνση: εντολές', () => {
  it('η δήλωση και οι ώρες κρατούν την κατεύθυνση χωρίς κενά· κενό = σβήσιμο', () => {
    let s = withLists({});
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [1], from: D, to: D, dest: '  Κόρινθο ' } as any });
    expect(s.statuses[0].dest).toBe('Κόρινθο');
    s = run(s, { t: 'setTimes', id: s.statuses[0].id, fromTime: '08:00', toTime: '', dest: 'Πάτρα' });
    expect(s.statuses[0]).toMatchObject({ dest: 'Πάτρα', fromTime: '08:00' });
    s = run(s, { t: 'setTimes', id: s.statuses[0].id, fromTime: '08:00', toTime: '', dest: '' });
    expect('dest' in s.statuses[0]).toBe(false);
  });
  it('η διόρθωση (replaceStatus) κρατά το id και τη σύνδεση με την αίτηση', () => {
    let s = withLists({});
    s = run(s, { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: D, to: D } } });
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    const id = s.statuses[0].id, req = s.requests[0].id;
    s = run(s, { t: 'replaceStatus', id, cmds: [{ type: 'LEAVE', kind: 'Ειδική', pids: [2], from: D, to: '2026-11-05', dest: 'Πάτρα' } as any] });
    expect(s.statuses).toHaveLength(1);
    expect(s.statuses[0]).toMatchObject({ req, kind: 'Ειδική', to: '2026-11-05', dest: 'Πάτρα' });
    expect(s.requests[0]).toMatchObject({ decision: 'ok', sid: s.statuses[0].id });   // η αίτηση δείχνει στη νέα άδεια
    expect(lines(s)).toEqual([]);   // και δεν γράφεται ξανά στο 3. ΑΔΕΙΕΣ
  });
});

describe('κατεύθυνση: Excel «Άδειες»', () => {
  const s0 = fakeState(4); const p = s0.people[2];
  const HEAD = ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΚΑΤΕΥΘΥΝΣΗ'];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Α', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4, dest: 5 }, write: true };
  const D0 = (iso: string) => new Date(iso + 'T00:00:00Z');
  const sheet = (dest: unknown): RawSheet => ({ name: 'Α', rows: [HEAD, [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D0('2026-10-14'), D0('2026-10-16'), dest as any]] });
  it('διαβάζεται από τη στήλη και περνά στην εφαρμογή· το σβήσιμο στο Excel το σβήνει', () => {
    const d = diffStatuses('leave', s0, parseStatuses('leave', sheet('Κόρινθο'), b, s0.people, TODAY), b);
    expect(d.add).toEqual([{ pid: p.id, type: 'LEAVE', from: '2026-10-14', to: '2026-10-16', kind: 'ΚΑΝΟΝΙΚΗ', dest: 'Κόρινθο' }]);
    const st = lv(p.id, { from: '2026-10-14', to: '2026-10-16', kind: 'ΚΑΝΟΝΙΚΗ', dest: 'Κόρινθο' });
    const s = { ...s0, statuses: [st] };
    const d2 = diffStatuses('leave', s, parseStatuses('leave', sheet(''), b, s.people, TODAY), b);
    expect(d2.update).toMatchObject([{ patch: { dest: '' } }]);
    const n = run(s, { t: 'importRecords', adds: [], updates: d2.update.map(u => ({ id: u.id, patch: u.patch })), source: 'x', what: 'άδειες' });
    expect('dest' in n.statuses[0]).toBe(false);
  });
  it('γράφεται στη στήλη (με κεφαλαία στο αρχείο)· ίδια τιμή δεν ξαναγράφεται', () => {
    const st = lv(p.id, { from: '2026-10-14', to: '2026-10-16', kind: 'ΚΑΝΟΝΙΚΗ', dest: 'Κόρινθο' });
    const s = { ...s0, statuses: [st] }; const keys = [identity(p.id, 'leave', st.from)];
    expect(planWrite('leave', sheet('Κόρινθο'), b, s, keys, TODAY).sets).toEqual([]);
    expect(planWrite('leave', sheet(null), b, s, keys, TODAY).sets).toEqual([{ r: 1, c: 5, v: 'Κόρινθο' }]);
  });
  it('χωρίς κατεύθυνση η τιμή σύγκρισης μένει ίδια με πριν', () => {
    expect(recVal(lv(p.id))).toBe(['2026-11-04', 'LEAVE', 'Κανονική', '', '', ''].join('\u0001'));
  });
  it('νέος πίνακας δεν παίρνει στήλη κατεύθυνσης· στον υπάρχοντα μπαίνει μόνο όταν κάποια άδεια έχει', () => {
    expect(defaultBinding('leave', 'x.xlsx').cols).not.toHaveProperty('dest');
    const b2: SourceBinding = { ...b, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4 } };
    const sh: RawSheet = { name: 'Α', rows: [HEAD.slice(0, 5), [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D0('2026-10-14'), D0('2026-10-16')]] };
    expect(timeCols('leave', sh, b2, { ...s0, statuses: [lv(p.id, { from: '2026-10-14', to: '2026-10-16' })] }, TODAY).head).toEqual([]);
    const t = timeCols('leave', sh, b2, { ...s0, statuses: [lv(p.id, { from: '2026-10-14', to: '2026-10-16', dest: 'Κόρινθο' })] }, TODAY);
    expect(t.b.cols).toHaveProperty('dest'); expect(t.head).toEqual([{ r: 0, c: 5, v: 'ΚΑΤΕΥΘΥΝΣΗ' }]);
  });
  it('στο αρχείο: γράφεται με επικεφαλίδα και ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-dst-')); const file = path.join(dir, 'ΑΔΕΙΕΣ.xlsx');
    const wb = await Workbook.blank('ΑΔΕΙΕΣ'); const ws = await wb.sheet('ΑΔΕΙΕΣ');
    ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΕΩΣ'].forEach((h, c) => ws.set(String.fromCharCode(65 + c) + '1', h).setStyle(String.fromCharCode(65 + c) + '1', 1));
    fs.writeFileSync(file, await wb.save());
    const b3: SourceBinding = { file, sheet: 'ΑΔΕΙΕΣ', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4 }, write: true, scope: 'all' };
    const s = { ...s0, statuses: [lv(p.id, { from: '2026-10-14', to: '2026-10-16', dest: 'Κόρινθο' })] };
    const w = await writeSource('leave', b3, s, undefined, TODAY);
    expect(w.ok && w.binding?.cols).toMatchObject({ dest: 5 });
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows[0][5]).toBe('ΚΑΤΕΥΘΥΝΣΗ'); expect(rows[1][5]).toBe('ΚΟΡΙΝΘΟ');
    if (!w.ok) return;
    const d = diffStatuses('leave', s, parseStatuses('leave', { name: 'ΑΔΕΙΕΣ', rows }, w.binding!, s.people, TODAY), w.binding!);
    expect(d.update).toEqual([]); expect(d.same).toBe(1);
  });
});
