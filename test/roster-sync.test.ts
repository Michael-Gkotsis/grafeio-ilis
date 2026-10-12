// Δυναμολόγιο και Αρχεία Excel: η επανεισαγωγή δεν σβήνει ό,τι δεν γράφει το αρχείο, λατινικά γράμματα που μοιάζουν,
// γραμμές χωρίς βαθμό, συνονόματοι, μετακίνηση εγγραφής και μισογραμμένες γραμμές. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, rosterChanges, type Command, type Ctx, type ImportRow } from '../src/shared/commands';
import { OUT_NOTE, type AppState, type Person, type Status } from '../src/shared/domain';
import { parseRoster, isDnYes, type RawSheet } from '../src/shared/roster';
import { defaultCaps } from '../src/shared/rules';
import { diffStatuses, identity, parseStatuses, planOutsideWrite, planPostsWrite, planWrite, tableHash, tableRows, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'r' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const HEAD = ['ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'];
const line = (p: Person) => [p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si];
const imp = (s: AppState, rows: ImportRow[], deactivateMissing = true) => run(s, { t: 'importPeople', rows, source: 'dyn.xlsx', deactivateMissing });

describe('επανεισαγωγή Δυναμολογίου (X5)', () => {
  const s0 = fakeState(6);
  const main = (s: AppState): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...s.people.map(line)] });
  it('χωρίς φύλλο ΠΟΣΤΑ/ΕΚΤΟΣ η γραμμή δεν φέρνει πόστο, προσκολλημένο, σημειώσεις, «σε δύναμη»', () => {
    const r = parseRoster([main(s0)]);
    for (const k of ['post', 'attached', 'notes', 'active']) expect(r.rows.some(x => k in x)).toBe(false);
  });
  it('πόστο από άλλο αρχείο, προσκολλημένος και σημειώσεις μένουν μετά την επανεισαγωγή', () => {
    let s = run(s0, { t: 'updatePerson', person: { ...s0.people[2], post: 'ΓΡΑΦΕΙΟ', attached: true, notes: 'κάτι δικό μου' } });
    const r = parseRoster([main(s)]);
    expect(rosterChanges(s, r.rows).changes).toEqual([]);
    s = imp(s, r.rows);
    const p = s.people.find(x => x.id === 3)!;
    expect([p.post, p.attached, p.notes]).toEqual(['ΓΡΑΦΕΙΟ', true, 'κάτι δικό μου']);
    expect(s.people.find(x => x.id === 6)!.post).toBe('ΚΨΜ');
  });
  it('νέο άτομο παίρνει τις προεπιλογές', () => {
    const extra: Person = { ...s0.people[0], id: 99, last: 'ΚΑΙΝΟΥΡΓΙΟΣ', asm: '911111' };
    const s = imp(s0, parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...s0.people.map(line), line(extra)] }]).rows);
    const p = s.people.find(x => x.last === 'ΚΑΙΝΟΥΡΓΙΟΣ')!;
    expect([p.post, p.attached, p.notes, p.active]).toEqual([null, false, '', true]);
  });
  it('φύλλο ΠΟΣΤΑ χωρίς πατρώνυμο: ταιριάζει με το ονοματεπώνυμο· όποιος λείπει χάνει το πόστο', () => {
    const p = s0.people;
    const posts: RawSheet = { name: 'ΠΟΣΤΑ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΟΣΤΟ'], [p[1].last, p[1].first, 'ΙΑΤΡΟΣ ΣΤΕΠ']] };
    const r = parseRoster([main(s0), posts]);
    expect(r.rows.find(x => x.last === p[1].last)!.post).toBe('ΙΑΤΡΟΣ ΣΤΕΠ');
    expect(r.rows.find(x => x.last === p[5].last)!.post).toBeNull();     // ήταν ΚΨΜ, δεν είναι πια στο φύλλο
  });
  it('άλλο ΑΣΜ στο φύλλο ΠΟΣΤΑ = άλλος άνθρωπος', () => {
    const p = s0.people;
    const posts: RawSheet = { name: 'ΠΟΣΤΑ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΣΜ', 'ΠΟΣΤΟ'], [p[1].last, p[1].first, '955555', 'ΚΨΜ']] };
    expect(parseRoster([main(s0), posts]).rows.find(x => x.last === p[1].last)!.post).toBeNull();
  });
  it('εκτός δύναμης από άλλο αρχείο μένει εκτός· όποιος έλειπε από το Δυναμολόγιο και ξαναμπαίνει, σε δύναμη', () => {
    let s = run(s0, { t: 'setPeopleFields', changes: [{ pid: 2, patch: { active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' } }], source: 'out.xlsx', what: 'εκτός' });
    s = { ...s, people: s.people.map(p => (p.id === 4 ? { ...p, active: false } : p)) };
    s = imp(s, parseRoster([main(s0)]).rows);
    expect(s.people.find(x => x.id === 2)).toMatchObject({ active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' });
    expect(s.people.find(x => x.id === 4)!.active).toBe(true);
  });
  it('με φύλλο ΕΚΤΟΣ: όποιος δεν είναι πια εκεί γυρίζει σε δύναμη και φεύγει η σημείωση· όποιος είναι, παίρνει τον λόγο', () => {
    let s = run(s0, { t: 'setPeopleFields', changes: [{ pid: 2, patch: { active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' } }], source: 'out.xlsx', what: 'εκτός' });
    const out: RawSheet = { name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', rows: [[...HEAD, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [...line(s0.people[4]), 'ΝΟΣΟΚΟΜΕΙΟ']] };
    s = imp(s, parseRoster([main(s0), out]).rows);
    expect(s.people.find(x => x.id === 2)).toMatchObject({ active: true, notes: '' });
    expect(s.people.find(x => x.id === 5)).toMatchObject({ active: false, notes: OUT_NOTE + ': ΝΟΣΟΚΟΜΕΙΟ' });
  });
});

describe('λατινικά γράμματα που μοιάζουν (X6)', () => {
  it('Σ.Ι. «I4» και «άοπλος»: εκτός οπλοφορίας· βαθμός «ΣTP» γίνεται ΣΤΡ', () => {
    const s = fakeState(3); const p = s.people;
    const r = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ['ΣTP', 'ΠΖ', p[0].last, p[0].first, 'Π', '900001', '', 1, 'I4'], ['ΣΤΡ', 'ΠΖ', p[1].last, p[1].first, 'Π', '900002', '', 1, 'Ι3 άοπλος'], ['ΣΤΡ', 'ΠΖ', p[2].last, p[2].first, 'Π', '900003', '', 1, 'I1']] }]);
    expect(r.rows.map(x => [x.rank, x.si])).toEqual([['ΣΤΡ', 'Ι4'], ['ΣΤΡ', 'Ι3 ΑΟΠΛΟΣ'], ['ΣΤΡ', 'Ι1']]);
    const caps = (si: string) => Object.keys(defaultCaps({ ...p[0], post: null, si }));
    expect(caps('I4')).toEqual(['op', 'sk']);            // ήδη αποθηκευμένο με λατινικό I
    expect(caps('Ι3 άοπλος')).toEqual(['op', 'sk']);
    expect(caps('Ι1')).toEqual([]);
  });
  it('ΔΝ: «OXI», «NO», «N/A» με λατινικά = όχι· «NAI», «X» = ναι', () => {
    for (const v of ['OXI', 'ΌΧΙ', 'NO', 'N/A', '-', '0']) expect(isDnYes(v)).toBe(false);
    for (const v of ['NAI', 'ΝΑΙ', 'X', '✓']) expect(isDnYes(v)).toBe(true);
  });
});

describe('γραμμές χωρίς βαθμό (X13)', () => {
  it('με ΑΣΜ, τηλέφωνο ή θάλαμο περνούν ως ΣΤΡ· χωρίς τίποτα αγνοούνται', () => {
    const p = fakeState(8).people;
    const rows = [HEAD, ...p.map(line), [null, 'ΠΑ', 'ΞΕΧΑΣΜΕΝΟΣ', 'ΒΗΤΑΣ', 'Π', '908888', '', null, 'Ι1'], [null, '', 'ΣΗΜΕΙΩΣΗ', 'ΚΑΤΙ', '', '', '', null, '']];
    const r = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows }]);
    expect(r.rows.find(x => x.last === 'ΞΕΧΑΣΜΕΝΟΣ')!.rank).toBe('ΣΤΡ');
    expect(r.rows.some(x => x.last === 'ΣΗΜΕΙΩΣΗ')).toBe(false);
    expect(r.skipped).toContain('ΣΗΜΕΙΩΣΗ ΚΑΤΙ');
    expect(r.warnings.some(w => /1 άτομα χωρίς βαθμό πέρασαν ως ΣΤΡ/.test(w))).toBe(true);
  });
});

// Δύο με το ίδιο ονοματεπώνυμο και πατρώνυμο, χωρίς ΑΣΜ στο φύλλο: ο 1 σε δύναμη, ο 2 εκτός
function twins(): AppState {
  const s = fakeState(4);
  s.people = s.people.map(p => (p.id === 2 ? { ...p, last: s.people[0].last, first: s.people[0].first, father: s.people[0].father, active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' } : p));
  return s;
}
const PHEAD = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'];
describe('συνονόματοι στην εγγραφή προς το Excel (X2)', () => {
  it('ποινή του εκτός δύναμης συνονόματου: δεν ξαναγράφεται σε νέα γραμμή', () => {
    const s = twins(); const p = s.people[1];
    const st: Status = { id: 'a', pid: 2, type: 'PUN', from: '2026-10-01', to: '2026-10-05', kind: 'Κράτηση' };
    const sh: RawSheet = { name: 'Π', rows: [['ΠΟΙΝΕΣ'], [...PHEAD, 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, 'ΣΤΡ', p.last, p.first, D(st.from), D(st.to), 'ΚΡΑΤΗΣΗ'], [2]] };
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'Π', header: 1, cols: { aa: 0, rank: 1, last: 2, first: 3, from: 4, to: 5, kind: 6 }, write: true };
    const plan = planWrite('punish', sh, b, { ...s, statuses: [st] }, [identity(2, 'punish', st.from)], TODAY);
    expect(plan.added).toBe(0); expect(plan.foreign).toBe(0); expect(plan.sets).toEqual([]);
  });
  it('δύο συνονόματοι με ποινή την ίδια μέρα: η γραμμή δεν αγγίζεται και φαίνεται ως αμφίσημη', () => {
    const s = twins(); const p = s.people[0];
    const sts: Status[] = [1, 2].map(pid => ({ id: 'x' + pid, pid, type: 'PUN', from: '2026-10-01', to: '2026-10-05', kind: 'Κράτηση' }));
    const sh: RawSheet = { name: 'Π', rows: [['ΠΟΙΝΕΣ'], [...PHEAD, 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, 'ΣΤΡ', p.last, p.first, D('2026-10-01'), D('2026-10-09'), 'ΚΡΑΤΗΣΗ'], [2]] };
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'Π', header: 1, cols: { aa: 0, rank: 1, last: 2, first: 3, from: 4, to: 5, kind: 6 }, write: true };
    const plan = planWrite('punish', sh, b, { ...s, statuses: sts }, [], TODAY);
    expect(plan.ambiguous).toEqual([2]); expect(plan.sets).toEqual([]); expect(plan.added).toBe(0);
  });
  it('φύλλο ΕΚΤΟΣ: η γραμμή του εκτός δύναμης δεν σβήνεται επειδή ο συνονόματος είναι σε δύναμη', () => {
    const s = twins(); const p = s.people[1];
    const sh: RawSheet = { name: 'Ε', rows: [['ΕΚΤΟΣ ΔΥΝΑΜΗΣ'], [...PHEAD, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [1, 'ΣΤΡ', p.last, p.first, 'ΑΝΑΒΟΛΗ'], [2]] };
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'Ε', header: 1, cols: { aa: 0, rank: 1, last: 2, first: 3, remarks: 4 }, write: true };
    const plan = planOutsideWrite(sh, b, s);
    expect(plan.sets).toEqual([]); expect(plan.added).toBe(0); expect(plan.cleared).toBe(0);
  });
  it('φύλλο ΠΟΣΤΑ: η γραμμή πάει σε όποιον από τους δύο έχει πόστο', () => {
    const s = twins(); s.people = s.people.map(p => (p.id === 1 ? { ...p, post: 'ΓΡΑΦΕΙΟ' } : p.id === 6 ? p : { ...p, post: null }));
    const p = s.people[0];
    const sh: RawSheet = { name: 'Π', rows: [['ΠΟΣΤΑ'], [...PHEAD, 'ΠΟΣΤΟ'], [1, 'ΣΤΡ', p.last, p.first, 'ΚΨΜ']] };
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'Π', header: 1, cols: { aa: 0, rank: 1, last: 2, first: 3, post: 4 }, write: true };
    const plan = planPostsWrite(sh, b, s);
    expect(plan.sets).toEqual([{ r: 2, c: 4, v: 'ΓΡΑΦΕΙΟ' }]); expect(plan.added).toBe(0);
  });
});

describe('μετακίνηση εγγραφής στο Excel (X9)', () => {
  const s0 = fakeState(4); const p = s0.people[2];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Μ', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4, note: 5 }, write: true };
  const sheet = (from: string, to: string, note = ''): RawSheet => ({ name: 'Μ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [p.last, p.first, 'ΕΑ', D(from), D(to), note]] });
  const old: Status = { id: 'm1', pid: p.id, type: 'EA', from: '2026-10-05', to: '2026-10-08', note: 'ΓΟΝΑΤΟ' };
  const s = { ...s0, statuses: [old] };
  const synced = [identity(p.id, 'medical', old.from, 'ΕΑ')];
  const diff = (sh: RawSheet) => diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, TODAY), b, {}, synced);
  it('άλλαξε το «από» αλλά οι μέρες πέφτουν μαζί: η ίδια εγγραφή, και η σβησμένη παρατήρηση σβήνεται', () => {
    const d = diff(sheet('2026-10-06', '2026-10-09'));
    expect(d.add).toEqual([]); expect(d.removed).toEqual([]);
    expect(d.update).toMatchObject([{ id: 'm1', patch: { from: '2026-10-06', to: '2026-10-09', note: '' } }]);
  });
  it('μία μέρα μετά το τέλος: ακόμα η ίδια', () => {
    expect(diff(sheet('2026-10-09', '2026-10-10')).update.map(x => x.id)).toEqual(['m1']);
  });
  it('άσχετη εγγραφή του ίδιου ατόμου αργότερα: σβήστηκε η μία, γράφτηκε άλλη (πάει στην προεπισκόπηση)', () => {
    const d = diff(sheet('2026-10-20', '2026-10-22'));
    expect(d.update).toEqual([]); expect(d.removed.map(x => x.id)).toEqual(['m1']); expect(d.add.length).toBe(1);
  });
});

describe('μισογραμμένες γραμμές (X11)', () => {
  const s0 = fakeState(4);
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Π', header: 1, cols: { aa: 0, rank: 1, last: 2, first: 3, from: 4, to: 5, kind: 6 }, write: true };
  const sh = (cell: Date | null): RawSheet => ({ name: 'Π', rows: [['ΠΟΙΝΕΣ'], [...PHEAD, 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, 'ΣΤΡ', null, null, cell], [2, 'ΣΤΡ'], [3]] });
  it('γραμμή με μόνο ημερομηνία δεν είναι ελεύθερη: η νέα ποινή πάει στην επόμενη', () => {
    const scan = tableRows(sh(D('2026-10-03')), b.header, b.cols);
    expect(scan.partial).toEqual([2]); expect(scan.free).toEqual([3, 4]);
    const st: Status = { id: 'n', pid: 3, type: 'PUN', from: '2026-10-12', to: '2026-10-14', kind: 'Κράτηση' };
    const plan = planWrite('punish', sh(D('2026-10-03')), b, { ...s0, statuses: [st] }, [], TODAY);
    expect(plan.sets.some(x => x.r === 2)).toBe(false); expect(plan.sets.some(x => x.r === 3)).toBe(true);
  });
  it('αλλαγή σε μισογραμμένη γραμμή αλλάζει το αποτύπωμα του πίνακα', () => {
    expect(tableHash(sh(D('2026-10-03')), b)).not.toBe(tableHash(sh(D('2026-10-04')), b));
    expect(tableHash(sh(null), b)).toBe(tableHash({ name: 'Π', rows: [['ΠΟΙΝΕΣ'], [...PHEAD, 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [1, 'ΣΤΡ'], [2, 'ΣΤΡ'], [3]] }, b));
  });
});
