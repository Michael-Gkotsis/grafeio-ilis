// Ο έλεγχος «Σήμερα, Δύναμη, ΗΚΑΙ και ΔΥΝΑΜΗ συμφωνούν» για μία μέρα (από το strength-consistency.test.ts, για να τον καλεί και το p8-soak)
import { activePeople, awayText, postBy, hkaiCounts, hkMin, kolView, statusesAt, strengthOf } from '../src/shared/rules';
import { strengthView } from '../src/shared/strengthView';
import { dayBook } from '../src/shared/outsDay';
import { backsAt, dayTimes, returnsOn } from '../src/shared/returns';
import { mins } from '../src/shared/hours';
import { TYPES, type AppState } from '../src/shared/domain';
import { absKeysOf, isAway as isAwaySt, LEAVE_AWAY_NO_COL, leaveCol, svcAbsent, svcColOf } from '../src/shared/ranks';
import type { ISODate } from '../src/shared/dates';

const TIMES = ['08:00', '09:30', '12:00', '13:30', '16:59', '17:00', '18:30', '21:59', '22:00', '23:30'];
// outside: υπηρεσίες εκτός στρατοπέδου (BlockDef.hkCol σε στήλη απόντων): απόντες και στο Σήμερα/Δύναμη, όπως στην ΗΚΑΙ, και στο ΔΥΝΑΜΗ του Excel (ομάδα Β4)
export function check(s: AppState, d: ISODate, outside = false): string[] {
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
  {
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
