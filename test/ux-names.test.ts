// UX γύρος 3 (22/10): ονόματα και συνέπεια, Ctrl+K, γκρι κουμπιά που λένε γιατί, σύνδεσμοι αντί για «πήγαινε στο…».
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { hkaiCounts } from '../src/shared/rules';
import { hkaiChecks } from '../src/shared/preflight';
import { GUIDE_TITLES } from '../src/renderer/guideTopic';
import { GUIDE } from '../src/renderer/guideText';
import { norm } from '../src/shared/text';
import { fakeState } from './fixtures';

const D = '2026-10-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'u' + ++n }).state;
const noCadre = (s: AppState): AppState => ({ ...s, cadreList: [], settings: { ...s.settings, cadre: Object.fromEntries(Object.keys(s.settings.cadre).map(k => [k, 0])) } });
const warns = (s: AppState) => hkaiChecks(s, D).filter(c => /Δεν υπάρχουν στελέχη/.test(c.text));
const src = (f: string) => readFileSync(new URL('../src/renderer/' + f, import.meta.url), 'utf8');

describe('ΗΚΑΙ: στελέχη (Π6)', () => {
  it('χωρίς στελέχη πουθενά: μία προειδοποίηση, με σύνδεσμο στα Στελέχη', () => {
    const w = warns(noCadre(fakeState(10)));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ level: 'warn', go: 'cadre' });
  });
  it('με στελέχη στην καρτέλα Στελέχη: καμία προειδοποίηση', () => {
    const s = run(noCadre(fakeState(10)), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
    expect(warns(s)).toEqual([]);
  });
  it('με αριθμούς ανά βαθμό (χωρίς ονόματα): καμία προειδοποίηση', () => {
    const s = noCadre(fakeState(10));
    expect(warns({ ...s, settings: { ...s.settings, cadre: { ...s.settings.cadre, Λοχίες: 2 } } })).toEqual([]);
  });
  it('η δύναμη χωρίζεται σε στρατιώτες και στελέχη', () => {
    const s = run(noCadre(fakeState(10)), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
    const h = hkaiCounts(s, D);
    expect(h.cadreN).toBe(1);
    expect(h.soldiers + h.cadreN).toBe(h.total);
    expect(h.soldiers).toBe(s.people.filter(p => p.active).length);
  });
});

describe('Ctrl+K βρίσκει οθόνες, ενέργειες, Ρυθμίσεις και Οδηγό (Μ8)', () => {
  const pal = src('screens/other.ts').slice(src('screens/other.ts').indexOf('export function CommandPalette'));
  it('οι τίτλοι του Οδηγού για την αναζήτηση ταιριάζουν με τον Οδηγό', () => {
    expect(GUIDE_TITLES).toEqual(GUIDE.map(t => [t.id, t.title]));
  });
  it('όσα έλειπαν είναι πια μέσα', () => {
    for (const t of ['Στελέχη', 'Οπλισμός', 'Νέος στρατιώτης', 'Γρήγορη εισαγωγή', 'Κανόνες υπηρεσιών', 'Εκτός δύναμης', 'Εκτύπωση', 'Γράμματα Excel', 'Υπογραφές', 'Πρότυπα εφαρμογής', 'Ρυθμίσεις › Σ.Ι.', 'Ρυθμίσεις › Αργίες'])
      expect(pal.includes("t: '" + t) || pal.includes('› ' + t), t).toBe(true);
    expect(pal).toMatch(/GUIDE_TITLES\.map/);
  });
  it('«εκτ» βρίσκει κάτι (πριν: «Δεν βρέθηκε τίποτα»)', () => {
    const ks = [...pal.matchAll(/k: '([^']+)'/g)].map(m => m[1]);
    expect(ks.filter(k => k.includes(norm('εκτ'))).length).toBeGreaterThanOrEqual(2);
  });
  it('οι παράμετροι που στέλνει ανοίγουν το σωστό σημείο', () => {
    expect(src('screens/guard.ts')).toMatch(/nav\.params\.gopen/);
    expect(src('screens/people.ts')).toMatch(/nav\.params\.quickAdd === 'one'/);
    expect(src('app.ts')).not.toMatch(/import .*guideText/);   // ο Οδηγός φορτώνει μόνο όταν ανοίξει
    expect(pal).not.toMatch(/guideText/);
  });
});

