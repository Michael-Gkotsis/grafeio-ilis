// Ιατρικά «μόνο σημείωση» και Excel ΕΑ-ΕΥ (Michael, 4/11): γραμμή με το είδος διαβάζεται κανονικά· χωρίς «στο Excel» δεν γράφεται, δεν λείπει
// από το Excel και δεν «σβήστηκε από το Excel»· με «στο Excel» συμπεριφέρεται όπως κάθε ιατρικό. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, diffStatuses, identity, parseStatuses, planWrite, type SourceBinding } from '../src/shared/sources';
import type { UserLists } from '../src/shared/ranks';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'e' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room];
const NOTE = 'ΕΛ. ΞΥΡΙΣΜΑΤΟΣ';
const lists = (xl: boolean): UserLists => ({ medKinds: { add: [{ name: NOTE, like: 'EA', note: true, ...(xl ? { noteXl: true } : {}) }] } });
const base = (xl: boolean): AppState => { const s = fakeState(30); return { ...s, settings: { ...s.settings, lists: lists(xl) } }; };
const sheetOf = (s: AppState, rows: unknown[][] = []): RawSheet => ({ name: 'IATRIKA', rows: [
  ['ΕΑ-ΕΥ'], [...HEAD, 'ΕΑ-ΕΥ', 'ΑΠΌ', 'ΕΩΣ', 'Παρατηρήσεις'],
  [...pr(s.people[10], 0), 'ΕΑ', D('2026-10-09'), D('2026-10-16'), 'ΓΟΝΑΤΟ'],
  ...rows, []
] as RawSheet['rows'] });
const bind = (sh: RawSheet): SourceBinding => ({ file: 'x.xlsx', sheet: 'IATRIKA', header: 1, cols: bestFor('medical', [sh])!.cols, write: true });
const declareNote = (s: AppState, pid: number) => run(s, { t: 'declare', cmd: { type: 'EA', kind: NOTE, pids: [pid], from: '2026-10-10', to: '2026-10-20' } });

describe('μόνο σημείωση και Excel ΕΑ-ΕΥ', () => {
  for (const xl of [false, true]) it('ανάγνωση: χειρόγραφη γραμμή με το είδος διαβάζεται ως σημείωση (noteXl ' + (xl ? 'ναι' : 'όχι') + ')', () => {
    const s = base(xl); const sh = sheetOf(s, [[...pr(s.people[12], 1), NOTE, D('2026-10-10'), D('2026-10-18'), '']]);
    const b = bind(sh); const p = parseStatuses('medical', sh, b, s.people, TODAY, s.settings.lists);
    expect(p.unknown).toEqual([]);
    const d = diffStatuses('medical', s, p, b);
    expect(d.add.map(a => [a.pid, a.type, a.kind])).toEqual([[11, 'EA', undefined], [13, 'EA', NOTE]]);
    const s2 = run(s, { t: 'importRecords', adds: d.add, updates: [], source: 'x', what: 'ιατρικά' });
    const got = s2.statuses.find(x => x.pid === 13)!;
    expect(got.kind).toBe(NOTE);
    // ξαναδιαβάζεται χωρίς αλλαγές
    const d2 = diffStatuses('medical', s2, p, b);
    expect(d2.add).toEqual([]); expect(d2.update).toEqual([]); expect(d2.removed).toEqual([]); expect(d2.appOnly).toEqual([]);
  });

  it('χωρίς «στο Excel»: η σημείωση της εφαρμογής δεν είναι «σβήστηκε από το Excel» ούτε «λείπει από το Excel»', () => {
    const s = declareNote(base(false), 14); const sh = sheetOf(s); const b = bind(sh);
    const key = identity(14, 'medical', '2026-10-10', NOTE.replace(/[^Α-ΩA-Z0-9]/g, ''));
    const d = diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, TODAY, s.settings.lists), b, {}, [key, identity(14, 'medical', '2026-10-10', 'ΕΛΞΥΡΙΣΜΑΤΟΣ')]);
    expect(d.removed).toEqual([]); expect(d.appOnly).toEqual([]);
    // σύγκριση: το ίδιο με πραγματικό ιατρικό, που έχει γραφτεί παλιότερα, λείπει και αναφέρεται
    const r = run(base(false), { t: 'declare', cmd: { type: 'EA', pids: [14], from: '2026-10-10', to: '2026-10-20' } });
    const dr = diffStatuses('medical', r, parseStatuses('medical', sh, b, r.people, TODAY, r.settings.lists), b);
    expect(dr.appOnly.map(x => x.pid)).toEqual([14]);
  });

  it('χωρίς «στο Excel»: δεν γράφεται (ούτε γραμμή, ούτε σβήσιμο γραμμής που υπάρχει)', () => {
    const s = declareNote(base(false), 14); const sh = sheetOf(s); const b = bind(sh);
    const plan = planWrite('medical', sh, b, s, [], TODAY);
    expect(plan.added).toBe(0); expect(plan.sets.filter(x => x.v === NOTE)).toEqual([]);
    // γραμμή γραμμένη με το χέρι, που έχει διαβαστεί (synced): μένει όπως είναι
    const sh2 = sheetOf(s, [[...pr(s.people[13], 1), NOTE, D('2026-10-10'), D('2026-10-20'), '']]); const b2 = bind(sh2);
    const key = identity(14, 'medical', '2026-10-10', 'ΕΛΞΥΡΙΣΜΑΤΟΣ');
    const p2 = planWrite('medical', sh2, b2, s, [key], TODAY);
    expect(p2.cleared).toBe(0); expect(p2.sets.some(x => x.v === null)).toBe(false);
  });

  it('με «στο Excel»: γράφεται και λείπει/σβήνεται όπως κάθε ιατρικό', () => {
    const s = declareNote(base(true), 14); const sh = sheetOf(s); const b = bind(sh);
    const plan = planWrite('medical', sh, b, s, [], TODAY);
    expect(plan.added).toBe(1); expect(plan.sets.map(x => x.v)).toContain(NOTE);
    const d = diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, TODAY, s.settings.lists), b);
    expect(d.appOnly.map(x => x.pid)).toEqual([14]);
  });
});
