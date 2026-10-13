// Συνονόματοι (ίδιο επώνυμο και όνομα): πατρώνυμο σε ό,τι δείχνει ή γράφει η εφαρμογή, μόνο σε αυτούς.
import { describe, it, expect } from 'vitest';
import { fullName, plainName, shortName, noteNamesakes, type AppState } from '../src/shared/domain';
import { dutyName, rankName } from '../src/shared/froura';
import { punText } from '../src/shared/punish';
import { fieldValue, makeMatcher } from '../src/shared/sources';
import { personMap } from '../src/shared/rules';
import { fakeState } from './fixtures';

function twins(): AppState {
  const s = fakeState(10);
  s.people[3] = { ...s.people[3], last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: 'ΙΩΑΝΝΗΣ', asm: '' };
  s.people[0] = { ...s.people[0], father: 'ΓΕΩΡΓΙΟΣ', asm: '' };   // ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ (id 1)
  return s;
}

describe('συνονόματοι', () => {
  it('πατρώνυμο μόνο σε όσους έχουν ίδιο ονοματεπώνυμο', () => {
    const s = twins(); noteNamesakes(s.people);
    const [a, , , b] = s.people;
    expect(fullName(a)).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΓΕΩΡΓΙΟΣ');
    expect(fullName(b)).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
    expect(shortName(b)).toBe('ΔΟΚΙΜΙΟΣ Α. του ΙΩΑΝΝΗΣ');
    expect(plainName(b)).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ');
    expect(fullName(s.people[1])).toBe(s.people[1].last + ' ' + s.people[1].first);
    expect(shortName(s.people[1])).toBe(s.people[1].last + ' ' + s.people[1].first.charAt(0) + '.');
    expect(dutyName(b)).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
    expect(rankName(b)).toBe('ΣΤΡ (ΠΖ) ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
  });
  it('η personMap ενημερώνει τους συνονόματους από την κατάσταση', () => {
    const s0 = fakeState(10); personMap(s0.people);
    expect(fullName(s0.people[0])).toBe(s0.people[0].last + ' ' + s0.people[0].first);
    const s = twins(); personMap(s.people);
    expect(fullName(s.people[0])).toContain(' του ');
    expect(punText(s.people[3], { id: 'x', pid: 4, type: 'PUN', from: '2026-10-12', to: '2026-10-14', kind: 'ΚΡΑΤΗΣΗ' }, s.settings.lists).before).toContain('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
  });
  it('στο Excel: πατρώνυμο στο ονοματεπώνυμο μόνο αν δεν έχει δική του στήλη, και ξαναδιαβάζεται', () => {
    const s = twins(); noteNamesakes(s.people);
    const st = { id: 'x', pid: 4, type: 'PUN' as const, from: '2026-10-12', to: '2026-10-14' };
    const v = fieldValue('name', 'punish', st, s.people[3], { cols: { name: 1 } });
    expect(v).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
    expect(fieldValue('name', 'punish', st, s.people[3], { cols: { name: 1, father: 2 } })).toBe('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ');
    expect(fieldValue('first', 'punish', st, s.people[3], { cols: { last: 0, first: 1 } })).toBe('ΑΛΦΑΣ του ΙΩΑΝΝΗΣ');
    expect(fieldValue('first', 'punish', st, s.people[1], { cols: { last: 0, first: 1 } })).toBe(s.people[1].first);
    const m = makeMatcher(s.people);
    expect(m({ name: v as string }).pid).toBe(4);
    expect(m({ name: 'ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ του ΓΕΩΡΓΙΟΣ' }).pid).toBe(1);
    expect(m({ last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ ΤΟΥ ΙΩΑΝΝΗΣ' }).pid).toBe(4);
    expect(m({ name: 'ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ' }).pid).toBeNull();   // χωρίς πατρώνυμο: δεν ξέρουμε ποιος
  });
});
