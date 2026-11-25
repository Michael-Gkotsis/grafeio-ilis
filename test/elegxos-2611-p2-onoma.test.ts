// Έλεγχος 25/11, πακέτο Π2: αρχείο οπλισμού άλλης μονάδας με το επώνυμο και το όνομα σε δύο στήλες (ΕΠΩΝΥΜΟ, ΟΝΟΜΑ). Πριν, ο κάτοχος
// διαβαζόταν μόνο με το επώνυμο και καμία γραμμή δεν χρεωνόταν σε στρατιώτη («περιμένει απάντηση»). Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { emptyState, type AppState, type Person } from '../src/shared/domain';
import { apply } from '../src/shared/commands';
import { emptyWpn, planWeapons, WROLES } from '../src/shared/weaponUnit';
import { sanitizeProfiles } from '../src/shared/tplStore';
import type { RawSheet } from '../src/shared/roster';

const LAST = ['ΑΛΦΑΙΟΣ', 'ΒΗΤΑΚΗΣ', 'ΓΑΜΑΣ', 'ΔΕΛΤΟΣ', 'ΕΨΙΛΟΣ', 'ΖΗΤΑΣ', 'ΗΤΑΣ', 'ΘΗΤΑΣ', 'ΙΩΤΑΣ', 'ΚΑΠΑΣ'];
const FIRST = ['ΓΕΩΡΓΙΟΣ', 'ΝΙΚΟΛΑΟΣ', 'ΙΩΑΝΝΗΣ', 'ΔΗΜΗΤΡΙΟΣ', 'ΚΩΝΣΤΑΝΤΙΝΟΣ'];
function state(): AppState {
  const people = LAST.map((last, i) => ({ id: i + 1, rank: 'ΣΤΡ', last, first: FIRST[i % 5], father: 'ΠΑΤΗΡ', active: true, notes: '', post: null, attached: false } as Person));
  // συνωνυμία επωνύμου με άλλο όνομα: μόνο με το όνομα ξεχωρίζουν
  people.push({ id: 11, rank: 'ΣΤΡ', last: 'ΑΛΦΑΙΟΣ', first: 'ΠΕΤΡΟΣ', father: 'ΠΑΤΗΡ', active: true, notes: '', post: null, attached: false } as Person);
  return { ...emptyState(), people };
}
const sheet = (head: string[], rows: (string | number)[][]): RawSheet => ({ name: 'ΚΑΤΑΣΤΑΣΗ ΟΠΛΙΣΜΟΥ', rows: [['ΚΑΤΑΣΤΑΣΗ ΟΠΛΙΣΜΟΥ ΙΛΗΣ'], [], head, ...rows], fx: new Set<string>() });

describe('Π2: αρχείο οπλισμού με ΕΠΩΝΥΜΟ και ΟΝΟΜΑ σε δύο στήλες', () => {
  it('ο κάτοχος βρίσκεται με επώνυμο + όνομα και το όπλο γίνεται κύριο όπλο του', () => {
    const st = state();
    const rows = st.people.map((p, i) => [i + 1, 'ΣΤΡ', p.last, p.first, 'G3A3', String(200100 + i), String(i + 1)]);
    const sh = sheet(['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΘΕΣΗ ΣΤΟΝ ΟΠΛΟΒΑΣΤΟ'], rows);
    const pl = planWeapons({ settings: st.settings, people: st.people, cadreList: [], sheets: [sh], prof: emptyWpn(), state: st });
    expect(pl.resolved.read.cols.find(c => c.text === 'ΟΝΟΜΑ')!.role).toBe('first');
    expect(pl.counts.wait).toBe(0); expect(pl.apply.primary).toHaveLength(11);
    for (const p of pl.apply.primary) { const pid = (p.owner as { pid: number }).pid; expect(p.weapon).toBe(String(200100 + pid - 1)); }
    const r = apply(st, { t: 'importWeapons', apply: pl.apply, source: 'x', date: '2026-11-25' }, { today: '2026-11-25', newId: (() => { let n = 0; return () => 'o' + ++n; })() }).state;
    expect(r.people.find(p => p.id === 11)!.weapon).toBe('200110'); expect(r.people.find(p => p.id === 1)!.weapon).toBe('200100');
  });
  it('ονοματεπώνυμο σε μία στήλη και στήλη ΟΝΟΜΑ με το ίδιο όνομα: δεν γράφεται δύο φορές', () => {
    const st = state(); const p = st.people[1];
    const sh = sheet(['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ'], [[1, 'ΣΤΡ', p.last + ' ' + p.first, p.first, 'G3A3', '300001']]);
    const pl = planWeapons({ settings: st.settings, people: st.people, cadreList: [], sheets: [sh], prof: emptyWpn(), state: st });
    expect(pl.resolved.read.items[0].name).toBe(p.last + ' ' + p.first); expect(pl.apply.primary).toHaveLength(1);
  });
  it('ο νέος ρόλος στήλης αποθηκεύεται στο προφίλ και διαβάζεται ξανά', () => {
    expect(WROLES).toContain('first');
    const prof = { ...emptyWpn(), cols: { first: 'ΟΝ/ΜΑ' } };
    const p = sanitizeProfiles([{ v: 1, id: 'w', kind: 'weapons', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], wpn: prof }])[0];
    expect(p.wpn!.cols).toEqual({ first: 'ΟΝ/ΜΑ' });
  });
});
