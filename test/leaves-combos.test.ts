// Άδειες και αιτήσεις σε πολλούς συνδυασμούς (Michael, 1/11: «κάνε ένα παρόμοιο review στις άδειες… πως βγαίνουν και δηλώνονται»).
// Οι εγκρίσεις και οι δηλώσεις περνούν από τον ίδιο έλεγχο με την οθόνη (επικάλυψη με άλλη άδεια: ο χρήστης πατά «Άκυρο»).
// Τυχαίες αλλά επαναλήψιμες: αιτήσεις άδειας και άλλες αιτήσεις, εγκρίσεις, απορρίψεις, αναιρέσεις, αλλαγές, διαγραφές, άμεσες άδειες
// (κανονική, ειδική, ΑΜΔ, δική σου, τιμητική, αναρρωτική) με και χωρίς ώρες, ακύρωση και λήξη νωρίτερα, υπηρεσίες. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { hkaiCounts, statusesFrom, hkMin, activePeople, approvalPlan, planStatusChange, type StatusCmd } from '../src/shared/rules';
import { hkaiLeaveLines, hkaiReqLines, lineText } from '../src/shared/hkaiText';
import { addDays, type ISODate } from '../src/shared/dates';
import { TYPES, hkLvOn, type AppState } from '../src/shared/domain';
import { leaveCol } from '../src/shared/ranks';
import { mins } from '../src/shared/hours';
import { upper } from '../src/shared/text';

let seq = 0;
const TODAY = '2026-11-02';
const ctx: Ctx = { today: TODAY, newId: () => 'q' + ++seq };
const DAYS: ISODate[] = []; for (let d = '2026-10-30'; d <= '2026-11-12'; d = addDays(d, 1)) DAYS.push(d);
const KINDS = ['Κανονική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ', 'Γονική', 'Υπηρεσιακό', 'Τιμητική'];
const TIMES = ['', '', '06:00', '14:00', '18:00', '22:00'];
const DESTS = ['', '', 'Κόρινθο', 'Αθήνα', 'Πάτρα'];
// είδη με «Κατεύθυνση στο κείμενο» και κείμενα ΗΚΑΙ των ρυθμίσεων του τεστ (κεφαλίδα: οι δύο ρυθμίσεις που βάζει ο χρήστης στις Λίστες)
const DEST_ON = new Set(['Κανονική', 'Ειδική', 'Υπηρεσιακό']);
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const errs: string[] = [];
// εντολή που τη δοκιμάζει ο χρήστης στην οθόνη: όπως η Δήλωση, αν πέφτει πάνω σε άλλη άδεια ή νοσοκομείο, ρωτά και εδώ πατά «Άκυρο»
function run(s: AppState, c: Command) {
  try {
    if (c.t === 'declare' && TYPES[c.cmd.type].cat === 'abs' && planStatusChange(s, c.cmd, TODAY).overlaps.length) return s;
    if (c.t === 'decideRequest' && c.ok) { const q = s.requests.find(x => x.id === c.id); const pl = q && approvalPlan(s, q, TODAY); if (pl && pl.overlaps.length) return s; }
    if (c.t === 'replaceStatus') { const st = s.statuses.find(x => x.id === c.id); const o = planStatusChange({ ...s, statuses: s.statuses.filter(x => x !== st) }, c.cmds[0] as StatusCmd, TODAY); if (o.overlaps.length) return s; }
    return apply(s, c, ctx).state;
  } catch (e) { return s; }
}

