// ΗΚΑΙ (Michael, 17/10): «1.», ίδια ποινή σε πολλούς σε μία πρόταση, ποινές χωρίς έγκριση, αιτιατική του τιμωρήσαντος,
// ημερομηνίες «15 ΟΚΤ 26», 3. ΑΔΕΙΕΣ αριθμημένες. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillHkai } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { hkOrgans, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines, hkRange, leaveName, linesText } from '../src/shared/hkaiText';
import { withArticle, genitive } from '../src/shared/greek';
import { hkDate, hkDay } from '../src/shared/dates';
import { hkLvOn, hkOn, hkToggle, type AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-16';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'a' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const pun = (s: AppState, pids: number[], extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type: 'PUN', pids, from: D, to: '2026-10-17', kind: 'Κράτηση', by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'άργησε στο προσκλητήριο', ...extra } as any });

describe('ημερομηνίες της ΗΚΑΙ', () => {
  it('«15 ΟΚΤ 26» και «ΠΑΡ 16 ΟΚΤ 26», ΜΑΙ χωρίς διαλυτικά', () => {
    expect(hkDate('2026-10-15')).toBe('15 ΟΚΤ 26');
    expect(hkDay(D)).toBe('ΠΑΡ 16 ΟΚΤ 26');
    expect(hkDate('2027-05-03')).toBe('03 ΜΑΙ 27');
    expect(hkDay('2026-12-27')).toBe('ΚΥΡ 27 ΔΕΚ 26');
  });
});

describe('ονόματα στην ΗΚΑΙ', () => {
  it('ο τιμωρήσας γράφεται όπως δόθηκε (σε αιτιατική), μόνο με «ΤΟΝ» μπροστά', () => {
    expect(withArticle('λχια Δοκιμιο')).toBe('ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ');
    expect(withArticle('ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ')).toBe('ΤΟΝ ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ');
    expect(withArticle('ΤΟΝ ΔΚΤΗ ΙΛΗΣ')).toBe('ΤΟΝ ΔΚΤΗ ΙΛΗΣ');
    expect(withArticle('την ΛΧΙΑ ΔΟΚΙΜΙΟΥ')).toBe('ΤΗΝ ΛΧΙΑ ΔΟΚΙΜΙΟΥ');
    expect(withArticle('')).toBe('');
  });
  it('γενική πατρωνύμου', () => {
    expect(genitive('Γεώργιος')).toBe('ΓΕΩΡΓΙΟΥ');
    expect(genitive('ΙΩΑΝΝΗΣ')).toBe('ΙΩΑΝΝΗ');
    expect(genitive('ΑΝΔΡΕΑΣ')).toBe('ΑΝΔΡΕΑ');
    expect(genitive('ΓΕΩΡΓΙΟΥ')).toBe('ΓΕΩΡΓΙΟΥ');
  });
});

describe('4. ΠΟΙΝΕΣ', () => {
  it('ίδια ποινή σε δύο: μία πρόταση με τους δύο, στον πληθυντικό', () => {
    const s = pun(fakeState(10), [3, 2]);
    expect(s.statuses.every(x => !x.pending)).toBe(true);
    expect(linesText(hkaiPunLines(s, D))).toBe('1. ΟΙ ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ ΚΑΙ ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΤΙΜΩΡΗΘΗΚΑΝ ΤΗΝ 16 ΟΚΤ 26 ΑΠΟ ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ ΜΕ ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ, ΔΙΟΤΙ ΑΡΓΗΣΕ ΣΤΟ ΠΡΟΣΚΛΗΤΗΡΙΟ.');
  });
  it('και χωριστές δηλώσεις με τα ίδια στοιχεία ενώνονται· διαφορετικός λόγος ή ημέρες όχι', () => {
    let s = pun(fakeState(10), [4]);
    s = pun(s, [5], { reason: 'Άργησε στο προσκλητήριο.' });
    s = pun(s, [6], { reason: 'άλλος λόγος' });
    s = pun(s, [7], { to: D });
    const ls = hkaiPunLines(s, D).map(l => l.map(r => r.t).join(''));
    expect(ls).toHaveLength(3);
    expect(ls.find(l => l.includes('ΤΙΜΩΡΗΘΗΚΑΝ'))).toMatch(/^\d\. ΟΙ ΣΤΡ \(ΠΖ\) ΠΛΑΣΜΑΤΙΚΟΣ ΕΨΙΛΟΝ ΚΑΙ ΣΤΡ \(ΠΖ\) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ ΤΙΜΩΡΗΘΗΚΑΝ/);
    // τρεις: «Α, Β και Γ»
    const three = hkaiPunLines(pun(fakeState(10), [2, 3, 4]), D)[0].map(r => r.t).join('');
    expect(three).toContain('ΟΙ ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ, ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΚΑΙ ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ ΤΙΜΩΡΗΘΗΚΑΝ');
  });
  it('στο Excel: μία γραμμή για την ομάδα, υπογραμμισμένη η διάρκεια', async () => {
    const s = pun(fakeState(10), [3, 2]);
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G11')!.split('\n')).toHaveLength(1);
    expect(bk.get('G11')).toMatch(/^1\. ΟΙ ΣΤΡ/);
    expect(bk.get('L23')).toBe('ΑΥΛΩΝΑΣ, 16 ΟΚΤ 26');
  });
});

// «Άδειες στο 3. Άδειες» ανοιχτό (κλειστό από προεπιλογή, Michael 22/10)
const lvOn = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, hkai: hkToggle(s.settings.hkai || {}, 'lv', true) } });

