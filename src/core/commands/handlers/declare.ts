// Handlers: declare statuses (medical, leave, penalties…), many at once, the day outs, and fixing a status.
//
// Purpose: The handlers of `declare`, `declareMany`, `outs`, `replaceStatus`. Each one is the old `case` body of
//   `run`, unchanged.
// Does NOT: edit or end an existing status (statusEdits.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/declare-many.test.ts, test/multi-med.test.ts, test/outs-combos.test.ts,
//   test/status-fix.test.ts, test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { addDays, daysBetween, dm } from '../../lib/dates';
import { norm } from '../../lib/text';
import { TYPES, RECORD_CATS, PUN_KINDS, type Status } from '../../model/status';
import { kolColOf } from '../../model/kol';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import { outBlock } from '../../duty/dutyCheck';
import { planStatusChange, sameMed, splitOut, outCutTo, planTo, canOpen } from '../../duty/planChange';
import { statusesOn } from '../../duty/statuses';
import { noNotes, isAway, statusLbl } from '../../people/kinds';
import { isDeprivation, punLbl } from '../../statuses/punish';
import { isSat, isWk, WK } from '../../outs/weekend';
import { returnOf } from '../../outs/returns';
import type { CommandOf, Ctx, SeatMap, Result } from '../types';
import { checkTimes } from '../times';
import { range, leaveFile } from '../statusText';
import { cleanDest } from '../requests';
import { setGuard } from '../guards';
import { who } from '../who';
import { run } from '../run';

