// Δήλωση δικού σου ιατρικού πάνω σε υπηρεσία: ισχύουν οι κανόνες του ιατρικού ανά υπηρεσία (όχι του ΕΑ που μοιάζει).
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { planStatusChange } from '../src/shared/rules';
import type { AppState, TypeKey } from '../src/shared/domain';
import type { UserLists } from '../src/shared/ranks';
import { fakeState } from './fixtures';

const ctx: Ctx = { today: '2026-10-12', newId: () => 'm' + Math.random() };
const D = '2026-10-13';
const med = { medKinds: { add: [{ name: 'ΕΛ ΓΥΜΝ', like: 'EA' as TypeKey }] } };
const withLists = (s: AppState, lists: UserLists): AppState => ({ ...s, settings: { ...s.settings, lists } });
const cmd = { type: 'EA' as TypeKey, pids: [2], from: D, to: D, kind: 'ΕΛ ΓΥΜΝ' };

describe('δήλωση δικού σου ιατρικού (κανόνες ανά υπηρεσία)', () => {
  it('«όχι θαλαμοφύλακας» για το δικό σου ιατρικό: βγαίνει από τη θέση (το ΕΑ θα έμενε)', () => {
    const s = withLists({ ...fakeState(5), guards: { [D]: { th1: 2 } } }, { ...med, stat: { cells: { 'EA:ΕΛ ΓΥΜΝ': { th: 'no' } } } });
    expect(planStatusChange(s, cmd, ctx.today).conflicts).toEqual([{ pid: 2, date: D, k: 'th1' }]);
    expect(apply(s, { t: 'declare', cmd }, ctx).state.guards[D].th1).toBeUndefined();
  });
  it('«μαγειρεία ναι» για το δικό σου ιατρικό: μένει στη θέση (το ΕΑ θα έβγαινε)', () => {
    const s = withLists({ ...fakeState(5), guards: { [D]: { mg1: 2 } } }, { ...med, stat: { cells: { 'EA:ΕΛ ΓΥΜΝ': { mg: 'yes' } } } });
    expect(planStatusChange(s, cmd, ctx.today).conflicts).toEqual([]);
    expect(apply(s, { t: 'declare', cmd }, ctx).state.guards[D].mg1).toBe(2);
  });
});
