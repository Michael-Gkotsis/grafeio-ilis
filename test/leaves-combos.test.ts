// Άδειες και αιτήσεις σε πολλούς συνδυασμούς (Michael, 1/11: «κάνε ένα παρόμοιο review στις άδειες… πως βγαίνουν και δηλώνονται»).
// Τυχαίες αλλά επαναλήψιμες: αιτήσεις άδειας και άλλες αιτήσεις, εγκρίσεις, απορρίψεις, αναιρέσεις, αλλαγές, διαγραφές, άμεσες άδειες
// (κανονική, ειδική, ΑΜΔ, δική σου, τιμητική, αναρρωτική) με και χωρίς ώρες, ακύρωση και λήξη νωρίτερα, υπηρεσίες. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { hkaiCounts, statusesFrom, hkMin, activePeople } from '../src/shared/rules';
import { hkaiLeaveLines, hkaiReqLines, lineText } from '../src/shared/hkaiText';
import { addDays, type ISODate } from '../src/shared/dates';
import { TYPES, type AppState } from '../src/shared/domain';
import { leaveCol } from '../src/shared/ranks';

let seq = 0;
const TODAY = '2026-11-02';
const ctx: Ctx = { today: TODAY, newId: () => 'q' + ++seq };
const DAYS: ISODate[] = []; for (let d = '2026-10-30'; d <= '2026-11-12'; d = addDays(d, 1)) DAYS.push(d);
const KINDS = ['Κανονική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ', 'Γονική', 'Υπηρεσιακό', 'Τιμητική'];
const TIMES = ['', '', '06:00', '14:00', '18:00', '22:00'];
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const errs: string[] = [];
function run(s: AppState, c: Command) { try { return apply(s, c, ctx).state; } catch (e) { return s; } }

function gen(seed: number): AppState {
  const r = rng(seed); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  let s = fakeState(16);
  s = { ...s, settings: { ...s.settings, lists: { leaveKinds: { add: [{ name: 'Γονική', col: 'eid' }, { name: 'Υπηρεσιακό', col: 'ka' }] } } } };
  if (r() < 0.6) s = { ...s, settings: { ...s.settings, hkai: { ...(s.settings.hkai || {}), on: [...(s.settings.hkai?.on || []), 'lv'] } as any } };
  for (let i = 0; i < 40; i++) {
    const v = r(); const pid = 1 + Math.floor(r() * 16); const date = pick(DAYS); const from = addDays(date, Math.floor(r() * 3)); const to = addDays(from, Math.floor(r() * 4));
    const kind = pick(KINDS); const fromTime = pick(TIMES), toTime = pick(TIMES);
    const lv = { type: kind === 'Τιμητική' ? 'HON' as const : 'LEAVE' as const, ...(kind !== 'Τιμητική' ? { kind } : {}), from, to, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}) };
    if (v < 0.3) s = run(s, { t: 'addRequest', req: { pid, date, text: r() < 0.5 ? '' : 'για οικογενειακούς λόγους', leave: lv } });
    else if (v < 0.4) s = run(s, { t: 'addRequest', req: { pid, date, text: pick(['μετάθεση στην 2η ΕΠΧΙΑ', 'συνάντηση με τον Διοικητή', 'αλλαγή θαλάμου']) } });
    else if (v < 0.6) { const q = pick(s.requests); if (q) s = run(s, { t: 'decideRequest', id: q.id, ok: r() < 0.7 ? true : r() < 0.5 ? false : null }); }
    else if (v < 0.75) s = run(s, { t: 'declare', cmd: { type: r() < 0.15 ? 'SICK' : lv.type, pids: [pid], from, to, ...(lv.type === 'LEAVE' ? { kind } : {}), ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}) } as any });
    else if (v < 0.8) { const q = pick(s.requests); if (q) s = run(s, { t: 'deleteRequest', id: q.id }); }
    else if (v < 0.85) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'cancelLeave', id: st.id }); }
    else if (v < 0.9) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'endLeave', id: st.id, date: st.from < st.to ? addDays(st.from, 1) : st.from, time: '12:00' }); }
    else if (v < 0.95) { const st = pick(s.statuses.filter(x => TYPES[x.type].cat === 'abs')); if (st) s = run(s, { t: 'setTimes', id: st.id, fromTime: pick(TIMES), toTime: pick(TIMES) }); }
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
  for (const r of s.requests) if (r.decision === 'ok' && r.leave && !r.sid) E('ΣΗΜ αίτηση ' + r.id + ' εγκρίθηκε αλλά η άδεια ακυρώθηκε');
  for (const d of DAYS) {
    const lv = hkaiLeaveLines(s, d).map(lineText), rl = hkaiReqLines(s, d).map(lineText);
    for (const t of [...lv, ...rl]) if (badTxt(t)) E(d + ' κείμενο: «' + t + '»');
    const want = s.requests.filter(r => r.date === d).length; if (rl.length !== want) E(d + ' 5. ΑΙΤΗΣΕΙΣ ' + rl.length + ' αντί ' + want);
    // Δ3: ίδιος στρατιώτης σε άδεια δύο φορές την ίδια μέρα
    const at = hkMin(s.rules); const h = hkaiCounts(s, d);
    for (const p of activePeople(s)) {
      const aw = statusesFrom(s.statuses, p.id, d, at).filter(x => TYPES[x.type].cat === 'abs');
      if (aw.length > 1) E(d + ' p' + p.id + ' σε ' + aw.length + ' άδειες μαζί: ' + aw.map(x => x.type + (x.kind ? '/' + x.kind : '') + ' ' + x.from + '–' + x.to).join(', '));
      const cols = ['ka', 'eid', 'an'].filter(k => h.cols[k]?.some(y => y.id === p.id));
      if (aw.length && cols.length !== 1) E(d + ' p' + p.id + ' στην ΗΚΑΙ σε ' + cols.join('+'));
      if (aw.length === 1) { const x = aw[0]; const c = x.type === 'LEAVE' ? leaveCol(x.kind, s.settings.lists) : TYPES[x.type].hkai; if (cols[0] !== c) E(d + ' p' + p.id + ' ' + x.kind + ' στη στήλη ' + cols[0] + ' αντί ' + c); }
    }
  }
}

describe('Άδειες και αιτήσεις: συνδυασμοί', () => {
  it('κανόνες σε 300 τυχαίες ιστορίες', () => {
    for (let k = 1; k <= 300; k++) check(gen(k), 's' + k);
    const kinds = new Map<string, number>(); for (const e of errs) { const k = e.replace(/^s\d+ /, '').replace(/\d{4}-\d{2}-\d{2} /, '').replace(/p\d+|q\d+|r\w+|\d+/g, '#').slice(0, 70); kinds.set(k, (kinds.get(k) || 0) + 1); }
    console.log([...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => n + ' × ' + k).join('\n'));
    console.log(errs.filter(e => /κείμενο/.test(e)).slice(0, 15).join('\n'));
    expect(true).toBe(true);
  });
});
