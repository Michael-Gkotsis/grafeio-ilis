// Plans for several declarations at once, and for a leave request approval.
//
// Purpose: `planStatusChanges`, `leaveCmdOf`, `sameLeave`, `approvalPlan`, `planNeedsOk`.
// Does NOT: plan one change (planChange.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Same lines are shown once and «+N γραμμές» of the same file are added up.
// Covering tests: test/declare-many.test.ts, test/open-declare.test.ts.
import type { ISODate } from '../lib/dates';
import { conflictFiles, type PlanFile, planStatusChange, type StatusCmd, type StatusPlan } from './planChange';
import type { PersonRequest } from '../model/records';
import type { AppState } from '../model/state';
import type { Status } from '../model/status';
import { leaveNameKey } from '../people/kinds';

/**
 * Several medical declarations together (declareMany): one plan for all. The same lines once; the «+N γραμμές» of the
 * same file add up.
 */
export function planStatusChanges(s: AppState, cmds: StatusCmd[], today?: ISODate): StatusPlan {
  const ps = cmds.map((c) => planStatusChange(s, c, today));
  if (ps.length === 1) return ps[0];
  const uniq = <T>(xs: T[], key: (x: T) => string) => {
    const seen = new Set<string>();
    return xs.filter((x) => !seen.has(key(x)) && !!seen.add(key(x)));
  };
  const ROWS = /^\+(\d+) γραμμ(?:ή|ές)/;
  const at = (x: { pid: number; date: ISODate; k: string }) => x.pid + '|' + x.date + '|' + x.k;
  const conflicts = uniq(
      ps.flatMap((p) => p.conflicts),
      at,
    ),
    out = new Set(ps.flatMap((p) => conflictFiles(s, p.conflicts)).map((f) => f.fn + '|' + f.desc));
  const files: PlanFile[] = [];
  for (const f of ps.flatMap((p) => p.files)) {
    if (out.has(f.fn + '|' + f.desc)) continue; // the «βγαίνει από» lines are made again from all of them together

    const m = ROWS.exec(f.desc),
      rest = f.desc.replace(ROWS, '');
    const i = m ? files.findIndex((x) => x.fn === f.fn && ROWS.test(x.desc) && x.desc.replace(ROWS, '') === rest) : -1;
    if (i >= 0) {
      const k = Number(ROWS.exec(files[i].desc)![1]) + Number(m![1]);
      files[i] = { ...files[i], desc: '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή') + rest };
    } else if (!files.some((x) => x.fn === f.fn && x.desc === f.desc)) files.push(f);
  }
  files.push(...conflictFiles(s, conflicts));
  return {
    files,
    overlaps: ps.flatMap((p) => p.overlaps),
    blocked: uniq(
      ps.flatMap((p) => p.blocked),
      (x) => x.pid + '|' + x.date,
    ),
    conflicts,
    past: uniq(
      ps.flatMap((p) => p.past),
      at,
    ),
    cancels: uniq(
      ps.flatMap((p) => p.cancels),
      (x) => x.id,
    ),
    alongside: uniq(
      ps.flatMap((p) => p.alongside),
      (x) => x.pid + '|' + x.status.id,
    ),
  };
}

/** Leave request to the declaration that is made with «Εγκρίθηκε». */
export const leaveCmdOf = (r: PersonRequest): StatusCmd | null =>
  r.leave
    ? {
        type: r.leave.type,
        pids: [r.pid],
        from: r.leave.from,
        to: r.leave.to,
        ...(r.leave.kind ? { kind: r.leave.kind } : {}),
        ...(r.leave.fromTime ? { fromTime: r.leave.fromTime } : {}),
        ...(r.leave.toTime ? { toTime: r.leave.toTime } : {}),
        ...(r.leave.dest ? { dest: r.leave.dest } : {}),
      }
    : null;

/**
 * The same leave already exists, declared directly (Λ3: same person, type, kind, from, to): «Εγκρίθηκε» ties it to the
 * request instead of declaring a second one.
 */
export function sameLeave(s: Pick<AppState, 'statuses'>, r: PersonRequest): Status | undefined {
  const lv = r.leave;
  if (!lv) return undefined;
  return s.statuses.find(
    (x) =>
      !x.req &&
      x.pid === r.pid &&
      x.type === lv.type &&
      x.from === lv.from &&
      x.to === lv.to &&
      !x.open &&
      (lv.type !== 'LEAVE' || leaveNameKey(x.kind) === leaveNameKey(lv.kind)),
  );
}

/**
 * The check before «Εγκρίθηκε» (Λ1, Λ2): the same messages as the Declaration (overlaps with another leave, duties that
 * empty, days in the past). null = a request without a leave, or the leave already exists (nothing changes).
 */
export function approvalPlan(s: AppState, r: PersonRequest, today?: ISODate): StatusPlan | null {
  const cmd = leaveCmdOf(r);
  if (!cmd || sameLeave(s, r)) return null;
  return planStatusChange(s, cmd, today);
}

/** True when the plan needs the user's confirmation (overlaps, conflicts or past duties). */
export const planNeedsOk = (p: StatusPlan) => p.overlaps.length > 0 || p.conflicts.length > 0 || p.past.length > 0;
