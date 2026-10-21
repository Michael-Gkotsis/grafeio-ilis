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
import type { AppState } from '../src/shared/domain';
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

describe('3. ΑΔΕΙΕΣ', () => {
  it('αριθμημένες, μία ανά γραμμή, «ΓΙΑ ΤΗΝ …» για μία μέρα και «ΑΠΟ … ΕΩΣ …» για πολλές', async () => {
    let s = fakeState(10);
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
    expect(hkaiLeaveLines(s, D)).toHaveLength(0);
    expect(hkaiLeaveLines(s, '2026-10-17')).toHaveLength(0);
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