function gen(seed: number): AppState {
  const r = rng(seed); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  let s = fakeState(16);
  s = { ...s, settings: { ...s.settings, lists: { leaveKinds: { add: [{ name: 'Γονική', col: 'eid' }, { name: 'Υπηρεσιακό', col: 'ka' }] },
    leaveText: { 'ΚΑΝΟΝΙΚΗ': { dest: true }, 'ΕΙΔΙΚΗ': { dest: true, t: 'ΕΙΔΙΚΗ ΑΔΕΙΑ ΕΙΔΙΚΟΥ ΛΟΓΟΥ' }, 'ΥΠΗΡΕΣΙΑΚΟ': { t: 'ΥΠΗΡΕΣΙΑΚΟ ΣΗΜΕΙΩΜΑ', dest: true }, 'ΤΙΜΗΤΙΚΗ': { t: 'ΑΔΕΙΑ' }, 'ΑΝΑΡΡΩΤΙΚΗ': { t: 'ΑΝΑΡΡΩΤΙΚΗ' } } } } };
  if (r() < 0.6) s = { ...s, settings: { ...s.settings, hkai: { ...(s.settings.hkai || {}), on: [...(s.settings.hkai?.on || []), 'lv'] } as any } };
  for (let i = 0; i < 40; i++) {
    const v = r(); const pid = 1 + Math.floor(r() * 16); const date = pick(DAYS); const from = addDays(date, Math.floor(r() * 3)); const to = addDays(from, Math.floor(r() * 4));
    const kind = pick(KINDS); const fromTime = pick(TIMES), toTime = pick(TIMES), dest = pick(DESTS);
    const lv = { type: kind === 'Τιμητική' ? 'HON' as const : 'LEAVE' as const, ...(kind !== 'Τιμητική' ? { kind } : {}), from, to, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}), ...(dest ? { dest } : {}) };
    if (v < 0.3) s = run(s, { t: 'addRequest', req: { pid, date, text: r() < 0.5 ? '' : 'για οικογενειακούς λόγους', leave: lv } });
    else if (v < 0.4) s = run(s, { t: 'addRequest', req: { pid, date, text: pick(['μετάθεση στην 2η ΕΠΧΙΑ', 'συνάντηση με τον Διοικητή', 'αλλαγή θαλάμου']) } });
    else if (v < 0.6) { const q = pick(s.requests); if (q) s = run(s, { t: 'decideRequest', id: q.id, ok: r() < 0.7 ? true : r() < 0.5 ? false : null }); }
    else if (v < 0.72) s = run(s, { t: 'declare', cmd: { type: r() < 0.15 ? 'SICK' : lv.type, pids: [pid], from, to, ...(lv.type === 'LEAVE' ? { kind } : {}), ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}), ...(dest ? { dest } : {}) } as any });
    else if (v < 0.76) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'replaceStatus', id: st.id, cmds: [{ type: st.type, pids: [st.pid], from: addDays(st.from, 1), to: addDays(st.to, 2), ...(st.kind ? { kind: st.kind } : {}), ...(dest ? { dest } : {}) }] }); }
    else if (v < 0.8) { const q = pick(s.requests); if (q) s = run(s, { t: 'deleteRequest', id: q.id }); }
    else if (v < 0.85) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'cancelLeave', id: st.id }); }
    else if (v < 0.9) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'endLeave', id: st.id, date: st.from < st.to ? addDays(st.from, 1) : st.from, time: '12:00' }); }
    else if (v < 0.95) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'setTimes', id: st.id, fromTime: pick(TIMES), toTime: pick(TIMES), dest: pick(DESTS) }); }
    else s = run(s, { t: 'assign', date: pick(DAYS), k: pick(['ly', 'th1', 'mg1', 'sk3a']), pid, force: 'x' });
  }
  return s;
}
const badTxt = (t: string) => /undefined|null|NaN|\s\s|ΑΔΕΙΑ ΑΔΕΙΑ|ΑΔΕΙΑ.*ΑΔΕΙΑ/.test(t) || t !== t.toUpperCase();

