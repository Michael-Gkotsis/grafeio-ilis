// Οι «δυνάμεις» να συμφωνούν μεταξύ τους (Michael, 2/11: «δεν χρειάζεται να δείχνουν τα ίδια… αλλά να είναι consistent μεταξύ τους»).
// Κάθε οθόνη μετρά στη δική της στιγμή (Σήμερα/Δύναμη: τώρα· ΗΚΑΙ: 08:00· ΔΥΝΑΜΗ του Excel: η ώρα εξόδου), αλλά στην ίδια στιγμή
// λένε το ίδιο, κάθε άτομο μία φορά. Τυχαίες επαναλήψιμες δύο εβδομάδες (outs-gen), πολλές ώρες της μέρας. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { genState, DAYS } from './outs-gen';
import { check } from './strength-check';
import { hkaiCounts, hkMin, strengthOf } from '../src/shared/rules';
import { dayBook } from '../src/shared/outsDay';
import type { AppState, TypeKey } from '../src/shared/domain';
import type { UserLists } from '../src/shared/ranks';


describe('Σήμερα, Δύναμη, ΗΚΑΙ και ΔΥΝΑΜΗ συμφωνούν μεταξύ τους', () => {
  for (const realistic of [true, false]) it(realistic ? 'όπως τα αφήνει η οθόνη' : 'και παρά τους κανόνες', () => {
    const errs: string[] = [];
    for (let seed = 1; seed <= 25; seed++) { const s = genState(seed * 7919 + (realistic ? 0 : 1), realistic); for (const d of DAYS) errs.push(...check(s, d).map(e => 's' + seed + ' ' + e)); }
    expect(errs.slice(0, 25)).toEqual([]);
  });
});

// Δικά σου είδη άδειας (Michael, 3/11): απών με στήλη (Φ.Πορ.), κωλυόμενος με στήλη (Κίν.), παρών «Πουθενά» χωρίς και με υπηρεσίες/έξοδο.
// Οι Κανονικές και οι ΑΜΔ των τυχαίων δεδομένων γίνονται, με τη σειρά, τα δικά σου είδη· οι αριθμοί των οθονών συμφωνούν και με αυτά.
const OWN: UserLists = { leaveKinds: { add: [{ name: 'Φύλλο πορείας', col: 'fp' }, { name: 'Υπηρεσιακό', col: 'kin' }, { name: 'Εκτός', col: '-' }, { name: 'Εκτός2', col: '-', duty: true, out: true }, { name: 'Απών-εφαρμογή', col: '-a' }] } };
const KINDS = ['Φύλλο πορείας', 'Υπηρεσιακό', 'Εκτός', 'Εκτός2', 'Απών-εφαρμογή'];
const withOwn = (s: AppState): AppState => {
  let i = 0;
  return { ...s, settings: { ...s.settings, lists: OWN }, statuses: s.statuses.map(x => (x.type === 'LEAVE' && x.kind !== 'Ειδική' ? { ...x, kind: KINDS[i++ % KINDS.length] } : x)) };
};
describe('και με δικά σου είδη άδειας (απών, κωλυόμενος, παρών)', () => {
  for (const realistic of [true, false]) it(realistic ? 'όπως τα αφήνει η οθόνη' : 'και παρά τους κανόνες', () => {
    const errs: string[] = []; let own = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = withOwn(genState(seed * 7919 + (realistic ? 0 : 1), realistic, 30)); own += s.statuses.filter(x => KINDS.includes(x.kind || '')).length;
      for (const d of DAYS) errs.push(...check(s, d).map(e => 's' + seed + ' ' + e));
    }
    expect(own).toBeGreaterThan(60);
    expect(errs.slice(0, 25)).toEqual([]);
  });
});

// Άγνοια / Λιποταξία / Αδικαιολόγητη απουσία (Michael, 17/11): απόντες που μετρούν στη στήλη «Αγνοούμενοι / Αδικαιολογήτως Απών» της ΗΚΑΙ.
// Κάθε τρίτη άδεια ή νοσοκομείο των τυχαίων δεδομένων γίνεται, με τη σειρά, μία από τις τρεις· οι αριθμοί των οθονών συμφωνούν και με αυτές.
const ADIK: TypeKey[] = ['AGN', 'LIP', 'ADK'];
const withAdik = (s: AppState): AppState => {
  let i = 0, n = 0;
  return { ...s, statuses: s.statuses.map(x => ((x.type === 'LEAVE' || x.type === 'NOS') && n++ % 3 === 0 ? { ...x, type: ADIK[i++ % 3], kind: undefined } : x)) };
};
describe('και με Άγνοια, Λιποταξία, Αδικαιολόγητη απουσία', () => {
  for (const realistic of [true, false]) it(realistic ? 'όπως τα αφήνει η οθόνη' : 'και παρά τους κανόνες', () => {
    const errs: string[] = []; let n = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = withAdik(genState(seed * 7919 + (realistic ? 0 : 1), realistic, 30)); n += s.statuses.filter(x => ADIK.includes(x.type)).length;
      for (const d of DAYS) errs.push(...check(s, d).map(e => 's' + seed + ' ' + e));
    }
    expect(n).toBeGreaterThan(40);
    expect(errs.slice(0, 25)).toEqual([]);
  });
});

