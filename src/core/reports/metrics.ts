// The catalogue of measures of the values tables.
//
// Purpose: `metricsOf`: every measure (strength, statuses, medical, requests, outs, prevented, duties, cadres,
//   weapons, ΗΚΑΙ totals) with its id, group, name and function.
// Does NOT: look a measure up (metricLookup.ts) or add up the terms of a row (valueEval.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/people, core/duty,
//   core/outs, core/weapons, core/lib, core/reports/metricDefs, core/reports/valueCtx.
// Why: no measure is rewritten here: each calls the same counter as the screen that shows it, so the numbers are
//   equal. The list is one function (the catalogue grows by adding a line) and is built once per settings object.
// Covering tests: test/note-only.test.ts, test/report-blank-tags.test.ts, test/values.test.ts.
import { KOL_COLS } from '../model/kol';
import { isWaiting } from '../model/records';
import { TYPES, TYPE_KEYS, type TypeKey } from '../model/status';
import { blocksOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { HK_A, HK_K, hkRowList } from '../people/hkRows';
import { activePeople } from '../duty/indexes';
import { postsOf } from '../duty/posts';
import { listOf } from '../people/ranks';
import { medNote, MED_LIKE, ownMed } from '../people/kinds';
import { siCombos, siOf } from '../people/si';
import { outsTables } from '../outs/outsTables';
import { outsAndStay } from '../outs/outsStay';
import { AUTO_KEY, isOut, outPeople, outReasonOf, weaponMatch } from '../weapons/weaponInfo';
import { dutyPicks } from '../weapons/weaponPick';
import { movesOn } from '../weapons/weaponSheets';
import { noSeat, weaponKey } from '../weapons/weaponKeys';
import type { WeaponFilter } from '../model/lists';
import { norm } from '../lib/text';
import { reportOf } from '../model/unit';
import { type Metric, S, G, CAT_LBL, N } from './metricDefs';
import {
  total,
  minus,
  away,
  kolMinus,
  keys,
  unarmedSet,
  union,
  cadreActive,
  stg,
  ssRaw,
  ssAll,
  type VCtx,
  memo,
  kol,
  pidKeys,
  hk,
  cadreKeys,
  winfo,
  armPpl,
} from './valueCtx';

const MET_CACHE = new WeakMap<object, Metric[]>();
/**
 * The catalogue of measures for the settings of state `s`, kept per settings object: strength, statuses, medical,
 * requests, outs, prevented, duties, cadres, weapons and ΗΚΑΙ totals. No measure is rewritten here: each one calls the
 * same counter as its own screen (strengthOf, kolView, hkaiCounts, outsTables, weaponInfo…), so the numbers come out
 * equal.
 */
export function metricsOf(s: AppState): Metric[] {
  let l = MET_CACHE.get(s.settings);
  if (l) return l;
  const lists = s.settings.lists;
  const HKN = reportOf(s.settings);
  const m: Metric[] = [];
  // ---- Strength (soldiers, at the moment of measuring): same numbers as the «Δύναμη» page
  m.push(
    S(
      'str.total',
      G.str,
      'Σε δύναμη (στρατιώτες)',
      (c) => total(c),
      'Όλοι οι ενεργοί στρατιώτες, όπως το σύνολο της Δύναμης',
    ),
  );
  m.push(
    S(
      'str.present',
      G.str,
      'Παρόντες',
      (c) => minus(minus(total(c), away(c)), kolMinus(c)),
      'Σε δύναμη χωρίς τους απόντες και τους κωλυόμενους, όπως η Δύναμη',
    ),
  );
  m.push(
    S(
      'str.kol',
      G.str,
      'Κωλυόμενοι (δηλωμένοι)',
      (c) => kolMinus(c),
      'Όσοι έχουν δήλωση κωλυόμενου που τους αφαιρεί από τους παρόντες, όπως η Δύναμη. Η ' +
        HKN +
        ' έχει δικό της ορισμό (Σύνολα ' +
        HKN +
        ')',
    ),
  );
  m.push(S('str.away', G.str, 'Απόντες', (c) => away(c), 'Άδεια, νοσοκομείο, έξοδος ή ΔΝ τη στιγμή μέτρησης'));
  m.push(
    S(
      'str.inside',
      G.str,
      'Μέσα στο στρατόπεδο (παρόντες και κωλυόμενοι)',
      (c) => minus(total(c), away(c)),
      'Σε δύναμη χωρίς τους απόντες: όσοι δεν λείπουν',
    ),
  );
  m.push(
    S(
      'str.armed',
      G.str,
      'Ένοπλοι (Σ.Ι. όχι άοπλος)',
      (c) => minus(total(c), keys(activePeople(c.s).filter((p) => unarmedSet(c).has(p.id)))),
      'Σε δύναμη με Σ.Ι. που δεν είναι άοπλη (το Ι3 ΜΕ ΟΠΛΟ μετρά ένοπλος)',
    ),
  );
  m.push(
    S(
      'str.unarmed',
      G.str,
      'Άοπλοι (Σ.Ι.)',
      (c) => keys(activePeople(c.s).filter((p) => unarmedSet(c).has(p.id))),
      'Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 ή ό,τι όρισες στις Ρυθμίσεις › Σ.Ι.',
    ),
  );
  m.push(
    S(
      'str.all',
      G.str,
      'Σε δύναμη: στρατιώτες και στελέχη',
      (c) => union(total(c), keys(cadreActive(c).map((x) => ({ id: 0, cid: x.id })))),
      'Στρατιώτες και ενεργά στελέχη (με φίλτρο «Στρατιώτες» ή «Στελέχη» ξεχωρίζουν)',
    ),
  );
  for (const lbl of siCombos(lists?.si))
    m.push(
      S('si:' + lbl, G.str, 'Σ.Ι. ' + lbl, (c) =>
        keys(activePeople(c.s).filter((p) => p.si && siOf(p, c.s.settings.lists).label === lbl)),
      ),
    );
  // ---- Statuses per type and category (at the moment of measuring)
  for (const k of TYPE_KEYS)
    m.push(
      S(
        'st.' + k,
        TYPES[k].cat === 'med' ? G.med : G.st,
        TYPES[k].long + (TYPES[k].cat === 'med' ? ' (' + TYPES[k].label + ')' : ''),
        (c) => keys(stg(c).lists[k]),
      ),
    );
  for (const cat of ['abs', 'pun', 'out', 'other', 'med'])
    m.push(
      S('cat.' + cat, cat === 'med' ? G.med : G.st, CAT_LBL[cat], (c) =>
        union(...(TYPE_KEYS as TypeKey[]).filter((k) => TYPES[k].cat === cat).map((k) => keys(stg(c).lists[k]))),
      ),
    );
  for (const mk of listOf(lists, 'medKinds').filter((n) => !MED_LIKE.map((k) => TYPES[k].label).includes(n))) {
    m.push(
      S('med.kind:' + mk, G.med, 'Ιατρικό «' + mk + '»', (c) =>
        keys(
          activePeople(c.s).filter((p) =>
            ((medNote({ type: 'EA', kind: mk }, lists) ? ssRaw(c) : ssAll(c)).get(p.id) || []).some(
              (x) => MED_LIKE.includes(x.type) && ownMed(c.s.settings.lists, x.kind)?.name === mk,
            ),
          ),
        ),
      ),
    );
  }
  // ---- Requests of the day
  const reqs = (c: VCtx, f: (x: AppState['requests'][number]) => boolean) => {
    const pm = new Set(activePeople(c.s).map((p) => p.id));
    return new Set(c.s.requests.filter((x) => x.date === c.d && pm.has(x.pid) && f(x)).map((x) => 'p' + x.pid));
  };
  m.push(
    S(
      'req.all',
      G.req,
      'Αιτούντες της μέρας',
      (c) => reqs(c, () => true),
      'Στρατιώτες με αίτηση που έγινε τη μέρα του εντύπου (5. ΑΙΤΗΣΕΙΣ της ' + HKN + ')',
    ),
  );
  m.push(S('req.pending', G.req, 'Αιτήσεις που εκκρεμούν', (c) => reqs(c, (x) => !x.decision)));
  m.push(
    S(
      'req.waiting',
      G.req,
      'Αιτήσεις που περιμένουν (όλες οι μέρες)',
      (c) => {
        const pm = new Set(activePeople(c.s).map((p) => p.id));
        return new Set(c.s.requests.filter((x) => pm.has(x.pid) && isWaiting(x)).map((x) => 'p' + x.pid));
      },
      'Στρατιώτες με αίτηση, οποιασδήποτε μέρας, που περιμένει ακόμα απάντηση (όχι οι παλιές χωρίς απάντηση)',
    ),
  );
  m.push(S('req.ok', G.req, 'Αιτήσεις που εγκρίθηκαν', (c) => reqs(c, (x) => x.decision === 'ok')));
  m.push(S('req.no', G.req, 'Αιτήσεις που απορρίφθηκαν', (c) => reqs(c, (x) => x.decision === 'no')));
  // ---- Outs: as the Excel «Εξοδούχοι / Παραμένοντες» (out time) and the 4 tables (outsTables)
  const oas = (c: VCtx) => memo(c, 'oas', () => outsAndStay(c.s, c.d));
  m.push(
    S(
      'out.outs',
      G.out,
      'Εξοδούχοι και ΔΝ (κατάσταση εξόδου)',
      (c) => keys(oas(c).outs.map((x) => x.p)),
      'Όπως το Excel «Εξοδούχοι»: τη μέρα, με την ώρα εξόδου των Κανόνων (όχι τη στιγμή μέτρησης)',
    ),
  );
  m.push(
    S('out.out', G.out, 'Εξοδούχοι (έξοδος)', (c) =>
      keys(
        oas(c)
          .outs.filter((x) => x.st.type === 'OUT')
          .map((x) => x.p),
      ),
    ),
  );
  m.push(
    S('out.dn', G.out, 'ΔΝ (κατάσταση εξόδου)', (c) =>
      keys(
        oas(c)
          .outs.filter((x) => x.st.type === 'DN')
          .map((x) => x.p),
      ),
    ),
  );
  m.push(
    S(
      'out.stay',
      G.out,
      'Παραμένοντες',
      (c) => keys(oas(c).stay.map((x) => x.p)),
      'Όπως το Excel «Παραμένοντες»: δεν είναι εξοδούχοι ούτε σε άδεια',
    ),
  );
  const ot = (c: VCtx) => memo(c, 'ot', () => outsTables(c.s, c.d));
  m.push(
    S(
      'ret.dn',
      G.out,
      'Βγαίνουν σήμερα ΔΝ',
      (c) => keys(ot(c).dn.map((x) => x.p)),
      'Όπως ο πίνακας «Βγαίνουν ΔΝ» των Εξοδούχων (Σε 4 πίνακες)',
    ),
  );
  m.push(S('ret.out', G.out, 'Βγαίνουν σήμερα εξοδούχοι', (c) => keys(ot(c).out.map((x) => x.p))));
  m.push(S('ret.tonight', G.out, 'Γυρίζουν σήμερα (απόψε)', (c) => keys(ot(c).tonight.map((x) => x.p))));
  m.push(S('ret.tomorrow', G.out, 'Γυρίζουν αύριο', (c) => keys(ot(c).tomorrow.map((x) => x.p))));
  // ---- Prevented, declared (duty outside ours): all, removed from the present, still present, per ΗΚΑΙ column
  m.push(
    S(
      'kol.man',
      G.kol,
      'Κωλυόμενοι με δήλωση (όλοι)',
      (c) => keys(kol(c).man.map((x) => x.p)),
      'Όσοι έχουν δήλωση κωλυόμενου τη στιγμή μέτρησης, είτε αφαιρούνται από τους παρόντες είτε όχι',
    ),
  );
  m.push(
    S(
      'kol.minus',
      G.kol,
      'Κωλυόμενοι που αφαιρούνται από τους παρόντες',
      (c) => kolMinus(c),
      'Όπως οι «Κωλυόμενοι (δηλωμένοι)» της Δύναμης',
    ),
  );
  m.push(S('kol.keep', G.kol, 'Κωλυόμενοι που μένουν παρόντες', (c) => keys(kol(c).keep.map((x) => x.p))));
  for (const [k, lbl] of KOL_COLS)
    m.push(
      S('kol.col:' + k, G.kol, 'Κωλυόμενοι στη στήλη «' + lbl + '» της ' + HKN, (c) =>
        keys(
          kol(c)
            .minus.filter((x) => x.col === k)
            .map((x) => x.p),
        ),
      ),
    );
  // ---- Duties of the day (guards + dutyLog of the day)
  const picks = (c: VCtx) => memo(c, 'picks', () => dutyPicks(c.s, c.d));
  const guard = (c: VCtx) => c.s.guards?.[c.d] || {};
  const filled = (c: VCtx, f: (p: ReturnType<typeof postsOf>[number]) => boolean) =>
    postsOf(c.s.settings).filter((p) => f(p) && guard(c)[p.k] != null).length;
  m.push(
    S(
      'duty.people',
      G.duty,
      'Σε υπηρεσία (άτομα)',
      (c) =>
        pidKeys(
          c,
          picks(c).flatMap((x) => x.pids),
        ),
      'Στρατιώτες και στελέχη με θέση τη μέρα',
    ),
  );
  m.push(
    S('duty.armed', G.duty, 'Σε ένοπλη υπηρεσία (άτομα)', (c) =>
      pidKeys(
        c,
        picks(c)
          .filter((x) => x.armed)
          .flatMap((x) => x.pids),
      ),
    ),
  );
  m.push(N('duty.posts', G.duty, 'Θέσεις υπηρεσιών (σύνολο)', (c) => postsOf(c.s.settings).length));
  m.push(N('duty.filled', G.duty, 'Θέσεις γεμάτες', (c) => filled(c, () => true)));
  m.push(N('duty.empty', G.duty, 'Θέσεις κενές', (c) => postsOf(c.s.settings).length - filled(c, () => true)));
  m.push(
    N('duty.aposts', G.duty, 'Ένοπλες θέσεις (σύνολο)', (c) => postsOf(c.s.settings).filter((p) => p.armed).length),
  );
  m.push(N('duty.afilled', G.duty, 'Ένοπλες θέσεις γεμάτες', (c) => filled(c, (p) => p.armed)));
  m.push(
    N(
      'duty.aempty',
      G.duty,
      'Ένοπλες θέσεις κενές',
      (c) => postsOf(c.s.settings).filter((p) => p.armed).length - filled(c, (p) => p.armed),
    ),
  );
  for (const b of (blocksOf(s.settings) || s.settings.blocks).filter((x) => !x.hidden)) {
    m.push(
      S('duty.b:' + b.id, G.duty, b.name + ' (άτομα)', (c) =>
        pidKeys(
          c,
          picks(c)
            .filter((x) => x.block === b.id)
            .flatMap((x) => x.pids),
        ),
      ),
    );
    m.push(
      N(
        'duty.be:' + b.id,
        G.duty,
        b.name + ' (κενές θέσεις)',
        (c) => postsOf(c.s.settings).filter((p) => p.block === b.id).length - filled(c, (p) => p.block === b.id),
      ),
    );
  }
  // ---- Cadres (ΗΚΑΙ): prevented in the duty/ΕΥ… columns, absent in the leave columns…
  m.push(
    S(
      'cadre.all',
      G.cadre,
      'Στελέχη σε δύναμη',
      (c) => (cadreActive(c).length ? keys(cadreActive(c).map((x) => ({ id: 0, cid: x.id }))) : hk(c).cadreN),
      'Η λίστα Στελέχη· αν δεν την έχεις συμπληρώσει, οι αριθμοί των Ρυθμίσεων',
    ),
  );
  m.push(
    S(
      'cadre.kol',
      G.cadre,
      'Στελέχη κωλυόμενα',
      (c) =>
        cadreKeys(
          c,
          HK_K.map((x) => x[0]),
        ),
      'Στελέχη στις στήλες κωλυομένων της ' + HKN + ' (υπηρεσία, ΕΥ, τιμωρημένοι…)',
    ),
  );
  m.push(
    S(
      'cadre.apo',
      G.cadre,
      'Στελέχη απόντα',
      (c) =>
        cadreKeys(
          c,
          HK_A.map((x) => x[0]),
        ),
      'Στελέχη στις στήλες απόντων της ' + HKN + ' (άδειες, νοσοκομείο…)',
    ),
  );
  // ---- Weapons (as the «Οπλισμός» page: today with the time, other days all the numbers of the day)
  const wm = (c: VCtx, f: WeaponFilter) => keys(c.s.people.filter((p) => weaponMatch(f, p, winfo(c))));
  const outs = (c: VCtx) => memo(c, 'wout', () => outPeople(armPpl(c), winfo(c)));
  m.push(S('w.with', G.w, 'Δύναμη όπλων (σε δύναμη, με αριθμό όπλου)', (c) => wm(c, 'with')));
  for (const t of listOf(lists, 'weaponTypes'))
    m.push(
      S('w.type:' + t, G.w, 'Δύναμη όπλων: ' + t, (c) =>
        keys(c.s.people.filter((p) => weaponMatch('with', p, winfo(c)) && norm(p.wtype) === norm(t))),
      ),
    );
  m.push(
    S('w.type:', G.w, 'Δύναμη όπλων: χωρίς τύπο', (c) =>
      keys(c.s.people.filter((p) => weaponMatch('with', p, winfo(c)) && !norm(p.wtype))),
    ),
  );
  m.push(
    S(
      'w.in',
      G.w,
      'ΕΝΤΟΣ (στον οπλοβαστό)',
      (c) => keys(c.s.people.filter((p) => p.active && weaponKey(p.weapon) && !isOut(winfo(c), p.id))),
      'Με όπλο και όχι εκτός οπλοβαστού',
    ),
  );
  m.push(
    S(
      'w.out',
      G.w,
      'ΕΚΤΟΣ (σύνολο)',
      (c) => keys(outs(c)),
      'Κινήσεις και ένοπλες υπηρεσίες, μία φορά ο καθένας, όπως η κεφαλίδα του Οπλισμού (και στελέχη σε ένοπλη υπηρεσία)',
    ),
  );
  m.push(
    S('w.out.man', G.w, 'ΕΚΤΟΣ με έξοδο όπλου (χειροκίνητη κίνηση)', (c) =>
      keys(outs(c).filter((p) => outReasonOf(winfo(c), p.id) !== AUTO_KEY)),
    ),
  );
  m.push(
    S('w.out.duty', G.w, 'ΕΚΤΟΣ λόγω ένοπλης υπηρεσίας', (c) =>
      keys(outs(c).filter((p) => outReasonOf(winfo(c), p.id) === AUTO_KEY)),
    ),
  );
  for (const r of listOf(lists, 'weaponOut'))
    m.push(
      S('w.out.r:' + r, G.w, 'ΕΚΤΟΣ λόγω «' + r + '»', (c) =>
        keys(outs(c).filter((p) => norm(outReasonOf(winfo(c), p.id)) === norm(r))),
      ),
    );
  m.push(S('w.without', G.w, 'Χωρίς όπλο (ένοπλοι κατά Σ.Ι.)', (c) => wm(c, 'without')));
  m.push(S('w.unarmed', G.w, 'Άοπλοι με όπλο', (c) => wm(c, 'unarmed')));
  m.push(S('w.dup', G.w, 'Ίδιος αριθμός ή ίδια θέση', (c) => wm(c, 'dup')));
  m.push(S('w.noseat', G.w, 'Χωρίς θέση στον οπλοβαστό', (c) => keys(c.s.people.filter(noSeat))));
  m.push(S('w.return', G.w, 'Να παραδώσουν (εκτός δύναμης με όπλο)', (c) => wm(c, 'return')));
  m.push(
    N(
      'w.moves.out',
      G.w,
      'Έξοδοι όπλων της μέρας',
      (c) => movesOn(c.s.weaponLog, c.d).filter((x) => x.outDay === c.d).length,
    ),
  );
  m.push(
    N(
      'w.moves.in',
      G.w,
      'Είσοδοι όπλων της μέρας',
      (c) => movesOn(c.s.weaponLog, c.d).filter((x) => x.inDay === c.d).length,
    ),
  );
  // ---- ΗΚΑΙ totals (ΗΚΑΙ time, as the form): soldiers and cadres, and what is written by hand
  const col = (c: VCtx, k: string) => Object.values(hk(c).rank).reduce((a, r) => a + (r.c[k] || 0), 0);
  m.push(N('hk.total', G.hk, HKN + ': Δύναμη', (c) => hk(c).total, 'Στρατιώτες και στελέχη, όπως η ' + HKN));
  m.push(N('hk.soldiers', G.hk, HKN + ': Στρατιώτες', (c) => hk(c).soldiers));
  m.push(N('hk.cadre', G.hk, HKN + ': Στελέχη', (c) => hk(c).cadreN));
  m.push(
    N(
      'hk.kol',
      G.hk,
      HKN + ': Κωλυόμενοι',
      (c) => hk(c).kol,
      'Άθροισμα των στηλών κωλυομένων της ' +
        HKN +
        ' (υπηρεσία, ΕΥ, τιμωρημένοι…): άλλος ορισμός από τους Κωλυόμενους της Δύναμης',
    ),
  );
  m.push(N('hk.apo', G.hk, HKN + ': Απόντες', (c) => hk(c).apo));
  m.push(N('hk.avail', G.hk, HKN + ': Διαθέσιμοι', (c) => hk(c).avail, 'Δύναμη μείον απόντες'));
  for (const [k, short, long] of HK_K)
    if (k !== 'bl') m.push(N('hk.k:' + k, G.hk, HKN + ' κωλυόμενοι: ' + (long || short), (c) => col(c, k)));
  for (const [k, , long] of HK_A) m.push(N('hk.a:' + k, G.hk, HKN + ' απόντες: ' + long, (c) => col(c, k)));
  m.push(N('hk.a:ab', G.hk, HKN + ': Μισθοτροφοδοτηθέντες (με το χέρι)', (c) => col(c, 'ab')));
  for (const r of hkRowList(lists))
    m.push(N('hk.row:' + r, G.hk, HKN + ' γραμμή: ' + r + ' (δύναμη)', (c) => hk(c).rank[r]?.n || 0));
  // absent of a row (sum of its absent columns), for the «Απόντες ΑΞΚΟΙ/ΑΝΘΣΤΕΣ/ΥΠΞΚΟΙ» of the cadre roll
  for (const r of hkRowList(lists))
    m.push(
      N('hk.rowa:' + r, G.hk, HKN + ' γραμμή: ' + r + ' (απόντες)', (c) => {
        const row = hk(c).rank[r];
        return row ? HK_A.reduce((a, [k]) => a + (row.c[k] || 0), 0) : 0;
      }),
    );
  MET_CACHE.set(s.settings, m);
  return m;
}
