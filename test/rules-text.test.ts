// Κείμενα των Κανόνων υπηρεσιών (Υπηρεσίες › Κανόνες): με τις προεπιλογές λένε ό,τι έλεγαν πάντα· οι νέες επιλογές φαίνονται
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { DEFAULT_RULES, type AppState } from '../src/shared/domain';
import { RULE_TXT, numRotsTxt, strictOrderTxt, strictTxt } from '../src/shared/rulesText';
import { GUIDE } from '../src/renderer/guideText';
import { fakeState } from './fixtures';

const ctx: Ctx = { today: '2026-10-12', newId: () => 'rt1' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;

describe('κείμενα κανόνων', () => {
  it('προεπιλογές: ίδια γραμμή με πριν (χωρίς ώρα εξόδου)', () => {
    expect(RULE_TXT(DEFAULT_RULES)).toBe('ανάπαυση 1 ημ. μετά από υπηρεσία, 3ο/4ο νούμερο ξανά μετά από 3 ημ., όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες, εναλλαγή υπηρεσιών');
    expect(RULE_TXT({ ...DEFAULT_RULES, strictUnarmed: true, outTime: '18:00' })).toMatch(/εναλλαγή υπηρεσιών, Αυστηρά Άοπλοι$/);   // το παλιό outTime δεν γράφεται
    expect(strictTxt({})).toBe('Οι άοπλοι μπαίνουν πρώτα στα μαγειρεία, μετά στο 2ο και 3ο νούμερο θαλαμοφύλακα και οπλοφύλακα (αν ο οπλοφύλακας είναι άοπλος στις Ρυθμίσεις), μετά στο 1ο και 4ο νούμερο θαλαμοφύλακα. Σκοποί μόνο ένοπλοι.');
  });
  it('νούμερα, νέοι από μέσο όρο και σειρά των Αυστηρά Άοπλοι', () => {
    expect(numRotsTxt({ numRots: [0, 2, 3] })).toBe('1ο/3ο/4ο'); expect(numRotsTxt({ numRots: [1] })).toBe('2ο'); expect(numRotsTxt({})).toBe('3ο/4ο');
    const r = { ...DEFAULT_RULES, numRots: [0, 2, 3], newAvg: true, strictUnarmed: true, strictOrder: ['edge', 'mg'] };
    expect(RULE_TXT(r)).toBe('ανάπαυση 1 ημ. μετά από υπηρεσία, 1ο/3ο/4ο νούμερο ξανά μετά από 3 ημ., όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες, οι νέοι ξεκινούν από τον μέσο όρο, εναλλαγή υπηρεσιών, Αυστηρά Άοπλοι (1ο-4ο νούμερο → μαγειρεία)');
    expect(strictOrderTxt({})).toBe('Μαγειρεία → 2ο-3ο νούμερο → 1ο-4ο νούμερο');
    expect(strictTxt({ strictOrder: ['edge', 'mg'] })).toBe('Οι άοπλοι μπαίνουν πρώτα στο 1ο και 4ο νούμερο θαλαμοφύλακα, μετά στα μαγειρεία. Σκοποί μόνο ένοπλοι.');
  });
  it('δική σου άοπλη υπηρεσία με το όνομά της, και διαγραμμένη δεν φαίνεται', () => {
    const s = run(fakeState(5), { t: 'addBlock', phase: 'sven', name: 'Πύλη', armed: false, n: 1, hrs: '' } as Command);
    const key = 'b:' + s.settings.blocks.find(b => b.custom)!.id;
    expect(strictOrderTxt({ strictOrder: [key, 'mg'] }, s.settings)).toBe('Πύλη → μαγειρεία');
    expect(strictTxt({ strictOrder: [key, 'mid'] }, s.settings)).toMatch(/^Οι άοπλοι μπαίνουν πρώτα στην υπηρεσία «Πύλη», μετά στο 2ο και 3ο/);
    expect(strictOrderTxt({ strictOrder: ['b:xgone', 'mg'] }, s.settings)).toBe('Μαγειρεία');
  });
  it('ο οδηγός των κανόνων λέει τις τρεις καρτέλες και τη μία ώρα εξόδου, χωρίς 16:00 και Κ-κωδικούς', () => {
    const body = GUIDE.find(x => x.id === 'rules')!.body;
    expect(body).toMatch(/Καρτέλα «Κανόνες»/); expect(body).toMatch(/Καρτέλα «Σειρά δικαιοσύνης»/); expect(body).toMatch(/Καρτέλα «Ώρες»/); expect(body).toMatch(/Μία ώρα εξόδου/);
    expect(body).not.toMatch(/16:00|Κ-\d\d/);
  });
});