function check(s: AppState, tag: string) {
  const E = (t: string) => errs.push(tag + ' ' + t);
  const rq = new Map(s.requests.map(r => [r.id, r]));
  // Δ1: κάθε άδεια από αίτηση δείχνει σε αίτηση που εγκρίθηκε και την ξέρει
  for (const st of s.statuses) if (st.req) {
    const r = rq.get(st.req);
    if (!r) E('άδεια ' + st.id + ' από αίτηση που δεν υπάρχει');
    else if (r.decision !== 'ok' || r.sid !== st.id) E('άδεια ' + st.id + ' από αίτηση ' + r.id + ' με απόφαση ' + r.decision + ' sid ' + r.sid);
  }
  // Δ2: εγκεκριμένη αίτηση με sid: η άδεια υπάρχει
  for (const r of s.requests) if (r.sid && !s.statuses.some(x => x.id === r.sid)) E('αίτηση ' + r.id + ' δείχνει σε άδεια που δεν υπάρχει');
  const at = hkMin(s.rules);
  for (const d of DAYS) {
    const lv = hkaiLeaveLines(s, d).map(lineText), rl = hkaiReqLines(s, d).map(lineText);
    for (const t of [...lv, ...rl]) if (badTxt(t)) E(d + ' κείμενο: «' + t + '»');
    const want = s.requests.filter(r => r.date === d).length; if (rl.length !== want) E(d + ' 5. ΑΙΤΗΣΕΙΣ ' + rl.length + ' αντί ' + want);
    // κατεύθυνση: γράφεται στην πρόταση μόνο όταν το είδος έχει τη ρύθμιση και η άδεια κατεύθυνση (5. ΑΙΤΗΣΕΙΣ)
    const dreq = s.requests.filter(x => x.date === d && x.leave && x.leave.dest && DEST_ON.has(x.leave.type === 'HON' ? 'Τιμητική' : x.leave.kind || 'Κανονική'));
    for (const r of dreq) if (!rl.some(x => x.includes(' ΜΕ ΚΑΤΕΥΘΥΝΣΗ ' + upper(r.leave!.dest!) + ' ') || x.includes(' ΜΕ ΚΑΤΕΥΘΥΝΣΗ ' + upper(r.leave!.dest!) + '.'))) E(d + ' αίτηση ' + r.id + ' χωρίς κατεύθυνση ' + r.leave!.dest);
    if (rl.filter(x => x.includes('ΜΕ ΚΑΤΕΥΘΥΝΣΗ')).length !== dreq.length) E(d + ' 5. ΑΙΤΗΣΕΙΣ: ' + rl.filter(x => x.includes('ΜΕ ΚΑΤΕΥΘΥΝΣΗ')).length + ' με κατεύθυνση αντί ' + dreq.length);
    // 3. ΑΔΕΙΕΣ: μία γραμμή για κάθε άδεια που ξεκινά τη μέρα και δεν ήρθε από αίτηση (όταν είναι ανοιχτό)· ποτέ οι άδειες από αίτηση
    const direct = hkLvOn(s, d) ? s.statuses.filter(x => TYPES[x.type].cat === 'abs' && !x.req && x.from === d) : [];
    if (lv.length !== direct.length) E(d + ' 3. ΑΔΕΙΕΣ ' + lv.length + ' αντί ' + direct.length);
    const ddir = direct.filter(x => x.dest && x.type === 'LEAVE' && DEST_ON.has(x.kind || 'Κανονική'));
    if (lv.filter(x => x.includes('ΜΕ ΚΑΤΕΥΘΥΝΣΗ')).length !== ddir.length) E(d + ' 3. ΑΔΕΙΕΣ με κατεύθυνση ' + lv.filter(x => x.includes('ΜΕ ΚΑΤΕΥΘΥΝΣΗ')).length + ' αντί ' + ddir.length);
    // Δ3: ίδιος στρατιώτης σε άδεια δύο φορές την ίδια μέρα, και στη σωστή στήλη της ΗΚΑΙ (Ε1: ο αναχωρών αργότερα μετρά παρών ως να φύγει)
    const h = hkaiCounts(s, d);
    for (const p of activePeople(s)) {
      const all = statusesFrom(s.statuses, p.id, d, at).filter(x => TYPES[x.type].cat === 'abs');
      if (all.length > 1) E(d + ' p' + p.id + ' σε ' + all.length + ' άδειες μαζί: ' + all.map(x => x.type + (x.kind ? '/' + x.kind : '') + ' ' + x.from + '–' + x.to).join(', '));
      const aw = all.filter(x => !(x.from === d && x.fromTime && mins(x.fromTime) > at));
      const cols = ['ka', 'eid', 'an'].filter(k => h.cols[k]?.some(y => y.id === p.id));
      if (aw.length && cols.length !== 1) E(d + ' p' + p.id + ' στην ΗΚΑΙ σε ' + cols.join('+'));
      if (!aw.length && cols.length) E(d + ' p' + p.id + ' στην ΗΚΑΙ σε άδεια ενώ φεύγει αργότερα ή δεν λείπει');
      if (aw.length === 1) { const x = aw[0]; const c = x.type === 'LEAVE' ? leaveCol(x.kind, s.settings.lists) : TYPES[x.type].hkai; if (cols[0] !== c) E(d + ' p' + p.id + ' ' + x.kind + ' στη στήλη ' + cols[0] + ' αντί ' + c); }
    }
  }
}

describe('Άδειες και αιτήσεις: συνδυασμοί', () => {
  it('κανόνες σε 300 τυχαίες ιστορίες (έγκριση και δήλωση μέσα από τον έλεγχο)', () => {
    errs.length = 0;
    for (let k = 1; k <= 300; k++) check(gen(k), 's' + k);
    expect(errs.slice(0, 15)).toEqual([]);
  });
  it('οι ιστορίες έχουν όντως άδειες από αίτηση, κατεύθυνση και ώρες (το τεστ δεν είναι κενό)', () => {
    let fromReq = 0, withDest = 0, timed = 0, reqs = 0, plain = 0;
    for (let k = 1; k <= 60; k++) { const s = gen(k); fromReq += s.statuses.filter(x => x.req).length; withDest += s.statuses.filter(x => x.dest).length; timed += s.statuses.filter(x => x.fromTime).length; reqs += s.requests.length; plain += s.requests.filter(x => !x.leave && x.decision).length; }
    expect(fromReq).toBeGreaterThan(20); expect(withDest).toBeGreaterThan(20); expect(timed).toBeGreaterThan(20); expect(reqs).toBeGreaterThan(200); expect(plain).toBeGreaterThan(5);
  });
});
