import { describe, it, expect } from 'vitest';
import { makePlatoons, platoonsOf, unitOf } from '../src/shared/domain';
import { appLogo, appTitle } from '../src/shared/brand';

describe('θάλαμοι και ουλαμοί (Ρυθμίσεις, 17/10)', () => {
  it('χωρίς ρυθμίσεις: 8 θάλαμοι, 1–4 → 1ος, 5–8 → 2ος, όπως πριν', () => {
    expect(platoonsOf(null)).toEqual([{ name: '1ος Ουλαμός', rooms: [1, 2, 3, 4] }, { name: '2ος Ουλαμός', rooms: [5, 6, 7, 8] }]);
    expect(unitOf({ room: 4 })).toBe('1ος Ουλ.');
    expect(unitOf({ room: 5 })).toBe('2ος Ουλ.');
    expect(unitOf({ room: null })).toBe('—');
  });
  it('οι ουλαμοί φτιάχνονται από τον αριθμό θαλάμων και θαλάμων ανά ουλαμό· ο τελευταίος παίρνει όσους περισσεύουν', () => {
    expect(makePlatoons(10, 3).map(u => u.rooms)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    expect(makePlatoons(10, 3)[3].name).toBe('4ος Ουλαμός');
  });
  it('δικοί σου ουλαμοί: ο θάλαμος πάει όπου τον έβαλες, εκτός ουλαμού → «—»', () => {
    const st = { rooms: { n: 9, per: 4, platoons: [{ name: '1ος Ουλαμός', rooms: [1, 2, 3] }, { name: 'Ουλαμός Διοίκησης', rooms: [4, 9] }] } };
    expect(unitOf({ room: 9 }, st)).toBe('Ουλαμός Διοίκησης');
    expect(unitOf({ room: 2 }, st)).toBe('1ος Ουλ.');
    expect(unitOf({ room: 5 }, st)).toBe('—');
  });
});

describe('τίτλος και λογότυπο', () => {
  it('προεπιλογή «Γραφείο Λοχία»· ο βαθμός αλλάζει τίτλο και σχέδιο, ο δικός σου τίτλος κερδίζει', () => {
    expect(appTitle(null)).toBe('Γραφείο Λοχία');
    expect(appTitle({ brand: { rank: 'ΕΠΛΧΙΑΣ' } })).toBe('Γραφείο Επιλοχία');
    expect(appLogo({ brand: { rank: 'ΥΠΛΧΟΣ' } })).toEqual({ kind: 'star2' });
    expect(appTitle({ brand: { rank: 'ΥΠΛΧΟΣ', title: '  Γραφείο Ίλης ' } })).toBe('Γραφείο Ίλης');
    expect(appLogo({ brand: { logo: 'star3' } })).toEqual({ kind: 'star3' });
    expect(appLogo({ brand: { logo: 'data:image/png;base64,AAA' } }).src).toBe('data:image/png;base64,AAA');
  });
});
