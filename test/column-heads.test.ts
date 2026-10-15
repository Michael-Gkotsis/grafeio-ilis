// Στήλη που μπήκε στο Excel μπροστά από στήλη που διαβάζει η εφαρμογή, με επικεφαλίδα που δεν είναι γνωστό πεδίο
// (π.χ. «ΣΧΟΛΙΑ»): η αντιστοίχιση ακολουθεί την επικεφαλίδα του πεδίου όταν βρίσκεται με σιγουριά, αλλιώς το είδος
// περιμένει αντιστοίχιση. Ποτέ δεν διαβάζεται ή γράφεται λάθος στήλη. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import type { RawSheet } from '../src/shared/roster';
import { diffStatuses, keepHeads, parseStatuses, refitCols, remapNeed, stampHeads, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const D = (x: number) => new Date(Date.UTC(2026, 9, x));
const sh = (...rows: (string | number | Date | null)[][]): RawSheet => ({ name: 'Τ', rows });
const HEAD = ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'];
const COLS = { aa: 0, last: 1, first: 2, from: 3, to: 4, kind: 5 };
const bind = (cols: Record<string, number> = COLS): SourceBinding => ({ file: 'x', sheet: 'Τ', header: 0, cols, write: true });
// η αντιστοίχιση όπως τη βρίσκει ο main στο πρώτο άνοιγμα, πριν αλλάξει το Excel
const stamped = (head: string[] = HEAD, cols?: Record<string, number>) => stampHeads('punish', sh(head), bind(cols));
const withCol = (head: string[], at: number, h: string) => [...head.slice(0, at), h, ...head.slice(at)];
const refit = (b: SourceBinding, s: RawSheet) => { const nb = refitCols('punish', s, b); return { cols: nb.cols, need: remapNeed('punish', s, nb) }; };

describe('επικεφαλίδες που θυμάται η αντιστοίχιση (heads)', () => {
  it('stampHeads: γράφει τις επικεφαλίδες των στηλών, μία φορά· δεύτερη φορά ίδιο αντικείμενο', () => {
    const b = stamped();
    expect(b.heads).toEqual({ aa: 'Α/Α', last: 'ΕΠΩΝΥΜΟ', first: 'ΟΝΟΜΑ', from: 'ΑΠΟ', to: 'ΕΩΣ', kind: 'ΕΙΔΟΣ ΠΟΙΝΗΣ' });
    expect(stampHeads('punish', sh(HEAD), b)).toBe(b);
  });
  it('stampHeads: δική σου επικεφαλίδα σε στήλη που κανένα άλλο κελί δεν ταιριάζει στο πεδίο → θυμάται το κείμενό της', () => {
    const b = stamped(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΤΥΠΟΣ ΤΙΜΩΡΙΑΣ']);
    expect(b.heads!.kind).toBe('ΤΥΠΟΣ ΤΙΜΩΡΙΑΣ');
  });
  it('stampHeads: δεν θυμάται όταν δεν ξέρει αν η επιλογή ήταν δική σου (γνωστή επικεφαλίδα του πεδίου υπάρχει σε άλλη στήλη) ούτε επικεφαλίδα άλλου πεδίου', () => {
    const b = stamped(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ']);   // το «είδος» δείχνει τα ΣΧΟΛΙΑ: ήδη λάθος ή επιλογή σου;
    expect(b.heads!.kind).toBeUndefined(); expect(b.heads!.from).toBe('ΑΠΟ');
    const c = stamped(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΗΜΕΡΕΣ']);   // «ΗΜΕΡΕΣ» είναι άλλο πεδίο
    expect(c.heads!.kind).toBeUndefined();
  });
  it('keepHeads: ό,τι έρχεται από το UI δεν φέρνει heads· μένουν μόνο αν ο πίνακας και οι στήλες είναι οι ίδιες', () => {
    const cur = stamped();
    expect(keepHeads({ ...cur, heads: { kind: 'ΛΑΘΟΣ' } }, cur).heads).toEqual(cur.heads);
    expect(keepHeads({ ...cur, heads: undefined }, cur).heads).toEqual(cur.heads);
    expect(keepHeads({ ...cur, cols: { ...cur.cols, kind: 6 } }, cur).heads).toBeUndefined();
    expect(keepHeads({ ...cur, header: 1 }, cur).heads).toBeUndefined();
    expect('heads' in keepHeads(bind(), undefined)).toBe(false);
  });
});

describe('στήλη με δική της επικεφαλίδα μπροστά από στήλη του πεδίου (H1)', () => {
  it('«ΣΧΟΛΙΑ» πριν από το «ΕΙΔΟΣ ΠΟΙΝΗΣ»: το είδος ακολουθεί την επικεφαλίδα του', () => {
    const r = refit(stamped(), sh(withCol(HEAD, 5, 'ΣΧΟΛΙΑ')));
    expect(r.cols).toEqual({ ...COLS, kind: 6 }); expect(r.need).toBeNull();
  });
  it('δεν διαβάζεται και δεν γράφεται η στήλη των σχολίων: η αυτόματη ανάγνωση δεν αλλάζει το είδος της ποινής', () => {
    const s = fakeState(6); const p = s.people[1];
    s.statuses = [{ id: 'p1', pid: p.id, type: 'PUN', from: '2026-10-01', to: '2026-10-03', kind: 'Κράτηση' }];
    const after = sh(withCol(HEAD, 5, 'ΣΧΟΛΙΑ'), [1, p.last, p.first, D(1), D(3), '', 'ΚΡΑΤΗΣΗ']);   // η στήλη σχολίων κενή
    const nb = refitCols('punish', after, stamped());
    const parsed = parseStatuses('punish', after, nb, s.people, '2026-10-15', s.settings.lists);
    expect(parsed.cands.map(c => c.kind)).toEqual(['Κράτηση']);
    const df = diffStatuses('punish', s, parsed, nb, {}, [], {});
    expect(df.update).toEqual([]); expect(df.add).toEqual([]); expect(df.same).toBe(1);
  });
  it('κενή στήλη πριν από το «ΕΙΔΟΣ ΠΟΙΝΗΣ» (χωρίς επικεφαλίδα): ακολουθεί', () => {
    const r = refit(stamped(), sh(withCol(HEAD, 5, '')));
    expect(r.cols.kind).toBe(6); expect(r.need).toBeNull();
  });
  it('«ΣΧΟΛΙΑ» ανάμεσα σε «ΑΠΟ» και «ΕΩΣ»: ακολουθούν και το «ΕΩΣ» και το «ΕΙΔΟΣ ΠΟΙΝΗΣ»', () => {
    const r = refit(stamped(), sh(withCol(HEAD, 4, 'ΣΧΟΛΙΑ')));
    expect(r.cols).toEqual({ ...COLS, to: 5, kind: 6 }); expect(r.need).toBeNull();
  });
  it('«ΣΧΟΛΙΑ» δεξιά από το «ΕΙΔΟΣ ΠΟΙΝΗΣ» ή στην αρχή: τίποτα δεν αλλάζει και δεν φρενάρει', () => {
    expect(refit(stamped(), sh([...HEAD, 'ΣΧΟΛΙΑ']))).toEqual({ cols: COLS, need: null });
    const r = refit(stamped(), sh(withCol(HEAD, 0, 'ΣΧΟΛΙΑ')));
    expect(r.cols).toEqual({ aa: 1, last: 2, first: 3, from: 4, to: 5, kind: 6 }); expect(r.need).toBeNull();
  });
  it('η επικεφαλίδα του πεδίου υπάρχει δύο φορές: δεν ακολουθεί, το είδος περιμένει αντιστοίχιση', () => {
    const r = refit(stamped(), sh([...withCol(HEAD, 5, 'ΣΧΟΛΙΑ'), 'ΕΙΔΟΣ ΠΟΙΝΗΣ']));
    expect(r.cols.kind).toBe(5); expect(r.need).toMatch(/ΣΧΟΛΙΑ/);
  });
  it('η επικεφαλίδα του πεδίου χάθηκε: περιμένει αντιστοίχιση (και με κενή επικεφαλίδα)', () => {
    expect(refit(stamped(), sh(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ'])).need).toMatch(/ΣΧΟΛΙΑ/);
    expect(refit(stamped(), sh(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', ''])).need).toMatch(/πια/);
  });
  it('ΗΜΕΡΕΣ μετά το «ΕΩΣ» (γνωστό πεδίο): ακολουθούν οι στήλες, όπως πάντα', () => {
    const r = refit(stamped(), sh(withCol(HEAD, 5, 'ΗΜΕΡΕΣ')));
    expect(r.cols).toEqual({ ...COLS, kind: 6, days: 5 }); expect(r.need).toBeNull();
  });
  it('αλλαγή κειμένου που ταιριάζει ακόμα στο πεδίο («ΕΙΔΟΣ ΠΟΙΝΗΣ» → «ΠΟΙΝΗ»): δεν φρενάρει', () => {
    expect(refit(stamped(), sh(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'Ποινή']))).toEqual({ cols: COLS, need: null });
  });
});

describe('δική σου επικεφαλίδα σε στήλη του πεδίου (χωρίς ψευδές φρενάρισμα)', () => {
  const CUSTOM = ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΤΥΠΟΣ ΤΙΜΩΡΙΑΣ'];   // το «είδος» το έδειξες με κλικ στο κελί
  it('ο πίνακας όπως τον όρισες: καμία ειδοποίηση', () => {
    expect(refit(stamped(CUSTOM), sh(CUSTOM))).toEqual({ cols: COLS, need: null });
  });
  it('ο πίνακας όπως τον όρισες, αλλά με το πεδίο στη μέση και άλλη γνωστή επικεφαλίδα δεξιά: καμία ειδοποίηση', () => {
    const head = ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΤΥΠΟΣ ΤΙΜΩΡΙΑΣ', 'ΕΩΣ'];
    const b = stamped(head, { ...COLS, to: 5, kind: 4 });
    expect(refit(b, sh(head))).toEqual({ cols: { ...COLS, to: 5, kind: 4 }, need: null });
  });
  it('δική σου στήλη παρατηρήσεων («ΡΟΛΟΣ») ενώ υπάρχει και «ΠΑΡΑΤΗΡΗΣΕΙΣ»: δεν ξέρουμε ποια ήθελες, οπότε δεν φρενάρει ούτε αλλάζει', () => {
    const head = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Σ.Ι', 'ΡΟΛΟΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    const b = stampHeads('people', sh(head), { file: 'x', sheet: 'Τ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, si: 5, remarks: 6 }, write: true });
    expect(b.heads!.remarks).toBeUndefined();
    const nb = refitCols('people', sh(head), b);
    expect(nb.cols.remarks).toBe(6); expect(remapNeed('people', sh(head), nb)).toBeNull();
  });
  it('και όταν μπει στήλη μπροστά της, η δική σου επικεφαλίδα ακολουθείται με το κείμενό της', () => {
    const r = refit(stamped(CUSTOM), sh(withCol(CUSTOM, 5, 'ΣΧΟΛΙΑ')));
    expect(r.cols.kind).toBe(6); expect(r.need).toBeNull();
  });
  it('και όταν η δική σου επικεφαλίδα χάθηκε: περιμένει', () => {
    expect(refit(stamped(CUSTOM), sh(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ'])).need).toMatch(/ΣΧΟΛΙΑ/);
  });
});

describe('αντιστοιχίσεις χωρίς heads (από παλιότερη έκδοση)', () => {
  it('συμπεριφέρονται όπως πριν: δική σου επικεφαλίδα δεν φρενάρει', () => {
    expect(refit(bind(), sh(['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ']))).toEqual({ cols: COLS, need: null });
  });
});
