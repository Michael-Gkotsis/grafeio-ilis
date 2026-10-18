// Πολλά ιατρικά σε μία δήλωση (Michael, 18/10): ίδιος λόγος, ίδιες μέρες, καθένα σε δική του γραμμή. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { planStatusChanges } from '../src/shared/rules';
import type { AppState } from '../src/shared/domain';
import type { StatusCmd } from '../src/shared/rules';
import { fakeState } from './fixtures';

const TODAY = '2026-10-18';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'd' + ++seq };
const lists = { medKinds: { add: [{ name: 'ΕΛ ΠΟΔ', like: 'EA' as const }] } };
const base = (): AppState => { const f = fakeState(20); return { ...f, settings: { ...f.settings, lists } }; };
const c = (type: StatusCmd['type'], kind?: string): StatusCmd => ({ type, pids: [3, 4], from: TODAY, to: '2026-10-20', note: 'ΔΙΑΣΤΡΕΜΜΑ', ...(kind ? { kind } : {}) });

describe('δήλωση πολλών ιατρικών μαζί', () => {
  it('ΕΑ + ΕΥ + δικό σου ιατρικό σε δύο στρατιώτες: έξι γραμμές, ίδιες μέρες και παρατήρηση, μία εγγραφή ιστορικού', () => {
    const r = apply(base(), { t: 'declareMany', cmds: [c('EA'), c('EY'), c('EA', 'ΕΛ ΠΟΔ')] } as Command, ctx);
    const mine = r.state.statuses.filter(x => x.pid === 3 || x.pid === 4);
    expect(mine).toHaveLength(6);
    expect(mine.every(x => x.from === TODAY && x.to === '2026-10-20' && x.note === 'ΔΙΑΣΤΡΕΜΜΑ')).toBe(true);
    expect(mine.filter(x => x.pid === 3).map(x => x.type + (x.kind ? ':' + x.kind : ''))).toEqual(['EA', 'EY', 'EA:ΕΛ ΠΟΔ']);
    expect(r.text).toBe('Δηλώθηκαν ΕΑ + ΕΥ + ΕΛ ΠΟΔ 18/10–20/10: 2 άτομα');
    expect(r.files).toContain('Ιατρικά');
    expect(new Set(r.files).size).toBe(r.files.length);
  });
  it('το σχέδιο αθροίζει τις γραμμές στα Ιατρικά και δείχνει μία φορά την υπηρεσία που χάνει', () => {
    const s0: AppState = { ...base(), guards: { [TODAY]: { th1: 3 } } };
    const plan = planStatusChanges(s0, [c('EA'), c('EY')], TODAY);
    expect(plan.files.filter(f => f.fn === 'Ιατρικά').map(f => f.desc)).toEqual([expect.stringMatching(/^\+4 γραμμές/)]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.files.filter(f => f.fn === 'Υπηρεσίες 18/10')).toHaveLength(1);
    expect(apply(s0, { t: 'declareMany', cmds: [c('EA'), c('EY')] }, ctx).state.guards[TODAY].th1).toBeUndefined();
  });
  it('ένα μόνο ιατρικό: ίδιο αποτέλεσμα με την απλή δήλωση', () => {
    const one = planStatusChanges(base(), [c('EY')], TODAY);
    expect(one.files.find(f => f.fn === 'Ιατρικά')!.desc).toMatch(/^\+2 γραμμές/);
    const a = apply(base(), { t: 'declareMany', cmds: [c('EY')] }, ctx), b = apply(base(), { t: 'declare', cmd: c('EY') }, ctx);
    expect(a.text).toBe(b.text);
  });
});
