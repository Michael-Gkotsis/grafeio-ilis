// Handlers: put people on duty posts, swap, auto-fill, clear a day, remove a duty log.
//
// Purpose: The handlers of `assign`, `swapPosts`, `autofillRange`, `autofill`, `clearDay`, `removeDutyLog`. Each one
//   is the old `case` body of `run`, unchanged.
// Does NOT: set the duty rules of a person (dutyRules.ts) or import duties from Excel (imports.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/duty-fuzz.test.ts, test/fill-repair.test.ts, test/rotation.test.ts,
//   test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { dayName, dm } from '../../lib/dates';
import { shortName } from '../../model/person';
import { KIND_NAME } from '../../model/duty';
import { postTxt } from '../../model/blocks';
import type { AppState } from '../../model/state';
import { nextCadrePid, seatMap } from '../../duty/indexes';
import { capBlock } from '../../duty/whoDoes';
import { dutyBlock, lastResort, statusWarn } from '../../duty/leaveHours';
import { swapCheck } from '../../duty/nextFor';
import { fillDay } from '../../duty/autofill';
import { postBy, postOf } from '../../duty/posts';
import { ruleBlock } from '../../duty/dutyCheck';
import type { CommandOf, Result, Ctx, SeatMap } from '../types';
import { setGuard } from '../guards';
import { range } from '../statusText';

