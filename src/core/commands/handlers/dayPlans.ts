// Handlers: outs and return hours, night training and corrections of a return.
//
// Purpose: The handlers of `setNightTraining`, `setWeekRules`, `setDayPlan`, `setDayPlans`, `setBackFix`,
//   `delBackFix`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: declare the day outs themselves (declare.ts: `outs`).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/dayplan.test.ts, test/return-hours.test.ts, test/one-exit-time.test.ts,
//   test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { addDays, dayName, dm, DOW_FULL, weekday } from '../../lib/dates';
import { TYPES } from '../../model/status';
import type { BackFix, DayPlan } from '../../model/dutyRules';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import { statusesOn } from '../../duty/statuses';
import { normTime } from '../../lib/time';
import { outLbl } from '../../outs/weekend';
import { baseOf, defaultRow, weekRow, type WeekRow } from '../../outs/dayTimes';
import type { CommandOf, Ctx, Result, SeatMap } from '../types';
import { timesOf, checkOrder, planDiff } from '../dayPlan';
import { run } from '../run';

/** Handler of the command `setNightTraining`. */
export function handleSetNightTraining(s: AppState, c: CommandOf<'setNightTraining'>, ctx: Ctx): Result {
  const nightTraining = { ...(s.nightTraining || {}) };
  if (c.on === !!nightTraining[c.date]) return { state: s, text: '', files: [] };
  if (c.on) nightTraining[c.date] = true;
  else delete nightTraining[c.date];
  return {
    state: { ...s, nightTraining },
    text:
      (c.on ? 'Βραδινή εκπαίδευση ' : 'Βγήκε η βραδινή εκπαίδευση ') +
      dayName(c.date, ctx.today).toLowerCase() +
      ' ' +
      dm(c.date) +
      (c.on ? ' (δεν μετρά στη στέρηση εξόδου)' : ''),
    files: [],
  };
}
/** Handler of the command `setWeekRules`. */
export function handleSetWeekRules(s: AppState, c: CommandOf<'setWeekRules'>): Result {
  const week: Record<number, DayPlan> = {};
  const parts: string[] = [];
  for (let w = 0; w < 7; w++) {
    const cur = weekRow(s.rules, w),
      nx: WeekRow = { ...cur, ...timesOf(c.week[w] || {}, DOW_FULL[w]) };
    const def = defaultRow(w);
    checkOrder(nx, DOW_FULL[w]);
    parts.push(...planDiff(cur, nx).map((x) => DOW_FULL[w] + ' ' + x));
    const row: DayPlan = {};
    for (const k of ['out', 'backOut', 'backDn', 'train'] as const) if (nx[k] !== def[k]) (row as any)[k] = nx[k];
    if (Object.keys(row).length) week[w] = row;
  }
  if (!parts.length) return { state: s, text: '', files: [] };
  const rules = { ...s.rules };
  if (Object.keys(week).length) rules.week = week;
  else delete rules.week;
  return {
    state: { ...s, rules },
    text: 'Ώρες εξόδου και επιστροφής: ' + parts.join(' · '),
    files: ['Εξοδούχοι-Παραμένοντες'],
  };
}
/** Handler of the command `setDayPlan`. */
export function handleSetDayPlan(s: AppState, c: CommandOf<'setDayPlan'>): Result {
  const base = baseOf(s, c.date),
    old = s.dayPlan?.[c.date];
  const day = DOW_FULL[weekday(c.date)] + ' ' + dm(c.date),
    nx: WeekRow = { ...base, ...timesOf(c.plan, day) };
  checkOrder(nx, day);
  const row: DayPlan = {};
  for (const k of ['out', 'backOut', 'backDn', 'train'] as const) if (nx[k] !== base[k]) (row as any)[k] = nx[k];
  if (JSON.stringify(row) === JSON.stringify(old || {})) return { state: s, text: '', files: [] };
  const dayPlan = { ...(s.dayPlan || {}) };
  if (Object.keys(row).length) dayPlan[c.date] = row;
  else delete dayPlan[c.date];
  const what = Object.keys(row).length
    ? planDiff(base, nx)
        .map((x) => x.replace(/^(.*) (\S+) → (\S+)$/, '$1 $3 (αντί $2)'))
        .join(', ')
    : 'πίσω στην προεπιλογή';
  return { state: { ...s, dayPlan }, text: 'Ώρες εξόδου ' + day + ': ' + what, files: ['Εξοδούχοι-Παραμένοντες'] };
}
/** Handler of the command `setDayPlans`. */
export function handleSetDayPlans(s: AppState, c: CommandOf<'setDayPlans'>, ctx: Ctx): Result {
  let next = s;
  const files: string[] = [],
    texts: string[] = [];
  for (const x of c.plans) {
    const r = run(next, { t: 'setDayPlan', date: x.date, plan: x.plan }, ctx);
    next = r.state;
    if (r.text) {
      texts.push(r.text);
      files.push(...r.files);
    }
  }
  return { state: next, text: texts.join(' · '), files: [...new Set(files)] };
}
/** Handler of the command `setBackFix`. */
export function handleSetBackFix(s: AppState, c: CommandOf<'setBackFix'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const o = statusesOn(s.statuses, c.pid, c.day).find((x) => TYPES[x.type].cat === 'out');
  if (!o) throw new Error(shortName(p) + ' δεν είναι εξοδούχος ή ΔΝ ' + dm(c.day));
  const why = String(c.why ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!why) throw new Error('Γράψε τον λόγο της διόρθωσης');
  if (!!c.stay === !!c.at) throw new Error('Διάλεξε «δεν γυρνά, συνεχίζει» ή πότε γυρνά');
  let at: BackFix['at'];
  if (c.at) {
    const time = normTime(c.at.time);
    if (!time) throw new Error('Η ώρα επιστροφής δεν είναι σωστή');
    if (c.at.day < (o.type === 'DN' ? addDays(c.day, 1) : c.day))
      throw new Error('Η επιστροφή είναι πριν από την έξοδο');
    at = { day: c.at.day, time };
  }
  const fix: BackFix = {
    id: c.pid + ':' + c.day,
    pid: c.pid,
    day: c.day,
    ...(at ? { at } : { stay: true as const }),
    why,
  };
  const fixes = s.backFix || [];
  const old = fixes.find((x) => x.id === fix.id);
  if (old && JSON.stringify(old) === JSON.stringify(fix)) return { state: s, text: '', files: [] };
  return {
    state: { ...s, backFix: [...fixes.filter((x) => x.id !== fix.id), fix] },
    text:
      'Διόρθωση επιστροφής ' +
      shortName(p) +
      ' (' +
      outLbl(o) +
      ' ' +
      dm(c.day) +
      '): ' +
      (at ? 'γυρνά ' + DOW_FULL[weekday(at.day)] + ' ' + dm(at.day) + ' ' + at.time : 'δεν γυρνά, συνεχίζει') +
      ' · λόγος: ' +
      why,
    files: ['Εξοδούχοι-Παραμένοντες'],
  };
}
/** Handler of the command `delBackFix`. */
export function handleDelBackFix(s: AppState, c: CommandOf<'delBackFix'>, _ctx: Ctx, pm: SeatMap): Result {
  const fixes = s.backFix || [];
  const old = fixes.find((x) => x.id === c.id);
  if (!old) return { state: s, text: '', files: [] };
  const p = pm.get(old.pid);
  return {
    state: { ...s, backFix: fixes.filter((x) => x.id !== c.id) },
    text: 'Διόρθωση επιστροφής' + (p ? ' ' + shortName(p) : '') + ' ' + dm(old.day) + ': πίσω στο αυτόματο',
    files: ['Εξοδούχοι-Παραμένοντες'],
  };
}