// Υπηρεσίες εκτός στρατοπέδου (BlockDef.hkCol, 17/11): οι θαλαμοφύλακες του α΄ πίνακα στα Φυλάκια, του β΄ στη Φύλλα πορείας, τα μαγειρεία στην Άλλη μονάδα,
// και ο Λ/Υ-Δ/Υ στην Υπηρεσία όπως πάντα. Σήμερα, Δύναμη και ΗΚΑΙ συμφωνούν και για όσους είναι απόντες λόγω υπηρεσίας.
const withOutside = (s: AppState): AppState => {
  const col: Record<string, string> = { th: 'fyl', th2: 'fp', mg: 'allh' };
  const fix = (l: AppState['settings']['blocks']) => l.map(b => (col[b.id] ? { ...b, hkCol: col[b.id] } : b));
  return { ...s, settings: { ...s.settings, blocks: fix(s.settings.blocks), blocksSpen: fix(s.settings.blocksSpen) } };
};
describe('και με υπηρεσίες εκτός στρατοπέδου (στήλη απόντων)', () => {
  for (const realistic of [true, false]) it(realistic ? 'όπως τα αφήνει η οθόνη' : 'και παρά τους κανόνες', () => {
    const errs: string[] = []; let svc = 0, b4 = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = withOutside(genState(seed * 7919 + (realistic ? 0 : 1), realistic, 30));
      for (const d of DAYS) { errs.push(...check(s, d, true).map(e => 's' + seed + ' ' + e)); svc += strengthOf(s, d, hkMin(s.rules)).awaySvc.length; b4 += dayBook(s, d).filter(r => r.g === 'B4').length; }
    }
    expect(svc).toBeGreaterThan(40); expect(b4).toBeGreaterThan(20);   // το ΔΥΝΑΜΗ του Excel τους βάζει στο Β4
    expect(errs.slice(0, 25)).toEqual([]);
  });
});

// Δικές σου στήλες της ΗΚΑΙ (Michael, 17/11): «Απομόνωση» και «Εκτός ΕΣΣΟ» (απόντες), «Αποστολή» (κωλυόμενοι). Οι θαλαμοφύλακες του α΄ πίνακα στην «Εκτός ΕΣΣΟ»
// (υπηρεσία εκτός στρατοπέδου), του β΄ στην «Αποστολή» (κωλυόμενοι εντός), ένα δικό σου είδος άδειας σε καθεμία, και οι κωλυόμενοι με αφαίρεση σε μία από τις δύο.
// Σήμερα, Δύναμη και ΗΚΑΙ συμφωνούν: απόντες της ΗΚΑΙ (με τις δικές σου στήλες) = απόντες της Δύναμης, κωλυόμενοι στη «Αποστολή» = κωλυόμενοι της Δύναμης.
const OWNCOLS: UserLists = {
  hkCols: [{ key: 'u1', name: 'Απομόνωση', grp: 'abs' }, { key: 'u2', name: 'Αποστολή', grp: 'kol', short: 'Αποστ.' }, { key: 'u3', name: 'Εκτός ΕΣΣΟ', grp: 'abs' }],
  leaveKinds: { add: [{ name: 'Απομόνωση covid', col: 'u1' }, { name: 'Αποστολή υπηρεσίας', col: 'u2' }, { name: 'Φύλλο πορείας', col: 'fp' }, { name: 'Εκτός', col: '-' }] }
};
const LK = ['Απομόνωση covid', 'Αποστολή υπηρεσίας', 'Φύλλο πορείας', 'Εκτός'];
const withOwnCols = (s: AppState): AppState => {
  let i = 0, j = 0; const col: Record<string, string> = { th: 'u3', th2: 'u2' };
  const fix = (l: AppState['settings']['blocks']) => l.map(b => (col[b.id] ? { ...b, hkCol: col[b.id] } : b));
  return {
    ...s, settings: { ...s.settings, lists: OWNCOLS, blocks: fix(s.settings.blocks), blocksSpen: fix(s.settings.blocksSpen) },
    statuses: s.statuses.map(x => (x.type === 'LEAVE' && x.kind !== 'Ειδική' ? { ...x, kind: LK[i++ % LK.length] } : x.type === 'KOL' && x.minus ? { ...x, hkCol: j++ % 2 ? 'u2' : 'ey' } : x))
  };
};
describe('και με δικές σου στήλες της ΗΚΑΙ (απόντες και κωλυόμενοι)', () => {
  for (const realistic of [true, false]) it(realistic ? 'όπως τα αφήνει η οθόνη' : 'και παρά τους κανόνες', () => {
    const errs: string[] = []; let svc = 0, ownAbs = 0, ownKol = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = withOwnCols(genState(seed * 7919 + (realistic ? 0 : 1), realistic, 30));
      for (const d of DAYS) {
        errs.push(...check(s, d, true).map(e => 's' + seed + ' ' + e)); svc += strengthOf(s, d, hkMin(s.rules)).awaySvc.length;
        const h = hkaiCounts(s, d); ownAbs += h.cols.u1.length + h.cols.u3.length; ownKol += h.cols.u2.length;
      }
    }
    expect(svc).toBeGreaterThan(30); expect(ownAbs).toBeGreaterThan(60); expect(ownKol).toBeGreaterThan(30);
    expect(errs.slice(0, 25)).toEqual([]);
  });
});
