// Πίνακας καταστάσεων (Michael, 13/10): ΕΥ/ΕΑ/ΕΟ/ΕΑΡΒ και δικά σου ιατρικά, ανά υπηρεσία και έξοδος. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyBlock, fillDay, guardUnavailable, hkaiCounts, isUnarmed, lastResort, outBlock, postsOf, strengthOf } from '../src/shared/rules';
import { DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN, type AppState, type TypeKey } from '../src/shared/domain';
import type { UserLists } from '../src/shared/ranks';
import { statCellOf, statNoDuty, STAT_ROWS } from '../src/shared/stat';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 's' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-10-13';
const declare = (s: AppState, type: TypeKey, pid: number, kind?: string) => run(s, { t: 'declare', cmd: { type, pids: [pid], from: D, to: D, ...(kind ? { kind } : {}) } as any });
const withLists = (s: AppState, lists: UserLists): AppState => ({ ...s, settings: { ...s.settings, lists } });
const armedTh = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (b.id === 'th' ? { ...b, armed: true } : b)) } });
const ALL = [...DEFAULT_BLOCKS, ...DEFAULT_BLOCKS_SPEN];

describe('Καταστάσεις: χωρίς αλλαγές όπως πριν', () => {
  it('κάθε κατάσταση σε κάθε θέση: ίδιο αποτέλεσμα με ή χωρίς ρυθμίσεις', () => {
    for (const t of [...STAT_ROWS, 'STEP', 'NOS', 'LEAVE'] as TypeKey[]) {
      for (const arm of [false, true]) {
        const s0 = declare(arm ? armedTh(fakeState(5)) : fakeState(5), t, 2);
        for (const x of postsOf(s0.settings)) {
          expect(dutyBlock(s0.statuses, D, 2, x, {}), t + ' ' + x.k).toBe(dutyBlock(s0.statuses, D, 2, x));
          expect(lastResort(s0.statuses, D, 2, x, {}), t + ' ' + x.k).toBe(lastResort(s0.statuses, D, 2, x));
        }
      }
    }
  });
  it('οι προεπιλογές: ΕΥ πουθενά, ΕΑ/ΕΟ όχι ένοπλη ή μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού', () => {
    const sk = ALL.find(b => b.kind === 'sk')!, mg = ALL.find(b => b.kind === 'mg')!, op = ALL.find(b => b.kind === 'op' && b.armed)!;
    expect(statCellOf(undefined, 'EY', undefined, mg).v).toBe('no');
    expect(statCellOf(undefined, 'EA', undefined, { ...sk, armed: false }).v).toBe('last');
    expect(statCellOf(undefined, 'EO', undefined, mg).v).toBe('no');
    expect(statCellOf(undefined, 'EA', undefined, op).v).toBe('no');
    expect(statCellOf(undefined, 'EARV', undefined, op).v).toBe('yes');
  });
});