describe('3. ΑΔΕΙΕΣ', () => {
  it('κλειστό από προεπιλογή: τίποτα στο 3. ΑΔΕΙΕΣ, ούτε στο Excel· ανοιγοκλείνει χωρίς να χαλά τις άλλες ενότητες', async () => {
    let s = fakeState(10);
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-10-18', kind: 'Κανονική' } });
    s = run(s, { t: 'declare', cmd: { type: 'SICK', pids: [4], from: D, to: '2026-10-18' } });
    expect(hkOn(s.settings, 'lv')).toBe(false);
    expect(hkaiLeaveLines(s, D)).toHaveLength(0);
    const off = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(off.get('G10') || '').toBe('');
    const on = lvOn(s);
    expect(hkOn(on.settings, 'lv')).toBe(true);
    expect(hkOn(on.settings, 'veh')).toBe(true);
    expect(hkaiLeaveLines(on, D)).toHaveLength(2);
    expect((await (await Workbook.open((await fillHkai(T('hkai.xlsx'), on, D)).data)).sheet(1)).get('G10')!.split('\n')).toHaveLength(2);
    // ξανά κλειστό, και οι ενότητες που ήταν κλειστές μένουν κλειστές
    const h = hkToggle(hkToggle({ off: ['veh'] }, 'lv', true), 'lv', false);
    expect(h).toEqual({ off: ['veh'], on: [] });
    expect(hkToggle(h, 'veh', true)).toEqual({ off: [], on: [] });
  });
  it('αριθμημένες, μία ανά γραμμή, «ΓΙΑ ΤΗΝ …» για μία μέρα και «ΑΠΟ … ΕΩΣ …» για πολλές', async () => {
    let s = lvOn(fakeState(10));
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-10-18', kind: 'Κανονική' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [2], from: D, to: D, kind: 'ΑΜΔ' } });
    s = run(s, { t: 'declare', cmd: { type: 'HON', pids: [4], from: D, to: '2026-10-17', fromTime: '14:00', toTime: '22:00' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [5], from: '2026-10-17', to: '2026-10-18', kind: 'Κανονική' } });
    expect(linesText(hkaiLeaveLines(s, D))).toBe([
      '1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΔΕΙΑ ΑΜΔ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.',
      '2. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26.',
      '3. ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ: ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 14:00 ΕΩΣ ΣΑΒ 17 ΟΚΤ 26 22:00.'].join('\n'));
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G10')!.split('\n')).toHaveLength(3);
  });
  it('ονόματα ειδών και διαστήματα', () => {
    expect(leaveName({ type: 'LEAVE', kind: 'Ειδική' })).toBe('ΕΙΔΙΚΗ ΑΔΕΙΑ');
    expect(leaveName({ type: 'LEAVE', kind: 'ΥΕΘΑ' })).toBe('ΑΔΕΙΑ ΥΕΘΑ');
    expect(leaveName({ type: 'SICK' })).toBe('ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ');
    expect(hkRange({ from: D, to: D, fromTime: '08:00', toTime: '14:00' })).toBe('ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 08:00 ΕΩΣ 14:00');
    expect(hkRange({ from: D, to: D, open: true })).toBe('ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 (ΧΩΡΙΣ ΛΗΞΗ)');
  });
});

