// Οι «δυνάμεις» να συμφωνούν μεταξύ τους (Michael, 2/11: «δεν χρειάζεται να δείχνουν τα ίδια… αλλά να είναι consistent μεταξύ τους»).
// Κάθε οθόνη μετρά στη δική της στιγμή (Σήμερα/Δύναμη: τώρα· ΗΚΑΙ: 08:00· ΔΥΝΑΜΗ του Excel: η ώρα εξόδου), αλλά στην ίδια στιγμή
// λένε το ίδιο, κάθε άτομο μία φορά. Τυχαίες επαναλήψιμες δύο εβδομάδες (outs-gen), πολλές ώρες της μέρας. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { genState, DAYS } from './outs-gen';
import { activePeople, awayText, postBy, hkaiCounts, hkMin, kolView, statusesAt, strengthOf } from '../src/shared/rules';
import { strengthView } from '../src/shared/strengthView';
import { dayBook } from '../src/shared/outsDay';
import { backsAt, dayTimes, returnsOn } from '../src/shared/returns';
import { mins } from '../src/shared/hours';
import { TYPES, type AppState, type TypeKey } from '../src/shared/domain';
import { absKeysOf, isAway as isAwaySt, LEAVE_AWAY_NO_COL, leaveCol, svcAbsent, svcColOf, type UserLists } from '../src/shared/ranks';
import type { ISODate } from '../src/shared/dates';