describe('Καταστάσεις: αλλαγές από τις Ρυθμίσεις', () => {
  it('ΕΥ σε μαγειρεία: μπαίνει εκεί, όχι αλλού', () => {
    const s = withLists(declare(fakeState(5), 'EY', 2), { stat: { cells: { EY: { mg: 'yes' } } } });
    expect(guardUnavailable(s, D, 2, 'mg1')).toBeNull();
    expect(guardUnavailable(s, D, 2, 'th1')).toMatch(/ΕΥ/);
  });
  it('ΕΑ όχι θαλαμοφύλακας: με το χέρι μόνο με αιτία', () => {
    const s = withLists(declare(fakeState(5), 'EA', 2), { stat: { cells: { EA: { th: 'no' } } } });
    expect(guardUnavailable(s, D, 2, 'th1')).toMatch(/ΕΑ: όχι θαλαμοφύλακα/);
    expect(() => run(s, { t: 'assign', date: D, k: 'th1', pid: 2 } as any)).toThrow(/ΕΑ/);
    expect(run(s, { t: 'assign', date: D, k: 'th1', pid: 2, force: 'x' } as any).guards[D].th1).toBe(2);
    expect(guardUnavailable(s, D, 2, 'th5')).toBeNull();   // ο β΄ πίνακας είναι άλλη υπηρεσία
  });
  it('«μόνο αν δεν υπάρχει άλλος»: η αυτόματη συμπλήρωση τον βάζει τελευταίο, με προειδοποίηση', () => {
    const s = withLists(declare(fakeState(30), 'EA', 2), { stat: { cells: { EA: { th: 'last' } } } });
    const x = postsOf(s.settings).find(p => p.k === 'th1')!;
    expect(lastResort(s.statuses, D, 2, x, s.settings.lists)).toMatch(/ΕΑ: θαλαμοφύλακα μόνο αν δεν υπάρχει άλλος/);
    const g = fillDay(s, D).guards[D];
    expect(['th1', 'th2', 'th3', 'th4'].some(k => g[k] === 2)).toBe(false);
  });
  it('το δικό σου ιατρικό ακολουθεί αυτό με το οποίο μοιάζει, εκτός αν του δώσεις δικούς κανόνες', () => {
    const med = { medKinds: { add: [{ name: 'ΕΛ ΓΥΜΝ', like: 'EA' as TypeKey }] } };
    const s1 = withLists(declare(fakeState(5), 'EA', 2, 'ΕΛ ΓΥΜΝ'), { ...med, stat: { cells: { EA: { th: 'no' } } } });
    expect(guardUnavailable(s1, D, 2, 'th1')).toMatch(/ΕΛ ΓΥΜΝ/);
    const s2 = withLists(s1, { ...med, stat: { cells: { EA: { th: 'no' }, 'EA:ΕΛ ΓΥΜΝ': { th: 'yes' } } } });
    expect(guardUnavailable(s2, D, 2, 'th1')).toBeNull();
  });
  it('έξοδος: ΕΥ που βγαίνει, ΕΑ που δεν βγαίνει', () => {
    const ey = declare(fakeState(5), 'EY', 2);
    expect(outBlock(ey, D, 2)).toMatch(/ΕΥ/);
    expect(outBlock(withLists(ey, { stat: { out: { EY: true } } }), D, 2)).toBeNull();
    const ea = declare(fakeState(5), 'EA', 2);
    expect(outBlock(ea, D, 2)).toBeNull();
    expect(outBlock(withLists(ea, { stat: { out: { EA: false } } }), D, 2)).toMatch(/ΕΑ/);
  });
  it('«Αυστηρά Άοπλοι»: ο ΕΑ που μπαίνει σε ένοπλη υπηρεσία δεν μετρά άοπλος', () => {
    const s = armedTh(declare(fakeState(5), 'EA', 2));
    expect(isUnarmed(s, D, 2)).toBe(true);
    expect(isUnarmed(withLists(s, { stat: { cells: { EA: { th: 'yes' } } } }), D, 2)).toBe(false);
  });
  it('η αλλαγή γίνεται από τις Ρυθμίσεις και αναιρείται', () => {
    const s0 = declare(fakeState(5), 'EY', 2);
    const s1 = run(s0, { t: 'setSettings', settings: { lists: { stat: { cells: { EY: { mg: 'yes' } } } } }, text: 'x' });
    expect(guardUnavailable(s1, D, 2, 'mg1')).toBeNull();
    expect(guardUnavailable(s0, D, 2, 'mg1')).toMatch(/ΕΥ/);
  });
});

describe('ΣΤΕΠ: εισαγωγή μέσα στο στρατόπεδο (Michael, 14/10)', () => {
  it('παρών, σε καμία υπηρεσία, δεν βγαίνει έξοδο, δεν μετρά στην ΗΚΑΙ', () => {
    const s = declare(fakeState(5), 'STEP', 2);
    expect(strengthOf(s, D).present).toBe(5);
    const h = hkaiCounts(s, D); expect(h.apo + h.kol).toBe(0);
    expect(guardUnavailable(s, D, 2, 'mg1')).toMatch(/ΣΤΕΠ/);
    expect(outBlock(s, D, 2)).toMatch(/ΣΤΕΠ/);
    expect(statNoDuty(s.statuses.find(x => x.type === 'STEP')!, s.settings.blocks)).toBe(true);
  });
});
