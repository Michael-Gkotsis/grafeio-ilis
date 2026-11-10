// Handlers: the requests of a person (leave requests, transfers…).
//
// Purpose: The handlers of `addRequest`, `updateRequest`, `deleteRequest`, `decideRequest`. Each one is the old
//   `case` body of `run`, unchanged.
// Does NOT: declare the leave itself: it calls `run` with a `declare` command.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/requests-approve.test.ts, test/golden-outputs.test.ts, test/rules.test.ts,
//   test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { dm } from '../../lib/dates';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import type { PersonRequest } from '../../model/records';
import { leaveCmdOf, sameLeave } from '../../duty/planBatch';
import { rangeHm } from '../../statuses/hours';
import type { CommandOf, Ctx, SeatMap, Result } from '../types';
import { reqText, cleanDest } from '../requests';
import { checkTimes } from '../times';
import { range } from '../statusText';
import { run } from '../run';

/** Handler of the command handleSaveRequest. */
export function handleSaveRequest(
  s: AppState,
  c: CommandOf<'addRequest' | 'updateRequest'>,
  ctx: Ctx,
  pm: SeatMap,
): Result {
  const p = pm.get(c.req.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const lv = c.req.leave;
  const text = reqText(c.req.text || '');
  if (!text && !lv) throw new Error('Γράψε τι αιτείται');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.req.date || '')) throw new Error('Διάλεξε ημερομηνία για την αίτηση');
  if (lv && (!/^\d{4}-\d{2}-\d{2}$/.test(lv.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(lv.to || '')))
    throw new Error('Διάλεξε από πότε έως πότε είναι η άδεια');
  if (lv && lv.to < lv.from) throw new Error('Το «έως» είναι πριν από το «από»');
  const tm = lv
    ? checkTimes({
        type: lv.type === 'HON' ? 'HON' : 'LEAVE',
        from: lv.from,
        to: lv.to,
        fromTime: lv.fromTime,
        toTime: lv.toTime,
      })
    : {};
  const old = c.t === 'updateRequest' ? s.requests.find((x) => x.id === c.req.id) : undefined;
  if (c.t === 'updateRequest' && !old) throw new Error('Δεν βρέθηκε η αίτηση');
  if (old?.decision)
    throw new Error(
      'Η αίτηση έχει ήδη ' + (old.decision === 'ok' ? 'εγκριθεί' : 'απορριφθεί') + '. Αναίρεσε πρώτα την απόφαση.',
    );
  const req: PersonRequest = { id: old?.id || 'r' + ctx.newId(), pid: p.id, date: c.req.date, text };
  if (lv)
    req.leave = {
      type: lv.type === 'HON' ? 'HON' : 'LEAVE',
      ...(lv.type !== 'HON' && lv.kind ? { kind: lv.kind } : {}),
      from: lv.from,
      to: lv.to,
      ...tm,
      ...(cleanDest(lv.dest) ? { dest: cleanDest(lv.dest) } : {}),
    };
  if (old?.old) req.old = true;
  const same = (x: PersonRequest) =>
    x.pid === req.pid &&
    x.date === req.date &&
    x.text === req.text &&
    JSON.stringify(x.leave || null) === JSON.stringify(req.leave || null);
  // double click on save: the same request is not written a second time
  if (!old && s.requests.some(same)) throw new Error(shortName(p) + ' έχει ήδη αυτή την αίτηση στις ' + dm(req.date));
  const requests = old ? s.requests.map((x) => (x === old ? req : x)) : [...s.requests, req];
  const what = req.leave ? 'άδεια ' + rangeHm(req.leave, dm) + (text ? ', ' + text : '') : text;
  return {
    state: { ...s, requests },
    text: (old ? 'Άλλαξε αίτηση: ' : 'Αίτηση: ') + shortName(p) + ' – ' + what + ' (' + dm(req.date) + ')',
    files: [HK()],
  };
}
/** Handler of the command `deleteRequest`. */
export function handleDeleteRequest(s: AppState, c: CommandOf<'deleteRequest'>, _ctx: Ctx, pm: SeatMap): Result {
  const r = s.requests.find((x) => x.id === c.id);
  if (!r) throw new Error('Δεν βρέθηκε η αίτηση');
  const p = pm.get(r.pid);
  // approved leave request: the leave made from it goes too
  const st = r.sid ? s.statuses.find((x) => x.id === r.sid) : undefined;
  return {
    state: {
      ...s,
      requests: s.requests.filter((x) => x !== r),
      statuses: st ? s.statuses.filter((x) => x !== st) : s.statuses,
    },
    text:
      'Διαγράφηκε αίτηση' +
      (p ? ': ' + shortName(p) : '') +
      ' – ' +
      (r.leave ? 'άδεια ' + range(r.leave.from, r.leave.to) : r.text) +
      (st ? ', μαζί με την άδεια' : ''),
    files: st ? [HK(), 'Άδειες'] : [HK()],
  };
}
/** Handler of the command `decideRequest`. */
export function handleDecideRequest(s: AppState, c: CommandOf<'decideRequest'>, ctx: Ctx, pm: SeatMap): Result {
  // every request is approved or rejected (1/11); a leave request also becomes a leave, the other keeps only the
  // decision and its date
  const r = s.requests.find((x) => x.id === c.id);
  if (!r) throw new Error('Δεν βρέθηκε η αίτηση');
  const p = pm.get(r.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const lv = r.leave;
  const what = lv ? 'άδειας ' : '';
  const of = shortName(p) + (lv ? ' (' + range(lv.from, lv.to) + ')' : ': ' + r.text);
  if (c.ok === null) {
    const st = r.sid ? s.statuses.find((x) => x.id === r.sid) : undefined;
    const nr: PersonRequest = { ...r };
    delete nr.decision;
    delete nr.decided;
    delete nr.sid;
    return {
      state: {
        ...s,
        requests: s.requests.map((x) => (x === r ? nr : x)),
        statuses: st ? s.statuses.filter((x) => x !== st) : s.statuses,
      },
      text:
        'Αναίρεση απόφασης για την αίτηση ' +
        what +
        'του ' +
        (lv ? shortName(p) : of) +
        (st ? ': η άδεια ' + range(st.from, st.to) + ' βγήκε' : ''),
      files: st ? [HK(), 'Άδειες'] : [HK()],
    };
  }
  if (r.decision)
    throw new Error(
      'Η αίτηση έχει ήδη ' + (r.decision === 'ok' ? 'εγκριθεί' : 'απορριφθεί') + '. Αναίρεσε πρώτα την απόφαση.',
    );
  // the decision is written in the ΗΚΑΙ of the day it was pressed (not before the request itself)
  const decided = r.date > ctx.today ? r.date : ctx.today;
  const decide = (extra: Partial<PersonRequest> = {}) =>
    s.requests.map((x) =>
      x === r ? { ...r, decision: c.ok ? ('ok' as const) : ('no' as const), decided, ...extra } : x,
    );
  if (!c.ok || !lv)
    return {
      state: { ...s, requests: decide() },
      text: (c.ok ? 'Εγκρίθηκε' : 'Απορρίφθηκε') + ' η αίτηση ' + what + 'του ' + of,
      files: [HK()],
    };
  // the same leave has already been declared directly (Λ3): it is tied to the request, a second one is not made
  const same = sameLeave(s, r);
  if (same) {
    return {
      state: {
        ...s,
        statuses: s.statuses.map((x) => (x === same ? { ...x, req: r.id } : x)),
        requests: decide({ sid: same.id }),
      },
      text: 'Εγκρίθηκε η αίτηση άδειας του ' + of + ': η άδεια υπήρχε ήδη, δένεται με την αίτηση',
      files: [HK(), 'Άδειες'],
    };
  }
  // approved: same declaration as «Δήλωσε κατάσταση» (same checks, he comes out of duties and outs)
  const d = run(s, { t: 'declare', cmd: leaveCmdOf(r)! }, ctx);
  const had = new Set(s.statuses.map((x) => x.id));
  const st = d.state.statuses.find((x) => !had.has(x.id) && x.pid === p.id && x.type === lv.type && x.from === lv.from);
  if (!st) throw new Error('Δεν έγινε η άδεια');
  const statuses = d.state.statuses.map((x) => (x === st ? { ...x, req: r.id } : x));
  return {
    ...d,
    state: { ...d.state, statuses, requests: decide({ sid: st.id }) },
    text: 'Εγκρίθηκε η αίτηση άδειας του ' + of,
    files: [...new Set([HK(), ...d.files])],
  };
}
