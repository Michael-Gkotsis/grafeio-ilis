// Handlers: end, delete, cancel or approve a status, leave end, penalty info, leave times.
//
// Purpose: The handlers of `endStatus`, `deleteStatus`, `cancelLeave`, `endLeave`, `approvePun`, `setPunInfo`,
//   `setTimes`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: declare new statuses (declare.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/leave-end.test.ts, test/open-ended.test.ts, test/deprivation.test.ts,
//   test/leave-hours.test.ts, test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { addDays, dm } from '../../lib/dates';
import { TYPES, type Status } from '../../model/status';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import { planStatusChange } from '../../duty/planChange';
import { leavePhrase, statusLbl } from '../../people/kinds';
import { hasTimes, mins, timeNames, timesTxt } from '../../statuses/hours';
import { normTime } from '../../lib/time';
import { punLbl } from '../../statuses/punish';
import type { CommandOf, Ctx, SeatMap, Result } from '../types';
import { range, leaveFile } from '../statusText';
import { checkTimes } from '../times';
import { cleanDest } from '../requests';
import { setGuard } from '../guards';

/** Handler of the command `endStatus`. */
export function handleEndStatus(s: AppState, c: CommandOf<'endStatus'>, ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
  const y = addDays(ctx.today, -1);
  const statuses =
    st.from > y
      ? s.statuses.filter((x) => x !== st)
      : s.statuses.map((x) => {
          if (x !== st) return x;
          const n = { ...x, to: y };
          delete n.open;
          delete n.days;
          return n;
        });
  return {
    state: { ...s, statuses },
    text:
      'Τέλος από σήμερα: ' +
      (st.type === 'PUN' ? 'ποινή' : statusLbl(st, s.settings.lists)) +
      ' του ' +
      shortName(pm.get(st.pid)!),
    files: [st.type === 'PUN' ? 'Ποινές' : st.type === 'KOL' ? HK() : 'Ιατρικά'],
  };
}
/** Handler of the command `deleteStatus`. */
export function handleDeleteStatus(s: AppState, c: CommandOf<'deleteStatus'>, _ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
  return {
    state: { ...s, statuses: s.statuses.filter((x) => x !== st) },
    text:
      'Διαγράφηκε (μπήκε λάθος): ' +
      (st.type === 'PUN' ? 'ποινή' : statusLbl(st, s.settings.lists)) +
      ' ' +
      (st.open ? 'από ' + dm(st.from) + ' χωρίς λήξη' : range(st.from, st.to)) +
      ' του ' +
      shortName(pm.get(st.pid)!),
    files: [st.type === 'PUN' ? 'Ποινές' : leaveFile(st), HK()],
  };
}
/** Handler of the command `cancelLeave`. */
export function handleCancelLeave(s: AppState, c: CommandOf<'cancelLeave'>, _ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η άδεια');
  // from an approved request: the request stays approved, without leave (it is no longer written in the ΗΚΑΙ as a
  // leave)
  const requests = s.requests.map((r) => {
    if (r.sid !== st.id) return r;
    const n = { ...r };
    delete n.sid;
    return n;
  });
  return {
    state: { ...s, statuses: s.statuses.filter((x) => x !== st), requests },
    text:
      (TYPES[st.type].cat === 'abs' ? 'Ακυρώθηκε η ' : 'Διαγράφηκε η ') +
      (st.type === 'LEAVE' ? leavePhrase(st) : TYPES[st.type].long).toLowerCase() +
      ' ' +
      range(st.from, st.to) +
      ' του ' +
      shortName(pm.get(st.pid)!),
    files: [leaveFile(st), HK()],
  };
}
/** Handler of the command `endLeave`. */
export function handleEndLeave(s: AppState, c: CommandOf<'endLeave'>, _ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η άδεια');
  const abs = TYPES[st.type].cat === 'abs',
    tn = timeNames(st.type);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) throw new Error('Λάθος ημερομηνία');
  const t = normTime(c.time);
  if (t == null) throw new Error('Η ώρα ' + tn.toG + ' «' + c.time + '» δεν διαβάζεται. Γράψε π.χ. 22:00.');
  const was = st.open ? 'χωρίς λήξη' : 'έως ' + dm(st.to) + (st.toTime ? ' ' + st.toTime : '');
  if (c.date < st.from || (c.date === st.from && st.fromTime && t && mins(t) <= mins(st.fromTime)))
    throw new Error(
      (abs ? 'Η άδεια' : 'Η ' + TYPES[st.type].long.toLowerCase()) +
        ' ξεκινά ' +
        dm(st.from) +
        (st.fromTime ? ' ' + st.fromTime : '') +
        (abs ? '. Αν δεν έφυγε καθόλου, πάτα «Ακύρωση άδειας».' : '. Αν μπήκε λάθος, πάτα «Διαγραφή».'),
    );
  // same or later return: it is not an end (to extend, change the leave)
  if (!st.open && (c.date > st.to || (c.date === st.to && (!t || (!!st.toTime && mins(t) >= mins(st.toTime))))))
    throw new Error(
      (abs ? 'Η άδεια' : 'Η ' + TYPES[st.type].long.toLowerCase()) +
        ' είναι ήδη ' +
        was +
        '. Διάλεξε νωρίτερη ' +
        tn.to +
        '.',
    );
  const n: Status = { ...st, to: c.date };
  delete n.open;
  delete n.days;
  if (t) n.toTime = t;
  else delete n.toTime;
  return {
    state: { ...s, statuses: s.statuses.map((x) => (x === st ? n : x)) },
    text:
      'Διακοπή: ' +
      (st.type === 'LEAVE' ? leavePhrase(st) : TYPES[st.type].long).toLowerCase() +
      ' του ' +
      shortName(pm.get(st.pid)!) +
      ', ' +
      tn.to +
      ' ' +
      dm(c.date) +
      (t ? ' ' + t : '') +
      ' (ήταν ' +
      was +
      ')',
    files: [leaveFile(st), HK()],
  };
}
/** Handler of the command `approvePun`. */
export function handleApprovePun(s: AppState, c: CommandOf<'approvePun'>, _ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st) throw new Error('Δεν βρέθηκε η ποινή');
  return {
    state: { ...s, statuses: s.statuses.map((x) => (x === st ? { ...x, pending: false } : x)) },
    text: 'Εγκρίθηκε από τον Διοικητή η ποινή (' + punLbl(st.kind) + ') του ' + shortName(pm.get(st.pid)!),
    files: [HK(), 'Ποινές'],
  };
}
/** Handler of the command `setPunInfo`. */
export function handleSetPunInfo(s: AppState, c: CommandOf<'setPunInfo'>, _ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st || st.type !== 'PUN') throw new Error('Δεν βρέθηκε η ποινή');
  const next: Status = {
    ...st,
    on: c.on || undefined,
    by: c.by.trim() || undefined,
    reason: c.reason.trim() || undefined,
  };
  (['on', 'by', 'reason'] as const).forEach((k) => {
    if (next[k] === undefined) delete next[k];
  });
  return {
    state: { ...s, statuses: s.statuses.map((x) => (x === st ? next : x)) },
    text:
      'Στοιχεία ποινής: ' +
      shortName(pm.get(st.pid)!) +
      (next.by ? ', από ' + next.by : '') +
      (next.reason ? ', διότι ' + next.reason : ''),
    files: [],
  };
}
/** Handler of the command `setTimes`. */
export function handleSetTimes(s: AppState, c: CommandOf<'setTimes'>, ctx: Ctx, pm: SeatMap): Result {
  const st = s.statuses.find((x) => x.id === c.id);
  if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η καταχώρηση');
  const tm = checkTimes({ ...st, fromTime: c.fromTime, toTime: c.toTime });
  const next: Status = { ...st, ...tm };
  if (!tm.fromTime) delete next.fromTime;
  if (!tm.toTime) delete next.toTime;
  if (c.dest !== undefined && TYPES[st.type].cat === 'abs') {
    const d = cleanDest(c.dest);
    if (d) next.dest = d;
    else delete next.dest;
  }
  // services that are no longer done with the new hours: the post stays empty, as in the declaration
  const plan = planStatusChange(
    { ...s, statuses: s.statuses.filter((x) => x !== st) },
    { type: st.type, pids: [st.pid], from: st.from, to: st.to, ...tm },
    ctx.today,
  );
  let out: AppState = { ...s, statuses: s.statuses.map((x) => (x === st ? next : x)) };
  plan.conflicts.forEach((x) => {
    out = setGuard(out, x.date, x.k, null);
  });
  const t = timesTxt(next),
    lv = TYPES[st.type].cat === 'abs';
  const dt =
    lv && (next.dest || '') !== (st.dest || '') ? (next.dest ? ', κατεύθυνση ' + next.dest : ', χωρίς κατεύθυνση') : '';
  return {
    state: out,
    text:
      'Ώρες ' +
      (lv ? 'άδειας' : TYPES[st.type].label) +
      ' ' +
      range(st.from, st.to) +
      ' του ' +
      shortName(pm.get(st.pid)!) +
      ': ' +
      (t || 'χωρίς ώρες') +
      dt,
    files: [leaveFile(st), ...plan.files.filter((f) => f.fn.startsWith('Υπηρεσίες')).map((f) => f.fn)],
  };
}