const TIMES = ['08:00', '09:30', '12:00', '13:30', '16:59', '17:00', '18:30', '21:59', '22:00', '23:30'];
// outside: υπηρεσίες εκτός στρατοπέδου (BlockDef.hkCol σε στήλη απόντων): απόντες και στο Σήμερα/Δύναμη, όπως στην ΗΚΑΙ (το ΔΥΝΑΜΗ του Excel δεν τις ξέρει)
function check(s: AppState, d: ISODate, outside = false): string[] {
  const errs: string[] = []; const E = (t: string) => errs.push(d + ' ' + t);
  const people = activePeople(s), total = people.length, lists = s.settings.lists;
  const ids = (xs: { id: number }[]) => xs.map(p => p.id).sort((a, b) => a - b).join();
  for (const t of [...TIMES, dayTimes(s, d).out]) {
    const at = mins(t), c = strengthOf(s, d, at), v = strengthView(s, d, at), kv = kolView(s, d, at);
    // Σήμερα: Στρατιώτες, Παρόντες (χωρίς τους κωλυόμενους που αφαιρούνται), Απόντες και η λίστα «Απόντες σήμερα»
    const awayList = people.filter(p => statusesAt(s, p.id, d, at).some(x => isAwaySt(x, lists)));
    if (c.total !== total || v.total !== total) E(t + ' Στρατιώτες/Δύναμη ' + c.total + '/' + v.total + ' ≠ ' + total);
    if (v.present + v.kol + v.absent !== total) E(t + ' Δύναμη: Π+Κ+Α ≠ σύνολο');
    if (c.present - kv.minus.length !== v.present) E(t + ' Παρόντες Σήμερα ' + (c.present - kv.minus.length) + ' ≠ Δύναμη ' + v.present);
    if (c.absent !== v.absent || awayList.length + c.awaySvc.length !== c.absent) E(t + ' Απόντες Σήμερα ' + c.absent + ' / λίστα ' + awayList.length + '+' + c.awaySvc.length + ' / Δύναμη ' + v.absent);
    if (c.awaySvc.some(p => awayList.includes(p))) E(t + ' απών δύο φορές (κατάσταση και υπηρεσία εκτός)');
    if ((v.cats.away.groups.find(g => g.key === 'svc')?.rows.length || 0) !== c.awaySvc.length) E(t + ' Δύναμη: υπηρεσία εκτός ≠ Σήμερα');
    if (kv.minus.length !== v.kol) E(t + ' Κωλυόμενοι ' + kv.minus.length + ' ≠ ' + v.kol);
    const sum = awayText(c).split(' · ').filter(Boolean).reduce((a, x) => a + parseInt(x, 10), 0);
    if (sum !== c.absent) E(t + ' «' + awayText(c) + '» δεν αθροίζει ' + c.absent);
    // Ποιοι γυρίζουν (Σήμερα): κάθε απών της στιγμής είναι στη λίστα, εκτός από όσους κρατά έξω η χθεσινή ΔΝ/έξοδος (στους Εξοδούχους της χθεσινής)
    const backs = new Set(backsAt(s, returnsOn(s, d), d, at).map(b => b.p.id));
    for (const p of awayList) {
      const st = statusesAt(s, p.id, d, at).find(x => isAwaySt(x, lists))!;
      if (!backs.has(p.id) && !(TYPES[st.type].cat === 'out' && st.from < d)) E(t + ' p' + p.id + ' απών (' + st.type + ') αλλά όχι στο «Ποιοι γυρίζουν»');
    }
    const shown = backsAt(s, returnsOn(s, d), d, at);
    const awayIds = new Set(awayList.map(p => p.id));
    for (const b of shown) if (!b.r.open && !b.r.pending && b.r.day === d && b.r.time && mins(b.r.time) <= at && !awayIds.has(b.p.id)) E(t + ' p' + b.p.id + ' γύρισε ήδη αλλά φαίνεται');
  }
  if (!outside) {
    // ΔΥΝΑΜΗ του Excel (στην ώρα εξόδου): Α + Β = οι απόντες της Δύναμης εκείνη την ώρα, Γ = παρόντες + κωλυόμενοι, σύνολο = Στρατιώτες
    const T = mins(dayTimes(s, d).out), book = dayBook(s, d), cT = strengthOf(s, d, T);
    if (book.length !== total) E('ΔΥΝΑΜΗ ' + book.length + ' ≠ ' + total);
    // απόντες στην ώρα εξόδου = Α + Β + όσοι του Γ4 δεν έχουν γυρίσει ακόμα, χωρίς όσους του Α3 φεύγουν για άδεια μετά την ώρα εξόδου
    // (και όσους του Γ1 έχουν υπηρεσία ενώ η διόρθωση λέει έξω, με ΠΡΟΣΟΧΗ)
    const pres = new Set(cT.lists.present.map(p => p.id));
    const isAway = (r: typeof book[number]) => /^[AB]/.test(r.g) ? !(/^A3|^B1/.test(r.g) && pres.has(r.p.id) && r.lv?.from === d && !!r.lv.fromTime && mins(r.lv.fromTime) > T) : r.g === 'G4' ? !pres.has(r.p.id) : r.g === 'G1' && !!r.warn && !pres.has(r.p.id);
    const ab = book.filter(isAway).map(r => r.p), g = book.filter(r => r.g[0] === 'G').map(r => r.p);
    const awayT = people.filter(p => !pres.has(p.id));
    if (ids(ab) !== ids(awayT)) E('ΔΥΝΑΜΗ Α+Β(+Γ4) ' + ids(ab) + ' ≠ Απόντες στην έξοδο ' + ids(awayT));
    for (const r of book) if (r.g === 'G4' && !pres.has(r.p.id) && !(r.r && !r.r.open && !r.r.pending && r.r.day === d)) E('Γ4 p' + r.p.id + ' απών χωρίς επιστροφή απόψε');
    if (g.length + book.filter(r => /^[AB]/.test(r.g)).length !== total) E('ΔΥΝΑΜΗ Α+Β+Γ ≠ σύνολο');
  }
  // ΗΚΑΙ (08:00): οι στρατιώτες της = Στρατιώτες· οι απόντες της (άδειες, νοσοκομείο) = οι απόντες της Δύναμης στις 08:00 χωρίς εξοδούχους/ΔΝ
  const h = hkaiCounts(s, d), c8 = strengthOf(s, d, hkMin(s.rules));
  if (h.soldiers !== total) E('ΗΚΑΙ στρατιώτες ' + h.soldiers + ' ≠ ' + total);
  const hkAway = absKeysOf(lists).flatMap(k => h.cols[k] || []);   // και οι δικές σου στήλες απόντων (hkCols)
  // «Πουθενά στην ΗΚΑΙ, απών στην εφαρμογή» ('-a', Michael, 3/11): απών στη Δύναμη, σε καμία στήλη της ΗΚΑΙ, άρα εκεί μετρά παρών
  const noCol = (x: { type: string; kind?: string }) => x.type === 'LEAVE' && leaveCol(x.kind, lists) === LEAVE_AWAY_NO_COL;
  const awayAt = people.filter(p => statusesAt(s, p.id, d, hkMin(s.rules)).some(x => isAwaySt(x, lists) && TYPES[x.type].cat !== 'out'));
  const lvNo = awayAt.filter(p => statusesAt(s, p.id, d, hkMin(s.rules)).some(x => isAwaySt(x, lists) && TYPES[x.type].cat !== 'out' && noCol(x)));
  const lvAway = awayAt.filter(p => !lvNo.includes(p));
  if (ids(h.noCol.map(x => x.p)) !== ids(lvNo)) E('ΗΚΑΙ noCol ' + ids(h.noCol.map(x => x.p)) + ' ≠ ' + ids(lvNo));
  if (h.avail !== h.total - h.apo) E('ΗΚΑΙ διαθέσιμοι ≠ σύνολο − απόντες');
  // υπηρεσία εκτός στρατοπέδου: απόντες και στις δύο. Εξαίρεση (όπως πάντα): η ΗΚΑΙ δεν βλέπει έξοδο/ΔΝ, άρα όποιος κρατιέται από ΔΝ και έχει υπηρεσία εκτός
  // μετρά στη στήλη της στην ΗΚΑΙ ενώ στο Σήμερα είναι ήδη απών ως ΔΝ (μία φορά)
  const svcBlock = (pid: number) => Object.entries(s.guards[d] || {}).some(([k, q]) => q === pid && svcAbsent(postBy(s, k)?.hkCol && svcColOf(postBy(s, k)!.kind, postBy(s, k)!.hkCol, lists), lists));
  const base = new Set([...lvAway, ...c8.awaySvc].map(p => p.id)), hkIds = new Set(hkAway.map(p => p.id));
  for (const p of hkAway) if (!base.has(p.id) && !(svcBlock(p.id) && statusesAt(s, p.id, d, hkMin(s.rules)).some(x => isAwaySt(x, lists) && TYPES[x.type].cat === 'out'))) E('ΗΚΑΙ απών p' + p.id + ' που δεν είναι απών στη Δύναμη 08:00');
  for (const id of base) if (!hkIds.has(id)) E('απών Δύναμης 08:00 p' + id + ' που δεν είναι στις στήλες απόντων της ΗΚΑΙ');
  return errs;
}

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
    const errs: string[] = []; let svc = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = withOutside(genState(seed * 7919 + (realistic ? 0 : 1), realistic, 30));
      for (const d of DAYS) { errs.push(...check(s, d, true).map(e => 's' + seed + ' ' + e)); svc += strengthOf(s, d, hkMin(s.rules)).awaySvc.length; }
    }
    expect(svc).toBeGreaterThan(40);
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