describe('αίτηση άδειας: 5. ΑΙΤΗΣΕΙΣ → εγκρίθηκε/απορρίφθηκε, γράφεται μία φορά', () => {
  const ask = (s: AppState, pid: number, extra: Record<string, unknown> = {}) =>
    run(s, { t: 'addRequest', req: { pid, date: D, text: 'για οικογενειακούς λόγους', leave: { type: 'LEAVE', kind: 'Κανονική', from: '2026-10-17', to: '2026-10-17' }, ...extra } as any });
  it('γράφεται στις αιτήσεις με είδος και ημέρα, και δεν είναι ακόμα άδεια', () => {
    const s = ask(fakeState(10), 3);
    expect(linesText(hkaiReqLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΑΙΤΕΙΤΑΙ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΣΑΒ 17 ΟΚΤ 26 ΓΙΑ ΟΙΚΟΓΕΝΕΙΑΚΟΥΣ ΛΟΓΟΥΣ.');
    expect(s.statuses).toHaveLength(0);
    expect(hkaiLeaveLines(s, '2026-10-17')).toHaveLength(0);
  });
  it('εγκρίθηκε: γίνεται άδεια, αλλά δεν ξαναγράφεται στο 3. ΑΔΕΙΕΣ (μένει μόνο η αίτηση)· αναίρεση τη βγάζει', () => {
    let s = ask(fakeState(10), 3);
    const id = s.requests[0].id;
    s = run(s, { t: 'decideRequest', id, ok: true });
    const st = s.statuses.find(x => x.type === 'LEAVE')!;
    expect(st).toMatchObject({ pid: 3, from: '2026-10-17', to: '2026-10-17', kind: 'Κανονική', req: id });
    expect(s.requests[0]).toMatchObject({ decision: 'ok', decided: D, sid: st.id });
    expect(hkaiLeaveLines(lvOn(s), D)).toHaveLength(0);   // ούτε με ανοιχτό το «3. Άδειες»
    expect(hkaiLeaveLines(lvOn(s), '2026-10-17')).toHaveLength(0);
    expect(hkaiReqLines(s, D)).toHaveLength(1);   // η αίτηση μένει στην ΗΚΑΙ της μέρας της
    expect(() => run(s, { t: 'decideRequest', id, ok: false })).toThrow(/ήδη εγκριθεί/);
    expect(() => run(s, { t: 'updateRequest', req: { ...s.requests[0], text: 'άλλο' } })).toThrow(/Αναίρεσε πρώτα/);
    const back = run(s, { t: 'decideRequest', id, ok: null });
    expect(back.statuses).toHaveLength(0);
    expect(back.requests[0].decision).toBeUndefined();
    // διαγραφή εγκεκριμένης: φεύγει και η άδεια
    expect(run(s, { t: 'deleteRequest', id }).statuses).toHaveLength(0);
  });
  it('απορρίφθηκε: δεν γίνεται άδεια', () => {
    let s = ask(fakeState(10), 3);
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: false });
    expect(s.statuses).toHaveLength(0);
    expect(s.requests[0].decision).toBe('no');
    expect(hkaiLeaveLines(s, D)).toHaveLength(0);
  });
  it('τιμητική πολλών ημερών, χωρίς αιτιολόγηση· το «έως» δεν είναι πριν το «από»', () => {
    let s = run(fakeState(10), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'HON', from: '2026-10-17', to: '2026-10-19' } } });
    expect(linesText(hkaiReqLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΙΤΕΙΤΑΙ ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ ΑΠΟ ΣΑΒ 17 ΟΚΤ 26 ΕΩΣ ΔΕΥ 19 ΟΚΤ 26.');
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    expect(s.statuses[0]).toMatchObject({ type: 'HON', from: '2026-10-17', to: '2026-10-19' });
    expect(() => run(fakeState(5), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: '2026-10-19', to: '2026-10-17' } } })).toThrow(/πριν/);
    expect(() => run(fakeState(5), { t: 'addRequest', req: { pid: 2, date: D, text: '' } })).toThrow(/Γράψε/);
  });
  it('ώρες στην αίτηση (προαιρετικές): στην πρόταση της ΗΚΑΙ και στην άδεια με το «Εγκρίθηκε»', () => {
    let s = run(fakeState(10), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: '2026-10-17', to: '2026-10-19', fromTime: '14', toTime: '2200' } } });
    expect(s.requests[0].leave).toMatchObject({ fromTime: '14:00', toTime: '22:00' });
    expect(linesText(hkaiReqLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΙΤΕΙΤΑΙ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΣΑΒ 17 ΟΚΤ 26 14:00 ΕΩΣ ΔΕΥ 19 ΟΚΤ 26 22:00.');
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    expect(s.statuses[0]).toMatchObject({ type: 'LEAVE', from: '2026-10-17', to: '2026-10-19', fromTime: '14:00', toTime: '22:00' });
    expect(hkaiLeaveLines(s, '2026-10-17')).toHaveLength(0);   // πάλι μόνο η αίτηση, μία φορά
    // κενές ώρες: όπως πριν, χωρίς πεδία ώρας
    const e = run(fakeState(10), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'HON', from: '2026-10-17', to: '2026-10-17', fromTime: '', toTime: '' } } });
    expect(e.requests[0].leave).toEqual({ type: 'HON', from: '2026-10-17', to: '2026-10-17' });
    // μία μέρα με μία μόνο ώρα
    const one = run(fakeState(10), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'HON', from: '2026-10-17', to: '2026-10-17', fromTime: '14:00' } } });
    expect(linesText(hkaiReqLines(one, D))).toBe('1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΙΤΕΙΤΑΙ ΤΙΜΗΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΣΑΒ 17 ΟΚΤ 26 ΑΠΟ 14:00.');
    expect(hkRange({ from: D, to: D, toTime: '22:00' })).toBe('ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ 22:00');
    // λάθος ώρες
    const bad = (fromTime: string, toTime: string) => () => run(fakeState(5), { t: 'addRequest', req: { pid: 2, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: '2026-10-17', to: '2026-10-17', fromTime, toTime } } });
    expect(bad('25:00', '')).toThrow(/δεν διαβάζεται/);
    expect(bad('14:00', '10:00')).toThrow(/μετά την/);
  });
  it('η εγκεκριμένη άδεια βγάζει το άτομο από την υπηρεσία εκείνης της μέρας', () => {
    let s = run(fakeState(30), { t: 'assign', date: '2026-10-17', k: 'th1', pid: 3 });
    s = ask(s, 3);
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    expect(s.guards['2026-10-17']?.th1).toBeUndefined();
  });
});