/** Handler of the command `assign`. */
export function handleAssign(s: AppState, c: CommandOf<'assign'>): Result {
  const post = postBy(s, c.k);
  if (!post) throw new Error('Άγνωστη θέση');
  // Nothing is fully forbidden (Michael, 17/10): status (ΕΥ, leave…), rest, weekend, capability and «already in another
  // post» pass with a justification. move: his other post is emptied (move), otherwise he stays in both.
  let note = '';
  let base = s;
  // cadre member entering a post for the first time: he gets his permanent post number here (negative, never given
  // again)
  let pid = c.pid;
  if (pid && c.cid) {
    const cd = s.cadreList.find((x) => x.id === c.cid);
    if (!cd) throw new Error('Δεν βρέθηκε το στέλεχος');
    if (cd.pid != null) pid = cd.pid;
    else {
      const np = nextCadrePid(s.cadreList);
      pid = np;
      base = { ...s, cadreList: s.cadreList.map((x) => (x === cd ? { ...cd, pid: np } : x)) };
    }
  }
  const pm = seatMap(base);
  if (pid) {
    if (!pm.get(pid)?.active) throw new Error('Το άτομο είναι εκτός δύναμης');
    const other = postOf(s, c.date, pid, c.k);
    if (c.move && other && other.k === c.move) {
      base = setGuard(base, c.date, c.move, null);
      note = ' (από ' + postTxt(other) + ')';
    }
    const twice = !c.move && other ? 'ήδη ' + postTxt(other) : null;
    const soft =
      dutyBlock(s.statuses, c.date, pid, post, s.settings.lists) ||
      twice ||
      capBlock(base, c.date, pid, post) ||
      ruleBlock(base, c.date, pid, undefined, c.k);
    if (soft && !c.force) throw new Error(shortName(pm.get(pid)!) + ' δεν μπαίνει: ' + soft);
    if (soft) note += ' (παρά τον κανόνα: ' + soft + '. Αιτία: ' + c.force + ')';
    const lr = lastResort(s.statuses, c.date, pid, post, s.settings.lists) || statusWarn(s, c.date, pid);
    if (lr) note += ' (' + lr + ')';
  }
  let next = setGuard(base, c.date, c.k, pid || null);
  // he had a duty of the same kind without a post the same day (from Excel): now he has a post
  const sl = pid ? (s.dutyLog[c.date] || []).filter((e) => !(e.pid === pid && e.kind === post.kind)) : null;
  if (sl && sl.length !== (s.dutyLog[c.date] || []).length) {
    const dutyLog = { ...s.dutyLog, [c.date]: sl };
    if (!sl.length) delete dutyLog[c.date];
    next = { ...next, dutyLog };
  }
  return {
    state: next,
    text:
      'Υπηρεσίες ' +
      dm(c.date) +
      ': ' +
      (pid ? shortName(pm.get(pid)!) + ' σε ' : 'κενή η θέση ') +
      postTxt(post) +
      note,
    files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'],
  };
}
/** Handler of the command `swapPosts`. */
export function handleSwapPosts(s: AppState, c: CommandOf<'swapPosts'>, _ctx: Ctx, pm: SeatMap): Result {
  const A = postBy(s, c.a),
    B = postBy(s, c.b);
  const g = s.guards[c.date] || {};
  const chk = swapCheck(s, c.date, c.a, c.b);
  if (chk.hard) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.hard);
  if (chk.soft && !c.force) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.soft);
  const pa = g[c.a],
    pb = g[c.b];
  const guards = { ...s.guards, [c.date]: { ...g, [c.a]: pb, [c.b]: pa } };
  return {
    state: { ...s, guards },
    text:
      'Υπηρεσίες ' +
      dm(c.date) +
      ': ανταλλαγή ' +
      shortName(pm.get(pa)!) +
      ' (' +
      postTxt(A!) +
      ') ↔ ' +
      shortName(pm.get(pb)!) +
      ' (' +
      postTxt(B!) +
      ')' +
      (chk.soft ? ' (παρά τον κανόνα: ' + chk.soft + '. Αιτία: ' + c.force + ')' : ''),
    files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'],
  };
}
/** Handler of the command `autofillRange`. */
export function handleAutofillRange(s: AppState, c: CommandOf<'autofillRange'>, ctx: Ctx): Result {
  // ΠΣΚ: one day after the other, so that the rules (rest, numbers, weekend) hold between them too
  let st = s;
  const parts: string[] = [];
  let empty = 0;
  const warn: string[] = [];
  for (const d of c.dates) {
    const r = fillDay(st, d);
    st = { ...st, guards: r.guards };
    parts.push(dayName(d, ctx.today).toLowerCase() + ' ' + r.n);
    empty += r.empty.length;
    warn.push(...r.warn);
  }
  return {
    state: st,
    text:
      'Υπηρεσίες ΠΣΚ ' +
      range(c.dates[0], c.dates[c.dates.length - 1]) +
      ': αυτόματη συμπλήρωση (' +
      parts.join(', ') +
      ')' +
      (empty ? ', ' + empty + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') +
      (warn.length ? '. Χωρίς άλλη επιλογή: ' + warn.join('· ') : ''),
    files: c.dates.map((d) => 'Υπηρεσίες ' + dm(d)).concat('Έλεγχος υπηρεσιών'),
  };
}
/** Handler of the command `autofill`. */
export function handleAutofill(s: AppState, c: CommandOf<'autofill'>): Result {
  const r = fillDay(s, c.date);
  return {
    state: { ...s, guards: r.guards },
    text:
      'Υπηρεσίες ' +
      dm(c.date) +
      ': αυτόματη συμπλήρωση ' +
      r.n +
      ' θέσεων' +
      (r.empty.length ? ', ' + r.empty.length + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') +
      (r.warn.length ? '. Χωρίς άλλη επιλογή: ' + r.warn.join('· ') : ''),
    files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'],
  };
}
/** Handler of the command `clearDay`. */
export function handleClearDay(s: AppState, c: CommandOf<'clearDay'>): Result {
  const guards = { ...s.guards };
  delete guards[c.date];
  return {
    state: { ...s, guards },
    text: 'Υπηρεσίες ' + dm(c.date) + ': καθαρίστηκαν όλες οι θέσεις',
    files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'],
  };
}
/** Handler of the command `removeDutyLog`. */
export function handleRemoveDutyLog(s: AppState, c: CommandOf<'removeDutyLog'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  const list = s.dutyLog[c.date] || [];
  const i = list.findIndex((e) => e.pid === c.pid && e.kind === c.kind);
  if (i < 0) return { state: s, text: '', files: [] };
  const dutyLog = { ...s.dutyLog, [c.date]: list.filter((_, j) => j !== i) };
  if (!dutyLog[c.date].length) delete dutyLog[c.date];
  return {
    state: { ...s, dutyLog },
    text:
      'Υπηρεσίες ' +
      dm(c.date) +
      ': βγήκε ' +
      (p ? shortName(p) : 'άτομο') +
      ' (' +
      KIND_NAME[c.kind].toLowerCase() +
      ' χωρίς θέση, από Excel)',
    files: ['Έλεγχος υπηρεσιών'],
  };
}
