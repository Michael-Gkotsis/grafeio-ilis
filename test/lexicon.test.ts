// The Lexicon: names (built-in, learned, user) for ranks, statuses, services, posts, person fields and the ΗΚΑΙ rows/columns.
// Absolute rule: prefer unknown over a wrong sure.
import { describe, it, expect } from 'vitest';
import { defaultLexicon, buildLexicon, normText, phraseKey, type ConceptKind } from '../src/shared/lexicon';

const L = defaultLexicon();
const COL: ConceptKind[] = ['hkcol', 'status', 'service', 'post', 'total'];
const ROW: ConceptKind[] = ['hkrow', 'rank', 'total'];
const m = (s: unknown, kinds?: ConceptKind[]) => L.match(s, kinds ? { kinds } : {});
const sure = (s: string, concept: string, kinds?: ConceptKind[]) => { const x = m(s, kinds); expect([x.confidence, x.concept], s).toEqual(['sure', concept]); };

describe('lexicon normalisation', () => {
  it('ignores accents, case, dots, spaces, hyphens and the final sigma', () => {
    expect(normText('  Τοποθετημένοι ')).toBe(normText('ΤΟΠΟΘΕΤΗΜΕΝΟΙ'));
    expect(phraseKey('Ο.Σ.')).toBe(phraseKey('Ο/Σ'));
    expect(phraseKey('Ο-Σ')).toBe(phraseKey('Ο/Σ'));
    expect(phraseKey('ΣΎΝΟΛΟΣ')).toBe(phraseKey('συνολοσ'));
  });
});

describe('lexicon matching', () => {
  it('knows the ΗΚΑΙ columns by name, plural, case, accents, Latin look-alikes and abbreviations', () => {
    sure('Μαγειρεία', 'hkcol:mag', COL); sure('ΜΑΓΕΙΡΙΑ', 'hkcol:mag', COL); sure('ΤΟΠΟΘΕΤΗΜΕΝΟΙ', 'hkcol:placed', COL);
    sure('Ο/Σ', 'hkcol:os', COL); sure('Ο-Σ', 'hkcol:os', COL); sure('O.Σ.', 'hkcol:os', COL);   // the last one has a Latin O
    sure('Προσκολημένοι', 'hkcol:attached', COL);                                                 // one letter missing
  });
  it('knows ranks, HK rows and the ΗΚΑΛ names', () => {
    sure('Ταγματάρχες', 'hkrow:Επίλαρχοι', ROW); sure('Εποπ Στρ', 'hkrow:ΕΠΟΠ Στρατιώτης', ROW); sure('ΥΠΛΧΟΣ', 'rank:ΥΠΟΛΟΧΑΓΟΣ', ROW);
  });
  it('knows person fields', () => {
    sure('ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'person:name'); sure('Επώνυμο', 'person:last'); sure('Α/Α', 'person:aa'); sure('Βαθμός', 'person:rank'); sure('Τηλέφωνο', 'person:phone');
    sure('ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'weapon:number');
  });
  it('a compound header is never sure (Σιτιστές-Γραφείς-Μάγειρες is not Μαγειρεία)', () => {
    const x = m('Σιτιστές - Γραφείς-Μάγειρες', COL);
    expect(x.confidence).not.toBe('sure'); expect(x.concept).not.toBe('hkcol:mag');
  });
  it('a typo or a qualifier gives at most suggest', () => {
    expect(m('Σύνολο κωλιωμένων', COL).confidence).toBe('suggest');
    expect(m('Λχίες (ΕΠΟΠ)', ROW).confidence).toBe('suggest');
    expect(m('Φυλάκιο Γιαννούλη-126', COL).confidence).not.toBe('sure');
  });
  it('unit words nobody knows stay unknown', () => {
    for (const s of ['Ξένη γλώσσα', 'Στήλη1', 'Χ', '', '   ']) expect(m(s).confidence, s).toBe('unknown');
    expect(m(null).confidence).toBe('unknown'); expect(m(42).confidence).toBe('unknown');
  });
  it('a plural of a person field is not the field (ΒΑΘΜΟΙ is the group of ranks)', () => {
    expect(m('ΒΑΘΜΟΙ').concept).toBe('group:ranks');
  });
  it('every answer has a reason', () => {
    for (const s of ['Μαγειρεία', 'Σύνολο κωλιωμένων', 'Ξένη γλώσσα']) expect(m(s).why.length).toBeGreaterThan(0);
  });
});

describe('own, learned and user names', () => {
  it('own ranks from settings.lists become ranks', () => {
    const X = buildLexicon({ lists: { soldierRanks: { add: [{ name: 'ΑΡΧΙΣΤΡΑΤΗΓΟΣ' }] } } as never });
    expect([X.match('ΑΡΧΙΣΤΡΑΤΗΓΟΣ').confidence, X.match('ΑΡΧΙΣΤΡΑΤΗΓΟΣ').concept]).toEqual(['sure', 'rank:ΑΡΧΙΣΤΡΑΤΗΓΟΣ']);
    expect(L.match('ΑΡΧΙΣΤΡΑΤΗΓΟΣ').confidence).toBe('unknown');
  });
  it('learned and user-added names are matched like built-in ones', () => {
    const X = buildLexicon({ user: { 'hkcol:mag': ['Κουζίνα'] }, learned: { 'hkcol:sid': ['Μηχανουργείο'] }, services: ['Πύλη'], posts: ['Βιβλιοθηκάριος'] });
    expect(X.match('Κουζίνα').concept).toBe('hkcol:mag'); expect(X.match('ΚΟΥΖΙΝΑ').confidence).toBe('sure');
    expect(X.match('Μηχανουργείο').concept).toBe('hkcol:sid');
    expect(X.match('Πύλη').concept).toBe('service:' + phraseKey('Πύλη'));
    expect(X.match('Βιβλιοθηκάριος').concept).toBe('post:' + phraseKey('Βιβλιοθηκάριος'));
    expect(L.match('Κουζίνα').concept).not.toBe('hkcol:mag');   // the default lexicon is untouched
  });
});
