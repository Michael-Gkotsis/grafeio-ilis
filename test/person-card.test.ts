// Καρτέλα στρατιώτη (Michael, 17/10): «Διόρθωση → Εκτός δύναμης» τον περνά στους εκτός δύναμης και τον βγάζει από τις
// υπηρεσίες από σήμερα και μετά· η ΕΣΣΟ της δύναμης φαίνεται πάνω δεξιά. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply } from '../src/shared/commands';
import { currentEssos } from '../src/shared/rosterLists';
import { postsOf } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import { fakeState } from './fixtures';

const D = '2026-10-12';
const ctx = { today: D, newId: () => 'x' };

describe('καρτέλα στρατιώτη', () => {
  it('εκτός δύναμης: βγαίνει από τις υπηρεσίες από σήμερα, οι περασμένες μένουν', () => {
    let s = fakeState();
    const p = s.people.find(x => x.active)!; const k = postsOf(s.settings)[0].k;
    const y = addDays(D, -1), t = addDays(D, 1);
    s = { ...s, guards: { [y]: { [k]: p.id }, [D]: { [k]: p.id }, [t]: { [k]: p.id } } };
    const r = apply(s, { t: 'updatePerson', person: { ...p, active: false } }, ctx);
    expect(r.state.people.find(x => x.id === p.id)!.active).toBe(false);
    expect(r.state.guards[y]?.[k]).toBe(p.id);
    expect(r.state.guards[D]?.[k]).toBeFalsy();
    expect(r.state.guards[t]?.[k]).toBeFalsy();
    expect(r.text).toContain('εκτός δύναμης');
  });
  it('ΕΣΣΟ: η πιο συχνή όσων είναι σε δύναμη', () => {
    const s = fakeState();
    const people = s.people.slice(0, 5).map((p, i) => ({ ...p, active: i !== 0, essos: i < 4 ? '2026 Γ΄' : '2026 Β΄' }));
    people[0] = { ...people[0], essos: '2026 Β΄' };   // εκτός δύναμης: δεν μετρά
    expect(currentEssos(people)).toBe('2026 Γ΄');
    expect(currentEssos([])).toBe('');
  });
});