describe('1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ από το προσωπικό', () => {
  it('εκτός δύναμης → 2. ΔΙΑΓΡΑΦΕΣ με τα στοιχεία του και τον λόγο· ξανά σε δύναμη → φεύγει', async () => {
    let s = fakeState(10);
    const p = { ...s.people[2], active: false, notes: 'μετάθεση στο 2ο ΣΠ' };
    s = run(s, { t: 'updatePerson', person: p });
    expect(s.people[2].outOn).toBe(D);
    expect(linesText(hkaiDiaLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΤΟΥ ΠΑΤΕΡΑ, ΑΣΜ 900002, ΕΣΣΟ 2026 Γ΄: ΜΕΤΑΘΕΣΗ ΣΤΟ 2Ο ΣΠ.');
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G9')).toBe(linesText(hkaiDiaLines(s, D)));
    // «Να μη γραφτεί»
    expect(hkaiDiaLines(run(s, { t: 'setPersonMove', pid: 3, field: 'outOn', date: null }), D)).toHaveLength(0);
    s = run(s, { t: 'updatePerson', person: { ...s.people[2], active: true } });
    expect(s.people[2].outOn).toBeUndefined();
  });
  it('από το φύλλο «ΕΚΤΟΣ ΔΥΝΑΜΗΣ»: ο λόγος χωρίς το «Εκτός δύναμης:», και το ελεύθερο κείμενο στο τέλος', () => {
    let s = run(fakeState(10), { t: 'setPeopleFields', changes: [{ pid: 4, patch: { active: false, notes: 'Εκτός δύναμης: απόλυση' } }], source: 'x', what: 'εκτός δύναμης' });
    s = run(s, { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { dia: 'ΚΑΙ ΚΑΤΙ ΑΚΟΜΑ' } } });
    expect(linesText(hkaiDiaLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΦΑΝΤΑΣΙΟΣ ΔΕΛΤΑΣ ΤΟΥ ΠΑΤΕΡΑ, ΑΣΜ 900003, ΕΣΣΟ 2026 Γ΄: ΑΠΟΛΥΣΗ.\nΚΑΙ ΚΑΤΙ ΑΚΟΜΑ');
  });
  it('«Νέος στρατιώτης» → 1. ΕΓΓΡΑΦΕΣ· η πρώτη εισαγωγή του Δυναμολογίου όχι', () => {
    const np = { ...fakeState(1).people[0], rank: 'ΣΤΡ', last: 'ΚΑΙΝΟΥΡΓΙΟΣ', first: 'ΑΛΦΑΣ', father: 'ΙΩΑΝΝΗΣ', asm: '123456' } as any; delete np.id; delete np.active;
    const s = run(fakeState(10), { t: 'addPerson', person: np });
    expect(linesText(hkaiEgrLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΚΑΙΝΟΥΡΓΙΟΣ ΑΛΦΑΣ ΤΟΥ ΙΩΑΝΝΗ, ΑΣΜ 123456, ΕΣΣΟ 2026 Γ΄.');
    const rows = fakeState(5).people.map(p => { const r: any = { ...p }; delete r.id; delete r.active; delete r.post; delete r.attached; delete r.notes; return r; });
    const first = run({ ...fakeState(0) }, { t: 'importPeople', rows, source: 'x', deactivateMissing: false });
    expect(first.people).toHaveLength(5);
    expect(first.people.some(p => p.inOn)).toBe(false);
  });
});

describe('ενότητες της ΗΚΑΙ', () => {
  it('κλειστές φρουρές δεν γράφονται· όχημα, ατυχήματα και «Προβλέπονται» γράφονται όταν είναι ανοιχτά', async () => {
    let s = run(fakeState(30), { t: 'autofill', date: D });
    s = run(s, { t: 'setSettings', settings: { hkai: { veh: { type: '1/4 τόνων', prov: 2, kin: 1 }, prov: { 'Στρατιώτες': 150, 'Λοχίες': 2 } } }, text: 'x' });
    s = run(s, { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { accM: '1' } } });
    let wb = await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data);
    let bk = await wb.sheet(1); const fr = await wb.sheet(0);
    expect(bk.get('D5')).toBeTruthy();
    expect([bk.get('G5'), bk.get('H5'), bk.get('M5'), bk.get('K5')]).toEqual(['2', '1', '1', 'Ø']);
    expect([fr.get('B29'), fr.get('B25'), fr.get('B30'), fr.get('B31'), fr.get('B22')]).toEqual(['150', '2', '152', '152', null]);
    s = run(s, { t: 'setSettings', settings: { hkai: { ...s.settings.hkai, off: ['grd', 'veh', 'acc', 'prov'] } }, text: 'x' });
    wb = await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data); bk = await wb.sheet(1);
    expect([bk.get('D5'), bk.get('D8'), bk.get('G5'), bk.get('M5'), (await wb.sheet(0)).get('B29')]).toEqual([null, null, null, 'Ø', null]);
  });
});

describe('ΗΚΑΙ: όργανα υπηρεσίας με μόνιμους Λ/Υ και Δ/Υ', () => {
  it('κενές θέσεις: μπαίνουν και οι δύο μόνιμοι· ό,τι μπήκε στη θέση κερδίζει· όποιος λείπει δεν μπαίνει', async () => {
    let s = fakeState(10); const [a, b, c] = s.people;
    s = { ...s, settings: { ...s.settings, fixed: { ly: a.id, dy: b.id } } };
    expect(hkOrgans(s, D)).toEqual({ ly: a.id, dy: b.id });
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('A22')).toContain(a.last.toUpperCase());
    expect(bk.get('A23')).toContain(b.last.toUpperCase());
    s = { ...s, guards: { [D]: { dy: c.id } } };
    expect(hkOrgans(s, D)).toEqual({ ly: a.id, dy: c.id });
    s = run(s, { t: 'declare', cmd: { pids: [a.id], type: 'LEAVE', from: D, to: D } } as Command);
    expect(hkOrgans(s, D)).toEqual({ dy: c.id });
  });
});

// 3. ΑΔΕΙΕΣ: στελέχη, εκτός δύναμης, ελεύθερο κείμενο και ανά μέρα (Michael, 24/10)
describe('3. ΑΔΕΙΕΣ: στελέχη, ελεύθερο κείμενο, ανά μέρα', () => {
  // δύο στελέχη (ο Λοχίας μπαίνει πρώτος, αλλά ο Ίλαρχος προηγείται στην ιεραρχία) και δύο στρατιώτες με άδεια σήμερα
  function base(): AppState {
    let s = fakeState(10);
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', origin: 'ΕΠΟΠ', spec: 'ΜΧ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΙΛΧΟΣ', hk: 'Ίλαρχοι', last: 'ΥΠΟΘΕΤΙΚΟΣ', first: 'ΓΙΑΝΝΗΣ' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-10-18', kind: 'Κανονική' } });
    s = run(s, { t: 'declare', cmd: { type: 'SICK', pids: [2], from: D, to: D } });
    return s;
  }
  const cid = (s: AppState, last: string) => s.cadreList.find(c => c.last === last)!.id;
  const cabs = (s: AppState, last: string, kind: string, from = D, to = D) => run(s, { t: 'addCadreAbs', abs: { cid: cid(s, last), kind, from, to } });
  const lvDay = (s: AppState, on: boolean | undefined, d = D): AppState => ({ ...s, hkaiManual: { ...s.hkaiManual, [d]: { cells: {}, text: {}, ...(on === undefined ? {} : { lv: on }) } } });

  it('στελέχη πρώτα (σειρά ιεραρχίας), μετά στρατιώτες, μία αρίθμηση· μόνο οι ΚΑ, ειδική και αναρρωτική που ξεκινούν τη μέρα', () => {
    let s = lvDay(base(), true);
    s = cabs(s, 'ΔΟΚΙΜΙΔΗΣ', 'ka', D, '2026-10-18');
    s = cabs(s, 'ΥΠΟΘΕΤΙΚΟΣ', 'an');
    expect(linesText(hkaiLeaveLines(s, D))).toBe([
      '1. ΙΛΧΟΣ ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.',
      '2. ΕΠΟΠ ΛΧΙΑΣ (ΜΧ) ΔΟΚΙΜΙΔΗΣ ΔΟΚΙΜΟΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26.',
      '3. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.',
      '4. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26.'].join('\n'));
  });
  it('στέλεχος: ειδική γράφεται· υπηρεσία, εκπαίδευση, νοσοκομείο, φύλλο πορείας όχι· ούτε όταν η άδεια ξεκίνησε άλλη μέρα', () => {
    let s = lvDay(base(), true);
    const only = (kind: string, from = D) => linesText(hkaiLeaveLines(cabs(s, 'ΥΠΟΘΕΤΙΚΟΣ', kind, from, '2026-10-20'), D)).split('\n').filter(l => /ΥΠΟΘΕΤΙΚΟΣ/.test(l));
    expect(only('eid')).toEqual(['1. ΙΛΧΟΣ ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ: ΕΙΔΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΤΡΙ 20 ΟΚΤ 26.']);
    for (const k of ['yp', 'ey', 'ekp', 'nos', 'fp', 'allh', 'apal', 'other']) expect(only(k)).toEqual([]);
    expect(only('ka', '2026-10-15')).toEqual([]);
    s = cabs(s, 'ΥΠΟΘΕΤΙΚΟΣ', 'ka', '2026-10-15', '2026-10-20');
    expect(linesText(hkaiLeaveLines(s, '2026-10-15'))).toBe('');   // η μέρα 15 δεν έχει δική της τιμή: προεπιλογή, κλειστό
    expect(linesText(hkaiLeaveLines(lvDay(s, true, '2026-10-15'), '2026-10-15'))).toMatch(/^1\. ΙΛΧΟΣ ΥΠΟΘΕΤΙΚΟΣ/);
    expect(hkaiLeaveLines(s, D).filter(l => /ΥΠΟΘΕΤΙΚΟΣ/.test(linesText([l])))).toHaveLength(0);
  });
  it('εκτός δύναμης (στρατιώτης ή στέλεχος): δεν γράφονται', () => {
    let s = lvDay(base(), true);
    s = cabs(s, 'ΔΟΚΙΜΙΔΗΣ', 'ka');
    expect(hkaiLeaveLines(s, D)).toHaveLength(3);
    const out = { ...s, people: s.people.map(p => (p.id === 3 ? { ...p, active: false } : p)), cadreList: s.cadreList.map(c => (c.last === 'ΔΟΚΙΜΙΔΗΣ' ? { ...c, active: false } : c)) };
    expect(linesText(hkaiLeaveLines(out, D))).toBe('1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.');
  });
  it('ελεύθερο κείμενο: τελευταίο, χωρίς αριθμό· γράφεται μόνο όταν η μέρα έχει ανοιχτό το 3. (και στο Excel)', async () => {
    let s = lvDay(base(), true);
    s = run(s, { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { lv: '  ΕΠΙΠΛΕΟΝ: ΑΔΕΙΑ ΣΤΟ ΕΞΩΤΕΡΙΚΟ.  ' } } });
    expect(s.hkaiManual[D].lv).toBe(true);   // η Αποθήκευση των κειμένων δεν χάνει τον διακόπτη της μέρας
    expect(hkaiLeaveLines(s, D).map(l => linesText([l]))).toEqual([
      '1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26.',
      '2. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26.',
      'ΕΠΙΠΛΕΟΝ: ΑΔΕΙΑ ΣΤΟ ΕΞΩΤΕΡΙΚΟ.']);
    const g10 = async (x: AppState) => (await (await Workbook.open((await fillHkai(T('hkai.xlsx'), x, D)).data)).sheet(1)).get('G10') || '';
    expect((await g10(s)).split('\n')).toHaveLength(3);
    // κλειστό για τη μέρα: ούτε το κείμενο
    const off = run(s, { t: 'setHkaiLv', date: D, on: false });
    expect(hkaiLeaveLines(off, D)).toHaveLength(0);
    expect(await g10(off)).toBe('');
    expect(off.hkaiManual[D].text.lv).toContain('ΕΠΙΠΛΕΟΝ');   // το κείμενο μένει για όταν ξανανοίξει
    // μόνο κείμενο, χωρίς άδειες: μία γραμμή χωρίς αριθμό
    expect(linesText(hkaiLeaveLines({ ...fakeState(3), hkaiManual: { [D]: { cells: {}, text: { lv: 'ΚΑΤΙ' }, lv: true } } }, D))).toBe('ΚΑΤΙ');
  });
  it('ανά μέρα: η τιμή της μέρας νικά την προεπιλογή, οι άλλες μέρες την ακολουθούν', () => {
    const s0 = base(); const next = '2026-10-17';
    let s = run(s0, { t: 'declare', cmd: { type: 'LEAVE', pids: [4], from: next, to: next, kind: 'Κανονική' } });
    expect([hkLvOn(s, D), hkLvOn(s, next)]).toEqual([false, false]);
    s = run(s, { t: 'setHkaiLv', date: D, on: true });   // μόνο η D
    expect([hkLvOn(s, D), hkLvOn(s, next)]).toEqual([true, false]);
    expect(hkaiLeaveLines(s, D)).toHaveLength(2);
    expect(hkaiLeaveLines(s, next)).toHaveLength(0);
    // η προεπιλογή ανοίγει: η D μένει όπως είναι, η επόμενη ακολουθεί
    const def = lvOn(s);
    expect([hkLvOn(def, D), hkLvOn(def, next)]).toEqual([true, true]);
    expect(hkaiLeaveLines(def, next)).toHaveLength(1);
    // προεπιλογή ανοιχτή, η D κλειστή
    const closed = run(def, { t: 'setHkaiLv', date: D, on: false });
    expect(hkaiLeaveLines(closed, D)).toHaveLength(0);
    expect(hkaiLeaveLines(closed, next)).toHaveLength(1);
    // το setHkaiLv δεν πειράζει τα κείμενα και τους αριθμούς της μέρας
    const m = run(closed, { t: 'setHkaiManual', date: D, manual: { cells: { 'Στρατιώτες': { sid: 2 } }, text: { loi: 'Χ' } } });
    expect(run(m, { t: 'setHkaiLv', date: D, on: true }).hkaiManual[D]).toEqual({ cells: { 'Στρατιώτες': { sid: 2 } }, text: { loi: 'Χ' }, lv: true });
  });
  it('Excel ή εκτύπωση: η τιμή που χρησιμοποιήθηκε μένει για τη μέρα· δεύτερη φορά δεν αλλάζει· αθόρυβα', () => {
    const s = lvOn(base());   // προεπιλογή: ανοιχτό, η D χωρίς δική της τιμή
    expect(s.hkaiManual[D]).toBeUndefined();
    const r = apply(s, { t: 'freezeHkaiLv', date: D, on: hkLvOn(s, D) }, ctx);
    expect(r).toMatchObject({ text: '', undoable: false });
    expect(r.state.hkaiManual[D]).toEqual({ cells: {}, text: {}, lv: true });
    // η προεπιλογή κλείνει αργότερα: το ξαναβγάλσιμο της D βγαίνει όπως βγήκε
    const later = { ...r.state, settings: { ...r.state.settings, hkai: hkToggle(r.state.settings.hkai || {}, 'lv', false) } };
    expect(hkLvOn(later, D)).toBe(true);
    expect(hkaiLeaveLines(later, D)).toHaveLength(2);
    // ήδη αποθηκευμένη τιμή: δεν γράφεται πάνω της (ίδιο αντικείμενο state)
    const again = apply(r.state, { t: 'freezeHkaiLv', date: D, on: false }, ctx).state;
    expect(again).toBe(r.state);
    // κλειστό όταν βγήκε: μένει κλειστό και αν ανοίξει η προεπιλογή
    const c = apply(base(), { t: 'freezeHkaiLv', date: D, on: false }, ctx).state;
    expect(hkaiLeaveLines(lvOn(c), D)).toHaveLength(0);
    // κείμενα της μέρας δεν χάνονται
    const t = apply(run(base(), { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { loi: 'ΧΧ' } } }), { t: 'freezeHkaiLv', date: D, on: true }, ctx).state;
    expect(t.hkaiManual[D]).toEqual({ cells: {}, text: { loi: 'ΧΧ' }, lv: true });
  });
});
