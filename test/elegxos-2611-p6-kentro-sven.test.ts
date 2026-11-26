// Πίσω στο κέντρο: το έντυπο υπηρεσιών γυρνά στη ΣΒΕΝ μόνο αν το άλλαξε η μετάβαση στη μονάδα. Μόνο ψεύτικα δεδομένα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-01', newId: () => 'q' + ++n }).state;
const set = (s: AppState, settings: object) => run(s, { t: 'setSettings', settings, text: 'δοκιμή' } as Command);
const unit = (s: AppState) => set(s, { mode: 'unit' });
const centre = (s: AppState) => set(s, { mode: 'centre' });
const frozen = (s: AppState) => JSON.stringify(s);

describe('πίσω στο κέντρο', () => {
  it('κέντρο (ΣΒΕΝ) → μονάδα (ΣΠΕΝ) → κέντρο: ΣΒΕΝ', () => {
    const s0 = fakeState(5); const u = unit(s0);
    expect(u.settings.phase).toBe('spen');
    const c = centre(u);
    expect(c.settings.mode).toBe('centre'); expect(c.settings.phase).toBe('sven'); expect('unitSpen' in c.settings).toBe(false);
  });
  it('ΣΠΕΝ που διάλεξε ο χρήστης στο κέντρο μένει ΣΠΕΝ', () => {
    const s0 = run(fakeState(5), { t: 'setPhase', phase: 'spen' });
    const c = centre(unit(s0));
    expect(c.settings.phase).toBe('spen'); expect('unitSpen' in c.settings).toBe(false);
  });
  const own = (u: AppState) => { const v = run(u, { t: 'addPhase', name: 'ΔΙΚΟ', from: 'spen' }); return { v, id: v.settings.phases![0].id }; };
  it('άλλο έντυπο με το χέρι στη μονάδα: το κέντρο το κρατά', () => {
    const { v, id } = own(unit(fakeState(5)));
    expect(centre(run(v, { t: 'setPhase', phase: id })).settings.phase).toBe(id);
    expect(centre(set(v, { phase: id })).settings.phase).toBe(id);
  });
  it('πάει αλλού και γυρνά στη ΣΠΕΝ με το χέρι: είναι επιλογή του χρήστη, μένει ΣΠΕΝ', () => {
    const { v, id } = own(unit(fakeState(5)));
    const p = run(run(v, { t: 'setPhase', phase: id }), { t: 'setPhase', phase: 'spen' });
    expect('unitSpen' in p.settings).toBe(false); expect(centre(p).settings.phase).toBe('spen');
    const q = set(set(v, { phase: id }), { phase: 'spen' });
    expect(centre(q).settings.phase).toBe('spen');
  });
  it('οι αλλαγές δεν αλλάζουν την προηγούμενη κατάσταση (αναίρεση)', () => {
    const s0 = fakeState(5); const b0 = frozen(s0);
    const u = unit(s0); const b1 = frozen(u);
    centre(u);
    expect(frozen(s0)).toBe(b0); expect(frozen(u)).toBe(b1);
  });
});