/** Handler of the command `declare`. */
export function handleDeclare(s: AppState, c: CommandOf<'declare'>, ctx: Ctx, pm: SeatMap): Result {
  const { cmd } = c;
  const plan = planStatusChange(s, cmd, ctx.today);
  if (!cmd.pids.length) throw new Error('Δεν διάλεξες άτομο');
  if (cmd.open && !canOpen(cmd.type)) throw new Error('«Χωρίς λήξη» δηλώνονται μόνο ιατρικά, ΣΤΕΠ και νοσοκομείο');
  const kol = cmd.type === 'KOL';
  const kNote = kol ? (cmd.note || '').trim() : '';
  if (kol && !kNote)
    throw new Error('Γράψε τι υπηρεσία είναι (π.χ. Υπηρεσία ΣΤΕΠ): φαίνεται στη Δύναμη και στο Σήμερα');
  // without an end: the «έως» is today (or the «από») and moves forward by itself every day (extendOpen)
  const open = !!cmd.open;
  const to = open ? (cmd.from > ctx.today ? cmd.from : ctx.today) : cmd.to;
  if (!open && cmd.to < cmd.from) throw new Error('Το «έως» είναι πριν από το «από»');
  const tm = checkTimes({ ...cmd, open });
  if (plan.blocked.length && !cmd.force) {
    const b = plan.blocked[0];
    throw new Error(shortName(pm.get(b.pid)!) + ' δεν βγαίνει έξοδο ' + dm(b.date) + ': ' + b.reason);
  }
  // the same declaration a second time (e.g. double click): not written twice
  const twin = s.statuses.find(
    (x) =>
      cmd.pids.includes(x.pid) &&
      x.type === cmd.type &&
      x.from === cmd.from &&
      (open ? !!x.open : !x.open && x.to === cmd.to) &&
      (TYPES[x.type].cat !== 'med' || sameMed(x, cmd, s.settings.lists)) &&
      (!kol ||
        ((x.note || '') === kNote &&
          (x.fromTime || '') === (tm.fromTime || '') &&
          (x.toTime || '') === (tm.toTime || ''))),
  );
  const when = open ? 'από ' + dm(cmd.from) + ' χωρίς λήξη' : range(cmd.from, cmd.to);
  if (twin)
    throw new Error(
      shortName(pm.get(twin.pid)!) +
        ' έχει ήδη ' +
        (cmd.type === 'PUN' ? 'την ίδια ποινή' : statusLbl(cmd, s.settings.lists)) +
        ' ' +
        when,
    );
  const drop = new Set(plan.cancels.map((x) => x.id));
  let next: AppState = {
    ...s,
    statuses: [
      ...s.statuses.filter((x) => !drop.has(x.id)),
      ...plan.cancels.flatMap((x) => splitOut(x, cmd.from, outCutTo(s, planTo(cmd)), ctx.newId)),
      ...cmd.pids.map((pid) => {
        const st: Status = { id: ctx.newId(), pid, type: cmd.type, from: cmd.from, to };
        if (open) st.open = true;
        if (cmd.note) st.note = kol ? kNote : cmd.note;
        if (cmd.kind) st.kind = cmd.kind;
        if (kol) {
          if (cmd.minus) {
            st.minus = true;
            st.hkCol = kolColOf(cmd);
          }
          if (cmd.noOut) st.noOut = true;
        }
        Object.assign(st, tm);
        const dest = cleanDest(cmd.dest);
        if (dest && TYPES[cmd.type].cat === 'abs') st.dest = dest;
        if (cmd.type === 'PUN') {
          st.kind = cmd.kind || PUN_KINDS[0];
          if (cmd.by?.trim()) st.by = cmd.by.trim();
          if (cmd.reason?.trim()) st.reason = cmd.reason.trim();
          if (cmd.on) st.on = cmd.on;
        }
        // the days of the penalty; the «έως» moves in apply
        if (isDeprivation(st)) st.days = daysBetween(cmd.from, cmd.to);
        return st;
      }),
    ],
  };
  plan.conflicts.forEach((x) => {
    next = setGuard(next, x.date, x.k, null);
  });
  const verb =
    cmd.type === 'PUN'
      ? 'Ποινή (' + punLbl(cmd.kind || PUN_KINDS[0]) + ')'
      : 'Δηλώθηκε ' + statusLbl(cmd, s.settings.lists);
  return { state: next, text: verb + ' ' + when + ': ' + who(s, cmd.pids), files: plan.files.map((f) => f.fn) };
}
/** Handler of the command `declareMany`. */
export function handleDeclareMany(s: AppState, c: CommandOf<'declareMany'>, ctx: Ctx): Result {
  if (!c.cmds.length) throw new Error('Δεν διάλεξες κατάσταση');
  let next = s;
  const files: string[] = [],
    texts: string[] = [];
  for (const cmd of c.cmds) {
    const r = run(next, { t: 'declare', cmd }, ctx);
    next = r.state;
    files.push(...r.files);
    texts.push(r.text);
  }
  const c0 = c.cmds[0];
  const text =
    c.cmds.length === 1
      ? texts[0]
      : 'Δηλώθηκαν ' +
        c.cmds.map((x) => statusLbl(x, s.settings.lists)).join(' + ') +
        ' ' +
        (c0.open ? 'από ' + dm(c0.from) + ' χωρίς λήξη' : range(c0.from, c0.to)) +
        ': ' +
        who(s, c0.pids);
  return { state: next, text, files: [...new Set(files)] };
}
/** Handler of the command `outs`. */
export function handleOuts(s: AppState, c: CommandOf<'outs'>, ctx: Ctx, pm: SeatMap): Result {
  // Κ-Ε1…Κ-Ε3: the same check here, not only on the screen. Nothing is fully forbidden (Michael, 17/10): with force the
  // user saw the warning and confirmed it
  if (!c.force)
    for (const x of c.changes)
      if (x.to) {
        const r = outBlock(s, c.date, x.pid);
        if (r) throw new Error(shortName(pm.get(x.pid)!) + ' δεν βγαίνει έξοδο: ' + r);
      }
  const pids = new Set(c.changes.map((x) => x.pid));
  // outing/ΔΝ of many days: only this day changes, the others stay
  const hit = (x: Status) => pids.has(x.pid) && TYPES[x.type].cat === 'out' && x.from <= c.date && c.date <= x.to;
  let statuses = [
    ...s.statuses.filter((x) => !hit(x)),
    ...s.statuses.filter(hit).flatMap((x) => splitOut(x, c.date, c.date, ctx.newId)),
  ];
  const wk = isSat(c.date) ? c.changes.filter((x) => x.wk && x.to === 'DN') : [];
  const added: Status[] = c.changes
    .filter((x) => x.to)
    .map((x) => ({
      id: ctx.newId(),
      pid: x.pid,
      type: x.to!,
      from: c.date,
      to: c.date,
      ...(wk.includes(x) ? { kind: WK } : {}),
    }));
  // ΔΝ ΣΚ (Michael, 18/10, 24/10): on Sunday ΔΝ is added by itself that day too, unless he already has an exit/ΔΝ, is
  // absent, or something keeps him in (duty, penalty…): then the Saturday ΔΝ stays and he returns Sunday morning. If
  // his leave starts on Sunday, he does not return: he leaves for the leave. Whoever is no longer ΔΝ ΣΚ on Saturday
  // also loses the Sunday ΔΝ that was added by itself.
  const sun = addDays(c.date, 1);
  const kept: string[] = [];
  const leaving: string[] = [];
  if (isSat(c.date)) {
    const wkIds = new Set(wk.map((x) => x.pid));
    statuses = statuses.filter(
      (x) => !(pids.has(x.pid) && !wkIds.has(x.pid) && isWk(x) && x.from === sun && x.to === sun),
    );
    for (const x of wk) {
      const onSun = statusesOn(noNotes(statuses, s.settings.lists), x.pid, sun);
      if (onSun.some((y) => TYPES[y.type].cat === 'out')) continue;
      if (onSun.some((y) => TYPES[y.type].cat === 'abs' && y.from >= c.date)) {
        leaving.push(shortName(pm.get(x.pid)!));
        continue;
      }
      if (onSun.some((y) => isAway(y, s.settings.lists)) || outBlock(s, sun, x.pid)) {
        kept.push(shortName(pm.get(x.pid)!));
        continue;
      }
      added.push({ id: ctx.newId(), pid: x.pid, type: 'DN', from: sun, to: sun, kind: WK });
    }
  }
  let outNotes = s.outNotes;
  if (c.notes?.length) {
    const day = { ...(s.outNotes?.[c.date] || {}) };
    for (const n of c.notes) {
      const v = norm(n.note).trim();
      if (v) day[n.pid] = v;
      else delete day[n.pid];
    }
    outNotes = { ...(s.outNotes || {}) };
    if (Object.keys(day).length) outNotes[c.date] = day;
    else delete outNotes[c.date];
  }
  // ΔΝ whose return we do not know (the next day is not declared, without training): we say so in the History and on
  // the screen
  const next = { ...s, statuses: [...statuses, ...added], outNotes };
  const pend = new Map<string, string[]>();
  for (const x of c.changes) {
    const r = x.to === 'DN' ? returnOf(next, x.pid, c.date) : null;
    if (r?.pending) pend.set(r.why, [...(pend.get(r.why) || []), shortName(pm.get(x.pid)!)]);
  }
  const parts = [
    c.changes.length && c.changes.length + ' αλλαγές',
    wk.length && 'ΔΝ ΣΚ ' + wk.length,
    kept.length && 'γυρίζουν Κυριακή πρωί: ' + kept.join(', '),
    leaving.length && 'άδεια από Κυριακή: ' + leaving.join(', '),
    ...[...pend].map(([why, who]) => why + ': ' + who.join(', ')),
    c.notes?.length && c.notes.length + ' παρατηρήσεις',
  ].filter(Boolean);
  return {
    state: next,
    text: 'Εξοδούχοι ' + dm(c.date) + ': ' + parts.join(' · '),
    files: ['Εξοδούχοι-Παραμένοντες', HK()],
  };
}
/** Handler of the command `replaceStatus`. */
export function handleReplaceStatus(s: AppState, c: CommandOf<'replaceStatus'>, ctx: Ctx): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
  const leave = TYPES[st.type].cat === 'abs';
  if (!RECORD_CATS.includes(TYPES[st.type].cat) && st.type !== 'KOL' && !leave)
    throw new Error('Διορθώνονται εδώ μόνο ιατρικά, ποινές και άδειες');
  if (!c.cmds.length) throw new Error('Δεν διάλεξες κατάσταση');
  const base: AppState = { ...s, statuses: s.statuses.filter((x) => x !== st) };
  const r = run(base, c.cmds.length > 1 ? { t: 'declareMany', cmds: c.cmds } : { t: 'declare', cmd: c.cmds[0] }, ctx);
  const was =
    (st.type === 'PUN' ? 'ποινή (' + punLbl(st.kind || PUN_KINDS[0]) + ')' : statusLbl(st, s.settings.lists)) +
    ' ' +
    (st.open ? 'από ' + dm(st.from) + ' χωρίς λήξη' : range(st.from, st.to));
  // leave from a request (Λ9): the link with the request stays, on the new leave
  let state = r.state;
  if (leave && st.req) {
    const had = new Set(base.statuses.map((x) => x.id));
    const ns = state.statuses.find((x) => !had.has(x.id) && TYPES[x.type].cat === 'abs');
    if (ns)
      state = {
        ...state,
        statuses: state.statuses.map((x) => (x === ns ? { ...x, req: st.req } : x)),
        requests: state.requests.map((q) => (q.id === st.req ? { ...q, sid: ns.id } : q)),
      };
  }
  return {
    state,
    text: 'Διόρθωση: ' + r.text + ' (ήταν ' + was + ')',
    files: [...new Set([st.type === 'PUN' ? 'Ποινές' : leaveFile(st), ...r.files, ...(leave ? [HK()] : [])])],
  };
}