describe('γκρι κουμπιά λένε γιατί (Μ5)', () => {
  it('το Button δείχνει τον λόγο στη συμβουλή όσο είναι γκρι', () => {
    expect(src('ui.ts')).toMatch(/disabled && why \? \{ 'data-tip': why/);
  });
  it('Νέος στρατιώτης, Αίτηση, Αυτόματη συμπλήρωση και Νέα υπηρεσία', () => {
    const p = src('screens/people.ts');
    expect(p).toMatch(/missingOf\(\[\['Επώνυμο', x\.last\.trim\(\)\], \['Όνομα', x\.first\.trim\(\)\]\]\)/);
    expect(p).toMatch(/<\$\{Why\} text=\$\{miss\}\/>/);
    expect(src('screens/other.ts')).toMatch(/'Λείπει: Στρατιώτης'/);
    expect(src('screens/guard.ts')).toMatch(/'Δεν υπάρχουν κενές θέσεις'/);
    expect(src('screens/guard.ts')).toMatch(/why=\$\{afWhy\}/);
    expect(src('screens/guard.ts')).toMatch(/'Λείπει: Όνομα'/);
  });
  it('όσα γκριζάρουν επειδή λείπει κάτι έχουν λόγο (όχι όσα απλώς περιμένουν να τελειώσει κάτι)', () => {
    const files = ['screens/people.ts', 'screens/other.ts', 'screens/guard.ts', 'screens/cadre.ts', 'screens/settings.ts', 'screens/weaponMoves.ts', 'screens/sources.ts', 'screens/reports.ts', 'screens/si.ts', 'screens/lists.ts', 'screens/units.ts', 'screens/dayForms.ts', 'screens/esso.ts'];
    for (const f of files) for (const m of src(f).matchAll(/<\$\{Button\}[^>]*?disabled=\$\{([^}]*)\}[^>]*>/g)) {
      const cond = m[1].replace(/(!!?)?(busy|xb|xl|step)( \|\| )?|i === 0|i === [a-z.]+ - 1|at <= 0|at >= order\.length - 1/g, '').trim();
      if (!cond || /^\|\||^\(\)$/.test(cond)) continue;
      expect(m[0], f).toMatch(/why=|data-tip=/);
    }
  });
});

describe('«πήγαινε στο…» είναι σύνδεσμοι (Χ5)', () => {
  it('Κανόνες υπηρεσιών: οι βάρδιες ανοίγουν τις Ρυθμίσεις › Υπηρεσίες', () => {
    expect(src('screens/guard.ts')).toMatch(/<\$\{GoLink\} view="templates" params=\$\{\{ tab: 'duty', dsub: 'blocks' \}\}>Ρυθμίσεις › Υπηρεσίες και αργίες/);
  });
  it('Ρυθμίσεις › Μονάδα: η κεφαλίδα των άλλων εντύπων είναι «τα τρία πεδία πιο πάνω»', () => {
    expect(src('screens/hkrows.ts')).toContain('είναι τα τρία πεδία πιο πάνω.');
    expect(src('screens/settings.ts')).toMatch(/<\$\{HkHeadFields\} value=\$\{s\.head\}.*inSettings=\$\{true\}\/>/);
  });
  it('μέσα σε παράθυρο ο σύνδεσμος το κλείνει πρώτα και ρωτά αν έχει αλλαγές', () => {
    expect(src('ui.ts')).toMatch(/const leave = \(after: \(\) => void\) => \{ if \(dirty\) setAsking\(\{ after \}\)/);
    expect(src('common.ts')).toMatch(/leave \? leave\(go\) : go\(\)/);
  });
  it('κανένα ορατό «στις Ρυθμίσεις › …» ως απλό κείμενο μέσα σε σημείωση', () => {
    for (const f of ['screens/guard.ts', 'screens/esso.ts', 'screens/sources.ts', 'screens/whodoes.ts', 'screens/hkrows.ts', 'screens/reports.ts']) {
      const plain = src(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').match(/(?:field__help|note|<small)[^`]*?[^>]Ρυθμίσεις › [^<]*</g) || [];
      // η Νέα ΕΣΣΟ μένει κείμενο: λέει ότι αλλάζουν και αργότερα, όχι «πήγαινε τώρα» (ο οδηγός της ΕΣΣΟ δεν πρέπει να κλείσει)
      expect(plain.filter(x => !/data-tip=|toast\(|αλλάζουν και μετά από/.test(x)), f).toEqual([]);
    }
  });
});
