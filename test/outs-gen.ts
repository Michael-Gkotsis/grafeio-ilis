// Τυχαίες αλλά επαναλήψιμες δύο εβδομάδες για τα τεστ των Εξοδούχων (outs-combos, outs-day, outs-snapshot, outs-all): μία φορά όπως τα αφήνει η οθόνη, μία «παρά τους κανόνες»
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { outBlock, statusesOn } from '../src/shared/rules';
import { addDays, type ISODate } from '../src/shared/dates';
import { TYPES, type AppState, type Status, type TypeKey } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-20', newId: () => 'k' + ++seq };
export const run = (s: AppState, c: Command) => { try { return apply(s, c, ctx).state; } catch { return s; } };
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
export const DAYS: ISODate[] = []; for (let d = '2026-10-21'; d <= '2026-11-04'; d = addDays(d, 1)) DAYS.push(d);
const POSTS = ['ly', 'dy', 'th1', 'th3', 'th8', 'mg1', 'op2', 'sk3a', 'tae'];
const TIMES = ['06:00', '10:00', '14:00', '16:00', '18:00', '22:00'];

// realistic: όπως στην οθόνη χωρίς επιβεβαίωση (όποιος έχει υπηρεσία, ποινή, άδεια… δεν παίρνει έξοδο)
export function genState(seed: number, realistic: boolean, n = 14): AppState {
  const r = rng(seed); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  let s = fakeState(n); const ss: Status[] = [];
  for (const p of s.people) for (let i = Math.floor(r() * 3); i > 0; i--) {
    const type = pick<TypeKey>(['LEAVE', 'LEAVE', 'HON', 'SICK', 'NOS', 'STEP', 'PUN', 'PUN', 'EY', 'EA', 'KOL', 'KOL']);
    const from = pick(DAYS.slice(0, 12)), len = Math.floor(r() * 4);
    const x: Status = { id: 'g' + ++seq, pid: p.id, type, from, to: addDays(from, len) };
    if (type === 'LEAVE') x.kind = pick(['Κανονική', 'Ειδική', 'ΑΜΔ']);
    if (type === 'PUN') { x.kind = pick(['Περιορισμός', 'Κράτηση', 'Στέρηση εξόδου']); if (r() < 0.15) x.pending = true; if (x.kind === 'Στέρηση εξόδου') x.days = len + 1; }
    if (type === 'KOL') { x.kind = 'ΣΤΕΠ'; x.noOut = r() < 0.5; x.minus = r() < 0.5; }
    if (TYPES[type].cat === 'abs' || type === 'NOS' || type === 'STEP') { if (r() < 0.4) x.fromTime = pick(TIMES); if (r() < 0.5) x.toTime = pick(TIMES); if (r() < 0.07) x.open = true; }
    ss.push(x);
  }
  s = { ...s, statuses: ss };
  for (const d of DAYS) for (const k of POSTS) if (r() < 0.45) s = run(s, { t: 'assign', date: d, k, pid: 1 + Math.floor(r() * n), force: 'x' });
  for (const d of DAYS) if (r() < 0.12) s = run(s, { t: 'setDayPlan', date: d, plan: pick([{ train: false }, { train: true }, { backOut: '23:30' }, { out: '14:00' }, { backDn: '07:00' }]) });
  for (const d of DAYS) {
    const changes: { pid: number; from: null; to: TypeKey; wk?: boolean }[] = [], notes: { pid: number; note: string }[] = [];
    for (const p of s.people) {
      if (statusesOn(s.statuses, p.id, d).some(x => TYPES[x.type].cat === 'out')) continue;   // π.χ. η Κυριακή της ΔΝ ΣΚ
      if (realistic && outBlock(s, d, p.id)) continue;
      const v = r(); if (v >= 0.55) continue;
      const to: TypeKey = v < 0.3 ? 'OUT' : 'DN';
      changes.push({ pid: p.id, from: null, to, ...(to === 'DN' && new Date(d).getDay() === 6 && r() < 0.6 ? { wk: true } : {}) });
      if (r() < 0.1) notes.push({ pid: p.id, note: 'ΙΑΤΡΟΣ ΣΤΕΠ' });
    }
    if (changes.length) s = run(s, { t: 'outs', date: d, changes, notes, force: true });
  }
  for (const x of s.statuses.filter(y => TYPES[y.type].cat === 'out')) if (r() < 0.05)
    s = run(s, r() < 0.5 ? { t: 'setBackFix', pid: x.pid, day: x.from, stay: true, why: 'ΕΙΠΕ Ο ΛΟΧΑΓΟΣ' } : { t: 'setBackFix', pid: x.pid, day: x.from, at: { day: addDays(x.from, 2), time: '12:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
  return s;
}
